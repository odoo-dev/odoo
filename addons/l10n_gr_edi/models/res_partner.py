from odoo import api, fields, models
from odoo.tools.sql import column_exists, create_column

from odoo.addons.l10n_gr_edi.models.preferred_classification import (
    INVOICE_TYPES_SELECTION,
    PAYMENT_METHOD_SELECTION,
)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_gr_edi_branch_number = fields.Integer(
        string="Branch Number",
        help="Branch number in the Tax Registry",
        compute='_compute_l10n_gr_edi_branch_number',
        store=True,
        readonly=False,
    )
    l10n_gr_edi_default_inv_type = fields.Selection(
        selection=INVOICE_TYPES_SELECTION,
        string="Default MyData Invoice Type",
        help="Default myDATA invoice type to apply on invoices/bills for this partner. "
             "It takes priority over the journal's default and the system fallback.",
    )
    l10n_gr_edi_default_payment_method = fields.Selection(
        selection=PAYMENT_METHOD_SELECTION,
        string="Default MyData Payment Method",
        help="Default myDATA payment method to apply on invoices/bills for this partner. "
             "It takes priority over the journal's default and the system fallback.",
    )

    def _auto_init(self):
        if not column_exists(self.env.cr, 'res_partner', 'l10n_gr_edi_branch_number'):
            create_column(self.env.cr, 'res_partner', 'l10n_gr_edi_branch_number', 'int4')
        return super()._auto_init()

    @api.depends('country_code')
    def _compute_l10n_gr_edi_branch_number(self):
        for partner in self:
            if partner.country_code == 'GR':
                partner.l10n_gr_edi_branch_number = partner.l10n_gr_edi_branch_number or 0
            else:
                partner.l10n_gr_edi_branch_number = False
