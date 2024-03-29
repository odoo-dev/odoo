# -*- coding:utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_dk_edi_message_uuid = fields.Char(string='Nemhandel message ID')
    l10n_dk_edi_move_state = fields.Selection(
        selection=[
            ('ready', 'Ready to send'),
            ('to_send', 'Queued'),
            ('skipped', 'Skipped'),
            ('processing', 'Pending Reception'),
            ('canceled', 'Canceled'),
            ('done', 'Done'),
            ('error', 'Error'),
        ],
        compute='_compute_l10n_dk_edi_move_state', store=True,
        string='Nemhandel status',
        copy=False,
    )
    l10n_dk_edi_is_demo_uuid = fields.Boolean(compute="_compute_l10n_dk_edi_is_demo_uuid")

    def _need_ubl_cii_xml(self):
        self.ensure_one()

        res = super()._need_ubl_cii_xml()
        partner = self.partner_id.commercial_partner_id
        if partner.ubl_cii_format in {False, 'facturx', 'oioubl_201'} or self.company_id.account_peppol_proxy_state != 'active':
            return res
        if not partner.peppol_eas or not partner.peppol_endpoint:
            return False
        if partner.account_peppol_verification_label == 'not_verified':
            partner.button_account_peppol_check_partner_endpoint()
        return res and partner.account_peppol_is_endpoint_valid

    def action_cancel_l10n_dk_edi_documents(self):
        # if the l10n_dk_edi_move_state is processing/done
        # then it means it has been already sent to l10n_dk_edi proxy and we can't cancel
        if any(move.l10n_dk_edi_move_state in {'processing', 'done'} for move in self):
            raise UserError(_("Cannot cancel an entry that has already been sent to Nemhandel"))
        self.l10n_dk_edi_move_state = 'canceled'
        self.send_and_print_values = False

    @api.depends('l10n_dk_edi_message_uuid')
    def _compute_l10n_dk_edi_is_demo_uuid(self):
        for move in self:
            move.l10n_dk_edi_is_demo_uuid = (move.l10n_dk_edi_message_uuid or '').startswith('demo_')

    @api.depends('state')
    def _compute_l10n_dk_edi_move_state(self):
        for move in self:
            if all([
                move.company_id.l10n_dk_edi_proxy_state == 'active',
                move.partner_id.l10n_dk_edi_is_endpoint_valid,
                move.state == 'posted',
                move.move_type in ('out_invoice', 'out_refund', 'out_receipt'),
                not move.l10n_dk_edi_move_state,
            ]):
                move.l10n_dk_edi_move_state = 'ready'
            else:
                move.l10n_dk_edi_move_state = move.l10n_dk_edi_move_state
