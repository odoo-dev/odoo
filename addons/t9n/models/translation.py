from odoo import api, fields, models


class Translation(models.Model):
    _name = "t9n.translation"
    _description = "Message translated into a language"

    body = fields.Text(
        help="The actual content of the translation.",
    )
    source_id = fields.Many2one(
        comodel_name="t9n.message",
        string="Source message",
        help="The original text, the source of the translation.",
    )
    lang_id = fields.Many2one(
        comodel_name="t9n.language",
        string="Language",
        help="The language to which the translation translates the original message.",
    )

    @api.model
    def create_and_format(self, **kwargs):
        return self.create(kwargs)._format()

    def _format(self):
        return [{
            "id": translation.id,
            "body": translation.body,
            "source_id": {
                "id": translation.source_id.id,
            },
            "lang_id": translation.lang_id._format()[0],
        } for translation in self]
