from odoo.tools.sql import column_exists, create_column

from . import models
from . import tools
from . import wizard


def _pre_init_nemhandel(env):
    """
        Force the creation of the nemhandel_move_state column to avoid having the ORM compute on potentially
        millions of records.
    """
    if not column_exists(env.cr, "account_move", "nemhandel_move_state"):
        create_column(env.cr, "account_move", "nemhandel_move_state", "varchar")


def uninstall_hook(env):
    env["res.partner"]._clear_removed_edi_formats("oioubl_21")
