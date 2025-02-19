import base64
from odoo import api, fields, models


class ProjectTaskTypeDeleteWizard(models.TransientModel):
    _name = "project.task.image"
    _description = 'Set cover image from portal side'

    img = fields.Image()

    @api.model
    def default_get(self, default_fields):
        defaults = super().default_get(default_fields)
        active_id = self.env.context.get("active_id")
        task = self.env["project.task"].browse(active_id)
        if task.sudo().displayed_image_id.raw:
            defaults["img"] = base64.b64encode(task.sudo().displayed_image_id.raw)
        return defaults

    @api.model_create_multi
    def create(self, vals_list):
        active_id = self.env.context.get("active_id")
        task = self.env["project.task"].browse(active_id)
        for vals in vals_list:
            if vals:
                if (bool(vals['img'])
                and bool(task.sudo().displayed_image_id.raw)
                and base64.b64decode(vals['img']) == task.sudo().displayed_image_id.raw) :
                    vals['img'] = False
        return super().create(vals_list)

    def action_create_image(self):
        active_id = self.env.context.get("active_id")
        task = self.env["project.task"].browse(active_id)
        if self.img:
            img = self.env['ir.attachment'].sudo().create({
                    'name': "projecttaskcoverimg"+str(active_id),
                    'raw': base64.b64decode(self.img),
                    'res_model':'project.task',
                    'res_id':active_id,
                    'mimetype':'image/gif'
            })
            x = task.sudo().write({
            'displayed_image_id': img.id
            })
        else:
            y = task.sudo().write({
            'displayed_image_id': None
            })
        return {"type": "ir.actions.act_window_close"}



