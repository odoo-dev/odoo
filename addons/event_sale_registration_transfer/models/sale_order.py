# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, models


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def write(self, vals):
        """ ``event_sale`` propagates the order customer to its registrations:
        keep the owner of transferred tickets. """
        if 'partner_id' not in vals:
            return super().write(vals)
        transferred = self._get_transferred_registrations()
        owners = transferred.grouped('partner_id')
        result = super().write(vals)
        for partner, registrations in owners.items():
            registrations.partner_id = partner
        return result

    def action_cancel(self):
        if self.env.context.get('skip_registration_transfer_warning'):
            return super().action_cancel()
        transferred = self._get_transferred_registrations().filtered(lambda r: r.state != 'cancel')
        if not transferred:
            return super().action_cancel()
        return {
            'name': _("Cancel Order"),
            'type': 'ir.actions.act_window',
            'res_model': 'sale.order.transfer.cancel',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_sale_order_ids': self.ids,
                'default_registration_ids': transferred.ids,
            },
        }

    def _get_transferred_registrations(self):
        """ Registrations of these orders currently owned by someone else than
        the buyer, following an accepted transfer. """
        return self.env['event.registration'].sudo().search([
            ('sale_order_id', 'in', self.ids),
            ('transfer_ids.state', '=', 'accepted'),
        ]).filtered(lambda registration: registration.partner_id != registration.sale_order_id.partner_id)
