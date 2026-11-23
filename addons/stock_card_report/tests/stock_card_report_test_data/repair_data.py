def fifo_removal_standard_costing(self):
    """ Removal Strategy: FIFO, Costing method: Standard Price """
    customer_loc = self.customer_location
    stock_loc = self.stock_location

    case = {
        'name': 'fifo_removal_standard_costing',
        'product': self.product_standard,
        'moves': [
            ('receipt', {'quantity': 10, 'unit_price': 20}),
            ('repair', {'order_qty': 5, 'return_qty': 5}),
        ],
    }

    result = {
        'fields': (
               'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (        'incoming', customer_loc.id,       stock_loc.id,        5.0,         5.0,      5.0,         10.0,       0.0,          10.0,        10.0,          50.0,       50.0,         0.0,          100.0),
            ('repair_operation',    stock_loc.id,       stock_loc.id,        5.0,        10.0,      0.0,          0.0,       0.0,          10.0,        10.0,         100.0,        0.0,         0.0,          100.0),
        ],
    }

    return case, result


def fifo_removal_avco_costing(self):
    """ Removal Strategy: FIFO, Costing method: AVCO """
    customer_loc = self.customer_location
    stock_loc = self.stock_location

    case = {
        'name': 'fifo_removal_avco_costing',
        'product': self.product_avco,
        'moves': [
            ('receipt', {'quantity': 10, 'unit_price': 10}),
            ('receipt', {'quantity': 10, 'unit_price': 20}),
            ('repair', {'order_qty': 15, 'return_qty': 15}),
        ],
    }

    result = {
        'fields': (
               'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (        'incoming', customer_loc.id,       stock_loc.id,       15.0,         5.0,     15.0,         15.0,       0.0,          20.0,        15.0,          75.0,      225.0,         0.0,          300.0),
            ('repair_operation',    stock_loc.id,       stock_loc.id,       15.0,        20.0,      0.0,          0.0,       0.0,          20.0,        15.0,         300.0,        0.0,         0.0,          300.0),
        ],
    }

    return case, result


def fifo_removal_fifo_costing(self):
    """ Removal Strategy: FIFO, Costing method: FIFO """
    customer_loc = self.customer_location
    stock_loc = self.stock_location

    case = {
        'name': 'fifo_removal_fifo_costing',
        'product': self.product_fifo,
        'moves': [
            ('receipt', {'quantity': 10, 'unit_price': 10}),
            ('receipt', {'quantity': 10, 'unit_price': 20}),
            ('repair', {'order_qty': 15, 'return_qty': 15}),
        ],
    }

    result = {
        'fields': (
               'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (        'incoming', customer_loc.id,       stock_loc.id,       15.0,         5.0,     15.0,        13.33,       0.0,          20.0,       13.33,         100.0,      200.0,         0.0,          300.0),
            ('repair_operation',    stock_loc.id,       stock_loc.id,       15.0,        20.0,      0.0,          0.0,       0.0,          20.0,        15.0,         300.0,        0.0,         0.0,          300.0),
        ],
    }

    return case, result


REPAIR_TESTS = {
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
