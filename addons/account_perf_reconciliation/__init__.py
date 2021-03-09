# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
from . import models

_logger = logging.getLogger(__name__)


def add_computed_fields(cr):
    """
    Add columns for computed and stored fields and populate them as doing so using the ORM would be terribly slow
    """
    _logger.info("adding column account_move_line.precalculated_num")
    cr.execute("ALTER TABLE account_move_line ADD COLUMN precalculated_num VARCHAR NULL;")
    _logger.info("populating column account_move_line.precalculated_num")
    cr.execute(r"""UPDATE account_move_line 
                  SET precalculated_num = substring(REGEXP_REPLACE(name, '[^0-9|^\s]', '', 'g'), '\S(?:.*\S)*');""")

    _logger.info("adding column account_bank_statement_line.precalculated_num")
    cr.execute("ALTER TABLE account_bank_statement_line ADD COLUMN precalculated_num VARCHAR NULL;")
    _logger.info("populating column account_bank_statement_line.precalculated_num")
    cr.execute(r"""UPDATE account_bank_statement_line 
                   SET precalculated_num = substring(REGEXP_REPLACE(name, '[^0-9|^\s]', '', 'g'), '\S(?:.*\S)*');""")

    _logger.info("adding column account_move.precalculated_ref")
    cr.execute("ALTER TABLE account_move ADD COLUMN precalculated_ref VARCHAR NULL;")
    _logger.info("populating column account_move.precalculated_ref")
    cr.execute(r"""UPDATE account_move 
                   SET precalculated_ref = substring(REGEXP_REPLACE(ref, '[^0-9|^\s]', '', 'g'), '\S(?:.*\S)*');""")

    _logger.info("adding column account_move.precalculated_num")
    cr.execute("ALTER TABLE account_move ADD COLUMN precalculated_num VARCHAR NULL;")
    _logger.info("populating column account_move.precalculated_num")
    cr.execute(r"""UPDATE account_move 
                   SET precalculated_num = substring(REGEXP_REPLACE(name, '[^0-9|^\s]', '', 'g'), '\S(?:.*\S)*');""")
