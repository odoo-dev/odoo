# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Phone Numbers Validation',
    'summary': 'Validate and transform phone numbers according to the country format',
    'sequence': '19',
    'category': 'Website',
    'description': """
Phone Number Validation
=======================

Validate phone numbers and normalize them on leads and contacts:
- use the national format for your company country
- use the international format for all others
        """,
    'data': [],
    'depends': ['crm_phone_valid', 'website_crm'],
    'auto_install': True,
}
