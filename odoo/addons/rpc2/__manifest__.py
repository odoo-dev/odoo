# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "RPC2",
    'description': """
Replacement XML-RPC layer
=========================

* Binds the standard /RPC2/ endoint
* Supports HTTP Basic Auth
* Is natively compatibilities with most libraries
* Features a simpler method call scheme

See https://www.odoo.com/documentation/14.0/webservices/odoo.html for
in depth documentation and code samples in several languages.
""",

    'category': 'Uncategorized',
    'version': '0.1',
    'depends': ['base'],
    'auto_install': True,
}
