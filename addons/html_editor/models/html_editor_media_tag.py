# Part of Odoo. See LICENSE file for full copyright and licensing details.

from random import randint

from odoo import fields, models


class HtmlEditorMediaTag(models.Model):
    """Tags used to categorize media (images, documents, ...) in the media library."""

    _name = 'html_editor.media.tag'
    _description = 'Media Tag'
    _order = 'name'

    def _default_color(self):
        return randint(1, 11)

    name = fields.Char(required=True, translate=True)
    color = fields.Integer(string='Color Index', default=lambda self: self._default_color())
    attachment_ids = fields.Many2many(
        'ir.attachment',
        relation='html_editor_media_tag_ir_attachment_rel',
        column1='tag_id',
        column2='attachment_id',
        string='Media',
        export_string_translation=False,
    )

    _name_uniq = models.Constraint(
        'unique (name)',
        'A media tag with the same name already exists.',
    )
