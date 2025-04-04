from odoo.upgrade import util
def migrate(cr, version):
    breakpoint()

    util.rename_field(cr, 'game.character', 'points', 'new_points')
