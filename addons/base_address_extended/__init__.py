# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from odoo import api, SUPERUSER_ID


def _update_street_format(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
<<<<<<< HEAD
    specific_countries = env['res.country'].search([('street_format', '!=', '%(street_number)s/%(street_number2)s %(street_name)s')])
    env['res.partner'].search([('country_id', 'in', specific_countries.ids)])._compute_street_data()
||||||| parent of 82011f05efa (temp)
    env['res.partner'].search([])._split_street()
=======
    specific_countries = env['res.country'].search([('street_format', '!=', '%(street_number)s/%(street_number2)s %(street_name)s')])
    env['res.partner'].search([('country_id', 'in', specific_countries.ids)])._split_street()
>>>>>>> 82011f05efa (temp)
