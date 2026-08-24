# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, Command, fields, models, _
from odoo.exceptions import UserError
from odoo.tools import frozendict


class AccountMoveTaxMarginWizard(models.TransientModel):
    _name = 'account.move.tax.margin.wizard'
    _description = "Compute Tax on Margin"

    move_line_ids = fields.Many2many(
        comodel_name='account.move.line',
        string="Invoice Lines",
    )

    @api.model
    def default_get(self, field_names):
        values = super().default_get(field_names)
        if 'move_line_ids' not in field_names or values.get('move_line_ids'):
            return values
        if self.env.context.get('active_model') != 'account.move':
            raise UserError(_("Tax on Margin must be computed from customer invoices."))

        moves = self.env['account.move'].browse(self.env.context.get('active_ids', [])).exists()
        if len(moves) != 1:
            raise UserError(_("Select one posted customer invoice."))
        moves._validate_tax_on_margin_computation()
        values['move_line_ids'] = [Command.set(moves._get_tax_on_margin_invoice_lines().ids)]
        return values

    def _get_grouped_margin_amounts(self):
        self.ensure_one()
        move = self.move_line_ids.move_id
        grouped_amounts = {}
        for line in self.move_line_ids:
            if line.quantity <= 0:
                raise UserError(_("Tax on Margin requires a strictly positive invoice-line quantity."))

            margin_tax = line.tax_ids.filtered('is_tax_on_margin')
            if len(margin_tax) != 1:
                raise UserError(_("Each Tax on Margin invoice line must have exactly one margin tax."))

            gross_margin = line.currency_id.round(max(line.margin_amount, 0.0) * line.quantity)
            if line.currency_id.is_zero(gross_margin):
                continue

            tax_details = margin_tax._get_tax_details(
                price_unit=line.price_unit * (1 - line.discount / 100.0),
                quantity=line.quantity,
                precision_rounding=line.currency_id.rounding,
                rounding_method=line.company_id.tax_calculation_rounding_method,
                product=line.product_id,
                product_uom=line.product_uom_id,
                document_tax_mode=move.document_tax_mode,
                margin_amount=line.margin_amount,
            )
            tax_amount = line.currency_id.round(abs(sum(
                tax_data['tax_amount']
                for tax_data in tax_details['taxes_data']
                if tax_data['tax'] == margin_tax
            )))
            key = (margin_tax, line.account_id, frozendict(line.analytic_distribution or {}))
            group = grouped_amounts.setdefault(key, {
                'gross_margin': 0.0,
                'tax_amount': 0.0,
            })
            group['gross_margin'] += gross_margin
            group['tax_amount'] += tax_amount

        return grouped_amounts

    def action_complete(self):
        self.ensure_one()
        move = self.move_line_ids.move_id
        move._validate_tax_on_margin_computation()
        expected_lines = move._get_tax_on_margin_invoice_lines()
        if set(self.move_line_ids.ids) != set(expected_lines.ids):
            raise UserError(_(
                "The invoice lines changed while the Tax on Margin window was open. Close it and compute again."
            ))

        entry_ref = _("Tax on Margin: %(invoice)s", invoice=move.name)
        existing_entry = move.adjusting_entries_move_ids.filtered(
            lambda entry: entry.ref == entry_ref and entry.state != 'cancel'
        )
        if existing_entry:
            raise UserError(_("A Tax on Margin entry already exists for this invoice."))

        journal = move.company_id.automatic_entry_default_journal_id
        if not journal:
            journal = self.env['account.journal'].search([
                ('company_id', '=', move.company_id.id),
                ('type', '=', 'general'),
            ], limit=1)
        if not journal:
            raise UserError(_("Configure a miscellaneous journal before computing Tax on Margin."))
        if move.currency_id != move.company_currency_id:
            raise UserError(_("The Tax on Margin proof of concept only supports company-currency invoices."))

        line_commands = []
        for (margin_tax, account, analytic_distribution), amounts in self._get_grouped_margin_amounts().items():
            gross_margin = move.currency_id.round(amounts['gross_margin'])
            tax_amount = move.currency_id.round(amounts['tax_amount'])
            taxable_margin = move.currency_id.round(gross_margin - tax_amount)
            base_repartition_lines = margin_tax.invoice_repartition_line_ids.filtered(
                lambda line: line.repartition_type == 'base'
            )
            tax_repartition_lines = margin_tax.invoice_repartition_line_ids.filtered(
                lambda line: line.repartition_type == 'tax'
            )
            if len(tax_repartition_lines) != 1 or tax_repartition_lines.factor_percent != 100.0:
                raise UserError(_(
                    "The Tax on Margin requires one 100%% invoice tax distribution line."
                ))
            tax_repartition_line = tax_repartition_lines
            common_values = {
                'account_id': account.id,
                'partner_id': move.commercial_partner_id.id,
                'analytic_distribution': dict(analytic_distribution),
            }
            line_commands += [
                Command.create({
                    **common_values,
                    'name': _("Negated Margin Base"),
                    'debit': gross_margin,
                }),
                Command.create({
                    **common_values,
                    'name': _("Taxable Margin"),
                    'credit': taxable_margin,
                    'tax_ids': [Command.set(margin_tax.ids)],
                    'tax_tag_ids': [Command.set(base_repartition_lines.tag_ids.ids)],
                    'margin_amount': taxable_margin,
                }),
                Command.create({
                    'account_id': (tax_repartition_line.account_id or account).id,
                    'partner_id': move.commercial_partner_id.id,
                    'name': margin_tax.name,
                    'credit': tax_amount,
                    'tax_repartition_line_id': tax_repartition_line.id,
                    'tax_tag_ids': [Command.set(tax_repartition_line.tag_ids.ids)],
                    'tax_base_amount': -taxable_margin,
                }),
            ]

        if not line_commands:
            raise UserError(_("The invoice has no positive margin on which to compute tax."))

        adjustment = self.env['account.move'].create({
            'move_type': 'entry',
            'journal_id': journal.id,
            'date': move.date,
            'ref': entry_ref,
            'adjusting_entry_origin_move_ids': [Command.set(move.ids)],
            'line_ids': line_commands,
        })
        return adjustment._get_records_action(name=_("Tax on Margin Entry"))
