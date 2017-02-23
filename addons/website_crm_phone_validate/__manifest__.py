# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Contact Numbers Validation on Website',
    'summary': 'Validate and transform contact numbers according to the country format',
    'sequence': '19',
    'category': 'Website',
    'description': """
Contact Number Validation on Website
==================================

Validate contact (phone,mobile,fax) numbers and normalize them on leads and contacts:
- use the national format for your company country
- use the international format for all others
        """,
    'data': [],
    'depends': ['crm_phone_valid', 'website_crm'],
    'auto_install': True,
}
