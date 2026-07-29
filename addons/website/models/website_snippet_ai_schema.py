# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import os
import re

from lxml import html as lxml_html

from odoo import api, models
from odoo.tools import file_path, ormcache

_logger = logging.getLogger(__name__)

# Restricted CSS subset accepted in schema paths, see _css_path_to_xpath.
_CSS_STEP_RE = re.compile(
    r'^(?P<scope>:scope)?(?P<tag>[a-z][a-z0-9-]*)?'
    r'(?P<classes>(?:\.[A-Za-z0-9_-]+)*)'
    r'(?P<attrs>(?:\[[A-Za-z0-9_-]+(?:="[^"]*")?\])*)'
    r'(?P<pseudo>:(?:first-child|last-child|nth-child\(\d+\)))?$'
)

_MAX_SLOT_TEXT_LENGTH = 600
_MAX_IMAGE_QUERY_LENGTH = 100
_MAX_OUTLINE_TEXT_LENGTH = 400


class WebsiteSnippetAiSchema(models.AbstractModel):
    """Loader and compiler for the hand-authored AI snippet schemas.

    Modules that ship AI-exposed snippets have an ``ai_schemas/`` directory at
    module root with one JSON file per snippet key, plus shared vocabulary
    files under ``ai_schemas/vocabulary/``. A snippet is AI-exposed iff it has
    BOTH a ``<description>`` in its snippets.xml declaration and a schema file.
    This model loads those static files, exposes the catalog, and compiles the
    strict structured-output schema used by the AI fill pass.
    """
    _name = 'website.snippet.ai.schema'
    _description = 'AI Snippet Schemas'

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    @api.model
    @ormcache()
    def _load_schemas(self):
        """Parse every installed module's ai_schemas/*.json files."""
        schemas = {}
        for module in sorted(self.env.registry._init_modules):
            try:
                dir_path = file_path(f'{module}/ai_schemas')
            except FileNotFoundError:
                continue
            for filename in sorted(os.listdir(dir_path)):
                if not filename.endswith('.json'):
                    continue
                try:
                    with open(os.path.join(dir_path, filename), encoding='utf-8') as schema_file:
                        schema = json.load(schema_file)
                except (OSError, ValueError):
                    _logger.exception("Invalid AI snippet schema file %s/ai_schemas/%s", module, filename)
                    continue
                if schema.get('snippet'):
                    schemas[schema['snippet']] = schema
        return schemas

    @api.model
    @ormcache()
    def _load_vocabularies(self):
        """Parse every installed module's ai_schemas/vocabulary/*.json files."""
        vocabularies = {}
        for module in sorted(self.env.registry._init_modules):
            try:
                dir_path = file_path(f'{module}/ai_schemas/vocabulary')
            except FileNotFoundError:
                continue
            for filename in sorted(os.listdir(dir_path)):
                if not filename.endswith('.json'):
                    continue
                try:
                    with open(os.path.join(dir_path, filename), encoding='utf-8') as vocab_file:
                        vocab = json.load(vocab_file)
                except (OSError, ValueError):
                    _logger.exception("Invalid AI vocabulary file %s/ai_schemas/vocabulary/%s", module, filename)
                    continue
                if vocab.get('name'):
                    vocabularies[vocab['name']] = vocab
        return vocabularies

    @api.model
    @ormcache('website_id', 'lang')
    def _render_snippets_tree(self, website_id, lang):
        snippets_html = self.env['ir.ui.view'].with_context(
            website_id=website_id,
            lang=lang,
            inherit_branding=False,
            # debug: so debug-gated declarations (dynamic snippets) render too;
            # exposure is decided by description+schema, not by the panel group.
        ).render_public_asset('website.snippets', values={'debug': True})
        return lxml_html.fromstring(f'<div>{snippets_html}</div>')

    @api.model
    def _get_snippets_tree(self):
        website_id = (
            self.env['website'].get_current_website().id
            or self.env.ref('base.default_website').id
        )
        # The model-facing catalog uses the en_US render.
        return self._render_snippets_tree(website_id, 'en_US')

    # ------------------------------------------------------------------
    # Catalog / accessors
    # ------------------------------------------------------------------

    @api.model
    def _get_catalog(self):
        """[(key, name, group, description)] for every AI-exposed snippet.

        A snippet is exposed iff it has a description in snippets.xml AND a
        schema file. Only structure snippets (sections) are listed.
        """
        schemas = self._load_schemas()
        catalog = []
        tree = self._get_snippets_tree()
        for snippet_el in tree.xpath('.//snippets[@id="snippet_structure"]/*'):
            key = snippet_el.get('data-oe-snippet-key')
            description = snippet_el.get('data-oe-description')
            if not key or not description or key not in schemas:
                continue
            catalog.append({
                'key': key,
                'name': snippet_el.get('name'),
                'group': snippet_el.get('data-o-group') or 'other',
                'description': description,
            })
        return catalog

    @api.model
    def _get_schema(self, key):
        return self._load_schemas().get(key)

    @api.model
    def _get_vocabulary(self, name):
        return self._load_vocabularies().get(name)

    # ------------------------------------------------------------------
    # Option resolution
    # ------------------------------------------------------------------

    @api.model
    def _resolve_option(self, definition):
        """Resolve a schema option definition into its enum, model-facing
        description and apply information.

        :return: (values, description, apply) where apply is a dict:
            {'mechanism': 'class'|'data_attr'|'style',
             'remove_pattern': regex or None,
             'entries': {value: [classes]},           # class mechanism
             'attribute': 'data-...',                  # data_attr mechanism
             'property': 'css-prop'}                   # style mechanism
        """
        vocab_name = definition.get('vocab')
        if vocab_name and vocab_name.startswith(('dynamic_filter:', 'dynamic_template:')):
            return self._resolve_dynamic_vocab(vocab_name)
        if vocab_name:
            vocab = self._get_vocabulary(vocab_name)
            if not vocab:
                return [], '', {}
            if 'values' in vocab:  # numeric class-prefix family (eg. padding)
                prefix = definition.get('prefix', '')
                values = [f'{prefix}{value}' for value in vocab['values']]
                apply_info = {
                    'mechanism': 'class',
                    'remove_pattern': vocab['apply']['remove_pattern'].replace('{prefix}', prefix),
                    'entries': {value: [value] for value in values},
                }
                return values, vocab.get('notes', ''), apply_info
            entries = vocab.get('entries', [])
            values = [entry['value'] for entry in entries]
            extra_classes = vocab['apply'].get('extra_classes', [])
            apply_info = {
                'mechanism': vocab['apply'].get('mechanism', 'class'),
                'remove_pattern': vocab['apply'].get('remove_pattern'),
                'entries': {
                    entry['value']: extra_classes + entry.get('classes', [entry['value']])
                    for entry in entries
                },
            }
            description_parts = [vocab.get('notes', '')]
            description_parts += [f"{entry['value']}: {entry['desc']}" for entry in entries if entry.get('desc')]
            return values, ' | '.join(part for part in description_parts if part), apply_info
        # Inline enum declared in the snippet schema itself.
        values = definition.get('values', [])
        apply_info = {
            'mechanism': definition.get('mechanism', 'class'),
            'remove_pattern': definition.get('remove_pattern'),
            'entries': {value: [value] for value in values},
        }
        if definition.get('attribute'):
            apply_info['attribute'] = definition['attribute']
        if definition.get('property'):
            apply_info['property'] = definition['property']
        return values, definition.get('desc', ''), apply_info

    @api.model
    def _resolve_dynamic_vocab(self, vocab_name):
        """Resolve db-dependent enums for dynamic snippets."""
        kind, model_name = vocab_name.split(':', 1)
        website = self.env['website'].get_current_website()
        if kind == 'dynamic_filter':
            filters = self.env['website.snippet.filter'].search([
                '|', ('website_id', '=', False), ('website_id', '=', website.id),
            ])
            if model_name != '*':
                # model_name is a non-stored compute, filter in Python
                filters = filters.filtered(lambda f: (f.model_name or '').startswith(model_name))
            values = [str(f.id) for f in filters]
            description = 'Content source: ' + ' | '.join(
                f'{f.id}: {f.name} ({f.model_name})' for f in filters
            )
            return values, description, {'mechanism': 'data_attr', 'attribute': 'data-filter-id'}
        # dynamic_template
        templates = self.env['ir.ui.view'].sudo().search_read(
            [('type', '=', 'qweb'), ('key', 'ilike', '.dynamic_filter_template_')],
            ['key', 'name'],
        )
        if model_name != '*':
            model_bit = model_name.replace('.', '_')
            templates = [t for t in templates if f'dynamic_filter_template_{model_bit}' in t['key']]
        values = [t['key'] for t in templates]
        description = 'Rendering template: ' + ' | '.join(f"{t['key']}: {t['name']}" for t in templates)
        return values, description, {'mechanism': 'data_attr', 'attribute': 'data-template-key'}

    # ------------------------------------------------------------------
    # Strict fill schema (pass 2)
    # ------------------------------------------------------------------

    @api.model
    def _build_fill_schema(self, picked_keys):
        """Build the strict structured-output JSON schema for the fill pass,
        covering only the picked snippet keys (deduplicated).

        The shape follows strict-mode rules: additionalProperties false
        everywhere, every property required, optional values nullable.
        """
        shapes = []
        for key in dict.fromkeys(picked_keys):  # dedup, keep order
            if self._get_schema(key):
                shapes.append(self._build_section_shape(key))
        if not shapes:
            return None
        items = shapes[0] if len(shapes) == 1 else {'anyOf': shapes}
        return {
            'type': 'object',
            'additionalProperties': False,
            'required': ['sections'],
            'properties': {
                'sections': {
                    'type': 'array',
                    'description': 'One entry per planned section, in the same order as the plan.',
                    'items': items,
                },
            },
        }

    @api.model
    def _build_section_shape(self, key):
        schema = self._get_schema(key)
        properties = {'snippet': {'type': 'string', 'enum': [key]}}
        required = ['snippet']

        if schema.get('content'):
            properties['content'] = self._build_slots_fill_schema(schema['content'])
            required.append('content')

        if schema.get('repeats'):
            repeat_properties = {}
            for repeat_name, repeat in schema['repeats'].items():
                item_properties = {}
                item_required = []
                if repeat.get('slots'):
                    item_properties['content'] = self._build_slots_fill_schema(repeat['slots'])
                    item_required.append('content')
                if repeat.get('images'):
                    item_properties['images'] = self._build_images_fill_schema(repeat['images'])
                    item_required.append('images')
                repeat_properties[repeat_name] = {
                    'type': 'array',
                    'description': (
                        f"Between {repeat.get('min', 1)} and {repeat.get('max', 6)} items. "
                        "Vary the copy between items, never repeat the same text."
                    ),
                    'items': {
                        'type': 'object',
                        'additionalProperties': False,
                        'required': item_required,
                        'properties': item_properties,
                    },
                }
            properties['items'] = {
                'type': 'object',
                'additionalProperties': False,
                'required': list(repeat_properties),
                'properties': repeat_properties,
            }
            required.append('items')

        if schema.get('images'):
            properties['images'] = self._build_images_fill_schema(schema['images'])
            required.append('images')

        core_options = (schema.get('options') or {}).get('core') or {}
        if core_options:
            option_properties = {}
            for option_name, definition in core_options.items():
                values, description, _apply = self._resolve_option(definition)
                option_properties[option_name] = {
                    'anyOf': [
                        {'type': 'string', 'enum': values},
                        {'type': 'null'},
                    ],
                    'description': (description or '') + ' Use null to keep the snippet default.',
                }
            properties['options'] = {
                'type': 'object',
                'additionalProperties': False,
                'required': list(option_properties),
                'properties': option_properties,
            }
            required.append('options')

        return {
            'type': 'object',
            'additionalProperties': False,
            'required': required,
            'properties': properties,
        }

    @api.model
    def _build_slots_fill_schema(self, slots):
        slot_lines = []
        for slot_name, slot in slots.items():
            bits = [slot.get('kind', 'text')]
            if slot.get('optional'):
                bits.append('optional')
            if slot.get('hint'):
                bits.append(slot['hint'])
            slot_lines.append(f"{slot_name} ({', '.join(bits)})")
        has_link_slots = any(slot.get('kind') in ('button', 'link') for slot in slots.values())
        return {
            'type': 'array',
            'description': (
                'Texts for the snippet slots. Include every non-optional slot exactly once; '
                'omit optional slots you do not need (they are removed). Slots: '
                + '; '.join(slot_lines)
            ),
            'items': {
                'type': 'object',
                'additionalProperties': False,
                'required': ['slot', 'text', 'href'],
                'properties': {
                    'slot': {'type': 'string', 'enum': list(slots)},
                    'text': {'type': 'string', 'maxLength': _MAX_SLOT_TEXT_LENGTH},
                    'href': {
                        'type': ['string', 'null'],
                        'description': (
                            'Link target, only for button/link slots (null otherwise). '
                            'Use relative URLs of existing pages or anchors.'
                            if has_link_slots else 'Always null for this snippet.'
                        ),
                    },
                },
            },
        }

    @api.model
    def _build_images_fill_schema(self, images):
        image_lines = [
            f"{image_name} ({image.get('kind', 'img')}{', ' + image['hint'] if image.get('hint') else ''})"
            for image_name, image in images.items()
        ]
        return {
            'type': 'array',
            'description': (
                'One entry per image slot: ' + '; '.join(image_lines) + '. '
                'Give descriptive stock-photo search keywords in `query`; set `url` only '
                'when an exact image URL is already known (user-provided or generated).'
            ),
            'items': {
                'type': 'object',
                'additionalProperties': False,
                'required': ['slot', 'query', 'url'],
                'properties': {
                    'slot': {'type': 'string', 'enum': list(images)},
                    'query': {'type': 'string', 'maxLength': _MAX_IMAGE_QUERY_LENGTH},
                    'url': {'type': ['string', 'null']},
                },
            },
        }

    # ------------------------------------------------------------------
    # Path resolution (restricted CSS subset -> XPath)
    # ------------------------------------------------------------------

    @api.model
    def _css_path_to_xpath(self, path):
        """Convert a schema path (restricted CSS subset) to an XPath relative
        to the section root. Raises ValueError on unsupported syntax.
        """
        path = (path or '').strip()
        if not path or path == ':scope':
            return '.'
        # Tokenize on combinators, keeping them; spaces inside attribute
        # selectors ([data-name="Team Member"]) are not combinators.
        protected = re.sub(r'\[[^\]]*\]', lambda match: match.group(0).replace(' ', '\x00'), path)
        tokens = [token and token.replace('\x00', ' ') for token in re.split(r'\s*(>)\s*|\s+', protected)]
        xpath = '.'
        combinator = '//'  # descendant by default
        for token in tokens:
            if token is None or token == '':
                continue
            if token == '>':
                combinator = '/'
                continue
            match = _CSS_STEP_RE.match(token)
            if not match:
                raise ValueError(f"Unsupported path step {token!r} in {path!r}")
            if match.group('scope'):
                continue
            tag = match.group('tag') or '*'
            conditions = []
            for cls in filter(None, (match.group('classes') or '').split('.')):
                conditions.append(f'contains(concat(" ", normalize-space(@class), " "), " {cls} ")')
            for attr in re.findall(r'\[([A-Za-z0-9_-]+)(?:="([^"]*)")?\]', match.group('attrs') or ''):
                if attr[1]:
                    conditions.append(f'@{attr[0]}="{attr[1]}"')
                else:
                    conditions.append(f'@{attr[0]}')
            pseudo = match.group('pseudo')
            if pseudo == ':first-child':
                conditions.append('count(preceding-sibling::*) = 0')
            elif pseudo == ':last-child':
                conditions.append('count(following-sibling::*) = 0')
            elif pseudo and pseudo.startswith(':nth-child'):
                n = int(re.search(r'\((\d+)\)', pseudo)[1])
                conditions.append(f'count(preceding-sibling::*) = {n - 1}')
            step = tag + ''.join(f'[{condition}]' for condition in conditions)
            xpath += combinator + step
            combinator = '//'
        return xpath

    @api.model
    def _find_path_elements(self, root_el, path):
        try:
            return root_el.xpath(self._css_path_to_xpath(path))
        except ValueError:
            _logger.warning("Invalid AI schema path %r", path)
            return []

    # ------------------------------------------------------------------
    # Outline derivation (reverse-parse a zone's HTML through the schemas)
    # ------------------------------------------------------------------

    @api.model
    def _derive_outline(self, zone_html):
        """Derive the JSON outline of an editable zone from its HTML.

        Returns a list of section dicts; sections whose snippet has a schema
        are reverse-parsed (slots, items, options, images), others degrade to
        {snippet, text_content}. Section ids are the stamped
        data-ai-section-id when present, else positional ("pos-<n>", 1-based
        over the whole zone).
        """
        if not (zone_html or '').strip():
            return []
        try:
            root = lxml_html.fromstring(f'<div>{zone_html}</div>')
        except Exception:  # noqa: BLE001 - malformed client HTML must not crash the chat
            return []
        outline = []
        for index, section_el in enumerate(root.xpath('.//section[not(ancestor::section)]'), start=1):
            outline.append(self._extract_section_outline(section_el, index))
        return outline

    @api.model
    def _extract_section_outline(self, section_el, index):
        key = section_el.get('data-snippet')
        entry = {
            'id': section_el.get('data-ai-section-id') or f'pos-{index}',
            'snippet': key or 'unknown',
        }
        if section_el.get('data-name'):
            entry['name'] = section_el.get('data-name')
        schema = key and self._get_schema(key)
        if not schema:
            text = ' '.join(section_el.text_content().split())
            if len(text) > _MAX_OUTLINE_TEXT_LENGTH:
                text = text[:_MAX_OUTLINE_TEXT_LENGTH] + '…'
            entry['text_content'] = text
            return entry

        content = {}
        for slot_name, slot in (schema.get('content') or {}).items():
            slot_els = self._find_path_elements(section_el, slot['path'])
            if slot_els is not None and len(slot_els) == 1:
                content[slot_name] = ' '.join(slot_els[0].text_content().split())
        if content:
            entry['content'] = content

        items = {}
        for repeat_name, repeat in (schema.get('repeats') or {}).items():
            instances = []
            for instance_el in self._find_path_elements(section_el, repeat['path']):
                instance = {}
                for slot_name, slot in (repeat.get('slots') or {}).items():
                    slot_els = self._find_path_elements(instance_el, slot['path'])
                    if len(slot_els) == 1:
                        instance[slot_name] = ' '.join(slot_els[0].text_content().split())
                instances.append(instance)
            if instances:
                items[repeat_name] = instances
        if items:
            entry['items'] = items

        options = {}
        for option_name, definition in ((schema.get('options') or {}).get('core') or {}).items():
            value = self._detect_option_value(section_el, definition)
            if value is not None:
                options[option_name] = value
        if options:
            entry['options'] = options

        return entry

    @api.model
    def _detect_option_value(self, section_el, definition):
        values, _description, apply_info = self._resolve_option(definition)
        if apply_info.get('mechanism') == 'data_attr':
            return section_el.get(apply_info['attribute'])
        if apply_info.get('mechanism') != 'class':
            return None
        classes = (section_el.get('class') or '').split()
        for value in values:
            entry_classes = apply_info.get('entries', {}).get(value) or [value]
            if entry_classes and all(cls in classes for cls in entry_classes):
                return value
        return None
