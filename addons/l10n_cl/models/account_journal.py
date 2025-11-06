# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    l10n_cl_use_documents = fields.Boolean()