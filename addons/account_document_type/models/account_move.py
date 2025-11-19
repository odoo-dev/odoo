# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields, api


class AccountMove(models.Model):
    _inherit = "account.move"

    document_number = fields.Char(
        compute='_compute_document_number',
        inverse='_inverse_document_number',
    )
    is_manual_document_number = fields.Boolean(
        compute='_compute_is_manual_document_number',
    )

    @api.depends('name')
    def _compute_document_number(self):
        recs_with_name = self.filtered(lambda x: x.name and x.name != "/")
        for rec in recs_with_name:
            # TODO JOV: this depended on whether document_type_id had a doc_code_prefix, is it important?
            rec.document_number = rec.name.split(" ", 1)[-1]
        (self - recs_with_name).document_number = False

    # TODO JOV: why onchange
    # @api.onchange('document_type_id', 'document_number', 'partner_id')
    def _inverse_document_number(self):
        for rec in self:
            rec.name = rec.document_number  # TODO JOV: don't have the prefix
    #
    #     for rec in self:
    #         if not rec.document_number:
    #             rec.name = False
    #         else:
    #             # TODO JOV: CL skips this
    #             # TODO JOV: somehow stop depending on document type id, modules should override a method
    #             document_number = rec.document_type_id._format_document_number(rec.document_number)
    #             rec.name = "%s %s" % (rec.document_type_id.doc_code_prefix, document_number)

    def _compute_is_manual_document_number(self):
        for move in self:
            move.is_manual_document_number = move.journal_id.type == 'purchase'
