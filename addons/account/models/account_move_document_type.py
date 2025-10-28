# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class AccountMoveDocumentType(models.AbstractModel):  # TODO JOV: if mixin rename
    _name = 'account.move.document.type'
    _description = 'Account Move Document Type'

    # Purpose:
    # 1. Customize document naming,
    # 2. Easily set manual names,
    # 3. TODO JOV: something else I forgot,

    # TODO JOV: override _get_starting_sequence and _get_last_sequence_domain in each l10n instead?


