# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, tools
from odoo.tools import SQL

COUNTY_LINK_FILE = 'l10n_us/data/res.city.county.csv'
COUNTY_LINK_TABLE = 'l10n_us_city_county_link'
COUNTY_MAP_TABLE = 'l10n_us_city_county_map'
CITY_XMLID_TABLE = 'l10n_us_city_xmlid'
COUNTY_XMLID_TABLE = 'l10n_us_county_xmlid'
COUNTY_LINK_COPY = f'COPY {COUNTY_LINK_TABLE} FROM STDIN WITH (FORMAT csv, HEADER true)'


class ResCity(models.Model):
    _inherit = 'res.city'

    l10n_us_county_id = fields.Many2one(
        comodel_name='l10n_us.res.county',
        string='County',
        domain="[('state_id', '=', state_id)]",
    )

    @api.model
    def _l10n_us_link_counties(self):
        """Set the county of every US city, kept out of the city file to keep it cheap to load."""
        cr = self.env.cr
        link_table = SQL.identifier(COUNTY_LINK_TABLE)
        map_table = SQL.identifier(COUNTY_MAP_TABLE)
        city_table = SQL.identifier(CITY_XMLID_TABLE)
        county_table = SQL.identifier(COUNTY_XMLID_TABLE)

        cr.execute(SQL("CREATE TEMPORARY TABLE %s (city varchar, county varchar)", link_table))
        with tools.file_open(COUNTY_LINK_FILE, 'rb') as link_file:
            cr.copy_expert(COUNTY_LINK_COPY, link_file)
        cr.execute(SQL("ANALYZE %s", link_table))

        # joined directly, module and model read as one row to the planner and it scans per pair
        for table, model in ((city_table, 'res.city'), (county_table, 'l10n_us.res.county')):
            cr.execute(SQL(
                "CREATE TEMPORARY TABLE %s AS"
                " SELECT name, res_id FROM ir_model_data WHERE module = 'l10n_us' AND model = %s",
                table, model,
            ))
            cr.execute(SQL("ANALYZE %s", table))

        cr.execute(SQL("""
            CREATE TEMPORARY TABLE %s AS
                 SELECT city_data.res_id AS city_id, county_data.res_id AS county_id
                   FROM %s link
                   JOIN %s city_data ON city_data.name = link.city
                   JOIN %s county_data ON county_data.name = link.county
        """, map_table, link_table, city_table, county_table))
        cr.execute(SQL("ALTER TABLE %s ADD PRIMARY KEY (city_id)", map_table))
        cr.execute(SQL("""
            UPDATE res_city city
               SET l10n_us_county_id = map.county_id
              FROM %s map
             WHERE city.id = map.city_id
               AND city.l10n_us_county_id IS DISTINCT FROM map.county_id
        """, map_table))
        cr.execute(SQL("DROP TABLE %s, %s, %s, %s", map_table, link_table, city_table, county_table))
        self.env.invalidate_all()
