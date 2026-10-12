# Part of Odoo. See LICENSE file for full copyright and licensing details.

from lxml import etree
from markupsafe import Markup

from odoo import api, models, _
from odoo.addons.website.tools import add_form_signature


class IrQwebFieldContact(models.AbstractModel):
    _inherit = 'ir.qweb.field.contact'

    @api.model
    def get_available_options(self):
        options = super().get_available_options()
        options.update(
            website_description=dict(type='boolean', string=_('Display the website description')),
            UserBio=dict(type='boolean', string=_('Display the biography')),
            badges=dict(type='boolean', string=_('Display the badges'))
        )
        return options


class IrQwebFieldHtml(models.AbstractModel):
    _inherit = 'ir.qweb.field.html'

    def _post_processing_att(self, tag, attrib):
        self.env['ir.qweb']._copy_translate_attributes(attrib)
        return super()._post_processing_att(tag, attrib)

    @api.model
    def value_to_html(self, value, options):
        res = super().value_to_html(value, options)
        if not res:
            return res

        has_form = '<form' in res # Efficient check
        has_datetime_range = (
            not options.get('inherit_branding')
            and not self.env.context.get('edit_translations')
            and ('data-visibility-from' in res or 'data-visibility-until' in res)
        )
        if has_form or has_datetime_range:
            # The usage of `fromstring`, `HTMLParser`, `tostring` and `Markup`
            # is replicating what is done in the `super()` implementation.
            body = etree.fromstring("<body>%s</body>" % res, etree.HTMLParser())[0]
            if has_form:
                add_form_signature(body, self.sudo().env)
            if has_datetime_range:
                self._remove_out_of_datetime_range_elements(body)
            res = Markup(etree.tostring(body, encoding='unicode', method='html')[6:-7])

        return res

    def _remove_out_of_datetime_range_elements(self, body):
        IrQweb = self.env['ir.qweb']
        for el in body.xpath('.//*[@data-visibility-from or @data-visibility-until]'):
            visible_from = IrQweb._parse_visibility_timestamp(el.get('data-visibility-from'))
            visible_until = IrQweb._parse_visibility_timestamp(el.get('data-visibility-until'))
            if IrQweb._is_now_in_datetime_range(visible_from, visible_until):
                continue
            parent = el.getparent()
            if el.tail:
                previous = el.getprevious()
                if previous is not None:
                    previous.tail = (previous.tail or '') + el.tail
                else:
                    parent.text = (parent.text or '') + el.tail
            parent.remove(el)
