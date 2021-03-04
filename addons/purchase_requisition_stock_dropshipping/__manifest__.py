# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Purchase Requisition Stock Dropshipping',
    'version': '1.0',
    'category': 'Operations/Purchase',
    'summary': '',
    'description': "",
    'depends': ['purchase_requisition_stock', 'stock_dropshipping'],
    'data': [
        'views/purchase_views.xml',
    ],
    'installable': True,
    'auto_install': True,
}
