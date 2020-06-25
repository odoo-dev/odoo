# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class EventRegistration(models.Model):
    _name = 'website.visitor'
    _inherit = ['website.visitor']

    event_registration_ids = fields.One2many('event.registration', 'visitor_id', string='Event Registrations')
