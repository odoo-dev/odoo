# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError

ADDRESS_FIELDS = ('delivery_from_street', 'delivery_from_zip', 'delivery_from_city', 'delivery_from_state_id', 'delivery_from_country_id')

# Countries that use miles instead of kilometers for distance
_IMPERIAL_COUNTRY_CODES = {'US', 'GB', 'MM', 'LR'}


class PosPreset(models.Model):
    _inherit = 'pos.preset'

    delivery_from_address = fields.Char(
        string="Sender address",
        compute="_compute_delivery_from_address",
        store=True,
    )
    delivery_from_street = fields.Char(string="Street")
    delivery_from_city = fields.Char(string="City")
    delivery_from_zip = fields.Char(string="Zip")
    delivery_from_country_id = fields.Many2one(
        comodel_name="res.country",
        string="Country",
    )
    delivery_from_state_id = fields.Many2one(
        comodel_name="res.country.state",
        string="State",
    )
    delivery_from_latitude = fields.Float(string="Latitude", digits=(10, 7))
    delivery_from_longitude = fields.Float(string="Longitude", digits=(10, 7))
    delivery_max_distance_km = fields.Float(
        string="Max radius",
        default=10.0,
        help="Maximum delivery distance, in the unit shown next to the field.",
    )
    delivery_distance_unit = fields.Selection(
        selection=[('km', 'km'), ('mi', 'mi')],
        string="Distance unit",
        default=lambda self: 'mi' if self.env.company.country_id.code in _IMPERIAL_COUNTRY_CODES else 'km',
    )

    def _get_delivery_from_address_parts(self):
        self.ensure_one()
        company = self.env.company
        street = self.delivery_from_street or company.street
        city = self.delivery_from_city or company.city
        zip_code = self.delivery_from_zip or company.zip
        state = self.delivery_from_state_id.name or company.state_id.name
        country = self.delivery_from_country_id.name or company.country_id.name
        return [part for part in (street, zip_code, city, state, country) if part]

    @api.depends(*ADDRESS_FIELDS)
    def _compute_delivery_from_address(self):
        for preset in self:
            preset.delivery_from_address = ", ".join(preset._get_delivery_from_address_parts())

    @api.onchange('service_at')
    def _onchange_service_at_delivery_from_address(self):
        if self.service_at != 'delivery' or any(self[field] for field in ADDRESS_FIELDS):
            return
        company_configs = self.env['pos.config'].search([('company_id', '=', self.env.company.id)])
        company_presets = company_configs.available_preset_ids | company_configs.default_preset_id
        existing = company_presets.filtered(lambda preset: preset.service_at == 'delivery' and preset.delivery_from_street)[:1]
        if existing:
            self.update({field: existing[field] for field in ADDRESS_FIELDS})
            return
        company = self.env.company
        self.update({
            'delivery_from_street': company.street,
            'delivery_from_city': company.city,
            'delivery_from_zip': company.zip,
            'delivery_from_state_id': company.state_id,
            'delivery_from_country_id': company.country_id,
        })

    def write(self, vals):
        res = super().write(vals)
        if any(field in vals for field in ADDRESS_FIELDS):
            for preset in self:
                preset._geo_localize_delivery_address()
        return res

    @api.model_create_multi
    def create(self, vals_list):
        presets = super().create(vals_list)
        for preset in presets:
            if preset.delivery_from_address and not (preset.delivery_from_latitude or preset.delivery_from_longitude):
                preset._geo_localize_delivery_address()
        return presets

    def _geo_localize_delivery_address(self):
        self.ensure_one()
        if not self.delivery_from_address or not any(self[field] for field in ADDRESS_FIELDS):
            self.delivery_from_latitude = 0.0
            self.delivery_from_longitude = 0.0
            return
        try:
            result = self.env['base.geocoder'].geo_find(
                self.env['base.geocoder'].geo_query_address(
                    street=self.delivery_from_address,
                    zip=self.delivery_from_zip,
                    city=self.delivery_from_city,
                    state=(self.delivery_from_state_id.name if self.delivery_from_state_id else ""),
                    country=(self.delivery_from_country_id.name if self.delivery_from_country_id else ""),
                ),
                force_country=self.delivery_from_country_id.name if self.delivery_from_country_id else ""
            )
        except UserError:
            return
        if result is not None:
            self.delivery_from_latitude = result[0]
            self.delivery_from_longitude = result[1]
        else:
            raise ValidationError(_("The delivery address could not be geolocated. Please check the address. If the address is valid, your geolocation service may be unavailable or unable to resolve it"))
