import logging
import zoneinfo
import re

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import SQL

from odoo.addons.l10n_hr_edi.tools.api import (
    _mer_api_mark_paid,
    _mer_api_query_document_process_status_inbox,
    _mer_api_query_document_process_status_outbox,
    _mer_api_update_document_process_status,
    _mer_api_check_fiscalization_status_outbox,
    _mer_api_check_fiscalization_status_inbox,
    MojEracunServiceError,
)

_logger = logging.getLogger(__name__)


class AccountMove(models.Model):
    _inherit = 'account.move'

    # Fields required for correctly generating CIUS HR documents
    l10n_hr_process_type = fields.Selection(
        [
            ('P1', "P1: Issuing invoices for deliveries of goods and services according to purchase orders, based on contracts"),
            ('P2', "P2: Periodic invoicing for deliveries of goods and services based on contracts"),
            ('P3', "P3: Issuing invoices for delivery according to an independent purchase order"),
            ('P4', "P4: Prepayment (advance payment)"),
            ('P5', "P5: Payment on the spot (Sport payment)"),
            ('P6', "P6: Payment before delivery, based on purchase order"),
            ('P7', "P7: Issuing invoices with references to the delivery note"),
            ('P8', "P8: Issuing invoices with references to the shipping and receipt notes"),
            ('P9', "P9: Credits or invoices with negative amounts, issued for various reasons, including empty returns packaging"),
            ('P10', "P10: Issuing a corrective invoice (reversal/correction of invoice)"),
            ('P11', "P11: Issuing partial and final invoices"),
            ('P12', "P12: Self-issuance of invoice"),
            ('P99', "P99: Customer-defined process"),
        ],
        string="Business Process Type",
        compute='_compute_l10n_hr_process_type',
        store=True,
        readonly=False,
        copy=False,
        init_storage=lambda model: None,
    )
    l10n_hr_customer_defined_process_name = fields.Char(
        string="Custom Process Name",
        help="Required when Process Type is P99. Specify the name of your custom business process. "
            "This will appear in the UBL as P99:YourProcessName",
    )
    l10n_hr_fiscal_user_id = fields.Many2one(
        comodel_name="res.partner",
        string="Fiscal User",
        domain=lambda self: self._get_l10n_hr_fiscal_user_id_domain(),
    )
    l10n_hr_operator_name = fields.Char(string="Operator Label", related='l10n_hr_fiscal_user_id.name')
    l10n_hr_operator_oib = fields.Char(string="Operator OIB", related='l10n_hr_fiscal_user_id.l10n_hr_personal_oib')
    # Additional fields
    l10n_hr_edi_addendum_id = fields.One2many(comodel_name='l10n_hr_edi.addendum', inverse_name='move_id', string='HR EDI Addendum', copy=False)
    l10n_hr_invoice_sending_time = fields.Datetime(related='l10n_hr_edi_addendum_id.invoice_sending_time')
    # EDI and fiscalization-specific fields
    l10n_hr_business_document_status = fields.Selection(related='l10n_hr_edi_addendum_id.business_document_status')
    l10n_hr_business_status_reason = fields.Char(related='l10n_hr_edi_addendum_id.business_status_reason')
    l10n_hr_fiscalization_number = fields.Char(related='l10n_hr_edi_addendum_id.fiscalization_number')
    l10n_hr_fiscalization_status = fields.Selection(related='l10n_hr_edi_addendum_id.fiscalization_status', readonly=False)
    l10n_hr_fiscalization_error = fields.Char(related='l10n_hr_edi_addendum_id.fiscalization_error', readonly=False)
    l10n_hr_fiscalization_request = fields.Char(related='l10n_hr_edi_addendum_id.fiscalization_request')
    l10n_hr_fiscalization_channel_type = fields.Selection(related='l10n_hr_edi_addendum_id.fiscalization_channel_type')
    # Payment reporting
    l10n_hr_payment_reported_amount = fields.Monetary(
        related='l10n_hr_edi_addendum_id.payment_reported_amount',
        currency_field='currency_id',
    )
    l10n_hr_payment_unreported = fields.Boolean(compute='_compute_l10n_hr_payment_unreported', search='_search_l10n_hr_payment_unreported')
    l10n_hr_payment_method_type = fields.Selection(related='l10n_hr_edi_addendum_id.payment_method_type', readonly=False, store=True)
    # MojEracun integration fields
    l10n_hr_mer_document_eid = fields.Char(related='l10n_hr_edi_addendum_id.mer_document_eid')
    l10n_hr_mer_document_status = fields.Selection(related='l10n_hr_edi_addendum_id.mer_document_status')

    # B2C Fiscalization Fields
    l10n_hr_fiscalization_jir = fields.Char(related="l10n_hr_edi_addendum_id.fiscalization_jir", readonly=False, store=True)
    l10n_hr_fiscalization_zki = fields.Char(related="l10n_hr_edi_addendum_id.fiscalization_zki", readonly=False, store=True)

    # Change Invoice data fields
    l10n_hr_fiscalization_old_recipient_oib = fields.Char(string="Old Personal OIB")
    l10n_hr_old_payment_method_type = fields.Char(string="Old Payment Method")
    l10n_hr_fiscalization_payment_method_change_date = fields.Datetime(related="l10n_hr_edi_addendum_id.fiscalization_payment_method_change_date")

    @api.depends('l10n_hr_edi_addendum_id.payment_reported_amount', 'amount_residual', 'amount_total')
    def _compute_l10n_hr_payment_unreported(self):
        for move in self:
            move.l10n_hr_payment_unreported = move.l10n_hr_payment_reported_amount != (move.amount_total - move.amount_residual)

    def _search_l10n_hr_payment_unreported(self, operator, value):
        # A specific override to enable the "Has unreported payments" filter on the list view
        if operator == '!=':
            query = self._search([])
            query.join('account_move', 'id', 'l10n_hr_edi_addendum', 'move_id', 'addendum')
            query.add_where(SQL("""ROUND(%(payment_reported_amount)s - %(amount_total)s + %(amount_residual)s, 8) != 0""",
                payment_reported_amount=self.env['l10n_hr_edi.addendum']._field_to_sql('account_move__addendum', 'payment_reported_amount', query),
                amount_total=self._field_to_sql('account_move', 'amount_total', query),
                amount_residual=self._field_to_sql('account_move', 'amount_residual', query),
            ))
            return [('id', 'in', query)]
        return []

    @api.constrains('move_type', 'l10n_hr_process_type')
    def _check_l10n_hr_process_type(self):
        for record in self:
            if record.country_code != 'HR':
                continue
            if record.move_type != 'out_refund' and record.l10n_hr_process_type == 'P9':
                raise ValidationError(self.env._('Business Process Type P9 can only be used with credit notes.'))
            if record.move_type == 'out_refund' and record.l10n_hr_process_type not in ('P9', 'P10'):
                raise ValidationError(self.env._('Credit notes must use Business Process Type P9 or P10.'))

    @api.depends('l10n_hr_fiscalization_status')
    def _compute_show_reset_to_draft_button(self):
        # EXTENDS 'account'
        super()._compute_show_reset_to_draft_button()
        for move in self:
            if move.l10n_hr_fiscalization_status:
                move.show_reset_to_draft_button = False

    @api.depends('move_type', 'l10n_hr_process_type')
    def _compute_l10n_hr_process_type(self):
        for move in self:
            if not move.l10n_hr_process_type:
                if move.move_type == 'out_refund':
                    move.l10n_hr_process_type = 'P9'
                elif move.move_type == 'out_invoice':
                    move.l10n_hr_process_type = 'P1'

    def _get_l10n_hr_fiscalization_number(self, name):
        """
        Extract the fiscal numbering triple (ex. 1/1/1) from the document name.
        Only applies for Croatian sales invoices/credit notes. Expected name
        pattern is produced by the overridden `sequence.mixin` logic.
        """
        name_regex = r'.*?(?P<seq>\d+)/(?P<premises_label>[a-zA-Z0-9]+)/(?P<device_label>\d+)'
        if match := re.match(name_regex, name):
            return f"{int(match.group('seq'))}/{match.group('premises_label')}/{match.group('device_label')}"
        else:
            return False

    def _get_l10n_hr_fiscal_user_id_domain(self):
        internal_users = self.env.ref('base.group_user')
        domain = [('user_ids', 'in', internal_users.user_ids.ids)]
        return domain

    @api.model
    def UNUSED_get_ubl_cii_builder_from_xml_tree(self, tree):
        customization_id = tree.find('{*}CustomizationID')
        if customization_id is not None:
            if customization_id.text == 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0':
                return self.env['account.edi.xml.ubl_hr']
        return super()._get_ubl_cii_builder_from_xml_tree(tree)

    def _get_import_file_type(self, file_data):
        """ Identify CIUS HR files. """
        # EXTENDS 'account'
        if (
            file_data['xml_tree'] is not None
            and (ubl_profile := file_data['xml_tree'].findtext('{*}CustomizationID'))
            and ubl_profile == 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0'
        ):
            return 'account.edi.xml.ubl_hr'

        return super()._get_import_file_type(file_data)

    def _get_invoice_reference_odoo_invoice(self):
        """
        Override to propose a structured reference for HR domestic flows.
        When the company and partner are both in Croatia and the invoice has a
        computed fiscalization number, return a reference like:
          "HR00 {BrOznRacOznPosPrOznNapUr}"
        where slashes are removed per Croatian banking conventions.
        """
        self.ensure_one()
        # Check if invoice has fiscalization number, company is in Croatia, and partner is in Croatia
        if self.company_id.country_code == 'HR' and self.partner_id.country_code == 'HR':
            fisc_num_hr_format = re.sub(r'\D', '', self._get_l10n_hr_fiscalization_number(self.name))
            return "HR00 " + fisc_num_hr_format
        else:
            return super()._get_invoice_reference_odoo_invoice()

    def _post(self, soft=True):
        for move in self:
            if move.country_code == 'HR' and move.is_sale_document():
                if not move.l10n_hr_fiscal_user_id:
                    move.l10n_hr_fiscal_user_id = move.env.user.partner_id
            if move.l10n_hr_mer_document_eid and move.is_purchase_document():
                if move.l10n_hr_business_document_status == '1':
                    raise UserError(self.env._("This vendor bill is already rejected according to the Tax Authority."))
                elif move.l10n_hr_business_document_status in ('4', '99'):
                    _mer_api_update_document_process_status(
                        move.company_id,
                        move.l10n_hr_mer_document_eid,
                        0,
                    )
                    move.l10n_hr_edi_addendum_id.business_document_status = '0'
                    _logger.info("Document eID %s reported as approved by recepient.", move.l10n_hr_mer_document_eid)
        return super()._post(soft=soft)

    def l10n_hr_edi_mer_action_reject(self):
        self.ensure_one()
        return {
            'name': self.env._("Reject MojEracun invoice"),
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_model': 'l10n_hr_edi.mojeracun_reject_wizard',
            'target': 'new',
            'context': {
                'active_model': 'account.move',
                'active_ids': self.ids,
            },
        }

    def l10n_hr_edi_mer_action_fetch_status(self):
        """
        Fetch and update the status of a single document on MojEracun.
        """
        self.ensure_one()
        if self.is_sale_document():
            response_mer = _mer_api_query_document_process_status_outbox(self.company_id, electronic_id=self.l10n_hr_mer_document_eid)[0]
            response_fisc = _mer_api_check_fiscalization_status_outbox(self.company_id, electronic_id=self.l10n_hr_mer_document_eid)
            if isinstance(response_fisc, list):
                response_fisc = {} if len(response_fisc) == 0 else response_fisc[0]
        elif self.is_purchase_document():
            response_mer = _mer_api_query_document_process_status_inbox(self.company_id, electronic_id=self.l10n_hr_mer_document_eid)[0]
            response_fisc = _mer_api_check_fiscalization_status_inbox(self.company_id, electronic_id=self.l10n_hr_mer_document_eid)
            if isinstance(response_fisc, list):
                response_fisc = {} if len(response_fisc) == 0 else response_fisc[0]
        else:
            return
        write_dict = {
            'mer_document_status': str(response_mer.get('StatusId')),
            'business_document_status': str(response_mer.get('DocumentProcessStatusId')),
        }
        if response_fisc:
            write_dict.update({
                'fiscalization_status': str(response_fisc['messages'][-1].get('status')),
                'fiscalization_error': str(response_fisc['messages'][-1].get('errorCode') + ' - ' + response_fisc['messages'][-1].get('errorCodeDescription')),
                'fiscalization_request': str(response_fisc['messages'][-1].get('fiscalizationRequestId')),
                'business_status_reason': str(response_fisc['messages'][-1].get('businessStatusReason')),
                'fiscalization_channel_type': str(response_fisc.get('channelType')),
            })
        self.l10n_hr_edi_addendum_id.write(write_dict)

    def l10n_hr_edi_mer_action_report_paid(self):
        batch = len(self) != 1
        for move in self:
            if not move.l10n_hr_mer_document_eid:
                continue
            state_to_set = {'partial': '3', 'paid': '2'}.get(move.payment_state)
            amount_to_report = (move.amount_total - move.amount_residual) - move.l10n_hr_payment_reported_amount
            if amount_to_report and state_to_set:
                try:
                    response = _mer_api_mark_paid(
                        move.company_id,
                        move.l10n_hr_mer_document_eid,
                        fields.Datetime.now(zoneinfo.ZoneInfo('Europe/Zagreb')).strftime('%Y-%m-%dT%H:%M:%S'),
                        amount_to_report,
                        move.l10n_hr_payment_method_type,
                    )
                except MojEracunServiceError:
                    if batch:
                        _logger.error("Failed to report payments document: %s", move.l10n_hr_mer_document_eid)
                        continue
                    else:
                        raise
                move.l10n_hr_edi_addendum_id.payment_reported_amount += amount_to_report
                move.l10n_hr_edi_addendum_id.fiscalization_request = response.get('fiscalizationRequestId')
                if response.get('encodedXml'):
                    attachment = self.env["ir.attachment"].create(
                        {
                            "name": f"mojeracun_{response['electronicId']}_payment.xml",
                            "raw": response['encodedXml'],
                            "type": "binary",
                            "mimetype": "application/xml",
                        }
                    )
                    attachment.write({'res_model': 'account.move', 'res_id': move.id})
                else:
                    attachment = False
                move._message_log(
                    body=self.env._(
                        "%(ts)s: Payments for eRacun document (ElectroicId: %(eid)s) in the amount of %(mnt)s EUR has been reported successfully. (Request ID: %(req_id)s)",
                        ts=response['fiscalizationTimestamp'],
                        eid=move.l10n_hr_mer_document_eid,
                        mnt=amount_to_report,
                        req_id=response['fiscalizationRequestId'],
                    ),
                    attachment_ids=attachment.ids if attachment else False,
                )
                _mer_api_update_document_process_status(
                    move.company_id,
                    move.l10n_hr_mer_document_eid,
                    state_to_set,
                )
                move.l10n_hr_edi_addendum_id.business_document_status = state_to_set

    @api.ondelete(at_uninstall=False)
    def _l10n_hr_fiscalization_unlink_except_fiscalized(self):
        """Prevent deleting fiscalized moves unless explicitly forced.

        Uses context key `force_delete` for exceptional administrative flows.
        """
        if not self.env.context.get('force_delete') and any(m.l10n_hr_fiscalization_status == '0' for m in self):
            raise UserError(self.env._('You cannot delete a move that has been fiscalized.'))

    def _l10n_hr_get_fiscalization_qr_code(self):
        """Generate the Croatian fiscalization QR URL.

        Spec per Croatian TA:
        - Base URL: https://porezna.gov.hr/rn
        - Identifiers: use JIR if present, otherwise ZKI
        - Datetime format: YYYYMMDD_HHMM (issuance datetime)
        - Amount: absolute total with two decimals, period removed

        Uses `l10n_hr_invoice_sending_time` (issuance datetime) for QR; The datetime is
        converted to the Croatian timezone (Europe/Zagreb) for consistent
        representation with TA.
        """
        self.ensure_one()

        identifier = self.l10n_hr_fiscalization_jir or self.l10n_hr_fiscalization_zki
        dt_source = self.l10n_hr_invoice_sending_time
        if not identifier or not dt_source:
            return None

        dt_local = self.env['account.move.send']._l10n_hr_to_hr_local_dt(dt_source)
        formatted_date = dt_local.strftime('%Y%m%d_%H%M')

        amount_str = f'{self.amount_total_signed:.2f}'.replace('.', '')

        base_url = 'https://porezna.gov.hr/rn'
        if self.l10n_hr_fiscalization_jir:
            return f"{base_url}?jir={self.l10n_hr_fiscalization_jir}&datv={formatted_date}&izn={amount_str}"
        return f"{base_url}?zki={self.l10n_hr_fiscalization_zki}&datv={formatted_date}&izn={amount_str}"

    def _l10n_hr_is_direct_fiscalization(self):
        """Determine if invoice should use direct fiscalization (1.0).

        Direct fiscalization (1.0) is used when:
        - Partner is NOT a company (B2C transaction / individual customer)

        EDI fiscalization (2.0) is used when:
        - Partner IS a company (B2B transaction)

        Note: Payment method does not affect which fiscalization flow is used.
        """
        self.ensure_one()
        return not self.partner_id.commercial_partner_id.is_company

    def action_change_fiscalization_payment_method(self):
        """Open wizard to change payment method and/or recipient OIB for fiscalized invoice.

        Security/functional constraints:
        - Only when already fiscalized
        - Only on the same calendar day as fiscalization time
        """
        self.ensure_one()

        if self.l10n_hr_fiscalization_status != '0':
            raise UserError(self.env._("Only fiscalized invoices can have their data changed."))

        fiscalization_date = fields.Date.context_today(self, self.l10n_hr_invoice_sending_time)
        today = fields.Date.context_today(self)
        if fiscalization_date != today:
            raise UserError(self.env._("Invoice data can only be changed on the same day the invoice was fiscalized."))

        return {
            'name': self.env._('Change Invoice Data'),
            'type': 'ir.actions.act_window',
            'res_model': 'l10n.hr.fiscalization.change.payment.method',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_move_id': self.id,
                'default_current_payment_method': self.l10n_hr_payment_method_type,
            }
        }

    def l10n_hr_change_payment_method(self, new_payment_method, new_recipient_oib=None, change_oib=False):
        """Change payment method and/or recipient OIB for a fiscalized invoice via TA API.

        Uses the EDI send wizard plumbing to build, sign, and send a
        dedicated PromijeniNacPlac request. Updates the invoice on success.

        Args:
            new_payment_method: New payment method code (G, K, T, O)
            new_recipient_oib: New recipient OIB (11 digits) or empty string to clear
            change_oib: Boolean indicating if OIB should be changed
        """
        self.ensure_one()

        if self.l10n_hr_fiscalization_status != '0' or not self.l10n_hr_fiscalization_jir:
            return {
                'success': False,
                'error': self.env._("Only fiscalized invoices can have their data changed.")
            }

        fiscalization_date = fields.Date.context_today(self, self.l10n_hr_invoice_sending_time)
        today = fields.Date.context_today(self)
        if fiscalization_date != today:
            return {
                'success': False,
                'error': self.env._("Invoice data can only be changed on the same day the invoice was fiscalized.")
            }

        if new_payment_method == 'T' and change_oib and new_recipient_oib:
            return {
                'success': False,
                'error': self.env._("Recipient OIB cannot be sent with payment method 'Transakcijski račun' (T).")
            }

        try:
            send_wizard = self.action_invoice_sent()
            send_obj = self.env[send_wizard['res_model']].with_context(send_wizard['context']).create({})
            request_data = send_obj._l10n_hr_prepare_fiscalization_request(self)
            request_data['changed_payment_method'] = new_payment_method

            if change_oib:
                request_data['changed_recipient_oib'] = new_recipient_oib if new_recipient_oib else ''
                request_data['change_oib'] = True

            xml_doc = send_obj._l10n_hr_generate_xml_file(request_data, is_payment_change=True)
            response = send_obj._l10n_hr_send_xml_file(xml_doc, is_payment_change=True)

            if response.get('success'):
                self.l10n_hr_payment_method_type = new_payment_method

                if response.get('datetime_of_payment_method_change'):
                    change_datetime = send_obj._convert_hr_datetime_to_odoo(response.get('datetime_of_payment_method_change'))
                    self.l10n_hr_fiscalization_payment_method_change_date = change_datetime
                return {
                    'success': True
                }
            else:
                return {
                    'success': False,
                    'error': response.get('error')
                }
        except Exception as e:  # noqa: BLE001
            return {
                'success': False,
                'error': str(e)
            }

    def l10n_hr_fiscalization_check_status_of_invoice(self):
        """Check fiscalization status with the TA.

        Builds a `ProvjeraZahtjev`, sends it, and returns the parsed response
        including normalized error codes/messages when present.
        """
        self.ensure_one()

        if self.l10n_hr_fiscalization_status != '0' and not self.l10n_hr_fiscalization_jir:
            return {
                'success': False,
                'message': self.env._("Only fiscalized invoices can be checked. Send invoice to Fiscalization first.")
            }

        try:
            send_wizard = self.action_invoice_sent()
            send_obj = self.env[send_wizard['res_model']].with_context(send_wizard['context']).create({})
            if not self.l10n_hr_fiscalization_zki:
                self.l10n_hr_fiscalization_zki = send_obj._l10n_hr_generate_zki(self)
            request_data = send_obj._l10n_hr_prepare_fiscalization_request(self)
            xml_doc = send_obj._l10n_hr_generate_xml_file(request_data, check_status=True)
            response = send_obj._l10n_hr_send_xml_file(xml_doc, check_status=True)

            if response['success']:
                return {
                    'success': True,
                    'message': self.env._("Invoice is properly fiscalized."),
                    'details': response.get('errors', []),
                    'invoice_details': response.get('invoice_details', {})
                }
            else:
                return {
                    'success': False,
                    'message': self.env._("Fiscalization check failed: %s", response['error']),
                    'details': response.get('errors', []),
                    'invoice_details': response.get('invoice_details', {})
                }
        except Exception as e:  # noqa: BLE001
            return {
                'success': False,
                'message': self.env._("Fiscalization check failed: %s", e),
                'details': [],
                'invoice_details': {}
            }

    def action_check_fiscalization_status(self):
        self.ensure_one()
        result = self.l10n_hr_fiscalization_check_status_of_invoice()

        if result['success']:
            message = result['message']
            message_type = 'success'
        else:
            message = result['message']
            message_type = 'danger'

        if result.get('details'):
            detail_messages = []
            for detail in result['details']:
                if isinstance(detail, dict) and 'code' in detail and 'message' in detail:
                    detail_messages.append(f"{detail['code']}: {detail['message']}")

            if detail_messages:
                message += "\n\nDetails:\n" + "\n".join(detail_messages)

        if not result['success'] and result.get('invoice_details'):
            invoice_details = result.get('invoice_details', {})
            if invoice_details:
                message += "\n\nInvoice Details from Tax Authority:\n"
                for key, value in invoice_details.items():
                    if isinstance(value, (dict, list)):
                        message += f"{key}: {value!s}\n"
                    else:
                        message += f"{key}: {value}\n"

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': self.env._('Fiscalization Status Check'),
                'message': message,
                'type': message_type,
                'sticky': True,
            }
        }
