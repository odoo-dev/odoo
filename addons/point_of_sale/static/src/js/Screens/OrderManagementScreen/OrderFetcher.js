odoo.define('point_of_sale.OrderFetcher', function (require) {
    'use strict';

    const { EventBus } = owl.core;
    const { Gui } = require('point_of_sale.Gui');
    const models = require('point_of_sale.models');

    class OrderFetcher extends EventBus {
        constructor() {
            super();
            this.currentPage = 1;
            this.ordersToShow = [];
            this.cache = {};
            this.totalCount = 0;
        }
        get nActiveOrders() {
            return this.activeOrders.length;
        }
        get lastPageFullOfActiveOrders() {
            return Math.trunc(this.nActiveOrders / this.nPerPage);
        }
        get remainingActiveOrders() {
            return this.nActiveOrders % this.nPerPage;
        }
        /**
         * for nPerPage = 10
         * +--------+----------+
         * | nItems | lastPage |
         * +--------+----------+
         * |     2  |       1  |
         * |    10  |       1  |
         * |    11  |       2  |
         * |    30  |       3  |
         * |    35  |       4  |
         * +--------+----------+
         */
        get lastPage() {
            const nItems = this.nActiveOrders + this.totalCount;
            return Math.trunc(nItems / (this.nPerPage + 1)) + 1;
        }
        /**
         * Calling this methods populates the `ordersToShow` then trigger `update` event.
         * @related get
         *
         * NOTE: This is tightly-coupled with pagination. So if the current page contains all
         * active orders, it will not fetch anything from the server but only sets `ordersToShow`
         * to the active orders that fits the current page.
         */
        async fetch() {
            try {
                let limit, offset;
                let start, end;
                if (this.currentPage <= this.lastPageFullOfActiveOrders) {
                    // Show only active orders.
                    start = (this.currentPage - 1) * this.nPerPage;
                    end = this.currentPage * this.nPerPage;
                    this.ordersToShow = this.activeOrders.slice(start, end);
                } else if (this.currentPage === this.lastPageFullOfActiveOrders + 1) {
                    // Show partially the remaining active orders and
                    // some orders from the backend.
                    offset = 0;
                    limit = this.nPerPage - this.remainingActiveOrders;
                    start = (this.currentPage - 1) * this.nPerPage;
                    end = this.nActiveOrders;
                    this.ordersToShow = [
                        ...this.activeOrders.slice(start, end),
                        ...(await this._fetch(limit, offset)),
                    ];
                } else {
                    // Show orders from the backend.
                    offset =
                        this.nPerPage -
                        this.remainingActiveOrders +
                        (this.currentPage - (this.lastPageFullOfActiveOrders + 1) - 1) *
                            this.nPerPage;
                    limit = this.nPerPage;
                    this.ordersToShow = await this._fetch(limit, offset);
                }
                this.trigger('update');
            } catch (error) {
                if (this.comp.isRpcError(error) && error.message.code < 0) {
                    Gui.showPopup('ErrorPopup', {
                        title: this.comp.env._t('Network Error'),
                        body: this.comp.env._t('Unable to fetch orders if offline.'),
                    });
                    Gui.setSyncStatus('error');
                } else {
                    throw error;
                }
            }
        }
        /**
         * This returns the orders from the backend that needs to be shown.
         * If the order is already in cache, the full information about that
         * order is not fetched anymore, instead, we use info from cache.
         *
         * @param {number} limit
         * @param {number} offset
         */
        async _fetch(limit, offset) {
            const { ids, totalCount } = await this._getOrderIdsForCurrentPage(limit, offset);
            const idsNotInCache = ids.filter((id) => !(id in this.cache));
            if (idsNotInCache.length > 0) {
                const fetchedOrders = await this._fetchOrders(idsNotInCache);
                // Cache these fetched orders so that next time, no need to fetch
                // them again, unless invalidated. See `invalidateCache`.
                fetchedOrders.forEach((orderJson) => {
                    const order = new models.Order(
                        {},
                        { pos: this.comp.env.pos, json: orderJson }
                    );
                    order.selected_orderline.selected = false;
                    this.cache[orderJson.id] = order;
                });
            }
            this.totalCount = totalCount;
            return ids.map((id) => this.cache[id]);
        }
        async _getOrderIdsForCurrentPage(limit, offset) {
            return await this.rpc({
                model: 'pos.order',
                method: 'search_paid_order_ids',
                kwargs: { domain: this.searchDomain ? this.searchDomain : [], limit, offset },
                context: this.comp.env.session.user_context,
            });
        }
        async _fetchOrders(ids) {
            return await this.rpc({
                model: 'pos.order',
                method: 'export_for_ui',
                args: [ids],
                context: this.comp.env.session.user_context,
            });
        }
        nextPage() {
            if (this.currentPage < this.lastPage) {
                this.currentPage += 1;
                this.fetch();
            }
        }
        prevPage() {
            if (this.currentPage > 1) {
                this.currentPage -= 1;
                this.fetch();
            }
        }
        /**
         * NOTE: If there is searchDomain, do not show the active orders.
         * Unless we want the searchDomain to be applicable to the active orders
         * as well. Don't we?
         *
         * @param {integer|undefined} id id of the cached order
         * @returns {Array<models.Order>}
         */
        get(id) {
            if (id) return this.cache[id];
            if (this.searchDomain) {
                return this.ordersToShow.filter((order) => order.locked);
            } else {
                return this.ordersToShow;
            }
        }
        setSearchDomain(searchDomain) {
            this.searchDomain = searchDomain;
        }
        setComponent(comp) {
            this.comp = comp;
            this.activeOrders = this.comp.env.pos.get('orders').models;
            return this;
        }
        setNPerPage(val) {
            this.nPerPage = val;
        }
        setPage(page) {
            this.currentPage = page;
        }
        invalidateCache(ids) {
            for (let id of ids) {
                delete this.cache[id];
            }
        }
        async rpc() {
            Gui.setSyncStatus('connecting');
            const result = await this.comp.rpc(...arguments);
            Gui.setSyncStatus('connected');
            return result;
        }
    }

    return new OrderFetcher();
});
