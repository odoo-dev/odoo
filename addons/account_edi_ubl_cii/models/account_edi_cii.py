from odoo import models
from odoo.tools import float_repr

from datetime import datetime


class AccountEdiCii(models.AbstractModel):
    _name = "account.edi.cii"
    _inherit = 'account.edi.common'
    _description = "Base helpers for CII"

    def _cii_format_date(self, dt):
        """ Format the date in the CII standard. """
        dt = dt or datetime.now()
        return dt.strftime('%Y%m%d')

    def _cii_format_monetary(self, number, decimal_places=2):
        """ CII requires the monetary values to be rounded to 2 decimal values. """
        return float_repr(number, decimal_places)

    def _cii_turn_price_unit_positive(self, base_line):
        """
        Turn the unit_price positive and the quantity negative of the base_line when negative unit_price.
        [BR-27]-The Item net price (BT-146) shall NOT be negative.
        [BR-28]-The Item gross price (BT-148) shall NOT be negative.

        :param base_line: The base line of the item.
        """
        if base_line['price_unit'] < 0.0:
            base_line['quantity'] *= -1
            base_line['price_unit'] *= -1

    def _cii_extract_cash_rounding_lines(self, vals):
        """
        Extract the cash rounding lines for the 'add_invoice_line' cash rounding strategy.

        :param vals: Some custom data
        """
        base_lines = vals['base_lines']
        vals['base_lines'] = [base_line for base_line in base_lines if base_line['special_type'] != 'cash_rounding']
        vals['cash_rounding_base_lines'] = [base_line for base_line in base_lines if base_line['special_type'] == 'cash_rounding']

    def _cii_extract_early_pay_discount_lines(self, vals):
        """
        Extract the early payment discount lines.

        :param vals: Some custom data
        """
        base_lines = vals['base_lines']
        vals['base_lines'] = [base_line for base_line in base_lines if base_line['special_type'] != 'early_payment']
        vals['early_payment_discount_lines'] = [base_line for base_line in base_lines if base_line['special_type'] == 'early_payment']

    def _cii_constraints(self, invoice, vals):
        constraints = {}
        self._cii_check_seller(invoice, vals, constraints)
        self._cii_check_buyer(vals, constraints)
        self._cii_check_one_tax_per_line(invoice, vals, constraints)

        if vals['intracom_delivery']:
            self._cii_check_intracom_delivery(vals, constraints)

        if vals['invoice']['partner_id']['country_id']['code'] == 'ES' \
            and vals['invoice']['partner_id']['zip'] \
            and vals['invoice']['partner_id']['zip'][:2] in ['35', '38']:
            self._cii_check_igi_tax_rate(invoice, vals, constraints)

        return constraints

    def _cii_check_seller(self, invoice, vals, constraints):
        self._cii_check_invoice_payment_instructions(invoice, vals, constraints)
        self._cii_check_seller_postal_address(vals, constraints)
        self._cii_check_seller_identifier(vals, constraints)
        self._cii_check_seller_contact(vals, constraints)

    def _cii_check_buyer(self, vals, constraints):
        self._cii_check_buyer_postal_address(vals, constraints)

    def _cii_check_invoice_payment_instructions(self, invoice, vals, constraints):
        """
        [BR-DE-1] An Invoice must contain information on "PAYMENT INSTRUCTIONS" (BG-16).
        First check that a partner_bank_id exists, then check that there is an account number.
        """
        if invoice.move_type == 'out_invoice':
            constraints.update({
                'seller_payment_instructions_1': self._check_required_fields(
                    vals['invoice'], 'partner_bank_id'
                ),
                'seller_payment_instructions_2': self._check_required_fields(
                    vals['invoice']['partner_bank_id'], 'sanitized_acc_number',
                    self.env._("The field 'Sanitized Account Number' is required on the Recipient Bank.")
                ),
            })

    def _cii_check_seller_postal_address(self, vals, constraints):
        """
        [BR-08]-An Invoice shall contain the Seller postal address (BG-5).
        [BR-09]-The Seller postal address (BG-5) shall contain a Seller country code (BT-40).
        """
        constraints.update({
            'seller_postal_address': self._check_required_fields(
            vals['invoice']['company_id']['partner_id']['commercial_partner_id'], 'country_id'
            ),
        })

    def _cii_check_seller_identifier(self, vals, constraints):
        """
        [BR-CO-26]-In order for the buyer to automatically identify a supplier, the Seller identifier (BT-29),
        the Seller legal registration identifier (BT-30) and/or the Seller VAT identifier (BT-31) shall be present.
        """
        constraints.update({
            'seller_identifier': self._check_required_fields(
                vals['invoice']['company_id'], ['vat']
            ),
        })

    def _cii_check_seller_contact(self, vals, constraints):
        """
        [BR-DE-6] The element "Seller contact telephone number" (BT-42) must be transmitted.
        [BR-DE-7] The element "Seller contact email address" (BT-43) must be transmitted.
        """
        constraints.update({
            'seller_phone': self._check_required_fields(
                vals['invoice']['company_id']['partner_id']['commercial_partner_id'], ['phone', 'mobile'],
            ),
            'seller_email': self._check_required_fields(
                vals['invoice']['company_id'], 'email'
            ),
        })

    def _cii_check_buyer_postal_address(self, vals, constraints):
        """
        [BR-10]-An Invoice shall contain the Buyer postal address (BG-8).
        [BR-11]-The Buyer postal address shall contain a Buyer country code (BT-55).
        """
        constraints.update({
            'buyer_postal_address': self._check_required_fields(
                vals['invoice']['commercial_partner_id'], 'country_id'
            ),
        })

    def _cii_check_one_tax_per_line(self, invoice, vals, constraints):
        """
        Element 'ram:ApplicableTradeTax' must occur exactly 1 times
        Each invoice line must have one and only one tax
        """
        for line in invoice.invoice_line_ids.filtered(lambda x: x.display_type not in ('line_note', 'line_section')):
            if len(line.tax_ids.flatten_taxes_hierarchy().filtered(lambda t: t.amount_type != 'fixed')) != 1:
                constraints.update({
                    'one_tax_per_line': self.env._("Each invoice line shall have one and only one tax."),
                })

    def _cii_check_intracom_delivery(self, vals, constraints):
        """
        [BR-IC-02]-An Invoice that contains an Invoice line (BG-25) where the Invoiced item VAT category code (BT-151)
        is "Intra-community supply" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative
        VAT identifier (BT-63) and the Buyer VAT identifier (BT-48).
        """
        constraints.update({
            'intracom_seller_vat': self._check_required_fields(
                vals['invoice']['company_id'], 'vat'
            ),
            'intracom_buyer_vat': self._check_required_fields(
                vals['invoice']['commercial_partner_id'], 'vat'
            ),
        })

    def _cii_check_igi_tax_rate(self, invoice, vals, constraints):
        for line in invoice.invoice_line_ids.filtered(lambda x: x.display_type not in ('line_note', 'line_section')):
            tax_rate_list = line.tax_ids.flatten_taxes_hierarchy().mapped("amount")
            if not any(rate > 0 for rate in tax_rate_list):
                constraints.update({
                    'igic_tax_rate': self.env._("When the Canary Island General Indirect Tax (IGIC) applies, the tax rate on "
                         "each invoice line should be greater than 0."),
                })
