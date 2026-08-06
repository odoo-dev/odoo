import random
import time
from contextlib import ExitStack, contextmanager, suppress

from psycopg2.pool import PoolError

from odoo.sql_db import db_connect


def hashable(key):
    """Make a channel usable as a dict key or set member.

    Channels read back from JSON come out as lists, while the ones built in
    Python are tuples; converting them makes both forms compare equal.
    """
    if isinstance(key, list):
        key = tuple(key)
    return key


MAX_TRY_ON_POOL_ERROR = 10
DELAY_ON_POOL_ERROR = 0.15
JITTER_ON_POOL_ERROR = 0.3


@contextmanager
def acquire_cursor(db):
    """Try to acquire a cursor up to `MAX_TRY_ON_POOL_ERROR`"""
    delay = DELAY_ON_POOL_ERROR
    try:
        for _ in range(MAX_TRY_ON_POOL_ERROR):
            # Yield before trying to acquire the cursor to let other
            # greenlets release their cursor.
            time.sleep(0)
            with ExitStack() as stack:
                cr = None
                with suppress(PoolError):
                    cr = stack.enter_context(db_connect(db).cursor())
                if cr is not None:
                    yield cr
                    return
            time.sleep(delay + random.uniform(0, JITTER_ON_POOL_ERROR))
            delay *= 1.5
        raise PoolError("Failed to acquire cursor after %s retries" % MAX_TRY_ON_POOL_ERROR)
    finally:
        # Yield after releasing the cursor to let waiting greenlets
        # immediately pick up the freed connection.
        time.sleep(0)
