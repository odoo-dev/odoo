# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.stock.tests.common import TestStockCommon


class TestBatchWave(TestStockCommon):
    """ Batch and wave picking (`stock.picking.batch`): manual batch creation,
    auto-waving, and the batch/wave lifecycle.
    """
