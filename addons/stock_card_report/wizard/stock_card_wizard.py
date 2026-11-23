# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime, time

import pytz

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.stock_card_report.report.stock_card_report import (
    CONTEXT_DATE_FROM,
    CONTEXT_PRODUCT_IDS,
    CONTEXT_WAREHOUSE_IDS,
)


class StockCardWizard(models.TransientModel):
    _name = 'stock.card.wizard'
    _description = 'Stock Card Wizard'

    date_from = fields.Date(
        string='From',
        required=True,
        default=lambda self: fields.Date.context_today(self).replace(day=1),
    )
    date_to = fields.Date(
        string='To',
        required=True,
        default=fields.Date.context_today,
    )
    product_ids = fields.Many2many(
        'product.product',
        'stock_card_wizard_product_rel', 'wizard_id', 'product_id',
        string='Products',
        domain=[('is_storable', '=', True)],
        help="Leave empty to include all the products.",
    )
    warehouse_ids = fields.Many2many(
        'stock.warehouse',
        'stock_card_wizard_warehouse_rel', 'wizard_id', 'warehouse_id',
        string='Warehouses',
        help="Leave empty to include all the warehouses.",
    )

    @api.constrains('date_from', 'date_to')
    def _check_dates(self):
        for wizard in self:
            if wizard.date_from > wizard.date_to:
                raise ValidationError(_("The start date must be before the end date."))

    def _to_utc_datetime(self, date, at):
        """ Convert a date, at the given time of the day in the user's timezone, to a naive UTC datetime. """
        tz = pytz.timezone(self.env.user.tz or 'UTC')
        local = tz.localize(datetime.combine(date, at))
        return local.astimezone(pytz.utc).replace(tzinfo=None)

    def action_open_report(self):
        self.ensure_one()
        date_from = self._to_utc_datetime(self.date_from, time.min)
        date_to = self._to_utc_datetime(self.date_to, time.max)

        # The date from, products and warehouses are given through the context so that they narrow the stock
        # ledgers before the running balances are computed. The domain repeats them so that the result stays
        # correct whatever is done with the context.
        domain = [('date', '>=', fields.Datetime.to_string(date_from)), ('date', '<=', fields.Datetime.to_string(date_to))]
        context = {CONTEXT_DATE_FROM: fields.Datetime.to_string(date_from)}
        if self.product_ids:
            domain.append(('product_id', 'in', self.product_ids.ids))
            context[CONTEXT_PRODUCT_IDS] = self.product_ids.ids
        if self.warehouse_ids:
            domain.append(('warehouse_id', 'in', self.warehouse_ids.ids))
            context[CONTEXT_WAREHOUSE_IDS] = self.warehouse_ids.ids

        return {
            'type': 'ir.actions.act_window',
            'name': _("Stock Card"),
            'res_model': 'stock.card.report',
            'view_mode': 'list',
            'views': [(False, 'list')],
            'domain': domain,
            'context': context,
        }
