from odoo import fields, models, api


class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_fr_is_company_french = fields.Boolean(compute='_compute_l10n_fr_is_company_french')

    @api.model
    def _get_view(self, view_id=None, view_type='form', **options):
        arch, view = super()._get_view(view_id, view_type, **options)
        company = self.env.company
        if view_type == 'form' and company.country_code in company._get_france_country_codes():
            shipping_field = arch.xpath("//field[@name='partner_shipping_id']")[0]
            shipping_field.attrib.pop("groups", None)
        return arch, view

    @api.depends('company_id.country_code')
    def _compute_l10n_fr_is_company_french(self):
        for record in self:
            record.l10n_fr_is_company_french = record.country_code in record.company_id._get_france_country_codes()

    @api.depends('l10n_fr_is_company_french')
    def _compute_show_delivery_date(self):
        # EXTENDS 'account'
        super()._compute_show_delivery_date()
        for move in self:
            if move.l10n_fr_is_company_french:
                move.show_delivery_date = move.is_sale_document()

    def _post(self, soft=True):
        for move in self:
            if move.show_delivery_date and not move.delivery_date:
                move.delivery_date = move.invoice_date or fields.Date.context_today(self)
        return super()._post(soft)
