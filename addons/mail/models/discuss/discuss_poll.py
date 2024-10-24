# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models
from odoo.addons.mail.tools.discuss import Store


class DiscussPoll(models.Model):
    _name = "discuss.poll"
    _inherit = ["bus.listener.mixin"]

    message_id = fields.Many2one("mail.message", ondelete="cascade")
    question = fields.Char()
    answer_ids = fields.One2many("discuss.poll.answer", "poll_id")

    def _to_store(self, store: Store, /, *, fields=None, **kwargs):
        if fields is None:
            fields = ["question", "answer_ids", "message_id"]
        for poll in self:
            data = self._read_format(
                [f for f in fields if f not in {"message_id", "answers"}], load=False
            )[0]
            data["message_id"] = poll.message_id.id
            data["answer_ids"] = Store.many(poll.answer_ids)
            store.add("discuss.poll", data)

    def _bus_channel(self):
        return self.env["discuss.channel"].browse(self.message_id.res_id)._bus_channel()
