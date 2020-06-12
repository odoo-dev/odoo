# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Copyright (C) 2020 NextERP Romania (https://www.nexterp.ro) <contact@nexterp.ro>

from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    company_registry = fields.Char(related="partner_id.nrc")
