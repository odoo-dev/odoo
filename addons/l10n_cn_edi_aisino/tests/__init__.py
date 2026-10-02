if __name__.startswith('odoo.addons.'):
    from . import (
        common,
        test_aisino_client,
        test_aisino_login,
        test_aisino_red,
    )
