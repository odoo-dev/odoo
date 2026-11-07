# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ChatbotScript(models.Model):
    _inherit = 'chatbot.script'

    _im_livechat__chatbot_script_welcome_bot = models.Ref('im_livechat.chatbot_script_welcome_bot', required=False)

    def action_test_script(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': '/chatbot/%s/test' % self.id,
            'target': 'new',
        }
