# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from odoo.tools.safe_eval import safe_eval


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_ar_cuit = fields.Char(
        compute='_compute_l10n_ar_cuit',
    )
    l10n_ar_formated_cuit = fields.Char(
        compute='_compute_l10n_ar_formated_cuit',
    )
    l10n_ar_id_number = fields.Char(
        string='Identification Number',
    )
    l10n_ar_identification_type_id = fields.Many2one(
        string="Identification Type",
        comodel_name='l10n_ar.identification.type',
        index=True,
        auto_join=True,
    )

    @api.multi
    def ensure_cuit(self):
        """ This method is a helper that returns the cuit number is this one is
        defined if not raise an UserError.

        CUIT is not mandatory field but for some Argentinian operations the
        cuit is required, for eg  validate an electronic invoice, build a
        report, etc.

        This method can be used to validate is the cuit is proper defined in
        the partner
        """
        self.ensure_one()
        if not self.l10n_ar_cuit:
            raise UserError(_(
                'No CUIT configured for partner [%i] %s') % (
                    self.id, self.name))
        return self.l10n_ar_cuit

    @api.depends('l10n_ar_cuit')
    def _compute_l10n_ar_formated_cuit(self):
        """ This will add some dash to the CUIT number in order to show in his
        natural format: {person_category}-{number}-{validation_number}
        """
        for rec in self:
            if not rec.l10n_ar_cuit:
                continue
            cuit = rec.l10n_ar_cuit
            rec.l10n_ar_formated_cuit = "{0}-{1}-{2}".format(
                cuit[0:2], cuit[2:10], cuit[10:])

    @api.depends('l10n_ar_id_number', 'l10n_ar_identification_type_id')
    def _compute_l10n_ar_cuit(self):
        """ We add this computed field that returns cuit or nothing ig this one
        is not set for the partner. This validation can be also done by calling
        ensure_cuit() method that returns the cuit or error if this one is not
        found.
        """
        for rec in self:
            # If the partner is outside Argentina then we return the defined
            # country cuit defined by AFIP for that specific partner
            if rec.l10n_ar_identification_type_id.afip_code != 80:
                country = rec.country_id
                if country and country.code != 'AR':
                    if rec.is_company:
                        rec.l10n_ar_cuit = country.l10n_ar_cuit_juridica
                    else:
                        rec.l10n_ar_cuit = country.l10n_ar_cuit_fisica
                continue
            if rec.l10n_ar_identification_type_id.afip_code == 80:
                rec.l10n_ar_cuit = rec.l10n_ar_id_number

    @api.model
    def create(self, values):
        """ Generate the vat field value with the information in
        the l10n_ar_id_number and l10n_ar_identification_type_id fields
        """
        self.update_vat(values)
        return super(ResPartner, self).create(values)

    @api.multi
    def write(self, values):
        """ Generate the vat field value with the information in
        the l10n_ar_id_number and l10n_ar_identification_type_id fields
        """
        self.update_vat(values)
        return super(ResPartner, self).write(values)

    @api.multi
    def update_vat(self, values):
        """ get the vat field value using the information we have in
        l10n_ar_id_number and l10n_ar_identification_type_id fields
        """
        id_number = values.get(
            'l10n_ar_id_number', self.l10n_ar_id_number or False)
        id_type = values.get(
            'l10n_ar_identification_type_id',
            self.l10n_ar_identification_type_id.id or False)

        if id_type:
            id_type = self.env['l10n_ar.identification.type'].browse(id_type)

        if id_number and id_type and id_type.afip_code == 80:
            values.update({'vat': 'AR' + id_number})
        return values

    @api.model
    def _name_search(self, name, args=None, operator='ilike', limit=100,
                     name_get_uid=None):
        """ We add the functionality to found partner by identification number
        """
        if not args:
            args = []
        # We used only this operarators in order to do not break the search.
        # For example: when searching like "Does not containt" in name field
        if name and operator in ('ilike', 'like', '=', '=like', '=ilike'):
            recs = self.search(
                [('l10n_ar_id_number', operator, name)] + args, limit=limit)
            if recs:
                return recs.name_get()
        return super(ResPartner, self)._name_search(
            name, args=args, operator=operator, limit=limit)
