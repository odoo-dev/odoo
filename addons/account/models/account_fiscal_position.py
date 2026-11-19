# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, ValidationError
from odoo.tools import unique


class AccountFiscalPosition(models.Model):
    _name = 'account.fiscal.position'
    _description = 'Fiscal Position'
    _order = 'sequence, id'
    _check_company_auto = True
    _check_company_domain = models.check_company_domain_parent_of

    sequence = fields.Integer()
    name = fields.Char(string='Fiscal Position', required=True, translate=True)
    active = fields.Boolean(default=True,
        help="By unchecking the active field, you may hide a fiscal position without deleting it.")
    company_id = fields.Many2one(
        comodel_name='res.company',
        string='Company', required=True, readonly=True, index=True,
        default=lambda self: self.env.company)
    account_ids = fields.One2many('account.fiscal.position.account', 'position_id', string='Account Mapping', copy=True)
    account_map = fields.Json(compute='_compute_account_map')
    tax_ids = fields.Many2many(
        comodel_name='account.tax',
        relation='account_fiscal_position_account_tax_rel',
        column1='account_fiscal_position_id',
        column2='account_tax_id',
        string='Taxes',
    )
    tax_map = fields.Json(compute='_compute_tax_map')
    note = fields.Html('Notes', translate=True, help="Legal mentions that have to be printed on the invoices.")
    auto_apply = fields.Boolean(string='Detect Automatically', help="Apply tax & account mappings on invoices automatically if the matching criterias (Tax ID/Country) are met.")
    vat_required = fields.Boolean(string='Tax ID required', help="Apply only if partner has a Tax ID.")
    company_country_id = fields.Many2one(string="Company Country", related='company_id.account_fiscal_country_id')
    fiscal_country_codes = fields.Char(string="Company Fiscal Country Code", related='company_country_id.code')
    country_id = fields.Many2one('res.country', string='Country', inverse='_inverse_foreign_vat',
        help="Apply only if delivery country matches.")
    is_domestic = fields.Boolean(compute='_compute_is_domestic', store=True)
    country_group_id = fields.Many2one('res.country.group', string='Country Group', inverse='_inverse_foreign_vat',
        help="Apply only if delivery country matches the group.")
    state_ids = fields.Many2many('res.country.state', string='Federal States')
    zip_from = fields.Char(string='Zip Range From')
    zip_to = fields.Char(string='Zip Range To')
    # To be used in hiding the 'Federal States' field('attrs' in view side) when selected 'Country' has 0 states.
    states_count = fields.Integer(compute='_compute_states_count')
    foreign_vat = fields.Char(string="Foreign Tax ID", inverse="_inverse_foreign_vat", help="The tax ID of your company in the region mapped by this fiscal position.")

    # Technical field used to display a banner on top of foreign vat fiscal positions,
    # in order to ease the instantiation of foreign taxes when possible.
    foreign_vat_header_mode = fields.Selection(
        selection=[('templates_found', "Templates Found"), ('no_template', "No Template")],
        compute='_compute_foreign_vat_header_mode')

    @api.depends('company_id.domestic_fiscal_position_id')
    def _compute_is_domestic(self):
        for position in self:
            position.is_domestic = position == position.company_id.domestic_fiscal_position_id

    def _compute_states_count(self):
        for position in self:
            position.states_count = len(position.country_id.state_ids)

    @api.depends('foreign_vat', 'country_id')
    def _compute_foreign_vat_header_mode(self):
        for fiscal_position in self:
            if (
                    not fiscal_position.foreign_vat
                    or not fiscal_position.country_id
                    or self.env['account.tax'].search([('country_id', '=', fiscal_position.country_id.id)], limit=1)
            ):
                fiscal_position.foreign_vat_header_mode = False
            else:
                template_code = self.env['account.chart.template']._guess_chart_template(fiscal_position.country_id)
                template = self.env['account.chart.template']._get_chart_template_mapping()[template_code]
                # 'no_template' kept for compatibility in stable. To remove in master
                fiscal_position.foreign_vat_header_mode = 'templates_found' if template['module'] in self.env['ir.module.module']._installed() else 'no_template'

    @api.depends('tax_ids')
    def _compute_tax_map(self):
        for position in self:
            tax_map = defaultdict(list)
            for dest_tax in position.tax_ids:
                for src_tax in dest_tax.original_tax_ids:
                    tax_map[src_tax.id].append(dest_tax.id)
            position.tax_map = dict(tax_map)

    @api.depends('account_ids.account_src_id', 'account_ids.account_dest_id')
    def _compute_account_map(self):
        for position in self:
            position.account_map = {al.account_src_id.id: al.account_dest_id.id for al in position.account_ids}

    @api.constrains('zip_from', 'zip_to')
    def _check_zip(self):
        for position in self:
            if bool(position.zip_from) != bool(position.zip_to) or position.zip_from > position.zip_to:
                raise ValidationError(_('Invalid "Zip Range", You have to configure both "From" and "To" values for the zip range and "To" should be greater than "From".'))

    @api.constrains('country_id', 'country_group_id', 'state_ids', 'foreign_vat')
    def _validate_foreign_vat_country(self):
        for record in self:
            if record.foreign_vat:
                if not record.country_id:
                    raise ValidationError(_("The country of the foreign Tax ID could not be detected. Please assign a country to the fiscal position."))
                if record.country_id == record.company_id.account_fiscal_country_id:
                    if not record.state_ids:
                        if record.company_id.account_fiscal_country_id.state_ids:
                            raise ValidationError(_("You cannot create a fiscal position with a foreign Tax ID within your fiscal country without assigning it a state."))
                if record.country_group_id and record.country_id:
                    if record.country_id not in record.country_group_id.country_ids:
                        raise ValidationError(_("You cannot create a fiscal position with a country outside of the selected country group."))

                similar_fpos_count = self.env['account.fiscal.position'].search_count([
                    *self.env['account.fiscal.position']._check_company_domain(record.company_id),
                    ('foreign_vat', 'not in', (False, record.foreign_vat)),
                    ('id', '!=', record.id),
                    ('country_id', '=', record.country_id.id),
                ])
                if similar_fpos_count:
                    raise ValidationError(_("A fiscal position with a foreign Tax ID already exists in this country."))

    @api.onchange('country_id', 'foreign_vat')
    def _onchange_foreign_vat(self):
        self.foreign_vat, _country_code = self.env['res.partner']._run_vat_checks(self.country_id, self.foreign_vat, validation=False)

    def _inverse_foreign_vat(self):
        for record in self:
            if not record.foreign_vat:
                continue

            if record.country_id:
                fp_label = _("fiscal position [%s]", record.name)
                record.foreign_vat, _country_code = self.env['res.partner']._run_vat_checks(record.country_id, record.foreign_vat, partner_name=fp_label)

    def map_tax(self, taxes):
        if not self:
            return taxes
        self.ensure_one()
        tax_map = self.tax_map or {}
        return self.env['account.tax'].browse(unique(
            tax_id
            for tax in taxes
            for tax_id in tax_map.get(
                str(tax.id),
                # If not in tax_map, a tax is mapped to itself if it has 'self' as fiscal position
                # or it has no fiscal position. Else it's removed.
                [tax.id] if self in tax.fiscal_position_ids or not tax.fiscal_position_ids else [],
            )
        ))

    def map_account(self, account):
        return self.env['account.account'].browse((self.account_map or {}).get(str(account.id), account.id))

    @api.onchange('country_id')
    def _onchange_country_id(self):
        if self.country_id:
            self.zip_from = self.zip_to = False
            self.state_ids = [(5,)]
            self.states_count = len(self.country_id.state_ids)

    @api.onchange('country_group_id')
    def _onchange_country_group_id(self):
        if self.country_group_id:
            self.zip_from = self.zip_to = False
            self.state_ids = [(5,)]

    @api.model
    def _convert_zip_values(self, zip_from='', zip_to=''):
        if zip_from and zip_to:
            max_length = max(len(zip_from), len(zip_to))
            if zip_from.isdigit():
                zip_from = zip_from.rjust(max_length, '0')
            if zip_to.isdigit():
                zip_to = zip_to.rjust(max_length, '0')
        return zip_from, zip_to

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            zip_from = vals.get('zip_from')
            zip_to = vals.get('zip_to')
            if zip_from and zip_to:
                vals['zip_from'], vals['zip_to'] = self._convert_zip_values(zip_from, zip_to)
        return super().create(vals_list)

    def write(self, vals):
        zip_from = vals.get('zip_from')
        zip_to = vals.get('zip_to')
        if zip_from or zip_to:
            for rec in self:
                vals['zip_from'], vals['zip_to'] = self._convert_zip_values(zip_from or rec.zip_from, zip_to or rec.zip_to)
        return super().write(vals)

    def _get_first_matching_fpos(self, partner):
        sorted_fpos = self.sorted(key=lambda f: (-len(f.company_id.sudo().parent_ids), f.sequence))  # company specific first, then sequence
        for fpos in sorted_fpos:
            if all(fn(fpos) for fn in self._get_fpos_validation_functions(partner)):
                return fpos
        return self.env['account.fiscal.position']

    def _get_fpos_validation_functions(self, partner):
        """ Returns a list of functions to validate fiscal positions against a partner.
        """
        return [
            # vat required
            lambda fpos: (
                not fpos.vat_required or partner._get_vat_required_valid(company=self.env.company)
            ),
            # zip code
            lambda fpos:(
                not (fpos.zip_from and fpos.zip_to)
                or (partner.zip and (fpos.zip_from <= partner.zip <= fpos.zip_to))
            ),
            # state
            lambda fpos: (
                not fpos.state_ids
                or (partner.state_id in fpos.state_ids)
            ),
            # country
            lambda fpos: (
                not fpos.country_id
                or (partner.country_id == fpos.country_id)
            ),
            # country group
            lambda fpos: (
                not fpos.country_group_id
                or (partner.country_id in fpos.country_group_id.country_ids and
                    (not partner.state_id or partner.state_id not in fpos.country_group_id.exclude_state_ids))
            ),
        ]

    @api.model
    def _get_fiscal_position(self, partner, delivery=None):
        """
        :return: fiscal position found (recordset)
        :rtype: :class:`account.fiscal.position`
        """
        if not partner:
            return self.env['account.fiscal.position']

        company = self.env.company
        intra_eu = vat_exclusion = False
        if company.has_vat and partner.has_vat:
            eu_country_codes = set(self.env.ref('base.europe').country_ids.mapped('code'))
            intra_eu = company.vat[:2] in eu_country_codes and partner.vat[:2] in eu_country_codes
            vat_exclusion = company.vat[:2] == partner.vat[:2]

        # If company and partner have the same vat prefix (and are both within the EU), use invoicing
        if not delivery or (intra_eu and vat_exclusion and partner.country_id == company.country_id):
            delivery = partner

        # partner manually set fiscal position always win
        manual_fiscal_position = (
            delivery.with_company(company).property_account_position_id
            or partner.with_company(company).property_account_position_id
        )
        if manual_fiscal_position:
            return manual_fiscal_position

        if not partner.country_id:
            return self.env['account.fiscal.position']

        all_auto_apply_fpos = self.search(self._check_company_domain(self.env.company) + [('auto_apply', '=', True)])

        return all_auto_apply_fpos._get_first_matching_fpos(delivery)

    def action_open_related_taxes(self):
        list_view = self.env.ref('account.account_tax_fiscal_position_view_tree', raise_if_not_found=False)
        domain = [
            *self.env['account.tax']._check_company_domain(self.company_id),
            '|',
                ('id', 'in', self.tax_ids.ids),
                ('fiscal_position_ids', '=', False),
        ]
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._("%s taxes", self.display_name),
            'res_model': 'account.tax',
            'views': [(list_view.id if list_view else False, 'list'), (False, 'form')],
            'domain': domain,
            'context': {'active_test': False},
        }

    def action_create_foreign_taxes(self):
        if not (self.env.su or self.env.user._is_admin() or self.env.user.has_group('account.group_account_manager')):
            raise AccessError(_("Only Accounting managers can create foreign taxes."))
        self.ensure_one()
        template_code = self.env['account.chart.template']._guess_chart_template(self.country_id)
        template = self.env['account.chart.template']._get_chart_template_mapping()[template_code]
        if template['module'] not in self.env['ir.module.module']._installed():
            localization_module = self.env['ir.module.module'].search([('name', '=', template['module'])])
            localization_module.sudo().button_immediate_install()
        created_records = self.env["account.chart.template"]._instantiate_foreign_taxes(self.country_id, self.company_id)
        created_records.get('account.tax', self.env['account.tax']).fiscal_position_ids += self


class AccountFiscalPositionAccount(models.Model):
    _name = 'account.fiscal.position.account'
    _description = 'Accounts Mapping of Fiscal Position'
    _rec_name = 'position_id'
    _check_company_auto = True
    _check_company_domain = models.check_company_domain_parent_of

    position_id = fields.Many2one('account.fiscal.position', string='Fiscal Position',
        required=True, ondelete='cascade')
    company_id = fields.Many2one('res.company', string='Company', related='position_id.company_id', store=True)
    account_src_id = fields.Many2one('account.account', string='Account on Product',
        check_company=True, required=True,
    )
    account_dest_id = fields.Many2one('account.account', string='Account to Use Instead',
        check_company=True, required=True,
    )

    _account_src_dest_uniq = models.Constraint(
        'unique (position_id,account_src_id,account_dest_id)',
        'An account fiscal position could be defined only one time on same accounts.',
    )
