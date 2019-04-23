from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from odoo.tools.safe_eval import safe_eval


class ResPartnerIdNumber(models.Model):

    _inherit = "res.partner.id_number"
    _order = "sequence"

    sequence = fields.Integer(
        default=10,
        required=True,
    )

