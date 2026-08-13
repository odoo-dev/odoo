from odoo import Command, fields, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    tax_scope = fields.Selection(
        selection_add=[('merch', 'Merchandise'), ('invest', 'Investment')],
    )

    def _prepare_margin_line_values(self, base_line, tax_data, company):
        values = super()._prepare_margin_line_values(base_line, tax_data, company)
        tax = tax_data['tax']
        if not tax.is_tax_on_margin or tax.country_id != self.env.ref('base.be'):
            return values

        AccountTag = self.env['account.account.tag']
        return {
            'product_line': {
                **values['product_line'],
                'tax_tag_ids': [Command.set(AccountTag._get_tax_tags('00', tax.country_id.id).ids)],
            },
            'margin_line': {
                **values['margin_line'],
                'tax_tag_ids': [Command.set(AccountTag._get_tax_tags('03', tax.country_id.id).ids)],
            },
        }
