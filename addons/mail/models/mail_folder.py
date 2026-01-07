# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command, fields, models


class MailFolder(models.Model):
    """Mail folder to organize notifications."""

    _name = "mail.folder"
    _description = "Mail Folder"
    _order = "name"

    name = fields.Char(string="Folder Name", required=True)
    user_id = fields.Many2one("res.users", required=True, default=lambda self: self.env.user)
    # TODO : add inverse of notification_ids
    notification_ids = fields.One2many("mail.notification", "folder_id", string="Notifications")

    def action_show_folders(self):
        return {
            "name": "Mail Folders",
            "type": "ir.actions.act_window",
            "context": {"create": True},
            "res_model": "mail.folder",
            "view_mode": "list,form",
            "views": [(False, "list"), (False, "form")],
            "domain": [("user_id", "=", self.env.user.id)],
            "target": "new",
        }
