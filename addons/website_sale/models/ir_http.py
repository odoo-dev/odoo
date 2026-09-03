# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.http import request
from ..models.website import (
    CART_SESSION_CACHE_KEY,
    FISCAL_POSITION_SESSION_CACHE_KEY,
    PRICELIST_SESSION_CACHE_KEY,
    PRICELIST_SELECTED_SESSION_CACHE_KEY,
)


class IrHttp(models.AbstractModel):
    _inherit = "ir.http"

    @classmethod
    def _pre_dispatch(cls, rule, args):
        super()._pre_dispatch(rule, args)
        affiliate_id = request.httprequest.args.get("affiliate_id")
        if affiliate_id:
            request.session["affiliate_id"] = int(affiliate_id)

    @classmethod
    def _frontend_pre_dispatch(cls):
        super()._frontend_pre_dispatch()

        if CART_SESSION_CACHE_KEY in request.session:
            request.update_context(**{CART_SESSION_CACHE_KEY: request.session[CART_SESSION_CACHE_KEY]})
        if FISCAL_POSITION_SESSION_CACHE_KEY in request.session:
            request.update_context(**{FISCAL_POSITION_SESSION_CACHE_KEY: request.session[FISCAL_POSITION_SESSION_CACHE_KEY]})
        if PRICELIST_SESSION_CACHE_KEY in request.session:
            request.update_context(**{PRICELIST_SESSION_CACHE_KEY: request.session[PRICELIST_SESSION_CACHE_KEY]})
        if PRICELIST_SELECTED_SESSION_CACHE_KEY in request.session:
            request.update_context(**{PRICELIST_SELECTED_SESSION_CACHE_KEY: request.session[PRICELIST_SELECTED_SESSION_CACHE_KEY]})

    @classmethod
    def _slug(cls, value: models.BaseModel | tuple[int, str]) -> str:
        if isinstance(value, models.BaseModel):
            return super()._slug(
                value.with_context(show_attribute=False, show_parent_categories=False)
            )
        return super()._slug(value)
