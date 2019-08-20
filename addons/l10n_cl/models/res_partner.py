# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError


class ResPartner(models.Model):
    _name = 'res.partner'
    _inherit = 'res.partner'

    def _get_default_country_id(self):
        allowed_company = self._context.get('allowed_company_ids')
        if not allowed_company:
            return False
        company = self.env['res.company'].browse(allowed_company[0])
        return company.country_id == self.env.ref('base.cl') and self.env.ref('base.cl')

    def _get_default_l10n_cl_sii_taxpayer_type(self):
        allowed_company = self._context.get('allowed_company_ids')
        if not allowed_company:
            return self._context.get('install_module') == 'l10n_cl' and '1'
        company = self.env['res.company'].browse(allowed_company[0])
        return company.country_id == self.env.ref('base.cl') and '1'

    country_id = fields.Many2one(
        'res.country', default=_get_default_country_id)

    _sii_taxpayer_types = [
        ('1', _('VAT Affected (1st Category)')),
        ('2', _('Fees Receipt Issuer (2nd category)')),
        ('3', _('End Consumer')),
        ('4', _('Foreigner')),
    ]

    l10n_cl_sii_taxpayer_type = fields.Selection(
        _sii_taxpayer_types,
        'Taxpayer Types',
        index=True,
        default=_get_default_l10n_cl_sii_taxpayer_type,
        help='1 - VAT Affected (1st Category) (Most of the cases)\n'
        '2 - Fees Receipt Issuer (Applies to suppliers who issue fees receipt)\n'
        '3 - End consumer (only receipts)\n'
        '4 - Foreigner'
    )

    l10n_cl_rut = fields.Char(
        compute='_compute_l10n_cl_rut',
        string="Invoicing RUT",
        help='Computed field that will convert the given rut number to often'
             ' local used format')

    l10n_cl_rut_dv = fields.Char(
        compute='_compute_l10n_cl_rut',
        string="RUT's DV",
        help='Computed field that returns RUT or nothing if this one is not'
             ' set for the partner')

    def _l10n_cl_get_validation_module(self):
        self.ensure_one()
        if not self.country_id:
            return False, False
        elif self.l10n_latam_identification_type_id.name in ['RUT', 'RUN']:
            country_origin = 'cl'
        elif self.country_id.code != 'CL':
            country_origin = self.country_id.code.lower()
        else:
            return False, False
        try:
            country_validator = getattr(
                __import__('stdnum', fromlist=[country_origin]), country_origin)
        except AttributeError:
            # there is no validator for the selected country
            return False, False
        if 'vat' in dir(country_validator):
            return country_validator.vat, country_origin
        else:
            return False, False

    def _l10n_cl_latamfication_validator(self):
        for rec in self.filtered('vat'):
            module = rec._l10n_cl_get_validation_module()
            if not module[0]:
                continue
            try:
                module[0].validate(rec.vat)
            except module[0].InvalidChecksum:
                raise ValidationError(_('The validation digit is not valid.'))
            except module[0].InvalidLength:
                raise ValidationError(_('Invalid length.'))
            except module[0].InvalidFormat:
                raise ValidationError(_('Only numbers allowed.'))
            except Exception as error:
                raise ValidationError(repr(error))

    @api.constrains('vat', 'l10n_latam_identification_type_id')
    def check_vat(self):
        if self.company_id.country_id != self.env.ref('base.cl'):
            return super().check_vat()
        l10n_cl_partners = self.filtered('l10n_latam_identification_type_id')
        l10n_cl_partners._l10n_cl_latamfication_validator()
        return super(ResPartner, self - l10n_cl_partners).check_vat()

    @api.depends('vat', 'country_id', 'l10n_latam_identification_type_id')
    @api.onchange('vat', 'country_id', 'l10n_latam_identification_type_id')
    def _compute_l10n_cl_rut(self):
        for rec in self.filtered('vat'):
            if rec.company_id.country_id != self.env.ref('base.cl'):
                continue
            module = rec._l10n_cl_get_validation_module()
            if not module[0]:
                continue
            if module[1] == 'cl':
                rec.l10n_cl_rut = module[0].format(rec.vat).replace('.', '')
                rec.vat = rec.l10n_cl_rut
                rec.l10n_cl_rut_dv = rec.l10n_cl_rut[-1:]
            else:
                try:
                    rec.vat = module[0].format(rec.vat)
                except AttributeError:
                    pass
                rec.l10n_cl_rut = '55555555-5'
            
    def validate_rut(self):
        self.ensure_one()
        if not self.l10n_cl_rut:
            raise UserError(_('No RUT configured for partner [%i] %s') % (self.id, self.name))
        return self.l10n_cl_rut
