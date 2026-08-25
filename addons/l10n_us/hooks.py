# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import tools
from odoo.tools import SQL

COUNTY_FILE = 'l10n_us/data/l10n_us.res.county.csv'
CITY_FILE = 'l10n_us/data/res.city.csv'
# these stay plain strings because copy_expert hands them to psycopg2 rather than composing them
COUNTY_COPY = (
    "COPY l10n_us_county_import (xmlid, name, state_xmlid) FROM STDIN WITH (FORMAT csv, HEADER true)"
)
CITY_COPY = (
    "COPY l10n_us_city_import (xmlid, name, state_xmlid, country_xmlid, county_xmlid)"
    " FROM STDIN WITH (FORMAT csv, HEADER true)"
)
IMPORT_TABLES = ('l10n_us_base_xmlid', 'l10n_us_own_xmlid', 'l10n_us_county_import', 'l10n_us_city_import')


def post_init_hook(env):
    sync_reference_data(env)


def uninstall_hook(env):
    """Drop the bulk loaded records in one statement each rather than record by record."""
    env.cr.execute("""
        DELETE FROM res_city
              WHERE id IN (SELECT res_id FROM ir_model_data
                            WHERE module = 'l10n_us' AND model = 'res.city')
    """)
    env.cr.execute("""
        DELETE FROM l10n_us_res_county
              WHERE id IN (SELECT res_id FROM ir_model_data
                            WHERE module = 'l10n_us' AND model = 'l10n_us.res.county')
    """)
    env.cr.execute("""
        DELETE FROM ir_model_data
              WHERE module = 'l10n_us' AND model IN ('res.city', 'l10n_us.res.county')
    """)


def sync_reference_data(env):
    """Create the counties and cities the data files declare that the database does not have yet."""
    # idempotent because an upgrade reaches it through a migration, where the rows already exist
    _stage_xmlids(env)
    _load_counties(env)
    _load_cities(env)
    _link_counties(env)
    env.cr.execute(SQL("DROP TABLE %s", SQL(", ").join(map(SQL.identifier, IMPORT_TABLES))))
    env.invalidate_all()


def _stage_xmlids(env):
    """Copy the external ids the loads below resolve into their own tables."""
    # module and model together read as one row to the planner, which then scans once per city
    env.cr.execute("""
        CREATE TEMPORARY TABLE l10n_us_base_xmlid AS
             SELECT name, model, res_id FROM ir_model_data
              WHERE module = 'base' AND model IN ('res.country.state', 'res.country')
    """)
    env.cr.execute("""
        CREATE TEMPORARY TABLE l10n_us_own_xmlid AS
             SELECT name, model, res_id FROM ir_model_data
              WHERE module = 'l10n_us' AND model IN ('res.city', 'l10n_us.res.county')
    """)
    env.cr.execute("ANALYZE l10n_us_base_xmlid")
    env.cr.execute("ANALYZE l10n_us_own_xmlid")


def _reserve_ids(env, table, model, sequence):
    """Reuse the id of every row that already exists and reserve a fresh one for the rest."""
    env.cr.execute(SQL("""
        UPDATE %s import
           SET res_id = known.res_id
          FROM l10n_us_own_xmlid known
         WHERE known.model = %s AND known.name = import.xmlid
    """, SQL.identifier(table), model))
    env.cr.execute(SQL(
        "UPDATE %s SET res_id = nextval(%s) WHERE res_id IS NULL", SQL.identifier(table), sequence))
    env.cr.execute(SQL("ANALYZE %s", SQL.identifier(table)))


def _load_counties(env):
    env.cr.execute("""
        CREATE TEMPORARY TABLE l10n_us_county_import (
            xmlid varchar, name varchar, state_xmlid varchar, res_id integer)
    """)
    with tools.file_open(COUNTY_FILE, 'rb') as county_file:
        env.cr.copy_expert(COUNTY_COPY, county_file)
    _reserve_ids(env, 'l10n_us_county_import', 'l10n_us.res.county', 'l10n_us_res_county_id_seq')
    env.cr.execute("""
        INSERT INTO l10n_us_res_county (id, name, state_id, create_uid, create_date, write_uid, write_date)
             SELECT county.res_id, county.name, state.res_id, %s, now(), %s, now()
               FROM l10n_us_county_import county
               JOIN l10n_us_base_xmlid state
                 ON state.model = 'res.country.state'
                AND state.name = split_part(county.state_xmlid, '.', 2)
              WHERE NOT EXISTS (SELECT 1 FROM l10n_us_res_county existing WHERE existing.id = county.res_id)
    """, (env.uid, env.uid))
    _create_xmlids(env, 'l10n_us_county_import', 'l10n_us.res.county')


def _load_cities(env):
    env.cr.execute("""
        CREATE TEMPORARY TABLE l10n_us_city_import (
            xmlid varchar, name varchar, state_xmlid varchar, country_xmlid varchar,
            county_xmlid varchar, res_id integer)
    """)
    with tools.file_open(CITY_FILE, 'rb') as city_file:
        env.cr.copy_expert(CITY_COPY, city_file)
    _reserve_ids(env, 'l10n_us_city_import', 'res.city', 'res_city_id_seq')
    # the independent cities carry no county, so that join has to keep them
    env.cr.execute("""
        INSERT INTO res_city (id, name, state_id, country_id, l10n_us_county_id,
                              create_uid, create_date, write_uid, write_date)
             SELECT city.res_id, jsonb_build_object('en_US', city.name), state.res_id,
                    country.res_id, county.res_id, %s, now(), %s, now()
               FROM l10n_us_city_import city
               JOIN l10n_us_base_xmlid state
                 ON state.model = 'res.country.state'
                AND state.name = split_part(city.state_xmlid, '.', 2)
               JOIN l10n_us_base_xmlid country
                 ON country.model = 'res.country'
                AND country.name = split_part(city.country_xmlid, '.', 2)
          LEFT JOIN l10n_us_county_import county
                 ON county.xmlid = nullif(split_part(city.county_xmlid, '.', 2), '')
              WHERE NOT EXISTS (SELECT 1 FROM res_city existing WHERE existing.id = city.res_id)
    """, (env.uid, env.uid))
    _create_xmlids(env, 'l10n_us_city_import', 'res.city')


def _link_counties(env):
    """Set the county on the cities that predate it, which is every city on an upgraded database."""
    env.cr.execute("""
        UPDATE res_city city
           SET l10n_us_county_id = county.res_id
          FROM l10n_us_city_import import
          JOIN l10n_us_county_import county
            ON county.xmlid = nullif(split_part(import.county_xmlid, '.', 2), '')
         WHERE city.id = import.res_id
           AND city.l10n_us_county_id IS DISTINCT FROM county.res_id
    """)


def _create_xmlids(env, table, model):
    """Register the external ids as noupdate so that a later update never unlinks them."""
    # _process_end only reclaims ids whose noupdate is false, and these files no longer load
    env.cr.execute(SQL("""
        INSERT INTO ir_model_data (name, res_id, module, model, noupdate,
                                   create_uid, create_date, write_uid, write_date)
             SELECT xmlid, res_id, 'l10n_us', %s, true, %s, now(), %s, now()
               FROM %s
        ON CONFLICT (module, name) DO UPDATE SET noupdate = true
    """, model, env.uid, env.uid, SQL.identifier(table)))
