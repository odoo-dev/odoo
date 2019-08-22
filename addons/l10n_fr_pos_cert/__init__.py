# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from odoo import api, SUPERUSER_ID


def _setup_inalterability(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    # enable ping for this module
    env['publisher_warranty.contract'].update_notification(cron_mode=True)

    fr_companies = env['res.company'].search([('partner_id.country_id.code', 'in', env['res.company']._get_unalterable_country())])
    if fr_companies:
        fr_companies._create_secure_sequence(['l10n_fr_pos_cert_sequence_id'])

        # Setup the restrict mode on POS journals.
        journals = env['account.journal'].search([('company_id', 'in', fr_companies.ids), ('code', '=', 'POSS'), ('restrict_mode_hash_table', '=', False)])
        journals.write({'restrict_mode_hash_table': True})
