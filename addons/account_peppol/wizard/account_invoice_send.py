# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from base64 import b64encode
from odoo import api, fields, models, _
from odoo.addons.account_edi_proxy_client.models.account_edi_proxy_user import AccountEdiProxyError
from odoo.addons.account_peppol.const import PEPPOL_FORMATS


class AccountInvoiceSend(models.TransientModel):
    _name = 'account.invoice.send'
    _inherit = 'account.invoice.send'
    _description = 'Account Invoice Send'

    peppol_checkbox = fields.Boolean(
        string='Send via PEPPOL',
        compute='_compute_peppol_checkbox', store=True, readonly=False,
        help='Send the invoice via PEPPOL',
    )
    peppol_enabled = fields.Boolean(compute='_compute_peppol_enabled')
    peppol_invoice_ids = fields.Many2many(comodel_name='account.move', compute='_compute_peppol_invoice_ids')
    peppol_warning = fields.Char(compute="_compute_peppol_warning")
    peppol_proxy_state = fields.Selection(related='company_id.account_peppol_proxy_state')

    @api.depends('invoice_ids')
    def _compute_peppol_invoice_ids(self):
        for wizard in self:
            peppol_invoice_ids = self.env['account.move']
            if wizard.company_id.account_peppol_proxy_state == 'active':
                peppol_invoice_ids = wizard.invoice_ids.filtered(
                    lambda invoice:
                        set(invoice.edi_document_ids.edi_format_id.mapped('code')).intersection(PEPPOL_FORMATS)
                        and invoice.peppol_move_state not in ('processing', 'done')
                )
            wizard.peppol_invoice_ids = peppol_invoice_ids

    @api.depends('peppol_invoice_ids')
    def _compute_peppol_enabled(self):
        for wizard in self:
            wizard.peppol_enabled = len(wizard.peppol_invoice_ids) > 0

    @ api.depends('peppol_enabled')
    def _compute_peppol_checkbox(self):
        for wizard in self:
            wizard.peppol_checkbox = wizard.peppol_enabled and not wizard.peppol_warning

    @api.depends('invoice_ids')
    def _compute_peppol_warning(self):
        for wizard in self:
            peppol_warning = False
            invalid_partners = wizard.peppol_invoice_ids.partner_id.commercial_partner_id.filtered(
                lambda partner: not partner.account_peppol_is_endpoint_valid
            )
            if invalid_partners:
                names = ', '.join(invalid_partners[:5].mapped('display_name'))
                peppol_warning = _(
                    "The following partners are not correctly configured to receive Peppol documents. "
                    "Please check and verify their Peppol endpoint and the Electronic Invoicing format: "
                    "%s", names,
                )
            wizard.peppol_warning = peppol_warning

    def send_and_print_action(self):
        if self.peppol_enabled and self.peppol_checkbox:
            edi_user = self.company_id.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'peppol')
            peppol_invoices = self.peppol_invoice_ids

            params = {'documents': []}
            for invoice in peppol_invoices:
                peppol_attachment = invoice.edi_document_ids.filtered(lambda doc: doc.edi_format_id.code in PEPPOL_FORMATS).attachment_id[:1]
                commercial_partner = invoice.partner.commercial_partner_id
                params['documents'].append({
                    'filename': peppol_attachment.name,
                    'receiver': f'{commercial_partner.peppol_eas}:{commercial_partner.peppol_endpoint}',
                    'ubl': b64encode(peppol_attachment.raw).decode(),
                })

            try:
                response = edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/peppol/1/send_document",
                    params=params,
                )
            except AccountEdiProxyError as e:
                peppol_invoices.peppol_move_state = 'error'
                peppol_invoices._message_log_batch(bodies={invoice.id: e.message for invoice in peppol_invoices})
            else:
                if response.get('error'):
                    peppol_invoices.peppol_move_state = 'error'
                    peppol_invoices._message_log_batch(bodies={invoice.id: response['error']['message'] for invoice in peppol_invoices})
                else:
                    # the response only contains message uuids,
                    # so we have to rely on the order to connect peppol messages to account.move
                    for message, invoice in zip(response['messages'], peppol_invoices):
                        invoice.peppol_message_uuid = message['message_uuid']
                        invoice.peppol_move_state = 'processing'
                    log_message = _('The document has been sent to the Peppol Access Point for processing')
                    peppol_invoices._message_log_batch(bodies=dict((invoice.id, log_message) for invoice in peppol_invoices))

        return super().send_and_print_action()
