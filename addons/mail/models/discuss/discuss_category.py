# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.tools import SQL
from odoo.tools.translate import _

from odoo.addons.mail.tools.discuss import Store
from odoo.tools.misc import limited_field_access_token


class DiscussCategory(models.Model):
    _name = "discuss.category"
    _description = "Discussion Category"
    _inherit = ["bus.sync.mixin", "bus.listener.mixin"]

    def _default_sequence(self):
        return (self.search([], order="sequence desc", limit=1).sequence or 0) + 1

    # description
    name = fields.Char("Name", required=True)
    channel_ids = fields.One2many("discuss.channel", "discuss_category_id", string="Channels")
    sequence = fields.Integer("Sequence", default=_default_sequence)
    technical_key = fields.Char("Technical key")
    message_unread_counter = fields.Integer(
        "Unread Counter",
        compute="_compute_message_unread_counter",
        compute_sudo=True,
    )

    # constraints
    _name_unique = models.Constraint("UNIQUE(name)", "The category name must be unique")
    _technical_key_unique = models.Constraint(
        "UNIQUE(technical_key)", "The technical key must be unique"
    )

    def _sync_field_names(self, res):
        super()._sync_field_names(res)
        self._store_category_fields(res[None])

    def unlink(self):
        if self.filtered("technical_key"):
            raise UserError(_("System categories cannot be deleted."))
        return super().unlink()

    @api.ondelete(at_uninstall=False)
    def _unlink_sync_to_channel(self):
        stores = Store.Stores()
        for category in self:
            for channel in category.channel_ids:
                stores[channel].delete(category)

    def _get_bus_channel_access_token(self):
        """Return a scoped limited access token that indicates the current category
        can be accessed in bus channels.

        :rtype: str
        """
        self.ensure_one()
        return limited_field_access_token(self, "id", scope="bus.channel")

    @api.depends_context("uid", "guest")
    def _compute_message_unread_counter(self):
        guest = self.env["mail.guest"]._get_guest_from_context()
        if guest:
            person_filter = SQL("dcm.guest_id = %s", guest.id)
        elif not self.env.user._is_public():
            person_filter = SQL("dcm.partner_id = %s", self.env.user.partner_id.id)
        else:
            for category in self:
                category.message_unread_counter = 0
            return
        self.env["mail.message"].flush_model()
        self.env["discuss.channel.member"].flush_model(["new_message_separator"])
        for category in self:
            if not category.channel_ids:
                category.message_unread_counter = 0
                continue
            self.env.cr.execute(SQL(
                """SELECT COUNT(DISTINCT dcm.channel_id)
                     FROM discuss_channel_member dcm
                    WHERE dcm.channel_id IN %s
                      AND %s
                      AND EXISTS (
                          SELECT 1 FROM mail_message mm
                           WHERE mm.model = 'discuss.channel'
                             AND mm.res_id = dcm.channel_id
                             AND mm.message_type NOT IN ('notification', 'user_notification')
                             AND mm.id >= dcm.new_message_separator
                      )""",
                tuple(category.channel_ids.ids),
                person_filter,
            ))
            category.message_unread_counter = self.env.cr.fetchone()[0] or 0

    def _store_category_fields(self, res: Store.FieldList):
        res.extend(["name", "sequence", "technical_key"])
        res.attr(
            "bus_channel_access_token", lambda category: category._get_bus_channel_access_token()
        )
        if res.is_for_current_user():
            res.extend(["message_unread_counter"])

    def _category_technical_key_to_domain(self):
        """Map technical keys to base channel domains for computing discuss_category_id.

        Each entry is an ORM domain that determines which channels structurally
        belong to a category (type-based, no pinning constraint). Used by
        _compute_discuss_category_id via filtered_domain and as the foundation
        for _category_technical_key_to_lazy_fetch_params.

        Override in other addons to register additional structural category types.
        """
        return {
            "mail.channels": [("channel_type", "=", "channel")],
            "mail.direct_messages": [("channel_type", "in", ["chat", "group"])],
        }

    def _category_technical_key_to_lazy_fetch_params(self):
        """Map technical keys to fetch params for lazy-loading channels per category.

        Each entry is a dict with:
        - "domain": ORM domain filtering which channels to fetch for this category
        - "order": SQL order string ensuring consistent pagination

        Override in other addons to register additional category types.
        """
        is_pinned = [("channel_member_ids", "any", [("is_self", "=", True), ("is_pinned", "=", True)])]
        category_domains = self._category_technical_key_to_domain()
        return {
            "mail.favorites": {
                "domain": [
                    ("channel_member_ids", "any", [
                        ("is_self", "=", True),
                        ("is_favorite", "=", True),
                        ("is_pinned", "=", True),
                    ]),
                ],
                "order": "name asc, id desc",
            },
            "mail.channels": {
                "domain": category_domains["mail.channels"] + is_pinned,
                "order": "name asc, id desc",
            },
            "mail.direct_messages": {
                "domain": category_domains["mail.direct_messages"] + is_pinned,
                "order": "last_interest_dt desc, id desc",
            },
            "mail.menu_threads": {
                "domain": is_pinned,
                "order": "last_interest_dt desc, id desc",
            },
        }
