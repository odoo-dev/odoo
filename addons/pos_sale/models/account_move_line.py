from odoo import models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _get_downpayment_lines(self):
        # EXTENDS sale
        downpayment_lines = self.env["account.move.line"]
        for record in self:
            if related_sol := record.move_id.pos_order_ids.lines:
                # if order is settled not through POS
                pos_downpayment_moves = related_sol.filtered("is_downpayment").pos_order_line_ids.order_id.account_move
                downpayment_lines |= pos_downpayment_moves.invoice_line_ids.filtered(lambda r: r.tax_ids == record.tax_ids)

            elif related_posl := record.move_id.pos_order_ids.lines:
                # if order is settled through POS
                sale_orders = related_posl.sale_order_origin_id
                candidate_moves = sale_orders.pos_order_line_ids.order_id.account_move.filtered(lambda r: r._is_downpayment())
                applicable_lines = self.env['account.move.line']

                for line in candidate_moves.invoice_line_ids:
                    if - line.price_subtotal != record.price_subtotal or line.tax_ids != record.tax_ids:
                        continue
                    applicable_lines |= line

                if len(applicable_lines) > 1:
                    # In the case there are multiple downpayment lines with the same tax & total we'll
                    # pair them up as per their ids
                    move_lines = record.move_id.invoice_line_ids
                    lines_dict = dict(zip(move_lines.sorted('id'), applicable_lines.sorted('id')))
                    downpayment_lines |= lines_dict.get(record)
                else:
                    downpayment_lines |= applicable_lines

        return downpayment_lines | super()._get_downpayment_lines()
