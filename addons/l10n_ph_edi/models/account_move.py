# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import hashlib
import hmac
import random
import re

from odoo import fields, models, api, Command
from odoo.addons.l10n_ph_edi.tools.helpers import _request_eis, _encrypt_aes256, _decrypt_aes256, _sign_jws_hs256
from odoo.tools import format_datetime
from odoo.tools.misc import split_every

# Holds the maximum amount of invoices that can be sent in a single submission. Should most likely not change.
# Using a constant makes it easy to patch during testing to avoid needing to create 100+ invoices.
SUBMISSION_MAX_SIZE = 100


class AccountMove(models.Model):
    """ One invoice in Odoo can represent up to three invoice on the EIS system, due to how VAT categories are handled.
    VATable lines, VAT exempt lines and zero-rated lines must be invoices separately.

    We will thus generate up to three file for each invoice and send them if needed.
    """
    _inherit = 'account.move'

    # ------------------
    # Fields declaration
    # ------------------

    eis_document_ids = fields.Many2many(
        comodel_name='eis.document',
    )

    # ----------------
    # Business methods
    # ----------------

    def _l10n_ph_edi_check_invoice_configuration(self):
        self.ensure_one()
        errors = []

        invoice_lines = self.invoice_line_ids.filtered(lambda l: l.display_type not in ('line_note', 'line_section'))
        for line in invoice_lines:
            if any(tax for tax in line.tax_ids if tax.amount == 0) and any(tax for tax in line.tax_ids if tax.amount != 0):
                errors.append(line.env._('Line "%(line_name)s" cannot contains both Zero Rated and non Zero Rated taxes.', line.display_name))

        if not self.partner_id.commercial_partner_id.vat:
            errors.append(self.env._('The TIN number of the commercial partner %(partner_name) is required.', partner_name=self.partner_id.commercial_partner_id.name))

        return errors

    def _generate_eis_documents(self):
        """ Generate one or more EIS documents for the invoice in self, depending on its tax configuration. """
        self.ensure_one()
        document_vals = []
        # We start by splitting the invoice lines based on their VAT
        invoice_lines = self.invoice_line_ids.filtered(lambda line: line.display_type not in ('line_note', 'line_section'))
        vatable_lines = invoice_lines.filtered(lambda line: line.tax_ids and all(tax.amount != 0 for tax in line.tax_ids))
        zero_rated_lines = invoice_lines.filtered(lambda line: line.tax_ids and all(tax.amount == 0 for tax in line.tax_ids))
        vat_exempt_lines = invoice_lines.filtered(lambda line: not line.tax_ids)
        for transaction_class, lines in [("01", vatable_lines), ("02", zero_rated_lines), ("03", vat_exempt_lines)]:
            if not lines:
                continue

            document_vals.append({
                'eis_transaction_class': transaction_class,
                'name': self.name,
                'date': self.invoice_date,
                'company_id': self.company_id.id,
                'partner_id': self.partner_id.id,
                'currency_id': self.currency_id.id,  # todo company curr
                'eis_document_lines': [Command.create({
                    'name': line.product_id.name or line.name,
                    'description': line.product_id.description_sale or '',
                    'quantity': line.quantity,
                    'uom_id': line.product_uom_id.id,  # todo save the ref instead
                    'unit_price': line.price_unit,  # todo In company currency
                    'regular_discount': line.discount,  # todo In company currency, value not %
                }) for line in lines]
            })
        self.eis_document_ids |= self.env['eis.document'].create(document_vals)

    @api.model
    def _l10n_ph_edi_send_invoices(self, json_contents_per_company):
        """ Prepare and submit the invoices to the EIS.
        A single submission can contain at most 100 invoices.
        """
        errors = {}
        for company, company_json_contents in json_contents_per_company.items():
            # todo doesn't work, will split every 100 moves and not json
            for test in split_every(SUBMISSION_MAX_SIZE, company_json_contents):
                # We get the auth token first.
                # /!\ if expired, it will get a new one which also updates the session key. So it needs to be done before the hmac.
                auth_token = company._l10n_ph_edi_get_auth_token()
                now = format_datetime(self.env, fields.Datetime.now(), dt_format='yyyyMMddHHmmss')
                h = hmac.new(base64.b64decode(company.l10n_ph_edi_auth_session_key), f'{now}POST/api/invoices'.encode(), digestmod=hashlib.sha256)
                # We generate the submission id ourselves and store it per batch, according to their instruction.
                submission_date = fields.Date.now().strftime("%Y%m%d")
                submission_id = f"{company.l10n_ph_edi_accreditation_id}-{submission_date}-{'%012x' % random.getrandbits(12 * 4)}"
                moves.l10n_ph_edi_submission_id = submission_id
                # We transform the data in JWS format
                signed_json_contents = [_sign_jws_hs256(
                    json_content,
                    company.l10n_ph_edi_eis_jws_private_key.encode('utf-8'),
                    headers={"kid": company.l10n_ph_edi_eis_jws_key}
                ) for json_content in json_contents]
                # multi invoice data are separated by commas.
                data = ','.join(signed_json_contents)
                # Encrypt the data with AES256 using the Session Secret Key
                encrypted_payload = _encrypt_aes256(data, company.l10n_ph_edi_auth_session_key)
                response, error_message = _request_eis(
                    env=self.env,
                    method='POST',
                    endpoint='/api/invoices',
                    headers={
                        'accreditationId': company.l10n_ph_edi_accreditation_id,
                        'applicationId': company.l10n_ph_edi_application_id,
                        'authToken': auth_token,
                        'authorization': f"Bearer {h.hexdigest()}",
                        'datetime': now,
                    },
                    json_data={
                        'submitId': submission_id,
                        'data': base64.b64encode(encrypted_payload),
                    },
                )
                if error_message:
                    errors.update({
                        move: error_message for move in moves
                    })
                    continue

                # The response we receive is encrypted with the session secret key.
                response_data = _decrypt_aes256(response['data'], company.l10n_ph_edi_auth_session_key)
                # Tagging the entry as sent and leaving a message for the user is enough for now.
                moves.l10n_ph_edi_invoice_state = 'sent'
                moves._message_log_batch(
                    bodies={move.id: move.env._(
                        'This entry has been transmitted to the EIS.\n'
                        '%(description)s\n'
                        'Once the registration is done, the invoice will be automatically updated.\n'
                        'Acknowledgement ID: "%(acknowledgement_id)s".',
                        description=response_data['description'],
                        acknowledgement_id=response_data['ackId'],
                    ) for move in moves}
                )
                if self._can_commit():
                    self._cr.commit()
