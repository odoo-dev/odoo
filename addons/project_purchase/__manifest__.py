# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Project Purchase Analytics",
    'version': '1.0',
    'summary': "Track the costs of purchase orders associated with the analytic account of your projects.",
    'category': 'Project',
    'depends': ['purchase', 'project_account'],
    'demo': [
        'data/project_purchase_demo.xml',
    ],
    'auto_install': True,
    'license': 'LGPL-3',
}
