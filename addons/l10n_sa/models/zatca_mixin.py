import base64

from odoo import api, fields, models
from odoo.tools import float_repr

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

    def _get_l10n_sa_totals(self):
        return {}

    def _l10n_sa_build_phase_1_qr(self):
        """
        Generate the qr code (Phase 1) for Saudi e-invoicing. Specs are available at the following link at page 23
        https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20210528_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vShared.pdf
        """
        self.ensure_one()

        def get_qr_encoding(tag, field):
            company_name_byte_array = field.encode()
            company_name_tag_encoding = tag.to_bytes(length=1, byteorder='big')
            company_name_length_encoding = len(company_name_byte_array).to_bytes(length=1, byteorder='big')
            return company_name_tag_encoding + company_name_length_encoding + company_name_byte_array

        seller_name_enc = get_qr_encoding(1, self.company_id.display_name)
        company_vat_enc = get_qr_encoding(2, self.company_id.vat)
        time_sa = fields.Datetime.context_timestamp(self.with_context(tz='Asia/Riyadh'), self.l10n_sa_confirmation_datetime)
        timestamp_enc = get_qr_encoding(3, time_sa.strftime(self._get_iso_format_asia_riyadh_date('T')))
        totals = self._get_l10n_sa_totals()
        invoice_total_enc = get_qr_encoding(4, float_repr(abs(totals['total_amount']), 2))
        total_vat_enc = get_qr_encoding(5, float_repr(abs(totals['total_tax']), 2))

        str_to_encode = seller_name_enc + company_vat_enc + timestamp_enc + invoice_total_enc + total_vat_enc

        return base64.b64encode(str_to_encode).decode()

    def _l10n_sa_build_phase_2_qr(self):
        return ""

    def _l10n_sa_is_simplified(self):
        """
            Returns True if the customer is an individual, i.e: The invoice is B2C
        :return:
        """
        self.ensure_one()
        return not self.partner_id.vat

    def _compute_qr_code_str(self):
        phase_1_records = self.filtered(lambda rec: rec._l10n_sa_is_phase_1_applicable())
        phase_2_records = self.filtered(lambda rec: rec._l10n_sa_is_phase_2_applicable())
        for record in phase_1_records:
            record.l10n_sa_qr_code_str = record._l10n_sa_build_phase_1_qr()
        for record in phase_2_records:
            record.l10n_sa_qr_code_str = record._l10n_sa_build_phase_2_qr()

    @api.depends(lambda self: self._get_show_l10n_sa_reason_dependencies())
    def _compute_show_l10n_sa_reason(self):
        for record in self:
            record.l10n_sa_show_reason = record._get_show_l10n_sa_reason()
            # record.l10n_sa_show_reason = record.country_code == 'SA' and (record.move_type == 'out_refund' or (record.move_type == 'out_invoice' and record.debit_origin_id))

    def _l10n_sa_is_phase_1_applicable(self):
        self.ensure_one()
        return self.country_code == 'SA' and self.l10n_sa_confirmation_datetime and self.company_id.vat

    def _l10n_sa_is_phase_2_applicable(self):
        return False

    def _get_iso_format_asia_riyadh_date(self, separator=' '):
        return f'%Y-%m-%d{separator}%H:%M:%S'
