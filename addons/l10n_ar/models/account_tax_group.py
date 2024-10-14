# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import _, api, fields, models
from odoo.exceptions import UserError


class AccountTaxGroup(models.Model):

    _inherit = 'account.tax.group'

    # values from http://www.afip.gob.ar/fe/documentos/otros_Tributos.xlsx
    l10n_ar_tribute_afip_code = fields.Selection([
        ('01', '01 - National Taxes'),
        ('02', '02 - Provincial Taxes'),
        ('03', '03 - Municipal Taxes'),
        ('04', '04 - Internal Taxes'),
        ('06', '06 - VAT perception'),
        ('07', '07 - IIBB perception'),
        ('08', '08 - Municipal Taxes Perceptions'),
        ('09', '09 - Other Perceptions'),
        ('99', '99 - Others'),
    ], string='Tribute AFIP Code', index=True, readonly=True)
    # values from http://www.afip.gob.ar/fe/documentos/OperacionCondicionIVA.xls
    l10n_ar_vat_afip_code = fields.Selection([
        ('0', 'Not Applicable'),
        ('1', 'Untaxed'),
        ('2', 'Exempt'),
        ('3', '0%'),
        ('4', '10.5%'),
        ('5', '21%'),
        ('6', '27%'),
        ('8', '5%'),
        ('9', '2,5%'),
    ], string='VAT AFIP Code', index=True, readonly=True)

    @api.ondelete(at_uninstall=False)
    def check_uninstall_required(self):
        """
        Make sure we don't uninstall a required tax group
        """
        ar_companies = self.filtered(lambda g: g.company_id.chart_template.startswith('ar_')).mapped('company_id')
        profits_tax_groups = {
            self.env['account.chart.template'].with_company(ar_company).ref(
                'tax_group_percepcion_ganancias',
                raise_if_not_found=False,
            ) for ar_company in ar_companies
        }
        if profit_tax_groups_to_be_deleted := self.filtered(lambda g: g in profits_tax_groups):
            raise UserError(
                _(
                    "The tax group '%s' can't be removed, since it is required in the Argentinian localization.",
                    profit_tax_groups_to_be_deleted[0].name,
                )
            )
