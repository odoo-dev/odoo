def lot_fifo_removal_standard_costing(self):
    """ Tracking: Lot, Removal Strategy: FIFO, Costing method: Standard Price """
    lots = self._create_lots(self.product_standard_lot, 2)

    case = {
        'name': 'lot_fifo_removal_standard_costing',
        'product': self.product_standard_lot,
        'moves': [
            ('receipt', {'quantity': 20, 'unit_price': 8, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 6, 'unit_price': 9, 'lot_ids': lots[1]}),
            ('delivery', {'quantity': 25}),
        ],
    }

    result = {
        'fields': (
            'operation_type', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming',       20.0,         0.0,     20.0,          8.0,       0.0,          20.0, lots[0].id,        10.0,           0.0,      200.0,         0.0,          200.0),
            (     'incoming',        6.0,         0.0,      6.0,          9.0,       0.0,           6.0, lots[1].id,        10.0,           0.0,       60.0,         0.0,           60.0),
            (     'outgoing',       20.0,        20.0,      0.0,          0.0,      20.0,           0.0, lots[0].id,        10.0,         200.0,        0.0,       200.0,            0.0),
            (     'outgoing',        5.0,         6.0,      0.0,          0.0,       5.0,           1.0, lots[1].id,        10.0,          60.0,        0.0,        50.0,           10.0),
        ]
    }

    return case, result


def lot_fifo_removal_avco_costing(self):
    """ Tracking: Lot, Removal Strategy: FIFO, Costing Method: AVCO """
    lots = self._create_lots(self.product_avco_lot, 2)

    case = {
        'name': 'lot_fifo_removal_avco_costing',
        'product': self.product_avco_lot,
        'moves': [
            ('receipt', {'quantity': 20, 'unit_price': 8, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 6, 'unit_price': 9, 'lot_ids': lots[1]}),
            ('delivery', {'quantity': 25}),
        ],
    }

    result = {
        'fields': (
            'operation_type', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming',       20.0,         0.0,     20.0,          8.0,       0.0,          20.0, lots[0].id,         8.0,           0.0,      160.0,         0.0,          160.0),
            (     'incoming',        6.0,         0.0,      6.0,          9.0,       0.0,           6.0, lots[1].id,         9.0,           0.0,       54.0,         0.0,           54.0),
            (     'outgoing',       20.0,        20.0,      0.0,          0.0,      20.0,           0.0, lots[0].id,         8.0,         160.0,        0.0,       160.0,            0.0),
            (     'outgoing',        5.0,         6.0,      0.0,          0.0,       5.0,           1.0, lots[1].id,         9.0,          54.0,        0.0,        45.0,            9.0),
        ]
    }

    return case, result


def lot_fifo_removal_fifo_costing(self):
    """ Tracking: Lot, Removal Strategy: FIFO, Costing Method: FIFO """
    lots = self._create_lots(self.product_fifo_lot, 2)

    case = {
        'name': 'lot_fifo_removal_fifo_costing',
        'product': self.product_fifo_lot,
        'moves': [
            ('receipt', {'quantity': 20, 'unit_price': 8, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 6, 'unit_price': 9, 'lot_ids': lots[1]}),
            ('delivery', {'quantity': 25}),
        ],
    }

    result = {
        'fields': (
            'operation_type',  'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming',        20.0,         0.0,     20.0,          8.0,       0.0,          20.0, lots[0].id,         8.0,           0.0,      160.0,         0.0,          160.0),
            (     'incoming',         6.0,         0.0,      6.0,          9.0,       0.0,           6.0, lots[1].id,         9.0,           0.0,       54.0,         0.0,           54.0),
            (     'outgoing',        20.0,        20.0,      0.0,          0.0,      20.0,           0.0, lots[0].id,         8.0,         160.0,        0.0,       160.0,            0.0),
            (     'outgoing',         5.0,         6.0,      0.0,          0.0,       5.0,           1.0, lots[1].id,         9.0,          54.0,        0.0,        45.0,            9.0),
        ]
    }

    return case, result


def srn_fifo_removal_standard_costing(self):
    """ Tracking: Serial Number, Removal Strategy: FIFO, Costing Method: Standard Price """
    lots = self._create_lots(self.product_standard_srn, 2)

    case = {
        'name': 'srn_fifo_removal_standard_costing',
        'product': self.product_standard_srn,
        'moves': [
            ('receipt', {'quantity': 2, 'unit_price': 20, 'lot_ids': lots}),
            ('delivery', {'quantity': 1}),
        ],
    }

    result = {
        'fields': (
            'operation_type', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming',        1.0,         0.0,      1.0,         20.0,       0.0,           1.0, lots[0].id,        10.0,           0.0,       10.0,         0.0,           10.0),
            (     'incoming',        1.0,         0.0,      1.0,         20.0,       0.0,           1.0, lots[1].id,        10.0,           0.0,       10.0,         0.0,           10.0),
            (     'outgoing',        1.0,         1.0,      0.0,          0.0,       1.0,           0.0, lots[0].id,        10.0,          10.0,        0.0,        10.0,            0.0),
        ]
    }

    return case, result


def srn_fifo_removal_avco_costing(self):
    """ Tracking: Serial Number, Removal Strategy: FIFO, Costing Method: AVCO """
    lots = self._create_lots(self.product_avco_srn, 2)

    case = {
        'name': 'srn_fifo_removal_avco_costing',
        'product': self.product_avco_srn,
        'moves': [
            ('receipt', {'quantity': 1, 'unit_price': 10, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 1, 'unit_price': 20, 'lot_ids': lots[1]}),
            ('delivery', {'quantity': 1}),
        ],
    }

    result = {
        'fields': (
            'operation_type', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming',        1.0,         0.0,      1.0,         10.0,       0.0,           1.0, lots[0].id,        10.0,           0.0,       10.0,         0.0,           10.0),
            (     'incoming',        1.0,         0.0,      1.0,         20.0,       0.0,           1.0, lots[1].id,        20.0,           0.0,       20.0,         0.0,           20.0),
            (     'outgoing',        1.0,         1.0,      0.0,          0.0,       1.0,           0.0, lots[0].id,        10.0,          10.0,        0.0,        10.0,            0.0),
        ]
    }

    return case, result


def srn_fifo_removal_fifo_costing(self):
    """ Tracking: Serial Number, Removal Strategy: FIFO, Costing Method: FIFO """
    lots = self._create_lots(self.product_fifo_srn, 2)

    case = {
        'name': 'srn_fifo_removal_fifo_costing',
        'product': self.product_fifo_srn,
        'moves': [
            ('receipt', {'quantity': 1, 'unit_price': 15, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 1, 'unit_price': 25, 'lot_ids': lots[1]}),
            ('delivery', {'quantity': 2}),
        ],
    }

    result = {
        'fields': (
            'operation_type',  'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming',         1.0,         0.0,      1.0,         15.0,       0.0,           1.0, lots[0].id,        15.0,           0.0,       15.0,         0.0,           15.0),
            (     'incoming',         1.0,         0.0,      1.0,         25.0,       0.0,           1.0, lots[1].id,        25.0,           0.0,       25.0,         0.0,           25.0),
            (     'outgoing',         1.0,         1.0,      0.0,          0.0,       1.0,           0.0, lots[0].id,        15.0,          15.0,        0.0,        15.0,            0.0),
            (     'outgoing',         1.0,         1.0,      0.0,          0.0,       1.0,           0.0, lots[1].id,        25.0,          25.0,        0.0,        25.0,            0.0),
        ]
    }

    return case, result


def lot_lifo_removal_standard_costing(self):
    """ Tracking: Lot, Removal Strategy: LIFO, Costing Method: Standard Price """
    lots = self._create_lots(self.product_standard_lot_lifo, 2)
    supplier_loc = self.supplier_location
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location
    customer_loc = self.customer_location

    case = {
        'name': 'lot_lifo_removal_standard_costing',
        'product': self.product_standard_lot_lifo,
        'moves': [
            ('receipt', {'quantity': 20, 'unit_price': 8, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 6, 'unit_price': 9, 'lot_ids': lots[1], 'location_dest_id': shelf1_loc.id}),
            ('delivery', {'quantity': 25}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming', supplier_loc.id,       stock_loc.id,       20.0,         0.0,     20.0,          8.0,       0.0,          20.0, lots[0].id,        10.0,           0.0,      200.0,         0.0,          200.0),
            (     'incoming', supplier_loc.id,      shelf1_loc.id,        6.0,         0.0,      6.0,          9.0,       0.0,           6.0, lots[1].id,        10.0,           0.0,       60.0,         0.0,           60.0),
            (     'outgoing',   shelf1_loc.id,    customer_loc.id,        6.0,         6.0,      0.0,          0.0,       6.0,           0.0, lots[1].id,        10.0,          60.0,        0.0,        60.0,            0.0),
            (     'outgoing',    stock_loc.id,    customer_loc.id,       19.0,        20.0,      0.0,          0.0,      19.0,           1.0, lots[0].id,        10.0,         200.0,        0.0,       190.0,           10.0),
        ]
    }

    return case, result


def lot_lifo_removal_avco_costing(self):
    """ Tracking: Lot, Removal Strategy: LIFO, Costing Method: AVCO """
    lots = self._create_lots(self.product_avco_lot_lifo, 2)
    supplier_loc = self.supplier_location
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location
    customer_loc = self.customer_location

    case = {
        'name': 'lot_lifo_removal_avco_costing',
        'product': self.product_avco_lot_lifo,
        'moves': [
            ('receipt', {'quantity': 20, 'unit_price': 8, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 6, 'unit_price': 9, 'lot_ids': lots[1], 'location_dest_id': shelf1_loc.id}),
            ('delivery', {'quantity': 25}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming', supplier_loc.id,       stock_loc.id,       20.0,         0.0,     20.0,          8.0,       0.0,          20.0, lots[0].id,         8.0,           0.0,      160.0,         0.0,          160.0),
            (     'incoming', supplier_loc.id,      shelf1_loc.id,        6.0,         0.0,      6.0,          9.0,       0.0,           6.0, lots[1].id,         9.0,           0.0,       54.0,         0.0,           54.0),
            (     'outgoing',   shelf1_loc.id,    customer_loc.id,        6.0,         6.0,      0.0,          0.0,       6.0,           0.0, lots[1].id,         9.0,          54.0,        0.0,        54.0,            0.0),
            (     'outgoing',    stock_loc.id,    customer_loc.id,       19.0,        20.0,      0.0,          0.0,      19.0,           1.0, lots[0].id,         8.0,         160.0,        0.0,       152.0,            8.0),
        ],
    }

    return case, result


def lot_lifo_removal_fifo_costing(self):
    """ Tracking: Lot, Removal Strategy: LIFO, Costing Method: FIFO """
    lots = self._create_lots(self.product_fifo_lot_lifo, 2)
    supplier_loc = self.supplier_location
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location
    customer_loc = self.customer_location

    case = {
        'name': 'lot_lifo_removal_fifo_costing',
        'product': self.product_fifo_lot_lifo,
        'moves': [
            ('receipt', {'quantity': 20, 'unit_price': 8, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 6, 'unit_price': 9, 'lot_ids': lots[1], 'location_dest_id': shelf1_loc.id}),
            ('delivery', {'quantity': 25}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming', supplier_loc.id,       stock_loc.id,       20.0,         0.0,     20.0,          8.0,       0.0,          20.0, lots[0].id,         8.0,           0.0,      160.0,         0.0,          160.0),
            (     'incoming', supplier_loc.id,      shelf1_loc.id,        6.0,         0.0,      6.0,          9.0,       0.0,           6.0, lots[1].id,         9.0,           0.0,       54.0,         0.0,           54.0),
            (     'outgoing',   shelf1_loc.id,    customer_loc.id,        6.0,         6.0,      0.0,          0.0,       6.0,           0.0, lots[1].id,         9.0,          54.0,        0.0,        54.0,            0.0),
            (     'outgoing',    stock_loc.id,    customer_loc.id,       19.0,        20.0,      0.0,          0.0,      19.0,           1.0, lots[0].id,         8.0,         160.0,        0.0,       152.0,            8.0),
        ],
    }

    return case, result


def srn_lifo_removal_standard_costing(self):
    """ Tracking: Serial Number, Removal Strategy: LIFO, Costing Method: Standard Price """
    lots = self._create_lots(self.product_standard_srn_lifo, 2)
    supplier_loc = self.supplier_location
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location
    customer_loc = self.customer_location

    case = {
        'name': 'srn_lifo_removal_standard_costing',
        'product': self.product_standard_srn_lifo,
        'moves': [
            ('receipt', {'quantity': 1, 'unit_price': 10, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 1, 'unit_price': 20, 'lot_ids': lots[1], 'location_dest_id': shelf1_loc.id}),
            ('delivery', {'quantity': 1}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming', supplier_loc.id,       stock_loc.id,        1.0,         0.0,      1.0,         10.0,       0.0,           1.0, lots[0].id,        10.0,           0.0,       10.0,         0.0,           10.0),
            (     'incoming', supplier_loc.id,      shelf1_loc.id,        1.0,         0.0,      1.0,         20.0,       0.0,           1.0, lots[1].id,        10.0,           0.0,       10.0,         0.0,           10.0),
            (     'outgoing',   shelf1_loc.id,    customer_loc.id,        1.0,         1.0,      0.0,          0.0,       1.0,           0.0, lots[1].id,        10.0,          10.0,        0.0,        10.0,            0.0),
        ],
    }

    return case, result


def srn_lifo_removal_avco_costing(self):
    """ Tracking: Serial Number, Removal Strategy: LIFO, Costing Method: AVCO """
    lots = self._create_lots(self.product_avco_srn_lifo, 2)
    supplier_loc = self.supplier_location
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location
    customer_loc = self.customer_location

    case = {
        'name': 'srn_lifo_removal_avco_costing',
        'product': self.product_avco_srn_lifo,
        'moves': [
            ('receipt', {'quantity': 1, 'unit_price': 10, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 1, 'unit_price': 20, 'lot_ids': lots[1], 'location_dest_id': shelf1_loc.id}),
            ('delivery', {'quantity': 1}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming', supplier_loc.id,       stock_loc.id,        1.0,         0.0,      1.0,         10.0,       0.0,           1.0, lots[0].id,        10.0,           0.0,       10.0,         0.0,           10.0),
            (     'incoming', supplier_loc.id,      shelf1_loc.id,        1.0,         0.0,      1.0,         20.0,       0.0,           1.0, lots[1].id,        20.0,           0.0,       20.0,         0.0,           20.0),
            (     'outgoing',   shelf1_loc.id,    customer_loc.id,        1.0,         1.0,      0.0,          0.0,       1.0,           0.0, lots[1].id,        20.0,          20.0,        0.0,        20.0,            0.0),
        ],
    }

    return case, result


def srn_lifo_removal_fifo_costing(self):
    """ Tracking: Serial Number, Removal Strategy: LIFO, Costing Method: FIFO """
    lots = self._create_lots(self.product_fifo_srn_lifo, 2)
    supplier_loc = self.supplier_location
    stock_loc = self.stock_location
    shelf1_loc = self.shelf1_location
    customer_loc = self.customer_location

    case = {
        'name': 'srn_lifo_removal_fifo_costing',
        'product': self.product_fifo_srn_lifo,
        'moves': [
            ('receipt', {'quantity': 1, 'unit_price': 15, 'lot_ids': lots[0]}),
            ('receipt', {'quantity': 1, 'unit_price': 25, 'lot_ids': lots[1], 'location_dest_id': shelf1_loc.id}),
            ('delivery', {'quantity': 2}),
        ],
    }

    result = {
        'fields': (
            'operation_type',   'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance',   'lot_id', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            (     'incoming', supplier_loc.id,       stock_loc.id,        1.0,         0.0,      1.0,         15.0,       0.0,           1.0, lots[0].id,        15.0,           0.0,       15.0,         0.0,           15.0),
            (     'incoming', supplier_loc.id,      shelf1_loc.id,        1.0,         0.0,      1.0,         25.0,       0.0,           1.0, lots[1].id,        25.0,           0.0,       25.0,         0.0,           25.0),
            (     'outgoing',   shelf1_loc.id,    customer_loc.id,        1.0,         1.0,      0.0,          0.0,       1.0,           0.0, lots[1].id,        25.0,          25.0,        0.0,        25.0,            0.0),
            (     'outgoing',    stock_loc.id,    customer_loc.id,        1.0,         1.0,      0.0,          0.0,       1.0,           0.0, lots[0].id,        15.0,          15.0,        0.0,        15.0,            0.0),
        ],
    }

    return case, result


LOT_VALUATED_TESTS = {
    'standard_price': (
        lot_fifo_removal_standard_costing,
        srn_fifo_removal_standard_costing,
        lot_lifo_removal_standard_costing,
        srn_lifo_removal_standard_costing,
    ),
    'avco': (
        lot_fifo_removal_avco_costing,
        srn_fifo_removal_avco_costing,
        lot_lifo_removal_avco_costing,
        srn_lifo_removal_avco_costing,
    ),
    'fifo': (
        lot_fifo_removal_fifo_costing,
        srn_fifo_removal_fifo_costing,
        lot_lifo_removal_fifo_costing,
        srn_lifo_removal_fifo_costing,
    ),
}
