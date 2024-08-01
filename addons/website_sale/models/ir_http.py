# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo import models
from odoo.http import request
from odoo.tools import lazy

from odoo.addons.website_sale.models.website import (
    # FISCAL_POSITION_SESSION_CACHE_KEY, # TODO VFE cache time limit like pricelists ?
    PRICELIST_SESSION_CACHE_KEY,
)


class IrHttp(models.AbstractModel):
    _inherit = ['ir.http']

    @classmethod
    def _pre_dispatch(cls, rule, args):
        super()._pre_dispatch(rule, args)
        affiliate_id = request.httprequest.args.get('affiliate_id')
        if affiliate_id:
            request.session['affiliate_id'] = int(affiliate_id)

    @classmethod
    def _frontend_pre_dispatch(cls):
        super()._frontend_pre_dispatch()

        # TODO VFE how to ensure request context updates are correctly propagated to the records ?

        if 'website_sale_pricelist_time' in request.session:
            now = datetime.timestamp(datetime.now())
            # TODO VFE provide a config param to configure time of this cache
            pricelist_save_time = request.session['website_sale_pricelist_time']
            if pricelist_save_time < now - 60 * 60:
                request.session.pop(PRICELIST_SESSION_CACHE_KEY, None)
                request.session.pop('website_sale_pricelist_time')

        # lazy to make sure those are only evaluated when requested
        # TODO VFE request.curency ?
        request.pricelist = lazy(request.website._get_and_cache_current_pricelist)

        # SUDOED
        request.cart = lazy(request.website._get_and_cache_current_order)
        request.fiscal_position = lazy(request.website._get_and_cache_current_fiscal_position)
