# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.stock.tests.common import TestStockCommon


class TestInventoryAdjustment(TestStockCommon):
    """ Inventory adjustments and quant mechanics: counts (apply/revert), direct
    quant CRUD, and relocating stock.
    """
