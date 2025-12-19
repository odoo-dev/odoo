from odoo.tools.sql import column_exists, create_column

from . import controllers
from . import models
from . import wizard
from . import tools

# TODO: test init hooks (i.e. pdp_identifier computation and template reset)


def _pre_init_pdp(env):
    """
        Force the creation of the columns to avoid having the ORM compute on potentially millions of records.
        Mimic the compute method of pdp_identifier fill the column.
    """
    if not column_exists(env.cr, "account_move", "pdp_move_state"):
        create_column(env.cr, "account_move", "pdp_move_state", "varchar")
        create_column(env.cr, "res_partner", "pdp_identifier", "varchar")

    query = """
        WITH _fr AS (
            SELECT p.id
              FROM res_partner p
         LEFT JOIN res_country c
                ON c.id = p.country_id
             WHERE LENGTH(p.siret) IN (9, 14)
               AND (   p.vat ILIKE 'FR%'
                    OR c.code = 'FR')
        )
        UPDATE res_partner p
           SET pdp_identifier = CASE WHEN LENGTH(p.siret) = 9 THEN p.siret
                                     ELSE LEFT(p.siret, 9) || '_' || p.siret
                                 END
          FROM _fr
         WHERE _fr.id = p.id
    """
    env.cr.execute(query)


def _post_init_pdp(env):
    """
        Update templates for Factur-X.
        # TODO: Maybe we should make a dedicated format instead
    """
    for view_name in [
            'account_edi_ubl_cii.account_invoice_partner_facturx_export_22',
            'account_edi_ubl_cii.account_invoice_facturx_export_22',
    ]:
        view = env.ref(view_name).sudo()
        view.reset_arch(mode="hard")


def uninstall_hook(env):
    env["res.partner"]._clear_removed_edi_formats("ubl_21_fr")
