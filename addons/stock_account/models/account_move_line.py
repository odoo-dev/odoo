from odoo import fields, models, api


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    cogs_origin_id = fields.Many2one(  # technical field used to keep track in the originating line of the anglo-saxon lines
        comodel_name="account.move.line",
        copy=False,
        index="btree_not_null",
    )

    def _compute_account_id(self):
        super()._compute_account_id()
        for line in self:
            if not line.move_id.is_purchase_document():
                continue
            if not line.product_id.is_storable:
                continue
            # Periodic with expense account
            if line.product_id.valuation == 'periodic' and not line.move_id.company_id.anglo_saxon_accounting:
                continue
            fiscal_position = line.move_id.fiscal_position_id
            accounts = line.with_company(line.company_id).product_id.product_tmpl_id.get_product_accounts(fiscal_pos=fiscal_position)

            if line.product_id.valuation == 'real_time' and accounts['stock_valuation']:
                line.account_id = accounts['stock_valuation']
            elif line.company_id.anglo_saxon_accounting and accounts['stock_variation']:
                line.account_id = accounts['stock_variation']

    @api.onchange('product_id')
    def _inverse_product_id(self):
        super(AccountMoveLine, self.filtered(lambda l: l.display_type != 'cogs'))._inverse_product_id()

    def _eligible_for_cogs(self):
        self.ensure_one()
        return self.product_id.is_storable and self.company_id.anglo_saxon_accounting

    def _get_gross_unit_price(self):
        if self.product_uom_id.is_zero(self.quantity):
            return self.price_unit

        if self.discount != 100:
            if not any(t.price_include for t in self.tax_ids) and self.discount:
                price_unit = self.price_unit * (1 - self.discount / 100)
            else:
                price_unit = self.price_subtotal / self.quantity
        else:
            price_unit = self.price_unit

        return -price_unit if self.move_id.move_type == 'in_refund' else price_unit

    def _get_cogs_value(self):
        self.ensure_one()

        if not self.product_id:
            return self.price_unit

        original_line = self.move_id.reversed_entry_id.line_ids.filtered(
            lambda l: l.display_type == 'cogs' and l.product_id == self.product_id and
            l.product_uom_id == self.product_uom_id and l.price_unit >= 0)
        original_line = original_line and original_line[0]
        if original_line:
            return original_line.price_unit

        if self.product_id.cost_method in ['standard', 'average']:
            return self.product_id.standard_price

        # FIFO
        moves = self._get_stock_moves()
        moves_value = sum(moves.mapped('value'))
        moves_quantity = sum(moves.mapped('quantity'))
        # TODO handle returns ect
        return moves_value / moves_quantity if moves_quantity else self.product_id.standard_price

    def _get_exchange_journal(self, company):
        if (
            self and self.move_id.sudo().stock_valuation_layer_ids and
            self.product_id.categ_id.property_valuation == 'real_time'
        ):
            return self.product_id.categ_id.property_stock_journal
        return super()._get_exchange_journal(company)

    def _get_exchange_account(self, company, amount):
        if (
            self and self.move_id.sudo().stock_valuation_layer_ids and
            self.product_id.categ_id.property_valuation == 'real_time'
        ):
            return self.product_id.categ_id.property_stock_valuation_account_id
        return super()._get_exchange_account(company, amount)

    def _get_stock_moves(self):
        return self.env['stock.move']
