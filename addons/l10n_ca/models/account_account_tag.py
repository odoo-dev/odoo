# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models
from odoo.tools import SQL

# The GIFI tags are the ones of the chart template, e.g. l10n_ca.account_tag_gifi_1001 for "1001 - Cash".
GIFI_TAG_XMLID_PREFIX = 'account_tag_gifi_'
GIFI_TAG_XMLID_LIKE_PATTERN = GIFI_TAG_XMLID_PREFIX.replace('_', r'\_') + '%'


class AccountAccountTag(models.Model):
    _inherit = 'account.account.tag'

    l10n_ca_gifi_code = fields.Char(
        string="GIFI Code",
        compute='_compute_l10n_ca_gifi_code',
        compute_sql='_compute_sql_l10n_ca_gifi_code',
        compute_sudo=True,
    )

    def _compute_l10n_ca_gifi_code(self):
        gifi_xmlids = self.env['ir.model.data'].search_fetch([
            ('model', '=', 'account.account.tag'),
            ('module', '=', 'l10n_ca'),
            ('name', '=like', GIFI_TAG_XMLID_LIKE_PATTERN),
            ('res_id', 'in', self.ids),
        ], ['name', 'res_id'])
        gifi_code_by_tag = {gifi_xmlid.res_id: gifi_xmlid.name.removeprefix(GIFI_TAG_XMLID_PREFIX) for gifi_xmlid in gifi_xmlids}
        for tag in self:
            tag.l10n_ca_gifi_code = gifi_code_by_tag.get(tag.id, False)

    def _compute_sql_l10n_ca_gifi_code(self, table):
        return SQL(
            """
            (
                SELECT SUBSTRING(imd.name FROM %(code_position)s)
                  FROM ir_model_data imd
                 WHERE imd.model = 'account.account.tag'
                   AND imd.module = 'l10n_ca'
                   AND imd.name LIKE %(xmlid_pattern)s
                   AND imd.res_id = %(tag_id)s
            )
            """,
            code_position=len(GIFI_TAG_XMLID_PREFIX) + 1,
            xmlid_pattern=GIFI_TAG_XMLID_LIKE_PATTERN,
            tag_id=table.id,
        )
