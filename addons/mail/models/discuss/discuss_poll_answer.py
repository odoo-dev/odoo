# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models
from odoo.addons.mail.tools.discuss import Store


class DiscussPollAnswer(models.Model):
    _name = "discuss.poll.answer"

    poll_id = fields.Many2one("discuss.poll")
    text = fields.Char()
    voting_partner_ids = fields.Many2many("res.partner")

    def _to_store(self, store: Store, /, *, fields=None, **kwargs):
        if fields is None:
            fields = ["poll_id", "text", "voting_partner_ids"]
        for answer in self:
            data = answer._read_format(
                [f for f in fields if f not in {"voting_partner_ids", "poll_id"}], load=False
            )[0]
            data["poll_id"] = (answer.poll_id.id,)
            data["voting_partner_ids"] = Store.many(answer.voting_partner_ids, only_id=True)
            store.add("discuss.poll.answer", data)
