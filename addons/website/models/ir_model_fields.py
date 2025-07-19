# Part of Odoo. See LICENSE file for full copyright and licensing details.

from lxml import etree
from odoo import models, api, _
from odoo.exceptions import ValidationError


class IrModelFields(models.Model):
    _inherit = 'ir.model.fields'

    @api.ondelete(at_uninstall=False)
    def _check_if_used_in_website_form(self):
        """prevent field deletion if used in a website form."""
        form_views = self.env['ir.ui.view'].search([
            ('type', '=', 'qweb'),
            ('arch_db', 'like', 'data-model_name')
        ])
        for field in self:
            for view in form_views:
                # Use a targeted XPath to find if the specific field is used
                # in a form for the correct model within the view's arch.
                arch = etree.fromstring(view.arch_db)
                xpath_selector = f'//form[@data-model_name="{field.model}"]//*[@name="{field.name}"]'
                if arch.xpath(xpath_selector):
                    raise ValidationError(
                        _("Cannot delete field '%(field)s' because it is used in the website form at '%(page)s' page.",
                        field=field.name,
                        page=view.name)
                    )
