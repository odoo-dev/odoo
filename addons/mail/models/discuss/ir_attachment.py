# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields


class IrAttachment(models.Model):
    _inherit = ["ir.attachment"]

    voice_ids = fields.One2many("discuss.voice.metadata", "attachment_id")

    def _bus_channel(self):
        self.ensure_one()
        if self.res_model == "discuss.channel" and self.res_id:
            return self.env["discuss.channel"].browse(self.res_id)._bus_channel()
        guest = self.env["mail.guest"]._get_guest_from_context()
        if self.env.user._is_public() and guest:
            return guest._bus_channel()
        return super()._bus_channel()

    def _to_store_default_fields(self):
        return super()._to_store_default_fields() + ["voice"]

    def _to_store_field_computes(self):
        return super()._to_store_field_computes() | {
            # sudo: discuss.voice.metadata - checking the existence of voice metadata for accessible attachments is fine
            "voice": lambda attachment: bool(attachment.sudo().voice_ids)
        }

    def _post_add_create(self, **kwargs):
        super()._post_add_create()
        if kwargs.get('voice'):
            self.env["discuss.voice.metadata"].create([{"attachment_id": attachment.id} for attachment in self])
