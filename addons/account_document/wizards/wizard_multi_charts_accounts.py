from odoo import models, api


class WizardMultiChartsAccounts(models.TransientModel):
    _inherit = 'wizard.multi.charts.accounts'

    @api.multi
    def execute(self):
        """
        When we load a chart of account and set a default tax, add this tax
        to every product
        """
        res = super(WizardMultiChartsAccounts, self).execute()

        # get for detault tax and supplier tax setted for this company

        tax_ids = self.env['ir.default'].get(
            'product.template', 'taxes_id',
            company_id=self.company_id.id)
        supplier_taxes_ids = self.env['ir.default'].get(
            'product.template', 'supplier_taxes_id',
            company_id=self.company_id.id)

        prod_templates = self.env['product.template'].search([])
        if self.sale_tax_id and tax_ids:
            prod_templates.write({
                'taxes_id': [(4, tax_ids[0], None)],
            })
        if self.purchase_tax_id and supplier_taxes_ids:
            prod_templates.write({
                'supplier_taxes_id': [(4, supplier_taxes_ids[0], None)],
            })
        return res
