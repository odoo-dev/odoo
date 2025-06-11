from odoo import models


class PosSession(models.Model):
    _inherit = 'pos.session'

    def action_pos_session_open(self):
        """Extends the session opening action to ensure necessary sales taxes are active."""
        company = self.config_id.company_id

        if company.country_id.code == 'IN' and company.vat == '/':

            inactive_sale_tax_exists = self.env['account.tax'].sudo().search_count([
                ('type_tax_use', '!=', 'purchase'),
                ('company_id', '=', company.id),
                ('active', '=', True)
            ])

            if not inactive_sale_tax_exists:
                taxes_to_activate = self.env['account.tax'].sudo().search([
                    ('type_tax_use', '!=', 'purchase'),
                    ('company_id', '=', company.id),
                    ('active', '=', False)
                ])

                taxes_to_activate.write({'active': True})
        return super().action_pos_session_open()
