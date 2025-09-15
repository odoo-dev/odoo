from odoo.tools import sql
from . import models
from . import controllers


def post_init_hook(env):
    sql.drop_constraint(env.cr, 'res_company', 'res_company_name_uniq')

# def uninstall_hook(env):
#     sql.add_constraint(env.cr, 'res_company', 'res_company_name_uniq', 'UNIQUE(name)')

# or we can just add something uniques to company name like company id, dbuuid or username
