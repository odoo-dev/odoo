# Part of Odoo. See LICENSE file for full copyright and licensing details.

"""Controller for the rate-limiting demo page."""

import json

from odoo import http
from odoo.http import Response, request

from ..models.rate_limiter import (
    FixedWindowRateLimiter,
    RateLimiterException,
    SlidingWindowRateLimiter,
    TokenBucketRateLimiter,
)

# Configuration shown in the demo UI
DEMO_CONFIG = {
    'fixed_window': {
        'limit': 10, 'window_seconds': 60,
        'description': 'Fixed Window (DB) - counter resets at window end',
    },
    'sliding_window': {
        'limit': 10, 'window_seconds': 60,
        'description': 'Sliding Window (Memory) - weighted blend of two windows',
    },
    'token_bucket': {
        'capacity': 10, 'refill_rate': 1,
        'description': 'Token Bucket (Memory) - burst + steady refill',
    },
}

# Singleton instances (survive across requests within one worker)
_limiters = {
    'fixed_window': FixedWindowRateLimiter(limit=10, window_seconds=60),
    'sliding_window': SlidingWindowRateLimiter(limit=10, window_seconds=60),
    'token_bucket': TokenBucketRateLimiter(capacity=10, refill_rate=1),
}


def _rate_limit_key():
    """Session-based key -- each browser gets its own limit, works behind proxies."""
    return request.session.sid


def _json(data, status=200):
    return Response(json.dumps(data, default=str), status=status, mimetype='application/json')


class RateLimitDemoController(http.Controller):

    # --- Demo page -----------------------------------------------------------

    @http.route(
        ['/website/rate_limit_demo', '/rate_limit_demo'],
        type='http', auth='public', website=True, sitemap=False,
    )
    def demo_page(self, **kw):
        key = _rate_limit_key()
        return request.render('website.rate_limit_demo_page', {
            'key': key[:8],
            'config': DEMO_CONFIG,
            'fixed_status': _limiters['fixed_window'].get_status(request.env, key),
            'sliding_status': _limiters['sliding_window'].get_status(key),
            'token_status': _limiters['token_bucket'].get_status(key),
        })

    # --- JSON API ------------------------------------------------------------

    @http.route(
        '/website/rate_limit_demo/status/<string:algorithm>',
        type='http', auth='public', methods=['GET'], website=True, sitemap=False,
    )
    def get_status(self, algorithm, **kw):
        key = _rate_limit_key()
        limiter = _limiters.get(algorithm)
        if not limiter:
            return _json({'error': f'Unknown algorithm: {algorithm}'}, 400)
        status = limiter.get_status(request.env, key) if algorithm == 'fixed_window' else limiter.get_status(key)
        return _json({'algorithm': algorithm, 'status': status, 'config': DEMO_CONFIG.get(algorithm, {})})

    @http.route(
        '/website/rate_limit_demo/test/<string:algorithm>',
        type='http', auth='public', methods=['POST'], website=True, sitemap=False, csrf=False,
    )
    def test_algorithm(self, algorithm, **kw):
        key = _rate_limit_key()
        limiter = _limiters.get(algorithm)
        if not limiter:
            return _json({'error': f'Unknown algorithm: {algorithm}'}, 400)
        try:
            result = limiter.check(request.env, key) if algorithm == 'fixed_window' else limiter.check(key)
            return _json({'success': True, 'algorithm': algorithm, 'result': result})
        except RateLimiterException as e:
            return _json({
                'success': False, 'algorithm': algorithm,
                'error': {'message': e.message, 'retry_after': e.retry_after},
            }, 429)

    @http.route(
        '/website/rate_limit_demo/reset/<string:algorithm>',
        type='http', auth='public', methods=['POST'], website=True, sitemap=False, csrf=False,
    )
    def reset_algorithm(self, algorithm, **kw):
        key = _rate_limit_key()
        algos = list(_limiters) if algorithm == 'all' else [algorithm]
        for algo in algos:
            limiter = _limiters.get(algo)
            if not limiter:
                continue
            if algo == 'fixed_window':
                limiter.reset(request.env, key)
            else:
                limiter.reset(key)
        return _json({'success': True, 'reset': algos})
