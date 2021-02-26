# Part of Odoo. See LICENSE file for full copyright and licensing details.

def dispatch(registry, uid, func, *args):
    raise NameError("No function %s in database %s" % (func, registry.db_name))
