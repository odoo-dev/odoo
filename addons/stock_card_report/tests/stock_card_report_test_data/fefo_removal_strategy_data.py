from dateutil.relativedelta import relativedelta


def standard_costing_lot_not_valuated(self):
    """ Tracking: Lot, Removal Strategy: FEFO, Costing method: Standard Price, Case: Lot not Valuated """
    lots = self._create_lots(self.product_standard_lot_fefo, 2)
    lots[1].removal_date -= relativedelta(days=1)
    supplier_loc = self.supplier_location
    stock_loc = self.stock_location
    customer_loc = self.customer_location

    case = {
        'name': 'standard_costing_lot_not_valuated',
        'product': self.product_standard_lot_fefo,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 20, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 5, 'unit_price': 10, 'lot_ids': lots[1]}),
            ('delivery', {'quantity': 7}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming', supplier_loc.id,       stock_loc.id,        5.0,         0.0,      5.0,         20.0,       0.0,           5.0, lots[0].id,        10.0,           0.0,       50.0,         0.0,           50.0),
            (     'incoming', supplier_loc.id,       stock_loc.id,        5.0,         5.0,      5.0,         10.0,       0.0,          10.0, lots[1].id,        10.0,          50.0,       50.0,         0.0,          100.0),
            (     'outgoing',    stock_loc.id,    customer_loc.id,        5.0,        10.0,      0.0,          0.0,       5.0,           5.0, lots[1].id,        10.0,         100.0,        0.0,        50.0,           50.0),
            (     'outgoing',    stock_loc.id,    customer_loc.id,        2.0,         5.0,      0.0,          0.0,       2.0,           3.0, lots[0].id,        10.0,          50.0,        0.0,        20.0,           30.0),
        ]
    }

    return case, result


def avco_costing_internal_transfer(self):
    """ Tracking: Lot, Removal Strategy: FEFO, Costing method: AVCO, Case: Internal Transfer """
    lots = self._create_lots(self.product_avco_lot_fefo, 2)
    lots[1].removal_date -= relativedelta(days=1)
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location

    case = {
        'name': 'avco_costing_internal_transfer',
        'product': self.product_avco_lot_fefo,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 20, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 5, 'unit_price': 10, 'lot_ids': lots[1]}),
            ('internal', {'quantity': 7}),
        ],
    }

    result = {
        'fields': (
            'operation_type', 'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'internal',  stock_loc.id,      shelf1_loc.id,        5.0,        10.0,      0.0,          0.0,       0.0,          10.0, lots[1].id,        15.0,         150.0,        0.0,         0.0,          150.0),
            (     'internal',  stock_loc.id,      shelf1_loc.id,        2.0,        10.0,      0.0,          0.0,       0.0,          10.0, lots[0].id,        15.0,         150.0,        0.0,         0.0,          150.0),
        ]
    }

    return case, result


def fifo_costing_inter_warehouse_transit(self):
    """ Tracking: Lot, Removal Strategy: FEFO, Costing method: FIFO, Case: Inter-Warehouse Transit """
    lots = self._create_lots(self.product_fifo_lot_fefo, 2)
    lots[1].removal_date -= relativedelta(days=1)
    stock_loc = self.stock_location
    transit_loc = self.company.internal_transit_location_id
    stock1_loc = self.warehouse_1.lot_stock_id

    case = {
        'name': 'fifo_costing_inter_warehouse_transit',
        'product': self.product_fifo_lot_fefo,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 20, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 5, 'unit_price': 10, 'lot_ids': lots[1]}),
            ('transit', {'quantity': 7, 'lot_ids': lots[0]}),
        ],
    }

    result = {
        'fields': (
            'operation_type',  'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'outgoing',   stock_loc.id,     transit_loc.id,        5.0,        10.0,      0.0,          0.0,       5.0,           5.0, lots[1].id,       17.14,         150.0,        0.0,       85.71,          64.29),
            (     'outgoing',   stock_loc.id,     transit_loc.id,        2.0,         5.0,      0.0,          0.0,       2.0,           3.0, lots[0].id,       17.14,         64.29,        0.0,       34.29,           30.0),
            (     'incoming', transit_loc.id,      stock1_loc.id,        7.0,         0.0,      7.0,          0.0,       0.0,           7.0, lots[0].id,       17.14,           0.0,      120.0,         0.0,          120.0),
        ]
    }

    return case, result


FEFO_REMOVAL_STRATEGY_TESTS = {
    'standard_price': (
        standard_costing_lot_not_valuated,
    ),
    'avco': (
        avco_costing_internal_transfer,
    ),
    'fifo': (
        fifo_costing_inter_warehouse_transit,
    ),
}
