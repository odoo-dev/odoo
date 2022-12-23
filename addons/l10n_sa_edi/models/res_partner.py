from odoo import fields, models, api


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_sa_edi_building_number = fields.Char("Building Number")
    l10n_sa_edi_plot_identification = fields.Char("Plot Identification")
    l10n_sa_edi_neighborhood = fields.Char("Neighborhood")

    l10n_sa_additional_identification_scheme = fields.Selection([
        ('CRN', 'Commercial Registration Number'),
        ('MOM', 'Momra License'),
        ('MLS', 'MLSD License'),
        ('SAG', 'Sagia License'),
        ('OTH', 'Other OD')
    ], default="CRN", string="Identification Scheme", help="Additional Identification scheme for Seller/Buyer")

    l10n_sa_additional_identification_number = fields.Char("Identification Number",
                                                           help="Additional Identification Number for Seller/Buyer")

    @api.model
    def _commercial_fields(self):
        return super()._commercial_fields() + ['l10n_sa_edi_building_number',
                                               'l10n_sa_edi_plot_identification',
                                               'l10n_sa_edi_neighborhood',
                                               'l10n_sa_additional_identification_scheme',
                                               'l10n_sa_additional_identification_number']

    def _address_fields(self):
        return super()._address_fields() + ['l10n_sa_edi_building_number',
                                            'l10n_sa_edi_plot_identification',
                                            'l10n_sa_edi_neighborhood']
