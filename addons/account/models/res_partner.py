# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import re
from collections import defaultdict

from psycopg2 import errors as pgerrors

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.fields import Domain
from odoo.tools import SQL
from odoo.tools.partner_identifiers import get_tin_metadata_of_country, is_identifier_void

from odoo.addons.account.models.account_move import BYPASS_LOCK_CHECK
from odoo.addons.base.models.res_partner import _ref_vat

_logger = logging.getLogger(__name__)

SQL_OPERATORS = {
    '<': SQL('<'),
    '=': SQL('='),
    '>': SQL('>'),
    '>=': SQL('>='),
    '<=': SQL('<='),
}


class ResPartner(models.Model):
    _inherit = 'res.partner'

    fiscal_country_codes = fields.Char(compute='_compute_fiscal_country_codes')
    fiscal_country_group_codes = fields.Json(compute='_compute_fiscal_country_group_codes')
    partner_vat_placeholder = fields.Char(compute='_compute_partner_vat_placeholder')
    duplicate_bank_partner_ids = fields.Many2many('res.partner', compute='_compute_duplicate_bank_partner_ids')

    @api.depends('company_id', 'country_code')
    @api.depends_context('allowed_company_ids')
    def _compute_fiscal_country_codes(self):
        for record in self:
            allowed_companies = record.company_id or self.env.companies
            country_codes = allowed_companies.mapped('account_fiscal_country_id.code')
            if record.country_code:
                country_codes.append(record.country_code)
            record.fiscal_country_codes = ",".join(set(country_codes))

    @api.depends('company_id')
    @api.depends_context('allowed_company_ids')
    def _compute_fiscal_country_group_codes(self):
        for partner in self:
            allowed_companies = partner.company_id or self.env.companies
            partner.fiscal_country_group_codes = list({
                code
                for company in allowed_companies
                for code in company.account_fiscal_country_group_codes
            })

    @property
    def _order(self):
        res = super()._order
        partner_search_mode = self.env.context.get('res_partner_search_mode')
        if partner_search_mode not in ('customer', 'supplier'):
            return res
        order_by_field = f"{partner_search_mode}_rank DESC"
        return '%s, %s' % (order_by_field, res) if res else order_by_field

    @api.depends_context('company')
    def _credit_debit_get(self):
        if not self.ids:
            self.debit = False
            self.credit = False
            return
        query = self.env['account.move.line']._search([
            ('parent_state', '=', 'posted'),
            ('company_id', 'child_of', self.env.company.root_id.id),
        ], bypass_access=True)
        self.env['account.move.line'].flush_model(
            ['account_id', 'amount_residual', 'company_id', 'parent_state', 'partner_id', 'reconciled']
        )
        self.env['account.account'].flush_model(['account_type'])
        sql = SQL("""
            SELECT account_move_line.partner_id, a.account_type, SUM(account_move_line.amount_residual)
            FROM %s
            LEFT JOIN account_account a ON (account_move_line.account_id=a.id)
            WHERE a.account_type IN ('asset_receivable','liability_payable')
            AND account_move_line.partner_id IN %s
            AND account_move_line.reconciled IS NOT TRUE
            AND %s
            GROUP BY account_move_line.partner_id, a.account_type
            """,
            query.from_clause,
            tuple(self.ids),
            query.where_clause or SQL("TRUE"),
        )
        treated = self.browse()
        for pid, account_type, val in self.env.execute_query(sql):
            partner = self.browse(pid)
            if account_type == 'asset_receivable':
                partner.credit = val
                if partner not in treated:
                    partner.debit = False
                    treated |= partner
            elif account_type == 'liability_payable':
                partner.debit = -val
                if partner not in treated:
                    partner.credit = False
                    treated |= partner
        remaining = (self - treated)
        remaining.debit = False
        remaining.credit = False

    @api.depends_context('company')
    def _compute_credit_to_invoice(self):
        # To be overridden in Sales
        self.credit_to_invoice = False

    def _asset_difference_search(self, account_type, operator, operand):
        operator_sql = SQL_OPERATORS.get(operator)
        if not operator_sql:
            return []
        if not isinstance(operand, (float, int)):
            return []
        sign = 1
        if account_type == 'liability_payable':
            sign = -1
        res = self.env.execute_query(SQL('''
            SELECT aml.partner_id
              FROM res_partner partner
         LEFT JOIN account_move_line aml ON aml.partner_id = partner.id
              JOIN account_move move ON move.id = aml.move_id
              JOIN res_company line_company ON line_company.id = aml.company_id
        RIGHT JOIN account_account acc ON aml.account_id = acc.id
             WHERE acc.account_type = %s
               AND acc.active
               AND SPLIT_PART(line_company.parent_path, '/', 1)::int = %s
               AND move.state = 'posted'
          GROUP BY aml.partner_id
            HAVING %s * COALESCE(SUM(aml.amount_residual), 0) %s %s''',
            account_type, self.env.company.root_id.id, sign, operator_sql, operand
        ))
        return [('id', 'in', [r[0] for r in res])]

    @api.model
    def _credit_search(self, operator, operand):
        return self._asset_difference_search('asset_receivable', operator, operand)

    @api.model
    def _debit_search(self, operator, operand):
        return self._asset_difference_search('liability_payable', operator, operand)

    def _invoice_total(self):
        """Compute the total amount invoiced to the partner. Multiple currencies may have been linked to the invoices, then it
        is important to define a unique currency to compute the total amount otherwise this one is meaningless. This currency
        is either the one of the partner's company if they have one or the currency of the environment's company."""
        self.total_invoiced = 0.0
        if self.ids:
            all_partners = self.with_context(active_test=False).search_fetch(
                [('id', 'child_of', self.ids)],
                ['parent_id'],
            )
            query_res = self.env.execute_query(SQL(
                """SELECT move.partner_id, SUM(move.amount_total_signed * COALESCE(currency_rate.rate, 1))
                     FROM account_move move
                     LEFT JOIN res_partner partner
                       ON partner.id = move.partner_id
                     LEFT JOIN res_company company
                       ON company.id = COALESCE(partner.company_id, %(default_company_id)s)
                     /* To use the exchange rate effective at the creation of the invoice. */
                     LEFT JOIN LATERAL (
                         SELECT rate
                           FROM res_currency_rate
                          WHERE company_id = move.company_id
                            AND currency_id = company.currency_id
                            AND name < move.date
                          ORDER BY name DESC
                          LIMIT 1
                     ) currency_rate
                       ON TRUE
                    WHERE move.state NOT IN ('draft', 'cancel')
                      AND move.company_id IN %(company_ids)s
                      AND move.partner_id IN %(partner_ids)s
                      AND move.move_type IN ('out_invoice', 'out_refund')
                    GROUP BY move.partner_id""",
                partner_ids=tuple(all_partners.ids),
                company_ids=tuple(self.env.companies.ids),
                default_company_id=self.env.company.id,
            ))
            all_partners_by_id = {partner.id: partner for partner in all_partners}
            for partner_id, total in query_res:
                partner = all_partners_by_id[partner_id]
                while partner:
                    if partner in self:
                        partner.total_invoiced += total
                    partner = partner.parent_id

    @api.depends('credit')
    def _compute_days_sales_outstanding(self):
        commercial_partners = {
            commercial_partner: (invoice_date_min, amount_total_signed_sum)
            for commercial_partner, invoice_date_min, amount_total_signed_sum in self.env['account.move']._read_group(
                domain=[
                    ('state', 'not in', ['draft', 'cancel']),
                    ('move_type', 'in', self.env["account.move"].get_sale_types(include_receipts=True)),
                    ('company_id', '=', self.env.company.id),
                    ('commercial_partner_id', 'in', self.commercial_partner_id.ids),
                ],
                groupby=['commercial_partner_id'],
                aggregates=['invoice_date:min', 'amount_total_signed:sum'],
            )
        }
        for partner in self:
            oldest_invoice_date, total_invoiced_tax_included = commercial_partners.get(partner, (fields.Date.context_today(self), 0))
            days_since_oldest_invoice = (fields.Date.context_today(self) - oldest_invoice_date).days
            partner.days_sales_outstanding = ((partner.credit / total_invoiced_tax_included) * days_since_oldest_invoice) if total_invoiced_tax_included else 0

    def _compute_available_invoice_template_pdf_report_ids(self):
        for partner in self:
            partner.available_invoice_template_pdf_report_ids = self.env['account.move']._get_available_invoice_template_pdf_report_ids()

    def _compute_display_invoice_template_pdf_report_id(self):
        """ Show PDF template selection if there are more than 1 template available for invoices. """
        for partner in self:
            partner.display_invoice_template_pdf_report_id = len(partner.available_invoice_template_pdf_report_ids) > 1

    def _get_company_currency(self):
        for partner in self:
            partner.currency_id = partner.sudo().company_id.currency_id or self.env.company.currency_id

    def _get_company_currency_sql(self, table):
        return SQL("COALESCE(%s, %s)", table.company_id.currency_id, self.env.company.currency_id.id)

    name = fields.Char(tracking=True)
    credit = fields.Monetary(compute='_credit_debit_get', search=_credit_search,
        string='Total Receivable', help="Total amount this customer owes you.",
        groups='account.group_account_invoice,account.group_account_readonly')
    credit_to_invoice = fields.Monetary(
        compute='_compute_credit_to_invoice',
        groups='account.group_account_invoice,account.group_account_readonly'
    )
    credit_limit = fields.Float(
        string='Credit Limit', help='Credit limit specific to this partner.',
        groups='account.group_account_invoice,account.group_account_readonly',
        company_dependent=True, copy=False, readonly=False)
    use_partner_credit_limit = fields.Boolean(
        string='Partner Limit', groups='account.group_account_invoice,account.group_account_readonly',
        compute='_compute_use_partner_credit_limit', inverse='_inverse_use_partner_credit_limit',
        help='Set a value greater than 0.0 to activate a credit limit check')
    show_credit_limit = fields.Boolean(
        compute='_compute_show_credit_limit', groups='account.group_account_invoice,account.group_account_readonly')
    days_sales_outstanding = fields.Float(
        string='Days Sales Outstanding (DSO)',
        help='[(Total Receivable/Total Revenue) * number of days since the first invoice] for this customer',
        compute='_compute_days_sales_outstanding')
    debit = fields.Monetary(
        compute='_credit_debit_get', search=_debit_search, string='Total Payable',
        help="Total amount you have to pay to this vendor.",
        groups='account.group_account_invoice,account.group_account_readonly')
    total_invoiced = fields.Monetary(compute='_invoice_total', string="Total Invoiced",
        groups='account.group_account_invoice,account.group_account_readonly')
    currency_id = fields.Many2one('res.currency',
        compute='_get_company_currency', compute_sql='_get_company_currency_sql', compute_sudo=True,
        readonly=True,
        string="Currency")  # currency of amount currency
    property_account_payable_id = fields.Many2one('account.account', company_dependent=True,
        check_company=True,
        string="Account Payable",
        ui_domain="[('account_type', '=', 'liability_payable')]",
        ondelete='restrict')
    property_account_payable_active = fields.Boolean(related='property_account_payable_id.active', string="Account Payable Active")
    property_account_receivable_id = fields.Many2one('account.account', company_dependent=True,
        check_company=True,
        string="Account Receivable",
        ui_domain="[('account_type', '=', 'asset_receivable')]",
        ondelete='restrict')
    property_account_receivable_active = fields.Boolean(related='property_account_receivable_id.active', string="Account Receivable Active")
    property_account_position_id = fields.Many2one('account.fiscal.position', company_dependent=True,
        check_company=True,
        string="Fiscal Position",
        help="The fiscal position determines the taxes/accounts used for this contact.")
    property_payment_term_id = fields.Many2one('account.payment.term', company_dependent=True,
        check_company=True,
        string='Customer Payment Terms',
        ondelete='restrict')
    property_supplier_payment_term_id = fields.Many2one('account.payment.term', company_dependent=True,
        check_company=True,
        string='Vendor Payment Terms',
    )
    ref_company_ids = fields.One2many('res.company', 'partner_id',
        string='Companies that refers to partner')
    supplier_invoice_count = fields.Integer(compute='_compute_supplier_invoice_count', string='# Vendor Bills')
    account_move_count = fields.Integer(compute='_compute_account_move_count', groups='account.group_account_invoice,account.group_account_readonly')
    invoice_ids = fields.One2many('account.move', 'partner_id', string='Invoices', readonly=True, copy=False)
    contract_ids = fields.One2many('account.analytic.account', 'partner_id', string='Partner Contracts', readonly=True)
    bank_account_count = fields.Integer(compute='_compute_bank_count', string="Bank")
    trust = fields.Selection([('good', 'Good Debtor'), ('normal', 'Normal Debtor'), ('bad', 'Bad Debtor')], string='Degree of trust you have in this debtor', company_dependent=True)
    ignore_abnormal_invoice_date = fields.Boolean(company_dependent=True)
    ignore_abnormal_invoice_amount = fields.Boolean(company_dependent=True)
    global_location_number = fields.Char(
        string="GLN",
        help="Global Location Number",
        compute='_compute_global_location_number',
        inverse='_inverse_global_location_number',
    )
    invoice_sending_method = fields.Selection(
        string="Invoice sending",
        selection=[
            ('manual', 'Manual'),
            ('email', 'by Email'),
        ],
        company_dependent=True,
    )
    invoice_edi_format = fields.Selection(
        string="eInvoice format",
        selection=[],  # to extend
        compute='_compute_invoice_edi_format',
        inverse='_inverse_invoice_edi_format',
        compute_sudo=True,
    )
    invoice_edi_format_store = fields.Char(company_dependent=True)
    display_invoice_edi_format = fields.Boolean(default=lambda self: len(self._fields['invoice_edi_format']._description_selection(self.env)), store=False)
    invoice_template_pdf_report_id = fields.Many2one(
        string="Invoice report",
        comodel_name='ir.actions.report',
        ui_domain="[('id', 'in', available_invoice_template_pdf_report_ids)]",
        readonly=False,
        store=True,
    )
    available_invoice_template_pdf_report_ids = fields.One2many(
        comodel_name='ir.actions.report',
        compute="_compute_available_invoice_template_pdf_report_ids",
    )
    display_invoice_template_pdf_report_id = fields.Boolean(compute='_compute_display_invoice_template_pdf_report_id')
    # Computed fields to order the partners as suppliers/customers according to the
    # amount of their generated incoming/outgoing account moves
    supplier_rank = fields.Integer(default=0, copy=False)
    customer_rank = fields.Integer(default=0, copy=False)
    autopost_bills = fields.Selection(
        selection=[('always', 'Always'), ('ask', 'Ask after 3 validations without edits'), ('never', 'Never')],
        string='Auto-post bills',
        help="Automatically post bills for this trusted partner",
        default='ask',
        required=True,
    )

    property_outbound_payment_method_line_id = fields.Many2one(
        comodel_name='account.payment.method.line',
        check_company=True,
        company_dependent=True,
        domain=lambda self: [('journal_id.active', '=', True), ('payment_type', '=', 'outbound'), ('company_id', 'parent_of', self.env.company.id)],
    )

    property_inbound_payment_method_line_id = fields.Many2one(
        comodel_name='account.payment.method.line',
        check_company=True,
        company_dependent=True,
        domain=lambda self: [('journal_id.active', '=', True), ('payment_type', '=', 'inbound'), ('company_id', 'parent_of', self.env.company.id)],
    )

    @api.depends('additional_identifiers')
    def _compute_global_location_number(self):
        for partner in self:
            partner.global_location_number = partner._get_additional_identifier('EAN_GLN')

    def _inverse_global_location_number(self):
        for partner in self:
            partner._set_additional_identifier('EAN_GLN', partner.global_location_number)

    def _compute_bank_count(self):
        bank_data = self.env['res.partner.bank']._read_group([('partner_id', 'in', self.ids)], ['partner_id'], ['__count'])
        mapped_data = {partner.id: count for partner, count in bank_data}
        for partner in self:
            partner.bank_account_count = mapped_data.get(partner.id, 0)

    @api.depends_context('allowed_company_ids')
    def _compute_supplier_invoice_count(self):
        # retrieve all children partners and prefetch 'parent_id' on them
        all_partners = self.with_context(active_test=False).search_fetch(
            [('id', 'child_of', self.ids)],
            ['parent_id'],
        )
        supplier_invoice_groups = self.env['account.move']._read_group(
            domain=[('partner_id', 'in', all_partners.ids),
                    *self.env['account.move']._check_company_domain(self.env.companies),
                    ('move_type', 'in', ('in_invoice', 'in_refund'))],
            groupby=['partner_id'], aggregates=['__count']
        )
        self_ids = set(self._ids)

        self.supplier_invoice_count = 0
        for partner, count in supplier_invoice_groups:
            while partner:
                if partner.id in self_ids:
                    partner.supplier_invoice_count += count
                partner = partner.parent_id

    @api.depends_context('company')
    @api.depends('country_code', 'commercial_partner_id.invoice_edi_format_store')
    def _compute_invoice_edi_format(self):
        for partner in self:
            if not partner.commercial_partner_id or partner.commercial_partner_id.invoice_edi_format_store == 'none':
                partner.invoice_edi_format = False
            else:
                partner.invoice_edi_format = partner.commercial_partner_id.invoice_edi_format_store or partner.commercial_partner_id._get_suggested_invoice_edi_format()

    def _inverse_invoice_edi_format(self):
        for partner in self:
            if partner.invoice_edi_format == partner.commercial_partner_id._get_suggested_invoice_edi_format():
                val_to_store = False
            elif not partner.invoice_edi_format:
                val_to_store = 'none'
            else:
                val_to_store = partner.invoice_edi_format

            partner.commercial_partner_id.invoice_edi_format_store = val_to_store

    @api.depends_context('company')
    def _compute_use_partner_credit_limit(self):
        company_limit = self._fields['credit_limit'].get_company_dependent_fallback(self)
        for partner in self:
            partner.use_partner_credit_limit = partner.credit_limit != company_limit

    def _inverse_use_partner_credit_limit(self):
        company_limit = self._fields['credit_limit'].get_company_dependent_fallback(self)
        for partner in self:
            if not partner.use_partner_credit_limit:
                partner.credit_limit = company_limit

    @api.depends_context('company')
    def _compute_show_credit_limit(self):
        self.show_credit_limit = self.env.company.account_use_credit_limit

    def _compute_application_statistics_hook(self):
        data_list = super()._compute_application_statistics_hook()
        if not self.env.user.has_group('account.group_account_invoice'):
            return data_list
        for partner in self.filtered(lambda p: p._get_account_statistics_count()):
            stat_info = {'icon': 'edit_square', 'value': partner._get_account_statistics_count(), 'label': _('Invoices/Bills/Mandates')}
            data_list[partner.id].append(stat_info)
        return data_list

    def _get_account_statistics_count(self):
        return self.account_move_count + self.supplier_invoice_count

    def _get_suggested_invoice_edi_format(self):
        # TO OVERRIDE
        self.ensure_one()
        return False

    def _find_accounting_partner(self, partner):
        ''' Find the partner for which the accounting entries will be created '''
        return partner.commercial_partner_id

    @api.model
    def _commercial_fields(self):
        return super()._commercial_fields() + \
            ['property_account_payable_id', 'property_account_receivable_id', 'property_account_position_id',
             'property_payment_term_id', 'property_supplier_payment_term_id', 'credit_limit']

    def action_view_partner_invoices(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("account.action_move_out_invoice_type")
        all_child = self.with_context(active_test=False).search([('id', 'child_of', self.ids)])
        action['domain'] = [
            ('move_type', 'in', ('out_invoice', 'out_refund')),
            ('partner_id', 'in', all_child.ids)
        ]
        action['context'] = {'default_move_type': 'out_invoice', 'move_type': 'out_invoice', 'journal_type': 'sale', 'search_default_unpaid': 1, 'search_default_posted': 1}
        return action

    def _has_invoice(self, partner_domain):
        self.ensure_one()
        invoice = self.env['account.move'].sudo().search(
            Domain.AND([
                partner_domain,
                [
                    ('move_type', 'in', ['out_invoice', 'out_refund']),
                    ('state', '=', 'posted'),
                ]
            ]),
            limit=1
        )
        return bool(invoice)

    def _can_edit_country(self):
        """ Can't edit `country_id` if there is (non draft) issued invoices. """
        return super()._can_edit_country() and not self._has_invoice(
            [('partner_id', '=', self.id)]
        )

    def _has_confirmed_documents(self):
        """Return `True` if there is (non draft) issued invoices."""
        return super()._has_confirmed_documents() or self._has_invoice(
            [('partner_id', 'child_of', self.commercial_partner_id.id)]
        )

    def _check_billing_address(self, **kwargs):
        _optional, mandatory = self._get_portal_additional_identifiers(self.country_id, **kwargs)
        return super()._check_billing_address(**kwargs) and all(
            self._get_additional_identifier(key)
            for key in mandatory
            if not (self.vat and self._is_individual_identifier(key))
        )

    @api.model
    def _get_portal_additional_identifiers(self, country_sudo, **_kwargs):  # noqa: ARG002
        """Return the `additional_identifiers` keys of the portal and checkout address forms.

        :param res.country country_sudo: The country of the address.
        :return: The optional keys and the mandatory keys, a mandatory key always being shown.
        :rtype: tuple[set, set]
        """
        return set(), set()

    @api.constrains('additional_identifiers', 'vat')
    def _check_identifier_combination(self):
        """A partner cannot combine an individual identifier (citizen number) with a company
        identifier (tax or enterprise number)."""
        for partner in self:
            identifiers = partner.additional_identifiers or {}
            individual = next((key for key in identifiers if partner._is_individual_identifier(key)), None)
            if not individual:
                continue
            company = next((key for key in identifiers if partner._is_company_identifier(key)), None)
            if not company and partner.vat and not is_identifier_void(partner.vat):
                company = get_tin_metadata_of_country(partner.country_code).get('key', 'TIN')
            if company:
                raise ValidationError(_(
                    "A partner cannot have both an individual identifier (%(individual)s) and a"
                    " company identifier (%(company)s).",
                    individual=str(partner._get_identifier_label(individual) or individual),
                    company=str(partner._get_identifier_label(company) or company),
                ))

    def write(self, vals):
        parent_write = self.env["res.partner"]
        if 'parent_id' in vals:
            parent_write = self.filtered(lambda partner: partner.parent_id.id != vals["parent_id"])

        if parent_write:
            partner2move_lines = self.sudo().env['account.move.line'].search([('partner_id', 'in', parent_write.ids)]).grouped('partner_id')
            parent_vat = self.env['res.partner'].browse(vals['parent_id']).vat
            if partner2move_lines and vals['parent_id'] and any((partner.vat or '') != (parent_vat or '') for partner in parent_write):
                raise UserError(_("You cannot set a partner as an invoicing address of another if they have a different %(vat_label)s.", vat_label=self.vat_label))

        res = super().write(vals)

        if parent_write:
            for partner, move_lines in partner2move_lines.items():
                partner._compute_commercial_partner()
                # Make sure to write on all the lines at the same time to avoid breaking the reconciliation check
                move_lines.with_context(bypass_lock_check=BYPASS_LOCK_CHECK).partner_id = partner.commercial_partner_id

                # Update the commercial partner on account.move that were *entirely* dedicated to that partner (exclude moves shared between partners, e.g misc entries or batch bank payments)
                move_lines.move_id.filtered(lambda m: m.partner_id == partner).with_context(bypass_lock_check=BYPASS_LOCK_CHECK).commercial_partner_id = partner.commercial_partner_id
                partner._message_log(body=_("The commercial partner has been updated for all related accounting entries."))
        return res

    @api.model_create_multi
    def create(self, vals_list):
        search_partner_mode = self.env.context.get('res_partner_search_mode')
        is_customer = search_partner_mode == 'customer'
        is_supplier = search_partner_mode == 'supplier'
        if search_partner_mode:
            for vals in vals_list:
                if is_customer and 'customer_rank' not in vals:
                    vals['customer_rank'] = 1
                elif is_supplier and 'supplier_rank' not in vals:
                    vals['supplier_rank'] = 1
        return super().create(vals_list)

    @api.ondelete(at_uninstall=False)
    def _unlink_if_partner_in_account_move(self):
        """
        Prevent the deletion of a partner "Individual", child of a company if:
        - partner in 'account.move'
        - state: all states (draft and posted)
        """
        moves = self.sudo().env['account.move'].search_count([
            ('partner_id', 'in', self.ids),
            ('state', 'in', ['draft', 'posted']),
        ])
        if moves:
            raise UserError(_("The partner cannot be deleted because it is used in Accounting"))

    def _increase_rank(self, field: str, n: int = 1):
        assert field in ('customer_rank', 'supplier_rank')
        if not self:
            return
        postcommit = self.env.cr.postcommit
        data = postcommit.data.setdefault(f'account.res.partner.increase_rank.{field}', defaultdict(int))
        already_registered = bool(data)
        for record in self.sudo():
            # In case we alrady have a value, we will increase the rank in
            # postcommit to avoid serialization errors.  However, if the record
            # has a rank of 0, we increase it directly so that filtering on
            # partner_type is correctly set to customer or supplier.
            if record[field] and record.id:
                data[record.id] += n
            else:
                record[field] += n

        if already_registered or not data:
            return

        @postcommit.add
        def increase_partner_rank():
            try:
                with self.env.registry.cursor() as cr:
                    partners = (
                        self.env(cr=cr)[self._name]
                        .sudo().browse(data)
                        .with_context(prefetch_fields=False)
                    )
                    for partner in partners:
                        partner[field] += data[partner.id]
                    data.clear()
            except pgerrors.OperationalError:
                _logger.debug('Cannot update partner ranks.')

    def _get_frontend_writable_fields(self):
        frontend_writable_fields = super()._get_frontend_writable_fields()
        frontend_writable_fields.update({'invoice_sending_method', 'invoice_edi_format'})

        return frontend_writable_fields

    def _get_vat_required_valid(self, company=None):
        """ Hook for determining VAT validity with more complex VAT requirements. (like VIES)"""
        self.ensure_one()
        return self.has_vat

    # TODO accounting/JCO, seems strange that this address validation logic is only there for pos, and
    # not for standard address management on portal/ecommerce
    @api.model
    def get_partner_localisation_fields_required_to_invoice(self, country_id):
        """ Returns the list of fields that needs to be filled when creating an invoice for the selected country.
        This is required for some flows that would allow a user to request an invoice from the portal.
        Using these, we can get their information and dynamically create form inputs based for the fields required legally for the company country_id.
        The returned fields must be of type ir.model.fields in order to handle translations

        :param country_id: The country for which we want the fields.
        :return: an array of ir.model.fields for which the user should provide values.
        """
        return []

    # -------------------------------------------------------------------------
    # EDI
    # -------------------------------------------------------------------------

    @api.model
    def _import_retrieve_customer_from_vat(self, customer_values):
        vat = customer_values.get('vat')
        if not self.new({'vat': vat}).has_vat:
            return

        # Sometimes, the vat is specified with some whitespaces or dots.
        normalized_vat = vat.replace(' ', '').replace('.', '')
        country_prefix = re.match(r'^[a-zA-Z]{2}|^', vat).group()

        criteria = []
        if country_code := customer_values.get('country_code'):
            criteria.append({'domain': [('vat', 'in', (normalized_vat, vat)), ('country_id.code', '=', country_code.upper())]})
        criteria.append({'domain': [('vat', 'in', (normalized_vat, vat))]})
        extra_vat_values = self._get_country_specific_vat_variants(normalized_vat, country_prefix)
        if extra_vat_values:
            criteria.append({'domain': [('vat', 'in', extra_vat_values)]})
        if country_prefix:
            criteria.append({
                'domain': [
                    ('vat', 'in', (normalized_vat[2:], vat[2:])),
                    ('country_id.code', '=', country_prefix.upper()),
                ],
            })
            criteria.append({
                'domain': [
                    ('vat', 'in', (normalized_vat[2:], vat[2:])),
                    ('country_id.code', '=', False),
                ],
            })

        try:
            vat_only_numeric = str(int(re.sub(r'^\D{2}', '', normalized_vat) or 0))
        except ValueError:
            vat_only_numeric = None
        if vat_only_numeric:

            def search_vat_regex(values):
                static_domain = values['static_domain']
                vat_prefix_regex = values['vat_prefix_regex']

                query = self._search(static_domain + [('active', '=', True)], limit=2)
                query.add_where(SQL(
                    "%s ~ %s",
                    self._field_to_sql(self._table, 'vat'),
                    f'^{vat_prefix_regex}0*{vat_only_numeric}$',
                ))
                partner_row = list(query)
                if partner_row and len(partner_row) == 1:
                    return self.browse(partner_row[0])

            if country_prefix:
                vat_prefix_regex = f'({country_prefix})?'
            else:
                vat_prefix_regex = '([A-z]{2})?'

            criteria.append({
                'vat_prefix_regex': vat_prefix_regex,
                'search_method': search_vat_regex,
            })

        return {
            'criteria': criteria,
        }

    @api.model
    def _import_retrieve_customer_from_bank_account_number(self, customer_values):
        account_numbers = customer_values.get('account_numbers')
        company = customer_values.get('company')
        if not account_numbers or not company:
            return

        company_domain = Domain.OR([
            [*self._check_company_domain(company), ('company_id', '!=', False)],
            [('company_id', '=', False)],
        ])

        bank_account_ids = self.env['res.partner.bank']._search([
            Domain.AND([
                company_domain,
                [
                    ('account_number', 'in', account_numbers),
                    ('allow_out_payment', '=', True),
                ]
            ])
        ])

        return {
            'criteria': [{
                'domain': [('bank_ids', 'in', bank_account_ids)],
            }]
        }

    @api.model
    def _import_retrieve_customer_from_phone(self, customer_values):
        phone = customer_values.get('phone')
        if not phone:
            return

        return {
            'criteria': [{
                'domain': [('phone', '=', phone)],
            }],
        }

    @api.model
    def _import_retrieve_customer_from_email(self, customer_values):
        email = customer_values.get('email')
        if not email:
            return

        return {
            'criteria': [{
                'domain': [('email', '=', email)],
            }],
        }

    @api.model
    def _import_retrieve_customer_from_name(self, customer_values):
        name = customer_values.get('name')
        if not name:
            return

        return {
            'criteria': [{
                'domain': [('name', '=ilike', name)],
            }],
        }

    @api.model
    def _import_retrieve_customer_from_additional_identifiers(self, customer_values):
        additional_identifiers = customer_values.get('additional_identifiers')
        if not additional_identifiers:
            return None

        json_col = self._field_to_sql(self._table, 'additional_identifiers')
        conditions = [
            SQL("%s @> %s::jsonb", json_col, json.dumps({key: value}))
            for key, value in additional_identifiers.items()
            if not is_identifier_void(value)
        ]
        if not conditions:
            return None

        def search_additional_identifiers(values):
            query = self._search([('active', '=', True)], limit=2)
            query.add_where(SQL("(%s)", SQL(" OR ").join(conditions)))
            rows = list(query)
            return self.browse(rows) if len(rows) == 1 else None

        return {
            'criteria': [{
                'search_method': search_additional_identifiers,
            }],
        }

    @api.model
    def _import_retrieve_customer(self, search_plan, company, customer_values_list):
        cache = {}

        static_domain = Domain.OR([
            [*self._check_company_domain(company), ('company_id', '!=', False)],
            [('company_id', '=', False)],
        ])
        for customer_values in customer_values_list:
            partner = None
            for plan in search_plan:
                plan_values = plan(customer_values)
                if not plan_values:
                    continue

                for criteria in plan_values['criteria']:
                    domain = criteria.get('domain')
                    search_method = criteria.get('search_method')
                    if domain:
                        cache_key = str(domain)
                    else:
                        cache_key = criteria.get('cache_key')

                    # Look at the cache if the value has already been tested with this key.
                    if cache_key in cache:
                        if partner := cache[cache_key]:
                            customer_values['customer'] = partner
                            break
                        else:
                            continue

                    if domain:
                        full_domain = Domain.AND([static_domain, domain])
                        partner = self.search(
                            full_domain,
                            order='is_company DESC, supplier_rank DESC, company_id, parent_id DESC, id DESC',
                            limit=1,
                        )
                    elif search_method:
                        partner = search_method({
                            **criteria,
                            'static_domain': static_domain,
                        })

                    if partner:
                        if cache_key:
                            cache[cache_key] = partner
                        customer_values['customer'] = partner
                        break

                if partner:
                    break

    def _retrieve_partner(self, name=None, phone=None, email=None, vat=None,
                          additional_identifiers=None, domain=None, company=None):
        '''Search all partners and find one that matches one of the parameters.
        :param name:    The name of the partner.
        :param phone:   The phone or mobile of the partner.
        :param mail:    The mail of the partner.
        :param vat:     The vat number of the partner.
        :param additional_identifiers: A dict of additional identifiers to match against.
        :param domain:  An extra domain to apply.
        :param company: The company of the partner.
        :returns:       A partner or an empty recordset if not found.
        '''
        customer_values = {
            'vat': vat,
            'phone': phone,
            'email': email,
            'name': name,
            'additional_identifiers': additional_identifiers,
        }
        self._import_retrieve_customer(
            search_plan=[
                self._import_retrieve_customer_from_vat,
                self._import_retrieve_customer_from_additional_identifiers,
                lambda collected_values: {'criteria': [{'domain': domain}]} if domain else None,
                self._import_retrieve_customer_from_email,
                self._import_retrieve_customer_from_phone,
                self._import_retrieve_customer_from_name,
            ],
            company=company or self.env.company,
            customer_values_list=[customer_values],
        )
        return customer_values.get('customer') or self.env['res.partner']

    @api.depends('country_id')
    def _compute_partner_vat_placeholder(self):
        for partner in self:
            expected_vat = ''
            if partner.country_id:
                expected_vat = _ref_vat.get(partner.country_id.code.lower())

            partner.partner_vat_placeholder = self.env._(expected_vat or '')  # pylint: disable=E8502

    @api.depends('bank_ids.duplicate_bank_partner_ids')
    def _compute_duplicate_bank_partner_ids(self):
        for partner in self:
            partner.duplicate_bank_partner_ids = partner.bank_ids.duplicate_bank_partner_ids

    def _compute_account_move_count(self):
        # retrieve all children partners and prefetch 'parent_id' on them
        all_partners = self.with_context(active_test=False).search_fetch(
            [("id", "child_of", self.ids)],
            ["parent_id"],
        )
        domain = [
            ("partner_id", "in", all_partners.ids),
            ("move_type", "in", ("out_invoice", "out_refund")),
        ]
        account_move_groups = self.env["account.move"]._read_group(
            domain=domain, groupby=["partner_id"], aggregates=["__count"],
        )
        self_ids = set(self._ids)

        self.account_move_count = 0
        for partner, count in account_move_groups:
            while partner:
                if partner.id in self_ids:
                    partner.account_move_count += count
                partner = partner.parent_id

    def action_open_business_doc(self):
        return self._get_records_action()

    @api.model
    def _clear_removed_edi_formats(self, *formats):
        """Helper to clear outdated EDI formats.

        Usually called as an uninstall hook of modules that add these formats.
        It avoids the form view to become unusable after module uninstallation.
        """
        self.env.cr.execute(
            """
            UPDATE res_partner
            SET invoice_edi_format_store = invoice_edi_format_store - res_company.id::char
            FROM res_company
            WHERE res_partner.invoice_edi_format_store ->> res_company.id::char IN %s
            """,
            (formats,),
        )
