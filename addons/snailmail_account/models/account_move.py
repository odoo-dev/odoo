from odoo import models


class AccountMove(models.Model):
    _inherit = 'account.move'

    def unlink(self):
        latters_to_delete = self.env['snailmail.letter'].search([('model', '=', 'account.move'), ('res_id', 'in', self.ids)])
        if latters_to_delete:
            latters_to_delete.unlink()
        return super().unlink()
