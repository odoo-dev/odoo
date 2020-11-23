# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

from odoo.tools import html2plaintext


class MassMailingPopup(models.Model):
    _name = 'website.mass_mailing.popup'
    _description = "Mailing list popup"

    def _default_popup_content(self):
        return self.env['ir.ui.view']._render_template('website_mass_mailing.s_newsletter_subscribe_popup_content')

    mailing_list_id = fields.Many2one('mailing.list')
    website_id = fields.Many2one('website')
    popup_content = fields.Html(string="Website Popup Content", default=_default_popup_content, translate=True, sanitize=False)

    def name_get(self):
        result = []
        for popup in self:
            plaintext_content = html2plaintext(popup.popup_content or '')
            if len(plaintext_content) > 50:
                plaintext_content = f'{plaintext_content[0:35]}.....(ID: {popup.id})'
            else:
                plaintext_content = f'{plaintext_content} (ID: {popup.id})'
            result.append((popup.id, plaintext_content))
        return result
