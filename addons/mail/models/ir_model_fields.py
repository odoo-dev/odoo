# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models
from odoo.tools import groupby


class IrModelFields(models.Model):
    _inherit = 'ir.model.fields'

    tracking = fields.Integer(
        string="Enable Ordered Tracking",
        help="If set every modification done to this field is tracked. Value is used to order tracking values.",
    )

    def _reflect_field_params(self, field, model_id):
        """ Tracking value can be either a boolean enabling tracking mechanism
        on field, either an integer giving the sequence. Default sequence is
        set to 100. """
        vals = super()._reflect_field_params(field, model_id)
        tracking = getattr(field, 'tracking', None)
        if tracking is True:
            tracking = 100
        elif tracking is False:
            tracking = None
        vals['tracking'] = tracking
        return vals

    def _instanciate_attrs(self, field_data):
        attrs = super()._instanciate_attrs(field_data)
        if attrs and field_data.get('tracking'):
            attrs['tracking'] = field_data['tracking']
        return attrs

    def unlink(self):
        """ When unlinking fields populate tracking value table with relevant
        information. That way if a field is removed (custom tracked, migration
        or any other reason) we keep the tracking and its relevant information.
        Do it only when unlinking fields so that we don't duplicate field
        information for most tracking. """
        tracked = self.filtered('tracking')
        if tracked:
            # to do: check this flow
            return super().unlink()
        return super().unlink()
