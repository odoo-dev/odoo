odoo.define('pos_cache.pos_cache', function (require) {
"use strict";

var models = require('point_of_sale.models');
const Registries = require('point_of_sale.Registries');
var pos_env = require('point_of_sale.env');


Registries.PosModelRegistry.extend(models.PosGlobalState, (PosGlobalState) => {
class PosCachePosModel extends PosGlobalState {
    async _getTotalProductsCount() {
        return pos_env.services.rpc({
            model: 'pos.session',
            method: 'get_total_products_count',
            args: [[odoo.pos_session_id]],
            context: pos_env.session.user_context,
        });
    }
    async _loadCachedProducts(start, end) {
        const products = await pos_env.services.rpc({
            model: 'pos.session',
            method: 'get_cached_products',
            args: [[odoo.pos_session_id], start, end],
            context: pos_env.session.user_context,
        });
        this._loadProductProduct(products);
    }
}

return PosCachePosModel;
});

});
