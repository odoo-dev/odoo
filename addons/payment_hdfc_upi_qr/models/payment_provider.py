import logging
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)

class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(
        selection_add=[('hdfc_upi', 'HDFC UPI')],
        ondelete={'hdfc_upi': 'set default'}
    )
    
    hdfc_upi_merchant_id = fields.Char(
        string="HDFC UPI Merchant ID",
        help="The merchant ID provided by HDFC Bank for UPI integration.",
        required_if_provider='hdfc_upi',
        groups='base.group_system'
    )
    hdfc_upi_merchant_name = fields.Char(
        string="HDFC UPI Merchant Name",
        help="The merchant name to be displayed in UPI apps.",
        required_if_provider='hdfc_upi',
    )
    hdfc_upi_merchant_category = fields.Char(
        string="HDFC UPI Merchant Category Code",
        help="The merchant category code (MCC) provided by HDFC Bank.",
        default="0000",
        required_if_provider='hdfc_upi',
    )
    hdfc_upi_encryption_key = fields.Char(
        string="HDFC UPI Encryption Key",
        help="The encryption key provided by HDFC Bank for secure communication.",
        required_if_provider='hdfc_upi',
        groups='base.group_system'
    )
    hdfc_upi_qr_expiry_time = fields.Integer(
        string="QR Code Expiry Time (minutes)",
        help="Time in minutes after which the QR code will expire.",
        default=5,
        required_if_provider='hdfc_upi',
    )
    
    # Use l10n_in_upi_id from res.company via company_id
    @api.constrains('company_id')
    def _check_l10n_in_upi_id(self):
        for provider in self:
            if provider.code == 'hdfc_upi' and provider.state != 'disabled':
                upi_id = provider.company_id.l10n_in_upi_id
                if not upi_id:
                    raise ValidationError(_("UPI VPA is required for HDFC UPI provider (from company UPI Id)."))
                if '@' not in upi_id:
                    raise ValidationError(_("UPI VPA must be in the format 'username@provider' (from company UPI Id)."))

    @api.constrains('hdfc_upi_qr_expiry_time')
    def _check_hdfc_upi_qr_expiry_time(self):
        for provider in self:
            if provider.code == 'hdfc_upi' and provider.hdfc_upi_qr_expiry_time <= 0:
                raise ValidationError(_("QR Code Expiry Time must be greater than 0 minutes"))
    
    def _get_default_payment_method_codes(self):
        """ Return the default payment methods for this provider. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code == 'hdfc_upi':
            default_codes = {'upi_qr'}
        return default_codes
    
    def _should_build_inline_form(self, is_validation=False):
        """ Override to specify that inline forms are used for HDFC UPI. """
        if self.code == 'hdfc_upi':
            return True
        return super()._should_build_inline_form(is_validation=is_validation)

    # def _get_redirect_form_view(self, is_validation=False):
    #     """ Return the view of the redirect form.
        
    #     Note: This method must return a view record, not a string.
        
    #     :param bool is_validation: Whether the operation is a validation operation
    #     :return: The redirect form view
    #     :rtype: recordset of `ir.ui.view`
    #     """
    #     if self.code == 'hdfc_upi':
    #         return self.env.ref('payment_hdfc_upi_qr.payment_hdfc_upi_redirect_form')
    #     return super()._get_redirect_form_view(is_validation=is_validation)
    
    def _get_validation_amount(self):
        """ Return the amount to use for validation operations. """
        self.ensure_one()
        if self.code == 'hdfc_upi':
            return 1.0  # Use a small amount for validation
        return super()._get_validation_amount()
    
    def _get_validation_currency(self):
        """ Return the currency to use for validation operations. """
        self.ensure_one()
        if self.code == 'hdfc_upi':
            return self.env.ref('base.INR')  # UPI only supports INR
        return super()._get_validation_currency()
    
    def _compute_feature_support_fields(self):
        """ Specify the features supported by the HDFC UPI provider. """
        super()._compute_feature_support_fields()
        if self.code == 'hdfc_upi':
            self.support_refund = 'partial'
            self.support_tokenization = False
            self.support_express_checkout = False

    def _check_required_if_provider(self):
        """ Check required fields based on provider code. """
        super()._check_required_if_provider()
        for provider in self.filtered(lambda p: p.code == 'hdfc_upi' and p.state != 'disabled'):
            if not provider.hdfc_upi_merchant_id:
                raise ValidationError(_("Merchant ID is required for HDFC UPI provider"))
            if not provider.hdfc_upi_merchant_name:
                raise ValidationError(_("Merchant Name is required for HDFC UPI provider"))
            upi_id = provider.company_id.l10n_in_upi_id
            if not upi_id:
                raise ValidationError(_("UPI VPA is required for HDFC UPI provider (from company UPI Id)."))
            if not provider.hdfc_upi_encryption_key:
                raise ValidationError(_("Encryption Key is required for HDFC UPI provider"))
