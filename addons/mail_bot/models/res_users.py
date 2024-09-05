# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup

from odoo import models, fields, _, api
from odoo.addons.mail.tools.discuss import Store


class ResUsers(models.Model):
    _inherit = ['res.users']

    odoobot_state = fields.Selection(
        [
            ('not_initialized', 'Not initialized'),
            ('onboarding_emoji', 'Onboarding emoji'),
            ('onboarding_attachement', 'Onboarding attachment'),
            ('onboarding_command', 'Onboarding command'),
            ('onboarding_ping', 'Onboarding ping'),
            ('onboarding_canned', 'Onboarding canned'),
            ('idle', 'Idle'),
            ('disabled', 'Disabled'),
        ], string="OdooBot Status", readonly=True, required=False)  # keep track of the state: correspond to the code of the last message sent
    odoobot_failed = fields.Boolean(readonly=True)

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ['odoobot_state']

    @api.model
    def _init_store_data(self, store: Store, /):
        odoobot_onboarding = False
        if self.odoobot_state in [False, 'not_initialized'] and self.env.user and self.env.user._is_internal() and not self.env.registry.in_test_mode():
            odoobot_onboarding = True
            self.env.user._init_odoobot()
        super()._init_store_data(store)
        store.add({"odoobotOnboarding": odoobot_onboarding})

    def _init_odoobot(self):
        self.ensure_one()
        odoobot_id = self.env['ir.model.data']._xmlid_to_res_id("base.partner_root")
        channel = self.env['discuss.channel'].channel_get([odoobot_id, self.partner_id.id])
        message = Markup("%s<br/>%s<br/><b>%s</b> <span class=\"o_odoobot_command\">:)</span>") % (
            _("Hello,"),
            _("Odoo's chat helps employees collaborate efficiently. I'm here to help you discover its features."),
            _("Try to send me an emoji")
        )
        channel.sudo().message_post(body=message, author_id=odoobot_id, message_type="comment", subtype_xmlid="mail.mt_comment")
        self.sudo().odoobot_state = 'onboarding_emoji'
        return channel
