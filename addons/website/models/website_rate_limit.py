# Part of Odoo. See LICENSE file for full copyright and licensing details.

"""Transient log rows for the website rate-limiting demo (fixed-window counter)."""

from odoo import fields, models


class WebsiteRateLimitLog(models.TransientModel):
    """One row per counted request; vacuumed automatically like other transient models."""

    _name = 'website.rate.limit.log'
    _description = 'Website Rate Limit Log (Fixed Window)'

    _ip_algorithm_date_idx = models.Index("(ip, algorithm, create_date)")

    ip = fields.Char(
        string='IP Address',
        required=True,
        readonly=True,
        help="Client IP address making the request",
    )
    algorithm = fields.Selection(
        [
            ('fixed_window', 'Fixed Window'),
            ('sliding_window', 'Sliding Window (DB)'),
            ('token_bucket_db', 'Token Bucket (DB)'),
        ],
        string='Algorithm',
        required=True,
        readonly=True,
        help="Rate limiting algorithm used",
    )
