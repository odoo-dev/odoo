from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError
from odoo.fields import Command, Domain
from odoo.tools import frozendict, groupby, html2plaintext, is_html_empty, split_every, SQL
from odoo.tools.float_utils import float_is_zero, float_repr, float_round, float_compare
from odoo.tools.translate import html_translate, adapt_translated_field_value
from collections import defaultdict
from collections.abc import Iterable
from markupsafe import Markup

import ast
import copy
import logging
import math
import re

_logger = logging.getLogger(__name__)

TYPE_TAX_USE = [
    ('sale', 'Sales'),
    ('purchase', 'Purchases'),
    ('none', 'None'),
]

# The ways of rounding the taxes of a document, selected by `res.company.tax_rounding_policy`:
# - tax_grain:  where the tax amounts are rounded: on each line ('line'), or per tax over the whole document ('tax').
# - authority:  which total is kept when the rounding of a line is fixed:
#               'excluded' rounds the base and the tax independently,
#               'included' rounds base + tax, then derives the base from the rounded tax,
#               'mixed' picks 'included' or 'excluded' depending on whether the tax is price-included.
# - spreading:  how the rounding of a group of amounts lands in the amounts, with the 'tax' grain:
#               'difference' rounds each amount, then spreads the difference with the rounded total,
#               'total' shares the rounded total in proportion to the unrounded amounts.
# - tax_basis:  the amounts the taxes are computed on, with the 'tax' grain:
#               'raw' the unrounded amounts,
#               'rounded' the amounts without tax rounded on each line, the taxes included in the base of other taxes being
#               first rounded over the document. The amounts without tax of a document are the sum of the ones of its lines,
#               and a tax proportional to its base is its rate applied to the sum of its rounded bases (EN 16931).
#               With the 'line' grain, the taxes are always computed on the rounded amounts of their line.
# - converted_currency: None to round the amounts in each currency from their own unrounded amounts,
#               'company' to convert the amounts in company currency from the rounded amounts in foreign currency.
# The javascript side never resolves a policy: it receives it through `res.company.tax_rounding_settings`.
TAX_ROUNDING_POLICIES = {
    'line': {
        'tax_grain': 'line',
        'authority': 'mixed',
        'spreading': 'difference',
        'tax_basis': 'raw',
        'converted_currency': None,
    },
    'document': {
        'tax_grain': 'tax',
        'authority': 'mixed',
        'spreading': 'difference',
        'tax_basis': 'raw',
        'converted_currency': None,
    },
}

# The taxes computed on the rounded amounts without tax of the lines in the currency of the document (EN 16931), the amounts
# in company currency being converted from them.
TAX_ROUNDING_ON_ROUNDED_BASES = {'spreading': 'total', 'tax_basis': 'rounded', 'converted_currency': 'company'}

# The settings the tax rules of a country impose on the 'document' policy, per fiscal country code.
TAX_ROUNDING_COUNTRY_SETTINGS = {
    # The certification of the invoicing software: the total with tax is the reference, shared between the lines.
    'PT': {'authority': 'included', 'spreading': 'total'},
    'AR': TAX_ROUNDING_ON_ROUNDED_BASES,
    'BE': TAX_ROUNDING_ON_ROUNDED_BASES,
    'BR': TAX_ROUNDING_ON_ROUNDED_BASES,
}

# How the taxes of a document are written into an external format (EDI, QR code, fiscal device, API). Each format declares
# a profile starting from this one, and '_represent_tax_details' rounds the amounts of the base lines accordingly:
# - currencies:         the currencies the format writes the amounts in: 'foreign' and/or 'company'.
# - precision_digits:   the precision of the unrounded amounts of the lines (unit prices, line amounts).
# - net_amounts:        True to round the unrounded amounts without tax of the lines ('raw_total_excluded[_currency]').
# - gross_amounts:      None, 'raw' to add the amounts of the lines before discount, their unit prices and their discounts
#                       ('raw_gross_total_excluded[_currency]', 'raw_gross_price_unit[_currency]', 'raw_discount_amount[_currency]')
#                       or 'rounded' to also add them rounded to the currency ('gross_total_excluded[_currency]',
#                       'discount_amount[_currency]').
# - dispatched_global_discounts: True to count the global discounts dispatched on the lines (see
#                       '_dispatch_global_discount_lines') in the discounts of the lines.
# - reconcile:          None, or 'strict' to adjust the unrounded line amounts so that rounding their sum gives exactly the
#                       booked total (see '_get_delta_amount_to_reach_target').
# - identities:         the checks of the format on the amounts, as (rule, identity, tolerance) tuples, reported by
#                       '_check_tax_representation':
#                       * identities: 'line_net_is_qty_x_price', 'tax_is_base_x_rate', 'base_is_sum_of_lines'.
#                       * tolerances: 'exact', ('abs', amount) or 'propagated' (half a unit of each operand carried through
#                         the product).
TAX_REPRESENTATION_PROFILE = {
    'currencies': ('foreign',),
    'precision_digits': 6,
    'net_amounts': False,
    'gross_amounts': None,
    'dispatched_global_discounts': False,
    'reconcile': None,
    'identities': (),
}


class AccountTaxGroup(models.Model):
    _name = 'account.tax.group'
    _description = 'Tax Group'
    _order = 'sequence asc, id'
    _check_company_auto = True
    _check_company_domain = models.check_company_domain_parent_of

    name = fields.Char(required=True, translate=True)
    sequence = fields.Integer(default=10)
    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company)
    country_id = fields.Many2one(
        string="Country",
        comodel_name='res.country',
        compute='_compute_country_id', store=True, readonly=False, precompute=True,
        help="The country for which this tax group is applicable.",
    )
    country_code = fields.Char(related="country_id.code")
    preceding_subtotal = fields.Char(
        string="Preceding Subtotal",
        help="If set, this value will be used on documents as the label of a subtotal excluding this tax group before displaying it. " \
             "If not set, the tax group will be displayed after the 'Untaxed amount' subtotal.",
        translate=True,
    )
    pos_receipt_label = fields.Char(string='PoS receipt label')

    @api.depends('company_id')
    def _compute_country_id(self):
        for group in self:
            group.country_id = group.company_id.account_fiscal_country_id or group.company_id.country_id


class AccountTax(models.Model):
    _name = 'account.tax'
    _inherit = ['mail.thread']
    _description = 'Tax'
    _order = 'sequence,id'
    _check_company_auto = True
    _rec_names_search = ('name', 'description', 'invoice_label')
    _check_company_domain = models.check_company_domain_parent_of

    name = fields.Char(string='Tax Name', required=True, translate=True, tracking=True)
    type_tax_use = fields.Selection(TYPE_TAX_USE, string='Tax Type', required=True, default="sale", tracking=True,
        help="Determines where the tax is selectable. Note: 'None' means a tax can't be used by itself, however it can still be used in a group. 'adjustment' is used to perform tax adjustment.")
    tax_scope = fields.Selection([('service', 'Services'), ('consu', 'Goods')], string="Tax Scope")
    amount_type = fields.Selection(default='percent', string="Tax Computation", required=True, tracking=True,
        selection=[('group', 'Group of Taxes'), ('fixed', 'Fixed'), ('percent', 'Percentage'), ('division', 'Percentage Tax Included')],
        help="""
    - Group of Taxes: The tax is a set of sub taxes.
    - Fixed: The tax amount stays the same whatever the price.
    - Percentage: The tax amount is a % of the price:
        e.g 100 * (1 + 10%) = 110 (not price included)
        e.g 110 / (1 + 10%) = 100 (price included)
    - Percentage Tax Included: The tax amount is a division of the price:
        e.g 180 / (1 - 10%) = 200 (not price included)
        e.g 200 * (1 - 10%) = 180 (price included)
        """)
    fiscal_position_ids = fields.Many2many(
        comodel_name='account.fiscal.position',
        relation='account_fiscal_position_account_tax_rel',
        column1='account_tax_id',
        column2='account_fiscal_position_id',
    )
    original_tax_ids = fields.Many2many(
        comodel_name='account.tax',
        relation='account_tax_alternatives',
        column1='dest_tax_id',  # This Replacement tax
        column2='src_tax_id',  # Domestic Tax to replace
        string="Replaces",
        ui_domain="""[
            ('type_tax_use', '=', type_tax_use),
            ('is_domestic', '=', True),
        ]""",
        ondelete='cascade',
        help="List of taxes to replace when applying any of the stipulated fiscal positions.",
    )
    replacing_tax_ids = fields.Many2many(
        comodel_name='account.tax',
        relation='account_tax_alternatives',
        column1='src_tax_id',  # Domestic Tax to replace
        column2='dest_tax_id',  # This Replacement tax
        readonly=True,
        string="Replaced by",
    )
    display_alternative_taxes_field = fields.Boolean(compute='_compute_display_alternative_taxes_field')
    is_domestic = fields.Boolean(compute='_compute_is_domestic', store=True, precompute=True)
    active = fields.Boolean(default=True, help="Set active to false to hide the tax without removing it.")
    company_id = fields.Many2one('res.company', string='Company', required=True, readonly=True, default=lambda self: self.env.company)
    children_tax_ids = fields.Many2many('account.tax',
        'account_tax_filiation_rel', 'parent_tax', 'child_tax',
        check_company=True,
        string='Children Taxes')
    sequence = fields.Integer(required=True, default=1,
        help="The sequence field is used to define order in which the tax lines are applied.")
    amount = fields.Float(required=True, digits=(16, 4), default=0.0, tracking=True)
    description = fields.Html(string='Description', translate=html_translate)
    invoice_label = fields.Char(string='Label on Invoices', translate=True)
    tax_label = fields.Char(compute='_compute_tax_label')
    price_include = fields.Boolean(
        compute='_compute_price_include',
        search='_search_price_include',
        help="Determines whether the price you use on the product and invoices includes this tax.")
    company_price_include = fields.Selection(related="company_id.account_price_include")
    price_include_override = fields.Selection(
        selection=[('tax_included', 'Tax Included'), ('tax_excluded', 'Tax Excluded')],
        string='Included in Price',
        tracking=True,
        help="Overrides the Company's default on whether the price you use on the product and invoices includes this tax."
    )
    include_base_amount = fields.Boolean(string='Affect Base of Subsequent Taxes', default=False, tracking=True,
        help="If set, taxes with a higher sequence than this one will be affected by it, provided they accept it.")
    is_base_affected = fields.Boolean(
        string="Base Affected by Previous Taxes",
        default=True,
        tracking=True,
        help="If set, taxes with a lower sequence might affect this one, provided they try to do it.")
    analytic = fields.Boolean(string="Include in Analytic Cost", help="If set, the amount computed by this tax will be assigned to the same analytic account as the invoice line (if any)")
    tax_group_id = fields.Many2one(
        comodel_name='account.tax.group',
        string="Tax Group",
        compute='_compute_tax_group_id', readonly=False, store=True,
        required=True, precompute=True,
        ui_domain="[('country_id', 'in', (country_id, False))]")
    # Technical field to make the 'tax_exigibility' field invisible if the same named field is set to false in 'res.company' model
    hide_tax_exigibility = fields.Boolean(string='Hide Use Cash Basis Option', related='company_id.tax_exigibility', readonly=True)
    tax_exigibility = fields.Selection(
        [('on_invoice', 'Based on Invoice'),
         ('on_payment', 'Based on Payment'),
        ], string='Tax Exigibility', default='on_invoice',
        help="Based on Invoice: the tax is due as soon as the invoice is validated.\n"
        "Based on Payment: the tax is due as soon as the payment of the invoice is received.")
    cash_basis_transition_account_id = fields.Many2one(string="Cash Basis Transition Account",
        check_company=True,
        ui_domain="[('account_type', 'not in', ('asset_receivable', 'liability_payable'))]",
        comodel_name='account.account',
        help="Account used to transition the tax amount for cash basis taxes. It will contain the tax amount as long as the original invoice has not been reconciled ; at reconciliation, this amount cancelled on this account and put on the regular tax account.")
    invoice_repartition_line_ids = fields.One2many(
        string="Distribution for Invoices",
        comodel_name="account.tax.repartition.line",
        compute='_compute_invoice_repartition_line_ids', store=True, readonly=False,
        inverse_name="tax_id",
        domain=[('document_type', '=', 'invoice')],
        help="Distribution when the tax is used on an invoice",
    )
    refund_repartition_line_ids = fields.One2many(
        string="Distribution for Refund Invoices",
        comodel_name="account.tax.repartition.line",
        compute='_compute_refund_repartition_line_ids', store=True, readonly=False,
        inverse_name="tax_id",
        domain=[('document_type', '=', 'refund')],
        help="Distribution when the tax is used on a refund",
    )
    repartition_line_ids = fields.One2many(
        string="Distribution",
        comodel_name="account.tax.repartition.line",
        inverse_name="tax_id",
        copy=True,
    )
    country_id = fields.Many2one(
        string="Country",
        comodel_name='res.country',
        compute='_compute_country_id', readonly=False, store=True,
        required=True, precompute=True,
        help="The country for which this tax is applicable.",
    )
    country_code = fields.Char(related='country_id.code', readonly=True)
    company_country_code = fields.Char(
        related='company_id.account_fiscal_country_id.code',
        string="Fiscal Country Code of the Company",
    )
    is_used = fields.Boolean(string="Tax used", compute='_compute_is_used')
    repartition_lines_str = fields.Char(string="Distribution Lines", tracking=True, compute='_compute_repartition_lines_str')
    invoice_legal_notes = fields.Html(string="Legal Notes", translate=True, help="Legal mentions that have to be printed on the invoices.")
    # Technical field depicting if the tax has at least one repartition line with a percentage below 0.
    # Used for the taxes computation to manage the reverse charge taxes having a repartition +100 -100.
    has_negative_factor = fields.Boolean(compute='_compute_has_negative_factor')
    non_deductible_amount = fields.Float(compute='_compute_non_deductible_amount')
    account_move_line_ids = fields.Many2many(
        comodel_name='account.move.line',
        relation='account_move_line_account_tax_rel',
        column1='account_tax_id',
        column2='account_move_line_id',
        copy=False,
        readonly=True,
    )
    account_reconcile_model_line_ids = fields.Many2many(
        comodel_name='account.reconcile.model.line',
        relation='account_reconcile_model_line_account_tax_rel',
        column1='account_tax_id',
        column2='account_reconcile_model_line_id',
        copy=False,
        readonly=True,
    )

    @api.constrains('company_id', 'name', 'type_tax_use', 'tax_scope', 'country_id')
    def _constrains_name(self):
        for taxes in split_every(100, self.ids, self.browse):
            domains = []
            for tax in taxes:
                if tax.type_tax_use != 'none':
                    domains.append([
                        ('company_id', 'child_of', tax.company_id.root_id.id),
                        ('name', '=', tax.name),
                        ('type_tax_use', '=', tax.type_tax_use),
                        ('tax_scope', '=', tax.tax_scope),
                        ('country_id', '=', tax.country_id.id),
                        ('id', '!=', tax.id),
                    ])
            if duplicates := self.sudo().search(Domain.OR(domains)):
                raise ValidationError(
                    self.env._(
                        "Tax names must be unique!\n%(taxes)s",
                        taxes="\n".join(
                            self.env._(
                                "- %(name)s in %(company)s",
                                name=duplicate.name,
                                company=duplicate.company_id.name,
                            )
                            for duplicate in duplicates
                        ),
                    ),
                )

    @api.constrains('tax_group_id')
    def validate_tax_group_id(self):
        for record in self:
            if record.tax_group_id.country_id and record.tax_group_id.country_id != record.country_id:
                raise ValidationError(_("The tax group must have the same country_id as the tax using it."))

    @api.model
    @api.readonly
    def name_search(self, name='', domain=None, operator='ilike', limit=100):
        domain = Domain(domain or Domain.TRUE)
        if 'search_default_domestictax' in self.env.context:
            domain &= Domain('fiscal_position_ids', '=', False) | Domain('fiscal_position_ids.is_domestic', '=', True)
        if fp_id := self.env.context.get('dynamic_fiscal_position_id'):
            domain &= Domain('fiscal_position_ids', 'in', [False, int(fp_id)])
        if self.env.context.get('hide_original_tax_ids') and fp_id:
            domain &= Domain('replacing_tax_ids', 'not any', domain) | Domain.custom(
                to_sql=lambda table: SQL(
                    "EXISTS (SELECT 1 FROM %s WHERE %s = %s AND %s = %s)",
                    SQL.identifier('account_tax_alternatives'),
                    SQL.identifier('src_tax_id'),
                    table.id,
                    SQL.identifier('dest_tax_id'),
                    table.id,
                ),
            )
        return super().name_search(name, domain, operator, limit)

    @api.depends('company_id')
    def _compute_country_id(self):
        for tax in self:
            tax.country_id = tax.company_id.account_fiscal_country_id or tax.company_id.country_id or tax.country_id

    @api.depends('company_id', 'country_id')
    def _compute_tax_group_id(self):
        by_country_company = defaultdict(self.browse)
        for tax in self:
            if (
                not tax.tax_group_id
                or tax.tax_group_id.country_id != tax.country_id
                or tax.tax_group_id.company_id != tax.company_id
            ):
                by_country_company[(tax.country_id, tax.company_id)] += tax
        for (country, company), taxes in by_country_company.items():
            taxes.tax_group_id = self.env['account.tax.group'].search([
                *self.env['account.tax.group']._check_company_domain(company),
                ('country_id', '=', country.id),
            ], limit=1) or self.env['account.tax.group'].search([
                *self.env['account.tax.group']._check_company_domain(company),
                ('country_id', '=', False),
            ], limit=1)

    @api.depends('price_include_override')
    def _compute_price_include(self):
        for tax in self:
            tax.price_include = (
                tax.price_include_override == 'tax_included'
                or (tax.company_price_include == 'tax_included'
                    and not tax.price_include_override)
            )

    def _search_price_include(self, operator, value):
        if operator not in ('in', 'not in'):
            return NotImplemented
        assert list(value) == [True]
        tax_value = 'tax_included' if operator == 'in' else 'tax_excluded'
        return [
            '|', ('price_include_override', '=', tax_value),
                '&', ('price_include_override', '=', False),
                        ('company_price_include', '=', tax_value),
        ]

    @api.depends('company_id', 'company_id.domestic_fiscal_position_id', 'fiscal_position_ids')
    def _compute_is_domestic(self):
        for tax in self:
            tax.is_domestic = not tax.fiscal_position_ids or tax.company_id.domestic_fiscal_position_id in tax.fiscal_position_ids._origin

    @api.depends('fiscal_position_ids')
    def _compute_display_alternative_taxes_field(self):
        for tax in self:
            tax.display_alternative_taxes_field = (
                tax.original_tax_ids
                or (
                    tax.fiscal_position_ids
                    and tax.fiscal_position_ids._origin != tax.company_id.domestic_fiscal_position_id  # _origin used to get the actual records
                )
            )

    @api.depends('account_move_line_ids', 'account_reconcile_model_line_ids')
    def _compute_is_used(self):
        TaxesSudo = self.env['account.tax'].sudo()
        used_taxes = TaxesSudo.search([
            ('id', 'in', self._origin.ids),
            ('account_move_line_ids', '!=', False),
        ])
        if taxes_to_check := self._origin - used_taxes:
            used_taxes |= TaxesSudo.search([
                ('id', 'in', taxes_to_check.ids),
                ('account_reconcile_model_line_ids', '!=', False),
            ])
        for tax in self:
            tax.is_used = tax._origin in used_taxes

    @api.depends('is_used', 'repartition_line_ids.account_id', 'repartition_line_ids.sequence', 'repartition_line_ids.factor_percent', 'repartition_line_ids.use_in_tax_closing', 'repartition_line_ids.tag_ids')
    def _compute_repartition_lines_str(self):
        for tax in self:
            repartition_lines_str = tax.repartition_lines_str or ""
            if tax.is_used:
                repartition_line_info = {}
                invoice_sequence = 0
                refund_sequence = 0
                for repartition_line in tax.repartition_line_ids.sorted(key=lambda r: (r.document_type, r.sequence)):
                    # Clean sequence numbers to avoid unnecessary logging when complex
                    # operations are executed such as:
                    #   1. Create a invoice repartition line with a factor of 50%
                    #   2. Delete the invoice line above
                    #   3. Update the last refund repartition line factor to 50%
                    sequence = (invoice_sequence := invoice_sequence + 1) if repartition_line.document_type == 'invoice' else (refund_sequence := refund_sequence + 1)
                    repartition_line_info[(repartition_line.document_type, sequence)] = {
                        _('Factor Percent'): repartition_line.factor_percent,
                        _('Account'): repartition_line.account_id.display_name or _('None'),
                        _('Tax Grids'): repartition_line.tag_ids.mapped('name') or _('None'),
                        _('Use in tax closing'): _('True') if repartition_line.use_in_tax_closing else _('False'),
                    }
                repartition_lines_str = str(repartition_line_info)
            tax.repartition_lines_str = repartition_lines_str

    def _message_log_repartition_lines(self, old_values_str, new_values_str):
        self.ensure_one()
        if not self.is_used:
            return

        old_line_values_dict = ast.literal_eval(old_values_str or '{}')
        new_line_values_dict = ast.literal_eval(new_values_str)

        # Categorize the lines that were added/removed/modified
        modified_lines = [
            (line, old_line_values_dict[line], new_line_values_dict[line])
            for line in old_line_values_dict.keys() & new_line_values_dict.keys()
        ]
        added_and_deleted_lines = [
            (line, self.env._('Removed'), old_line_values_dict[line])
            if line in old_line_values_dict
            else (line, self.env._('New'), new_line_values_dict[line])
            for line in old_line_values_dict.keys() ^ new_line_values_dict.keys()
        ]

        for (document_type, sequence), old_value, new_value in modified_lines:
            diff_keys = [key for key in old_value if old_value[key] != new_value[key]]
            if diff_keys:
                self._track_add(
                    {self.id: {fname: str(old_value[fname]) for fname in diff_keys}},  # everything logged as pure char
                    end_values={self.id: {fname: str(new_value[fname]) for fname in diff_keys}},  # everything logged as pure char
                    fields_info={fname: {'type': 'char', 'string': fname} for fname in diff_keys},
                    body=Markup("<b>{type}</b> {rep} {seq}").format(
                        type=document_type.capitalize(),
                        rep=_('repartition line'),
                        seq=sequence,
                    )
                )
                self._track_finalize()

        for (document_type, sequence), operation, value in added_and_deleted_lines:
            changed = [key for key in value if value[key]]
            if changed:
                self._track_add(
                    {self.id: {fname: False for fname in changed}},
                    end_values={self.id: {fname: str(value[fname]) for fname in changed}},  # everything logged as pure char
                    fields_info={fname: {'type': 'char', 'string': fname} for fname in changed},
                    body=Markup("<b>{op} {type}</b> {rep} {seq}").format(
                        op=operation,
                        type=document_type.capitalize(),
                        rep=_('repartition line'),
                        seq=sequence,
                    )
                )
                self._track_finalize()
        return

    def _track_execute(self, track_init_values, trackings, track_records=None):
        to_update, old_values, new_values = self.browse(), [], []
        super_trackings = {}
        for record in self:
            changes, tracking_values = trackings.get(record.id, (None, None))
            if changes and 'repartition_lines_str' in changes:
                to_update |= record
                repartition_lines_str_track = next((value for value in tracking_values if value.get('field_name') == 'repartition_lines_str'), {})
                old_values.append(repartition_lines_str_track.get('old_value_char'))
                new_values.append(repartition_lines_str_track.get('new_value_char'))
            super_changes = [fname for fname in changes if fname != 'repartition_lines_str']
            super_trackings[record.id] = (super_changes, tracking_values)
        res = super()._track_execute(track_init_values, super_trackings, track_records=track_records)
        for record, old_value, new_value in zip(to_update, old_values, new_values):
            record._message_log_repartition_lines(old_value, new_value)
        return res

    @api.depends('company_id')
    def _compute_invoice_repartition_line_ids(self):
        for tax in self:
            if not tax.invoice_repartition_line_ids:
                tax.invoice_repartition_line_ids = [
                    Command.create({'document_type': 'invoice', 'repartition_type': 'base', 'tag_ids': []}),
                    Command.create({'document_type': 'invoice', 'repartition_type': 'tax', 'tag_ids': []}),
                ]

    @api.depends('company_id')
    def _compute_refund_repartition_line_ids(self):
        for tax in self:
            if not tax.refund_repartition_line_ids:
                tax.refund_repartition_line_ids = [
                    Command.create({'document_type': 'refund', 'repartition_type': 'base', 'tag_ids': []}),
                    Command.create({'document_type': 'refund', 'repartition_type': 'tax', 'tag_ids': []}),
                ]

    @api.depends('invoice_repartition_line_ids.factor', 'invoice_repartition_line_ids.repartition_type')
    def _compute_has_negative_factor(self):
        for tax in self:
            tax_reps = tax.invoice_repartition_line_ids.filtered(lambda x: x.repartition_type == 'tax')
            tax.has_negative_factor = bool(tax_reps.filtered(lambda tax_rep: tax_rep.factor < 0.0))

    @staticmethod
    def _parse_name_search(name):
        """
        Parse the name to search the taxes faster.
        Technical:  0EUM      => 0%E%U%M
                    21M       => 2%1%M%   where the % represents 0, 1 or multiple characters in a SQL 'LIKE' search.
                    21" M"    => 2%1% M%
                    21" M"co  => 2%1% M%c%o%
        Examples:   0EUM      => VAT 0% EU M.
                    21M       => 21% M , 21% EU M, 21% M.Cocont and 21% EX M.
                    21" M"    => 21% M and 21% M.Cocont.
                    21" M"co  => 21% M.Cocont.
        """
        regex = r"(\"[^\"]*\")"
        list_name = re.split(regex, name)
        for i, name in enumerate(list_name.copy()):
            if not name:
                continue
            if re.search(regex, name):
                list_name[i] = "%" + name.replace("%", "_").replace("\"", "") + "%"
            else:
                list_name[i] = '%'.join(re.sub(r"\W+", "", name))
        return ''.join(list_name)

    @api.model
    def _search(self, domain, *args, **kwargs):
        """
        Intercept the search on `name` to allow searching more freely on taxes
        when using `like` or `ilike`.
        """
        def preprocess_name(cond):
            if (
                cond.field_expr in ('name', 'display_name')
                and cond.operator in ('like', 'ilike')
                and isinstance(cond.value, str)
            ):
                return Domain(cond.field_expr, cond.operator, AccountTax._parse_name_search(cond.value))
            return cond
        domain = Domain(domain).map_conditions(preprocess_name)
        return super()._search(domain, *args, **kwargs)

    def _check_repartition_lines(self, lines):
        self.ensure_one()

        base_line = lines.filtered(lambda x: x.repartition_type == 'base')
        if len(base_line) != 1:
            raise ValidationError(_("Invoice and credit note distribution should each contain exactly one line for the base."))

    @api.constrains('invoice_repartition_line_ids', 'refund_repartition_line_ids', 'repartition_line_ids')
    def _validate_repartition_lines(self):
        for record in self:
            # if the tax is an aggregation of its sub-taxes (group) it can have no repartition lines
            if record.amount_type == 'group' and \
                    not record.invoice_repartition_line_ids and \
                    not record.refund_repartition_line_ids:
                continue

            invoice_repartition_line_ids = record.invoice_repartition_line_ids.sorted(lambda l: (l.sequence, l.id))
            refund_repartition_line_ids = record.refund_repartition_line_ids.sorted(lambda l: (l.sequence, l.id))
            record._check_repartition_lines(invoice_repartition_line_ids)
            record._check_repartition_lines(refund_repartition_line_ids)

            if len(invoice_repartition_line_ids) != len(refund_repartition_line_ids):
                raise ValidationError(_("Invoice and credit note distribution should have the same number of lines."))

            if not invoice_repartition_line_ids.filtered(lambda x: x.repartition_type == 'tax') or \
                    not refund_repartition_line_ids.filtered(lambda x: x.repartition_type == 'tax'):
                raise ValidationError(_("Invoice and credit note repartition should have at least one tax repartition line."))

            index = 0
            while index < len(invoice_repartition_line_ids):
                inv_rep_ln = invoice_repartition_line_ids[index]
                ref_rep_ln = refund_repartition_line_ids[index]
                if inv_rep_ln.repartition_type != ref_rep_ln.repartition_type or inv_rep_ln.factor_percent != ref_rep_ln.factor_percent:
                    raise ValidationError(_("Invoice and credit note distribution should match (same percentages, in the same order)."))
                index += 1

            tax_reps = invoice_repartition_line_ids.filtered(lambda tax_rep: tax_rep.repartition_type == 'tax')
            total_pos_factor = sum(tax_reps.filtered(lambda tax_rep: tax_rep.factor > 0.0).mapped('factor'))
            if float_compare(total_pos_factor, 1.0, precision_digits=2):
                raise ValidationError(_("Invoice and credit note distribution should have a total factor (+) equals to 100."))
            total_neg_factor = sum(tax_reps.filtered(lambda tax_rep: tax_rep.factor < 0.0).mapped('factor'))
            if total_neg_factor and float_compare(total_neg_factor, -1.0, precision_digits=2):
                raise ValidationError(_("Invoice and credit note distribution should have a total factor (-) equals to 100."))

    @api.constrains('children_tax_ids', 'type_tax_use')
    def _check_children_scope(self):
        for tax in self:
            if tax._has_cycle('children_tax_ids'):
                raise ValidationError(_("Recursion found for tax “%s”.", tax.name))
            if any(
                child.type_tax_use not in ('none', tax.type_tax_use)
                or child.tax_scope not in (tax.tax_scope, False)
                for child in tax.children_tax_ids
            ):
                raise ValidationError(_('The application scope of taxes in a group must be either the same as the group or left empty.'))
            if any(
                child.amount_type == 'group'
                for child in tax.children_tax_ids
            ):
                raise ValidationError(_('Nested group of taxes are not allowed.'))

    @api.constrains('company_id')
    def _check_company_consistency(self):
        if self.env.context.get('from_account_tax_creation') is True:
            # we're creating a new tax, skip usage consistency check as there
            # could not be any usage prior to its creation.
            return
        for company, taxes in groupby(self, lambda tax: tax.company_id):
            if self.env['account.move.line'].search_count([
                '|',
                ('tax_line_id', 'in', [tax.id for tax in taxes]),
                ('tax_ids', 'in', [tax.id for tax in taxes]),
                '!', ('company_id', 'child_of', company.id)
            ], limit=1):
                raise UserError(_("You can't change the company of your tax since there are some journal items linked to it."))

    def _sanitize_vals(self, vals):
        """Normalize the create/write values."""
        sanitized = vals.copy()

        # Wrap plain text in <div> if description has no HTML tags to avoid the padding with automatically added <p>
        if sanitized.get('description'):
            sanitized['description'] = adapt_translated_field_value(
                self.env,
                self._fields["description"],
                sanitized.get('description'),
                lambda lang, v: f"<div>{v}</div>" if not re.search(r'<[^>]+>', v) else v,
            )

        # Allow to provide invoice_repartition_line_ids and refund_repartition_line_ids by dispatching them
        # correctly in the repartition_line_ids
        if 'repartition_line_ids' in sanitized and (
            'invoice_repartition_line_ids' in sanitized
            or 'refund_repartition_line_ids' in sanitized
        ):
            del sanitized['repartition_line_ids']
        for doc_type in ('invoice', 'refund'):
            fname = f"{doc_type}_repartition_line_ids"
            if fname in sanitized:
                repartition = sanitized.setdefault('repartition_line_ids', [])
                for command_vals in sanitized.pop(fname):
                    if command_vals[0] == Command.CREATE:
                        repartition.append(Command.create({'document_type': doc_type, **command_vals[2]}))
                    elif command_vals[0] == Command.UPDATE:
                        repartition.append(Command.update(command_vals[1], {'document_type': doc_type, **command_vals[2]}))
                    else:
                        repartition.append(command_vals)
                sanitized[fname] = []
        return sanitized

    @api.model_create_multi
    def create(self, vals_list):
        self.env.cr.cache.pop('retrieved_tax_map', None)
        # Remove all 'default_*' keys from the context except 'default_type_tax_use'
        # so that taxes quick-created from views retain the expected tax type.
        context = {
            k: v for k, v in self.env.context.items()
            if not k.startswith('default_') or k == 'default_type_tax_use'
        }
        context.update({
            'mail_create_nosubscribe': True,  # At create or message_post, do not subscribe the current user to the record thread
            'mail_auto_subscribe_no_notify': True,  # Do no notify users set as followers of the mail thread
            'mail_create_nolog': True,  # At create, do not log the automatic "<Document> created" message
            'from_account_tax_creation': True,  # At create, skip some usage consistency checks
        })
        taxes = super(AccountTax, self.with_context(context)).create([self._sanitize_vals(vals) for vals in vals_list])
        return taxes.with_context(self.env.context)

    def write(self, vals):
        self.env.cr.cache.pop('retrieved_tax_map', None)
        return super().write(self._sanitize_vals(vals))

    @api.depends('type_tax_use', 'tax_scope')
    @api.depends_context('append_fields', 'formatted_display_name')
    def _compute_display_name(self):
        type_tax_uses = dict(self._fields['type_tax_use']._description_selection(self.env))
        scopes = dict(self._fields['tax_scope']._description_selection(self.env))

        needs_markdown = self.env.context.get('formatted_display_name')
        wrapper = "\t--%s--" if needs_markdown else " (%s)"
        fields_to_include = set(self.env.context.get('append_fields') or [])

        for record in self:
            if name := record.name:
                if 'type_tax_use' in fields_to_include and (use := type_tax_uses.get(record.type_tax_use)):
                    name += wrapper % use
                if 'company_id' in fields_to_include and len(self.env.companies) > 1:
                    name += wrapper % record.company_id.display_name
                if needs_markdown and (scope := scopes.get(record.tax_scope)):  # scope is always in the dropdown options, never in the tag
                    name += wrapper % scope
                if record.country_id != record.company_id._accessible_branches()[:1].account_fiscal_country_id:
                    name += wrapper % record.country_code

            record.display_name = name

    @api.depends('name', 'invoice_label')
    def _compute_tax_label(self):
        for tax in self:
            tax.tax_label = tax.invoice_label or tax.name

    @api.depends(
        'invoice_repartition_line_ids.repartition_type',
        'invoice_repartition_line_ids.use_in_tax_closing',
        'invoice_repartition_line_ids.factor_percent',
    )
    def _compute_non_deductible_amount(self):
        for tax in self:
            tax.non_deductible_amount = sum(
                rep_line.factor_percent / 100.0
                for rep_line in tax.invoice_repartition_line_ids
                if rep_line.repartition_type == 'tax' and not rep_line.use_in_tax_closing
            )

    @api.onchange('amount_type')
    def onchange_amount_type(self):
        if self.amount_type != 'group':
            self.children_tax_ids = [(5,)]
        if self.amount_type == 'group':
            self.invoice_label = None

    @api.onchange('price_include')
    def onchange_price_include(self):
        if self.price_include:
            self.include_base_amount = True

    # -------------------------------------------------------------------------
    # HELPERS IN BOTH PYTHON/JAVASCRIPT (account_tax.js / account_tax.py)
    #
    # How the helpers fit together ([py]: python only). A record becomes a base line, the taxes of each base line are
    # evaluated into unrounded amounts, one solver rounds them, then views read the result. Every adjustment of a
    # rounded amount, in the solver or after it, is a target reached by '_reach_target'.
    #
    #   record (invoice line, sale line, pos line, dict...) with the stored 'tax_pins' / 'tax_rounding_subset'
    #     |
    #     | _prepare_base_line_for_taxes_computation         base_line['pins'] from _import_base_line_tax_pins
    #     v
    #   base lines
    #     |
    #     | _add_tax_details_in_base_lines(base_lines, company, rounding_policy, tax_lines)
    #     |   +- _get_tax_rounding_policy                     the policy, see TAX_ROUNDING_POLICIES, and the settings
    #     |   |                                               of the fiscal country, see TAX_ROUNDING_COUNTRY_SETTINGS
    #     |   +- _add_tax_details_in_base_line                EVALUATE each line: the 'raw_*' amounts
    #     |   |    +- _get_tax_details                        the tax formulas (rounded inside with the 'line' grain),
    #     |   |                                               and the taxes included in each base ('base_dependencies')
    #     |   |    +- _get_pins_reaching_total_included       a 'target_total_included' pin into pinned amounts
    #     |   +- _round_base_lines_tax_details                SOLVE: the rounded amounts, targets applied in order
    #     |        +- _round_and_pin_tax_details              1. each amount rounded on its own, then the pins
    #     |        +- _reach_tax_rounding_targets             2. 'tax' grain: each tax, then the document; with the
    #     |        |                                          'rounded' tax basis, the taxes in the order of their
    #     |        |                                          dependencies, on the rounded bases of the lines; then
    #     |        |                                          the converted currency from the other one
    #     |        +- _reach_tax_line_targets [py]            3. the existing tax lines
    #     v
    #   base lines with their 'tax_details' (unrounded and rounded amounts, per line and per tax data)
    #     |
    #     +- VIEWS (read only)
    #     |    +- _aggregate_tax_details                      the amounts per grouping key, of one line or of all
    #     |    +- _get_tax_totals_summary                     the totals of the document (tax totals widget)
    #     |    +- _prepare_tax_lines [py]                     the journal items, after the accounting data of the tax
    #     |    |                                              details (_add_accounting_data_in_base_lines_tax_details)
    #     |    +- _export_base_line_tax_pins                  the pins to store back into 'tax_pins'
    #     |
    #     +- LINES BUILT FROM OTHER LINES (amounts derived from the source lines, then frozen as pins)
    #     |    +- _prepare_down_payment_lines / _prepare_global_discount_lines
    #     |    |    1. _prepare_discountable_base_lines       the fixed taxes moved to their own lines:
    #     |    |                                              _dispatch_taxes_into_new_base_lines -> _extract_tax_data
    #     |    |    2. _reduce_base_lines_to_target_amount    merge (_reduce_base_lines_with_grouping_function),
    #     |    |                                              scale, _add_tax_details_in_base_lines, then each tax and
    #     |    |                                              the total reach their part (with the 'rounded' tax
    #     |    |                                              basis, the bases follow the taxes: solved again)
    #     |    |    3. _pin_base_lines_tax_details
    #     |    +- _dispatch_negative_base_lines [py]          the negative lines spread over the others, for the
    #     |    |    formats refusing them: _dispatch_return_of_merchandise_lines, _dispatch_global_discount_lines
    #     |    |    (_split_base_line [py]), each followed by its _squash_*_lines (_merge_tax_details + pins)
    #     |    +- _turn_removed_taxes_into_new_base_lines [py]: the extracted taxes merged into lines of their own
    #     |
    #     +- FORMATS [py] (EDI, fiscal devices, APIs), declared by a profile, see TAX_REPRESENTATION_PROFILE
    #          +- _represent_tax_details(base_lines, company, profile)
    #          |    +- _represent_net_amounts / _represent_gross_amounts: the unrounded amounts at the format precision
    #          |    +- _check_tax_representation              the identities of the format, never blocking
    #          +- _represent_tax_amounts                      the unrounded tax amounts per grouping key
    #
    #   _reach_target(items, field, target, precision_digits, weights) spreads the difference between a target and the
    #   sum of the amounts with _distribute_delta_amount_smoothly; _share_rounded_total shares a rounded total instead (the
    #   'total' spreading of a policy). They are used by the solver, the repartition lines
    #   (_add_accounting_data_to_base_line_tax_details), _split_tax_data / _split_base_line,
    #   _reduce_base_lines_to_target_amount, and by the formats within the rounding window of a currency
    #   (_reach_target_in_window).

    # TAXES COMPUTATION
    # -------------------------------------------------------------------------

    def _eval_taxes_computation_prepare_product_fields(self):
        """ Get the fields to create the evaluation context from the product for the taxes computation.
        The javascript code doesn't have this method: to use the product in the taxes computation js-side, preload these
        fields.

        [!] Only added python-side.

        :return: A set of fields to be extracted from the product to evaluate the taxes computation.
        """
        return set()

    def _eval_taxes_computation_prepare_product_uom_fields(self):
        """ Same as '_eval_taxes_computation_prepare_product_fields' for the unit of measure.

        [!] Only added python-side.

        :return: A set of fields to be extracted from the unit of measure to evaluate the taxes computation.
        """
        return set()

    @api.model
    def _eval_taxes_computation_prepare_default_values(self, model_name, field_names):
        """ Prepare the default values of the fields used by the taxes computation, to be considered when there is no record
        (no product, no unit of measure). The javascript code doesn't have this method: to use these fields in the taxes
        computation js-side, preload these default values.

        [!] Only added python-side.

        :param model_name:  'product.product' or 'uom.uom'.
        :param field_names: The fields returned by '_eval_taxes_computation_prepare_product[_uom]_fields'.
        :return: A mapping <field_name> => <field_info> where field_info is a dict containing:
            * type: the type of the field.
            * default_value: the default value in case there is no record.
        """
        default_value_map = {
            'integer': 0,
            'float': 0.0,
            'monetary': 0.0,
        }
        fields = self.env[model_name]._fields
        return {
            field_name: {
                'type': fields[field_name].type,
                'default_value': default_value_map[fields[field_name].type],
            }
            for field_name in field_names
        }

    @api.model
    def _eval_taxes_computation_prepare_values(self, default_values, record=None):
        """ Convert a product or a unit of measure into the values used by the taxes computation.

        [!] Only added python-side.

        :param default_values:  The default values generated by '_eval_taxes_computation_prepare_default_values'.
        :param record:          An optional product.product or uom.uom record.
        :return:                The values representing the record.
        """
        record = record and record.sudo()  # tax computation may depend on restricted fields
        return {
            field_name: record and record[field_name] or field_info['default_value']
            for field_name, field_info in default_values.items()
        }

    def _eval_taxes_computation_turn_to_product_values(self, product=None):
        """ Get the values representing the product for the taxes computation of the current taxes.

        [!] Only added python-side.

        :param product: An optional product.product record.
        :return:        The values representing the product.
        """
        field_names = self._eval_taxes_computation_prepare_product_fields()
        default_values = self._eval_taxes_computation_prepare_default_values('product.product', field_names)
        return self._eval_taxes_computation_prepare_values(default_values, record=product)

    def _eval_taxes_computation_turn_to_product_uom_values(self, product_uom=None):
        """ Get the values representing the unit of measure for the taxes computation of the current taxes.

        [!] Only added python-side.

        :param product_uom: An optional uom.uom record.
        :return:            The values representing the unit of measure.
        """
        field_names = self._eval_taxes_computation_prepare_product_uom_fields()
        default_values = self._eval_taxes_computation_prepare_default_values('uom.uom', field_names)
        return self._eval_taxes_computation_prepare_values(default_values, record=product_uom)

    def _flatten_taxes_and_sort_them(self):
        """ Flattens the taxes contained in this recordset, returning all the
        children at the bottom of the hierarchy, in a recordset, ordered by sequence.
          Eg. considering letters as taxes and alphabetic order as sequence :
          [G, B([A, D, F]), E, C] will be computed as [A, D, F, C, E, G]

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :return: A tuple <sorted_taxes, group_per_tax> where:
            - sorted_taxes is a recordset of taxes.
            - group_per_tax maps each tax to its parent group of taxes if exists.
        """
        def sort_key(tax):
            return tax.sequence, tax.id or None

        group_per_tax = {}
        sorted_taxes = self.env['account.tax']
        for tax in self.sorted(key=sort_key):
            if tax.amount_type == 'group':
                children = tax.children_tax_ids.sorted(key=sort_key)
                sorted_taxes |= children
                for child in children:
                    group_per_tax[child.id] = tax
            else:
                sorted_taxes |= tax
        return sorted_taxes, group_per_tax

    def _is_price_included(self, document_tax_mode=None, special_mode=False):
        """ Get the price_include value of the tax, taking into account the document_tax_mode.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param document_tax_mode:   The tax mode of the document.
        :return:                    True if the tax is price included, False otherwise.
        """
        self.ensure_one()
        if self.has_negative_factor:
            return False
        if special_mode == 'total_included':
            return True
        if special_mode == 'total_excluded':
            return False
        if self.price_include_override:
            return self.price_include_override == 'tax_included'
        if document_tax_mode:
            return document_tax_mode == 'tax_included'
        return self.price_include

    def _batch_for_taxes_computation(self, special_mode=False, filter_tax_function=None, document_tax_mode=None):
        """ Group the current taxes all together like price-included percent taxes or division taxes.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param special_mode:        The special mode of the taxes computation: False, 'total_excluded' or 'total_included'.
        :param filter_tax_function: Optional function to filter out some taxes from the computation.
        :param document_tax_mode:   The tax mode of the document.
        :return: A dictionary containing:
            * batch_per_tax: A mapping of each tax to its batch.
            * group_per_tax: A mapping of each tax retrieved from a group of taxes.
            * sorted_taxes: A recordset of all taxes in the order on which they need to be evaluated.
                            Note that we consider the sequence of the parent for group of taxes.
                            Eg. considering letters as taxes and alphabetic order as sequence :
                            [G, B([A, D, F]), E, C] will be computed as [A, D, F, C, E, G]
        """
        sorted_taxes, group_per_tax = self._flatten_taxes_and_sort_them()
        if filter_tax_function:
            sorted_taxes = sorted_taxes.filtered(filter_tax_function)

        results = {
            'batch_per_tax': {},
            'group_per_tax': group_per_tax,
            'sorted_taxes': sorted_taxes,
        }

        # Group them per batch.
        batch = self.env['account.tax']
        is_base_affected = False
        for tax in reversed(results['sorted_taxes']):
            if batch:
                same_batch = (
                    tax.amount_type == batch[0].amount_type
                    and (special_mode or tax._is_price_included(document_tax_mode) == batch[0]._is_price_included(document_tax_mode))
                    and tax.include_base_amount == batch[0].include_base_amount
                    and (
                        (tax.include_base_amount and not is_base_affected)
                        or not tax.include_base_amount
                    )
                )
                if not same_batch:
                    for batch_tax in batch:
                        results['batch_per_tax'][batch_tax.id] = batch
                    batch = self.env['account.tax']

            is_base_affected = tax.is_base_affected
            batch |= tax

        if batch:
            for batch_tax in batch:
                results['batch_per_tax'][batch_tax.id] = batch
        return results

    def _propagate_extra_taxes_base(self, tax, taxes_data, special_mode=False):
        """ In some cases, depending the computation order of taxes, the special_mode or the configuration
        of taxes (price included, affect base of subsequent taxes, etc), some taxes need to affect the base and
        the tax amount of the others. That's the purpose of this method: adding which tax need to be added as
        an 'extra_base' to the others.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param tax:             The tax for which we need to propagate the tax.
        :param taxes_data:      The computed values for taxes so far.
        :param special_mode:    The special mode of the taxes computation: False, 'total_excluded' or 'total_included'.
        """
        def get_tax_before():
            for tax_before in self:
                if tax_before in taxes_data[tax.id]['batch']:
                    break
                yield tax_before

        def get_tax_after():
            for tax_after in reversed(list(self)):
                if tax_after in taxes_data[tax.id]['batch']:
                    break
                yield tax_after

        def add_extra_base(other_tax, sign):
            tax_amount = taxes_data[tax.id]['tax_amount']
            if 'tax_amount' not in taxes_data[other_tax.id]:
                taxes_data[other_tax.id]['extra_base_for_tax'] += sign * tax_amount
            taxes_data[other_tax.id]['extra_base_for_base'] += sign * tax_amount
            taxes_data[other_tax.id]['base_dependencies'].append((tax.id, sign))

        if taxes_data[tax.id]['original_price_include']:

            # Suppose:
            # 1.
            # t1: price-excluded fixed tax of 1, include_base_amount
            # t2: price-included 10% tax
            # On a price unit of 120, t1 is computed first since the tax amount affects the price unit.
            # Then, t2 can be computed on 120 + 1 = 121.
            # However, since t1 is not price-included, its base amount is computed by removing first the tax amount of t2.
            # 2.
            # t1: price-included fixed tax of 1
            # t2: price-included 10% tax
            # On a price unit of 122, base amount of t2 is computed as 122 - 1 = 121
            if special_mode in (False, 'total_included'):
                if tax.include_base_amount:
                    for other_tax in get_tax_after():
                        if not other_tax.is_base_affected:
                            add_extra_base(other_tax, -1)
                else:
                    for other_tax in get_tax_after():
                        add_extra_base(other_tax, -1)
                for other_tax in get_tax_before():
                    add_extra_base(other_tax, -1)

            # Suppose:
            # 1.
            # t1: price-included 10% tax
            # t2: price-excluded 10% tax
            # If the price unit is 121, the base amount of t1 is computed as 121 / 1.1 = 110
            # With special_mode = 'total_excluded', 110 is provided as price unit.
            # To compute the base amount of t2, we need to add back the tax amount of t1.
            # 2.
            # t1: price-included fixed tax of 1, include_base_amount
            # t2: price-included 10% tax
            # On a price unit of 121, with t1 being include_base_amount, the base amount of t2 is 121
            # With special_mode = 'total_excluded' 109 is provided as price unit.
            # To compute the base amount of t2, we need to add the tax amount of t1 first
            else:  # special_mode == 'total_excluded'
                if tax.include_base_amount:
                    for other_tax in get_tax_after():
                        if other_tax.is_base_affected:
                            add_extra_base(other_tax, 1)

        else:

            # Case of a tax affecting the base of the subsequent ones, no price included taxes.
            if special_mode in (False, 'total_excluded'):
                if tax.include_base_amount:
                    for other_tax in get_tax_after():
                        if other_tax.is_base_affected:
                            add_extra_base(other_tax, 1)

            # Suppose:
            # 1.
            # t1: price-excluded 10% tax, include base amount
            # t2: price-excluded 10% tax
            # On a price unit of 100,
            # The tax of t1 is 100 * 1.1 = 110.
            # The tax of t2 is 110 * 1.1 = 121.
            # With special_mode = 'total_included', 121 is provided as price unit.
            # The tax amount of t2 is computed like a price-included tax: 121 / 1.1 = 110.
            # Since t1 is 'include base amount', t2 has already been subtracted from the price unit.
            # 2.
            # t1: price-excluded fixed tax of 1
            # t2: price-excluded 10% tax
            # On a price unit of 110, the tax of t2 is 110 * 1.1 = 121
            # With special_mode = 'total_included', 122 is provided as price unit.
            # The base amount of t2 should be computed by removing the tax amount of t1 first
            else:  # special_mode == 'total_included'
                if not tax.include_base_amount:
                    for other_tax in get_tax_after():
                        add_extra_base(other_tax, -1)
                for other_tax in get_tax_before():
                    add_extra_base(other_tax, -1)

    def _eval_tax_amount_fixed_amount(self, batch, raw_base, evaluation_context):
        """ Eval the tax amount for a single tax during the first ascending order for fixed taxes.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param batch:               The batch of taxes containing this tax.
        :param raw_base:            The base on which the tax should be computed.
        :param evaluation_context:  The context containing all relevant info to compute the tax.
        :return:                    The tax amount or None if it has be evaluated later.
        """
        if self.amount_type == 'fixed':
            sign = -1 if evaluation_context['price_unit'] < 0.0 else 1
            return sign * evaluation_context['quantity'] * self.amount

    def _eval_tax_amount_price_included(self, batch, raw_base, evaluation_context):
        """ Eval the tax amount for a single tax during the descending order for price-included taxes.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param batch:               The batch of taxes containing this tax.
        :param raw_base:            The base on which the tax should be computed.
        :param evaluation_context:  The context containing all relevant info to compute the tax.
        :return:                    The tax amount.
        """
        self.ensure_one()
        if self.amount_type == 'percent':
            total_percentage = sum(tax.amount for tax in batch) / 100.0
            to_price_excluded_factor = 1 / (1 + total_percentage) if total_percentage != -1 else 0.0
            return raw_base * to_price_excluded_factor * self.amount / 100.0

        if self.amount_type == 'division':
            return raw_base * self.amount / 100.0

    def _eval_tax_amount_price_excluded(self, batch, raw_base, evaluation_context):
        """ Eval the tax amount for a single tax during the second ascending order for price-excluded taxes.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param batch:               The batch of taxes containing this tax.
        :param raw_base:            The base on which the tax should be computed.
        :param evaluation_context:  The context containing all relevant info to compute the tax.
        :return:                    The tax amount.
        """
        self.ensure_one()
        if self.amount_type == 'percent':
            return raw_base * self.amount / 100.0

        if self.amount_type == 'division':
            total_percentage = sum(tax.amount for tax in batch) / 100.0
            incl_base_multiplicator = 1.0 if total_percentage == 1.0 else 1 - total_percentage
            return raw_base * self.amount / 100.0 / incl_base_multiplicator

    def _get_tax_details(
        self,
        price_unit,
        quantity,
        precision_rounding=0.01,
        product=None,
        product_uom=None,
        special_mode=False,
        filter_tax_function=None,
        document_tax_mode=None,
    ):
        """ Compute the tax/base amounts for the current taxes.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param price_unit:          The price unit of the line.
        :param quantity:            The quantity of the line.
        :param precision_rounding:  The precision used to round the amounts on each line, None to keep them unrounded.
        :param product:             The product of the line.
        :param product_uom:         The product uom of the line.
        :param special_mode:        Indicate a special mode for the taxes computation.
                            * total_excluded: The initial base of computation excludes all price-included taxes.
                            Suppose a tax of 21% price included. Giving 100 with special_mode = 'total_excluded'
                            will give you the same as 121 without any special_mode.
                            * total_included: The initial base of computation is the total with taxes.
                            Suppose a tax of 21% price excluded. Giving 121 with special_mode = 'total_included'
                            will give you the same as 100 without any special_mode.
                            Note: You can only expect accurate symmetrical taxes computation with not rounded price_unit
                            as input and unrounded amounts. Otherwise, it's not guaranteed.
        :param filter_tax_function: Optional function to filter out some taxes from the computation.
        :param document_tax_mode:   The tax mode of the document.
        :return: A dict containing:
            'evaluation_context':       The evaluation_context parameter.
            'taxes_data':               A list of dictionaries, one per tax containing:
                'tax':                      The tax record.
                'base':                     The base amount of this tax.
                'tax_amount':               The tax amount of this tax.
                'base_dependencies':        The amounts of the other taxes included in the base, as a list of
                                            tuples <tax id, sign>.
            'total_excluded':           The total without tax.
            'total_included':           The total with tax.
        """
        round_per_line = precision_rounding is not None

        def add_tax_amount_to_results(tax, tax_amount):
            taxes_data[tax.id]['tax_amount'] = tax_amount
            if round_per_line:
                taxes_data[tax.id]['tax_amount'] = float_round(taxes_data[tax.id]['tax_amount'], precision_rounding=precision_rounding)
            if tax.has_negative_factor:
                reverse_charge_taxes_data[tax.id]['tax_amount'] = -taxes_data[tax.id]['tax_amount']
            sorted_taxes._propagate_extra_taxes_base(tax, taxes_data, special_mode=special_mode)

        def eval_tax_amount(tax_amount_function, tax):
            is_already_computed = 'tax_amount' in taxes_data[tax.id]
            if is_already_computed:
                return

            tax_amount = tax_amount_function(
                taxes_data[tax.id]['batch'],
                raw_base + taxes_data[tax.id]['extra_base_for_tax'],
                evaluation_context,
            )
            if tax_amount is not None:
                add_tax_amount_to_results(tax, tax_amount)

        def prepare_tax_extra_data(tax, **kwargs):
            return {
                **kwargs,
                'tax': tax,
                'price_include': tax._is_price_included(document_tax_mode, special_mode),
                'original_price_include': tax._is_price_included(document_tax_mode),
                'document_tax_mode': document_tax_mode,
                'extra_base_for_tax': 0.0,
                'extra_base_for_base': 0.0,
                'base_dependencies': [],
            }

        # Flatten the taxes, order them and filter them if necessary.
        batching_results = self._batch_for_taxes_computation(special_mode=special_mode, filter_tax_function=filter_tax_function, document_tax_mode=document_tax_mode)
        sorted_taxes = batching_results['sorted_taxes']
        taxes_data = {}
        reverse_charge_taxes_data = {}
        for tax in sorted_taxes:
            taxes_data[tax.id] = prepare_tax_extra_data(
                tax,
                group=batching_results['group_per_tax'].get(tax.id),
                batch=batching_results['batch_per_tax'][tax.id],
            )
            if tax.has_negative_factor:
                reverse_charge_taxes_data[tax.id] = {
                    **taxes_data[tax.id],
                    'is_reverse_charge': True,
                }

        raw_base = quantity * price_unit
        if round_per_line:
            raw_base = float_round(raw_base, precision_rounding=precision_rounding)

        evaluation_context = {
            'product': sorted_taxes._eval_taxes_computation_turn_to_product_values(product=product),
            'uom': sorted_taxes._eval_taxes_computation_turn_to_product_uom_values(product_uom=product_uom),
            'price_unit': price_unit,
            'quantity': quantity,
            'raw_base': raw_base,
            'special_mode': special_mode,
            'document_tax_mode': document_tax_mode,
        }

        # Define the order in which the taxes must be evaluated.
        # Fixed taxes are computed directly because they could affect the base of a price included batch right after.
        # Suppose:
        # t1: fixed tax of 1, include base amount
        # t2: 21% price included tax
        # If the price unit is 121, the base amount of t1 is computed as 121 / 1.1 = 110
        # With special_mode = 'total_excluded', 110 is provided as price unit.
        # To compute the base amount of t2, we need to add back the tax amount of t1.
        for tax in reversed(sorted_taxes):
            eval_tax_amount(tax._eval_tax_amount_fixed_amount, tax)

        # Then, let's travel the batches in the reverse order and process the price-included taxes.
        for tax in reversed(sorted_taxes):
            if taxes_data[tax.id]['price_include']:
                eval_tax_amount(tax._eval_tax_amount_price_included, tax)

        # Then, let's travel the batches in the normal order and process the price-excluded taxes.
        for tax in sorted_taxes:
            if not taxes_data[tax.id]['price_include']:
                eval_tax_amount(tax._eval_tax_amount_price_excluded, tax)

        # Mark the base to be computed in the descending order. The order doesn't matter for no special mode or 'total_excluded' but
        # it must be in the reverse order when special_mode is 'total_included'.
        subsequent_taxes = self.env['account.tax']
        for tax in reversed(sorted_taxes):
            tax_data = taxes_data[tax.id]
            if 'tax_amount' not in tax_data:
                continue

            # Base amount.
            tax_id_str = str(tax.id)
            total_tax_amount = sum(taxes_data[other_tax.id]['tax_amount'] for other_tax in tax_data['batch'])
            total_tax_amount += sum(
                reverse_charge_taxes_data[other_tax.id]['tax_amount']
                for other_tax in taxes_data[tax.id]['batch']
                if other_tax.has_negative_factor
            )
            base = raw_base + tax_data['extra_base_for_base']
            if tax_data['price_include'] and special_mode in (False, 'total_included'):
                base -= total_tax_amount
            tax_data['base'] = base

            # Subsequent taxes.
            tax_data['taxes'] = self.env['account.tax']
            if tax.include_base_amount:
                tax_data['taxes'] |= subsequent_taxes

            # Reverse charge.
            if tax.has_negative_factor:
                reverse_charge_tax_data = reverse_charge_taxes_data[tax.id]
                reverse_charge_tax_data['base'] = base
                reverse_charge_tax_data['taxes'] = tax_data['taxes']

            if tax.is_base_affected:
                subsequent_taxes |= tax

        taxes_data_list = []
        for tax_data in taxes_data.values():
            if 'tax_amount' in tax_data:
                taxes_data_list.append(tax_data)
                tax = tax_data['tax']
                if tax.has_negative_factor:
                    taxes_data_list.append(reverse_charge_taxes_data[tax.id])

        if taxes_data_list:
            total_excluded = taxes_data_list[0]['base']
            tax_amount = sum(tax_data['tax_amount'] for tax_data in taxes_data_list)
            total_included = total_excluded + tax_amount
        else:
            total_included = total_excluded = raw_base

        return {
            'total_excluded': total_excluded,
            'total_included': total_included,
            'taxes_data': [
                {
                    'tax': tax_data['tax'],
                    'taxes': tax_data['taxes'],
                    'group': batching_results['group_per_tax'].get(tax_data['tax'].id) or self.env['account.tax'],
                    'batch': batching_results['batch_per_tax'][tax_data['tax'].id],
                    'tax_amount': tax_data['tax_amount'],
                    'price_include': tax_data['price_include'],
                    'original_price_include': tax_data['original_price_include'],
                    'base_amount': tax_data['base'],
                    'base_dependencies': tax_data['base_dependencies'],
                    'is_reverse_charge': tax_data.get('is_reverse_charge', False),
                }
                for tax_data in taxes_data_list
            ],
        }

    # -------------------------------------------------------------------------
    # MAPPING PRICE_UNIT
    # -------------------------------------------------------------------------

    @api.model
    def _adapt_price_unit_to_another_taxes(self, price_unit, product, original_taxes, new_taxes, product_uom=None, document_tax_mode=None):
        """ From the price unit and taxes given as parameter, compute a new price unit corresponding to the
        new taxes.

        For example, from price_unit=106 and taxes=[6% tax-included], this method can compute a price_unit=121
        if new_taxes=[21% tax-included].

        The price_unit is only adapted when all taxes in 'original_taxes' are price-included even when
        'new_taxes' contains price-included taxes. This is made that way for the following example:

        Suppose a fiscal position B2C mapping 15% tax-excluded => 6% tax-included.
        If price_unit=100 with [15% tax-excluded], the price_unit is computed as 100 / 1.06 instead of becoming 106.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param price_unit:          The original price_unit.
        :param product:             The product.
        :param original_taxes:      A recordset of taxes from where you come from.
        :param new_taxes:           A recordset of the taxes you are mapping the price unit to.
        :param product_uom:         The product uom.
        :param document_tax_mode:   The tax mode of the document.
        :return:                    The price_unit after mapping of taxes.
        """
        if original_taxes == new_taxes or any(not tax._is_price_included(document_tax_mode) for tax in original_taxes):
            return price_unit

        # Find the price unit without tax.
        taxes_computation = original_taxes._get_tax_details(
            price_unit,
            1.0,
            precision_rounding=None,
            product=product,
            product_uom=product_uom,
            document_tax_mode=document_tax_mode,
        )
        price_unit = taxes_computation['total_excluded']

        # Find the new price unit after applying the price included taxes.
        taxes_computation = new_taxes._get_tax_details(
            price_unit,
            1.0,
            precision_rounding=None,
            product=product,
            product_uom=product_uom,
            special_mode='total_excluded',
        )
        delta = sum(x['tax_amount'] for x in taxes_computation['taxes_data'] if x['tax']._is_price_included(document_tax_mode))
        return price_unit + delta

    # -------------------------------------------------------------------------
    # GENERIC REPRESENTATION OF BUSINESS OBJECTS & METHODS
    # -------------------------------------------------------------------------

    @api.model
    def _export_base_line_tax_pins(self, base_line):
        """ Export the pins of a base line (see '_prepare_base_line_for_taxes_computation') into a value for a 'tax_pins'
        json field. The pins keep the values of the base line they were computed for, under 'valid_for', so they are
        dropped as soon as the line is edited (see '_import_base_line_tax_pins').

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_line: A base line generated by '_prepare_base_line_for_taxes_computation'.
        :return: A dictionary to be stored into a 'tax_pins' field, empty if nothing is pinned.
        """
        if not base_line['pins']:
            return {}
        return {
            **base_line['pins'],
            'valid_for': {
                'currency_id': base_line['currency_id'].id,
                'price_unit': base_line['price_unit'],
                'discount': base_line['discount'],
                'quantity': base_line['quantity'],
                'rate': base_line['rate'],
                'tax_ids': base_line['tax_ids']._flatten_taxes_and_sort_them()[0].ids,
            },
        }

    @api.model
    def _import_base_line_tax_pins(self, base_line, tax_pins):
        """ Turn the value of a 'tax_pins' json field back into the pins of the base line passed as parameter.
        Nothing is imported if the base line has been edited since the pins were exported (see 'valid_for').

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_line:   A base line generated by '_prepare_base_line_for_taxes_computation'.
        :param tax_pins:    The value stored in one of the 'tax_pins' fields.
        :return:            The pins of the base line, None if there is none to apply.
        """
        valid_for = tax_pins and tax_pins.get('valid_for')
        if not valid_for:
            return None

        currency = base_line['currency_id']
        if not (
            currency.id == valid_for['currency_id']
            and currency.compare_amounts(base_line['price_unit'], valid_for['price_unit']) == 0
            and currency.compare_amounts(base_line['discount'], valid_for['discount']) == 0
            and currency.compare_amounts(base_line['quantity'], valid_for['quantity']) == 0
            and set(base_line['tax_ids']._flatten_taxes_and_sort_them()[0].ids) == set(valid_for['tax_ids'])
        ):
            return None

        # The amounts in company currency follow the rate of the base line.
        delta_rate = base_line['rate'] / valid_for['rate'] if base_line['rate'] and valid_for['rate'] else 1.0
        pins = {key: value for key, value in tax_pins.items() if key != 'valid_for'}
        if 'total_excluded' in pins:
            pins['total_excluded'] /= delta_rate
        if 'tax_amounts' in pins:
            pins['tax_amounts'] = {
                tax_id_str: {
                    field: amount if field.endswith('_currency') else amount / delta_rate
                    for field, amount in amounts.items()
                }
                for tax_id_str, amounts in pins['tax_amounts'].items()
            }
        return pins

    @api.model
    def _reverse_quantity_base_line_tax_pins(self, tax_pins):
        """ Reverse all signs in the 'tax_pins' json value, the quantity they are valid for included.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param tax_pins: The value stored in one of the 'tax_pins' fields.
        :return: The tax pins but reversed.
        """
        if not tax_pins:
            return None

        new_tax_pins = copy.deepcopy(tax_pins)
        for field in ('total_excluded_currency', 'total_excluded', 'target_total_included'):
            if field in new_tax_pins:
                new_tax_pins[field] *= -1
        new_tax_pins['valid_for']['quantity'] *= -1
        for amounts in new_tax_pins.get('tax_amounts', {}).values():
            for field in amounts:
                amounts[field] *= -1
        return new_tax_pins

    def _turn_base_line_is_refund_flag_off(self, base_line):
        """ Reverse the sign of the quantity plus all data in tax details.

        [!] Only added python-side.

        :param base_line: The base_line.
        :return: The base_line that is no longer a refund line.
        """
        if not base_line['is_refund']:
            return base_line

        new_base_line = {
            **base_line,
            'quantity': -base_line['quantity'],
            'is_refund': False,
        }
        tax_details = new_base_line['tax_details']
        new_tax_details = new_base_line['tax_details'] = {
            f'{prefix}{field}{suffix}': -tax_details[f'{prefix}{field}{suffix}']
            for prefix in ('raw_', '')
            for field in ('total_excluded', 'total_included')
            for suffix in ('_currency', '')
        }

        new_tax_details['taxes_data'] = new_taxes_data = []
        for tax_data in tax_details['taxes_data']:
            new_tax_data = {**tax_data}
            for prefix in ('raw_', ''):
                for suffix in ('_currency', ''):
                    for field in ('base_amount', 'tax_amount'):
                        field = f'{prefix}{field}{suffix}'
                        new_tax_data[field] = -tax_data[field]
            new_taxes_data.append(new_tax_data)

        return new_base_line

    @api.model
    def _turn_base_lines_is_refund_flag_off(self, base_lines):
        """ Reverse the sign of the quantity plus all data in tax details.

        [!] Only added python-side.

        :param base_lines: The base_lines.
        :return: The base_lines that is no longer a refund lines.
        """
        return [self._turn_base_line_is_refund_flag_off(base_line) for base_line in base_lines]

    @api.model
    def _get_base_line_field_value_from_record(self, record, field, extra_values, fallback, from_base_line=False):
        """ Helper to extract a default value for a record or something looking like a record.

        Suppose field is 'product_id' and fallback is 'self.env['product.product']'

        if record is an account.move.line, the returned product_id will be `record.product_id._origin`.
        if record is a dict, the returned product_id will be `record.get('product_id', fallback)`.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param record:          A record or a dict or a falsy value.
        :param field:           The name of the field to extract.
        :param extra_values:    The extra kwargs passed in addition of 'record'.
        :param fallback:        The value to return if not found in record or extra_values.
        :param from_base_line:  Indicate if the value has to be retrieved automatically from the base_line and not the record.
                                False by default.
        :return:                The field value corresponding to 'field'.
        """
        need_origin = isinstance(fallback, models.Model)
        if field in extra_values:
            value = extra_values[field] or fallback
        elif isinstance(record, models.Model) and field in record._fields and not from_base_line:
            value = record[field]
        elif isinstance(record, dict):
            value = record.get(field, fallback)
        else:
            value = fallback
        if need_origin:
            value = value._origin
        return value

    @api.model
    def _prepare_base_line_for_taxes_computation(self, record, **kwargs):
        """ Convert any representation of a business object ('record') into a base line being a python
        dictionary that will be used to use the generic helpers for the taxes computation.

        The whole method is designed to ease the conversion from a business record.
        For example, when passing either account.move.line, either sale.order.line or purchase.order.line,
        providing explicitely a 'product_id' in kwargs is not necessary since all those records already have
        an `product_id` field.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param record:  A representation of a business object a.k.a a record or a dictionary.
        :param kwargs:  The extra values to override some values that will be taken from the record.
        :return:        A dictionary representing a base line.
        """
        def load(field, fallback):
            return self._get_base_line_field_value_from_record(record, field, kwargs, fallback)

        currency = (
            load('currency_id', None)
            or load('company_currency_id', None)
            or load('company_id', self.env['res.company']).currency_id
            or self.env['res.currency']
        )

        base_line = {
            **kwargs,
            'record': record,
            'id': load('id', 0),

            # Basic fields:
            'product_id': load('product_id', self.env['product.product']),
            'product_uom_id': load('product_uom_id', self.env['uom.uom']),
            'tax_ids': load('tax_ids', self.env['account.tax']),
            'price_unit': load('price_unit', 0.0),
            'quantity': load('quantity', 0.0),
            'discount': load('discount', 0.0),
            'currency_id': currency,

            # The special_mode for the taxes computation:
            # - False for the normal behavior.
            # - total_included to force all taxes to be price included.
            # - total_excluded to force all taxes to be price excluded.
            'special_mode': kwargs.get('special_mode') or False,

            # The document_tax_mode for the taxes computation:
            # - False for non-document cases.
            # - tax_included to get price_unit including all taxes.
            # - tax_excluded to get price_unit excluding all taxes.
            'document_tax_mode': load('document_tax_mode', False),

            # A special typing of base line for some custom behavior:
            # - False for the normal behavior.
            # - early_payment if the base line represent an early payment in mixed mode.
            # - cash_rounding if the base line is a delta to round the business object for the cash rounding feature.
            # - non_deductible if the base line is used to compute non deductible amounts in bills.
            'special_type': kwargs.get('special_type') or False,

            # All computation are managing the foreign currency and the local one.
            # This is the rate to be applied when generating the tax details (see '_add_tax_details_in_base_line').
            'rate': load('rate', 1.0),

            # Add a function allowing to filter out some taxes during the evaluation. Those taxes can't be removed from the base_line
            # when dealing with group of taxes to maintain a correct link between the child tax and its parent.
            'filter_tax_function': kwargs.get('filter_tax_function') or None,

            # ===== Accounting stuff =====

            # The sign of the business object regarding its accounting balance.
            'sign': load('sign', 1.0),

            # If the document is a refund or not to know which repartition lines must be used.
            'is_refund': load('is_refund', False),

            # Extra fields for tax lines generation:
            'partner_id': load('partner_id', self.env['res.partner']),
            'account_id': load('account_id', self.env['account.account']),
            'analytic_distribution': load('analytic_distribution', None),
        }

        tax_pins = load('tax_pins', None)
        pins = self._import_base_line_tax_pins(base_line, tax_pins)
        if pins:
            base_line['price_unit'] = tax_pins['valid_for']['price_unit']
        base_line.update({
            # Allow to split the computation of taxes on subset of lines. For example with a down payment of 300 on a sale order of 1000,
            # the last invoice will have an amount of 1000 - 300 = 700. However, the taxes should be computed in 2 subsets of lines:
            # - the original lines for a total of 1000.0
            # - the previous down payment lines for a total of -300.0
            # Stored in the 'tax_rounding_subset' fields.
            'computation_key': kwargs.get('computation_key') or load('tax_rounding_subset', None) or None,

            # The amounts forced on the line, for all computations inferring a base amount to reach a total known in advance
            # (E.g. down payment, combo products, global discounts, totals paid on a marketplace etc):
            # - total_excluded_currency / total_excluded:   The total without tax.
            # - tax_amounts:                                Per tax id, the 'base_amount(_currency)' / 'tax_amount(_currency)'.
            # - target_total_included:                      A total with tax to reach. The amounts above are derived from it
            #                                               when computing the taxes (see '_add_tax_details_in_base_line').
            # Stored in the 'tax_pins' fields.
            'pins': kwargs.get('pins') or pins,
        })

        # Propagate custom values.
        if record and isinstance(record, dict):
            for k, v in record.items():
                if k.startswith('_') and k not in base_line:
                    base_line[k] = v

        return base_line

    @api.model
    def _prepare_tax_line_for_taxes_computation(self, record, **kwargs):
        """ Convert any representation of an accounting tax line ('record') into a python
        dictionary that will be used to use by `_prepare_tax_lines` to detect which tax line
        could be updated, the ones to be created and the ones to be deleted.
        We can't use directly an account.move.line because this is also used by
        - expense (to create the journal entry)
        - the bank reconciliation widget
        All fields in this list are the same as the corresponding fields defined in account.move.line.

        The mechanism is the same as '_prepare_base_line_for_taxes_computation'.

        [!] Only added python-side.

        :param record:  A representation of a business object a.k.a a record or a dictionary.
        :param kwargs:  The extra values to override some values that will be taken from the record.
        :return:        A dictionary representing a tax line.
        """
        def load(field, fallback):
            return self._get_base_line_field_value_from_record(record, field, kwargs, fallback)

        currency = (
            load('currency_id', None)
            or load('company_currency_id', None)
            or load('company_id', self.env['res.company']).currency_id
            or self.env['res.currency']
        )

        return {
            **kwargs,
            'record': record,
            'id': load('id', 0),
            'tax_repartition_line_id': load('tax_repartition_line_id', self.env['account.tax.repartition.line']),
            'group_tax_id': load('group_tax_id', self.env['account.tax']),
            'tax_ids': load('tax_ids', self.env['account.tax']),
            'tax_tag_ids': load('tax_tag_ids', self.env['account.account.tag']),
            'currency_id': currency,
            'partner_id': load('partner_id', self.env['res.partner']),
            'account_id': load('account_id', self.env['account.account']),
            'analytic_distribution': load('analytic_distribution', None),
            'sign': load('sign', 1.0),
            'amount_currency': load('amount_currency', 0.0),
            'balance': load('balance', 0.0),
        }

    @api.model
    def _get_tax_rounding_policy(self, company, rounding_policy=None):
        """ Return the settings of a rounding policy for a company, see TAX_ROUNDING_POLICIES. The 'document' policy follows
        the tax rules of the fiscal country of the company, see TAX_ROUNDING_COUNTRY_SETTINGS.
        This is the only place resolving a policy: the javascript side receives the result through
        `res.company.tax_rounding_settings`.

        :param company:         The company.
        :param rounding_policy: The key of the policy in TAX_ROUNDING_POLICIES, the company's one by default.
        :return:                A new dictionary, as a value of TAX_ROUNDING_POLICIES.
        """
        rounding_policy = rounding_policy or company.tax_rounding_policy
        policy = dict(TAX_ROUNDING_POLICIES[rounding_policy])
        if rounding_policy == 'document':
            policy.update(TAX_ROUNDING_COUNTRY_SETTINGS.get(company.account_fiscal_country_id.code, {}))
        return policy

    @api.model
    def _add_tax_details_in_base_line(self, base_line, company, policy=None):
        """ Perform the taxes computation for the base line and add it to the base line under
        the 'tax_details' key. Those values are rounded or not depending of the tax rounding policy.
        The amounts still have to be rounded by '_round_base_lines_tax_details'; use '_add_tax_details_in_base_lines'
        to do both at once.

        The added tax_details is a dictionary containing:
        raw_total_excluded_currency:    The total without tax expressed in foreign currency.
        raw_total_excluded:             The total without tax expressed in local currency.
        raw_total_included_currency:    The total tax included expressed in foreign currency.
        raw_total_included:             The total tax included expressed in local currency.
        taxes_data:                     A list of python dictionary containing the taxes_data returned by '_get_tax_details' but
                                        with the amounts expressed in both currencies:
            raw_tax_amount_currency         The tax amount expressed in foreign currency.
            raw_tax_amount                  The tax amount expressed in local currency.
            raw_base_amount_currency        The tax base amount expressed in foreign currency.
            raw_base_amount                 The tax base amount expressed in local currency.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_line:   A base line generated by '_prepare_base_line_for_taxes_computation'.
        :param company:     The company owning the base line.
        :param policy:      The rounding policy, see '_get_tax_rounding_policy'. The company's one by default.
        """
        policy = policy or self._get_tax_rounding_policy(company)
        round_per_line = policy['tax_grain'] == 'line'
        price_unit_after_discount = base_line['price_unit'] * (1 - (base_line['discount'] / 100.0))
        taxes_computation = base_line['tax_ids']._get_tax_details(
            price_unit=price_unit_after_discount,
            quantity=base_line['quantity'],
            precision_rounding=base_line['currency_id'].rounding if round_per_line else None,
            product=base_line['product_id'],
            product_uom=base_line['product_uom_id'],
            special_mode=base_line['special_mode'],
            filter_tax_function=base_line['filter_tax_function'],
            document_tax_mode=base_line['document_tax_mode'],
        )

        # Only python side for professional with reverse charge
        if base_line['special_type'] == 'non_deductible':
            taxes_data = taxes_computation['taxes_data']
            taxes_computation['taxes_data'] = []
            for tax_data in taxes_data:
                if not tax_data.get('is_reverse_charge'):
                    taxes_computation['taxes_data'].append(tax_data)
                else:
                    taxes_computation['total_included'] -= tax_data['tax_amount']

        rate = base_line['rate']
        tax_details = base_line['tax_details'] = {
            'raw_total_excluded_currency': taxes_computation['total_excluded'],
            'raw_total_excluded': taxes_computation['total_excluded'] / rate if rate else 0.0,
            'raw_total_included_currency': taxes_computation['total_included'],
            'raw_total_included': taxes_computation['total_included'] / rate if rate else 0.0,
            'taxes_data': [],
        }
        if round_per_line:
            tax_details['raw_total_excluded'] = company.currency_id.round(tax_details['raw_total_excluded'])
            tax_details['raw_total_included'] = company.currency_id.round(tax_details['raw_total_included'])
        for tax_data in taxes_computation['taxes_data']:
            tax_amount = tax_data['tax_amount'] / rate if rate else 0.0
            base_amount = tax_data['base_amount'] / rate if rate else 0.0
            if round_per_line:
                tax_amount = company.currency_id.round(tax_amount)
                base_amount = company.currency_id.round(base_amount)
            tax_details['taxes_data'].append({
                **tax_data,
                'raw_tax_amount_currency': tax_data['tax_amount'],
                'raw_tax_amount': tax_amount,
                'raw_base_amount_currency': tax_data['base_amount'],
                'raw_base_amount': base_amount,
            })

        pins = base_line['pins']
        if pins and 'target_total_included' in pins and 'tax_amounts' not in pins:
            base_line['pins'] = {**pins, **self._get_pins_reaching_total_included(base_line, company, pins['target_total_included'])}

    @api.model
    def _get_pins_reaching_total_included(self, base_line, company, target_total_included):
        """ Compute the amounts to pin on a base line so that its total with taxes is exactly the one expected.
        The taxes are reduced like the base, then the base absorbs the remaining rounding difference.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_line:               A base line generated by '_prepare_base_line_for_taxes_computation'.
        :param company:                 The company owning the base line.
        :param target_total_included:   The expected total with taxes, in the currency of the base line.
        :return:                        The pins of the amounts, see '_pin_base_lines_tax_details'.
        """
        target_base_line = self._prepare_base_line_for_taxes_computation(base_line)
        self._add_tax_details_in_base_lines([target_base_line], company)
        reduced_base_lines = self._reduce_base_lines_to_target_amount([target_base_line], company, 'fixed', target_total_included)
        if not reduced_base_lines:
            return {}
        self._pin_base_lines_tax_details(reduced_base_lines, company)
        return reduced_base_lines[0]['pins'] or {}

    @api.model
    def _add_tax_details_in_base_lines(self, base_lines, company, rounding_policy=None, tax_lines=None):
        """ Compute the tax details of the base lines and round them with the same rounding policy.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:      A list of base lines.
        :param company:         The company owning the base lines.
        :param rounding_policy: The key of the policy in TAX_ROUNDING_POLICIES, the company's one by default.
        :param tax_lines:       See '_round_base_lines_tax_details'.
        """
        policy = self._get_tax_rounding_policy(company, rounding_policy)
        for base_line in base_lines:
            self._add_tax_details_in_base_line(base_line, company, policy)
        self._round_base_lines_tax_details(base_lines, company, tax_lines=tax_lines, policy=policy)

    @api.model
    def _normalize_target_factors(self, target_factors, allow_negative_factors=False):
        """ Normalize the factors passed as parameter to have a distribution having a sum of 1.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param target_factors:          A list of dictionary containing at least 'factor' being the weight
                                        defining how much delta will be allocated to this factor.
        :param allow_negative_factors:  Allow negative factors.
        :return:                        A list of tuple <index, normalized_factor> for each 'target_factors' passed as parameter.
        """
        factors = [
            (i, target_factor['factor'] if allow_negative_factors else abs(target_factor['factor']))
            for i, target_factor in enumerate(target_factors)
        ]
        plus_factors = [x for x in factors if x[1] >= 0]
        neg_factors = [x for x in factors if x[1] < 0]
        plus_factors.sort(key=lambda x: x[1], reverse=True)
        neg_factors.sort(key=lambda x: x[1])
        sum_of_factors = sum(x[1] for x in factors)
        plus_sum_of_factors = sum(x[1] for x in plus_factors)
        neg_sum_of_factors = sum(-x[1] for x in neg_factors)
        return {
            'plus_factors': [
                (i, factor / plus_sum_of_factors if plus_sum_of_factors else 1 / len(plus_factors))
                for i, factor in plus_factors
            ],
            'neg_factors': [
                (i, factor / neg_sum_of_factors if neg_sum_of_factors else 1 / len(neg_factors))
                for i, factor in neg_factors
            ],
            'sum_of_factors': sum_of_factors,
            'plus_sum_of_factors': plus_sum_of_factors,
            'neg_sum_of_factors': neg_sum_of_factors,
        }

    @api.model
    def _distribute_delta_amount_smoothly(self, precision_digits, delta_amount, target_factors, allow_negative_factors=False):
        """ Distribute 'delta_amount' across the factors passed as parameter.

        For example, if 'delta_amount' = 0.03 and precision_digits is 3 and target factors is a list of 3 factors:
        a) {'factor': 0.4}
        b) {'factor': 0.3}
        c) {'factor': 0.3}
        ... it means the delta will be distributed first on a) then b) then c).
        Since precision_digits = 3, it means we have a delta of "30" tenth of a hundred to be distributed.
        a) will take 30 * 0.4 = 12 units.
        b & c) will take 30 * 0.3 = 9 units each.
        The result of this method will be [0.012, 0.009, 0.009].

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param precision_digits:        The decimal places of the delta.
        :param delta_amount:            The delta amount to be distributed.
        :param target_factors:          A list of dictionary containing at least 'factor' being the weight
                                        defining how much delta will be allocated to this factor.
        :param allow_negative_factors:  Allow negative factors.
        :return:                        A list of floats, one per element in 'target_factors'.
        """
        if not target_factors:
            return []

        precision_rounding = float(f"1e-{precision_digits}")
        amounts_to_distribute = [0.0] * len(target_factors)
        if float_is_zero(delta_amount, precision_digits=precision_digits):
            return amounts_to_distribute

        sign = -1 if delta_amount < 0.0 else 1

        # Distribute using the factor first.
        normalize_results = self._normalize_target_factors(target_factors, allow_negative_factors=allow_negative_factors)
        sum_of_factors = normalize_results['sum_of_factors']
        plus_delta_factor = normalize_results['plus_sum_of_factors'] / sum_of_factors if sum_of_factors else 0.0
        neg_delta_factor = normalize_results['neg_sum_of_factors'] / sum_of_factors if sum_of_factors else 0.0

        for sign_factor, signed_factors, delta_factor in (
            (1, normalize_results['plus_factors'], plus_delta_factor),
            (-1, normalize_results['neg_factors'], neg_delta_factor),
        ):
            nb_of_errors = round(abs(delta_amount * delta_factor / precision_rounding))
            remaining_errors = nb_of_errors

            for index, factor in signed_factors:
                if not remaining_errors:
                    break

                nb_of_amount_to_distribute = min(
                    round(sign_factor * factor * nb_of_errors),
                    remaining_errors,
                )

                remaining_errors -= nb_of_amount_to_distribute
                amount_to_distribute = sign_factor * sign * nb_of_amount_to_distribute * precision_rounding
                amounts_to_distribute[index] += amount_to_distribute

            # Distribute the remaining cents across the factors.
            # There are sorted by the biggest first.
            # Since the factors are normalized, the residual number of cents can't be higher than the number of factors.
            for index in range(remaining_errors):
                amounts_to_distribute[signed_factors[index][0]] += sign_factor * sign * precision_rounding

        return amounts_to_distribute

    @api.model
    def _reach_target(self, items, field, target, precision_digits, weights=None, allow_negative_factors=False):
        """ Make the amounts 'field' of the items add up to 'target' by spreading the difference over them, in proportion to
        'weights' (the unrounded amounts 'raw_<field>' by default), see '_distribute_delta_amount_smoothly'.
        This is the only way the amounts are adjusted after being rounded: every rule of the rounding is a target on a group of
        amounts.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param items:               A list of dictionaries (tax details, tax data, repartition data...).
        :param field:               The key of the amount in the items.
        :param target:              The amount the items must add up to.
        :param precision_digits:    The precision of the amounts.
        :param weights:             The weight of each item.
        :param allow_negative_factors:  See '_distribute_delta_amount_smoothly'.
        :return:                    The amount added to each item.
        """
        if weights is None:
            weights = [item[f'raw_{field}'] for item in items]
        amounts_to_distribute = self._distribute_delta_amount_smoothly(
            precision_digits=precision_digits,
            delta_amount=target - sum(item[field] for item in items),
            target_factors=[{'factor': weight} for weight in weights],
            allow_negative_factors=allow_negative_factors,
        )
        for item, amount_to_distribute in zip(items, amounts_to_distribute):
            item[field] += amount_to_distribute
        return amounts_to_distribute

    @api.model
    def _share_rounded_total(self, items, field, weights, precision_digits, keep=None):
        """ Set the amounts 'field' of the items to their share of the rounded sum of 'weights', in proportion to them (the
        'total' spreading of the rounding policies). The positive and the negative weights get the rounding of their own sum
        first, so an item never gets an amount of the opposite sign of its weight.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param items:               A list of dictionaries.
        :param field:               The key of the amount in the items.
        :param weights:             The unrounded amount of each item.
        :param precision_digits:    The precision of the amounts.
        :param keep:                An optional list of booleans telling which items keep their amount (e.g. the pinned ones).
        """
        total = float_round(sum(weights), precision_digits=precision_digits)
        plus_indexes = [i for i, weight in enumerate(weights) if weight >= 0.0]
        neg_indexes = [i for i, weight in enumerate(weights) if weight < 0.0]
        sum_plus = sum(weights[i] for i in plus_indexes)
        sum_neg = sum(weights[i] for i in neg_indexes)
        if total > 0.0:
            total_plus = float_round(sum_plus, precision_digits=precision_digits)
            total_neg = float_round(total - total_plus, precision_digits=precision_digits)
        elif total < 0.0:
            total_neg = float_round(sum_neg, precision_digits=precision_digits)
            total_plus = float_round(total - total_neg, precision_digits=precision_digits)
        else:
            total_plus = float_round(sum_plus, precision_digits=precision_digits)
            total_neg = float_round(sum_neg, precision_digits=precision_digits)
        if not plus_indexes:
            total_neg += total_plus
        if not neg_indexes:
            total_plus += total_neg

        shares = [0.0] * len(items)
        for indexes, amount in ((plus_indexes, total_plus), (neg_indexes, total_neg)):
            amounts = self._distribute_delta_amount_smoothly(
                precision_digits=precision_digits,
                delta_amount=amount,
                target_factors=[{'factor': weights[i]} for i in indexes],
            )
            for i, share in zip(indexes, amounts):
                shares[i] = share
        for i, item in enumerate(items):
            if not keep or not keep[i]:
                item[field] = shares[i]

    @api.model
    def _group_tax_data(self, base_lines, grouping_function):
        """ Group the tax data of the base lines.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          A list of base lines.
        :param grouping_function:   A function taking <base_line, tax_data> as parameter and returning a hashable key.
        :return:                    A mapping <grouping_key, list of tuple <base_line, tax_data>>.
        """
        groups = defaultdict(list)
        for base_line in base_lines:
            for tax_data in base_line['tax_details']['taxes_data']:
                groups[grouping_function(base_line, tax_data)].append((base_line, tax_data))
        return groups

    @api.model
    def _is_tax_details_pinned(self, base_line, tax_data, field):
        """ Whether one amount of the tax details is pinned (see '_round_and_pin_tax_details'). An amount in company currency
        is pinned as soon as the same amount in foreign currency is.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_line:   A base line.
        :param tax_data:    One of the tax data of the base line, None for the amount without tax of the base line.
        :param field:       The key of the amount, e.g. 'tax_amount_currency' or 'total_excluded'.
        :return:            True if the amount is pinned.
        """
        pins = base_line['pins'] or {}
        if tax_data:
            pins = (pins.get('tax_amounts') or {}).get(str(tax_data['tax'].id)) or {}
        currency_field = field if field.endswith('_currency') else f'{field}_currency'
        return field in pins or currency_field in pins

    @api.model
    def _round_and_pin_tax_details(self, base_line, company):
        """ Round each amount of the tax details of the base line on its own, then replace the pinned ones by their pins.
        The amounts in company currency follow the rate of the base line when only the amount in foreign currency is pinned.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_line:   A base line.
        :param company:     The company owning the base line.
        """
        currency = base_line['currency_id']
        company_currency = company.currency_id
        rate = base_line['rate']
        tax_details = base_line['tax_details']
        pins = base_line['pins'] or {}
        pinned_tax_amounts = pins.get('tax_amounts') or {}

        amounts = [(tax_details, 'total_excluded', pins, 1)]
        for tax_data in tax_details['taxes_data']:
            tax_pins = pinned_tax_amounts.get(str(tax_data['tax'].id)) or {}
            amounts.append((tax_data, 'base_amount', tax_pins, 1))
            amounts.append((tax_data, 'tax_amount', tax_pins, -1 if tax_data['is_reverse_charge'] else 1))

        for values, field, field_pins, sign in amounts:
            currency_field = f'{field}_currency'
            if currency_field in field_pins:
                values[currency_field] = currency.round(sign * field_pins[currency_field])
            else:
                values[currency_field] = currency.round(values[f'raw_{currency_field}'])
            if field in field_pins:
                values[field] = company_currency.round(sign * field_pins[field])
            elif currency_field in field_pins and rate:
                values[field] = company_currency.round(values[currency_field] / rate)
            else:
                values[field] = company_currency.round(values[f'raw_{field}'])

    @api.model
    def _reach_tax_rounding_targets(self, base_lines, company, policy, tax_lines=None):
        """ The targets of the taxes rounded per tax ('tax' grain of the policy): the rounded amounts add up to the rounding of
        their unrounded sum, per tax first, then for the whole document.

        Suppose 2 lines, both having quantity=12.12, price_unit=12.12, tax=23% excluded.
        The tax of each line is round(12.12 * 12.12 * 0.23) = 33.79, while the tax of the document is
        round(12.12 * 12.12 * 0.23 * 2) = 67.57: -0.01 is spread over the tax amounts of the lines.
        The amount without tax of each line is round(12.12 * 12.12) = 146.89, while the one of the document is
        round(12.12 * 12.12 * 2) = 293.79: 0.01 is spread over the amounts without tax of the lines.

        The 'authority' of the policy (see TAX_ROUNDING_POLICIES) tells which total is the rounding of the unrounded one:
        * excluded:     the amount without tax.
        * included:     the amount with tax, the amount without tax absorbing the rounding of the tax.
                        Suppose a line having price_unit=100.0 and two price-included taxes of 10%: each tax amount is
                        round(100.0 / 1.2 * 0.1) = 8.33, so the amount without tax is 100.0 - 8.33 - 8.33 = 83.34.
        * mixed:        included or excluded depending on whether the taxes are price-included.

        With the 'rounded' tax basis, the amounts without tax are the ones of the lines instead: in the example, 146.89 each
        and 293.78 for the document, whose tax is round(293.78 * 0.23) = 67.57. The taxes are computed in the order of
        their dependencies, since a tax included in the base of another one is rounded first.

        With a converted currency, the amounts in this currency are converted from the rounded amounts in the other one:
        each rounded amount of a group is first distributed in proportion to the unrounded amounts of the group, so that
        their conversions add up to the conversion of the rounded amount.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:  A list of base lines.
        :param company:     The company owning the base lines.
        :param policy:      The rounding policy, see '_get_tax_rounding_policy'.
        :param tax_lines:   Optional tax lines to reach before deriving the base amounts from the tax amounts, see
                            '_reach_tax_line_targets'.
        """
        authority = policy['authority']
        share_total = policy['spreading'] == 'total'
        rounded_basis = policy['tax_basis'] == 'rounded'
        converted_suffix = '' if policy['converted_currency'] == 'company' else None
        company_currency = company.currency_id

        def is_included(price_include):
            return authority == 'included' or (authority == 'mixed' and price_include)

        def get_batch_taxes_data(base_line, tax_data):
            return [
                other_tax_data
                for other_tax_data in base_line['tax_details']['taxes_data']
                if other_tax_data['tax'] in tax_data['batch']
            ]

        # The unrounded amounts of the targets: the 'raw_*' ones, unless replaced by the ones computed on the rounded bases
        # or converted from the other currency.
        raw_amounts = {}

        def get_raw(values, field):
            return raw_amounts.get((id(values), field), values[f'raw_{field}'])

        def get_target(base_line, tax_data, field):
            values = tax_data or base_line['tax_details']
            return values[field] if self._is_tax_details_pinned(base_line, tax_data, field) else get_raw(values, field)

        # The rounded amount of a group distributed in proportion to the unrounded amounts of the group.
        settled_amounts = {}

        def settle(items_values, field):
            if not rounded_basis and converted_suffix is None:
                return
            weights = [get_raw(values, field) for values in items_values]
            total_weight = sum(weights)
            total = sum(values[field] for values in items_values)
            for values, weight in zip(items_values, weights):
                settled_amounts[id(values), field] = weight * total / total_weight if total_weight else values[field]

        def convert(base_line, values, field, settled_amount):
            rate = base_line['rate']
            raw_amounts[id(values), field] = settled_amount / rate if rate else 0.0

        # Per tax.
        tax_groups = self._group_tax_data(base_lines, lambda base_line, tax_data: (
            tax_data['tax'],
            base_line['currency_id'],
            base_line['is_refund'],
            tax_data['is_reverse_charge'],
            tax_data['price_include'],
            base_line['computation_key'],
        ))

        # With the 'rounded' tax basis: the amounts of the other taxes in the base of each tax, and the groups in the order
        # of these dependencies.
        dependencies = {}
        group_keys = list(tax_groups)
        if rounded_basis:
            for base_line in base_lines:
                taxes_data = base_line['tax_details']['taxes_data']
                main_taxes_data = {tax_data['tax'].id: tax_data for tax_data in taxes_data if not tax_data['is_reverse_charge']}
                for tax_data in taxes_data:
                    dependencies[id(tax_data)] = [
                        (main_taxes_data[tax_id], sign)
                        for tax_id, sign in tax_data.get('base_dependencies') or ()
                        if tax_id in main_taxes_data
                    ]
            group_key_per_tax_data = {
                id(tax_data): grouping_key
                for grouping_key, items in tax_groups.items()
                for _base_line, tax_data in items
            }
            sorted_group_keys = []
            while group_keys:
                ready_keys = [
                    grouping_key
                    for grouping_key in group_keys
                    if all(
                        group_key_per_tax_data[id(dependency)] in sorted_group_keys
                        for _base_line, tax_data in tax_groups[grouping_key]
                        for dependency, _sign in dependencies[id(tax_data)]
                    )
                ] or group_keys[:1]
                sorted_group_keys += ready_keys
                group_keys = [grouping_key for grouping_key in group_keys if grouping_key not in ready_keys]
            group_keys = sorted_group_keys

        def get_line_base(base_line, tax_data, suffix, currency, field_prefix):
            """ With the 'rounded' tax basis, the amount without tax of the line the base of the tax data starts from, plus
            the amounts of the other taxes included in it ('raw_' prefix: unrounded, 'settled_': settled, '': rounded).
            The price-included taxes exclude each other from their bases: a tax not settled yet counts unrounded. """
            tax_field = f'tax_amount{suffix}'
            raw_line_base = tax_data[f'raw_base_amount{suffix}'] - sum(
                sign * dependency[f'raw_{tax_field}']
                for dependency, sign in dependencies[id(tax_data)]
            )
            if tax_data['price_include']:
                raw_line_base += sum(other[f'raw_{tax_field}'] for other in get_batch_taxes_data(base_line, tax_data))
            if field_prefix == 'settled_':
                amounts = [
                    settled_amounts.get((id(dependency), tax_field), dependency[f'raw_{tax_field}'])
                    for dependency, _sign in dependencies[id(tax_data)]
                ]
            else:
                amounts = [dependency[f'{field_prefix}{tax_field}'] for dependency, _sign in dependencies[id(tax_data)]]
            line_base = currency.round(raw_line_base) if not field_prefix else raw_line_base
            return line_base + sum(sign * amount for (_dependency, sign), amount in zip(dependencies[id(tax_data)], amounts))

        def is_rate_tax(tax_data):
            return tax_data['tax'].amount_type in ('percent', 'division')

        # Per tax: the tax amounts.
        for suffix in ('_currency', ''):
            field = f'tax_amount{suffix}'
            base_field = f'base_amount{suffix}'
            for grouping_key in group_keys:
                items = tax_groups[grouping_key]
                currency = grouping_key[1] if suffix else company_currency
                taxes_data = [tax_data for _base_line, tax_data in items]
                if suffix == converted_suffix:
                    for base_line, tax_data in items:
                        convert(base_line, tax_data, field, settled_amounts[id(tax_data), f'{field}_currency'])
                elif rounded_basis and grouping_key[4]:
                    # A price-included tax is computed on the amount with tax, including the settled amounts of the others.
                    for base_line, tax_data in items:
                        raw_base = get_line_base(base_line, tax_data, suffix, currency, 'raw_')
                        if is_rate_tax(tax_data) and raw_base:
                            factor = get_line_base(base_line, tax_data, suffix, currency, 'settled_') / raw_base
                            raw_amounts[id(tax_data), field] = tax_data[f'raw_{field}'] * factor
                elif rounded_basis:
                    # A price-excluded tax is computed on the rounded bases, distributed in proportion to the unrounded ones.
                    bases = [
                        tax_data[base_field] if self._is_tax_details_pinned(base_line, tax_data, base_field)
                        else get_line_base(base_line, tax_data, suffix, currency, '')
                        for base_line, tax_data in items
                    ]
                    raw_bases = [get_line_base(base_line, tax_data, suffix, currency, 'settled_') for base_line, tax_data in items]
                    total_raw_base = sum(raw_bases)
                    base_factor = sum(bases) / total_raw_base if total_raw_base else 1.0
                    for tax_data, raw_base in zip(taxes_data, raw_bases):
                        if is_rate_tax(tax_data) and tax_data[f'raw_{base_field}']:
                            factor = raw_base * base_factor / tax_data[f'raw_{base_field}']
                            raw_amounts[id(tax_data), field] = tax_data[f'raw_{field}'] * factor

                if share_total:
                    self._share_rounded_total(
                        taxes_data,
                        field,
                        [get_raw(tax_data, field) for tax_data in taxes_data],
                        currency.decimal_places,
                        keep=[self._is_tax_details_pinned(base_line, tax_data, field) for base_line, tax_data in items],
                    )
                else:
                    target = sum(get_target(base_line, tax_data, field) for base_line, tax_data in items)
                    self._reach_target(taxes_data, field, currency.round(target), currency.decimal_places)
                if suffix != converted_suffix:
                    settle(taxes_data, field)

        # The existing tax lines are part of the totals the base amounts are derived from.
        if tax_lines:
            self._reach_tax_line_targets(base_lines, company, tax_lines)

        # Per tax: the base amounts.
        for suffix in ('_currency', ''):
            tax_field = f'tax_amount{suffix}'
            field = f'base_amount{suffix}'
            for grouping_key in group_keys:
                items = tax_groups[grouping_key]
                price_include = grouping_key[4]
                currency = grouping_key[1] if suffix else company_currency
                taxes_data = [tax_data for _base_line, tax_data in items]
                keep = [self._is_tax_details_pinned(base_line, tax_data, field) for base_line, tax_data in items]
                if suffix == converted_suffix:
                    for base_line, tax_data in items:
                        convert(base_line, tax_data, field, settled_amounts[id(tax_data), f'{field}_currency'])
                    if rounded_basis:
                        for tax_data, kept in zip(taxes_data, keep):
                            if not kept:
                                tax_data[field] = currency.round(get_raw(tax_data, field))
                        continue
                elif rounded_basis:
                    # The base of the line: its rounded amount without tax plus the rounded amounts of the other taxes.
                    for (base_line, tax_data), kept in zip(items, keep):
                        batch_taxes_data = get_batch_taxes_data(base_line, tax_data) if price_include else []
                        if not kept:
                            tax_data[field] = currency.round(
                                get_line_base(base_line, tax_data, suffix, currency, '')
                                - sum(other[tax_field] for other in batch_taxes_data)
                            )
                        settled_line_base = get_line_base(base_line, tax_data, suffix, currency, 'settled_')
                        raw_amounts[id(tax_data), field] = settled_line_base - sum(
                            settled_amounts[id(other), tax_field] for other in batch_taxes_data
                        )
                    settle(taxes_data, field)
                    continue

                if share_total and is_included(price_include):
                    batches_taxes_data = [get_batch_taxes_data(base_line, tax_data) for base_line, tax_data in items]
                    self._share_rounded_total(
                        taxes_data,
                        field,
                        [
                            get_raw(tax_data, field) + sum(get_raw(other, tax_field) for other in batch_taxes_data)
                            for tax_data, batch_taxes_data in zip(taxes_data, batches_taxes_data)
                        ],
                        currency.decimal_places,
                        keep=keep,
                    )
                    for tax_data, batch_taxes_data, kept in zip(taxes_data, batches_taxes_data, keep):
                        if not kept:
                            tax_data[field] = currency.round(tax_data[field] - sum(other[tax_field] for other in batch_taxes_data))
                elif share_total:
                    self._share_rounded_total(
                        taxes_data,
                        field,
                        [get_raw(tax_data, field) for tax_data in taxes_data],
                        currency.decimal_places,
                        keep=keep,
                    )
                else:
                    target_tax_amount = sum(get_target(base_line, tax_data, tax_field) for base_line, tax_data in items)
                    target = sum(get_target(base_line, tax_data, field) for base_line, tax_data in items)
                    if is_included(price_include):
                        target = (
                            currency.round(target + target_tax_amount)
                            - sum(tax_data[tax_field] for tax_data in taxes_data)
                        )
                    self._reach_target(taxes_data, field, currency.round(target), currency.decimal_places)
                if suffix != converted_suffix:
                    settle(taxes_data, field)

        # Whole document.
        document_groups = defaultdict(list)
        for base_line in base_lines:
            document_groups[base_line['currency_id'], base_line['is_refund'], base_line['computation_key']].append(base_line)
        for (currency, _is_refund, _key), group_base_lines in document_groups.items():
            is_included = authority == 'included' or (authority == 'mixed' and not any(
                not tax_data['price_include']
                and (not currency.is_zero(tax_data['tax_amount_currency']) or not company_currency.is_zero(tax_data['tax_amount']))
                for base_line in group_base_lines
                for tax_data in base_line['tax_details']['taxes_data']
            ))
            for suffix in ('_currency', ''):
                suffix_currency = currency if suffix else company_currency
                field = f'total_excluded{suffix}'
                tax_field = f'tax_amount{suffix}'
                taxes_details = [base_line['tax_details'] for base_line in group_base_lines]
                keep = [self._is_tax_details_pinned(base_line, None, field) for base_line in group_base_lines]
                if suffix == converted_suffix:
                    for base_line, tax_details in zip(group_base_lines, taxes_details):
                        taxes_data = tax_details['taxes_data']
                        if taxes_data:
                            settled_amount = settled_amounts[id(taxes_data[0]), f'base_amount{suffix}_currency']
                        else:
                            settled_amount = tax_details[f'{field}_currency']
                        convert(base_line, tax_details, field, settled_amount)
                if rounded_basis:
                    # The amount without tax of the line: the base of its first tax.
                    for tax_details, kept in zip(taxes_details, keep):
                        if kept:
                            continue
                        taxes_data = tax_details['taxes_data']
                        if suffix != converted_suffix and taxes_data:
                            tax_details[field] = taxes_data[0][f'base_amount{suffix}']
                        else:
                            tax_details[field] = suffix_currency.round(get_raw(tax_details, field))
                    continue

                if share_total:
                    weight_field = f'total_included{suffix}' if is_included else field
                    self._share_rounded_total(
                        taxes_details,
                        field,
                        [get_raw(tax_details, weight_field) for tax_details in taxes_details],
                        suffix_currency.decimal_places,
                        keep=keep,
                    )
                    if is_included:
                        for tax_details, kept in zip(taxes_details, keep):
                            if not kept:
                                tax_details[field] = suffix_currency.round(
                                    tax_details[field] - sum(tax_data[tax_field] for tax_data in tax_details['taxes_data'])
                                )
                    continue

                target = sum(get_target(base_line, None, field) for base_line in group_base_lines)
                tax_amount = 0.0
                if is_included:
                    for base_line in group_base_lines:
                        for tax_data in base_line['tax_details']['taxes_data']:
                            target += get_target(base_line, tax_data, tax_field)
                            tax_amount += tax_data[tax_field]
                if not target:
                    continue

                self._reach_target(
                    taxes_details,
                    field,
                    suffix_currency.round(target) - tax_amount,
                    suffix_currency.decimal_places,
                    weights=[get_raw(tax_details, f'total_included{suffix}') for tax_details in taxes_details] if is_included else None,
                )
                for tax_details in taxes_details:
                    tax_details[field] = suffix_currency.round(tax_details[field])

    @api.model
    def _reach_tax_line_targets(self, base_lines, company, tax_lines):
        """ The targets of the existing tax lines: the tax amounts of each tax add up to the tax lines, to keep the amounts
        the user set on them.

        [!] Only added python-side.

        :param base_lines:  A list of base lines.
        :param company:     The company owning the base lines.
        :param tax_lines:   A list of tax lines generated using the '_prepare_tax_line_for_taxes_computation' method.
        """
        tax_line_totals = defaultdict(lambda: {'_currency': 0.0, '': 0.0})
        for tax_line in tax_lines:
            tax_rep = tax_line['tax_repartition_line_id']
            totals = tax_line_totals[tax_rep.tax_id, tax_line['currency_id'], tax_rep.document_type == 'refund']
            totals['_currency'] += tax_line['sign'] * tax_line['amount_currency']
            totals[''] += tax_line['sign'] * tax_line['balance']

        tax_groups = self._group_tax_data(base_lines, lambda base_line, tax_data: (
            tax_data['tax'],
            base_line['currency_id'],
            base_line['is_refund'],
        ))
        for suffix in ('_currency', ''):
            field = f'tax_amount{suffix}'
            for grouping_key, items in tax_groups.items():
                if grouping_key not in tax_line_totals:
                    continue
                currency = grouping_key[1] if suffix else company.currency_id
                taxes_data = [tax_data for _base_line, tax_data in items]
                if not sum(tax_data[field] for tax_data in taxes_data):
                    continue
                self._reach_target(
                    taxes_data,
                    field,
                    tax_line_totals[grouping_key][suffix],
                    currency.decimal_places,
                    weights=[tax_data[field] for tax_data in taxes_data],
                )

    @api.model
    def _round_base_lines_tax_details(self, base_lines, company, tax_lines=None, policy=None):
        """ Round the 'raw_*' amounts of the tax details added by '_add_tax_details_in_base_line' into the amounts without
        prefix, the booked ones. Every rule of the rounding is a target on a group of amounts (see '_reach_target'), applied
        in this order:
        1. each amount is rounded on its own, then the pins replace the amounts they fix (see '_round_and_pin_tax_details'),
        2. with the taxes rounded per tax, the amounts of each tax, then of the whole document, are the rounding of their
           unrounded sum (see '_reach_tax_rounding_targets'). With the taxes rounded per line, the amounts are rounded while
           computing the taxes so there is nothing left to do,
        3. with tax lines, the tax amounts of each tax add up to them (see '_reach_tax_line_targets').

        The rounding of the document lands in the amounts of the lines: the amounts of a line are the booked ones, so they
        depend on the other lines of the document. Suppose two lines having price_unit=21.53 and a 21% price-included tax,
        with the taxes rounded per tax:
        l1: price_subtotal = 17.80, price_total = 21.53, tax = 3.73
        l2: price_subtotal = 17.79, price_total = 21.53, tax = 3.74
        The document has round(21.53 / 1.21 * 2) = 35.59 without tax, round(21.53 / 1.21 * 0.21 * 2) = 7.47 of tax.

        When there is an EDI, the unrounded amounts are reported with more decimals: use the 'raw_*' amounts instead of
        rounding the booked ones yourself.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:  A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:     The company owning the base lines.
        :param tax_lines:   An optional list of tax lines generated using the '_prepare_tax_line_for_taxes_computation' method,
                            whose amounts are kept.
        :param policy:      The rounding policy, see '_get_tax_rounding_policy'. The company's one by default.
        """
        policy = policy or self._get_tax_rounding_policy(company)
        for base_line in base_lines:
            self._round_and_pin_tax_details(base_line, company)

        # With the 'included' authority, the amounts without tax absorb the changes of the tax amounts set on the tax lines.
        tax_lines_first = bool(tax_lines) and policy['tax_grain'] == 'tax' and policy['authority'] == 'included'
        if policy['tax_grain'] == 'tax':
            self._reach_tax_rounding_targets(base_lines, company, policy, tax_lines=tax_lines if tax_lines_first else None)

        for base_line in base_lines:
            tax_details = base_line['tax_details']
            for suffix, currency in (('_currency', base_line['currency_id']), ('', company.currency_id)):
                tax_details[f'total_included{suffix}'] = currency.round(tax_details[f'total_excluded{suffix}'] + sum(
                    tax_data[f'tax_amount{suffix}']
                    for tax_data in tax_details['taxes_data']
                ))

        if tax_lines and not tax_lines_first:
            self._reach_tax_line_targets(base_lines, company, tax_lines)

    @api.model
    def _prepare_base_line_grouping_key(self, base_line):
        """ Used by '_prepare_tax_lines' to build the accounting grouping key to generate the tax lines.
        This method takes all relevant fields from the base line that will be used to build the grouping_key.

        [!] Only added python-side.

        :param base_line: A base line generated by '_prepare_base_line_for_taxes_computation'.
        :return: The grouping key to generate the tax line for a single base line.
        """
        return {
            'partner_id': base_line['partner_id'].id,
            'currency_id': base_line['currency_id'].id,
            'analytic_distribution': base_line['analytic_distribution'],
            'account_id': base_line['account_id'].id,
            'tax_ids': [Command.set(base_line['tax_ids'].ids)],
        }

    @api.model
    def _prepare_base_line_tax_repartition_grouping_key(self, base_line, base_line_grouping_key, tax_data, tax_rep_data):
        """ Used by '_prepare_tax_lines' to build the accounting grouping key to generate the tax lines.
        This method adds all relevant fields from a single tax data to the grouping key.

        [!] Only added python-side.

        :param base_line:               A base line generated by '_prepare_base_line_for_taxes_computation'.
        :param base_line_grouping_key:  The grouping key created by '_prepare_base_line_grouping_key'.
        :param tax_data:                One of the tax data in base_line['tax_details']['taxes_data'].
        :param tax_rep_data:            One of the tax repartition data in tax_data['tax_reps_data'].
        :return: The grouping key to generate the tax line for tax repartition line.
        """
        tax = tax_data['tax']
        tax_rep = tax_rep_data['tax_rep']
        return {
            **base_line_grouping_key,
            'tax_repartition_line_id': tax_rep.id,
            'partner_id': base_line['partner_id'].id,
            'currency_id': base_line['currency_id'].id,
            'group_tax_id': tax_data['group'].id,
            'analytic_distribution': (
                base_line_grouping_key['analytic_distribution']
                if tax.analytic or not tax_rep.use_in_tax_closing
                else False
            ),
            'account_id': tax_rep_data['account'].id or base_line_grouping_key['account_id'],
            'tax_ids': [Command.set(tax_rep_data['taxes'].ids)],
            'tax_tag_ids': [Command.set(tax_rep_data['tax_tags'].ids)],
            '__keep_zero_line': False,
        }

    @api.model
    def _prepare_tax_line_repartition_grouping_key(self, tax_line):
        """ Used by '_prepare_tax_lines' to build the accounting grouping key to know if the tax line could be updated
        or not when recomputing the tax lines.
        Take care this method should remain consistent regarding the grouping key built from the base line.

        [!] Only added python-side.

        :param tax_line: A tax line generated by '_prepare_tax_line_for_taxes_computation'.
        :return: The grouping key for the tax line passed as parameter.
        """
        return {
            'tax_repartition_line_id': tax_line['tax_repartition_line_id'].id,
            'partner_id': tax_line['partner_id'].id,
            'currency_id': tax_line['currency_id'].id,
            'group_tax_id': tax_line['group_tax_id'].id,
            'analytic_distribution': tax_line['analytic_distribution'],
            'account_id': tax_line['account_id'].id,
            'tax_ids': [Command.set(tax_line['tax_ids'].ids)],
            'tax_tag_ids': [Command.set(tax_line['tax_tag_ids'].ids)],
        }

    @api.model
    def _add_accounting_data_to_base_line_tax_details(self, base_line, company, include_caba_tags=False):
        """ Add all informations about repartition lines to base_line['tax_details']['taxes_data'].

        Considering a single tax_data, this method adds 'tax_reps_data', being a list of python dictionaries containing:
            tax_rep:                The account.tax.repartition.line record.
            tax_amount_currency:    The tax amount expressed in foreign currency.
            tax_amount:             The tax amount expressed in local currency.
            account:                The accounting account record to consider for this tax repartition line.
            taxes:                  The taxes to be set on the tax line if the tax affects the base of subsequent taxes.
            tax_tags:               The tags for the tax report.
            grouping_key:           The grouping key used to generate this tax line.

        This method also adds 'tax_tag_ids' to the base line containing the tags for the tax report.

        [!] Only added python-side.

        :param base_line:               A base line generated by '_prepare_base_line_for_taxes_computation'.
        :param company:                 The company owning the base line.
        :param include_caba_tags:       Indicate if the cash basis tags need to be taken into account.
        """
        is_refund = base_line['is_refund']
        currency = base_line['currency_id']
        product = base_line['product_id']
        company_currency = company.currency_id
        if is_refund:
            repartition_lines_field = 'refund_repartition_line_ids'
        else:
            repartition_lines_field = 'invoice_repartition_line_ids'

        # Tags on the base line.
        taxes_data = base_line['tax_details']['taxes_data']
        base_line['tax_tag_ids'] = self.env['account.account.tag']
        product_tags = self.env['account.account.tag']
        if product:
            countries = {tax_data['tax'].country_id for tax_data in taxes_data}
            countries.add(False)
            product_tags = product.sudo().account_tag_ids
            base_line['tax_tag_ids'] |= product_tags

        for tax_data in taxes_data:
            tax = tax_data['tax']

            # Tags on the base line.
            if not tax_data['is_reverse_charge'] and (include_caba_tags or tax.tax_exigibility == 'on_invoice'):
                base_line['tax_tag_ids'] |= tax[repartition_lines_field].filtered(lambda x: x.repartition_type == 'base').tag_ids

            # Compute repartition lines amounts.
            if tax_data['is_reverse_charge']:
                tax_reps = tax[repartition_lines_field].filtered(lambda x: x.repartition_type == 'tax' and x.factor < 0.0)
                tax_rep_sign = -1.0
            else:
                tax_reps = tax[repartition_lines_field].filtered(lambda x: x.repartition_type == 'tax' and x.factor >= 0.0)
                tax_rep_sign = 1.0

            tax_reps_data = tax_data['tax_reps_data'] = []
            for tax_rep in tax_reps:
                tax_amount_currency = tax_data.get('tax_amount_currency')

                if self.env.context.get('compute_all_use_raw_base_lines'):
                    tax_amount_currency = tax_data.get('raw_tax_amount_currency')

                tax_reps_data.append({
                    'tax_rep': tax_rep,
                    'tax_amount_currency': currency.round(tax_amount_currency * tax_rep.factor * tax_rep_sign),
                    'tax_amount': company_currency.round(tax_data['tax_amount'] * tax_rep.factor * tax_rep_sign),
                    'account': tax_rep._get_aml_target_tax_account(force_caba_exigibility=include_caba_tags) or base_line['account_id'],
                })

            # The repartition lines add up to the tax amount.
            sorted_tax_reps_data = sorted(
                tax_reps_data,
                key=lambda tax_rep: (-abs(tax_rep['tax_amount_currency']), -abs(tax_rep['tax_amount'])),
            )
            for suffix, suffix_currency in (('_currency', currency), ('', company_currency)):
                field = f'tax_amount{suffix}'
                target = tax_data[f'raw_{field}' if self.env.context.get('compute_all_use_raw_base_lines') else field]
                self._reach_target(
                    sorted_tax_reps_data,
                    field,
                    target,
                    suffix_currency.decimal_places,
                    weights=[tax_rep_data[field] for tax_rep_data in sorted_tax_reps_data],
                )

        subsequent_tags_per_tax = defaultdict(lambda: self.env['account.account.tag'])
        for tax_data in reversed(taxes_data):
            tax = tax_data['tax']

            for tax_rep_data in tax_data['tax_reps_data']:
                tax_rep = tax_rep_data['tax_rep']

                # Compute subsequent taxes/tags.
                tax_rep_data['taxes'] = tax_data['taxes']
                tax_rep_data['tax_tags'] = product_tags
                if include_caba_tags or tax.tax_exigibility == 'on_invoice':
                    tax_rep_data['tax_tags'] |= tax_rep.tag_ids
                if tax.include_base_amount:
                    for other_tax, tags in subsequent_tags_per_tax.items():
                        if tax != other_tax:
                            tax_rep_data['tax_tags'] |= tags

                # Add the accounting grouping_key to create the tax lines.
                base_line_grouping_key = self._prepare_base_line_grouping_key(base_line)
                tax_rep_data['grouping_key'] = self._prepare_base_line_tax_repartition_grouping_key(
                    base_line,
                    base_line_grouping_key,
                    tax_data,
                    tax_rep_data,
                )

            if tax.is_base_affected:
                if include_caba_tags or tax.tax_exigibility == 'on_invoice':
                    subsequent_tags_per_tax[tax] |= tax[repartition_lines_field].filtered(lambda x: x.repartition_type == 'base').tag_ids

    @api.model
    def _add_accounting_data_in_base_lines_tax_details(self, base_lines, company, include_caba_tags=False):
        """ Shortcut to call '_add_accounting_data_to_base_line_tax_details' on multiple base lines at once.

        [!] Only added python-side.

        :param base_lines:          A list of base lines.
        :param company:             The company owning the base lines.
        :param include_caba_tags:   Indicate if the cash basis tags need to be taken into account.
        """
        for base_line in base_lines:
            self._add_accounting_data_to_base_line_tax_details(base_line, company, include_caba_tags=include_caba_tags)

    # -------------------------------------------------------------------------
    # AGGREGATOR OF TAX DETAILS
    # -------------------------------------------------------------------------

    @api.model
    def _aggregate_tax_details(self, base_lines, grouping_function):
        """ Aggregate the tax details of the base lines according a custom grouping function passed as parameter.
        This method is mainly used by EDI to report the amounts per line (pass a single base line) and for the whole
        document. Most of the time, having the amounts grouped by tax is not enough because some details should be excluded,
        aggregated together or just moved into a separated section having another grouping key.

        In case a base line has no tax, the grouping_function is called with tax_data=None to get the grouping key for the
        line.

        Don't forget to call '_add_tax_details_in_base_lines' before calling this method.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          A list of base lines generated by '_prepare_base_line_for_taxes_computation'.
        :param grouping_function:   A function taking <base_line, tax_data> as parameter and returning anything
                                    that could be used as key in a dictionary.
        :return: A mapping <grouping_key, amounts> where:
            grouping_key                is the grouping_key returned by the 'grouping_function'.
            amounts                     is a dictionary containing:
                base_amount_currency:       The base amount of this grouping key expressed in foreign currency. The base of
                                            a base line counts once per grouping key.
                base_amount:                The base amount of this grouping key expressed in local currency.
                tax_amount_currency:        The tax amount of this grouping key expressed in foreign currency.
                tax_amount:                 The tax amount of this grouping key expressed in local currency.
                total_excluded_currency:    The amount without tax of the base lines involved in this grouping key, plus
                                            the amounts of the taxes affecting the base of the grouped taxes, expressed in
                                            foreign currency.
                total_excluded:             The same expressed in local currency.
                raw_*:                      The same amounts before any rounding.
                taxes_data:                 The tax data aggregated under this grouping_key.
                base_line_x_taxes_data:     A list of tuple <base_line, taxes_data> that associates for each base_line the
                                            subset of base_line['tax_details']['taxes_data'] aggregated under this grouping_key.
        """
        amount_fields = [
            f'{prefix}{field}{suffix}'
            for prefix in ('', 'raw_')
            for field in ('base_amount', 'tax_amount', 'total_excluded')
            for suffix in ('_currency', '')
        ]
        values_per_grouping_key = {}
        for base_line in base_lines:
            tax_details = base_line['tax_details']
            tax_amount_to_propagate = defaultdict(lambda: defaultdict(float))

            # The amounts of the base line per grouping key, added to the ones of the document afterwards.
            line_values_per_grouping_key = {}
            for tax_data in (tax_details['taxes_data'] or [None]):
                grouping_key = grouping_function(base_line, tax_data)
                if isinstance(grouping_key, dict):
                    grouping_key = frozendict(grouping_key)

                line_values = line_values_per_grouping_key.get(grouping_key)
                if line_values is None:
                    line_values = line_values_per_grouping_key[grouping_key] = {'taxes_data': []}
                    for prefix in ('', 'raw_'):
                        for suffix in ('_currency', ''):
                            total_excluded = tax_details[f'{prefix}total_excluded{suffix}']
                            if tax_data:
                                total_excluded += tax_amount_to_propagate[tax_data['tax']][f'{prefix}total_excluded{suffix}']
                            line_values[f'{prefix}total_excluded{suffix}'] = total_excluded
                            line_values[f'{prefix}base_amount{suffix}'] = tax_data[f'{prefix}base_amount{suffix}'] if tax_data else total_excluded
                            line_values[f'{prefix}tax_amount{suffix}'] = 0.0

                if tax_data:
                    for tax in tax_data['taxes']:
                        for prefix in ('', 'raw_'):
                            for suffix in ('_currency', ''):
                                tax_amount_to_propagate[tax][f'{prefix}total_excluded{suffix}'] += tax_data[f'{prefix}tax_amount{suffix}']
                    for prefix in ('', 'raw_'):
                        for suffix in ('_currency', ''):
                            line_values[f'{prefix}tax_amount{suffix}'] += tax_data[f'{prefix}tax_amount{suffix}']
                    line_values['taxes_data'].append(tax_data)

            for grouping_key, line_values in line_values_per_grouping_key.items():
                values = values_per_grouping_key.get(grouping_key)
                if values is None:
                    values = values_per_grouping_key[grouping_key] = {
                        **dict.fromkeys(amount_fields, 0.0),
                        'grouping_key': grouping_key,
                        'taxes_data': [],
                        'base_line_x_taxes_data': [],
                    }
                for field in amount_fields:
                    values[field] += line_values[field]
                values['taxes_data'] += line_values['taxes_data']
                values['base_line_x_taxes_data'].append((base_line, line_values['taxes_data']))
        return values_per_grouping_key

    # -------------------------------------------------------------------------
    # TAX TOTALS SUMMARY
    # -------------------------------------------------------------------------

    @api.model
    def _get_tax_totals_summary(self, base_lines, currency, company, cash_rounding=None):
        """ Compute the tax totals details for the business documents.

        Don't forget to call '_add_tax_details_in_base_lines' before calling this method.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param currency:            The tax totals is only available when all base lines share the same currency.
                                    Since the tax totals can be computed when there is no base line at all, a currency must be
                                    specified explicitely for that case.
        :param company:             The company owning the base lines.
        :param cash_rounding:       A optional account.cash.rounding object. When specified, the delta base amount added
                                    to perform the cash rounding is specified in the results.
        :return: A dictionary containing:
            currency_id:                            The id of the currency used.
            currency_pd:                            The currency rounding (to be used js-side by the widget).
            company_currency_id:                    The id of the company's currency used.
            company_currency_pd:                    The company's currency rounding (to be used js-side by the widget).
            has_tax_groups:                         Flag indicating if there is at least one involved tax group.
            same_tax_base:                          Flag indicating the base amount of all tax groups are the same and it's
                                                    redundant to display them.
            base_amount_currency:                   The untaxed amount expressed in foreign currency.
            base_amount:                            The untaxed amount expressed in local currency.
            tax_amount_currency:                    The tax amount expressed in foreign currency.
            tax_amount:                             The tax amount expressed in local currency.
            total_amount_currency:                  The total amount expressed in foreign currency.
            total_amount:                           The total amount expressed in local currency.
            cash_rounding_base_amount_currency:     The delta added by 'cash_rounding' expressed in foreign currency.
                                                    If there is no amount added, the key is not in the result.
            cash_rounding_base_amount:              The delta added by 'cash_rounding' expressed in local currency.
                                                    If there is no amount added, the key is not in the result.
            has_biggest_tax_cash_rounding:          Flag indicating the delta added by 'cash_rounding' has been added to the
                                                    tax group having the biggest tax amount.
                                                    If there is no amount added, the key is not in the result.
            subtotals:                              A list of subtotal (like "Untaxed Amount"), each one being a python dictionary
                                                    containing:
                base_amount_currency:                   The base amount expressed in foreign currency.
                base_amount:                            The base amount expressed in local currency.
                tax_amount_currency:                    The tax amount expressed in foreign currency.
                tax_amount:                             The tax amount expressed in local currency.
                tax_groups:                             A list of python dictionary, one for each tax group, containing:
                    id:                                     The id of the account.tax.group.
                    group_name:                             The name of the group.
                    group_label:                            The short label of the group to be displayed on POS receipt.
                    involved_tax_ids:                       A list of the tax ids aggregated in this tax group.
                    base_amount_currency:                   The base amount expressed in foreign currency.
                    base_amount:                            The base amount expressed in local currency.
                    tax_amount_currency:                    The tax amount expressed in foreign currency.
                    tax_amount:                             The tax amount expressed in local currency.
                    display_base_amount_currency:           The base amount to display expressed in foreign currency.
                                                            The flat base amount and the amount to be displayed are sometimes different
                                                            (e.g. division/fixed taxes).
                    display_base_amount:                    The base amount to display expressed in local currency.
                                                            The flat base amount and the amount to be displayed are sometimes different
                                                            (e.g. division/fixed taxes).
                    non_deductible_tax_amount_currency:     The tax delta added by 'non_deductible' expressed in foreign currency.
                                                            If there is no amount added, the key is not in the result.
                    non_deductible_tax_amount:              The tax delta added by 'non_deductible' expressed in local currency.
                                                            If there is no amount added, the key is not in the result.
        """
        tax_totals_summary = {
            'currency_id': currency.id,
            'currency_pd': currency.rounding,
            'company_currency_id': company.currency_id.id,
            'company_currency_pd': company.currency_id.rounding,
            'has_tax_groups': False,
            'subtotals': [],
            'base_amount_currency': 0.0,
            'base_amount': 0.0,
            'tax_amount_currency': 0.0,
            'tax_amount': 0.0,
        }

        # Global tax values.
        def global_grouping_function(base_line, tax_data):
            return True if tax_data else None

        values_per_grouping_key = self._aggregate_tax_details(base_lines, global_grouping_function)
        for grouping_key, values in values_per_grouping_key.items():
            if grouping_key:
                tax_totals_summary['has_tax_groups'] = True
            tax_totals_summary['base_amount_currency'] += values['total_excluded_currency']
            tax_totals_summary['base_amount'] += values['total_excluded']
            tax_totals_summary['tax_amount_currency'] += values['tax_amount_currency']
            tax_totals_summary['tax_amount'] += values['tax_amount']

        # Tax groups.
        untaxed_amount_subtotal_label = _("Untaxed Amount")
        subtotals = defaultdict(lambda: {
            'tax_groups': [],
            'tax_amount_currency': 0.0,
            'tax_amount': 0.0,
            'base_amount_currency': 0.0,
            'base_amount': 0.0,
        })

        def tax_group_grouping_function(base_line, tax_data):
            return tax_data['tax'].tax_group_id if tax_data else None

        values_per_grouping_key = self._aggregate_tax_details(base_lines, tax_group_grouping_function)
        sorted_total_per_tax_group = sorted(
            [values for grouping_key, values in values_per_grouping_key.items() if grouping_key],
            key=lambda values: (values['grouping_key'].sequence, values['grouping_key'].id),
        )

        encountered_base_amounts = set()
        subtotals_order = {}
        for order, values in enumerate(sorted_total_per_tax_group):
            tax_group = values['grouping_key']

            # Get all involved taxes in the tax group.
            involved_taxes = self.env['account.tax']
            involved_price_include = set()
            for base_line, taxes_data in values['base_line_x_taxes_data']:
                for tax_data in taxes_data:
                    tax = tax_data['tax']
                    involved_taxes |= tax
                    involved_price_include.add(tax_data['price_include'])

            # Compute the display base amounts.
            if set(involved_taxes.mapped('amount_type')) == {'fixed'}:
                display_base_amount = False
                display_base_amount_currency = False
            elif set(involved_taxes.mapped('amount_type')) == {'division'} and involved_price_include == {True}:
                display_base_amount = 0.0
                display_base_amount_currency = 0.0
                for base_line, _taxes_data in values['base_line_x_taxes_data']:
                    tax_details = base_line['tax_details']
                    display_base_amount += tax_details['total_excluded']
                    display_base_amount_currency += tax_details['total_excluded_currency']
                    for tax_data in tax_details['taxes_data']:
                        if tax_data['tax'].amount_type == 'division':
                            display_base_amount_currency += tax_data['tax_amount_currency']
                            display_base_amount += tax_data['tax_amount']
            else:
                display_base_amount = values['base_amount']
                display_base_amount_currency = values['base_amount_currency']

            if display_base_amount_currency is not False:
                encountered_base_amounts.add(float_repr(display_base_amount_currency, currency.decimal_places))

            # Order of the subtotals.
            preceding_subtotal = tax_group.preceding_subtotal or untaxed_amount_subtotal_label
            if preceding_subtotal not in subtotals_order:
                subtotals_order[preceding_subtotal] = order

            subtotals[preceding_subtotal]['tax_groups'].append({
                'id': tax_group.id,
                'involved_tax_ids': involved_taxes.ids,
                'tax_amount_currency': values['tax_amount_currency'],
                'tax_amount': values['tax_amount'],
                'base_amount_currency': values['base_amount_currency'],
                'base_amount': values['base_amount'],
                'display_base_amount_currency': display_base_amount_currency,
                'display_base_amount': display_base_amount,
                'group_name': tax_group.name,
                'group_label': tax_group.pos_receipt_label,
            })

        # Subtotals.
        if not subtotals:
            subtotals[untaxed_amount_subtotal_label]

        ordered_subtotals = sorted(subtotals.items(), key=lambda item: subtotals_order.get(item[0], 0))
        accumulated_tax_amount_currency = 0.0
        accumulated_tax_amount = 0.0
        for subtotal_label, subtotal in ordered_subtotals:
            subtotal['name'] = subtotal_label
            subtotal['base_amount_currency'] = tax_totals_summary['base_amount_currency'] + accumulated_tax_amount_currency
            subtotal['base_amount'] = tax_totals_summary['base_amount'] + accumulated_tax_amount
            for tax_group in subtotal['tax_groups']:
                subtotal['tax_amount_currency'] += tax_group['tax_amount_currency']
                subtotal['tax_amount'] += tax_group['tax_amount']
                accumulated_tax_amount_currency += tax_group['tax_amount_currency']
                accumulated_tax_amount += tax_group['tax_amount']
            tax_totals_summary['subtotals'].append(subtotal)

        # Cash rounding
        cash_rounding_lines = [base_line for base_line in base_lines if base_line['special_type'] == 'cash_rounding']
        if cash_rounding_lines:
            tax_totals_summary['cash_rounding_base_amount_currency'] = 0.0
            tax_totals_summary['cash_rounding_base_amount'] = 0.0
            for base_line in cash_rounding_lines:
                tax_details = base_line['tax_details']
                tax_totals_summary['cash_rounding_base_amount_currency'] += tax_details['total_excluded_currency']
                tax_totals_summary['cash_rounding_base_amount'] += tax_details['total_excluded']
        elif cash_rounding:
            strategy = cash_rounding.strategy
            cash_rounding_pd = cash_rounding.rounding
            cash_rounding_method = cash_rounding.rounding_method
            # Round first so cash rounding doesn't inflate a sub-unit float residue.
            total_amount_currency = currency.round(tax_totals_summary['base_amount_currency'] + tax_totals_summary['tax_amount_currency'])
            total_amount = company.currency_id.round(tax_totals_summary['base_amount'] + tax_totals_summary['tax_amount'])
            expected_total_amount_currency = float_round(
                total_amount_currency,
                precision_rounding=cash_rounding_pd,
                rounding_method=cash_rounding_method,
            )
            cash_rounding_base_amount_currency = expected_total_amount_currency - total_amount_currency
            rate = abs(total_amount_currency / total_amount) if total_amount else 0.0
            cash_rounding_base_amount = company.currency_id.round(cash_rounding_base_amount_currency / rate) if rate else 0.0
            if not currency.is_zero(cash_rounding_base_amount_currency):
                if strategy == 'add_invoice_line':
                    tax_totals_summary['cash_rounding_base_amount_currency'] = cash_rounding_base_amount_currency
                    tax_totals_summary['cash_rounding_base_amount'] = cash_rounding_base_amount
                    tax_totals_summary['base_amount_currency'] += cash_rounding_base_amount_currency
                    tax_totals_summary['base_amount'] += cash_rounding_base_amount
                    subtotals[untaxed_amount_subtotal_label]['base_amount_currency'] += cash_rounding_base_amount_currency
                    subtotals[untaxed_amount_subtotal_label]['base_amount'] += cash_rounding_base_amount
                elif strategy == 'biggest_tax':
                    all_subtotal_tax_group = [
                        (subtotal, tax_group)
                        for subtotal in tax_totals_summary['subtotals']
                        for tax_group in subtotal['tax_groups']
                        if not currency.is_zero(tax_group['tax_amount_currency'])
                    ]

                    if all_subtotal_tax_group:
                        max_subtotal, max_tax_group = max(
                            all_subtotal_tax_group,
                            key=lambda item: item[1]['tax_amount_currency'],
                        )
                        max_tax_group['tax_amount_currency'] += cash_rounding_base_amount_currency
                        max_tax_group['tax_amount'] += cash_rounding_base_amount
                        max_subtotal['tax_amount_currency'] += cash_rounding_base_amount_currency
                        max_subtotal['tax_amount'] += cash_rounding_base_amount
                        tax_totals_summary['tax_amount_currency'] += cash_rounding_base_amount_currency
                        tax_totals_summary['tax_amount'] += cash_rounding_base_amount
                        tax_totals_summary['has_biggest_tax_cash_rounding'] = True
                    else:
                        # Failed to apply the cash rounding since there is no tax.
                        cash_rounding_base_amount_currency = 0.0
                        cash_rounding_base_amount = 0.0

        # Subtract the cash rounding from the untaxed amounts.
        cash_rounding_base_amount_currency = tax_totals_summary.get('cash_rounding_base_amount_currency', 0.0)
        cash_rounding_base_amount = tax_totals_summary.get('cash_rounding_base_amount', 0.0)
        tax_totals_summary['base_amount_currency'] -= cash_rounding_base_amount_currency
        tax_totals_summary['base_amount'] -= cash_rounding_base_amount
        for subtotal in tax_totals_summary['subtotals']:
            subtotal['base_amount_currency'] -= cash_rounding_base_amount_currency
            subtotal['base_amount'] -= cash_rounding_base_amount
        encountered_base_amounts.add(float_repr(tax_totals_summary['base_amount_currency'], currency.decimal_places))
        tax_totals_summary['same_tax_base'] = len(encountered_base_amounts) == 1

        # Non deductible lines (this part is not implemented in the JS-part of the tax total summary computation)
        taxed_non_deductible_lines = [
            base_line
            for base_line in base_lines
            if base_line['special_type'] == 'non_deductible'
            and base_line['tax_ids']
        ]
        if taxed_non_deductible_lines:
            values_per_grouping_key = self._aggregate_tax_details(taxed_non_deductible_lines, tax_group_grouping_function)
            for subtotal in tax_totals_summary['subtotals']:
                for tax_group in subtotal['tax_groups']:
                    tax_values = values_per_grouping_key[self.env['account.tax.group'].browse(tax_group['id'])]
                    tax_group['non_deductible_tax_amount'] = tax_values['tax_amount']
                    tax_group['non_deductible_tax_amount_currency'] = tax_values['tax_amount_currency']

                    tax_group['tax_amount'] -= tax_values['tax_amount']
                    tax_group['tax_amount_currency'] -= tax_values['tax_amount_currency']
                    tax_group['base_amount'] -= tax_values['base_amount']
                    tax_group['base_amount_currency'] -= tax_values['base_amount_currency']

                    subtotal['tax_amount'] -= tax_values['tax_amount']
                    subtotal['tax_amount_currency'] -= tax_values['tax_amount_currency']

                    tax_totals_summary['tax_amount'] -= tax_values['tax_amount']
                    tax_totals_summary['tax_amount_currency'] -= tax_values['tax_amount_currency']

        # Total amount.
        tax_totals_summary['total_amount_currency'] = \
            tax_totals_summary['base_amount_currency'] + tax_totals_summary['tax_amount_currency'] + cash_rounding_base_amount_currency
        tax_totals_summary['total_amount'] = \
            tax_totals_summary['base_amount'] + tax_totals_summary['tax_amount'] + cash_rounding_base_amount

        return tax_totals_summary

    @api.model
    def _exclude_tax_groups_from_tax_totals_summary(self, tax_totals, ids_to_exclude):
        """ Helper to post-process the tax totals and wrap some tax groups into the base amount.
        It's used in some localizations to exclude some taxes from the details.

        [!] Only added python-side.

        :param tax_totals:          The tax totals generated by '_get_tax_totals_summary'.
        :param ids_to_exclude:      The ids of the tax groups to exclude.
        :return:                    A new tax totals without the excluded ids.
        """
        tax_totals = copy.deepcopy(tax_totals)
        ids_to_exclude = set(ids_to_exclude)

        subtotals = []
        for subtotal in tax_totals['subtotals']:
            tax_groups = []
            for tax_group in subtotal['tax_groups']:
                if tax_group['id'] in ids_to_exclude:
                    subtotal['base_amount_currency'] += tax_group['tax_amount_currency']
                    subtotal['base_amount'] += tax_group['tax_amount']
                    subtotal['tax_amount_currency'] -= tax_group['tax_amount_currency']
                    subtotal['tax_amount'] -= tax_group['tax_amount']
                    tax_totals['base_amount_currency'] += tax_group['tax_amount_currency']
                    tax_totals['base_amount'] += tax_group['tax_amount']
                    tax_totals['tax_amount_currency'] -= tax_group['tax_amount_currency']
                    tax_totals['tax_amount'] -= tax_group['tax_amount']
                else:
                    tax_groups.append(tax_group)

            if tax_groups:
                subtotal['tax_groups'] = tax_groups
                subtotals.append(subtotal)

        tax_totals['subtotals'] = subtotals
        return tax_totals

    # -------------------------------------------------------------------------
    # TAX LINES GENERATION
    # -------------------------------------------------------------------------

    @api.model
    def _prepare_tax_lines(self, base_lines, company, tax_lines=None, include_caba_tags=False):
        """ Prepare the tax journal items for the base lines.

        After calling '_add_tax_details_in_base_lines', the rounded tax details is there on base lines.
        This method first adds the accounting informations about the repartition lines to each tax_data in the tax details
        (see '_add_accounting_data_in_base_lines_tax_details'), then all 'tax_reps_data' in each 'tax_data' are
        aggregated all together and rounded. The total tax amount will not change whatever the number of involved accounting
        grouping keys.
        The 'sign' value in base lines is very important for this method because that key decide the sign
        of the 'amount_currency'/'balance' of the base lines/tax lines to be updated/created.

        Don't forget to call '_add_tax_details_in_base_lines' before calling this method.

        [!] Only added python-side.

        :param base_lines:          A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:             The company owning the base lines.
        :param tax_lines:           A optional list of base lines generated using the '_prepare_tax_line_for_taxes_computation'
                                    method. If specified, this method will indicate which tax lines must be deleted or updated instead
                                    of creating again all tax lines everytime.
        :param include_caba_tags:   Indicate if the cash basis tags need to be taken into account.
        :return: The base amounts for base lines and the full diff about tax lines as a dictionary containing:
            tax_lines_to_add:       A list of values to be passed to account.move.line's create function.
            tax_lines_to_delete:    The list of tax lines to be removed.
            tax_lines_to_update:    A list of tuple <tax_line, grouping_key, amounts> where:
                tax_line                is the tax line to be updated,
                grouping_key            is the accounting grouping key matching the tax line and used to determine the tax line can be
                                        updated instead of created again,
                amounts                 is a dictionary containing the new values for 'tax_base_amount', 'amount_currency', 'balance'.
            base_lines_to_update:   A list of tuple <base_line, amounts> where:
                base_line               is the base line to be updated.
                amounts                 is a dictionary containing the new values for 'tax_tag_ids', 'amount_currency', 'balance'.
        """
        self._add_accounting_data_in_base_lines_tax_details(base_lines, company, include_caba_tags=include_caba_tags)
        tax_lines_mapping = defaultdict(lambda: {
            'tax_base_amount': 0.0,
            'amount_currency': 0.0,
            'balance': 0.0,
        })

        base_lines_to_update = []
        for base_line in base_lines:
            sign = base_line['sign']
            tax_details = base_line['tax_details']
            base_lines_to_update.append((
                base_line,
                {
                    'tax_tag_ids': [Command.set(base_line['tax_tag_ids'].ids)],
                    'amount_currency': sign * tax_details['total_excluded_currency'],
                    'balance': sign * tax_details['total_excluded'],
                },
            ))
            for tax_data in tax_details['taxes_data']:
                tax = tax_data['tax']
                for tax_rep_data in tax_data['tax_reps_data']:
                    grouping_key = frozendict(tax_rep_data['grouping_key'])
                    tax_line = tax_lines_mapping[grouping_key]
                    tax_line['name'] = base_line.get('manual_tax_line_name', tax.name)
                    tax_line['tax_base_amount'] += sign * tax_data['base_amount']
                    tax_line['amount_currency'] += sign * tax_rep_data['tax_amount_currency']
                    tax_line['balance'] += sign * tax_rep_data['tax_amount']

        # Remove tax lines having a zero amount.
        tax_lines_mapping = {
            frozendict({grouping_k: k[grouping_k] for grouping_k in k if not grouping_k.startswith('__')}): v
            for k, v in tax_lines_mapping.items()
            if (
                k['__keep_zero_line'] or (
                    not self.env['res.currency'].browse(k['currency_id']).is_zero(v['amount_currency'])
                    or not company.currency_id.is_zero(v['balance'])
                )
            )
        }

        # Compute 'tax_lines_to_update' / 'tax_lines_to_delete' / 'tax_lines_to_add'.
        tax_lines_to_update = []
        tax_lines_to_delete = []
        for tax_line in tax_lines or []:
            grouping_key = frozendict(self._prepare_tax_line_repartition_grouping_key(tax_line))
            if grouping_key in tax_lines_mapping and grouping_key not in tax_lines_to_update:
                amounts = tax_lines_mapping.pop(grouping_key)
                tax_lines_to_update.append((tax_line, grouping_key, amounts))
            else:
                tax_lines_to_delete.append(tax_line)
        tax_lines_to_add = [{**grouping_key, **values} for grouping_key, values in tax_lines_mapping.items()]

        return {
            'tax_lines_to_add': tax_lines_to_add,
            'tax_lines_to_delete': tax_lines_to_delete,
            'tax_lines_to_update': tax_lines_to_update,
            'base_lines_to_update': base_lines_to_update,
        }

    # -------------------------------------------------------------------------
    # ADVANCED LINES MANIPULATION HELPERS
    # -------------------------------------------------------------------------

    def _can_be_discounted(self):
        """ Detect if a tax is affected by the discount.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :return: A boolean.
        """
        self.ensure_one()
        return self.amount_type not in ('fixed', 'code')

    @api.model
    def _merge_tax_details(self, tax_details_1, tax_details_2):
        """ Helper merging 2 tax details together coming from base lines.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param tax_details_1: First tax details.
        :param tax_details_2: Second tax details.
        :return: A new tax details combining the 2 passed as parameter.
        """
        results = {
            f'{prefix}{field}{suffix}': tax_details_1[f'{prefix}{field}{suffix}'] + tax_details_2[f'{prefix}{field}{suffix}']
            for prefix in ('raw_', '')
            for field in ('total_excluded', 'total_included')
            for suffix in ('_currency', '')
        }

        agg_taxes_data = {}
        for tax_details in (tax_details_1, tax_details_2):
            for tax_data in tax_details['taxes_data']:
                tax = tax_data['tax']
                if tax in agg_taxes_data:
                    agg_tax_data = agg_taxes_data[tax]
                    for prefix in ('raw_', ''):
                        for suffix in ('_currency', ''):
                            for field in ('base_amount', 'tax_amount'):
                                field_with_prefix = f'{prefix}{field}{suffix}'
                                agg_tax_data[field_with_prefix] += tax_data[field_with_prefix]
                else:
                    agg_taxes_data[tax] = dict(tax_data)
        results['taxes_data'] = list(agg_taxes_data.values())

        # In case there is some taxes that are in tax_details_1 but not on tax_details_2,
        # we have to shift manually the base amount. It happens with fixed taxes in which the base
        # is meaningless but still used in the computations.
        taxes_data_in_2 = {tax_data['tax'] for tax_data in tax_details_2['taxes_data']}
        not_discountable_taxes_data = {
            tax_data['tax']
            for tax_data in tax_details_1['taxes_data']
            if tax_data['tax'] not in taxes_data_in_2
        }
        for tax_data in results['taxes_data']:
            if tax_data['tax'] in not_discountable_taxes_data:
                for suffix in ('_currency', ''):
                    for prefix in ('raw_', ''):
                        tax_data[f'{prefix}base_amount{suffix}'] += tax_details_2[f'{prefix}total_excluded{suffix}']

        return results

    @api.model
    def _pin_base_lines_tax_details(self, base_lines, company, filter_function=None):
        """ Store the tax details into the pins of the base lines to fix the results.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:      A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:         The company owning the base lines.
        :param filter_function: An optional function taking <base_line, tax_data> as parameter and telling which tax will have
                                its amounts stored.
        """
        for base_line in base_lines:
            tax_details = base_line['tax_details']
            taxes_data = tax_details['taxes_data']
            if not taxes_data:
                continue

            pinned_tax_amounts = {}
            base_line['pins'] = {
                'total_excluded_currency': tax_details['total_excluded_currency'],
                'total_excluded': tax_details['total_excluded'],
                'tax_amounts': pinned_tax_amounts,
            }
            for tax_data in taxes_data:
                if tax_data['is_reverse_charge']:
                    continue
                tax = tax_data['tax']
                tax_id_str = str(tax.id)
                pinned_tax_amounts[tax_id_str] = {}
                if filter_function and not filter_function(base_line, tax_data):
                    continue

                pinned_tax_amounts[tax_id_str] = {
                    'tax_amount_currency': tax_data['tax_amount_currency'],
                    'tax_amount': tax_data['tax_amount'],
                    'base_amount_currency': tax_data['base_amount_currency'],
                    'base_amount': tax_data['base_amount'],
                }

    @api.model
    def _split_tax_data(self, base_line, tax_data, company, target_factors):
        """ Split a 'tax_data' in pieces according the factors passed as parameter.
        The unrounded amounts are scaled by the factors, the rounded ones reach exactly the ones of 'tax_data'.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_line:       A base line.
        :param tax_data:        The 'tax_data' to split.
        :param company:         The company owning the base lines.
        :param target_factors:  A list of dictionary containing at least 'factor' being the weight
                                defining how much delta will be allocated to this factor.
        :return                 A list of 'tax_data' having the same size as 'target_factors'.
        """
        new_taxes_data = [None] * len(target_factors)
        for index, factor in self._normalize_target_factors(target_factors)['plus_factors']:
            new_taxes_data[index] = dict(tax_data)
            for field in ('tax_amount_currency', 'tax_amount', 'base_amount_currency', 'base_amount'):
                new_taxes_data[index][f'raw_{field}'] = factor * tax_data[f'raw_{field}']
                new_taxes_data[index][field] = 0.0

        weights = [target_factor['factor'] for target_factor in target_factors]
        for suffix, currency in (('_currency', base_line['currency_id']), ('', company.currency_id)):
            for field in (f'tax_amount{suffix}', f'base_amount{suffix}'):
                self._reach_target(new_taxes_data, field, tax_data[field], currency.decimal_places, weights=weights)
        return new_taxes_data

    @api.model
    def _set_tax_details_total_included(self, tax_details, prefixes=('raw_', '')):
        """ Set the totals with tax of tax details built from other ones, as the totals without tax plus the tax amounts.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param tax_details: The tax details of a base line.
        :param prefixes:    The amounts to set: 'raw_' for the unrounded ones, '' for the rounded ones.
        """
        for prefix in prefixes:
            for suffix in ('_currency', ''):
                total_included = tax_details[f'{prefix}total_excluded{suffix}']
                for tax_data in tax_details['taxes_data']:
                    total_included += tax_data[f'{prefix}tax_amount{suffix}']
                tax_details[f'{prefix}total_included{suffix}'] = total_included

    @api.model
    def _split_base_line(self, base_line, company, target_factors, populate_function=None):
        """ Split a base lines into multiple ones. When computing taxes, the results should be
        exactly the same with a single base_line or after the split.

        [!] Only added python-side.

        :param base_line:           A base line.
        :param company:             The company owning the base line.
        :param target_factors:      A list of dictionary containing at least 'factor' being the weight
                                    defining how much delta will be allocated to this factor.
        :param populate_function:   An optional method to change the parameter of '_prepare_base_line_for_taxes_computation'
                                    when creating the new base lines from the one passed as parameter. This method takes
                                    the same parameter as '_prepare_base_line_for_taxes_computation'.
        :return:                    A list of base lines.
        """
        tax_details = base_line['tax_details']
        factors = self._normalize_target_factors(target_factors)['plus_factors']
        split_taxes_data = [self._split_tax_data(base_line, tax_data, company, target_factors) for tax_data in tax_details['taxes_data']]

        new_tax_details_list = [None] * len(target_factors)
        for index, factor in factors:
            new_tax_details_list[index] = {
                'raw_total_excluded_currency': factor * tax_details['raw_total_excluded_currency'],
                'raw_total_excluded': factor * tax_details['raw_total_excluded'],
                'raw_total_included_currency': factor * tax_details['raw_total_included_currency'],
                'raw_total_included': factor * tax_details['raw_total_included'],
                'total_excluded_currency': 0.0,
                'total_excluded': 0.0,
                'taxes_data': [new_taxes_data[index] for new_taxes_data in split_taxes_data],
            }
        for suffix, currency in (('_currency', base_line['currency_id']), ('', company.currency_id)):
            field = f'total_excluded{suffix}'
            self._reach_target(new_tax_details_list, field, tax_details[field], currency.decimal_places)

        new_base_lines = [None] * len(target_factors)
        for index, factor in factors:
            new_tax_details = new_tax_details_list[index]
            self._set_tax_details_total_included(new_tax_details, prefixes=('',))
            kwargs = {
                'price_unit': factor * base_line['price_unit'],
                'tax_details': new_tax_details,
            }
            if populate_function:
                populate_function(base_line, target_factors[index], kwargs)
            new_base_lines[index] = self._prepare_base_line_for_taxes_computation(base_line, **kwargs)
        return new_base_lines

    @api.model
    def _reduce_base_lines_with_grouping_function(self, base_lines, grouping_function=None, aggregate_function=None, computation_key=None):
        """ Merge the base lines having the same taxes (and the same key returned by 'grouping_function') into base lines
        having a quantity of 1, see '_merge_tax_details'.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          The base lines to be aggregated.
        :param grouping_function:   An optional function taking a base line as parameter and returning a grouping key
                                    being the way the base lines will be aggregated all together.
                                    By default, the base lines will be aggregated by taxes.
        :param aggregate_function:  An optional function taking the 2 base lines as parameter to be aggregated together.
        :param computation_key:     The computation_key to be set on the aggregated base_lines.
        :return:                    The base lines aggregated.
        """
        base_line_map = {}
        aggregated_base_lines = defaultdict(list)
        for base_line in base_lines:
            price_unit_after_discount = base_line['price_unit'] * (1 - (base_line['discount'] / 100.0))
            new_base_line = self._prepare_base_line_for_taxes_computation(
                base_line,
                price_unit=base_line['quantity'] * price_unit_after_discount,
                quantity=1.0,
                discount=0.0,
            )
            grouping_key = {'tax_ids': new_base_line['tax_ids']}
            if grouping_function:
                grouping_key.update(grouping_function(new_base_line))
            grouping_key = frozendict(grouping_key)

            target_base_line = base_line_map.get(grouping_key)
            if target_base_line:
                target_base_line['price_unit'] += new_base_line['price_unit']
                target_base_line['tax_details'] = self._merge_tax_details(
                    tax_details_1=target_base_line['tax_details'],
                    tax_details_2=base_line['tax_details'],
                )
            else:
                target_base_line = base_line_map[grouping_key] = self._prepare_base_line_for_taxes_computation(
                    new_base_line,
                    **grouping_key,
                    computation_key=computation_key,
                    tax_details={
                        **base_line['tax_details'],
                        'taxes_data': [dict(tax_data) for tax_data in base_line['tax_details']['taxes_data']],
                    },
                )
            if aggregate_function:
                aggregate_function(target_base_line, base_line)
            aggregated_base_lines[grouping_key].append(base_line)

        # The analytic distribution of a merged line is the one of its lines, weighted by their amounts.
        # Suppose line1 of 1000 having an analytic distribution of 100% and line2 of -100 having 50%: the merged line gets
        # ((1000 * 1) + (-100 * 0.5)) / (1000 - 100) = 1.055555556, or 100% when the total is zero.
        new_base_lines = []
        for grouping_key, base_line in base_line_map.items():
            if base_line['currency_id'].is_zero(base_line['price_unit']):
                continue
            total_factor = 0.0
            analytic_distribution_to_aggregate = defaultdict(float)
            for aggregated_base_line in aggregated_base_lines[grouping_key]:
                amount = aggregated_base_line['tax_details']['raw_total_excluded_currency']
                total_factor += amount
                for account_id, distribution in (aggregated_base_line['analytic_distribution'] or {}).items():
                    analytic_distribution_to_aggregate[account_id] += distribution * amount / 100.0
            base_line['analytic_distribution'] = {
                account_id: (amount * 100 / total_factor) if total_factor else 100.0
                for account_id, amount in analytic_distribution_to_aggregate.items()
            }
            new_base_lines.append(base_line)
        return new_base_lines

    @api.model
    def _get_tax_totals_per_tax(self, base_lines):
        """ Sum the rounded amounts of the base lines, per tax. The base of a tax counts once per base line, even when the tax
        has two tax data on it (reverse charge).

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:  A list of base lines.
        :return:            A tuple <totals, totals_per_tax> where 'totals' maps each currency suffix ('_currency', '') to the
                            total with tax and 'totals_per_tax' maps each tax to its 'tax_amount(_currency)' and
                            'base_amount(_currency)'.
        """
        totals = {'_currency': 0.0, '': 0.0}
        totals_per_tax = defaultdict(lambda: dict.fromkeys(('tax_amount_currency', 'tax_amount', 'base_amount_currency', 'base_amount'), 0.0))
        for base_line in base_lines:
            tax_details = base_line['tax_details']
            for suffix in ('_currency', ''):
                totals[suffix] += tax_details[f'total_excluded{suffix}']
            counted_taxes = set()
            for tax_data in tax_details['taxes_data']:
                tax = tax_data['tax']
                for suffix in ('_currency', ''):
                    totals[suffix] += tax_data[f'tax_amount{suffix}']
                    totals_per_tax[tax][f'tax_amount{suffix}'] += tax_data[f'tax_amount{suffix}']
                    if tax not in counted_taxes:
                        totals_per_tax[tax][f'base_amount{suffix}'] += tax_data[f'base_amount{suffix}']
                counted_taxes.add(tax)
        return totals, totals_per_tax

    @api.model
    def _reduce_base_lines_to_target_amount(
        self,
        base_lines,
        company,
        amount_type,
        amount,
        computation_key=None,
        grouping_function=None,
        aggregate_function=None,
        document_tax_mode=None,
    ):
        """ Create the base lines representing a part of the base lines passed as parameter (down payment, global discount...).
        The base lines are merged (see '_reduce_base_lines_with_grouping_function') and scaled. Then each tax reaches exactly its
        part of the tax and base amounts, and the base lines reach the part of the total.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:             The company of the base lines.
        :param amount_type:         'fixed' or 'percent' indicating the type of the part.
        :param amount:              The amount of the part in case of 'fixed' amount_type. Otherwise, a percentage [0-100].
        :param computation_key:     The key that will be used to split the base lines to round the tax amounts.
        :param grouping_function:   An optional function taking a base line as parameter and returning a grouping key
                                    being the way the base lines will be aggregated all together.
                                    By default, the base lines will be aggregated by taxes.
        :param aggregate_function:  An optional function taking the 2 base lines as parameter to be aggregated together.
        :param document_tax_mode:   The tax mode of the document.
        :return:                    A new list of base lines having total amounts exactly matching the expected 'amount'/'amount_type'.
        """
        if not base_lines:
            return []

        currency = base_lines[0]['currency_id']
        rate = base_lines[0]['rate']
        columns = (('_currency', currency), ('', company.currency_id))

        # The part of each total to reach.
        totals, totals_per_tax = self._get_tax_totals_per_tax(base_lines)
        sign = -1 if amount < 0.0 else 1
        if amount_type == 'fixed':
            percentage = (sign * amount / totals['_currency']) if totals['_currency'] else 0.0
            expected_total = currency.round(amount)
            expected_totals = {
                '_currency': expected_total,
                '': company.currency_id.round(expected_total / rate) if rate else 0.0,
            }
        else:  # if amount_type == 'percent':
            percentage = sign * amount / 100.0
            expected_totals = {suffix: suffix_currency.round(totals[suffix] * sign * percentage) for suffix, suffix_currency in columns}
        expected_totals_per_tax = {
            tax: {
                f'{prefix}_amount{suffix}': suffix_currency.round(tax_totals[f'{prefix}_amount{suffix}'] * sign * percentage)
                for prefix in ('tax', 'base')
                for suffix, suffix_currency in columns
            }
            for tax, tax_totals in totals_per_tax.items()
        }

        # Merge and scale the base lines.
        reduced_base_lines = self._reduce_base_lines_with_grouping_function(
            base_lines=base_lines,
            grouping_function=grouping_function,
            aggregate_function=aggregate_function,
            computation_key=computation_key,
        )
        if not reduced_base_lines:
            return []
        new_base_lines = [
            self._prepare_base_line_for_taxes_computation(
                base_line,
                price_unit=base_line['price_unit'] * sign * percentage,
                computation_key=computation_key,
            )
            for base_line in reduced_base_lines
        ]
        self._add_tax_details_in_base_lines(new_base_lines, company)
        sorted_base_lines = sorted(
            new_base_lines,
            key=lambda base_line: (bool(base_line['special_type']), -base_line['tax_details']['total_excluded_currency'])
        )

        # Each tax reaches its part. With the 'rounded' tax basis, the bases are the rounded amounts of the lines plus the
        # other taxes: they follow the tax amounts instead (see TAX_ROUNDING_POLICIES).
        rounded_basis = self._get_tax_rounding_policy(company)['tax_basis'] == 'rounded'
        _new_totals, new_totals_per_tax = self._get_tax_totals_per_tax(new_base_lines)
        for tax, new_tax_totals in new_totals_per_tax.items():
            taxes_data = [
                tax_data
                for base_line in sorted_base_lines
                for tax_data in base_line['tax_details']['taxes_data']
                if tax_data['tax'] == tax
            ]
            for suffix, suffix_currency in columns:
                for prefix in ('tax',) if rounded_basis else ('tax', 'base'):
                    if not new_tax_totals[f'{prefix}_amount_currency']:
                        continue
                    field = f'{prefix}_amount{suffix}'
                    self._reach_target(
                        taxes_data,
                        field,
                        # The base of a reverse charged tax counts once per base line, see '_get_tax_totals_per_tax'.
                        expected_totals_per_tax[tax][field] - new_tax_totals[field] + sum(tax_data[field] for tax_data in taxes_data),
                        suffix_currency.decimal_places,
                        weights=[abs(tax_data[f'{prefix}_amount_currency']) for tax_data in taxes_data],
                    )
        if rounded_basis:
            for base_line in new_base_lines:
                base_line['pins'] = {'tax_amounts': {
                    str(tax_data['tax'].id): {
                        'tax_amount_currency': tax_data['tax_amount_currency'],
                        'tax_amount': tax_data['tax_amount'],
                    }
                    for tax_data in base_line['tax_details']['taxes_data']
                    if not tax_data['is_reverse_charge']
                }}
            self._round_base_lines_tax_details(new_base_lines, company)

        # The base lines reach the part of the total.
        has_total_excluded = bool(sum(base_line['tax_details']['total_excluded_currency'] for base_line in new_base_lines))
        taxes_details = [base_line['tax_details'] for base_line in sorted_base_lines]
        for suffix, suffix_currency in columns:
            field = f'total_excluded{suffix}'
            amounts = self._reach_target(
                taxes_details,
                field,
                expected_totals[suffix] - sum(expected_tax_totals[f'tax_amount{suffix}'] for expected_tax_totals in expected_totals_per_tax.values()),
                suffix_currency.decimal_places,
                weights=[abs(tax_details['total_excluded_currency']) if has_total_excluded else 0.0 for tax_details in taxes_details],
            )
            for base_line, amount in zip(sorted_base_lines, amounts):
                tax_details = base_line['tax_details']
                tax_details[field] = suffix_currency.round(tax_details[field])
                tax_details[f'total_included{suffix}'] = suffix_currency.round(tax_details[f'total_included{suffix}'] + amount)
                if suffix:
                    base_line['price_unit'] += amount

        return new_base_lines

    @api.model
    def _prepare_discountable_base_lines(self, base_lines, company, exclude_function=None):
        """ Prepare base lines on which we can compute all kind of discount or down payment.
        This method moves all the taxes that are not eligible for a discount into new base lines.
        Those taxes are given by the '_can_be_discounted' method giving False if not discountable.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:             The company of the base lines.
        :param exclude_function:    An optional function taking a base line and a tax_data as parameter and returning
                                    a boolean indicating if the tax_data has to be exclude from the computation.
        :return:                    The base lines that are discountable.
        """
        def dispatch_exclude_function(base_line, tax_data):
            return not tax_data['tax']._can_be_discounted() or (exclude_function and exclude_function(base_line, tax_data))

        return self._dispatch_taxes_into_new_base_lines(base_lines, company, dispatch_exclude_function)

    # -------------------------------------------------------------------------
    # GLOBAL DISCOUNT
    # -------------------------------------------------------------------------

    @api.model
    def _prepare_global_discount_lines(
        self,
        base_lines,
        company,
        amount_type,
        amount,
        computation_key='global_discount',
        grouping_function=None,
    ):
        """ Prepare negative lines to be added representing a global discount.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:             The company of the base lines.
        :param amount_type:         'fixed' or 'percent' indicating the type of the discount.
        :param amount:              The amount to be discounted in case of 'fixed' amount_type. Otherwise, a percentage [0-100].
        :param computation_key:     The key that will be used to split the base lines to round the tax amounts.
        :param grouping_function:   An optional function taking a base line as parameter and returning a grouping key
                                    being the way the base lines will be aggregated all together.
                                    By default, the base lines will be aggregated by taxes.
        :return:                    The negative base lines representing the global discount.
        """
        new_base_lines = self._reduce_base_lines_to_target_amount(
            base_lines=self._prepare_discountable_base_lines(base_lines, company),
            company=company,
            amount_type=amount_type,
            amount=-amount,
            computation_key=computation_key,
            grouping_function=grouping_function,
        )
        self._pin_base_lines_tax_details(new_base_lines, company)
        return new_base_lines

    # -------------------------------------------------------------------------
    # DOWN PAYMENT
    # -------------------------------------------------------------------------

    @api.model
    def _prepare_down_payment_lines(
        self,
        base_lines,
        company,
        amount_type,
        amount,
        computation_key='down_payment',
        grouping_function=None,
    ):
        """ Prepare the base lines to be added representing a down payment.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:             The company of the base lines.
        :param amount_type:         'fixed' or 'percent' indicating the type of the down payment.
        :param amount:              The amount of the down payment in case of 'fixed' amount_type. Otherwise, a percentage [0-100].
        :param computation_key:     The key that will be used to split the base lines to round the tax amounts.
        :param grouping_function:   An optional function taking a base line as parameter and returning a grouping key
                                    being the way the base lines will be aggregated all together.
                                    By default, the base lines will be aggregated by taxes.
        :return:                    The base lines representing the down payment.
        """
        new_base_lines = self._reduce_base_lines_to_target_amount(
            base_lines=self._prepare_discountable_base_lines(base_lines, company),
            company=company,
            amount_type=amount_type,
            amount=amount,
            computation_key=computation_key,
            grouping_function=grouping_function,
        )
        self._pin_base_lines_tax_details(new_base_lines, company)
        return new_base_lines

    # -------------------------------------------------------------------------
    # DISPATCHING OF LINES
    # -------------------------------------------------------------------------

    @api.model
    def _extract_tax_data(self, base_line, company, index):
        """ Split a base line in two: the base line without the tax data at 'index', and a new base line whose amount without
        tax is the amount of this tax data. The subsequent taxes affected by the tax are split between both, in proportion to
        their amounts without tax.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_line:   A base line.
        :param company:     The company owning the base line.
        :param index:       The index of the tax data to extract.
        :return:            A tuple <base_line_without_tax, base_line_of_the_tax>.
        """
        tax_details = base_line['tax_details']
        taxes_data = tax_details['taxes_data']
        tax_data_to_remove = taxes_data[index]

        first_tax_details = {
            'raw_total_excluded_currency': tax_details['raw_total_excluded_currency'],
            'raw_total_excluded': tax_details['raw_total_excluded'],
            'total_excluded_currency': tax_details['total_excluded_currency'],
            'total_excluded': tax_details['total_excluded'],
            'taxes_data': taxes_data[:index],
        }
        second_tax_details = {
            'raw_total_excluded_currency': tax_data_to_remove['raw_tax_amount_currency'],
            'raw_total_excluded': tax_data_to_remove['raw_tax_amount'],
            'total_excluded_currency': tax_data_to_remove['tax_amount_currency'],
            'total_excluded': tax_data_to_remove['tax_amount'],
            'taxes_data': [],
        }
        target_factors = [
            {'factor': first_tax_details['raw_total_excluded_currency']},
            {'factor': second_tax_details['raw_total_excluded_currency']},
        ]
        for remaining_tax_data in taxes_data[index + 1:]:
            if remaining_tax_data['tax'] in tax_data_to_remove['taxes']:
                first_tax_data, second_tax_data = self._split_tax_data(base_line, remaining_tax_data, company, target_factors)
                second_tax_details['taxes_data'].append(second_tax_data)
            else:
                first_tax_data = remaining_tax_data
            first_tax_details['taxes_data'].append(first_tax_data)
        self._set_tax_details_total_included(first_tax_details)
        self._set_tax_details_total_included(second_tax_details)

        first_taxes = self.env['account.tax']
        for tax_data in first_tax_details['taxes_data']:
            first_taxes += tax_data['tax']
        second_taxes = self.env['account.tax']
        for tax_data in second_tax_details['taxes_data']:
            second_taxes += tax_data['tax']
        second_price_unit = second_tax_details['raw_total_excluded_currency'] + sum(
            tax_data['raw_tax_amount_currency']
            for tax_data in second_tax_details['taxes_data']
            if tax_data['tax']._is_price_included(base_line['document_tax_mode'])
        )
        # The price of the line without the tax doesn't include the amounts moved to the other line anymore.
        moved_price_included_amount = second_price_unit
        if not tax_data_to_remove['tax']._is_price_included(base_line['document_tax_mode']):
            moved_price_included_amount -= second_tax_details['raw_total_excluded_currency']
        first_price_unit = base_line['price_unit']
        price_factor = base_line['quantity'] * (1 - (base_line['discount'] / 100.0))
        if moved_price_included_amount and price_factor:
            first_price_unit -= moved_price_included_amount / price_factor
        return (
            self._prepare_base_line_for_taxes_computation(
                base_line,
                tax_ids=first_taxes,
                price_unit=first_price_unit,
                tax_details=first_tax_details,
            ),
            self._prepare_base_line_for_taxes_computation(
                base_line,
                tax_ids=second_taxes,
                price_unit=second_price_unit / (base_line['quantity'] or 1.0),
                tax_details=second_tax_details,
                _removed_tax_data=tax_data_to_remove,
            ),
        )

    @api.model
    def _dispatch_taxes_into_new_base_lines(self, base_lines, company, exclude_function):
        """ Extract taxes from base lines and turn them into sub-base lines, see '_extract_tax_data'.

        [!] Mirror of the same method in account_tax.js.
        PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.

        :param base_lines:          A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:             The company of the base lines.
        :param exclude_function:    A function taking a base line and a tax_data as parameter and returning
                                    a boolean indicating if the tax_data has to be exclude or not.
        :return:                    The new base lines with some extra data that have been removed.
                                    The newly created base lines will be under the 'removed_taxes_data_base_lines' key.
        """
        final_base_lines = []
        for base_line in base_lines:
            taxes_to_exclude = {
                tax_data['tax']
                for tax_data in base_line['tax_details']['taxes_data']
                if exclude_function(base_line, tax_data)
            }
            new_base_lines = []
            to_process = [base_line]
            while to_process:
                current_base_line = to_process.pop(0)
                index = next(
                    (
                        i
                        for i, tax_data in enumerate(current_base_line['tax_details']['taxes_data'])
                        if tax_data['tax'] in taxes_to_exclude
                    ),
                    None,
                )
                if index is None:
                    new_base_lines.append(dict(current_base_line))
                else:
                    to_process = [*self._extract_tax_data(current_base_line, company, index), *to_process]
            new_base_lines[0]['removed_taxes_data_base_lines'] = new_base_lines[1:]
            final_base_lines.append(new_base_lines[0])
        return final_base_lines

    @api.model
    def _turn_removed_taxes_into_new_base_lines(self, base_lines, company, grouping_function=None, aggregate_function=None):
        """ Merge the sub 'removed_taxes_data_base_lines' generated by '_dispatch_taxes_into_new_base_lines'
        into the parent line.

        [!] Only added python-side.

        :param base_lines:          A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:             The company owning the base lines.
        :param grouping_function:   An optional function taking a base line as parameter and returning a grouping key
                                    being the way the base lines will be aggregated all together.
                                    By default, the base lines will be aggregated by taxes.
        :param aggregate_function:  An optional function taking the 2 base lines as parameter to be aggregated together.
        """
        extra_base_lines = []
        for base_line in base_lines:
            extra_base_lines += base_line['removed_taxes_data_base_lines']
        return self._reduce_base_lines_with_grouping_function(
            base_lines=extra_base_lines,
            grouping_function=grouping_function,
            aggregate_function=aggregate_function,
        )

    @api.model
    def _dispatch_global_discount_lines(self, base_lines, company):
        """ Dispatch the global discount lines present inside the base_lines passed as parameter across the others under the
        'discount_base_lines' key.

        [!] Only added python-side.

        :param base_lines:  A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:     The company owning the base lines.
        :return:            New base lines without any global discount but sub-lines added under the 'discount_base_lines' key.
        """
        # Dispatch lines.
        # First, we need to distinguish the mapping between the global discount lines and the others.
        # For now, we only dispatch base on taxes.
        new_base_lines = []
        discount_data_per_taxes = {}
        dispatched_neg_base_lines = []
        for base_line in base_lines:
            tax_details = base_line['tax_details']
            taxes_data = tax_details['taxes_data']

            # Get all the taxes flattened.
            taxes = self.env['account.tax']
            for gb_tax_data in taxes_data:
                taxes += gb_tax_data['tax']
            taxes = taxes.filtered(lambda tax: tax._can_be_discounted())

            discount_data = discount_data_per_taxes.setdefault(taxes, {
                'base_lines': [],
                'discount_base_lines': [],
            })

            new_base_line = {
                **base_line,
                'discount_base_lines': [],
            }

            if base_line['special_type'] == 'global_discount':
                discount_data['discount_base_lines'].append(new_base_line)
            else:
                discount_data['base_lines'].append(new_base_line)
            new_base_lines.append(new_base_line)

        # Split the discount base line accross the others.
        for discount_data in discount_data_per_taxes.values():
            discount_data['target_factors'] = [
                {
                    'base_line': base_line,
                    'factor': base_line['tax_details']['raw_total_excluded_currency'],
                }
                for base_line in discount_data['base_lines']
            ]
            if discount_data['target_factors']:
                dispatched_neg_base_lines += discount_data['discount_base_lines']
            else:
                continue

            for discount_base_line in discount_data['discount_base_lines']:
                splitted_base_lines = self._split_base_line(
                    base_line=discount_base_line,
                    company=company,
                    target_factors=discount_data['target_factors'],
                )
                for base_line, new_base_line in zip(discount_data['base_lines'], splitted_base_lines):
                    base_line['discount_base_lines'].append(new_base_line)
        return [x for x in new_base_lines if x not in dispatched_neg_base_lines]

    @api.model
    def _squash_global_discount_lines(self, base_lines, company):
        """ Merge the sub global discount base lines generated by '_dispatch_global_discount_lines'
        into the parent line.

        [!] Only added python-side.

        :param base_lines:  A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:     The company owning the base lines.
        """
        for base_line in base_lines:
            for sub_base_line in base_line['discount_base_lines']:
                base_line['tax_details'] = self._merge_tax_details(
                    tax_details_1=base_line['tax_details'],
                    tax_details_2=sub_base_line['tax_details'],
                )

        self._pin_base_lines_tax_details(
            base_lines=[base_line for base_line in base_lines if base_line['discount_base_lines']],
            company=company,
        )

    @api.model
    def _dispatch_return_of_merchandise_lines(self, base_lines, company):
        """ Dispatch the return of merchandise lines present inside the base_lines passed as parameter across the others under the
        'return_of_merchandise_base_lines' key.
        What we call a return of merchandise is when the negative line matches exactly the parent line but has a negative quantity.
        So if you have 2 base lines, one with a quantity of 3 and the other with a quantity of -1, this method tries to reduce the
        quantity instead of considering the negative lines as a discount.

        [!] Only added python-side.

        :param base_lines:  A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:     The company owning the base lines.
        :return:            New base lines without any return of merchandise but sub-lines added under the 'return_of_merchandise_base_lines' key.
        """
        new_base_lines = []
        mapping = defaultdict(lambda: {
            '+': [],
            '-': [],
        })
        dispatched_neg_base_lines = []
        for base_line in base_lines:
            new_base_line = {
                **base_line,
                'return_of_merchandise_base_lines': [],
            }
            new_base_lines.append(new_base_line)

            if not base_line['product_id'] or base_line['quantity'] == 0.0:
                continue

            key = frozendict({
                'tax_ids': base_line['tax_ids'].ids,
                'product': base_line['product_id'].id,
                'price_unit': base_line['price_unit'],
                'discount': base_line['discount'],
            })

            is_negative = base_line['tax_details']['raw_total_excluded_currency'] < 0.0
            mapping[key]['-' if is_negative else '+'].append(new_base_line)

        for signed_base_lines in mapping.values():
            plus_base_lines = sorted(signed_base_lines['+'], key=lambda base_line: -base_line['quantity'])
            iter_plus_base_lines = iter(plus_base_lines)
            neg_base_lines = sorted(signed_base_lines['-'], key=lambda base_line: base_line['quantity'])
            iter_neg_base_lines = iter(neg_base_lines)
            plus_base_line = None
            plus_base_line_quantity = None
            neg_base_line = None
            neg_base_line_quantity = None
            target_factors_per_neg_base_line = []
            target_factors = None
            while True:

                if not neg_base_line or not neg_base_line_quantity:
                    neg_base_line = next(iter_neg_base_lines, None)
                    if neg_base_line:
                        neg_base_line_quantity = abs(neg_base_line['quantity'])
                        target_factors = []
                        target_factors_per_neg_base_line.append(target_factors)
                    else:
                        break

                if not plus_base_line or not plus_base_line_quantity:
                    plus_base_line = next(iter_plus_base_lines, None)
                    if plus_base_line:
                        plus_base_line_quantity = abs(plus_base_line['quantity'])
                    else:
                        break

                quantity_to_dispatch = min(neg_base_line_quantity, plus_base_line_quantity)
                target_factors.append({
                    'factor': quantity_to_dispatch / abs(neg_base_line['quantity']),
                    'quantity_to_dispatch': quantity_to_dispatch,
                    'plus_base_line': plus_base_line,
                    'quantity': -quantity_to_dispatch,
                })
                plus_base_line_quantity -= quantity_to_dispatch
                neg_base_line_quantity -= quantity_to_dispatch

            def populate_function(base_line, target_factor, kwargs):
                kwargs['price_unit'] = base_line['price_unit']
                kwargs['quantity'] = -target_factor['quantity_to_dispatch']

            for target_factors, neg_base_line in zip(target_factors_per_neg_base_line, neg_base_lines):
                if not target_factors:
                    continue

                dispatched_neg_base_lines.append(neg_base_line)
                splitted_base_lines = self._split_base_line(
                    base_line=neg_base_line,
                    company=company,
                    target_factors=target_factors,
                    populate_function=populate_function,
                )
                for target_factor, new_base_line in zip(target_factors, splitted_base_lines):
                    target_factor['plus_base_line']['return_of_merchandise_base_lines'].append(new_base_line)

        return [x for x in new_base_lines if x not in dispatched_neg_base_lines]

    @api.model
    def _squash_return_of_merchandise_lines(self, base_lines, company):
        """ Merge the sub return of merchandise base lines generated by '_dispatch_return_of_merchandise_lines'
        into the parent line.

        [!] Only added python-side.

        :param base_lines:  A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:     The company owning the base lines.
        """
        for base_line in base_lines:
            for sub_base_line in base_line['return_of_merchandise_base_lines']:
                base_line['tax_details'] = self._merge_tax_details(
                    tax_details_1=base_line['tax_details'],
                    tax_details_2=sub_base_line['tax_details'],
                )
                base_line['quantity'] += sub_base_line['quantity']

        self._pin_base_lines_tax_details(
            base_lines=[base_line for base_line in base_lines if base_line['return_of_merchandise_base_lines']],
            company=company,
        )

    @api.model
    def _dispatch_negative_base_lines(self, base_lines, company, is_discount_function=None, return_of_merchandise=True):
        """ Spread the negative base lines over the others, for the formats refusing negative lines:
        1. the base lines for which 'is_discount_function' returns True become global discounts,
        2. with 'return_of_merchandise', a negative base line matching a positive one reduces its quantity (see
           '_dispatch_return_of_merchandise_lines'),
        3. the global discounts are spread over the base lines having the same taxes (see '_dispatch_global_discount_lines').
        What can't be spread stays negative in the returned base lines.

        [!] Only added python-side.

        :param base_lines:              A list of base lines generated using the '_prepare_base_line_for_taxes_computation' method.
        :param company:                 The company owning the base lines.
        :param is_discount_function:    An optional function taking a base line and telling whether it is a global discount.
                                        By default, the negative base lines without special type.
        :param return_of_merchandise:   Whether the negative base lines reduce the quantity of the matching ones first.
        :return:                        The new base lines.
        """
        for base_line in base_lines:
            if is_discount_function:
                is_discount = is_discount_function(base_line)
            else:
                is_discount = base_line['tax_details']['raw_total_excluded_currency'] < 0.0 and not base_line['special_type']
            if is_discount:
                base_line['special_type'] = 'global_discount'

        if return_of_merchandise:
            base_lines = self._dispatch_return_of_merchandise_lines(base_lines, company)
            self._squash_return_of_merchandise_lines(base_lines, company)
        base_lines = self._dispatch_global_discount_lines(base_lines, company)
        self._squash_global_discount_lines(base_lines, company)
        return base_lines

    # -------------------------------------------------------------------------
    # EDI HELPERS
    # -------------------------------------------------------------------------

    @api.model
    def _get_delta_amount_to_reach_target(
        self,
        target_amount,
        target_currency,
        raw_current_amount,
        raw_current_amount_precision_digits,
    ):
        """ Get the minimum missing amount having 'raw_current_amount_precision_digits' as precision
        to be added to 'raw_current_amount' to give 'target_amount' after rounding using 'target_currency'.

        :param target_amount:                       The amount to reach after rounding the raw amount using 'target_currency'.
        :param target_currency:                     The currency used to round 'target_amount'.
        :param raw_current_amount:                  The raw amount that needs to reach 'target_amount'.
        :param raw_current_amount_precision_digits: The precision of the delta returned by this method.
        :return:
            Suppose 'raw_current_amount' is expressed with 'raw_current_amount_precision_digits'.
            Then, the delta returned by this method will be expressed with 'raw_current_amount_precision_digits'
            such as target_currency.round(raw_current_amount + delta) == target_amount
        """
        target_amount_sign = -1 if target_amount < 0.0 else 1
        raw_current_amount_rounding = math.pow(10, -raw_current_amount_precision_digits)
        tolerance_bounds = (
            float_round(
                abs(target_amount) + (target_currency.rounding / 2) - raw_current_amount_rounding,
                precision_digits=raw_current_amount_precision_digits,
            ),
            float_round(
                abs(target_amount) - (target_currency.rounding / 2),
                precision_digits=raw_current_amount_precision_digits,
            ),
        )

        signed_raw_current_amount = target_amount_sign * raw_current_amount
        if signed_raw_current_amount > tolerance_bounds[0]:
            delta_raw_amount = tolerance_bounds[0] - signed_raw_current_amount
        elif signed_raw_current_amount < tolerance_bounds[1]:
            delta_raw_amount = tolerance_bounds[1] - signed_raw_current_amount
        else:
            return 0.0

        return target_amount_sign * delta_raw_amount

    @api.model
    def _reach_target_in_window(self, items, field, target, currency, precision_digits, weights):
        """ Same as '_reach_target' for amounts having more decimals than 'currency' (EDI): the amounts only have to add up to
        an amount that 'currency' rounds to 'target', so only the smallest difference is spread
        (see '_get_delta_amount_to_reach_target').

        [!] Only added python-side.

        :param items:               A list of dictionaries.
        :param field:               The key of the amount in the items.
        :param target:              The amount, rounded to 'currency', the items must add up to once rounded.
        :param currency:            The currency of 'target'.
        :param precision_digits:    The precision of the amounts.
        :param weights:             The weight of each item.
        :return:                    The amount added to each item.
        """
        current_amount = sum(item[field] for item in items)
        delta_amount = self._get_delta_amount_to_reach_target(
            target_amount=target,
            target_currency=currency,
            raw_current_amount=current_amount,
            raw_current_amount_precision_digits=precision_digits,
        )
        return self._reach_target(items, field, current_amount + delta_amount, precision_digits, weights=weights)

    @api.model
    def _get_gross_total_without_tax(self, base_line, company, in_foreign_currency=True, account_discount_base_lines=False, precision_digits=None):
        """ Infer the gross total without tax from the base line.

        :param base_line:                   A base line (see '_prepare_base_line_for_taxes_computation').
        :param company:                     The company owning the base line.
        :param in_foreign_currency:         True if to be applied on amounts expressed in foreign currency,
                                            False for amounts expressed in company currency.
        :param account_discount_base_lines: Account the distributed global discount in 'discount_base_lines'
                                            using '_dispatch_global_discount_lines' in 'raw_discount_amount'.
        :param precision_digits:            The precision to be used to round.
        :return:                            The gross total without tax.
        """
        suffix = '_currency' if in_foreign_currency else ''

        tax_details = base_line['tax_details']
        raw_total_excluded = tax_details[f'raw_total_excluded{suffix}']

        discount_factor = 1 - (base_line['discount'] / 100.0)
        if discount_factor:
            raw_gross_total_excluded = raw_total_excluded / discount_factor
        elif in_foreign_currency:
            raw_gross_total_excluded = base_line['price_unit'] * base_line['quantity']
        elif base_line['rate']:
            raw_gross_total_excluded = base_line['price_unit'] * base_line['quantity'] / base_line['rate']
        else:
            raw_gross_total_excluded = 0.0
        if account_discount_base_lines:
            raw_gross_total_excluded -= sum(
                discount_base_line['tax_details'][f'raw_total_excluded{suffix}']
                for discount_base_line in base_line.get('discount_base_lines', [])
            )

        if precision_digits is not None:
            raw_gross_total_excluded = float_round(raw_gross_total_excluded, precision_digits=precision_digits)
        return raw_gross_total_excluded

    @api.model
    def _get_price_unit_without_tax(self, base_line, company, raw_gross_total_excluded, in_foreign_currency=True, precision_digits=None):
        """ Infer the gross price unit without tax from the base line.

        :param base_line:                   A base line (see '_prepare_base_line_for_taxes_computation').
        :param company:                     The company owning the base line.
        :param raw_gross_total_excluded:    The gross total without tax.
        :param in_foreign_currency:         True if to be applied on amounts expressed in foreign currency,
                                            False for amounts expressed in company currency.
        :param precision_digits:            The precision to be used to round.
        :return:                            The gross price unit without tax.
        """
        if (
            (precision_digits and float_is_zero(raw_gross_total_excluded, precision_digits=precision_digits))
            or not raw_gross_total_excluded
        ):
            if in_foreign_currency:
                raw_gross_price_unit = base_line['price_unit']
            elif base_line['rate']:
                raw_gross_price_unit = base_line['price_unit'] / base_line['rate']
            else:
                raw_gross_price_unit = 0.0
        elif not base_line['quantity']:
            raw_gross_price_unit = raw_gross_total_excluded
        else:
            raw_gross_price_unit = raw_gross_total_excluded / base_line['quantity']

        if precision_digits is not None:
            raw_gross_price_unit = float_round(raw_gross_price_unit, precision_digits=precision_digits)
        return raw_gross_price_unit

    @api.model
    def _get_discount_amount_without_tax(self, base_line, company, raw_gross_total_excluded, in_foreign_currency=True, precision_digits=None):
        """ Infer the discount amount without tax from the base line.

        :param base_line:                   A base line (see '_prepare_base_line_for_taxes_computation').
        :param company:                     The company owning the base line.
        :param raw_gross_total_excluded:    The gross total without tax.
        :param in_foreign_currency:         True if to be applied on amounts expressed in foreign currency,
                                            False for amounts expressed in company currency.
        :param precision_digits:            The precision to be used to round.
        :return:                            The discount amount without tax.
        """
        suffix = '_currency' if in_foreign_currency else ''
        raw_discount_amount = raw_gross_total_excluded - base_line['tax_details'][f'raw_total_excluded{suffix}']

        if precision_digits is not None:
            raw_discount_amount = float_round(raw_discount_amount, precision_digits=precision_digits)
        return raw_discount_amount

    @api.model
    def _represent_net_amounts(self, base_lines, company, profile, in_foreign_currency):
        """ Round 'raw_total_excluded[_currency]' to the 'precision_digits' of the representation profile. With a 'strict'
        reconcile, ROUND(SUM(raw_total_excluded)) is the booked SUM(total_excluded).

        [!] Only added python-side.

        :param base_lines:          A list of base lines.
        :param company:             The company owning the base lines.
        :param profile:             The representation profile of the format, see TAX_REPRESENTATION_PROFILE.
        :param in_foreign_currency: True for the amounts expressed in foreign currency, False for the company currency.
        """
        precision_digits = profile['precision_digits']
        currency = base_lines[0]['currency_id'] if in_foreign_currency else company.currency_id
        suffix = '_currency' if in_foreign_currency else ''
        field = f'raw_total_excluded{suffix}'
        taxes_details = [base_line['tax_details'] for base_line in base_lines]
        for tax_details in taxes_details:
            tax_details[field] = float_round(tax_details[field], precision_digits=precision_digits)

        if profile['reconcile'] == 'strict':
            self._reach_target_in_window(
                taxes_details,
                field,
                sum(tax_details[f'total_excluded{suffix}'] for tax_details in taxes_details),
                currency,
                precision_digits,
                weights=[tax_details[field] for tax_details in taxes_details],
            )

    @api.model
    def _represent_gross_amounts(self, base_lines, company, profile, in_foreign_currency):
        """ Add 'raw_gross_total_excluded[_currency]' / 'raw_gross_price_unit[_currency]' / 'raw_discount_amount[_currency]'
        to the tax details, with the 'precision_digits' of the representation profile. With a 'strict' reconcile,
        ROUND(SUM(raw_gross_total_excluded)) is the booked SUM(total_excluded) plus ROUND(SUM(raw_discount_amount)).
        With 'rounded' gross amounts, also add 'gross_total_excluded[_currency]' / 'discount_amount[_currency]' rounded to
        the currency, adding up to the same totals.

        [!] Only added python-side.

        :param base_lines:          A list of base lines.
        :param company:             The company owning the base lines.
        :param profile:             The representation profile of the format, see TAX_REPRESENTATION_PROFILE.
        :param in_foreign_currency: True for the amounts expressed in foreign currency, False for the company currency.
        """
        precision_digits = profile['precision_digits']
        currency = base_lines[0]['currency_id'] if in_foreign_currency else company.currency_id
        suffix = '_currency' if in_foreign_currency else ''
        raw_field = f'raw_total_excluded{suffix}'

        for base_line in base_lines:
            tax_details = base_line['tax_details']
            global_discount_sum = 0.0
            if profile['dispatched_global_discounts']:
                global_discount_sum = sum(
                    discount_base_line['tax_details'][raw_field]
                    for discount_base_line in base_line.get('discount_base_lines', [])
                )

            discount_factor = 1 - (base_line['discount'] / 100.0)
            if discount_factor:
                raw_gross_total_excluded = (tax_details[raw_field] - global_discount_sum) / discount_factor
            elif in_foreign_currency:
                raw_gross_total_excluded = base_line['price_unit'] * base_line['quantity']
            elif base_line['rate']:
                raw_gross_total_excluded = base_line['price_unit'] * base_line['quantity'] / base_line['rate']
            else:
                raw_gross_total_excluded = 0.0
            tax_details[f'raw_gross_total_excluded{suffix}'] = float_round(raw_gross_total_excluded, precision_digits=precision_digits)
            tax_details[f'raw_gross_price_unit{suffix}'] = self._get_price_unit_without_tax(
                base_line=base_line,
                company=company,
                raw_gross_total_excluded=raw_gross_total_excluded,
                in_foreign_currency=in_foreign_currency,
                precision_digits=precision_digits,
            )
            tax_details[f'raw_discount_amount{suffix}'] = self._get_discount_amount_without_tax(
                base_line=base_line,
                company=company,
                raw_gross_total_excluded=raw_gross_total_excluded,
                in_foreign_currency=in_foreign_currency,
                precision_digits=precision_digits,
            )

        taxes_details = [base_line['tax_details'] for base_line in base_lines]
        total_excluded = sum(tax_details[f'total_excluded{suffix}'] for tax_details in taxes_details)
        raw_discount_amount = sum(tax_details[f'raw_discount_amount{suffix}'] for tax_details in taxes_details)
        gross_total_excluded = total_excluded + currency.round(raw_discount_amount)
        if profile['reconcile'] == 'strict':
            self._reach_target_in_window(
                taxes_details,
                f'raw_gross_total_excluded{suffix}',
                gross_total_excluded,
                currency,
                precision_digits,
                weights=[tax_details[raw_field] for tax_details in taxes_details],
            )

        if profile['gross_amounts'] == 'rounded':
            # The rounding of the taxes goes in the gross amounts rather than in the discounts, that won't always be there.
            # The difference per line is at most one unit of the currency.
            for tax_details in taxes_details:
                for field in ('gross_total_excluded', 'discount_amount'):
                    tax_details[f'{field}{suffix}'] = float_round(tax_details[f'raw_{field}{suffix}'], precision_rounding=currency.rounding)
            weights = [1.0] * len(taxes_details)
            self._reach_target(taxes_details, f'gross_total_excluded{suffix}', gross_total_excluded, currency.decimal_places, weights=weights)
            self._reach_target(taxes_details, f'discount_amount{suffix}', gross_total_excluded - total_excluded, currency.decimal_places, weights=weights)

    @api.model
    def _represent_tax_amounts(self, base_lines, grouping_function, company, profile):
        """ Aggregate the tax details of each base line (see '_aggregate_tax_details') and round the 'raw_tax_amount' /
        'raw_base_amount' of the currencies of the representation profile to its 'precision_digits'. With a 'strict'
        reconcile, ROUND(SUM(raw_tax_amount)) is the booked SUM(tax_amount) of each grouping key, the base amounts keeping
        the rate between the raw base and tax amounts.

        [!] Only added python-side.

        :param base_lines:          A list of base lines.
        :param grouping_function:   See '_aggregate_tax_details'.
        :param company:             The company owning the base lines.
        :param profile:             The representation profile of the format, see TAX_REPRESENTATION_PROFILE.
        :return:                    A list of tuple <base_line, aggregated values of the base line>.
        """
        base_lines_aggregated_values = [
            (base_line, self._aggregate_tax_details([base_line], grouping_function))
            for base_line in base_lines
        ]
        if not base_lines:
            return base_lines_aggregated_values
        precision_digits = profile['precision_digits']
        for currency_type in profile['currencies']:
            in_foreign_currency = currency_type == 'foreign'
            currency = base_lines[0]['currency_id'] if in_foreign_currency else company.currency_id
            suffix = '_currency' if in_foreign_currency else ''
            tax_field = f'tax_amount{suffix}'
            raw_tax_field = f'raw_{tax_field}'
            raw_base_field = f'raw_base_amount{suffix}'

            items_per_grouping_key = defaultdict(list)
            for _base_line, aggregated_values in base_lines_aggregated_values:
                for grouping_key, values in aggregated_values.items():
                    values[raw_tax_field] = float_round(values[raw_tax_field], precision_digits=precision_digits)
                    values[raw_base_field] = float_round(values[raw_base_field], precision_digits=precision_digits)
                    items_per_grouping_key[grouping_key].append(values)
            if profile['reconcile'] != 'strict':
                continue

            for items in items_per_grouping_key.values():
                raw_tax_amount = sum(values[raw_tax_field] for values in items)
                raw_base_amount = sum(values[raw_base_field] for values in items)
                tax_rate = (raw_tax_amount / raw_base_amount) if raw_base_amount else 0.0
                weights = [values[raw_tax_field] for values in items]

                # The tax amounts reach the booked one, the base amounts following the rate.
                amounts = self._reach_target_in_window(
                    items,
                    raw_tax_field,
                    sum(values[tax_field] for values in items),
                    currency,
                    precision_digits,
                    weights=weights,
                )
                if not tax_rate:
                    continue
                for values, amount in zip(items, amounts):
                    if amount:
                        values[raw_base_field] = float_round(values[raw_tax_field] / tax_rate, precision_digits=precision_digits)

                # The base amounts reach the one of the tax amounts.
                self._reach_target_in_window(
                    items,
                    raw_base_field,
                    (raw_tax_amount + sum(amounts)) / tax_rate,
                    currency,
                    precision_digits,
                    weights=weights,
                )
        return base_lines_aggregated_values

    @api.model
    def _represent_tax_details(self, base_lines, company, profile):
        """ Round the amounts of the base lines the way a format writes them, as declared by its representation profile (see
        TAX_REPRESENTATION_PROFILE), then check the identities of the format.

        [!] Only added python-side.

        :param base_lines:  A list of python dictionaries created using the '_prepare_base_line_for_taxes_computation' method.
        :param company:     The company owning the base lines.
        :param profile:     The representation profile of the format.
        :return:            The failed checks, see '_check_tax_representation'.
        """
        violations = []
        if not base_lines:
            return violations
        for currency_type in profile['currencies']:
            in_foreign_currency = currency_type == 'foreign'
            if profile['net_amounts']:
                self._represent_net_amounts(base_lines, company, profile, in_foreign_currency)
            if profile['gross_amounts']:
                self._represent_gross_amounts(base_lines, company, profile, in_foreign_currency)
            violations += self._check_tax_representation(base_lines, company, profile, in_foreign_currency=in_foreign_currency)
        return violations

    @api.model
    def _check_tax_representation(self, base_lines, company, profile, in_foreign_currency=True):
        """ Check the identities of a representation profile (see TAX_REPRESENTATION_PROFILE) on base lines rounded for a
        format. A failed check prevents nothing: it is logged and returned, for the format to report it if it wants.

        - 'line_net_is_qty_x_price':    the gross amount of each line is its quantity times its gross unit price. Only checked
                                        when the format computes them, see the 'gross_amounts' of the profile.
        - 'tax_is_base_x_rate':         the tax amount of each percent tax over the document is its base times its rate.
        - 'base_is_sum_of_lines':       the line amounts of the format (gross minus discount, or else the unrounded amount
                                        without tax) add up to the booked amount without tax.

        [!] Only added python-side.

        :param base_lines:          A list of python dictionaries created using the '_prepare_base_line_for_taxes_computation' method.
        :param company:             The company owning the base lines.
        :param profile:             The representation profile of the format.
        :param in_foreign_currency: True to check the amounts expressed in foreign currency, False for the company currency.
        :return:                    One dictionary per failed check, with the 'rule', 'identity', 'tolerance', 'expected' and
                                    'found' amounts, and the 'base_line' or the 'tax' the check is about if any.
        """
        if not base_lines:
            return []

        currency = base_lines[0]['currency_id'] if in_foreign_currency else company.currency_id
        suffix = '_currency' if in_foreign_currency else ''
        precision_digits = profile['precision_digits']
        raw_unit = 10 ** -precision_digits
        violations = []

        def check(rule, identity, tolerance, expected, found, propagated=0.0, **extra_values):
            if tolerance == 'exact':
                limit = 0.0
            elif tolerance == 'propagated':
                limit = propagated
            else:
                limit = tolerance[1]  # ('abs', amount)
            if float_compare(abs(found - expected), limit, precision_digits=precision_digits) > 0:
                violations.append({
                    'rule': rule,
                    'identity': identity,
                    'tolerance': tolerance,
                    'expected': expected,
                    'found': found,
                    **extra_values,
                })

        for rule, identity, tolerance in profile['identities']:
            if identity == 'line_net_is_qty_x_price':
                for base_line in base_lines:
                    tax_details = base_line['tax_details']
                    if f'raw_gross_price_unit{suffix}' not in tax_details:
                        continue
                    check(
                        rule, identity, tolerance,
                        expected=base_line['quantity'] * tax_details[f'raw_gross_price_unit{suffix}'],
                        found=tax_details.get(f'gross_total_excluded{suffix}', tax_details[f'raw_gross_total_excluded{suffix}']),
                        propagated=(abs(base_line['quantity']) + 1) * raw_unit / 2 + currency.rounding / 2,
                        base_line=base_line,
                    )

            elif identity == 'tax_is_base_x_rate':
                values_per_tax = defaultdict(lambda: {'base': 0.0, 'tax': 0.0})
                for base_line in base_lines:
                    for tax_data in base_line['tax_details']['taxes_data']:
                        tax = tax_data['tax']
                        if tax.amount_type != 'percent' or tax_data.get('is_reverse_charge'):
                            continue
                        values = values_per_tax[tax]
                        values['base'] += tax_data[f'base_amount{suffix}']
                        values['tax'] += tax_data[f'tax_amount{suffix}']
                for tax, values in values_per_tax.items():
                    rate = tax.amount / 100.0
                    check(
                        rule, identity, tolerance,
                        expected=currency.round(values['base'] * rate),
                        found=values['tax'],
                        propagated=(abs(rate) + 1) * currency.rounding / 2,
                        tax=tax,
                    )

            elif identity == 'base_is_sum_of_lines':
                lines_amount = 0.0
                booked_amount = 0.0
                for base_line in base_lines:
                    tax_details = base_line['tax_details']
                    if f'raw_gross_total_excluded{suffix}' in tax_details:
                        lines_amount += tax_details[f'raw_gross_total_excluded{suffix}'] - tax_details.get(f'raw_discount_amount{suffix}', 0.0)
                    else:
                        lines_amount += tax_details[f'raw_total_excluded{suffix}']
                    booked_amount += tax_details[f'total_excluded{suffix}']
                check(
                    rule, identity, tolerance,
                    expected=booked_amount,
                    found=currency.round(lines_amount),
                    propagated=len(base_lines) * raw_unit / 2 + currency.rounding / 2,
                )

        for violation in violations:
            _logger.info(
                "The tax amounts fail the check %s (%s): %s expected, %s found.",
                violation['rule'], violation['identity'], violation['expected'], violation['found'],
            )
        return violations

    # -------------------------------------------------------------------------
    # END HELPERS IN BOTH PYTHON/JAVASCRIPT (account_tax.js)
    # -------------------------------------------------------------------------

    def flatten_taxes_hierarchy(self):
        return self._flatten_taxes_and_sort_them()[0]

    def get_tax_tags(self, is_refund, repartition_type):
        document_type = 'refund' if is_refund else 'invoice'
        return self.repartition_line_ids\
            .filtered(lambda x: x.repartition_type == repartition_type and x.document_type == document_type)\
            .mapped('tag_ids')

    def compute_all(self, price_unit, currency=None, quantity=1.0, product=None, partner=None, is_refund=False, handle_price_include=True, include_caba_tags=False, rounding_policy=None, document_tax_mode=None):
        """Compute all information required to apply taxes (in self + their children in case of a tax group).
        We consider the sequence of the parent for group of taxes.
        Eg. considering letters as taxes and alphabetic order as sequence::

            [G, B([A, D, F]), E, C] will be computed as [A, D, F, C, E, G]

        :param price_unit: The unit price of the line to compute taxes on.
        :param currency: The optional currency in which the price_unit is expressed.
        :param quantity: The optional quantity of the product to compute taxes on.
        :param product: The optional product to compute taxes on.
            Used to get the tags to apply on the lines.

        :param partner: The optional partner compute taxes on.
            Used to retrieve the lang to build strings and for potential extensions.

        :param is_refund: The optional boolean indicating if this is a refund.
        :param handle_price_include: Used when we need to ignore all tax included in price. If False, it means the
            amount passed to this method will be considered as the base of all computations.

        :param include_caba_tags: The optional boolean indicating if CABA tags need to be taken into account.
        :param rounding_policy: The optional key of the rounding policy in TAX_ROUNDING_POLICIES. The company's by default.
        :returns:
            ::

                {
                    'total_excluded': 0.0,    # Total without taxes
                    'total_included': 0.0,    # Total with taxes
                    'total_void'    : 0.0,    # Total with those taxes, that don't have an account set
                    'base_tags: : list<int>,  # Tags to apply on the base line
                    'taxes': [{               # One dict for each tax in self and their children
                        'id': int,
                        'name': str,
                        'amount': float,
                        'base': float,
                        'sequence': int,
                        'account_id': int,
                        'refund_account_id': int,
                        'analytic': bool,
                        'price_include': bool,
                        'tax_exigibility': str,
                        'tax_repartition_line_id': int,
                        'group': recordset,
                        'tag_ids': list<int>,
                        'tax_ids': list<int>,
                    }],
                }
        """
        if not self:
            company = self.env.company
        else:
            company = self[0].company_id._accessible_branches()[:1] or self[0].company_id

        # Compute tax details for a single line.
        currency = currency or company.currency_id
        if 'force_price_include' in self.env.context:
            special_mode = 'total_included' if self.env.context['force_price_include'] else 'total_excluded'
        elif not handle_price_include:
            special_mode = 'total_excluded'
        else:
            special_mode = False
        base_line = self._prepare_base_line_for_taxes_computation(
            None,
            partner_id=partner,
            currency_id=currency,
            product_id=product,
            tax_ids=self,
            price_unit=price_unit,
            quantity=quantity,
            is_refund=is_refund,
            special_mode=special_mode,
            document_tax_mode=document_tax_mode,
        )
        self._add_tax_details_in_base_line(base_line, company, self._get_tax_rounding_policy(company, rounding_policy))
        self.with_context(
            compute_all_use_raw_base_lines=True,
        )._add_accounting_data_to_base_line_tax_details(base_line, company, include_caba_tags=include_caba_tags)

        tax_details = base_line['tax_details']
        total_void = total_excluded = tax_details['raw_total_excluded_currency']
        total_included = tax_details['raw_total_included_currency']

        # Convert to the 'old' compute_all api.
        taxes = []
        for tax_data in tax_details['taxes_data']:
            tax = tax_data['tax']
            for tax_rep_data in tax_data['tax_reps_data']:
                rep_line = tax_rep_data['tax_rep']
                taxes.append({
                    'id': tax.id,
                    'name': partner and tax.with_context(lang=partner.lang).name or tax.name,
                    'amount': tax_rep_data['tax_amount_currency'],
                    'base': tax_data['raw_base_amount_currency'],
                    'sequence': tax.sequence,
                    'account_id': tax_rep_data['account'].id,
                    'analytic': tax.analytic,
                    'use_in_tax_closing': rep_line.use_in_tax_closing,
                    'is_reverse_charge': tax_data['is_reverse_charge'],
                    'price_include': tax._is_price_included(base_line['document_tax_mode']),
                    'tax_exigibility': tax.tax_exigibility,
                    'tax_repartition_line_id': rep_line.id,
                    'group': tax_data['group'],
                    'tag_ids': tax_rep_data['tax_tags'].ids,
                    'tax_ids': tax_rep_data['taxes'].ids,
                })
                if not rep_line.account_id:
                    total_void += tax_rep_data['tax_amount_currency']

        if self.env.context.get('round_base', True):
            total_excluded = currency.round(total_excluded)
            total_included = currency.round(total_included)

        return {
            'base_tags': base_line['tax_tag_ids'].ids,
            'taxes': taxes,
            'total_excluded': total_excluded,
            'total_included': total_included,
            'total_void': total_void,
        }

    def _filter_taxes_by_company(self, company=None):
        """ Filter taxes by the given company
            It goes through the company hierarchy until a tax is found
        """
        if not self:
            return self

        company = company or self.env.company
        taxes = self.env['account.tax']
        while not taxes and company:
            taxes = self.filtered(lambda t: t.company_id == company)
            company = company.sudo().parent_id
        return taxes

    @api.model
    def _fix_tax_included_price(self, price, prod_taxes, line_taxes, document_tax_mode=None):
        """Subtract tax amount from price when corresponding "price included" taxes do not apply"""
        # FIXME get currency in param?
        prod_taxes = prod_taxes._origin
        line_taxes = line_taxes._origin
        incl_tax = prod_taxes.filtered(lambda tax: tax not in line_taxes and tax._is_price_included(document_tax_mode))
        if incl_tax:
            return incl_tax.compute_all(price)['total_excluded']
        return price

    @api.model
    def _fix_tax_included_price_company(self, price, prod_taxes, line_taxes, company_id, document_tax_mode=None):
        if company_id:
            #To keep the same behavior as in _compute_tax_id
            prod_taxes = prod_taxes._filter_taxes_by_company(company_id)
            line_taxes = line_taxes._filter_taxes_by_company(company_id)
        return self._fix_tax_included_price(price, prod_taxes, line_taxes, document_tax_mode)

    def _get_description_plaintext(self):
        self.ensure_one()
        if is_html_empty(self.description):
            return ''
        return html2plaintext(self.description)

    @api.ondelete(at_uninstall=False)
    def unlink_except_tax_used(self):
        if any(self.mapped('is_used')):
            raise ValidationError(self.env._("You cannot delete taxes that are currently in use. Consider archiving them instead."))

    @api.model
    def _import_retrieve_tax_from_account_default_tax(self, tax_values):
        account = tax_values.get('account')
        if not account or not account.tax_ids:
            return

        return {
            'criteria': [{
                'domain': [('id', 'in', account.tax_ids.ids)],
            }],
        }

    @api.model
    def _import_retrieve_tax_from_predicted_tax(self, tax_values):
        predicted_tax_ids = tax_values.get('predicted_tax_ids')
        if not predicted_tax_ids:
            return

        return {
            'criteria': [{
                'domain': [('id', 'in', predicted_tax_ids.ids)],
            }],
        }

    @api.model
    def _import_retrieve_tax_from_price_include_exclude(self, tax_values):
        price_include = tax_values.get('price_include')
        fiscal_position = tax_values.get('fiscal_position')

        fpos_domain = []
        if fiscal_position:
            fpos_domain = Domain('fiscal_position_ids', '=', fiscal_position.id)
            if fiscal_position.is_domestic:
                fpos_domain |= Domain('fiscal_position_ids', '=', False)

        criteria = []
        if not price_include:
            if fiscal_position:
                criteria.append({'domain': [('price_include', '=', False)] + fpos_domain})
            criteria.append({'domain': [('price_include', '=', False)]})
        if price_include is None or price_include:
            if fiscal_position:
                criteria.append({'domain': [('price_include', '=', True)] + fpos_domain})
            criteria.append({'domain': [('price_include', '=', True)]})

        return {'criteria': criteria}

    @api.model
    def _import_retrieve_tax_from_fixed_allowance_charge(self, tax_values):
        if tax_values.get('amount_type') != 'fixed':
            return

        invoice = tax_values.get('invoice_predictive', {}).get('invoice')
        company_id = invoice.company_id.id if invoice else self.env.company.id
        calculated_amount = tax_values.get('amount', 0.0)
        reason = (tax_values.get('name') or '').strip().lower()
        type_tax_use = tax_values.get('type_tax_use')

        # ignore values param as it has a flawed static_domain, but we have to use it in the function signature
        def search_fixed_tax_fuzzy(values):
            candidate_taxes = self.search([
                ('company_id', 'in', [company_id, False]),
                ('amount_type', '=', 'fixed'),
                ('type_tax_use', '=', type_tax_use),
                ('amount', '>=', calculated_amount - 0.01),
                ('amount', '<=', calculated_amount + 0.01),
            ])

            if not candidate_taxes:
                return self

            if len(candidate_taxes) == 1:
                return candidate_taxes[0]

            for tax in candidate_taxes:
                tax_name = tax.name.strip().lower()
                if reason in tax_name or tax_name in reason:
                    return tax
            return self

        cache_key = (
            company_id,
            type_tax_use,
            calculated_amount,
            reason,
        )

        return {
            'criteria': [{
                'search_method': search_fixed_tax_fuzzy,
                'cache_key': cache_key,
            }],
        }

    @api.model
    def _import_retrieve_tax(self, search_plan, company, tax_values_list):
        cache = self.env.cr.cache.setdefault('retrieved_tax_map', {}).setdefault(company.id, {})

        static_domain = Domain(self._check_company_domain(company))
        for tax_values in tax_values_list:
            if tax_values.get('tax'):
                continue
            tax_domain = (
               Domain('amount_type', '=', tax_values['amount_type'])
               & Domain('type_tax_use', '=', tax_values['type_tax_use'])
            )
            ubl_cii_tax_category_code = 'ubl_cii_tax_category_code' in self._fields and tax_values.get('ubl_cii_tax_category_code')
            if tax_values['amount'] or ubl_cii_tax_category_code != 'AE':
                tax_domain &= Domain('amount', '=', tax_values['amount'])
            else:
                # Reverse charge taxes can be reported as 0% in the document even though the
                # tax itself isn't, so ignore the amount and rely on the category code instead.
                tax_domain &= Domain('ubl_cii_tax_category_code', '=', 'AE')
            orders = ['sequence', 'id']
            if invoice_predictive := tax_values.get('invoice_predictive'):
                fiscal_position = tax_values.get('fiscal_position')
                if fiscal_position and fiscal_position.foreign_vat:
                    country = fiscal_position.country_id
                else:
                    country = invoice_predictive['invoice'].tax_country_id
                tax_domain &= Domain('country_id', '=', country.id)
            if name := tax_values.get('name'):
                tax_domain &= Domain('name', '=', name)
            if tax_exigibility := tax_values.get('tax_exigibility'):
                tax_domain &= Domain('tax_exigibility', '=', tax_exigibility)
            if ubl_cii_tax_category_code:
                allowed_tax_category_codes = [ubl_cii_tax_category_code, False]
                if company.vat_disabled and ubl_cii_tax_category_code != 'O':
                    allowed_tax_category_codes.append('O')
                tax_domain &= Domain('ubl_cii_tax_category_code', 'in', allowed_tax_category_codes)
                orders.insert(0, 'ubl_cii_tax_category_code')
            if extra_domain := tax_values.get("extra_domain"):
                tax_domain &= Domain(extra_domain)

            for plan in search_plan:
                tax = None
                plan_values = plan(tax_values)
                if not plan_values:
                    continue

                for criteria in plan_values['criteria']:
                    domain = criteria.get('domain')
                    search_method = criteria.get('search_method')
                    if domain:
                        domain = tax_domain & Domain(domain)
                        cache_key = repr(domain.optimize(self.env['account.tax']))
                    else:
                        cache_key = criteria.get('cache_key')
                        if cache_key:
                            cache_key = (cache_key, str(tax_domain))

                    # Look at the cache if the value has already been tested with this key.
                    if cache_key and cache_key in cache:
                        if tax := cache[cache_key]:
                            tax_values['tax'] = tax
                            break
                        else:
                            continue

                    if domain:
                        full_domain = static_domain & Domain(domain)
                        tax = self.search(full_domain, order=','.join(orders), limit=1)
                    elif search_method:
                        tax = search_method({
                            **criteria,
                            'static_domain': tax_domain & static_domain,
                        })

                    if cache_key:
                        cache[cache_key] = tax
                    if tax:
                        tax_values['tax'] = tax
                        break

                if tax:
                    break


class AccountTaxRepartitionLine(models.Model):
    _name = 'account.tax.repartition.line'
    _description = "Tax Repartition Line"
    _order = 'document_type, repartition_type, sequence, id'
    _check_company_auto = True
    _check_company_domain = models.check_company_domain_parent_of

    factor_percent = fields.Float(
        string="%",
        default=100,
        digits=(16, 12),
        required=True,
        help="Factor to apply on the journal items generated from this distribution line, in percents",
    )
    factor = fields.Float(string="Factor Ratio", compute="_compute_factor", help="Factor to apply on the journal items generated from this distribution line")
    repartition_type = fields.Selection(string="Based On", selection=[('base', 'Base'), ('tax', 'of tax')], required=True, default='tax', help="Base on which the factor will be applied.")
    document_type = fields.Selection(string="Related to", selection=[('invoice', 'Invoice'), ('refund', 'Refund')], required=True)
    account_id = fields.Many2one(string="Account",
        comodel_name='account.account',
        ui_domain="[('account_type', 'not in', ('asset_receivable', 'liability_payable', 'off_balance'))]",
        check_company=True,
        index='btree_not_null',
        help="Account on which to post the tax amount")
    account_active = fields.Boolean(related='account_id.active', string="Account Active")
    tag_ids = fields.Many2many(string="Tax Grids", comodel_name='account.account.tag', domain=[('applicability', '=', 'taxes')], copy=True, ondelete='restrict')
    tax_id = fields.Many2one(comodel_name='account.tax', index='btree_not_null', ondelete='cascade', check_company=True)
    company_id = fields.Many2one(string="Company", comodel_name='res.company', related="tax_id.company_id", store=True, help="The company this distribution line belongs to.")
    sequence = fields.Integer(string="Sequence", default=1,
        help="The order in which distribution lines are displayed and matched. For refunds to work properly, invoice distribution lines should be arranged in the same order as the credit note distribution lines they correspond to.")
    use_in_tax_closing = fields.Boolean(
        string="Tax Closing Entry",
        compute='_compute_use_in_tax_closing', store=True, readonly=False, precompute=True,
    )

    tag_ids_domain = fields.Json(string="tag domain", help="Dynamic domain used for the tag that can be set on tax", compute="_compute_tag_ids_domain")

    @api.depends('company_id.multi_vat_foreign_country_ids', 'company_id.account_fiscal_country_id')
    def _compute_tag_ids_domain(self):
        for rep_line in self:
            allowed_country_ids = (False, rep_line.company_id.account_fiscal_country_id.id, *rep_line.company_id.multi_vat_foreign_country_ids.ids,)
            rep_line.tag_ids_domain = [('applicability', '=', 'taxes'), ('country_id', 'in', allowed_country_ids)]

    @api.depends('account_id', 'repartition_type')
    def _compute_use_in_tax_closing(self):
        for rep_line in self:
            rep_line.use_in_tax_closing = (
                rep_line.repartition_type == 'tax'
                and rep_line.account_id
                and rep_line.account_id.internal_group not in ('income', 'expense')
            )

    @api.depends('factor_percent')
    def _compute_factor(self):
        for record in self:
            record.factor = record.factor_percent / 100.0

    @api.onchange('repartition_type')
    def _onchange_repartition_type(self):
        if self.repartition_type == 'base':
            self.account_id = None

    def _get_aml_target_tax_account(self, force_caba_exigibility=False):
        """ Get the default tax account to set on a business line.

        :return: An account.account record or an empty recordset.
        """
        self.ensure_one()
        if not force_caba_exigibility and self.tax_id.tax_exigibility == 'on_payment' and not self.env.context.get('caba_no_transition_account'):
            return self.tax_id.cash_basis_transition_account_id
        else:
            return self.account_id
