from odoo import models


class IrActionsActWindow(models.Model):
    _inherit = 'ir.actions.act_window'

    _board__open_board_my_dash_action = models.Ref('board.open_board_my_dash_action', 'ir.actions.act_window')
