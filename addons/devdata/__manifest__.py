{
    'name': 'Custom devdata ',
    'version': '1.0',
    'summary': 'Always sets custom SFU server URL and key for RTC',
    'description': 'This minimal module sets ir.config_parameter values to force Odoo Discuss to use your preferred SFU server.',
    'author': 'System Configuration',
    'depends': ['base', 'mail'],
    'data': [
        'data/res_users_demo.xml',
        'data/ir_config_parameter_data.xml',
        'data/discuss_call_history_demo.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
    'post_init_hook': '_devdata_post_init_hook',
}
