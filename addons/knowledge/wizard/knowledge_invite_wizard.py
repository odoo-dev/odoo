# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class KnowledgeInviteWizard(models.TransientModel):
    _name = 'knowledge.invite.wizard'
    _description = 'Knowledge invite wizard'

    article_id = fields.Many2one('knowledge.article')
    have_share_partners = fields.Boolean(compute='_compute_have_share_partners')
    partner_ids = fields.Many2many('res.partner', string='Recipients', required=True)
    permission = fields.Selection([
        ('none', 'No access'),
        ('read', 'Can read'),
        ('write', 'Can write'),
    ], required=True, default='read')

    def action_invite_members(self):
        self.article_id.invite_members(self.partner_ids, self.permission)

    @api.depends('partner_ids')
    def _compute_have_share_partners(self):
        for wizard in self:
            wizard.have_share_partners = any(partner_id.partner_share for partner_id in self.partner_ids)
