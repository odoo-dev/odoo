def fifo_removal_standard_costing(self):
    """ Removal Strategy: FIFO, Costing method: Standard Price """
    stock_loc = self.stock_location
    transit_loc = self.company.internal_transit_location_id
    stock1_loc = self.warehouse_1.lot_stock_id

    case = {
        'name': 'fifo_removal_standard_costing',
        'product': self.product_standard,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 20}),
            ('transit', {'quantity': 3}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'outgoing',   stock_loc.id,      transit_loc.id,        3.0,         5.0,      0.0,          0.0,       3.0,           2.0,        10.0,          50.0,        0.0,        30.0,           20.0),
            (     'incoming', transit_loc.id,       stock1_loc.id,        3.0,         0.0,      3.0,          0.0,       0.0,           3.0,        10.0,           0.0,       30.0,         0.0,           30.0),
        ]
    }

    return case, result


def fifo_removal_avco_costing(self):
    """ Removal Strategy: FIFO, Costing method: AVCO """
    stock_loc = self.stock_location
    transit_loc = self.company.internal_transit_location_id
    stock1_loc = self.warehouse_1.lot_stock_id

    case = {
        'name': 'fifo_removal_avco_costing',
        'product': self.product_avco,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 10}),
            ('receipt', {'quantity': 5, 'unit_price': 20}),
            ('transit', {'quantity': 7}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'outgoing',    stock_loc.id,     transit_loc.id,        7.0,        10.0,      0.0,          0.0,       7.0,           3.0,        15.0,         150.0,        0.0,       105.0,           45.0),
            (     'incoming',  transit_loc.id,      stock1_loc.id,        7.0,         0.0,      7.0,          0.0,       0.0,           7.0,        15.0,           0.0,      105.0,         0.0,          105.0),
        ]
    }

    return case, result


def fifo_removal_fifo_costing(self):
    """ Removal Strategy: FIFO, Costing method: FIFO """
    stock_loc = self.stock_location
    transit_loc = self.company.internal_transit_location_id
    stock1_loc = self.warehouse_1.lot_stock_id

    case = {
        'name': 'fifo_removal_fifo_costing',
        'product': self.product_fifo,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 10}),
            ('receipt', {'quantity': 5, 'unit_price': 20}),
            ('transit', {'quantity': 7}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'outgoing',    stock_loc.id,     transit_loc.id,        7.0,        10.0,      0.0,          0.0,       7.0,           3.0,       12.86,         150.0,        0.0,        90.0,           60.0),
            (     'incoming',  transit_loc.id,      stock1_loc.id,        7.0,         0.0,      7.0,          0.0,       0.0,           7.0,       12.86,           0.0,       90.0,         0.0,           90.0),
        ]
    }

    return case, result


def lifo_removal_standard_costing(self):
    """ Removal Strategy: LIFO, Costing method: Standard Price """
    stock_loc = self.stock_location
    transit_loc = self.company.internal_transit_location_id
    stock1_loc = self.warehouse_1.lot_stock_id
    shelf1_loc = self.shelf1_location

    case = {
        'name': 'lifo_removal_standard_costing',
        'product': self.product_standard_lifo,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 10}),
            ('receipt', {'quantity': 5, 'unit_price': 20, 'location_dest_id': shelf1_loc.id}),
            ('transit', {'quantity': 7}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'outgoing',   shelf1_loc.id,     transit_loc.id,        5.0,        10.0,      0.0,          0.0,       5.0,           5.0,        10.0,         100.0,        0.0,        50.0,           50.0),
            (     'outgoing',    stock_loc.id,     transit_loc.id,        2.0,         5.0,      0.0,          0.0,       2.0,           3.0,        10.0,          50.0,        0.0,        20.0,           30.0),
            (     'incoming',  transit_loc.id,      stock1_loc.id,        7.0,         0.0,      7.0,          0.0,       0.0,           7.0,        10.0,           0.0,       70.0,         0.0,           70.0),
        ]
    }

    return case, result


def lifo_removal_avco_costing(self):
    """ Removal Strategy: LIFO, Costing method: AVCO """
    stock_loc = self.stock_location
    transit_loc = self.company.internal_transit_location_id
    stock1_loc = self.warehouse_1.lot_stock_id
    shelf1_loc = self.shelf1_location

    case = {
        'name': 'lifo_removal_avco_costing',
        'product': self.product_avco_lifo,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 10}),
            ('receipt', {'quantity': 5, 'unit_price': 20, 'location_dest_id': shelf1_loc.id}),
            ('transit', {'quantity': 8}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'outgoing',   shelf1_loc.id,     transit_loc.id,        5.0,        10.0,      0.0,          0.0,       5.0,           5.0,        15.0,         150.0,        0.0,        75.0,           75.0),
            (     'outgoing',    stock_loc.id,     transit_loc.id,        3.0,         5.0,      0.0,          0.0,       3.0,           2.0,        15.0,          75.0,        0.0,        45.0,           30.0),
            (     'incoming',  transit_loc.id,      stock1_loc.id,        8.0,         0.0,      8.0,          0.0,       0.0,           8.0,        15.0,           0.0,      120.0,         0.0,          120.0),
        ]
    }

    return case, result


def lifo_removal_fifo_costing(self):
    """ Removal Strategy: LIFO, Costing method: FIFO """
    stock_loc = self.stock_location
    transit_loc = self.company.internal_transit_location_id
    stock1_loc = self.warehouse_1.lot_stock_id
    shelf1_loc = self.shelf1_location

    case = {
        'name': 'lifo_removal_fifo_costing',
        'product': self.product_fifo_lifo,
        'moves': [
            ('receipt', {'quantity': 10, 'unit_price': 50}),
            ('receipt', {'quantity': 10, 'unit_price': 100, 'location_dest_id': shelf1_loc.id}),
            ('transit', {'quantity': 15}),
        ],
    }

    # In this case, the costing method is FIFO, so the out value is calculated based on the FIFO method.
    # And removal strategy is LIFO, so the out quantity is calculated based on the LIFO method.
    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'outgoing',   shelf1_loc.id,     transit_loc.id,       10.0,        20.0,      0.0,          0.0,      10.0,          10.0,       66.67,        1500.0,        0.0,      666.67,         833.33),
            (     'outgoing',    stock_loc.id,     transit_loc.id,        5.0,        10.0,      0.0,          0.0,       5.0,           5.0,       66.67,        833.33,        0.0,      333.33,          500.0),
            (     'incoming',  transit_loc.id,      stock1_loc.id,       15.0,         0.0,     15.0,          0.0,       0.0,          15.0,       66.67,           0.0,     1000.0,         0.0,         1000.0),
        ]
    }

    return case, result


INTER_WAREHOUSE_TESTS = {
    'standard_price': (
        fifo_removal_standard_costing,
        lifo_removal_standard_costing,
    ),
    'avco': (
        fifo_removal_avco_costing,
        lifo_removal_avco_costing,
    ),
    'fifo': (
        fifo_removal_fifo_costing,
        lifo_removal_fifo_costing,
    ),
}
