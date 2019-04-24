from odoo import models, fields, api, _
from odoo.exceptions import UserError
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
    l10n_ar_id_category_id = fields.Many2one(
        string="Identification Category",
        comodel_name='l10n_ar_id_category',
        index=True,
        auto_join=True,
    )

    @api.multi
    def cuit_required(self):
        self.ensure_one()
        if not self.l10n_ar_cuit:
            raise UserError(_('No CUIT configured for partner [%i] %s') % (
                self.id, self.name))
        return self.l10n_ar_cuit

    @api.depends('l10n_ar_cuit')
    def _compute_l10n_ar_formated_cuit(self):
        for rec in self:
            if not rec.l10n_ar_cuit:
                continue
            cuit = rec.l10n_ar_cuit
            rec.l10n_ar_formated_cuit = "{0}-{1}-{2}".format(
                cuit[0:2], cuit[2:10], cuit[10:])

    @api.depends('l10n_ar_id_number', 'l10n_ar_id_category_id')
    def _compute_l10n_ar_cuit(self):
        """ Agregamos a partner el campo calculado "l10n_ar_cuit" que devuelve
        un cuit o nada si no existe y además un método que puede ser llamado
        con .cuit_required() que devuelve el cuit o un error si no se encuentra
        ninguno.
        """
        for rec in self:
            # el cuit solo lo devolvemos si es el doc principal
            # para que no sea engañoso si no tienen activado multiples doc
            # y esta seleccionado otro que no es cuit
            # igualmente, si es un partner del extranjero intentamos devolver
            # cuit fisica o juridica del pais
            if rec.l10n_ar_id_category_id.afip_code != 80:
                country = rec.country_id
                if country and country.code != 'AR':
                    if rec.is_company:
                        rec.l10n_ar_cuit = country.l10n_ar_cuit_juridica
                    else:
                        rec.l10n_ar_cuit = country.l10n_ar_cuit_fisica
                continue
            # agregamos esto para el caso donde el registro todavia no se creo
            # queremos el cuit para que aparezca el boton de refrescar de afip
            if rec.l10n_ar_id_category_id.afip_code == 80:
                rec.l10n_ar_cuit = rec.l10n_ar_id_number

    @api.constrains('l10n_ar_id_number', 'l10n_ar_id_category_id')
    def check_vat(self):
        """ Update the the vat field using the information we have from
        l10n_ar_id_number and l10n_ar_id_category_id fields
        """
        for rec in self:
            if rec.l10n_ar_id_number and rec.l10n_ar_id_category_id and \
               rec.l10n_ar_id_category_id.afip_code == 80:
                rec.vat = 'AR' + rec.l10n_ar_id_number

    @api.constrains('l10n_ar_id_number', 'l10n_ar_id_category_id')
    def check_id_number_unique(self):
        if not safe_eval(self.env['ir.config_parameter'].sudo().get_param(
                "l10n_ar_partner.unique_id_numbers", 'False')):
            return True
        for rec in self:
            # we allow same number in related partners
            related_partners = rec.search([
                '|', ('id', 'parent_of', rec.id),
                ('id', 'child_of', rec.id)])
            same_id_numbers = rec.search([
                ('l10n_ar_id_number', '=', rec.l10n_ar_id_number),
                ('category_id', '=', rec.l10n_ar_id_category_id.id),
                ('partner_id', 'not in', related_partners.ids),
                # ('id', '!=', rec.id),
            ]) - rec
            if same_id_numbers:
                raise ValidationError(_(
                    'Id Number must be unique per id category!\nSame number '
                    'is only allowed for partner with parent/child relation'))

    @api.model
    def name_search(self, name='', args=None, operator='ilike', limit=100):
        """ We first search by l10n_ar_id_number field
        """
        if not args:
            args = []
        # solo para estos operadores para no romper cuando se usa, por ej,
        # no contiene algo del nombre
        if name and operator in ('ilike', 'like', '=', '=like', '=ilike'):
            recs = self.search(
                [('l10n_ar_id_number', operator, name)] + args, limit=limit)
            if recs:
                return recs.name_get()
        return super(ResPartner, self).name_search(
            name, args=args, operator=operator, limit=limit)

    @api.constrains('l10n_ar_id_number', 'l10n_ar_id_category_id')
    @api.onchange('l10n_ar_id_number', 'l10n_ar_id_category_id')
    def validate_id_number(self):
        for rec in self.filtered(
                lambda x: x.l10n_ar_id_number and x.l10n_ar_id_category_id):
            rec.l10n_ar_id_category_id.validate_id_number(
                rec.l10n_ar_id_number)
