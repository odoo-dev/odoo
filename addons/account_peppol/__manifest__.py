# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Peppol",
    'summary': """
        This module is used to send/receive documents with PEPPOL
        """,
    'description': """
- Register as a PEPPOL participant
- Send and receive documents via PEPPOL network in Peppol BIS Billing 3.0 format
    """,
    'category': 'Accounting/Accounting',
    'version': '1.0',
    'depends': [
        'account_edi_proxy_client',
        'account_edi_ubl_cii',
    ],
    'data': [
        'data/cron.xml',
        'views/account_move_views.xml',
        'views/res_partner_views.xml',
        'views/res_config_settings_views.xml',
        'wizard/account_move_send_views.xml',
    ],
    'installable': False,
    'license': 'LGPL-3',
}
