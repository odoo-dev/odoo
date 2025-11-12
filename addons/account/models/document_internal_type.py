# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class DocumentInternalType(models.Model):
    _name = 'account.document.internal.type'

    name = fields.Char(required=True)
    code = fields.Char(required=True)
