# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Warehouse Management: Wave Transfers',
    'version': '1.0',
    'category': 'Inventory/Inventory',
    'description': """
This module adds the wave transfers option in warehouse management
==================================================================
    """,
    'depends': ['stock'],
    'data': [
        'data/stock_picking_wave_data.xml',
        'report/report_picking_wave.xml',
        'report/stock_picking_wave_report_views.xml',
        'security/ir.model.access.csv',
        'views/stock_picking_wave_views.xml',
        'views/stock_move_line_views.xml',
        'wizard/stock_picking_to_wave_views.xml',
        'wizard/stock_immediate_wave_views.xml',
    ],
    'demo': [
        'data/stock_picking_wave_demo.xml',
    ],
    'installable': True,
}
