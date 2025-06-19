import base64
from odoo import models, fields, api, _
from odoo.exceptions import UserError
import logging
from ..models.l10n_pl_ksef_api import KsefApiService

_logger = logging.getLogger(__name__)


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def _get_all_extra_edis(self):
        res = super()._get_all_extra_edis()
        res.update({
            'pl_ksef': {
                'label': _("Send via KSeF (e-Faktura)"),
                'is_applicable': lambda move: (
                        move.company_id.country_code == 'PL'
                        # Ensure you handle cases where this field might not exist yet if module is uninstalling
                        and getattr(move.company_id, 'l10n_pl_edi_register', False)
                ),
                'help': _('Send the electronic invoice to the Polish National e-Invoicing System (KSeF).'),
            }
        })
        return res

    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        # 1. Get errors from super
        errors = super()._call_web_service_before_invoice_pdf_render(invoices_data)

        # 2. Identify KSeF candidates
        invoices_for_ksef = {
            inv: data for inv, data in invoices_data.items()
            if 'pl_ksef' in data.get('extra_edis', {}) and inv.ksef_status == 'to_send'
        }

        if not invoices_for_ksef:
            return errors

        moves_for_ksef = self.env['account.move'].union(*invoices_for_ksef.keys())

        future_invoices = moves_for_ksef.filtered(lambda i: i.invoice_date > fields.Date.context_today(self))
        if future_invoices:
            is_user_action = self.env.context.get('active_model') == 'account.move'
            if is_user_action:
                names = ", ".join(future_invoices.mapped('name'))
                raise UserError(_(
                    "You cannot send future-dated invoices to KSeF.\n"
                    "The following invoices have a date in the future: %s\n\n"
                    "Please wait until the invoice date to send them.",
                    names
                ))

            else:
                moves_by_partner = future_invoices.grouped(lambda m: m.invoice_user_id.partner_id or m.create_uid.partner_id)
                for partner, moves in moves_by_partner.items():
                    if not partner:
                        continue
                    notification_payload = {
                        'type': 'warning',
                        'title': _('KSeF: Future-dated Invoices Skipped'),
                        'message': _("The following invoices were skipped because they are future-dated: %s", ", ".join(moves.mapped('name'))),
                        'action_button': {
                            'name': _('Open'),
                            'action_name': _('Future-dated Invoices'),
                            'model': 'account.move',
                            'res_ids': moves.ids,
                        },
                    }
                    partner._bus_send('account_notification', notification_payload)

        if not invoices_for_ksef:
            return errors

        moves_by_company = self.env['account.move'].union(*invoices_for_ksef.keys()).grouped('company_id')

        for company, moves in moves_by_company.items():
            mode = self.env['ir.config_parameter'].sudo().get_param('l10n_pl_edi_ksef.mode') or 'prod'
            key_stored = company.l10n_pl_ksef_session_key
            iv_stored = company.l10n_pl_ksef_session_iv
            session_key = base64.b64decode(key_stored) if key_stored else None
            session_iv = base64.b64decode(iv_stored) if iv_stored else None
            service = KsefApiService(
                company, mode, company.l10n_pl_ksef_session_id, session_key, session_iv
            )

            service.open_ksef_session()
            company.l10n_pl_ksef_session_id = service.session_reference_number
            company.l10n_pl_ksef_session_key = base64.b64encode(service.raw_symmetric_key).decode('utf-8')
            company.l10n_pl_ksef_session_iv = base64.b64encode(service.raw_iv).decode('utf-8')

            for move in moves:
                xml_content = move._l10n_pl_ksef_render_xml()
                if not isinstance(xml_content, bytes):
                    xml_content = xml_content.encode('utf-8')

                response_data = service.send_invoice(xml_content)
                l10n_pl_move_reference_number = response_data.get('referenceNumber')

                filename = f"FA3-{move.name.replace('/', '_')}.xml"
                self.env['ir.attachment'].create({
                    'name': filename,
                    'res_model': 'account.move',
                    'res_id': move.id,
                    'datas': base64.b64encode(xml_content),
                    'description': _('KSeF Sent Invoice XML'),
                })

                move.write({
                    'ksef_status': 'sent',
                    'l10n_pl_move_reference_number': l10n_pl_move_reference_number,
                    'l10n_pl_edi_header': _('Invoice sent to KSeF. Ref: %s', l10n_pl_move_reference_number)
                })

                _logger.info("Successfully sent invoice %s to KSeF", move.name)
                move.action_update_invoice_status()

        return errors
