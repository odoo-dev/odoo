def fifo_removal_standard_costing(self):
    """ Removal Strategy: FIFO, Costing method: Standard Price """
    stock_loc = self.stock_location
    int_com_loc = self.inter_comp_location
    stock_b_loc = self.stock_location_b

    case = {
        'name': 'fifo_removal_standard_costing',
        'product': self.product_standard,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 20}),
            ('internal', {'quantity': 3, 'location': stock_loc, 'location_dest': int_com_loc}),
            ('internal', {'quantity': 3, 'warehouse': self.warehouse_b, 'location': int_com_loc, 'location_dest': stock_b_loc}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'internal',    stock_loc.id,     int_com_loc.id,        3.0,         5.0,      0.0,          0.0,       3.0,           2.0,        10.0,          50.0,        0.0,        30.0,           20.0),
            (     'internal',  int_com_loc.id,     stock_b_loc.id,        3.0,         0.0,      3.0,         10.0,       0.0,           3.0,        10.0,           0.0,       30.0,         0.0,           30.0),
        ]
    }

    return case, result


def fifo_removal_avco_costing(self):
    """ Removal Strategy: FIFO, Costing method: AVCO """
    stock_loc = self.stock_location
    int_com_loc = self.inter_comp_location
    stock_b_loc = self.stock_location_b

    case = {
        'name': 'fifo_removal_avco_costing',
        'product': self.product_avco,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 10}),
            ('receipt', {'quantity': 5, 'unit_price': 20}),
            ('internal', {'quantity': 7, 'location': stock_loc, 'location_dest': int_com_loc}),
            ('internal', {'quantity': 7, 'warehouse': self.warehouse_b, 'location': int_com_loc, 'location_dest': stock_b_loc}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'internal',    stock_loc.id,     int_com_loc.id,        7.0,        10.0,      0.0,          0.0,       7.0,           3.0,        15.0,         150.0,        0.0,       105.0,           45.0),
            (     'internal',  int_com_loc.id,     stock_b_loc.id,        7.0,         0.0,      7.0,         10.0,       0.0,           7.0,        10.0,           0.0,       70.0,         0.0,           70.0),
        ]
    }

    return case, result


def fifo_removal_fifo_costing(self):
    """ Removal Strategy: FIFO, Costing method: FIFO """
    stock_loc = self.stock_location
    int_com_loc = self.inter_comp_location
    stock_b_loc = self.stock_location_b

    case = {
        'name': 'fifo_removal_fifo_costing',
        'product': self.product_fifo,
        'moves': [
            ('receipt', {'quantity': 5, 'unit_price': 10}),
            ('receipt', {'quantity': 5, 'unit_price': 20}),
            ('internal', {'quantity': 7, 'location': stock_loc, 'location_dest': int_com_loc}),
            ('internal', {'quantity': 7, 'warehouse': self.warehouse_b, 'location': int_com_loc, 'location_dest': stock_b_loc}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'internal',    stock_loc.id,     int_com_loc.id,        7.0,        10.0,      0.0,          0.0,       7.0,           3.0,       12.86,         150.0,        0.0,        90.0,           60.0),
            (     'internal',  int_com_loc.id,     stock_b_loc.id,        7.0,         0.0,      7.0,         10.0,       0.0,           7.0,        10.0,           0.0,       70.0,         0.0,           70.0),
        ]
    }

    return case, result


INTER_COMPANY_TESTS = {
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
