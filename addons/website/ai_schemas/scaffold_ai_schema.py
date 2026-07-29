#!/usr/bin/env python3
# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Draft-generator for AI snippet schema files (dev tooling, run manually).

Usage:  python scaffold_ai_schema.py s_my_snippet [s_other ...]

Parses the snippet template(s) and emits a DRAFT ai_schemas/<key>.json to
stdout: detected text slots, buttons, images and repeat candidates, plus the
standard core options. The output is a starting point — every path, hint,
min/max and option MUST be hand-reviewed before shipping (the draft covers
the statically-derivable part only; taste and curation are the point of the
hand-authored files).
"""
import copy
import glob
import json
import os
import re
import sys

from lxml import etree

VIEWS_DIR = os.path.join(os.path.dirname(__file__), '..', 'views', 'snippets')

DEFAULT_OPTIONS = {
    "core": {
        "color_combination": {"vocab": "color_combination"},
        "padding_top": {"vocab": "section_padding", "prefix": "pt"},
        "padding_bottom": {"vocab": "section_padding", "prefix": "pb"},
    },
    "extended": {
        "text_align": {"vocab": "text_align"},
    },
}


def load_templates():
    templates = {}
    for path in glob.glob(os.path.join(VIEWS_DIR, '*.xml')):
        try:
            root = etree.parse(path).getroot()
        except etree.XMLSyntaxError:
            continue
        for template in root.iter('template'):
            if template.get('id'):
                templates[template.get('id').split('.')[-1]] = template
    return templates


def pseudo_render(el, templates, depth=0):
    """Rough approximation of the rendered markup (t-set/t-call/t-att)."""
    if depth > 30:
        return
    for child in list(el):
        if not isinstance(child.tag, str):
            el.remove(child)
            continue
        pseudo_render(child, templates, depth + 1)
        if child.tag == 't':
            index = el.index(child)
            if 't-set' in child.attrib and 't-call' not in child.attrib:
                el.remove(child)
            elif 't-call' in child.attrib:
                el.remove(child)
                called = templates.get(child.get('t-call').split('.')[-1])
                if called is not None:
                    clone = copy.deepcopy(called)
                    pseudo_render(clone, templates, depth + 1)
                    for sub in reversed(list(clone)):
                        el.insert(index, sub)
            else:
                for sub in reversed(list(child)):
                    el.insert(index, sub)
                el.remove(child)
    if el.tag == 't':
        return
    if 't-attf-class' in el.attrib:
        literal = re.sub(r'#\{[^}]*\}|\{\{[^}]*\}\}', ' ', el.get('t-attf-class'))
        el.set('class', ' '.join((el.get('class', '') + ' ' + literal).split()))
        del el.attrib['t-attf-class']
    for attr in list(el.attrib):
        if attr.startswith('t-'):
            del el.attrib[attr]


def classes(el):
    return (el.get('class') or '').split()


def best_path(section, el):
    """Shortest tag/.class path unique within the section, else None."""
    candidates = [el.tag]
    candidates += [f'{el.tag}.{cls}' for cls in classes(el) if not re.match(r'^(col-|row$|container)', cls)]
    for candidate in candidates:
        if len(section.xpath(_to_xpath(candidate))) == 1:
            return candidate
    # one parent level
    parent = el.getparent()
    if parent is not None and parent is not section:
        for parent_cls in classes(parent)[:2]:
            for candidate in candidates:
                path = f'.{parent_cls} {candidate}'
                if len(section.xpath(_to_xpath(path))) == 1:
                    return path
    return None


def _to_xpath(css):
    steps = []
    for step in css.split(' '):
        tag, *step_classes = step.split('.')
        conditions = ''.join(
            f'[contains(concat(" ", normalize-space(@class), " "), " {cls} ")]'
            for cls in step_classes
        )
        steps.append((tag or '*') + conditions)
    return './/' + '//'.join(steps)


def scaffold(key, templates):
    template = templates.get(key)
    if template is None:
        print(f"// {key}: template not found", file=sys.stderr)
        return None
    clone = copy.deepcopy(template)
    pseudo_render(clone, templates)
    section = clone.find('.//section')
    if section is None:
        print(f"// {key}: no <section> root", file=sys.stderr)
        return None

    draft = {"snippet": key, "content": {}, "repeats": {}, "images": {},
             "options": copy.deepcopy(DEFAULT_OPTIONS)}

    # Repeat candidates: >= 2 sibling elements with the same tag+class bag.
    repeat_parents = {}
    for el in section.iter():
        if not isinstance(el.tag, str):
            continue
        signature_groups = {}
        for child in el:
            if isinstance(child.tag, str) and child.tag != 't':
                signature = (child.tag, ' '.join(sorted(classes(child))))
                signature_groups.setdefault(signature, []).append(child)
        for (tag, _sig), group in signature_groups.items():
            if len(group) >= 2 and len(list(group[0].iter())) > 2:
                repeat_parents[el] = group
                break

    used = set()
    counter = {}
    if repeat_parents:
        parent, group = max(repeat_parents.items(), key=lambda item: len(item[1]))
        parent_cls = next((cls for cls in classes(parent)), None)
        repeat_path = f'.{parent_cls} > {group[0].tag}' if parent_cls else f'TODO > {group[0].tag}'
        draft["repeats"]["items"] = {
            "path": repeat_path,
            "min": 2,
            "max": len(group),
            "slots": {},
            "images": {},
            "__review": "TODO: verify the unit is a plain sibling clone; fix path/min/max/slots",
        }
        for el in group:
            used.update(el.iter())

    slot_names = {'h1': 'title', 'h2': 'title', 'h3': 'subtitle', 'p': 'text'}
    for el in section.iter():
        if el in used or not isinstance(el.tag, str):
            continue
        text = ' '.join(el.itertext()).strip()
        if el.tag in ('h1', 'h2', 'h3', 'h4') or (el.tag == 'p' and text):
            path = best_path(section, el)
            if not path:
                continue
            base = slot_names.get(el.tag, 'text')
            counter[base] = counter.get(base, 0) + 1
            name = base if counter[base] == 1 else f'{base}_{counter[base]}'
            draft["content"][name] = {
                "kind": "text", "path": path,
                "hint": f"TODO ({text[:40]}...)" if text else "TODO",
            }
        elif el.tag == 'a' and any(cls.startswith('btn') for cls in classes(el)):
            path = best_path(section, el)
            if path:
                counter['button'] = counter.get('button', 0) + 1
                name = 'button' if counter['button'] == 1 else f'button_{counter["button"]}'
                draft["content"][name] = {"kind": "button", "path": path, "optional": True, "hint": "TODO"}
        elif el.tag == 'img':
            path = best_path(section, el)
            if path:
                counter['image'] = counter.get('image', 0) + 1
                name = 'image' if counter['image'] == 1 else f'image_{counter["image"]}'
                draft["images"][name] = {"kind": "img", "path": path, "hint": "TODO"}
        elif 'oe_img_bg' in classes(el) or 's_parallax_bg' in classes(el) \
                or 'background-image' in (el.get('style') or ''):
            path = best_path(section, el)
            if path:
                draft["images"]["background"] = {"kind": "bg", "path": path, "hint": "TODO"}

    return draft


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    templates = load_templates()
    for key in sys.argv[1:]:
        draft = scaffold(key, templates)
        if draft:
            print(f"// draft for ai_schemas/{key}.json — hand-review before shipping")
            print(json.dumps(draft, indent=4, ensure_ascii=False))


if __name__ == '__main__':
    main()
