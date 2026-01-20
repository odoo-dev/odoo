# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re

from markupsafe import Markup, escape_silent
from lxml import etree
from odoo import models

from odoo.addons.base.models.ir_qweb import indent_code


class IrQweb(models.AbstractModel):
    """ IrQweb object for rendering builder stuff
    """
    _inherit = 'ir.qweb'

    def _get_preload_attribute_xmlids(self):
        return super()._get_preload_attribute_xmlids() + ['t-snippet', 't-snippet-call']

    # compile directives

    def _compile_directive_snippet(self, el, compile_context, indent):
        key = el.attrib.pop('t-snippet')
        snippet_lang = self.env.context.get('snippet_lang')
        if snippet_lang:
            el.set('t-lang', f"'{snippet_lang}'")

        view = self.env['ir.ui.view']._get_template_view(key)
        name = el.attrib.pop('string', view.name)
        thumbnail = el.attrib.pop('t-thumbnail', "oe-thumbnail")
        # If provided, this image is used as the placeholder in the snippet
        # dialog.
        image_preview = el.attrib.pop('t-image-preview', None)
        # If provided, this image is used as the snippet placeholder while
        # dragging the snippet onto the page (shown when over a dropzone).
        drag_image_preview = el.attrib.pop('t-drag-image-preview', None)
        # Forbid sanitize contains the specific reason:
        # - "true": always forbid
        # - "form": forbid if forms are sanitized
        forbid_sanitize = el.attrib.pop('t-forbid-sanitize', None)
        grid_column_span = el.attrib.pop('t-grid-column-span', None)
        snippet_group = el.attrib.pop('snippet-group', None)
        group = el.attrib.pop('group', None)
        label = el.attrib.pop('label', None)
        div = Markup('<div name="%s" data-oe-type="snippet" data-o-image-preview="%s" data-oe-thumbnail="%s" data-oe-snippet-id="%s" data-oe-snippet-key="%s" data-oe-keywords="%s" %s %s %s %s %s %s>') % (
            name,
            escape_silent(image_preview),
            thumbnail,
            view.id,
            key.split('.')[-1],
            escape_silent(el.findtext('keywords')),
            Markup('data-oe-forbid-sanitize="%s"') % forbid_sanitize if forbid_sanitize else '',
            Markup('data-o-grid-column-span="%s"') % grid_column_span if grid_column_span else '',
            Markup('data-o-snippet-group="%s"') % snippet_group if snippet_group else '',
            Markup('data-o-group="%s"') % group if group else '',
            Markup('data-o-label="%s"') % label if label else '',
            Markup('data-o-drag-image-preview="%s"') % drag_image_preview if drag_image_preview else '',
        )
        self._append_text(div, compile_context)

        el.set('t-snippet-call', key)
        code = self._compile_directive_snippet_call(el, compile_context, indent)

        self._append_text('</div>', compile_context)
        return code

    def _compile_directive_snippet_call(self, el, compile_context, indent):
        snippet_key = el.attrib.pop('t-snippet-call')
        snippet_name = el.attrib.pop('string', None)

        el.set('t-call', snippet_key)

        set_name = compile_context['make_name']('t_snippet')
        tset = etree.Element('t', {'t-set': set_name})
        parent = el.getparent()
        if parent is not None:
            parent.insert(parent.index(el), tset)
        tset.insert(0, el)
        el = tset

        code = self._compile_node(el, compile_context, indent)
        code.append(indent_code(f"""
            snippet_call_content = str(values[{set_name!r}])
            if '<' in snippet_call_content:
                before, tag = snippet_call_content.split('<', 1)
                in_tag, after = tag.split('>', 1)
                insertion = ''
                if ' data-snippet=' not in in_tag:
                    insertion = " data-snippet={snippet_key.split('.', 1)[-1]!r}"
                if {snippet_name!r} and ' data-name=' not in in_tag:
                    insertion += " data-name={snippet_name!r}"
                snippet_call_content = f"{{before}}<{{in_tag}}{{insertion}}>{{after}}"
            yield snippet_call_content
        """, indent))

        return code

    def _compile_directive_install(self, el, compile_context, indent):
        key = el.attrib.pop('t-install')
        thumbnail = el.attrib.pop('t-thumbnail', 'oe-thumbnail')
        image_preview = el.attrib.pop('t-image-preview', None)
        snippet_group = el.attrib.pop('snippet-group', None)
        group = el.attrib.pop('group', None)
        label = el.attrib.pop('label', None)
        name = el.attrib.pop('string', 'Snippet')
        if self.env.user.has_group('base.group_system'):
            module = self.env['ir.module.module'].search([('name', '=', key)])
            if not module or module.state == 'installed':
                return []
            div = Markup('<div name="%s" data-oe-type="snippet" data-module-id="%s" data-module-display-name="%s" data-o-image-preview="%s" data-oe-thumbnail="%s" %s %s %s><section/></div>') % (
                name,
                module.id,
                module.display_name,
                escape_silent(image_preview),
                thumbnail,
                Markup('data-o-snippet-group="%s"') % snippet_group if snippet_group else '',
                Markup('data-o-group="%s"') % group if group else '',
                Markup('data-o-label="%s"') % label if label else '',
            )
            self._append_text(div, compile_context)
        return []

    # order and ignore

    def _directives_eval_order(self):
        directives = super()._directives_eval_order()
        # Insert before "call" and "options" to use this "call" directive after this one
        index = directives.index('options') - 1
        directives.insert(index, 'snippet-call')

        # Insert before "att" as those may rely on static attributes like
        # "string" and "att" clears all of those
        index = directives.index('att') - 1
        directives.insert(index, 'snippet')
        directives.insert(index, 'install')
        return directives

    def _get_template_cache_keys(self):
        return super()._get_template_cache_keys() + ['snippet_lang']
