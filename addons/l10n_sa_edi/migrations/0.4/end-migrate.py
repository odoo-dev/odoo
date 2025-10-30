# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, SUPERUSER_ID
from odoo.addons.l10n_sa_edi import _l10n_sa_load_new_csv_data

def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    _l10n_sa_load_new_csv_data(env)
