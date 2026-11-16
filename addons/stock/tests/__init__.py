# Part of Odoo. See LICENSE file for full copyright and licensing details.

# addons/stock/tests/ is being reorganized by feature area (see stock_tests.md).
# Pre-refactor tests have been moved to tests/archive/ (not imported, so they don't
# run) while the new split files are built here one feature area at a time.

from . import (
    test_batch_wave,
    test_inventory_adjustment,
    test_lot_serial,
    test_move,
    test_packaging,
    test_reporting,
    test_scrap,
    test_transfer_flow,
    test_warehouse_routing,
)
