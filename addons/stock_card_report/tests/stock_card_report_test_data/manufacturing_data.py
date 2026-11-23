def fifo_removal_standard_costing(self):
    """ Removal Strategy: FIFO, Costing method: Standard Price """
    production_loc = self.production_location
    stock_loc = self.stock_location

    case = {
        'name': 'fifo_removal_standard_costing',
        'product': self.product_standard,
        'moves': [
            ('receipt', {'op_product': self.component_1, 'quantity': 1, 'unit_price': 20}),
            ('receipt', {'op_product': self.component_2, 'quantity': 2, 'unit_price': 10}),
            ('manufacturing', {'quantity': 1, 'quantity_1': 1, 'quantity_2': 2}),
        ],
    }

    result = {
        'fields': (
            'operation_type',     'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            ('mrp_operation', production_loc.id,       stock_loc.id,        1.0,         0.0,      1.0,         10.0,       0.0,           1.0,        10.0,           0.0,       10.0,         0.0,           10.0),
        ],
    }

    return case, result


def fifo_removal_avco_costing(self):
    """ Removal Strategy: FIFO, Costing method: AVCO """
    production_loc = self.production_location
    stock_loc = self.stock_location

    case = {
        'name': 'fifo_removal_avco_costing',
        'product': self.product_avco,
        'moves': [
            ('receipt', {'op_product': self.component_1, 'quantity': 2, 'unit_price': 20}),
            ('receipt', {'op_product': self.component_1, 'quantity': 4, 'unit_price': 30}),
            ('receipt', {'op_product': self.component_2, 'quantity': 5, 'unit_price': 15}),
            ('receipt', {'op_product': self.component_2, 'quantity': 3, 'unit_price': 25}),
            ('manufacturing', {'quantity': 2, 'quantity_1': 3, 'quantity_2': 4}),
        ],
    }

    result = {
        'fields': (
            'operation_type',     'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            ('mrp_operation', production_loc.id,       stock_loc.id,        2.0,         0.0,      2.0,        155.0,       0.0,           2.0,       155.0,           0.0,      310.0,         0.0,          310.0),
        ],
    }

    return case, result


def fifo_removal_fifo_costing(self):
    """ Removal Strategy: FIFO, Costing method: FIFO """
    production_loc = self.production_location
    stock_loc = self.stock_location

    case = {
        'name': 'fifo_removal_fifo_costing',
        'product': self.product_fifo,
        'moves': [
            ('receipt', {'op_product': self.component_1, 'quantity': 2, 'unit_price': 20}),
            ('receipt', {'op_product': self.component_1, 'quantity': 2, 'unit_price': 30}),
            ('receipt', {'op_product': self.component_2, 'quantity': 3, 'unit_price': 15}),
            ('receipt', {'op_product': self.component_2, 'quantity': 3, 'unit_price': 25}),
            ('manufacturing', {'quantity': 1, 'quantity_1': 3, 'quantity_2': 4}),
        ],
    }

    result = {
        'fields': (
            'operation_type',     'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
        ),
        'expected_lines': [
            ('mrp_operation', production_loc.id,       stock_loc.id,        1.0,         0.0,      1.0,        140.0,       0.0,           1.0,       140.0,           0.0,      140.0,         0.0,          140.0),
        ],
    }

    return case, result


MANUFACTURING_TESTS = {
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
