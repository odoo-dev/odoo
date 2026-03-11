#!/usr/bin/env python3
"""
Codemod: Add 'this.' prefix to component property accesses in OWL templates.

In the next version of OWL, accessing a property without 'this.' will only
look into the rendering context (ctx). Currently, resolution is ctx || component.
This codemod reads templatesInfos.json and modifies XML and JS template files
to prefix component property accesses with 'this.'.

Usage:
    python add_this_prefix.py [--dry-run] [--base-dir /path/to/odoo]
"""

import argparse
import html
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from lxml import etree


# ---------------------------------------------------------------------------
# Node.js tokenizer interface
# ---------------------------------------------------------------------------

def call_node_tokenizer(expressions):
    """Call the Node.js tokenizer to find root identifiers in expressions.

    Takes a list of expression strings, deduplicates them, and returns a dict
    mapping each expression to its list of root identifiers:
        {expr: [{name, start, end}, ...]}
    """
    unique = list(set(expressions))
    if not unique:
        return {}

    script_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(script_dir, 'find_root_identifiers.mjs')
    input_data = json.dumps([{"expr": e} for e in unique])

    result = subprocess.run(
        ["node", script_path],
        input=input_data,
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Node.js tokenizer failed: {result.stderr}")

    output = json.loads(result.stdout)
    return {item["expr"]: item["rootIdentifiers"] for item in output}


# ---------------------------------------------------------------------------
# File path resolution
# ---------------------------------------------------------------------------

def resolve_filepath(filename, addons_dirs):
    """Resolve a template filename from templatesInfos.json to an actual file path.

    Filename formats:
      - "/web/static/src/..." -> <addon_dir>/web/static/src/...  (XML files)
      - "@web/core/..." -> <addon_dir>/web/static/src/core/...js  (JS modules)
      - "@web/../lib/..." -> <addon_dir>/web/static/lib/...js      (JS relative)
      - "xml-@web/core/...:N" -> same as "@web/core/..."           (xml source IDs)
      - "" -> None (anonymous templates, cannot resolve)

    Searches each directory in addons_dirs until the file is found.
    """
    if not filename:
        return None
    # Normalize xml source IDs: "xml-@web/core/component:1" -> "@web/core/component"
    if filename.startswith('xml-@'):
        filename = filename[4:]  # strip "xml-"
        filename = re.sub(r':\d+(#\d+)?$', '', filename)  # strip ":N" or ":N#M" suffix
    if filename.startswith('/'):
        relative = filename.lstrip('/')
        for addons_dir in addons_dirs:
            path = os.path.join(addons_dir, relative)
            if os.path.exists(path):
                return path
        # Fall back to first addons dir (for error reporting)
        return os.path.join(addons_dirs[0], relative)
    if filename.startswith('@'):
        module = filename[1:]  # Remove @
        parts = module.split('/', 1)
        addon = parts[0]
        rest = parts[1] if len(parts) > 1 else ''
        for addons_dir in addons_dirs:
            if rest.startswith('../'):
                base_path = os.path.join(addons_dir, addon, 'static', rest[3:])
            else:
                base_path = os.path.join(addons_dir, addon, 'static', 'src', rest)
            for ext in ['.js', '.ts']:
                if os.path.exists(base_path + ext):
                    return base_path + ext
            if os.path.exists(base_path + '.js'):
                return base_path + '.js'
        # Fall back to first addons dir
        if rest.startswith('../'):
            return os.path.join(addons_dirs[0], addon, 'static', rest[3:]) + '.js'
        return os.path.join(addons_dirs[0], addon, 'static', 'src', rest) + '.js'
    return None


# ---------------------------------------------------------------------------
# XPath helpers
# ---------------------------------------------------------------------------

# Token types for XPath tokenizer
_XPATH_TOKEN_RE = re.compile(r"""
    (?P<STRING>'[^']*'|"[^"]*")          # quoted string literal
  | (?P<AT>@)                             # attribute axis shorthand
  | (?P<LBRACKET>\[)                      # predicate open
  | (?P<RBRACKET>\])                      # predicate close
  | (?P<LPAREN>\()                        # function call open
  | (?P<RPAREN>\))                        # function call close
  | (?P<EQ>=)                             # equality
  | (?P<COMMA>,)                          # argument separator
  | (?P<NAME>[A-Za-z_][\w.-]*)            # NCName (node/attr/function name)
  | (?P<SLASH>//?|\.\.?)                  # axis step
  | (?P<WS>\s+)                           # whitespace (skipped)
  | (?P<OTHER>.)                          # anything else
""", re.VERBOSE)


def extract_xpath_attr_predicates(xpath_str):
    """Extract attribute predicates from an XPath expression.

    Returns a list of dicts:
      - type='eq':       @attr_name='value' predicates
        {type, attr_name, value, value_start, value_end, quote_char}
      - type='contains': contains(@attr_name, 'value') predicates
        {type, attr_name, value}

    Position tracking (value_start/value_end) counts from the start of
    xpath_str and covers the literal *including* quotes — so a surgical
    replacement can do: xpath_str[:value_start+1] + new + xpath_str[value_end-1:]
    (i.e., keep the quote characters).
    """
    # Tokenize
    tokens = []
    for m in _XPATH_TOKEN_RE.finditer(xpath_str):
        kind = m.lastgroup
        if kind == 'WS':
            continue
        tokens.append((kind, m.group(), m.start(), m.end()))

    results = []
    i = 0
    n = len(tokens)

    while i < n:
        kind, val, start, end = tokens[i]

        # Pattern 1: @attr_name = 'value'
        if kind == 'AT' and i + 3 < n:
            _, name_val, _, _ = tokens[i + 1]
            k2, eq_val, _, _ = tokens[i + 2]
            k3, str_val, str_start, str_end = tokens[i + 3]
            if tokens[i + 1][0] == 'NAME' and k2 == 'EQ' and k3 == 'STRING':
                quote_char = str_val[0]
                inner_value = str_val[1:-1]
                results.append({
                    'type': 'eq',
                    'attr_name': name_val,
                    'value': inner_value,
                    'value_start': str_start,
                    'value_end': str_end,
                    'quote_char': quote_char,
                })
                i += 4
                continue

        # Pattern 2: contains ( @attr_name , 'value' )
        if kind == 'NAME' and val == 'contains' and i + 6 < n:
            if (tokens[i + 1][0] == 'LPAREN'
                    and tokens[i + 2][0] == 'AT'
                    and tokens[i + 3][0] == 'NAME'
                    and tokens[i + 4][0] == 'COMMA'
                    and tokens[i + 5][0] == 'STRING'
                    and tokens[i + 6][0] == 'RPAREN'):
                attr_name = tokens[i + 3][1]
                str_val = tokens[i + 5][1]
                inner_value = str_val[1:-1]
                results.append({
                    'type': 'contains',
                    'attr_name': attr_name,
                    'value': inner_value,
                })
                i += 7
                continue

        i += 1

    return results


# ---------------------------------------------------------------------------
# Inheritance index
# ---------------------------------------------------------------------------

def build_inheritance_index(addons_dirs):
    """Scan all XML files to map parent template -> inheriting templates with XPaths.

    Returns:
        dict[parent_name, list[{
            'filepath': str,
            'child_template_name': str,
            'inherit_mode': str,  # 'extension' or 'primary'
            'xpath_exprs': list[{'expr': str, 'sourceline': int}]
        }]]
    """
    index = defaultdict(list)
    for addons_dir in addons_dirs:
        if not os.path.isdir(addons_dir):
            continue
        for dirpath, _dirnames, filenames in os.walk(addons_dir):
            for fname in filenames:
                if not fname.endswith('.xml'):
                    continue
                filepath = os.path.join(dirpath, fname)
                try:
                    parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False)
                    tree = etree.parse(filepath, parser)
                except Exception:
                    continue
                root = tree.getroot()
                for el in root.iter():
                    t_inherit = el.get('t-inherit')
                    if not t_inherit:
                        continue
                    child_name = el.get('t-name', '')
                    inherit_mode = el.get('t-inherit-mode', 'primary')
                    xpath_exprs = []
                    for xpath_el in el.findall('xpath'):
                        expr = xpath_el.get('expr')
                        if expr:
                            xpath_exprs.append({
                                'expr': expr,
                                'sourceline': xpath_el.sourceline,
                            })
                    index[t_inherit].append({
                        'filepath': filepath,
                        'child_template_name': child_name,
                        'inherit_mode': inherit_mode,
                        'xpath_exprs': xpath_exprs,
                    })
    return dict(index)


# ---------------------------------------------------------------------------
# Expression analysis using tokenizer
# ---------------------------------------------------------------------------

def property_appears_in_expression(prop, expression, tokenizer_results=None):
    """Check if a property appears as a root identifier in the expression,
    and is not already prefixed with 'this.'.

    Uses the OWL tokenizer (via Node.js) for accurate identification.
    """
    if tokenizer_results is None:
        tokenizer_results = call_node_tokenizer([expression])

    root_ids = tokenizer_results.get(expression, [])
    for ident in root_ids:
        if ident['name'] == prop:
            start = ident['start']
            if start >= 5 and expression[start - 5:start] == 'this.':
                continue
            return True
    return False


def prefix_properties_in_expression(expression, properties, tokenizer_results=None):
    """Add 'this.' prefix to all specified properties in the expression.

    Uses the OWL tokenizer (via Node.js) for accurate root identifier detection.
    Processes replacements right-to-left to maintain correct positions.
    """
    if tokenizer_results is None:
        tokenizer_results = call_node_tokenizer([expression])

    root_ids = tokenizer_results.get(expression, [])
    replacements = []
    for ident in root_ids:
        name = ident['name']
        if name not in properties:
            continue
        if name == 'this':
            continue
        start = ident['start']
        # Skip if already prefixed with 'this.'
        if start >= 5 and expression[start - 5:start] == 'this.':
            continue
        replacements.append(start)

    # Sort right-to-left to maintain positions during replacement
    result = expression
    for start in sorted(replacements, reverse=True):
        result = result[:start] + 'this.' + result[start:]
    return result


# ---------------------------------------------------------------------------
# OWL expression attribute classification
# ---------------------------------------------------------------------------

# Attributes whose values are evaluated as JS expressions by OWL's compiler.
# Derived from OWL's isExpressionAttribute (owl.js line ~4178).
_EXPRESSION_DIRECTIVES = frozenset({
    't-if', 't-elif', 't-esc', 't-out', 't-raw',
    't-foreach', 't-key', 't-memo', 't-value',
    't-att', 't-model', 't-tag', 't-log', 't-portal',
    't-component', 't-props', 't-call-context', 't-call-block',
})

# Regex for {{expr}} and #{expr} interpolation blocks in t-attf-* values.
_INTERP_RE = re.compile(r'\{\{(.*?)\}\}|#\{(.*?)\}')


def is_expression_attribute(attr_name, tag_name):
    """Determine if an XML attribute holds a JS expression in OWL templates.

    Returns True for attributes whose full value (or parts for t-attf-*)
    is evaluated as a JavaScript expression by OWL's template compiler.

    String-only attributes (t-name, t-set, t-as, t-ref, t-call, t-slot,
    t-inherit, t-set-slot, t-slot-scope, t-custom-*, etc.) return False.
    """
    if attr_name in _EXPRESSION_DIRECTIVES:
        return True
    # Prefix-based expression directives
    if attr_name.startswith('t-att-') or attr_name.startswith('t-on-'):
        return True
    # t-attf-* is a format string with {{expr}} interpolation.
    # Handled specially by the caller (only expressions inside {{}} are modified).
    if attr_name.startswith('t-attf-'):
        return 'attf'
    # Non-t-* attributes on component elements (uppercase tag or has '.')
    # are props and therefore expressions.
    if not attr_name.startswith('t-'):
        if tag_name and len(tag_name) > 0 and (tag_name[0].isupper() or '.' in tag_name):
            return True
        return False
    # Everything else: t-name, t-set, t-as, t-ref, t-call, t-slot,
    # t-inherit, t-inherit-mode, t-set-slot, t-slot-scope, t-custom-*,
    # t-translation, t-source-*, etc. — NOT expressions.
    return False


# ---------------------------------------------------------------------------
# File processing
# ---------------------------------------------------------------------------

def get_ctx_variables_lxml(root):
    """Extract all context variable names from template lxml root.
    """
    ctx_vars = set()
    for el in root.iter():
        # t-as (loop)
        t_as = el.get('t-as')
        if t_as:
            ctx_vars.add(t_as)
            for suffix in ['_index', '_first', '_last', '_value', '_count', '_parity']:
                ctx_vars.add(f"{t_as}{suffix}")
        # t-set
        t_set = el.get('t-set')
        if t_set:
            ctx_vars.add(t_set)
        # t-slot-scope
        t_slot_scope = el.get('t-slot-scope')
        if t_slot_scope:
            ctx_vars.add(t_slot_scope)
    return ctx_vars


def xml_escape_odoo(s, quote_char):
    """Escape string for XML attribute, keeping '>' unescaped.
    Also escapes the quote character being used as delimiter.
    """
    s = s.replace('&', '&amp;').replace('<', '&lt;')
    if quote_char == '"':
        return s.replace('"', '&quot;')
    elif quote_char == "'":
        return s.replace("'", '&apos;')
    return s


def _process_attf_value(attr_value, changes, component_props, ctx_vars, tokenizer_results):
    """Process a t-attf-* format string, prefixing expressions inside {{}} and #{}.

    Args:
        attr_value: The full t-attf-* attribute value.
        changes: List of change dicts (used for legacy exact-match).
        component_props: Set of all known component property names for this template.
        ctx_vars: Set of context variable names to exclude.
        tokenizer_results: Pre-computed tokenizer results.

    Returns the new attribute value if any expression was modified, or None.
    """
    matches = list(_INTERP_RE.finditer(attr_value))
    if not matches:
        return None

    # Collect edits as (start, end, new_text) — positions within attr_value
    edits = []
    for m in matches:
        # group(1) is content inside {{ }}, group(2) inside #{ }
        raw = m.group(1) if m.group(1) is not None else m.group(2)
        expr = raw.strip()
        if not expr:
            continue

        # Tokenize the interpolation expression if not already done
        if expr not in tokenizer_results:
            extra = call_node_tokenizer([expr])
            tokenizer_results.update(extra)

        # Check all known component properties for this template
        props_to_prefix = set()
        for prop in component_props:
            if prop in ctx_vars:
                continue
            if property_appears_in_expression(prop, expr, tokenizer_results):
                props_to_prefix.add(prop)

        if not props_to_prefix:
            continue

        new_expr = prefix_properties_in_expression(expr, props_to_prefix, tokenizer_results)
        if new_expr == expr:
            continue

        # Replace just the expression, preserving surrounding whitespace
        # inside the interpolation block.
        group_idx = 1 if m.group(1) is not None else 2
        group_start = m.start(group_idx)
        # Find the trimmed expression within the raw (whitespace-preserved) group
        expr_offset = raw.find(expr)
        abs_start = group_start + expr_offset
        abs_end = abs_start + len(expr)
        edits.append((abs_start, abs_end, new_expr))

    if not edits:
        return None

    # Apply edits right-to-left
    result = attr_value
    for start, end, new_text in sorted(edits, key=lambda e: e[0], reverse=True):
        result = result[:start] + new_text + result[end:]
    return result


def modify_xml_content(content, changes, tokenizer_results):
    """Modify XML content by matching attributes and expressions.
    Uses lxml to find attributes but applies changes surgically to the text
    to preserve formatting, closing tags, and existing escaping.
    """
    header = ""
    body = content
    if content.strip().startswith('<?xml'):
        match = re.match(r'^(\s*<\?xml.*?\?>)(.*)$', content, re.DOTALL)
        if match:
            header = match.group(1)
            body = match.group(2)

    try:
        parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False)
        # Handle cases where content is not a full XML document (e.g. JS fragment)
        wrapped = f"<template_root>{body}</template_root>"
        root = etree.fromstring(wrapped.encode('utf-8'), parser=parser)
    except Exception as e:
        return content, False, [f"  ERROR: XML parse failed: {e}"], []

    # Identify changes using lxml
    template_roots = root.xpath("//*[@t-name or @t-inherit]")
    if not template_roots:
        template_roots = [root]

    # Collect all unique (line_idx, attr_name, old_val) to change
    targets = []
    file_tpl_names = set(c['templateName'] for c in changes)

    # Offset for sourceline if header was removed
    line_offset = header.count('\n')

    # Collect all component properties per template name for broad matching.
    # The report may list a property against one expression, but that property
    # can appear in other expressions (e.g. t-attf-* interpolations) too.
    component_props_by_tpl = defaultdict(set)
    for change in changes:
        if change.get('source') == 'component':
            component_props_by_tpl[change['templateName']].add(change['property'])

    for t_root in template_roots:
        t_name = t_root.get('t-name') or t_root.get('t-inherit')
        if not t_name and len(file_tpl_names) == 1:
            t_name = list(file_tpl_names)[0]

        ctx_vars = get_ctx_variables_lxml(t_root)
        # All component properties known for this template
        tpl_component_props = component_props_by_tpl.get(t_name, set())

        for el in t_root.iter():
            if el.tag == 'template_root':
                continue
            if el.sourceline is None:
                continue
            for attr_name, attr_value in el.attrib.items():
                expr_type = is_expression_attribute(attr_name, el.tag)
                if not expr_type:
                    continue

                if expr_type == 'attf':
                    # t-attf-*: only modify expressions inside {{}} and #{}
                    new_value = _process_attf_value(
                        attr_value, changes, tpl_component_props,
                        ctx_vars, tokenizer_results,
                    )
                    if new_value and new_value != attr_value:
                        targets.append({
                            'line_idx': el.sourceline - 1 + line_offset,
                            'tag': el.tag,
                            'attr': attr_name,
                            'old': attr_value,
                            'new': new_value,
                            't_name': t_name,
                        })
                    continue

                # Regular expression attribute
                props_to_prefix = set()
                for change in changes:
                    if change['expression'] == attr_value:
                        prop = change['property']
                        if prop in ctx_vars:
                            continue
                        if property_appears_in_expression(prop, attr_value, tokenizer_results):
                            props_to_prefix.add(prop)

                if props_to_prefix:
                    new_value = prefix_properties_in_expression(attr_value, props_to_prefix, tokenizer_results)
                    if new_value != attr_value:
                        targets.append({
                            'line_idx': el.sourceline - 1 + line_offset,
                            'tag': el.tag,
                            'attr': attr_name,
                            'old': attr_value,
                            'new': new_value,
                            't_name': t_name,
                        })

    if not targets:
        return content, False, [], []

    # Apply changes surgically
    lines = content.splitlines(keepends=True)
    replacements = [] # list of (line_idx, start_col, end_col, new_val)

    # Sort targets by line index
    targets.sort(key=lambda x: x['line_idx'])

    for target in targets:
        line_idx = target['line_idx']
        attr_name = target['attr']
        old_val = target['old']

        # Search for the attribute in the source text
        # Since lxml's sourceline can be the end of the start tag,
        # we search in a range around it.
        found = False
        search_range = range(max(0, line_idx - 20), min(len(lines), line_idx + 20))

        for i in search_range:
            line_text = lines[i]
            # Pattern for attribute: name="value" or name='value'
            # Look for whitespace or tag start before the attribute name
            pattern = fr'(?P<pre>[\s<])(?P<attr>{re.escape(attr_name)})\s*=\s*(?P<q>["\'])(?P<val>.*?)(?P=q)'

            for match in re.finditer(pattern, line_text, re.DOTALL):
                val_in_source = match.group('val')
                if html.unescape(val_in_source) == old_val:
                    # Found it!
                    quote = match.group('q')
                    start_val, end_val = match.span('val')

                    # Check if this range is already used
                    already_used = any(r[0] == i and r[1] == start_val for r in replacements)
                    if not already_used:
                        escaped_new = xml_escape_odoo(target['new'], quote)
                        replacements.append((i, start_val, end_val, escaped_new, target))
                        found = True
                        break
            if found:
                break

            if found:
                break

        if not found:
            # Maybe the attribute spans multiple lines?
            # Join lines and try again
            combined = "".join(lines[line_idx:line_idx + 10])
            pattern = fr'\b{re.escape(attr_name)}\s*=\s*(?P<q>["\'])(?P<val>.*?)(?P=q)'
            match = re.search(pattern, combined, re.DOTALL)
            if match and html.unescape(match.group('val')) == old_val:
                # Handle multiline replacement? For now just log it.
                pass

    if not replacements:
        return content, False, [], []

    # Apply replacements in reverse order (bottom to top, right to left)
    # Sort by line_idx desc, then start_col desc
    replacements.sort(key=lambda x: (x[0], x[1]), reverse=True)

    modified = False
    messages = []
    attr_changes = []
    for line_idx, start, end, new_val, target in replacements:
        lines[line_idx] = lines[line_idx][:start] + new_val + lines[line_idx][end:]
        modified = True
        messages.append(f"  Updated {target['t_name'] or 'template'}: {target['attr']}")
        messages.append(f"    - {target['old']}")
        messages.append(f"    + {target['new']}")
        if target['t_name']:
            attr_changes.append({
                'template_name': target['t_name'],
                'attr_name': target['attr'],
                'old_value': target['old'],
                'new_value': target['new'],
            })

    return "".join(lines), modified, messages, attr_changes




def process_changes(filepath, changes, is_xml, dry_run=False, tokenizer_results=None):
    """Process all changes for a single file.

    Returns (modified: bool, messages: list[str], attr_changes: list[dict])
    """
    messages = [f"Processing: {filepath}"]
    with open(filepath, 'r') as f:
        content = f.read()

    # Collect all unique expressions and call tokenizer if not provided
    if tokenizer_results is None:
        all_exprs = list({c['expression'] for c in changes})
        tokenizer_results = call_node_tokenizer(all_exprs)

    modified = False
    all_attr_changes = []
    if is_xml:
        new_content, modified, mod_messages, attr_changes = modify_xml_content(content, changes, tokenizer_results)
        messages.extend(mod_messages)
        all_attr_changes.extend(attr_changes)
    else:
        # JS/TS file: find xml`...` blocks
        def replacer(match):
            tpl_content = match.group(1)
            # Apply changes matching expressions in this block
            new_tpl_content, mod, mod_messages, attr_changes = modify_xml_content(tpl_content, changes, tokenizer_results)
            if mod:
                nonlocal modified
                modified = True
                messages.extend(mod_messages)
                all_attr_changes.extend(attr_changes)
                return f"xml`{new_tpl_content}`"
            return match.group(0)

        # Replace each xml`...` block
        new_content = re.sub(r'xml\s*`([\s\S]*?)`', replacer, content)

    if modified and not dry_run:
        with open(filepath, 'w') as f:
            f.write(new_content)

    return modified, messages, all_attr_changes


def _process_file_task(filepath, entries, is_xml, dry_run, tokenizer_results):
    """Worker function for file processing.

    Returns (filepath, modified, change_count, messages, attr_changes).
    """
    messages = [f"Processing: {filepath}"]
    modified, file_messages, attr_changes = process_changes(
        filepath, entries, is_xml, dry_run, tokenizer_results
    )
    messages.extend(file_messages)
    change_count = sum(1 for m in file_messages if m.startswith('    + '))
    return filepath, modified, change_count, messages, attr_changes


def update_inheriting_xpaths(inheritance_index, all_attr_changes, dry_run):
    """Update XPath expressions in inheriting templates after base templates are modified.

    For each attribute change (template_name, attr, old, new):
      1. Look up inheriting templates from the inheritance index
      2. Parse their XPath `expr` attributes with extract_xpath_attr_predicates
      3. Replace matching predicate values surgically in source files

    Returns (files_modified: int, changes_count: int, messages: list[str])
    """
    # Deduplicate attr_changes by (template_name, attr_name, old_value, new_value)
    seen = set()
    unique_changes = []
    for change in all_attr_changes:
        key = (change['template_name'], change['attr_name'],
               change['old_value'], change['new_value'])
        if key not in seen:
            seen.add(key)
            unique_changes.append(change)

    # Collect edits per file: {filepath: [(sourceline, old_expr, new_expr)]}
    file_edits = defaultdict(list)
    messages = []

    for change in unique_changes:
        tpl_name = change['template_name']
        attr_name = change['attr_name']
        old_value = change['old_value']
        new_value = change['new_value']

        inheritors = inheritance_index.get(tpl_name, [])
        for inheritor in inheritors:
            filepath = inheritor['filepath']
            for xpath_info in inheritor['xpath_exprs']:
                expr = xpath_info['expr']
                sourceline = xpath_info['sourceline']

                predicates = extract_xpath_attr_predicates(expr)
                for pred in predicates:
                    if pred['type'] == 'contains':
                        if pred['attr_name'] == attr_name and pred['value'] == old_value:
                            messages.append(
                                f"  WARNING: contains() predicate in {filepath} "
                                f"(line {sourceline}) may need manual update: {expr}"
                            )
                        continue

                    if pred['type'] != 'eq':
                        continue
                    if pred['attr_name'] != attr_name:
                        continue
                    if pred['value'] != old_value:
                        continue

                    # Build the new XPath expression by replacing the value
                    q = pred['quote_char']
                    vs = pred['value_start']
                    ve = pred['value_end']
                    # value_start/value_end cover the full string token including quotes
                    new_expr = expr[:vs + 1] + new_value + expr[ve - 1:]

                    file_edits[filepath].append((sourceline, expr, new_expr))
                    messages.append(
                        f"  XPath update in {filepath} "
                        f"(inherits {tpl_name}, line ~{sourceline}):"
                    )
                    messages.append(f"    - expr=\"{expr}\"")
                    messages.append(f"    + expr=\"{new_expr}\"")

    files_modified = 0
    changes_count = 0

    for filepath, edits in file_edits.items():
        try:
            with open(filepath, 'r') as f:
                content = f.read()
        except OSError as e:
            messages.append(f"  ERROR: Could not read {filepath}: {e}")
            continue

        lines = content.splitlines(keepends=True)
        applied = False

        # Sort edits bottom-to-top so line modifications don't shift subsequent edits
        for sourceline, old_expr, new_expr in sorted(edits, key=lambda e: e[0], reverse=True):
            # Search near the expected sourceline for the expr attribute
            line_idx = sourceline - 1 if sourceline else 0
            search_range = range(max(0, line_idx - 5), min(len(lines), line_idx + 5))

            found = False
            for i in search_range:
                line_text = lines[i]
                # Look for expr="old_expr" or expr='old_expr' in the source
                # Need to handle XML-escaped values
                escaped_old_dq = xml_escape_odoo(old_expr, '"')
                escaped_old_sq = xml_escape_odoo(old_expr, "'")

                for escaped_old, q_char in [(escaped_old_dq, '"'), (escaped_old_sq, "'")]:
                    needle = f'expr={q_char}{escaped_old}{q_char}'
                    pos = line_text.find(needle)
                    if pos != -1:
                        escaped_new = xml_escape_odoo(new_expr, q_char)
                        replacement = f'expr={q_char}{escaped_new}{q_char}'
                        lines[i] = line_text[:pos] + replacement + line_text[pos + len(needle):]
                        applied = True
                        changes_count += 1
                        found = True
                        break
                if found:
                    break

            if not found:
                # Try unescaped match (some files don't XML-escape XPath attrs)
                for i in search_range:
                    line_text = lines[i]
                    for q_char in ['"', "'"]:
                        needle = f'expr={q_char}{old_expr}{q_char}'
                        pos = line_text.find(needle)
                        if pos != -1:
                            replacement = f'expr={q_char}{new_expr}{q_char}'
                            lines[i] = line_text[:pos] + replacement + line_text[pos + len(needle):]
                            applied = True
                            changes_count += 1
                            found = True
                            break
                    if found:
                        break

        if applied:
            if not dry_run:
                with open(filepath, 'w') as f:
                    f.write("".join(lines))
            files_modified += 1

    return files_modified, changes_count, messages


def run_codemod(base_dir, dry_run=False, json_path=None, addons_dirs=None, hide_comp_anonymous=False, only_show_skipped=False):
    """Main codemod logic. Returns (files_modified, total_changes, all_messages)."""
    if json_path is None:
        json_path = os.path.join(base_dir, 'templatesInfos.json')

    if addons_dirs is None:
        addons_dirs = [os.path.join(base_dir, 'addons')]

    with open(json_path) as f:
        data = json.load(f)

    # Filter for component-source accesses
    accesses = [v for v in data['accesses'].values() if v.get('source') == 'component']

    # Group by filename (fall back to templateName for xml source IDs)
    by_file = defaultdict(list)
    for a in accesses:
        filename = a['filename']
        if not filename and a.get('templateName', '').startswith('xml-'):
            filename = a['templateName']
        by_file[filename].append(a)

    files_modified = 0
    total_changes = 0
    all_messages = []
    skipped_files = []
    skipped_details = []
    MAX_SKIPPED_TO_SHOW = 100 if not only_show_skipped else float('inf')
    total_skipped_entries = 0

    # Skip entries with empty filename (anonymous templates)
    empty_entries = by_file.get('', [])
    if hide_comp_anonymous:
        empty_entries = [e for e in empty_entries if '__comp__' not in e['expression']]
    
    empty_count = len(empty_entries)
    total_skipped_entries += empty_count
    for entry in empty_entries:
        if len(skipped_details) < MAX_SKIPPED_TO_SHOW:
            skipped_details.append(f"  [Anonymous] {entry['expression']} (prop: {entry['property']}, source: {entry.get('source')})")

    # Collect ALL unique expressions and call tokenizer once
    all_expressions = list({a['expression'] for a in accesses})
    if all_expressions:
        tokenizer_results = call_node_tokenizer(all_expressions)
    else:
        tokenizer_results = {}

    # Resolve filepaths and prepare work items
    work_items = []  # (filename, filepath, entries, is_xml)
    for filename, entries in sorted(by_file.items()):
        if not filename:
            continue

        filepath = resolve_filepath(filename, addons_dirs)
        if filepath is None:
            total_skipped_entries += len(entries)
            for entry in entries:
                if len(skipped_details) < MAX_SKIPPED_TO_SHOW:
                    skipped_details.append(f"  [Unresolvable: {filename}] {entry['expression']} (prop: {entry['property']}, source: {entry.get('source')})")
            skipped_files.append(f"  Cannot resolve '{filename}' ({len(entries)} entries)")
            continue

        if not os.path.exists(filepath):
            total_skipped_entries += len(entries)
            for entry in entries:
                if len(skipped_details) < MAX_SKIPPED_TO_SHOW:
                    skipped_details.append(f"  [Not Found: {filepath}] {entry['expression']} (prop: {entry['property']}, source: {entry.get('source')})")
            skipped_files.append(f"  File not found: {filepath} ({len(entries)} entries)")
            continue

        is_xml = filepath.endswith('.xml')
        work_items.append((filename, filepath, entries, is_xml))

    if only_show_skipped:
        _finish_skipped_report(all_messages, empty_count, skipped_files, skipped_details, MAX_SKIPPED_TO_SHOW, total_skipped_entries)
        return 0, 0, all_messages

    # Build inheritance index for cascading XPath updates and extension processing
    inheritance_index = build_inheritance_index(addons_dirs)

    # Augment work items with changes from extension templates.
    # When OWL reports a change for template T in file F, the expression may
    # actually live in a t-inherit-mode="extension" file that extends T.
    # We merge the parent template's changes into those extension files.
    by_template = defaultdict(list)
    for _filename, _filepath, entries, _is_xml in work_items:
        for entry in entries:
            by_template[entry['templateName']].append(entry)

    # Collect extra changes per filepath from extension inheritance
    extra_changes_by_path = defaultdict(list)
    known_paths = {fp for _, fp, _, _ in work_items}
    new_extension_paths = {}  # filepath -> tpl_changes (for files not yet in work_items)
    for tpl_name, tpl_changes in by_template.items():
        for inheritor in inheritance_index.get(tpl_name, []):
            if inheritor['inherit_mode'] != 'extension':
                continue
            ext_filepath = inheritor['filepath']
            extra_changes_by_path[ext_filepath].extend(tpl_changes)
            if ext_filepath not in known_paths:
                new_extension_paths[ext_filepath] = True

    # Merge extra changes into existing work items
    for i, (filename, filepath, entries, is_xml) in enumerate(work_items):
        extra = extra_changes_by_path.get(filepath)
        if extra:
            work_items[i] = (filename, filepath, entries + extra, is_xml)

    # Add new extension files that weren't already in work_items
    extension_work_items = []
    for ext_filepath in new_extension_paths:
        extension_work_items.append((ext_filepath, ext_filepath, extra_changes_by_path[ext_filepath], True))

    all_work_items = work_items + extension_work_items

    # Process files sequentially (tokenizer work is done upfront in Node.js)
    all_attr_changes = []
    for filename, filepath, entries, is_xml in all_work_items:
        filepath, modified, change_count, messages, attr_changes = _process_file_task(
            filepath, entries, is_xml, dry_run, tokenizer_results
        )
        all_messages.extend(messages)
        all_attr_changes.extend(attr_changes)
        if modified:
            files_modified += 1
            total_changes += change_count

    # Cascade XPath updates to inheriting templates
    if all_attr_changes and inheritance_index:
        xpath_files_modified, xpath_changes, xpath_messages = update_inheriting_xpaths(
            inheritance_index, all_attr_changes, dry_run
        )
        all_messages.extend(xpath_messages)
        files_modified += xpath_files_modified
        total_changes += xpath_changes

    _finish_skipped_report(all_messages, empty_count, skipped_files, skipped_details, MAX_SKIPPED_TO_SHOW, total_skipped_entries)

    return files_modified, total_changes, all_messages


def _finish_skipped_report(all_messages, empty_count, skipped_files, skipped_details, MAX_SKIPPED_TO_SHOW, total_skipped_entries):
    # Summary of skipped items
    if empty_count:
        all_messages.append(
            f"\nSkipped {empty_count} entries with empty filename (anonymous templates)"
        )
    if skipped_files:
        all_messages.append(f"\nSkipped {len(skipped_files)} unresolvable files:")
        all_messages.extend(skipped_files)

    if skipped_details:
        all_messages.append(f"\nSkipped entries details (up to {MAX_SKIPPED_TO_SHOW}):")
        all_messages.extend(skipped_details)
        if total_skipped_entries > MAX_SKIPPED_TO_SHOW:
            all_messages.append(f"  ... and {total_skipped_entries - MAX_SKIPPED_TO_SHOW} more")


def main():
    parser = argparse.ArgumentParser(
        description="Codemod: Add 'this.' prefix to component property accesses in OWL templates.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python add_this_prefix.py
    python add_this_prefix.py --dry-run
    python add_this_prefix.py --report-file consolidated.templatesInfos.json
    python add_this_prefix.py --base-dir /path/to/odoo --report-file /path/to/report.json
    python add_this_prefix.py --enterprise-dir /path/to/enterprise --dry-run
        """
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show changes without modifying files."
    )
    parser.add_argument(
        "--base-dir",
        help="Path to the Odoo root directory. Defaults to the root of this repository."
    )
    parser.add_argument(
        "--enterprise-dir",
        help="Path to the enterprise addons directory. Auto-detected as base-dir/../enterprise if it exists."
    )
    parser.add_argument(
        "--report-file",
        help="Path to the templatesInfos.json report file. Defaults to 'templatesInfos.json' in base-dir."
    )
    parser.add_argument(
        "--hide-comp-anonymous",
        action="store_true",
        help="Hide anonymous template entries that contain '__comp__' in their expression."
    )
    parser.add_argument(
        "--only-show-skipped",
        action="store_true",
        help="Only show the report of skipped entries and skip processing files. Shows all entries (no 100 limit)."
    )
    args = parser.parse_args()

    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(0)

    cwd = os.getcwd()
    base_dir = args.base_dir
    if base_dir is None:
        # Prefer 'odoo' directory in CWD if it exists
        if os.path.isdir(os.path.join(cwd, 'odoo')):
            base_dir = os.path.abspath(os.path.join(cwd, 'odoo'))
        else:
            # Default: assume script is in odoo/upgrade_code/
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    # Build list of addon directories to search
    addons_dirs = [
        os.path.join(base_dir, 'addons'),
        os.path.join(base_dir, 'odoo', 'addons'),
    ]

    enterprise_dir = args.enterprise_dir
    if enterprise_dir is None:
        # Prefer 'enterprise' directory in CWD if it exists
        if os.path.isdir(os.path.join(cwd, 'enterprise')):
            enterprise_dir = os.path.abspath(os.path.join(cwd, 'enterprise'))
        else:
            # Auto-detect enterprise directory as sibling of base_dir
            candidate = os.path.join(os.path.dirname(base_dir), 'enterprise')
            if os.path.isdir(candidate):
                enterprise_dir = candidate

    if enterprise_dir and os.path.isdir(enterprise_dir):
        addons_dirs.append(enterprise_dir)
        print(f"Using enterprise addons from: {enterprise_dir}")

    # Remove non-existent or duplicate directories
    seen = set()
    addons_dirs = [d for d in addons_dirs if os.path.isdir(d) and not (d in seen or seen.add(d))]

    if args.dry_run:
        print("=== DRY RUN (no files will be modified) ===\n")

    files_modified, total_changes, messages = run_codemod(
        base_dir,
        dry_run=args.dry_run,
        json_path=args.report_file,
        addons_dirs=addons_dirs,
        hide_comp_anonymous=args.hide_comp_anonymous,
        only_show_skipped=args.only_show_skipped,
    )
    for msg in messages:
        print(msg)

    print(f"\n{'Would modify' if args.dry_run else 'Modified'} {files_modified} files "
          f"with {total_changes} expression changes.")


if __name__ == '__main__':
    main()
