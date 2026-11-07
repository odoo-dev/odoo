from odoo import api, models, fields
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)

_MASTER_PRESET_MESSAGE = _lt('You cannot delete the master preset(s).')


class PosPreset(models.Model):
    _inherit = 'pos.preset'

    _takein_preset = models.Ref('pos_restaurant.pos_takein_preset', 'pos.preset', message=_MASTER_PRESET_MESSAGE)
    _takeout_preset = models.Ref('pos_restaurant.pos_takeout_preset', 'pos.preset', message=_MASTER_PRESET_MESSAGE)
    _delivery_preset = models.Ref('pos_restaurant.pos_delivery_preset', 'pos.preset', message=_MASTER_PRESET_MESSAGE)

    use_guest = fields.Boolean(string='Guest', default=False, help="Force guest selection when clicking on order button in PoS restaurant")

    @api.model
    def _load_pos_data_fields(self, config):
        return super()._load_pos_data_fields(config) + ['use_guest']
