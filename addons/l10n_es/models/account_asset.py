# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class AccountAsset(models.Model):
    _inherit = 'account.asset'

    l10n_es_asset_type = fields.Selection(
        selection=[
            ('11', 'Terrenos dedicados exclusivamente a escombreras'),
            ('12', 'Edificaciones y Construcciones'),
            ('21', 'Maquinaria'),
            ('22', 'Elementos de Transporte'),
            ('23', 'Ordenadores y otros equipos informáticos'),
            ('24', 'Mobiliario'),
            ('25', 'Instalaciones'),
            ('26', 'Barcos y Aeronaves'),
            ('27', 'Batea'),
            ('28', 'Útiles y Herramientas'),
            ('29', 'Otro Inmovilizado Material'),
            ('31', 'Patentes y Marcas'),
            ('32', 'Derechos de Traspaso'),
            ('33', 'Aplicaciones Informáticas'),
            ('39', 'Otro Inmovilizado Intangible'),
            ('41', 'Ganado vacuno, porcino, ovino y caprino'),
            ('42', 'Ganado equino y frutales no cítricos'),
            ('43', 'Frutales cítricos y viñedos'),
            ('44', 'Olivar'),
            ('49', 'Otros Bienes Semovientes y Agrícolas'),
        ],
        string="Tipo de Bien",
        help="Tipo de bien según la codificación oficial española."
    )


class AccountAssetVariant(models.Model):
    _inherit = 'account.asset.variant'

    l10n_es_sale_move_id = fields.Many2one(
        comodel_name='account.move',
        string="Factura de Transmisión",
        readonly=True,
        copy=False,
        help="Factura de venta con la que se ha transmitido el bien.",
    )

    def set_to_close(self, invoice_line_ids, date=None, message=None):
        # Keep the sale invoice to fill the "Factura de Transmisión" columns of the
        # Libro Registro de Bienes de Inversión.
        self.l10n_es_sale_move_id = invoice_line_ids.move_id[:1]
        return super().set_to_close(invoice_line_ids, date=date, message=message)
