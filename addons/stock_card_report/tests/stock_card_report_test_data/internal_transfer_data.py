def fifo_removal_standard_costing(self):
    """ Removal Strategy: FIFO, Costing method: Standard Price """
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location

    case = {
        'name': 'fifo_removal_standard_costing',
        'product': self.product_standard,
        'moves': [
            ('receipt', {'quantity': 10, 'unit_price': 20}),
            ('internal', {'quantity': 5}),
        ],
    }

    result = {
        'fields': (
            'operation_type', 'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'internal',  stock_loc.id,      shelf1_loc.id,        5.0,        10.0,      0.0,          0.0,       0.0,          10.0,        10.0,         100.0,        0.0,         0.0,          100.0),
        ]
    }

    return case, result


def fifo_removal_avco_costing(self):
    """ Removal Strategy: FIFO, Costing method: AVCO """
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location

    case = {
        'name': 'fifo_removal_avco_costing',
        'product': self.product_avco,
        'moves': [
            ('receipt', {'quantity': 10, 'unit_price': 20}),
            ('internal', {'quantity': 5}),
        ],
    }

    result = {
        'fields': (
            'operation_type', 'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'internal',  stock_loc.id,      shelf1_loc.id,        5.0,        10.0,      0.0,          0.0,       0.0,          10.0,        20.0,         200.0,        0.0,         0.0,          200.0),
        ]
    }

    return case, result


def fifo_removal_fifo_costing(self):
    """ Removal Strategy: FIFO, Costing method: FIFO """
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location

    case = {
        'name': 'fifo_removal_fifo_costing',
        'product': self.product_fifo,
        'moves': [
            ('receipt', {'quantity': 10, 'unit_price': 20}),
            ('internal', {'quantity': 5}),
        ],
    }

    result = {
        'fields': (
            'operation_type', 'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'internal',  stock_loc.id,      shelf1_loc.id,        5.0,        10.0,      0.0,          0.0,       0.0,          10.0,        20.0,         200.0,        0.0,         0.0,          200.0),
        ]
    }

    return case, result


INTERNAL_TRANSFER_TESTS = {
    'standard_price': (
        fifo_removal_standard_costing,
    ),
    'avco': (
        fifo_removal_avco_costing,
    ),
    'fifo': (
        fifo_removal_fifo_costing,
    ),
}
