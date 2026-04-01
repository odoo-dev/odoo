# Part of Odoo. See LICENSE file for full copyright and licensing details.

"""Three rate-limiting algorithms: Fixed Window, Sliding Window, Token Bucket."""

import math
import time
from collections import defaultdict
from datetime import datetime, timedelta


class RateLimiterException(Exception):
    """Raised when a request exceeds the rate limit."""

    def __init__(self, message, retry_after=None, algorithm=None):
        super().__init__(message)
        self.message = message
        self.retry_after = retry_after
        self.algorithm = algorithm


# ---------------------------------------------------------------------------
# 1. Fixed Window  (Database)
# ---------------------------------------------------------------------------

class FixedWindowRateLimiter:
    """
    One counter per time window -> resets when the window ends.

    Storage : PostgreSQL (TransientModel rows)
    Flaw    : boundary burst -- up to 2x the limit at window edges.
    Used by : GitHub
    """

    def __init__(self, limit=10, window_seconds=60):
        self.limit = limit
        self.window_seconds = window_seconds

    def _log(self, env):
        return env['website.rate.limit.log'].sudo()

    def check(self, env, key):
        now = datetime.now()
        window_start = now - timedelta(seconds=self.window_seconds)

        # Count requests in the current window
        domain = [
            ('ip', '=', key),
            ('algorithm', '=', 'fixed_window'),
            ('create_date', '>=', window_start),
        ]
        Log = self._log(env)
        count = Log.search_count(domain)

        if count >= self.limit:
            # Find when the oldest request expires out of the window
            oldest = Log.search(domain, order='create_date asc', limit=1)
            retry_after = 0
            if oldest.create_date:
                expires = oldest.create_date + timedelta(seconds=self.window_seconds)
                retry_after = max(0, int((expires - now).total_seconds()))
            raise RateLimiterException(
                f"Fixed window: {count}/{self.limit} in {self.window_seconds}s. "
                f"Retry in {retry_after}s.",
                retry_after=retry_after,
                algorithm='fixed_window',
            )

        # Record this request
        Log.create({'ip': key, 'algorithm': 'fixed_window'})

        return {
            'allowed': True,
            'count': count + 1,
            'remaining': self.limit - count - 1,
            'algorithm': 'fixed_window',
        }

    def get_status(self, env, key):
        now = datetime.now()
        window_start = now - timedelta(seconds=self.window_seconds)
        domain = [
            ('ip', '=', key),
            ('algorithm', '=', 'fixed_window'),
            ('create_date', '>=', window_start),
        ]
        Log = self._log(env)
        count = Log.search_count(domain)

        seconds_until_next_request = 0
        if count >= self.limit:
            oldest = Log.search(domain, order='create_date asc', limit=1)
            if oldest.create_date:
                expires = oldest.create_date + timedelta(seconds=self.window_seconds)
                seconds_until_next_request = max(0, int((expires - now).total_seconds()))

        return {
            'algorithm': 'fixed_window',
            'limit': self.limit,
            'window_seconds': self.window_seconds,
            'count': count,
            'remaining': max(0, self.limit - count),
            'seconds_until_next_request': seconds_until_next_request,
        }

    def reset(self, env, key):
        domain = [('ip', '=', key), ('algorithm', '=', 'fixed_window')]
        self._log(env).search(domain).unlink()


# ---------------------------------------------------------------------------
# 2. Sliding Window  (In-Memory)
# ---------------------------------------------------------------------------

class SlidingWindowRateLimiter:
    """
    Weighted blend of two adjacent fixed windows.

        effective_rate = prev_count x (1 - overlap) + curr_count

    Storage : dict  (Redis in production for multi-worker)
    Benefit : eliminates the boundary-burst flaw of fixed windows.
    Used by : Cloudflare, Upstash
    """

    def __init__(self, limit=10, window_seconds=60):
        self.limit = limit
        self.window_seconds = window_seconds
        self._store = defaultdict(dict)  # {key: {window_ts: count}}

    def _window_start(self, ts=None):
        """Align *ts* to the nearest window boundary."""
        ts = ts or time.time()
        return math.floor(ts / self.window_seconds) * self.window_seconds

    def check(self, key):
        now = time.time()
        curr_start = self._window_start(now)
        prev_start = curr_start - self.window_seconds
        store = self._store[key]

        curr_count = store.get(curr_start, 0)
        prev_count = store.get(prev_start, 0)

        # ---- core formula ------------------------------------------------
        overlap = (now - curr_start) / self.window_seconds
        effective_rate = prev_count * (1 - overlap) + curr_count
        # ------------------------------------------------------------------

        if effective_rate >= self.limit:
            retry_after = int(curr_start + self.window_seconds - now)
            raise RateLimiterException(
                f"Sliding window: effective rate {effective_rate:.1f}/{self.limit}. "
                f"Retry in {retry_after}s.",
                retry_after=retry_after,
                algorithm='sliding_window',
            )

        # Increment current window counter
        store[curr_start] = curr_count + 1

        # Discard expired windows
        for k in [k for k in store if k < prev_start]:
            del store[k]

        return {
            'allowed': True,
            'effective_rate': effective_rate + 1,
            'remaining': max(0, self.limit - effective_rate - 1),
            'algorithm': 'sliding_window',
        }

    def get_status(self, key):
        now = time.time()
        curr_start = self._window_start(now)
        prev_start = curr_start - self.window_seconds
        store = self._store.get(key, {})

        curr_count = store.get(curr_start, 0)
        prev_count = store.get(prev_start, 0)

        overlap = (now - curr_start) / self.window_seconds
        effective_rate = prev_count * (1 - overlap) + curr_count
        remaining = max(0, self.limit - effective_rate)

        return {
            'algorithm': 'sliding_window',
            'limit': self.limit,
            'window_seconds': self.window_seconds,
            'current_window_count': curr_count,
            'previous_window_count': prev_count,
            'effective_rate': effective_rate,
            'remaining': remaining,
            'seconds_until_next_request': max(0, int(curr_start + self.window_seconds - now)) if remaining <= 0 else 0,
        }

    def reset(self, key):
        self._store.pop(key, None)


# ---------------------------------------------------------------------------
# 3. Token Bucket  (In-Memory)
# ---------------------------------------------------------------------------

class TokenBucketRateLimiter:
    """
    Bucket holds tokens (up to *capacity*).  Each request costs one token.
    Tokens refill at *refill_rate* per second.  Empty bucket -> rejected.

    Two knobs : capacity (burst size) vs refill_rate (sustained avg).
    Used by   : Stripe, OpenAI
    """

    def __init__(self, capacity=10, refill_rate=1):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self._buckets = {}  # {key: {'tokens': float, 'last_refill': float}}

    def _bucket(self, key):
        """Get or create a full bucket for *key*."""
        if key not in self._buckets:
            self._buckets[key] = {'tokens': self.capacity, 'last_refill': time.time()}
        return self._buckets[key]

    def _refill(self, bucket):
        """Add tokens for elapsed time (capped at capacity)."""
        now = time.time()
        bucket['tokens'] = min(
            self.capacity,
            bucket['tokens'] + (now - bucket['last_refill']) * self.refill_rate,
        )
        bucket['last_refill'] = now

    def check(self, key):
        bucket = self._bucket(key)
        self._refill(bucket)

        if bucket['tokens'] < 1:
            retry_after = (1 - bucket['tokens']) / self.refill_rate
            raise RateLimiterException(
                f"Token bucket: no tokens. Retry in {retry_after:.1f}s.",
                retry_after=int(retry_after) + 1,
                algorithm='token_bucket',
            )

        # Consume one token
        bucket['tokens'] -= 1

        return {
            'allowed': True,
            'tokens': bucket['tokens'],
            'capacity': self.capacity,
            'remaining': int(bucket['tokens']),
            'refill_rate': self.refill_rate,
            'algorithm': 'token_bucket',
        }

    def get_status(self, key):
        bucket = self._bucket(key)
        self._refill(bucket)

        return {
            'algorithm': 'token_bucket',
            'capacity': self.capacity,
            'tokens': bucket['tokens'],
            'remaining': int(bucket['tokens']),
            'refill_rate': self.refill_rate,
            'seconds_until_next_request': max(0, (1 - bucket['tokens']) / self.refill_rate) if bucket['tokens'] < 1 else 0,
        }

    def reset(self, key):
        self._buckets[key] = {'tokens': self.capacity, 'last_refill': time.time()}
