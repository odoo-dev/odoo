# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class FormRecordWatchMixin(models.AbstractModel):
    """Send bus notifications to form view watchers when the record changes.

    Inherit this mixin on models whose form views should notify other users
    watching the same record in real time.
    """
    _name = "web.form.record.watch.mixin"
    _description = "Notify form view watchers on record changes"

    def write(self, vals):
        if vals:
            for record in self:
                record._notify_form_watch(
                    "web.form_record_updated",
                    {"uid": self.env.uid, "resModel": record._name, "resId": record.id},
                )
        return super().write(vals)

    @api.ondelete(at_uninstall=False)
    def _notify_deletion(self):
        for record in self:
            record._notify_form_watch(
                "web.form_record_deleted",
                {"resModel": record._name, "resId": record.id},
            )

    def _notify_form_watch(self, notification_type, payload):
        """Notify anyone watching this record's form view, unless it was created in the
        current transaction: nobody could have a form open on a record that doesn't exist
        yet from their point of view."""
        self.ensure_one()
        if self.create_date != self.env.cr.now():
            self.env["bus.bus"]._sendone(
                f"web.form_watch:{self._name}:{self.id}",
                notification_type,
                payload,
                ephemeral=True,
            )
