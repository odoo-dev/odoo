from odoo import api, fields, models

ADJUSTMENT_REASONS = [
    ("BR-KSA-17-reason-1", "Cancellation or suspension of the supplies after its occurrence either wholly or partially"),
    ("BR-KSA-17-reason-2", "In case of essential change or amendment in the supply, which leads to the change of the VAT due"),
    ("BR-KSA-17-reason-3", "Amendment of the supply value which is pre-agreed upon between the supplier and consumer"),
    ("BR-KSA-17-reason-4", "In case of goods or services refund"),
    ("BR-KSA-17-reason-5", "In case of change in Seller's or Buyer's information"),
]


class ZatcaMixin(models.AbstractModel):
    """The point of this class is to hold common properties between models that should be sent to zatca"""
    _name = "zatca.mixin"
    _description = "ZATCA Mixin"

    l10n_sa_show_reason = fields.Boolean(compute="_compute_show_l10n_sa_reason")
    l10n_sa_reason = fields.Selection(string="ZATCA Reason", selection=ADJUSTMENT_REASONS, copy=False)
    l10n_sa_qr_code_str = fields.Char(string='ZATCA QR Code', compute='_compute_qr_code_str', compute_sudo=True)
    l10n_sa_confirmation_datetime = fields.Datetime(string='Confirmation Date',
                                                    readonly=True,
                                                    copy=False,
                                                    help="""Date when the invoice is confirmed and posted.
                                                    In other words, it is the date on which the invoice is generated as final document (after securing all internal approvals).""")

    def _get_show_l10n_sa_reason_dependencies(self):
        return []
    
    def _get_qr_code_str_dependencies(self):
        return []

    def _get_show_l10n_sa_reason(self):
        return None
    
    def _get_l10n_sa_qr_code_str(self, values):
        return ""

    def _l10n_sa_is_simplified(self):
        """
            Returns True if the customer is an individual, i.e: The invoice is B2C
        :return:
        """
        self.ensure_one()
        return False

    @api.depends(lambda self: self._get_qr_code_str_dependencies())
    def _compute_qr_code_str(self):
        for record in self:
            # depends on whether it's simplified or not
            record.l10n_sa_qr_code_str = record._get_l10n_sa_qr_code_str()

    @api.depends(lambda self: self._get_show_l10n_sa_reason_dependencies())
    def _compute_show_l10n_sa_reason(self):
        for record in self:
            record.l10n_sa_show_reason = record._get_show_l10n_sa_reason()
            # record.l10n_sa_show_reason = record.country_code == 'SA' and (record.move_type == 'out_refund' or (record.move_type == 'out_invoice' and record.debit_origin_id))
