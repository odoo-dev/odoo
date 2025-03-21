from odoo import models, fields


class ResPartner(models.Model):
    _inherit = "res.partner"

    applicant_ids = fields.One2many("hr.applicant", "partner_id", string="Applicants")
