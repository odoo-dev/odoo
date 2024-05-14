# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import api, fields, models, tools
from odoo.osv import expression
from odoo.exceptions import UserError
from odoo.tools.translate import _

from .country_codes import COUNTRY_CODES


FLAG_MAPPING = {
    "GF": "fr",
    "BV": "no",
    "BQ": "nl",
    "GP": "fr",
    "HM": "au",
    "YT": "fr",
    "RE": "fr",
    "MF": "fr",
    "UM": "us",
}

NO_FLAG_COUNTRIES = [
    "AQ", #Antarctica
    "SJ", #Svalbard + Jan Mayen : separate jurisdictions : no dedicated flag
]

COUNTRY_CODE_2_TO_3 = {codes[0]: codes[1] for codes in COUNTRY_CODES}
COUNTRY_CODE_2_TO_NUM = {codes[0]: codes[2] for codes in COUNTRY_CODES}
COUNTRY_CODE_2_TO_PHONE = {codes[0]: codes[3] for codes in COUNTRY_CODES}


class Country(models.Model):
    _name = 'res.country'
    _description = 'Country'
    _order = 'name'

    name = fields.Char(
        string='Country Name', required=True, translate=True)
    code = fields.Char(
        string='Country Code', size=2,
        required=True,
        help='The ISO country code in two chars. \nYou can use this field for quick search.')
    iso_alpha3 = fields.Char(
        string='Alpha-3 Code', size=3,
        compute='_compute_iso_alpha3', store=True, readonly=False,
        required=True, precompute=True,
        help='The ISO country code in three chars.\nYou can use this field for quick search.'
    )
    iso_num = fields.Char(
        string='Numeric Code', size=3,
        compute='_compute_iso_num', store=True, readonly=False,
        required=True, precompute=True,
        help='The ISO country code in three digits.\nYou can use this field for quick search.'
    )
    address_format = fields.Text(string="Layout in Reports",
        help="Display format to use for addresses belonging to this country.\n\n"
             "You can use python-style string pattern with all the fields of the address "
             "(for example, use '%(street)s' to display the field 'street') plus"
             "\n%(state_name)s: the name of the state"
             "\n%(state_code)s: the code of the state"
             "\n%(country_name)s: the name of the country"
             "\n%(country_code)s: the code of the country",
        default='%(street)s\n%(street2)s\n%(city)s %(state_code)s %(zip)s\n%(country_name)s')
    address_view_id = fields.Many2one(
        comodel_name='ir.ui.view', string="Input View",
        domain=[('model', '=', 'res.partner'), ('type', '=', 'form')],
        help="Use this field if you want to replace the usual way to encode a complete address. "
             "Note that the address_format field is used to modify the way to display addresses "
             "(in reports for example), while this field is used to modify the input form for "
             "addresses.")
    currency_id = fields.Many2one('res.currency', string='Currency')
    image_url = fields.Char(
        compute="_compute_image_url", string="Flag",
        help="Url of static flag image",
    )
    phone_code = fields.Integer(
        string='Country Calling Code',
        compute='_compute_phone_code', store=True, readonly=False,
        precompute=True,
    )
    country_group_ids = fields.Many2many('res.country.group', 'res_country_res_country_group_rel',
                         'res_country_id', 'res_country_group_id', string='Country Groups')
    state_ids = fields.One2many('res.country.state', 'country_id', string='States')
    name_position = fields.Selection([
            ('before', 'Before Address'),
            ('after', 'After Address'),
        ], string="Customer Name Position", default="before",
        help="Determines where the customer/company name should be placed, i.e. after or before the address.")
    vat_label = fields.Char(string='Vat Label', translate=True, prefetch=True, help="Use this field if you want to change vat label.")

    state_required = fields.Boolean(default=False)
    zip_required = fields.Boolean(default=True)

    _sql_constraints = [
        ('name_uniq', 'unique (name)',
            'The name of the country must be unique!'),
        ('code_uniq', 'unique (code)',
            'The code of the country must be unique!')
    ]

    @api.depends('code')
    def _compute_iso_alpha3(self):
        for country in self:
            country.iso_alpha3 = COUNTRY_CODE_2_TO_3.get(country.code)

    @api.depends('code')
    def _compute_iso_num(self):
        for country in self:
            country.iso_num = COUNTRY_CODE_2_TO_NUM.get(country.code)

    @api.depends('code')
    def _compute_phone_code(self):
        for country in self:
            country.phone_code = COUNTRY_CODE_2_TO_PHONE.get(country.code)

    def _name_search(self, name, domain=None, operator='ilike', limit=None, order=None):
        if domain is None:
            domain = []

        ids = []
        if len(name) == 2:
            ids = list(self._search([('code', '=', name.upper())] + domain, limit=limit, order=order))
        elif len(name) == 3 and name.isalpha():
            ids = list(self._search([('iso_alpha3', '=', name.upper())] + domain, limit=limit, order=order))
        elif len(name) == 3 and name.isdecimal():
            ids = list(self._search([('iso_num', '=', name)] + domain, limit=limit, order=order))

        search_domain = [('name', operator, name)]
        if ids:
            search_domain.append(('id', 'not in', ids))
        ids += list(self._search(search_domain + domain, limit=limit, order=order))

        return ids

    @api.model
    @tools.ormcache('code')
    def _phone_code_for(self, code):
        return self.search([('code', '=', code)]).phone_code

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('code'):
                vals['code'] = vals['code'].upper()
        return super(Country, self).create(vals_list)

    def write(self, vals):
        if vals.get('code'):
            vals['code'] = vals['code'].upper()
        res = super().write(vals)
        if ('code' in vals or 'phone_code' in vals):
            # Intentionally simplified by not clearing the cache in create and unlink.
            self.env.registry.clear_cache()
        if 'address_view_id' in vals:
            # Changing the address view of the company must invalidate the view cached for res.partner
            # because of _view_get_address
            self.env.registry.clear_cache('templates')
        return res

    def get_address_fields(self):
        self.ensure_one()
        return re.findall(r'\((.+?)\)', self.address_format)

    @api.depends('code')
    def _compute_image_url(self):
        for country in self:
            if not country.code or country.code in NO_FLAG_COUNTRIES:
                country.image_url = False
            else:
                code = FLAG_MAPPING.get(country.code, country.code.lower())
                country.image_url = "/base/static/img/country_flags/%s.png" % code

    @api.constrains('address_format')
    def _check_address_format(self):
        for record in self:
            if record.address_format:
                address_fields = self.env['res.partner']._formatting_address_fields() + ['state_code', 'state_name', 'country_code', 'country_name', 'company_name']
                try:
                    record.address_format % {i: 1 for i in address_fields}
                except (ValueError, KeyError):
                    raise UserError(_('The layout contains an invalid format key'))

class CountryGroup(models.Model):
    _description = "Country Group"
    _name = 'res.country.group'

    name = fields.Char(required=True, translate=True)
    country_ids = fields.Many2many('res.country', 'res_country_res_country_group_rel',
                                   'res_country_group_id', 'res_country_id', string='Countries')


class CountryState(models.Model):
    _description = "Country state"
    _name = 'res.country.state'
    _order = 'code'

    country_id = fields.Many2one('res.country', string='Country', required=True)
    name = fields.Char(string='State Name', required=True,
               help='Administrative divisions of a country. E.g. Fed. State, Departement, Canton')
    code = fields.Char(string='State Code', help='The state code.', required=True)

    _sql_constraints = [
        ('name_code_uniq', 'unique(country_id, code)', 'The code of the state must be unique by country!')
    ]

    @api.model
    def _name_search(self, name, domain=None, operator='ilike', limit=None, order=None):
        domain = domain or []
        if self.env.context.get('country_id'):
            domain = expression.AND([domain, [('country_id', '=', self.env.context.get('country_id'))]])

        if operator == 'ilike' and not (name or '').strip():
            domain1 = []
            domain2 = []
        else:
            domain1 = [('code', '=ilike', name)]
            domain2 = [('name', operator, name)]

        first_state_ids = []
        if domain1:
            first_state_ids = list(self._search(
                expression.AND([domain1, domain]), limit=limit, order=order,
            ))
        fallback_domain = None
        if name:
            m = re.fullmatch(r"(?P<name>.+)\((?P<country>.+)\)", name)
            if m:
                fallback_domain = [
                    ('name', operator, m['name'].strip()),
                    '|', ('country_id.name', 'ilike', m['country'].strip()),
                         ('country_id.code', '=', m['country'].strip()),
                ]
        return first_state_ids + list(self._search(
            expression.AND([domain2, domain, [('id', 'not in', first_state_ids)]]),
            limit=limit,
            order=order,
        )) or (
            list(self._search(expression.AND([fallback_domain, domain]), limit=limit))
            if fallback_domain
            else []
        )

    @api.depends('country_id')
    def _compute_display_name(self):
        for record in self:
            record.display_name = f"{record.name} ({record.country_id.code})"
