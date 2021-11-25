/* global waitForWebfonts */
odoo.define('point_of_sale.models', function (require) {
"use strict";

var BarcodeParser = require('barcodes.BarcodeParser');
var BarcodeReader = require('point_of_sale.BarcodeReader');
var PosDB = require('point_of_sale.DB');
var devices = require('point_of_sale.devices');
var concurrency = require('web.concurrency');
var config = require('web.config');
var core = require('web.core');
var field_utils = require('web.field_utils');
var time = require('web.time');
var utils = require('web.utils');
var { Gui } = require('point_of_sale.Gui');

var QWeb = core.qweb;
var _t = core._t;
var Mutex = concurrency.Mutex;
var round_di = utils.round_decimals;
var round_pr = utils.round_precision;

const { PosModelRegistry } = require('point_of_sale.Registries');
const reactivity = require('@point_of_sale/js/reactivity');

/**
 * TODO-REF-JCB If optimization is needed, then we implement this
 * using a Balanced Binary Tree.
 * But behaving like Object (indexed by cid) might not be
 * needed. Let's see how it turns out.
 *
 * The goal is to make a type that behaves like an Array
 * and an Object.
 */
class PosCollection extends Array {
    getByCID(cid) {
        return this.find(item => item.cid == cid);
    }
    add(item) {
        this.push(item);
    }
    remove(item) {
        const index = this.findIndex(_item => item.cid == _item.cid);
        if (index < 0) return index;
        this.splice(index, 1);
        return index;
    }
    reset() {
        this.length = 0;
    }
    at(index) {
        return this[index];
    }
}

let nextId = 0;
class PosModel {
    /**
     * Create an object with cid. If no cid is in the defaultObj,
     * cid is computed based on its id. Override _getCID if you
     * don't want this default calculation of cid.
     * @param {Object?} defaultObj its props copied to this instance.
     */
    constructor(defaultObj) {
        defaultObj = defaultObj || {};
        if (!defaultObj.cid) {
            defaultObj.cid = this._getCID(defaultObj);
        }
        Object.assign(this, defaultObj);
    }
    /**
     * Default cid getter. Used as local identity of this object.
     * @param {Object} obj
     */
    _getCID(obj) {
        if (obj.id) {
            if (typeof obj.id == 'string') {
                return obj.id;
            } else if (typeof obj.id == 'number') {
                return `c${obj.id}`;
            }
        }
        return `c${nextId++}`;
    }
}

class PosGlobalState extends PosModel {
    constructor(obj) {
        super(obj);
        this.flush_mutex = new Mutex();                   // used to make sure the orders are sent to the server once at time

        this.proxy = new devices.ProxyDevice(this);              // used to communicate to the hardware devices via a local proxy
        this.barcode_reader = new BarcodeReader({'pos': this, proxy:this.proxy});

        this.proxy_queue = new devices.JobQueue();           // used to prevent parallels communications to the proxy
        this.db = new PosDB();                       // a local database used to search trough products and categories & store pending orders
        this.debug = config.isDebug(); //debug mode

        // Business data; loaded from the server at launch
        this.company_logo = null;
        this.company_logo_base64 = '';
        this.currency = null;
        this.company = null;
        this.user = null;
        this.users = [];
        this.employee = {name: null, id: null, barcode: null, user_id:null, pin:null};
        this.employees = [];
        this.partners = [];
        this.taxes = [];
        this.pos_session = null;
        this.config = null;
        this.units = [];
        this.units_by_id = {};
        this.uom_unit_id = null;
        this.default_pricelist = null;
        this.order_sequence = 1;

        // Object mapping the order's name (which contains the uid) to it's server_id after
        // validation (order paid then sent to the backend).
        this.validated_orders_name_server_id_map = {};

        // Record<orderlineId, { 'qty': number, 'orderline': { qty: number, refundedQty: number, orderUid: string }, 'destinationOrderUid': string }>
        this.toRefundLines = {};
        this.TICKET_SCREEN_STATE = {
            syncedOrders: {
                currentPage: 1,
                cache: {},
                toShow: [],
                nPerPage: 80,
                totalCount: null,
            },
            ui: {
                selectedSyncedOrderId: null,
                searchDetails: this.getDefaultSearchDetails(),
                filter: null,
                // maps the order's backendId to it's selected orderline
                selectedOrderlineIds: {},
                highlightHeaderNote: false,
            },
        };

        // Extract the config id from the url.
        var given_config = new RegExp('[\?&]config_id=([^&#]*)').exec(window.location.href);
        this.config_id = given_config && given_config[1] && parseInt(given_config[1]) || false;
        // these dynamic attributes can be watched for change by other models or widgets
        Object.assign(this, {
            'synch':            { status:'connected', pending:0 },
            'orders':           new PosCollection(),
            'selectedOrder':    null,
            'selectedClient':   null,
            'cashier':          null,
            'selectedCategoryId': null,
        });
    }
    getDefaultSearchDetails() {
        return {
            fieldName: 'RECEIPT_NUMBER',
            searchTerm: '',
        };
    }
    async load_product_uom_unit() {
        const params = {
            model: 'ir.model.data',
            method:'check_object_reference',
            args: ['uom', 'product_uom_unit'],
        };

        const uom_id = await this.rpc(params);
        this.uom_unit_id = uom_id[1];
    }

    async after_load_server_data(){
        await this.load_product_uom_unit();
        await this.load_orders();
        this.set_start_order();
        if(this.config.use_proxy){
            if (this.config.iface_customer_facing_display) {
                this.on('change:selectedOrder', this.send_current_order_to_customer_facing_display, this);
            }

            return this.connect_to_proxy();
        }
    }
    // releases ressources holds by the model at the end of life of the posmodel
    destroy(){
        // FIXME, should wait for flushing, return a deferred to indicate successfull destruction
        // this.flush();
        this.proxy.disconnect();
        this.barcode_reader.disconnect_from_proxy();
    }

    connect_to_proxy () {
        var self = this;
        return new Promise(function (resolve, reject) {
            self.barcode_reader.disconnect_from_proxy();
            self.showLoadingSkip();
            self.proxy.autoconnect({
                force_ip: self.config.proxy_ip || undefined,
                progress: function(prog){},
            }).then(
                function () {
                    if (self.config.iface_scan_via_proxy) {
                        self.barcode_reader.connect_to_proxy();
                    }
                    resolve();
                },
                function (statusText, url) {
                    // this should reject so that it can be captured when we wait for pos.ready
                    // in the chrome component.
                    // then, if it got really rejected, we can show the error.
                    if (statusText == 'error' && window.location.protocol == 'https:') {
                        reject({
                            title: _t('HTTPS connection to IoT Box failed'),
                            body: _.str.sprintf(
                              _t('Make sure you are using IoT Box v18.12 or higher. Navigate to %s to accept the certificate of your IoT Box.'),
                              url
                            ),
                            popup: 'alert',
                        });
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async load_server_data(){
        const loadedModels = await this.rpc({
            model: 'pos.session',
            method: 'load_pos_data',
            args: [[odoo.pos_session_id]],
        })
        const tmp = {};
        for (const model of this.models) {
            if (model.condition ? !model.condition(this) : false) continue;
            await model.loaded(this, loadedModels[model.model] || [], tmp);
        }
        return this.after_load_server_data();
    }
    prepare_new_partners_domain(){
        return [['write_date','>', this.db.get_partner_write_date()]];
    }

    // reload the list of partner, returns as a promise that resolves if there were
    // updated partners, and fails if not
    load_new_partners(){
        var self = this;
        return new Promise(function (resolve, reject) {
            var fields = _.find(self.models, function(model){ return model.label === 'load_partners'; }).fields;
            var domain = self.prepare_new_partners_domain();
            self.rpc({
                model: 'res.partner',
                method: 'search_read',
                args: [domain, fields],
            }, {
                timeout: 3000,
                shadow: true,
            })
            .then(function (partners) {
                if (self.db.add_partners(partners)) {   // check if the partners we got were real updates
                    resolve();
                } else {
                    reject('Failed in updating partners.');
                }
            }, function (type, err) { reject(); });
        });
    }

    setSelectedCategoryId(categoryId) {
        this.selectedCategoryId = categoryId;
    }

    // this is called when an order is removed from the order collection. It ensures that there is always an existing
    // order and a valid selected order
    on_removed_order(removed_order,index,reason){
        var order_list = this.get_order_list();
        if( (reason === 'abandon' || removed_order.temporary) && order_list.length > 0){
            // when we intentionally remove an unfinished order, and there is another existing one
            this.set_order(order_list[index] || order_list[order_list.length - 1], { silent: true });
        }else{
            // when the order was automatically removed after completion,
            // or when we intentionally delete the only concurrent order
            this.add_new_order({ silent: true });
        }
        // Remove the link between the refund orderlines when deleting an order
        // that contains a refund.
        for (const line of removed_order.get_orderlines()) {
            if (line.refunded_orderline_id) {
                delete this.toRefundLines[line.refunded_orderline_id];
            }
        }
    }

    // returns the user who is currently the cashier for this point of sale
    get_cashier(){
        // reset the cashier to the current user if session is new
        if (this.db.load('pos_session_id') !== this.pos_session.id) {
            this.set_cashier(this.employee);
        }
        return this.db.get_cashier() || this.cashier || this.employee;
    }
    // changes the current cashier
    set_cashier(employee){
        this.cashier = employee;
        this.db.set_cashier(this.cashier);
    }
    createAutomaticallySavedOrder(json) {
        const options = {pos:this};
        if (json) {
            options.json = json;
        }
        let order = reactivity.reactive(new (PosModelRegistry.get(Order))({},options), () => {
            order.save_to_db();
        });
        order.save_to_db();
        return order;
    }
    // creates a new empty order and sets it as the current order
    add_new_order(options){
        var order = this.createAutomaticallySavedOrder();
        this.orders.add(order);
        this.selectedOrder = order;
        return order;
    }
    /**
     * Load the locally saved unpaid orders for this PoS Config.
     *
     * First load all orders belonging to the current session.
     * Second load all orders belonging to the same config but from other sessions,
     * Only if tho order has orderlines.
     */
    async load_orders(){
        var jsons = this.db.get_unpaid_orders();
        await this._loadMissingProducts(jsons);
        var orders = [];

        for (var i = 0; i < jsons.length; i++) {
            var json = jsons[i];
            if (json.pos_session_id === this.pos_session.id) {
                orders.push(this.createAutomaticallySavedOrder(json));
            }
        }
        for (var i = 0; i < jsons.length; i++) {
            var json = jsons[i];
            if (json.pos_session_id !== this.pos_session.id && json.lines.length > 0) {
                orders.push(this.createAutomaticallySavedOrder(json));
            } else if (json.pos_session_id !== this.pos_session.id) {
                this.db.remove_unpaid_order(jsons[i]);
            }
        }

        orders = orders.sort(function(a,b){
            return a.sequence_number - b.sequence_number;
        });

        if (orders.length) {
            for (const order of orders) {
                this.orders.add(order);
            }
        }
    }
    async _loadMissingProducts(orders) {
        const missingProductIds = new Set([]);
        for (const order of orders) {
            for (const line of order.lines) {
                const productId = line[2].product_id;
                if (missingProductIds.has(productId)) continue;
                if (!this.db.get_product_by_id(productId)) {
                    missingProductIds.add(productId);
                }
            }
        }
        const productModel = _.find(this.models, function(model){return model.model === 'product.product';});
        const fields = productModel.fields;
        const products = await this.rpc({
            model: 'product.product',
            method: 'read',
            args: [[...missingProductIds], fields],
            context: Object.assign(this.session.user_context, { display_default_code: false }),
        });
        productModel.loaded(this, products);
    }
    async loadProductsBackground() {
        let page = 0;
        let product_model = _.find(this.models, (model) => model.model === 'product.product');
        let productLoadingInfo = await this.rpc({
            model: 'pos.session',
            method: 'get_loading_params',
            args: [[odoo.pos_session_id], 'product.product'],
            context: this.session.user_context,
        });
        let products = [];
        do {
            products = await this.rpc({
                model: 'product.product',
                method: 'search_read',
                kwargs: {
                    'domain': productLoadingInfo.domain,
                    'fields': productLoadingInfo.fields,
                    'order': productLoadingInfo.order.split(',').map(name => ({ name })),
                    'offset': page * this.config.limited_products_amount,
                    'limit': this.config.limited_products_amount,
                },
                context: { ...this.session.user_context, ...productLoadingInfo.context },
            });
            product_model.loaded(this, products);
            page += 1;
        } while(products.length == this.config.limited_products_amount);
    }
    async loadPartnersBackground() {
        // Start at the first page since the first set of loaded partners are not actually in the
        // same order as this background loading procedure.
        let i = 0;
        let partners = [];
        let partnerLoadingInfo = await this.rpc({
            model: 'pos.session',
            method: 'get_loading_params',
            args: [[odoo.pos_session_id], 'res.partner'],
            context: this.session.user_context,
        });
        do {
            partners = await this.rpc({
                model: 'res.partner',
                method: 'search_read',
                args: [[], partnerLoadingInfo.fields],
                kwargs: {
                    limit: this.config.limited_partners_amount,
                    offset: this.config.limited_partners_amount * i
                },
                context: this.session.user_context,
            });
            this.db.add_partners(partners);
            i += 1;
        } while(partners.length);
    }
    set_start_order(){
        if (this.orders.length && !this.selectedOrder) {
            this.selectedOrder = this.orders[0]
        } else {
            this.add_new_order();
        }
    }

    // return the current order
    get_order(){
        return this.selectedOrder;
    }

    // change the current order
    set_order(order, options){
        this.selectedOrder = order;
    }

    // return the list of unpaid orders
    get_order_list(){
        return this.orders;
    }

    //removes the current order
    delete_current_order(){
        var order = this.get_order();
        if (order) {
            order.destroy({'reason':'abandon'});
        }
    }

    _convert_product_img_to_base64 (product, url) {
        return new Promise(function (resolve, reject) {
            var img = new Image();

            img.onload = function () {
                var canvas = document.createElement('CANVAS');
                var ctx = canvas.getContext('2d');

                canvas.height = this.height;
                canvas.width = this.width;
                ctx.drawImage(this,0,0);

                var dataURL = canvas.toDataURL('image/jpeg');
                product.image_base64 = dataURL;
                canvas = null;

                resolve();
            };
            img.crossOrigin = 'use-credentials';
            img.src = url;
        });
    }

    send_current_order_to_customer_facing_display() {
        var self = this;
        this.render_html_for_customer_facing_display().then(function (rendered_html) {
            if (self.env.pos.customer_display) {
                var $renderedHtml = $('<div>').html(rendered_html);
                $(self.env.pos.customer_display.document.body).html($renderedHtml.find('.pos-customer_facing_display'));
                var orderlines = $(self.env.pos.customer_display.document.body).find('.pos_orderlines_list');
                orderlines.scrollTop(orderlines.prop("scrollHeight"));
            } else if (self.env.pos.proxy.posbox_supports_display) {
                self.proxy.update_customer_facing_display(rendered_html);
            }
        });
    }

    /**
     * @returns {Promise<string>}
     */
    render_html_for_customer_facing_display () {
        var self = this;
        var order = this.get_order();

        // If we're using an external device like the IoT Box, we
        // cannot get /web/image?model=product.product because the
        // IoT Box is not logged in and thus doesn't have the access
        // rights to access product.product. So instead we'll base64
        // encode it and embed it in the HTML.
        var get_image_promises = [];

        if (order) {
            order.get_orderlines().forEach(function (orderline) {
                var product = orderline.product;
                var image_url = `/web/image?model=product.product&field=image_128&id=${product.id}&write_date=${product.write_date}&unique=1`;

                // only download and convert image if we haven't done it before
                if (! product.image_base64) {
                    get_image_promises.push(self._convert_product_img_to_base64(product, image_url));
                }
            });
        }

        return Promise.all(get_image_promises).then(function () {
            return QWeb.render('CustomerFacingDisplayOrder', {
                pos: self.env.pos,
                origin: window.location.origin,
                order: order,
            });
        });
    }

    // saves the order locally and try to send it to the backend.
    // it returns a promise that succeeds after having tried to send the order and all the other pending orders.
    push_orders (order, opts) {
        opts = opts || {};
        var self = this;

        if (order) {
            this.db.add_order(order.export_as_JSON());
        }

        return new Promise((resolve, reject) => {
            self.flush_mutex.exec(async () => {
                try {
                    resolve(await self._flush_orders(self.db.get_orders(), opts));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    push_single_order (order, opts) {
        opts = opts || {};
        const self = this;
        const order_id = self.db.add_order(order.export_as_JSON());

        return new Promise((resolve, reject) => {
            self.flush_mutex.exec(async () => {
                const order = self.db.get_order(order_id);
                try {
                    resolve(await self._flush_orders([order], opts));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // saves the order locally and try to send it to the backend and make an invoice
    // returns a promise that succeeds when the order has been posted and successfully generated
    // an invoice. This method can fail in various ways:
    // error-no-client: the order must have an associated partner_id. You can retry to make an invoice once
    //     this error is solved
    // error-transfer: there was a connection error during the transfer. You can retry to make the invoice once
    //     the network connection is up

    push_and_invoice_order (order) {
        var self = this;
        return new Promise((resolve, reject) => {
            if (!order.get_client()) {
                reject({ code: 400, message: 'Missing Customer', data: {} });
            } else {
                var order_id = self.db.add_order(order.export_as_JSON());
                self.flush_mutex.exec(async () => {
                    try {
                        const server_ids = await self._flush_orders([self.db.get_order(order_id)], {
                            timeout: 30000,
                            to_invoice: true,
                        });
                        if (server_ids.length) {
                            const [orderWithInvoice] = await self.rpc({
                                method: 'read',
                                model: 'pos.order',
                                args: [server_ids, ['account_move']],
                                kwargs: { load: false },
                            });
                            await self
                                .do_action('account.account_invoices', {
                                    additional_context: {
                                        active_ids: [orderWithInvoice.account_move],
                                    },
                                })
                                .catch(() => {
                                    reject({ code: 401, message: 'Backend Invoice', data: { order: order } });
                                });
                        } else {
                            reject({ code: 401, message: 'Backend Invoice', data: { order: order } });
                        }
                        resolve(server_ids);
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        });
    }

    // wrapper around the _save_to_server that updates the synch status widget
    // Resolves to the backend ids of the synced orders.
    _flush_orders(orders, options) {
        var self = this;
        this.set_synch('connecting', orders.length);

        return this._save_to_server(orders, options).then(function (server_ids) {
            self.set_synch('connected');
            for (let i = 0; i < server_ids.length; i++) {
                self.validated_orders_name_server_id_map[server_ids[i].pos_reference] = server_ids[i].id;
            }
            return _.pluck(server_ids, 'id');
        }).catch(function(error){
            self.set_synch(self.failed ? 'error' : 'disconnected');
            throw error;
        }).finally(function() {
            self._after_flush_orders(orders);
        });
    }
    /**
     * Hook method after _flush_orders resolved or rejected.
     * It aims to:
     *   - remove the refund orderlines from toRefundLines
     *   - invalidate cache of refunded synced orders
     */
    _after_flush_orders(orders) {
        const refundedOrderIds = new Set();
        for (const order of orders) {
            for (const line of order.data.lines) {
                const refundDetail = this.toRefundLines[line[2].refunded_orderline_id];
                if (!refundDetail) continue;
                // Collect the backend id of the refunded orders.
                refundedOrderIds.add(refundDetail.orderline.orderBackendId);
                // Reset the refund detail for the orderline.
                delete this.toRefundLines[refundDetail.orderline.id];
            }
        }
        this._invalidateSyncedOrdersCache([...refundedOrderIds]);
    }
    _invalidateSyncedOrdersCache(ids) {
        for (const id of ids) {
            delete this.TICKET_SCREEN_STATE.syncedOrders.cache[id];
        }
    }
    set_synch(status, pending) {
        if (['connected', 'connecting', 'error', 'disconnected'].indexOf(status) === -1) {
            console.error(status, ' is not a known connection state.');
        }
        pending = pending || this.db.get_orders().length + this.db.get_ids_to_remove_from_server().length;
        this.synch = { status, pending };
    }

    // send an array of orders to the server
    // available options:
    // - timeout: timeout for the rpc call in ms
    // returns a promise that resolves with the list of
    // server generated ids for the sent orders
    _save_to_server (orders, options) {
        if (!orders || !orders.length) {
            return Promise.resolve([]);
        }

        options = options || {};

        var self = this;
        var timeout = typeof options.timeout === 'number' ? options.timeout : 30000 * orders.length;

        // Keep the order ids that are about to be sent to the
        // backend. In between create_from_ui and the success callback
        // new orders may have been added to it.
        var order_ids_to_sync = _.pluck(orders, 'id');

        // we try to send the order. shadow prevents a spinner if it takes too long. (unless we are sending an invoice,
        // then we want to notify the user that we are waiting on something )
        var args = [_.map(orders, function (order) {
                order.to_invoice = options.to_invoice || false;
                return order;
            })];
        args.push(options.draft || false);
        return this.rpc({
                model: 'pos.order',
                method: 'create_from_ui',
                args: args,
                kwargs: {context: this.session.user_context},
            }, {
                timeout: timeout,
                shadow: !options.to_invoice
            })
            .then(function (server_ids) {
                _.each(order_ids_to_sync, function (order_id) {
                    self.db.remove_order(order_id);
                });
                self.failed = false;
                return server_ids;
            }).catch(function (error){
                console.warn('Failed to send orders:', orders);
                if(error.code === 200 ){    // Business Logic Error, not a connection problem
                    // Hide error if already shown before ...
                    if ((!self.failed || options.show_error) && !options.to_invoice) {
                        self.failed = error;
                        throw error;
                    }
                }
                throw error;
            });
    }

    /**
     * Remove orders with given ids from the database.
     * @param {array<number>} server_ids ids of the orders to be removed.
     * @param {dict} options.
     * @param {number} options.timeout optional timeout parameter for the rpc call.
     * @return {Promise<array<number>>} returns a promise of the ids successfully removed.
     */
    _remove_from_server (server_ids, options) {
        options = options || {};
        if (!server_ids || !server_ids.length) {
            return Promise.resolve([]);
        }

        var self = this;
        var timeout = typeof options.timeout === 'number' ? options.timeout : 7500 * server_ids.length;

        return this.rpc({
                model: 'pos.order',
                method: 'remove_from_ui',
                args: [server_ids],
                kwargs: {context: this.session.user_context},
            }, {
                timeout: timeout,
                shadow: true,
            })
            .then(function (data) {
                return self._post_remove_from_server(server_ids, data)
            }).catch(function (reason){
                var error = reason.message;
                if(error.code === 200 ){    // Business Logic Error, not a connection problem
                    //if warning do not need to display traceback!!
                    if (error.data.exception_type == 'warning') {
                        delete error.data.debug;
                    }
                }
                // important to throw error here and let the rendering component handle the
                // error
                console.warn('Failed to remove orders:', server_ids);
                throw error;
            });
    }

    // to override
    _post_remove_from_server(server_ids, data) {
        this.db.set_ids_removed_from_server(server_ids);
        return server_ids;
    }

    // Exports the paid orders (the ones waiting for internet connection)
    export_paid_orders() {
        return JSON.stringify({
            'paid_orders':  this.db.get_orders(),
            'session':      this.pos_session.name,
            'session_id':    this.pos_session.id,
            'date':         (new Date()).toUTCString(),
            'version':      this.version.server_version_info,
        },null,2);
    }

    // Exports the unpaid orders (the tabs)
    export_unpaid_orders() {
        return JSON.stringify({
            'unpaid_orders': this.db.get_unpaid_orders(),
            'session':       this.pos_session.name,
            'session_id':    this.pos_session.id,
            'date':          (new Date()).toUTCString(),
            'version':       this.version.server_version_info,
        },null,2);
    }

    // This imports paid or unpaid orders from a json file whose
    // contents are provided as the string str.
    // It returns a report of what could and what could not be
    // imported.
    import_orders(str) {
        var json = JSON.parse(str);
        var report = {
            // Number of paid orders that were imported
            paid: 0,
            // Number of unpaid orders that were imported
            unpaid: 0,
            // Orders that were not imported because they already exist (uid conflict)
            unpaid_skipped_existing: 0,
            // Orders that were not imported because they belong to another session
            unpaid_skipped_session:  0,
            // The list of session ids to which skipped orders belong.
            unpaid_skipped_sessions: [],
        };

        if (json.paid_orders) {
            for (var i = 0; i < json.paid_orders.length; i++) {
                this.db.add_order(json.paid_orders[i].data);
            }
            report.paid = json.paid_orders.length;
            this.push_orders();
        }

        if (json.unpaid_orders) {

            var orders  = [];
            var existing = this.get_order_list();
            var existing_uids = {};
            var skipped_sessions = {};

            for (var i = 0; i < existing.length; i++) {
                existing_uids[existing[i].uid] = true;
            }

            for (var i = 0; i < json.unpaid_orders.length; i++) {
                var order = json.unpaid_orders[i];
                if (order.pos_session_id !== this.pos_session.id) {
                    report.unpaid_skipped_session += 1;
                    skipped_sessions[order.pos_session_id] = true;
                } else if (existing_uids[order.uid]) {
                    report.unpaid_skipped_existing += 1;
                } else {
                    orders.push(this.createAutomaticallySavedOrder(order));
                }
            }

            orders = orders.sort(function(a,b){
                return a.sequence_number - b.sequence_number;
            });

            if (orders.length) {
                report.unpaid = orders.length;
                this.orders.add(orders);
            }

            report.unpaid_skipped_sessions = _.keys(skipped_sessions);
        }

        return report;
    }

    _load_orders(){
        var jsons = this.db.get_unpaid_orders();
        var orders = [];
        var not_loaded_count = 0;

        for (var i = 0; i < jsons.length; i++) {
            var json = jsons[i];
            if (json.pos_session_id === this.pos_session.id) {
                orders.push(this.createAutomaticallySavedOrder(json));
            } else {
                not_loaded_count += 1;
            }
        }

        if (not_loaded_count) {
            console.info('There are '+not_loaded_count+' locally saved unpaid orders belonging to another session');
        }

        orders = orders.sort(function(a,b){
            return a.sequence_number - b.sequence_number;
        });

        if (orders.length) {
            this.orders.add(orders);
        }
    }

    /**
     * Directly calls the requested service, instead of triggering a
     * 'call_service' event up, which wouldn't work as services have no parent
     *
     * @param {OdooEvent} ev
     */
    _trigger_up (ev) {
        if (ev.is_stopped()) {
            return;
        }
        const payload = ev.data;
        if (ev.name === 'call_service') {
            let args = payload.args || [];
            if (payload.service === 'ajax' && payload.method === 'rpc') {
                // ajax service uses an extra 'target' argument for rpc
                args = args.concat(ev.target);
            }
            const service = this.env.services[payload.service];
            const result = service[payload.method].apply(service, args);
            payload.callback(result);
        }
    }

    isProductQtyZero(qty) {
        return utils.float_is_zero(qty, this.dp['Product Unit of Measure']);
    }

    formatProductQty(qty) {
        return field_utils.format.float(qty, { digits: [true, this.dp['Product Unit of Measure']] });
    }

    format_currency(amount, precision) {
        var currency =
            this && this.currency
                ? this.currency
                : { symbol: '$', position: 'after', rounding: 0.01, decimals: 2 };

        amount = this.format_currency_no_symbol(amount, precision, currency);

        if (currency.position === 'after') {
            return amount + ' ' + (currency.symbol || '');
        } else {
            return (currency.symbol || '') + ' ' + amount;
        }
    }

    format_currency_no_symbol(amount, precision, currency) {
        if (!currency) {
            currency =
                this && this.currency
                    ? this.currency
                    : { symbol: '$', position: 'after', rounding: 0.01, decimals: 2 };
        }
        var decimals = currency.decimals;

        if (precision && this.dp[precision] !== undefined) {
            decimals = this.dp[precision];
        }

        if (typeof amount === 'number') {
            amount = round_di(amount, decimals).toFixed(decimals);
            amount = field_utils.format.float(round_di(amount, decimals), {
                digits: [69, decimals],
            });
        }

        return amount;
    }

    format_pr(value, precision) {
        var decimals =
            precision > 0
                ? Math.max(0, Math.ceil(Math.log(1.0 / precision) / Math.log(10)))
                : 0;
        return value.toFixed(decimals);
    }

    round_decimals_currency(value) {
        const decimals = this.currency.decimals;
        return parseFloat(round_di(value, decimals).toFixed(decimals));
    }

    /**
     * (value = 1.0000, decimals = 2) => '1'
     * (value = 1.1234, decimals = 2) => '1.12'
     * @param {number} value amount to format
     */
    formatFixed(value) {
        const currency = this.currency || { decimals: 2 };
        return `${Number(value.toFixed(currency.decimals || 0))}`;
    }

    disallowLineQuantityChange() {
        return false;
    }

    getCurrencySymbol() {
        return this.currency ? this.currency.symbol : '$';
    }
    /**
     * Make the products corresponding to the given ids to be available_in_pos and
     * fetch them to be added on the loaded products.
     */
    async _addProducts(ids){
        await this.rpc({
            model: 'product.product',
            method: 'write',
            args: [ids, {'available_in_pos': true}],
            context: this.session.user_context,
        });
        let product_model = _.find(this.models, (model) => model.model === 'product.product');
        let product = await this.rpc({
            model: 'product.product',
            method: 'read',
            args: [ids, product_model.fields],
            context: { ...this.session.user_context, ...product_model.context() },
        });
        product_model.loaded(this, product);
    }
    htmlToImgLetterRendering() {
        return false;
    }
}
PosGlobalState.prototype.electronic_payment_interfaces = {};
PosGlobalState.prototype.models = [
    {
        label:  'version',
        loaded: function (self) {
            return self.session.rpc('/web/webclient/version_info',{}).then(function (version) {
                self.version = version;
            });
        },

    },{
        model:  'res.company',
        loaded: function(self,companies){ self.company = companies[0]; },
    },{
        model:  'decimal.precision',
        loaded: function(self,dps){
            self.dp  = {};
            for (var i = 0; i < dps.length; i++) {
                self.dp[dps[i].name] = dps[i].digits;
            }
        },
    },{
        model:  'uom.uom',
        loaded: function(self,units){
            self.units = units;
            _.each(units, function(unit){
                self.units_by_id[unit.id] = unit;
            });
        }
    },{
        model:  'res.country.state',
        loaded: function(self,states){
            self.states = states;
        },
    },{
        model:  'res.country',
        loaded: function(self,countries){
            self.countries = countries;
            self.company.country = null;
            for (var i = 0; i < countries.length; i++) {
                if (countries[i].id === self.company.country_id[0]){
                    self.company.country = countries[i];
                }
            }
        },
    },{
        model:  'res.lang',
        loaded: function (self, langs){
            self.langs = langs;
        },
    },{
        model:  'account.tax',
        domain: function(self) {return [['company_id', '=', self.company && self.company.id || false]]},
        loaded: function(self, taxes){
            self.taxes = taxes;
            self.taxes_by_id = {};
            _.each(taxes, function(tax){
                self.taxes_by_id[tax.id] = tax;
            });
            _.each(self.taxes_by_id, function(tax) {
                tax.children_tax_ids = _.map(tax.children_tax_ids, function (child_tax_id) {
                    return self.taxes_by_id[child_tax_id];
                });
            });
        },
    },{
        model:  'pos.session',
        loaded: function(self, pos_sessions, tmp){
            self.pos_session = pos_sessions[0];
            self.pos_session.login_number = odoo.login_number;
            self.config_id = self.config_id || self.pos_session && self.pos_session.config_id[0];
        },
    },{
        model: 'pos.config',
        loaded: function(self,configs){
            self.config = configs[0];
            self.config.use_proxy = self.config.is_posbox && (
                                    self.config.iface_electronic_scale ||
                                    self.config.iface_print_via_proxy  ||
                                    self.config.iface_scan_via_proxy   ||
                                    self.config.iface_customer_facing_display_via_proxy);

            self.db.set_uuid(self.config.uuid);
            self.set_cashier(self.get_cashier());
            // We need to do it here, since only then the local storage has the correct uuid
            self.db.save('pos_session_id', self.pos_session.id);

            var orders = self.db.get_orders();
            for (var i = 0; i < orders.length; i++) {
                self.pos_session.sequence_number = Math.max(self.pos_session.sequence_number, orders[i].data.sequence_number+1);
            }
       },
    },{
        model: 'pos.bill',
        loaded: function (self, bills) {
            self.bills = bills;
        },
      }, {
        model:  'res.partner',
        label: 'load_partners',
        loaded: function(self,partners){
            self.partners = partners;
            self.db.add_partners(partners);
        },
    },{
      model: 'stock.picking.type',
      loaded: function(self, picking_type) {
          self.picking_type = picking_type[0];
      },
    },{
        model:  'res.users',
        loaded: function(self,users){
            users.forEach(function(user) {
                user.role = 'cashier';
                user.groups_id.some(function(group_id) {
                    if (group_id === self.config.group_pos_manager_id[0]) {
                        user.role = 'manager';
                        return true;
                    }
                });
                if (user.id === self.session.uid) {
                    self.user = user;
                    self.employee.name = user.name;
                    self.employee.role = user.role;
                    self.employee.user_id = [user.id, user.name];
                }
            });
            self.users = users;
            self.employees = [self.employee];
            self.set_cashier(self.employee);
        },
    },{
        model:  'product.pricelist',
        loaded: function(self, pricelists){
            _.map(pricelists, function (pricelist) { pricelist.items = []; });
            self.default_pricelist = _.findWhere(pricelists, {id: self.config.pricelist_id[0]});
            self.pricelists = pricelists;
        },
    },{
        model:  'account.bank.statement',
        loaded: function(self, statement){
            self.bank_statement = statement[0];
        },
    },{
        model:  'product.pricelist.item',
        loaded: function(self, pricelist_items){
            var pricelist_by_id = {};
            _.each(self.pricelists, function (pricelist) {
                pricelist_by_id[pricelist.id] = pricelist;
            });

            _.each(pricelist_items, function (item) {
                var pricelist = pricelist_by_id[item.pricelist_id[0]];
                pricelist.items.push(item);
                item.base_pricelist = pricelist_by_id[item.base_pricelist_id[0]];
            });
        },
    },{
        model:  'product.category',
        loaded: function(self, product_categories){
            var category_by_id = {};
            _.each(product_categories, function (category) {
                category_by_id[category.id] = category;
            });
            _.each(product_categories, function (category) {
                category.parent = category_by_id[category.parent_id[0]];
            });

            self.product_categories = product_categories;
        },
    },{
        model: 'res.currency',
        loaded: function(self, currencies){
            self.currency = currencies[0];
            if (self.currency.rounding > 0 && self.currency.rounding < 1) {
                self.currency.decimals = Math.ceil(Math.log(1.0 / self.currency.rounding) / Math.log(10));
            } else {
                self.currency.decimals = 0;
            }

            self.company_currency = currencies[1] || currencies[0];
        },
    },{
        model:  'pos.category',
        loaded: function(self, categories){
            self.db.add_categories(categories);
        },
    },{
        model:  'product.product',
        label: 'load_products',
        loaded: function(self, products){
            var using_company_currency = self.config.currency_id[0] === self.company.currency_id[0];
            var conversion_rate = self.currency.rate / self.company_currency.rate;
            self.db.add_products(_.map(products, function (product) {
                if (!using_company_currency) {
                    product.lst_price = round_pr(product.lst_price * conversion_rate, self.currency.rounding);
                }
                product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                product.pos = self;
                return new (PosModelRegistry.get(Product))(product);
            }));
        },
    },{
        model: 'product.packaging',
        loaded: function(self, product_packagings) {
            self.db.add_packagings(product_packagings);
        }
    },{
        model: 'product.attribute',
        condition: function (self) { return self.config.product_configurator; },
        loaded: function(self, product_attributes, tmp) {
            tmp.product_attributes_by_id = {};
            _.map(product_attributes, function (product_attribute) {
                tmp.product_attributes_by_id[product_attribute.id] = product_attribute;
            });
        }
    },{
        model: 'product.attribute.value',
        condition: function (self) { return self.config.product_configurator; },
        loaded: function(self, pavs, tmp) {
            tmp.pav_by_id = {};
            _.map(pavs, function (pav) {
                tmp.pav_by_id[pav.id] = pav;
            });
        }
    }, {
        model: 'product.template.attribute.value',
        condition: function (self) { return self.config.product_configurator; },
        loaded: function(self, ptavs, tmp) {
            self.attributes_by_ptal_id = {};
            _.map(ptavs, function (ptav) {
                if (!self.attributes_by_ptal_id[ptav.attribute_line_id[0]]){
                    self.attributes_by_ptal_id[ptav.attribute_line_id[0]] = {
                        id: ptav.attribute_line_id[0],
                        name: tmp.product_attributes_by_id[ptav.attribute_id[0]].name,
                        display_type: tmp.product_attributes_by_id[ptav.attribute_id[0]].display_type,
                        values: [],
                    };
                }
                self.attributes_by_ptal_id[ptav.attribute_line_id[0]].values.push({
                    id: ptav.product_attribute_value_id[0],
                    name: tmp.pav_by_id[ptav.product_attribute_value_id[0]].name,
                    is_custom: tmp.pav_by_id[ptav.product_attribute_value_id[0]].is_custom,
                    html_color: tmp.pav_by_id[ptav.product_attribute_value_id[0]].html_color,
                    price_extra: ptav.price_extra,
                });
            });
        }
    },{
        model: 'account.cash.rounding',
        loaded: function(self, cash_rounding) {
            self.cash_rounding = cash_rounding;
        }
    },{
        model:  'pos.payment.method',
        loaded: function(self, payment_methods) {
            self.payment_methods = payment_methods.sort(function(a,b){
                // prefer cash payment_method to be first in the list
                if (a.is_cash_count && !b.is_cash_count) {
                    return -1;
                } else if (!a.is_cash_count && b.is_cash_count) {
                    return 1;
                } else {
                    return a.id - b.id;
                }
            });
            self.payment_methods_by_id = {};
            _.each(self.payment_methods, function(payment_method) {
                self.payment_methods_by_id[payment_method.id] = payment_method;

                var PaymentInterface = self.electronic_payment_interfaces[payment_method.use_payment_terminal];
                if (PaymentInterface) {
                    payment_method.payment_terminal = new PaymentInterface(self, payment_method);
                }
            });
        }
    },{
        model:  'account.fiscal.position',
        loaded: function(self, fiscal_positions){
            self.fiscal_positions = fiscal_positions;
        }
    }, {
        model:  'account.fiscal.position.tax',
        loaded: function(self, fiscal_position_taxes){
            self.fiscal_position_taxes = fiscal_position_taxes;
            self.fiscal_positions.forEach(function (fiscal_position) {
                fiscal_position.fiscal_position_taxes_by_id = {};
                fiscal_position.tax_ids.forEach(function (tax_id) {
                    var fiscal_position_tax = _.find(fiscal_position_taxes, function (fiscal_position_tax) {
                        return fiscal_position_tax.id === tax_id;
                    });

                    fiscal_position.fiscal_position_taxes_by_id[fiscal_position_tax.id] = fiscal_position_tax;
                });
            });
        }
    },  {
        label: 'fonts',
        loaded: function(){
            return new Promise(function (resolve, reject) {
                // Waiting for fonts to be loaded to prevent receipt printing
                // from printing empty receipt while loading Inconsolata
                // ( The font used for the receipt )
                waitForWebfonts(['Lato','Inconsolata'], function () {
                    resolve();
                });
                // The JS used to detect font loading is not 100% robust, so
                // do not wait more than 5sec
                setTimeout(resolve, 5000);
            });
        },
    },{
        label: 'pictures',
        loaded: function (self) {
            self.company_logo = new Image();
            return new Promise(function (resolve, reject) {
                self.company_logo.onload = function () {
                    var img = self.company_logo;
                    var ratio = 1;
                    var targetwidth = 300;
                    var maxheight = 150;
                    if( img.width !== targetwidth ){
                        ratio = targetwidth / img.width;
                    }
                    if( img.height * ratio > maxheight ){
                        ratio = maxheight / img.height;
                    }
                    var width  = Math.floor(img.width * ratio);
                    var height = Math.floor(img.height * ratio);
                    var c = document.createElement('canvas');
                    c.width  = width;
                    c.height = height;
                    var ctx = c.getContext('2d');
                    ctx.drawImage(self.company_logo,0,0, width, height);

                    self.company_logo_base64 = c.toDataURL();
                    resolve();
                };
                self.company_logo.onerror = function () {
                    reject();
                };
                self.company_logo.crossOrigin = "anonymous";
                self.company_logo.src = '/web/binary/company_logo' + '?dbname=' + self.session.db + '&company=' + self.company.id + '&_' + Math.random();
            });
        },
    }, {
        label: 'barcodes',
        loaded: function(self) {
            var barcode_parser = new BarcodeParser({'nomenclature_id': self.config.barcode_nomenclature_id});
            self.barcode_reader.set_barcode_parser(barcode_parser);
            return barcode_parser.is_loaded();
        },
    },
];

PosModelRegistry.add(PosGlobalState);

/**
 * Call this function to map your PaymentInterface implementation to
 * the use_payment_terminal field. When the POS loads it will take
 * care of instantiating your interface and setting it on the right
 * payment methods.
 *
 * @param {string} use_payment_terminal - value used in the
 * use_payment_terminal selection field
 *
 * @param {Object} ImplementedPaymentInterface - implemented
 * PaymentInterface
 */
function register_payment_method(use_payment_terminal, ImplementedPaymentInterface) {
    PosGlobalState.prototype.electronic_payment_interfaces[use_payment_terminal] = ImplementedPaymentInterface;
};

// Add fields to the list of read fields when a model is loaded
// by the point of sale.
// e.g: module.load_fields("product.product",['price','category'])

function load_fields(model_name, fields) {
    if (!(fields instanceof Array)) {
        fields = [fields];
    }

    var models = PosGlobalState.prototype.models;
    for (var i = 0; i < models.length; i++) {
        var model = models[i];
        if (model.model === model_name) {
            // if 'fields' is empty all fields are loaded, so we do not need
            // to modify the array
            if ((model.fields instanceof Array) && model.fields.length > 0) {
                model.fields = model.fields.concat(fields || []);
            }
        }
    }
};

// Loads openerp models at the point of sale startup.
// load_models take an array of model loader declarations.
// - The models will be loaded in the array order.
// - If no openerp model name is provided, no server data
//   will be loaded, but the system can be used to preprocess
//   data before load.
// - loader arguments can be functions that return a dynamic
//   value. The function takes the PosGlobalState as the first argument
//   and a temporary object that is shared by all models, and can
//   be used to store transient information between model loads.
// - There is no dependency management. The models must be loaded
//   in the right order. Newly added models are loaded at the end
//   but the after / before options can be used to load directly
//   before / after another model.
//
// models: [{
//  model: [string] the name of the openerp model to load.
//  label: [string] The label displayed during load.
//  fields: [[string]|function] the list of fields to be loaded.
//          Empty Array / Null loads all fields.
//  order:  [[string]|function] the models will be ordered by
//          the provided fields
//  domain: [domain|function] the domain that determines what
//          models need to be loaded. Null loads everything
//  ids:    [[id]|function] the id list of the models that must
//          be loaded. Overrides domain.
//  context: [Dict|function] the openerp context for the model read
//  condition: [function] do not load the models if it evaluates to
//             false.
//  loaded: [function(self,model)] this function is called once the
//          models have been loaded, with the data as second argument
//          if the function returns a promise, the next model will
//          wait until it resolves before loading.
// }]
//
// options:
//   before: [string] The model will be loaded before the named models
//           (applies to both model name and label)
//   after:  [string] The model will be loaded after the (last loaded)
//           named model. (applies to both model name and label)
//
function load_models(models,options) {
    options = options || {};
    if (!(models instanceof Array)) {
        models = [models];
    }

    var pmodels = PosGlobalState.prototype.models;
    var index = pmodels.length;
    if (options.before) {
        for (var i = 0; i < pmodels.length; i++) {
            if (    pmodels[i].model === options.before ||
                    pmodels[i].label === options.before ){
                index = i;
                break;
            }
        }
    } else if (options.after) {
        for (var i = 0; i < pmodels.length; i++) {
            if (    pmodels[i].model === options.after ||
                    pmodels[i].label === options.after ){
                index = i + 1;
            }
        }
    }
    pmodels.splice.apply(pmodels,[index,0].concat(models));
};

class Product extends PosModel {
    isAllowOnlyOneLot() {
        const productUnit = this.get_unit();
        return this.tracking === 'lot' || !productUnit || !productUnit.is_pos_groupable;
    }
    get_unit() {
        var unit_id = this.uom_id;
        if(!unit_id){
            return undefined;
        }
        unit_id = unit_id[0];
        if(!this.pos){
            return undefined;
        }
        return this.pos.units_by_id[unit_id];
    }
    // Port of get_product_price on product.pricelist.
    //
    // Anything related to UOM can be ignored, the POS will always use
    // the default UOM set on the product and the user cannot change
    // it.
    //
    // Pricelist items do not have to be sorted. All
    // product.pricelist.item records are loaded with a search_read
    // and were automatically sorted based on their _order by the
    // ORM. After that they are added in this order to the pricelists.
    get_price(pricelist, quantity, price_extra){
        var self = this;
        var date = moment().startOf('day');

        // In case of nested pricelists, it is necessary that all pricelists are made available in
        // the POS. Display a basic alert to the user in this case.
        if (pricelist === undefined) {
            alert(_t(
                'An error occurred when loading product prices. ' +
                'Make sure all pricelists are available in the POS.'
            ));
        }

        var category_ids = [];
        var category = this.categ;
        while (category) {
            category_ids.push(category.id);
            category = category.parent;
        }

        var pricelist_items = _.filter(pricelist.items, function (item) {
            return (! item.product_tmpl_id || item.product_tmpl_id[0] === self.product_tmpl_id) &&
                   (! item.product_id || item.product_id[0] === self.id) &&
                   (! item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
                   (! item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                   (! item.date_end || moment(item.date_end).isSameOrAfter(date));
        });

        var price = self.lst_price;
        if (price_extra){
            price += price_extra;
        }
        _.find(pricelist_items, function (rule) {
            if (rule.min_quantity && quantity < rule.min_quantity) {
                return false;
            }

            if (rule.base === 'pricelist') {
                price = self.get_price(rule.base_pricelist, quantity);
            } else if (rule.base === 'standard_price') {
                price = self.standard_price;
            }

            if (rule.compute_price === 'fixed') {
                price = rule.fixed_price;
                return true;
            } else if (rule.compute_price === 'percentage') {
                price = price - (price * (rule.percent_price / 100));
                return true;
            } else {
                var price_limit = price;
                price = price - (price * (rule.price_discount / 100));
                if (rule.price_round) {
                    price = round_pr(price, rule.price_round);
                }
                if (rule.price_surcharge) {
                    price += rule.price_surcharge;
                }
                if (rule.price_min_margin) {
                    price = Math.max(price, price_limit + rule.price_min_margin);
                }
                if (rule.price_max_margin) {
                    price = Math.min(price, price_limit + rule.price_max_margin);
                }
                return true;
            }

            return false;
        });

        // This return value has to be rounded with round_di before
        // being used further. Note that this cannot happen here,
        // because it would cause inconsistencies with the backend for
        // pricelist that have base == 'pricelist'.
        return price;
    }
}
PosModelRegistry.add(Product);

var orderline_id = 1;

// An orderline represent one element of the content of a client's shopping cart.
// An orderline contains a product, its quantity, its price, discount. etc.
// An Order contains zero or more Orderlines.
class Orderline extends PosModel {
    constructor(obj, options) {
        super(obj);
        this.pos   = options.pos;
        this.order = options.order;
        if (options.json) {
            try {
                this.init_from_JSON(options.json);
            } catch(error) {
                console.error('ERROR: attempting to recover product ID', options.json.product_id,
                    'not available in the point of sale. Correct the product or clean the browser cache.');
            }
            return;
        }
        this.product = options.product;
        this.set_product_lot(this.product);
        this.set_quantity(1);
        this.discount = 0;
        this.discountStr = '0';
        this.selected = false;
        this.description = '';
        this.price_extra = 0;
        this.full_product_name = '';
        this.id = orderline_id++;
        this.price_manually_set = false;
        this.customerNote = this.customerNote || '';

        if (options.price) {
            this.set_unit_price(options.price);
        } else {
            this.set_unit_price(this.product.get_price(this.order.pricelist, this.get_quantity()));
        }
    }
    init_from_JSON(json) {
        this.product = this.pos.db.get_product_by_id(json.product_id);
        this.set_product_lot(this.product);
        this.price = json.price_unit;
        this.set_discount(json.discount);
        this.set_quantity(json.qty, 'do not recompute unit price');
        this.set_description(json.description);
        this.set_price_extra(json.price_extra);
        this.set_full_product_name(json.full_product_name);
        this.id = json.id ? json.id : orderline_id++;
        orderline_id = Math.max(this.id+1,orderline_id);
        var pack_lot_lines = json.pack_lot_ids;
        for (var i = 0; i < pack_lot_lines.length; i++) {
            var packlotline = pack_lot_lines[i][2];
            var pack_lot_line = new (PosModelRegistry.get(Packlotline))({}, {'json': _.extend(packlotline, {'order_line':this})});
            this.pack_lot_lines.add(pack_lot_line);
        }
        this.tax_ids = json.tax_ids && json.tax_ids.length !== 0 ? json.tax_ids[0][2] : undefined;
        this.set_customer_note(json.customer_note);
        this.refunded_qty = json.refunded_qty;
        this.refunded_orderline_id = json.refunded_orderline_id;
    }
    clone(){
        var orderline = new (PosModelRegistry.get(Orderline))({},{
            pos: this.pos,
            order: this.order,
            product: this.product,
            price: this.price,
        });
        orderline.order = null;
        orderline.quantity = this.quantity;
        orderline.quantityStr = this.quantityStr;
        orderline.discount = this.discount;
        orderline.price = this.price;
        orderline.selected = false;
        orderline.price_manually_set = this.price_manually_set;
        orderline.customerNote = this.customerNote;
        return orderline;
    }
    getPackLotLinesToEdit(isAllowOnlyOneLot) {
        const currentPackLotLines = this.pack_lot_lines;
        let nExtraLines = Math.abs(this.quantity) - currentPackLotLines.length;
        nExtraLines = nExtraLines > 0 ? nExtraLines : 1;
        const tempLines = currentPackLotLines
            .map(lotLine => ({
                id: lotLine.cid,
                text: lotLine.lot_name,
            }))
            .concat(
                Array.from(Array(nExtraLines)).map(_ => ({
                    text: '',
                }))
            );
        return isAllowOnlyOneLot ? [tempLines[0]] : tempLines;
    }
    /**
     * @param { modifiedPackLotLines, newPackLotLines }
     *    @param {Object} modifiedPackLotLines key-value pair of String (the cid) & String (the new lot_name)
     *    @param {Array} newPackLotLines array of { lot_name: String }
     */
    setPackLotLines({ modifiedPackLotLines, newPackLotLines }) {
        // Set the new values for modified lot lines.
        let lotLinesToRemove = [];
        for (let lotLine of this.pack_lot_lines) {
            const modifiedLotName = modifiedPackLotLines[lotLine.cid];
            if (modifiedLotName) {
                lotLine.lot_name = modifiedLotName;
            } else {
                // We should not call lotLine.remove() here because
                // we don't want to mutate the array while looping thru it.
                lotLinesToRemove.push(lotLine);
            }
        }

        // Remove those that needed to be removed.
        for (let lotLine of lotLinesToRemove) {
            this.pack_lot_lines.remove(lotLine);
        }

        // Create new pack lot lines.
        let newPackLotLine;
        for (let newLotLine of newPackLotLines) {
            newPackLotLine = new (PosModelRegistry.get(Packlotline))({}, { order_line: this });
            newPackLotLine.lot_name = newLotLine.lot_name;
            this.pack_lot_lines.add(newPackLotLine);
        }

        // Set the quantity of the line based on number of pack lots.
        this.set_quantity_by_lot();
    }
    set_product_lot(product){
        this.has_product_lot = product.tracking !== 'none';
        this.pack_lot_lines  = this.has_product_lot && new PosCollection();
    }
    // sets a discount [0,100]%
    set_discount(discount){
        var parsed_discount = isNaN(parseFloat(discount)) ? 0 : field_utils.parse.float('' + discount);
        var disc = Math.min(Math.max(parsed_discount || 0, 0),100);
        this.discount = disc;
        this.discountStr = '' + disc;
    }
    // returns the discount [0,100]%
    get_discount(){
        return this.discount;
    }
    get_discount_str(){
        return this.discountStr;
    }
    set_description(description){
        this.description = description || '';
    }
    set_price_extra(price_extra){
        this.price_extra = parseFloat(price_extra) || 0.0;
    }
    set_full_product_name(full_product_name){
        this.full_product_name = full_product_name || '';
    }
    get_price_extra () {
        return this.price_extra;
    }
    // sets the quantity of the product. The quantity will be rounded according to the
    // product's unity of measure properties. Quantities greater than zero will not get
    // rounded to zero
    // Return true if successfully set the quantity, otherwise, return false.
    set_quantity(quantity, keep_price){
        this.order.assert_editable();
        if(quantity === 'remove'){
            if (this.refunded_orderline_id in this.pos.toRefundLines) {
                delete this.pos.toRefundLines[this.refunded_orderline_id];
            }
            this.order.remove_orderline(this);
            return true;
        }else{
            var quant = typeof(quantity) === 'number' ? quantity : (field_utils.parse.float('' + quantity) || 0);
            if (this.refunded_orderline_id in this.pos.toRefundLines) {
                const toRefundDetail = this.pos.toRefundLines[this.refunded_orderline_id];
                const maxQtyToRefund = toRefundDetail.orderline.qty - toRefundDetail.orderline.refundedQty
                if (quant > 0) {
                    Gui.showPopup('ErrorPopup', {
                        title: _t('Positive quantity not allowed'),
                        body: _t('Only a negative quantity is allowed for this refund line. Click on +/- to modify the quantity to be refunded.')
                    });
                    return false;
                } else if (quant == 0) {
                    toRefundDetail.qty = 0;
                } else if (-quant <= maxQtyToRefund) {
                    toRefundDetail.qty = -quant;
                } else {
                    Gui.showPopup('ErrorPopup', {
                        title: _t('Greater than allowed'),
                        body: _.str.sprintf(
                            _t('The requested quantity to be refunded is higher than the refundable quantity of %s.'),
                            this.pos.formatProductQty(maxQtyToRefund)
                        ),
                    });
                    return false;
                }
            }
            var unit = this.get_unit();
            if(unit){
                if (unit.rounding) {
                    var decimals = this.pos.dp['Product Unit of Measure'];
                    var rounding = Math.max(unit.rounding, Math.pow(10, -decimals));
                    this.quantity    = round_pr(quant, rounding);
                    this.quantityStr = field_utils.format.float(this.quantity, {digits: [69, decimals]});
                } else {
                    this.quantity    = round_pr(quant, 1);
                    this.quantityStr = this.quantity.toFixed(0);
                }
            }else{
                this.quantity    = quant;
                this.quantityStr = '' + this.quantity;
            }
        }

        // just like in sale.order changing the quantity will recompute the unit price
        if(! keep_price && ! this.price_manually_set){
            this.set_unit_price(this.product.get_price(this.order.pricelist, this.get_quantity(), this.get_price_extra()));
            this.order.fix_tax_included_price(this);
        }
        return true;
    }
    // return the quantity of product
    get_quantity(){
        return this.quantity;
    }
    get_quantity_str(){
        return this.quantityStr;
    }
    get_quantity_str_with_unit(){
        var unit = this.get_unit();
        if(unit && !unit.is_pos_groupable){
            return this.quantityStr + ' ' + unit.name;
        }else{
            return this.quantityStr;
        }
    }

    get_lot_lines() {
        return this.pack_lot_lines && this.pack_lot_lines;
    }

    get_required_number_of_lots(){
        var lots_required = 1;

        if (this.product.tracking == 'serial') {
            lots_required = Math.abs(this.quantity);
        }

        return lots_required;
    }

    get_valid_lots(){
        return this.pack_lot_lines.filter((item) => {
            return item.lot_name;
        });
    }

    set_quantity_by_lot() {
        var valid_lots_quantity = this.get_valid_lots().length;
        if (this.quantity < 0){
            valid_lots_quantity = -valid_lots_quantity;
        }
        this.set_quantity(valid_lots_quantity);
    }

    has_valid_product_lot(){
        if(!this.has_product_lot){
            return true;
        }
        var valid_product_lot = this.get_valid_lots();
        return this.get_required_number_of_lots() === valid_product_lot.length;
    }

    // return the unit of measure of the product
    get_unit(){
        return this.product.get_unit();
    }
    // return the product of this orderline
    get_product(){
        return this.product;
    }
    get_full_product_name () {
        if (this.full_product_name) {
            return this.full_product_name
        }
        var full_name = this.product.display_name;
        if (this.description) {
            full_name += ` (${this.description})`;
        }
        return full_name;
    }
    // selects or deselects this orderline
    set_selected(selected){
        this.selected = selected;
        // this trigger also triggers the change event of the collection.
    }
    // returns true if this orderline is selected
    is_selected(){
        return this.selected;
    }
    // when we add an new orderline we want to merge it with the last line to see reduce the number of items
    // in the orderline. This returns true if it makes sense to merge the two
    can_be_merged_with(orderline){
        var price = parseFloat(round_di(this.price || 0, this.pos.dp['Product Price']).toFixed(this.pos.dp['Product Price']));
        var order_line_price = orderline.get_product().get_price(orderline.order.pricelist, this.get_quantity());
        order_line_price = orderline.compute_fixed_price(order_line_price);
        if( this.get_product().id !== orderline.get_product().id){    //only orderline of the same product can be merged
            return false;
        }else if(!this.get_unit() || !this.get_unit().is_pos_groupable){
            return false;
        }else if(this.get_discount() > 0){             // we don't merge discounted orderlines
            return false;
        }else if(!utils.float_is_zero(price - order_line_price - orderline.get_price_extra(),
                    this.pos.currency.decimals)){
            return false;
        }else if(this.product.tracking == 'lot' && (this.pos.picking_type.use_create_lots || this.pos.picking_type.use_existing_lots)) {
            return false;
        }else if (this.description !== orderline.description) {
            return false;
        }else if (orderline.get_customer_note() !== this.get_customer_note()) {
            return false;
        } else if (this.refunded_orderline_id) {
            return false;
        }else{
            return true;
        }
    }
    merge(orderline){
        this.order.assert_editable();
        this.set_quantity(this.get_quantity() + orderline.get_quantity());
    }
    export_as_JSON() {
        var pack_lot_ids = [];
        if (this.has_product_lot){
            this.pack_lot_lines.forEach(item => {
                return pack_lot_ids.push([0, 0, item.export_as_JSON()]);
            });
        }
        return {
            qty: this.get_quantity(),
            price_unit: this.get_unit_price(),
            price_subtotal: this.get_price_without_tax(),
            price_subtotal_incl: this.get_price_with_tax(),
            discount: this.get_discount(),
            product_id: this.get_product().id,
            tax_ids: [[6, false, _.map(this.get_applicable_taxes(), function(tax){ return tax.id; })]],
            id: this.id,
            pack_lot_ids: pack_lot_ids,
            description: this.description,
            full_product_name: this.get_full_product_name(),
            price_extra: this.get_price_extra(),
            customer_note: this.get_customer_note(),
            refunded_orderline_id: this.refunded_orderline_id
        };
    }
    //used to create a json of the ticket, to be sent to the printer
    export_for_printing(){
        return {
            id: this.id,
            quantity:           this.get_quantity(),
            unit_name:          this.get_unit().name,
            is_in_unit:         this.get_unit().id == this.pos.uom_unit_id,
            price:              this.get_unit_display_price(),
            discount:           this.get_discount(),
            product_name:       this.get_product().display_name,
            product_name_wrapped: this.generate_wrapped_product_name(),
            price_lst:          this.get_lst_price(),
            display_discount_policy:    this.display_discount_policy(),
            price_display_one:  this.get_display_price_one(),
            price_display :     this.get_display_price(),
            price_with_tax :    this.get_price_with_tax(),
            price_without_tax:  this.get_price_without_tax(),
            price_with_tax_before_discount:  this.get_price_with_tax_before_discount(),
            tax:                this.get_tax(),
            product_description:      this.get_product().description,
            product_description_sale: this.get_product().description_sale,
            pack_lot_lines:      this.get_lot_lines(),
            customer_note:      this.get_customer_note(),
        };
    }
    generate_wrapped_product_name() {
        var MAX_LENGTH = 24; // 40 * line ratio of .6
        var wrapped = [];
        var name = this.get_full_product_name();
        var current_line = "";

        while (name.length > 0) {
            var space_index = name.indexOf(" ");

            if (space_index === -1) {
                space_index = name.length;
            }

            if (current_line.length + space_index > MAX_LENGTH) {
                if (current_line.length) {
                    wrapped.push(current_line);
                }
                current_line = "";
            }

            current_line += name.slice(0, space_index + 1);
            name = name.slice(space_index + 1);
        }

        if (current_line.length) {
            wrapped.push(current_line);
        }

        return wrapped;
    }
    // changes the base price of the product for this orderline
    set_unit_price(price){
        this.order.assert_editable();
        var parsed_price = !isNaN(price) ?
            price :
            isNaN(parseFloat(price)) ? 0 : field_utils.parse.float('' + price)
        this.price = round_di(parsed_price || 0, this.pos.dp['Product Price']);
    }
    get_unit_price(){
        var digits = this.pos.dp['Product Price'];
        // round and truncate to mimic _symbol_set behavior
        return parseFloat(round_di(this.price || 0, digits).toFixed(digits));
    }
    get_unit_display_price(){
        if (this.pos.config.iface_tax_included === 'total') {
            var quantity = this.quantity;
            this.quantity = 1.0;
            var price = this.get_all_prices().priceWithTax;
            this.quantity = quantity;
            return price;
        } else {
            return this.get_unit_price();
        }
    }
    get_base_price(){
        var rounding = this.pos.currency.rounding;
        return round_pr(this.get_unit_price() * this.get_quantity() * (1 - this.get_discount()/100), rounding);
    }
    get_display_price_one(){
        var rounding = this.pos.currency.rounding;
        var price_unit = this.get_unit_price();
        if (this.pos.config.iface_tax_included !== 'total') {
            return round_pr(price_unit * (1.0 - (this.get_discount() / 100.0)), rounding);
        } else {
            var product =  this.get_product();
            var taxes_ids = this.tax_ids || product.taxes_id;
            var taxes =  this.pos.taxes;
            var product_taxes = [];

            _(taxes_ids).each(function(el){
                product_taxes.push(_.detect(taxes, function(t){
                    return t.id === el;
                }));
            });

            var all_taxes = this.compute_all(product_taxes, price_unit, 1, this.pos.currency.rounding);

            return round_pr(all_taxes.total_included * (1 - this.get_discount()/100), rounding);
        }
    }
    get_display_price(){
        if (this.pos.config.iface_tax_included === 'total') {
            return this.get_price_with_tax();
        } else {
            return this.get_base_price();
        }
    }
    get_price_without_tax(){
        return this.get_all_prices().priceWithoutTax;
    }
    get_price_with_tax(){
        return this.get_all_prices().priceWithTax;
    }
    get_price_with_tax_before_discount () {
        return this.get_all_prices().priceWithTaxBeforeDiscount;
    }
    get_tax(){
        return this.get_all_prices().tax;
    }
    get_applicable_taxes(){
        var i;
        // Shenaningans because we need
        // to keep the taxes ordering.
        var ptaxes_ids = this.tax_ids || this.get_product().taxes_id;
        var ptaxes_set = {};
        for (i = 0; i < ptaxes_ids.length; i++) {
            ptaxes_set[ptaxes_ids[i]] = true;
        }
        var taxes = [];
        for (i = 0; i < this.pos.taxes.length; i++) {
            if (ptaxes_set[this.pos.taxes[i].id]) {
                taxes.push(this.pos.taxes[i]);
            }
        }
        return taxes;
    }
    get_tax_details(){
        return this.get_all_prices().taxDetails;
    }
    get_taxes(){
        var taxes_ids = this.tax_ids || this.get_product().taxes_id;
        var taxes = [];
        for (var i = 0; i < taxes_ids.length; i++) {
            if (this.pos.taxes_by_id[taxes_ids[i]]) {
                taxes.push(this.pos.taxes_by_id[taxes_ids[i]]);
            }
        }
        return taxes;
    }
    _map_tax_fiscal_position(tax, order = false) {
        var self = this;
        var current_order = order || this.pos.get_order();
        var order_fiscal_position = current_order && current_order.fiscal_position;
        var taxes = [];

        if (order_fiscal_position) {
            var tax_mappings = _.filter(order_fiscal_position.fiscal_position_taxes_by_id, function (fiscal_position_tax) {
                return fiscal_position_tax.tax_src_id[0] === tax.id;
            });

            if (tax_mappings && tax_mappings.length) {
                _.each(tax_mappings, function(tm) {
                    if (tm.tax_dest_id) {
                        taxes.push(self.pos.taxes_by_id[tm.tax_dest_id[0]]);
                    }
                });
            } else{
                taxes.push(tax);
            }
        } else {
            taxes.push(tax);
        }

        return taxes;
    }
    /**
     * Mirror JS method of:
     * _compute_amount in addons/account/models/account.py
     */
    _compute_all(tax, base_amount, quantity, price_exclude) {
        if(price_exclude === undefined)
            var price_include = tax.price_include;
        else
            var price_include = !price_exclude;
        if (tax.amount_type === 'fixed') {
            // Use sign on base_amount and abs on quantity to take into account the sign of the base amount,
            // which includes the sign of the quantity and the sign of the price_unit
            // Amount is the fixed price for the tax, it can be negative
            // Base amount included the sign of the quantity and the sign of the unit price and when
            // a product is returned, it can be done either by changing the sign of quantity or by changing the
            // sign of the price unit.
            // When the price unit is equal to 0, the sign of the quantity is absorbed in base_amount then
            // a "else" case is needed.
            if (base_amount)
                return Math.sign(base_amount) * Math.abs(quantity) * tax.amount;
            else
                return quantity * tax.amount;
        }
        if (tax.amount_type === 'percent' && !price_include){
            return base_amount * tax.amount / 100;
        }
        if (tax.amount_type === 'percent' && price_include){
            return base_amount - (base_amount / (1 + tax.amount / 100));
        }
        if (tax.amount_type === 'division' && !price_include) {
            return base_amount / (1 - tax.amount / 100) - base_amount;
        }
        if (tax.amount_type === 'division' && price_include) {
            return base_amount - (base_amount * (tax.amount / 100));
        }
        return false;
    }
    /**
     * Mirror JS method of:
     * compute_all in addons/account/models/account.py
     *
     * Read comments in the python side method for more details about each sub-methods.
     */
    compute_all(taxes, price_unit, quantity, currency_rounding, handle_price_include=true) {
        var self = this;

        // 1) Flatten the taxes.

        var _collect_taxes = function(taxes, all_taxes){
            taxes.sort(function (tax1, tax2) {
                return tax1.sequence - tax2.sequence;
            });
            _(taxes).each(function(tax){
                if(tax.amount_type === 'group')
                    all_taxes = _collect_taxes(tax.children_tax_ids, all_taxes);
                else
                    all_taxes.push(tax);
            });
            return all_taxes;
        }
        var collect_taxes = function(taxes){
            return _collect_taxes(taxes, []);
        }

        taxes = collect_taxes(taxes);

        // 2) Deal with the rounding methods

        var round_tax = this.pos.company.tax_calculation_rounding_method != 'round_globally';

        var initial_currency_rounding = currency_rounding;
        if(!round_tax)
            currency_rounding = currency_rounding * 0.00001;

        // 3) Iterate the taxes in the reversed sequence order to retrieve the initial base of the computation.
        var recompute_base = function(base_amount, fixed_amount, percent_amount, division_amount){
             return (base_amount - fixed_amount) / (1.0 + percent_amount / 100.0) * (100 - division_amount) / 100;
        }

        var base = round_pr(price_unit * quantity, initial_currency_rounding);

        var sign = 1;
        if(base < 0){
            base = -base;
            sign = -1;
        }

        var total_included_checkpoints = {};
        var i = taxes.length - 1;
        var store_included_tax_total = true;

        var incl_fixed_amount = 0.0;
        var incl_percent_amount = 0.0;
        var incl_division_amount = 0.0;

        var cached_tax_amounts = {};
        if (handle_price_include){
            _(taxes.reverse()).each(function(tax){
                if(tax.include_base_amount){
                    base = recompute_base(base, incl_fixed_amount, incl_percent_amount, incl_division_amount);
                    incl_fixed_amount = 0.0;
                    incl_percent_amount = 0.0;
                    incl_division_amount = 0.0;
                    store_included_tax_total = true;
                }
                if(tax.price_include){
                    if(tax.amount_type === 'percent')
                        incl_percent_amount += tax.amount;
                    else if(tax.amount_type === 'division')
                        incl_division_amount += tax.amount;
                    else if(tax.amount_type === 'fixed')
                        incl_fixed_amount += Math.abs(quantity) * tax.amount
                    else{
                        var tax_amount = self._compute_all(tax, base, quantity);
                        incl_fixed_amount += tax_amount;
                        cached_tax_amounts[i] = tax_amount;
                    }
                    if(store_included_tax_total){
                        total_included_checkpoints[i] = base;
                        store_included_tax_total = false;
                    }
                }
                i -= 1;
            });
        }

        var total_excluded = round_pr(recompute_base(base, incl_fixed_amount, incl_percent_amount, incl_division_amount), initial_currency_rounding);
        var total_included = total_excluded;

        // 4) Iterate the taxes in the sequence order to fill missing base/amount values.

        base = total_excluded;

        var skip_checkpoint = false;

        var taxes_vals = [];
        i = 0;
        var cumulated_tax_included_amount = 0;
        _(taxes.reverse()).each(function(tax){
            if(tax.price_include || tax.is_base_affected)
                var tax_base_amount = base;
            else
                var tax_base_amount = total_excluded;

            if(!skip_checkpoint && tax.price_include && total_included_checkpoints[i] !== undefined){
                var tax_amount = total_included_checkpoints[i] - (base + cumulated_tax_included_amount);
                cumulated_tax_included_amount = 0;
            }else
                var tax_amount = self._compute_all(tax, tax_base_amount, quantity, true);

            tax_amount = round_pr(tax_amount, currency_rounding);

            if(tax.price_include && total_included_checkpoints[i] === undefined)
                cumulated_tax_included_amount += tax_amount;

            taxes_vals.push({
                'id': tax.id,
                'name': tax.name,
                'amount': sign * tax_amount,
                'base': sign * round_pr(tax_base_amount, currency_rounding),
            });

            if(tax.include_base_amount){
                base += tax_amount;
                if(!tax.price_include)
                    skip_checkpoint = true;
            }

            total_included += tax_amount;
            i += 1;
        });

        return {
            'taxes': taxes_vals,
            'total_excluded': sign * round_pr(total_excluded, this.pos.currency.rounding),
            'total_included': sign * round_pr(total_included, this.pos.currency.rounding),
        }
    }
    get_all_prices(){
        var self = this;

        var price_unit = this.get_unit_price() * (1.0 - (this.get_discount() / 100.0));
        var taxtotal = 0;

        var product =  this.get_product();
        var taxes_ids = this.tax_ids || product.taxes_id;
        taxes_ids = _.filter(taxes_ids, t => t in this.pos.taxes_by_id);
        var taxes =  this.pos.taxes;
        var taxdetail = {};
        var product_taxes = [];

        _(taxes_ids).each(function(el){
            var tax = _.detect(taxes, function(t){
                return t.id === el;
            });
            product_taxes.push.apply(product_taxes, self._map_tax_fiscal_position(tax, self.order));
        });
        product_taxes = _.uniq(product_taxes, function(tax) { return tax.id; });

        var all_taxes = this.compute_all(product_taxes, price_unit, this.get_quantity(), this.pos.currency.rounding);
        var all_taxes_before_discount = this.compute_all(product_taxes, this.get_unit_price(), this.get_quantity(), this.pos.currency.rounding);
        _(all_taxes.taxes).each(function(tax) {
            taxtotal += tax.amount;
            taxdetail[tax.id] = tax.amount;
        });

        return {
            "priceWithTax": all_taxes.total_included,
            "priceWithoutTax": all_taxes.total_excluded,
            "priceSumTaxVoid": all_taxes.total_void,
            "priceWithTaxBeforeDiscount": all_taxes_before_discount.total_included,
            "tax": taxtotal,
            "taxDetails": taxdetail,
        };
    }
    display_discount_policy(){
        return this.order.pricelist.discount_policy;
    }
    compute_fixed_price (price) {
        var order = this.order;
        if(order.fiscal_position) {
            var taxes = this.get_taxes();
            var mapped_included_taxes = [];
            var new_included_taxes = [];
            var self = this;
            _(taxes).each(function(tax) {
                var line_taxes = self._map_tax_fiscal_position(tax, order);
                if (line_taxes.length && line_taxes[0].price_include){
                    new_included_taxes = new_included_taxes.concat(line_taxes);
                }
                if(tax.price_include && !_.contains(line_taxes, tax)){
                    mapped_included_taxes.push(tax);
                }
            });

            if (mapped_included_taxes.length > 0) {
                if (new_included_taxes.length > 0) {
                    var price_without_taxes = this.compute_all(mapped_included_taxes, price, 1, order.pos.currency.rounding, true).total_excluded
                    return this.compute_all(new_included_taxes, price_without_taxes, 1, order.pos.currency.rounding, false).total_included
                }
                else{
                    return this.compute_all(mapped_included_taxes, price, 1, order.pos.currency.rounding, true).total_excluded;
                }
            }
        }
        return price;
    }
    get_fixed_lst_price(){
        return this.compute_fixed_price(this.get_lst_price());
    }
    get_lst_price(){
        return this.product.lst_price;
    }
    set_lst_price(price){
      this.order.assert_editable();
      this.product.lst_price = round_di(parseFloat(price) || 0, this.pos.dp['Product Price']);
    }
    is_last_line() {
        var order = this.pos.get_order();
        var orderlines = order.orderlines;
        var last_id = orderlines[orderlines.length - 1].cid;
        var selectedLine = order? order.selected_orderline: null;

        return !selectedLine ? false : last_id === selectedLine.cid;
    }
    set_customer_note(note) {
        this.customerNote = note;
    }
    get_customer_note() {
        return this.customerNote;
    }
    get_total_cost() {
        return this.product.standard_price * this.quantity;
    }
}
PosModelRegistry.add(Orderline);

class Packlotline extends PosModel {
    constructor(obj, options){
        super(obj);
        this.lot_name = null;
        this.order_line = options.order_line;
        if (options.json) {
            this.init_from_JSON(options.json);
            return;
        }
    }

    init_from_JSON(json) {
        this.order_line = json.order_line;
        this.set_lot_name(json.lot_name);
    }

    set_lot_name(name){
        this.lot_name = _.str.trim(name) || null;
    }

    get_lot_name(){
        return this.lot_name;
    }

    export_as_JSON(){
        return {
            lot_name: this.get_lot_name(),
        };
    }
}
PosModelRegistry.add(Packlotline);

// Every Paymentline contains a cashregister and an amount of money.
class Payment extends PosModel {
    constructor(obj, options) {
        super(obj);
        this.pos = options.pos;
        this.order = options.order;
        this.amount = 0;
        this.selected = false;
        this.cashier_receipt = '';
        this.ticket = '';
        this.payment_status = '';
        this.card_type = '';
        this.cardholder_name = '';
        this.transaction_id = '';

        if (options.json) {
            this.init_from_JSON(options.json);
            return;
        }
        this.payment_method = options.payment_method;
        if (this.payment_method === undefined) {
            throw new Error(_t('Please configure a payment method in your POS.'));
        }
        this.name = this.payment_method.name;
    }
    init_from_JSON(json){
        this.amount = json.amount;
        this.payment_method = this.pos.payment_methods_by_id[json.payment_method_id];
        this.can_be_reversed = json.can_be_reversed;
        this.name = this.payment_method.name;
        this.payment_status = json.payment_status;
        this.ticket = json.ticket;
        this.card_type = json.card_type;
        this.cardholder_name = json.cardholder_name;
        this.transaction_id = json.transaction_id;
        this.is_change = json.is_change;
    }
    //sets the amount of money on this payment line
    set_amount(value){
        this.order.assert_editable();
        this.amount = round_di(parseFloat(value) || 0, this.pos.currency.decimals);
        if (this.pos.config.iface_customer_facing_display) this.pos.send_current_order_to_customer_facing_display();
    }
    // returns the amount of money on this paymentline
    get_amount(){
        return this.amount;
    }
    get_amount_str(){
        return field_utils.format.float(this.amount, {digits: [69, this.pos.currency.decimals]});
    }
    set_selected(selected){
        if(this.selected !== selected){
            this.selected = selected;
        }
    }
    /**
     * returns {string} payment status.
     */
    get_payment_status() {
        return this.payment_status;
    }

    /**
     * Set the new payment status.
     *
     * @param {string} value - new status.
     */
    set_payment_status(value) {
        this.payment_status = value;
    }

    /**
     * Check if paymentline is done.
     * Paymentline is done if there is no payment status or the payment status is done.
     */
    is_done() {
        return this.get_payment_status() ? this.get_payment_status() === 'done' || this.get_payment_status() === 'reversed': true;
    }

    /**
    * Set info to be printed on the cashier receipt. value should
    * be compatible with both the QWeb and ESC/POS receipts.
    *
    * @param {string} value - receipt info
    */
    set_cashier_receipt (value) {
        this.cashier_receipt = value;
    }

    /**
     * Set additional info to be printed on the receipts. value should
     * be compatible with both the QWeb and ESC/POS receipts.
     *
     * @param {string} value - receipt info
     */
    set_receipt_info(value) {
        this.ticket += value;
    }

    // returns the associated cashregister
    //exports as JSON for server communication
    export_as_JSON(){
        return {
            name: time.datetime_to_str(new Date()),
            payment_method_id: this.payment_method.id,
            amount: this.get_amount(),
            payment_status: this.payment_status,
            can_be_reversed: this.can_be_resersed,
            ticket: this.ticket,
            card_type: this.card_type,
            cardholder_name: this.cardholder_name,
            transaction_id: this.transaction_id,
        };
    }
    //exports as JSON for receipt printing
    export_for_printing(){
        return {
            cid: this.cid,
            amount: this.get_amount(),
            name: this.name,
            ticket: this.ticket,
        };
    }
    // If payment status is a non-empty string, then it is an electronic payment.
    // TODO: There has to be a less confusing way to distinguish simple payments
    // from electronic transactions. Perhaps use a flag?
    is_electronic() {
        return Boolean(this.get_payment_status());
    }
}
PosModelRegistry.add(Payment);

// An order more or less represents the content of a client's shopping cart (the OrderLines)
// plus the associated payment information (the Paymentlines)
// there is always an active ('selected') order in the Pos, a new one is created
// automaticaly once an order is completed and sent to the server.
class Order extends PosModel {
    constructor(obj, options) {
        super(obj);
        var self = this;
        options  = options || {};

        this.locked         = false;
        this.pos            = options.pos;
        this.selected_orderline   = undefined;
        this.selected_paymentline = undefined;
        this.screen_data    = {};  // see Gui
        this.temporary      = options.temporary || false;
        this.creation_date  = new Date();
        this.to_invoice     = false;
        this.orderlines     = new PosCollection();
        this.paymentlines   = new PosCollection();
        this.pos_session_id = this.pos.pos_session.id;
        this.employee       = this.pos.employee;
        this.finalized      = false; // if true, cannot be modified.
        this.set_pricelist(this.pos.default_pricelist);

        this.client = null;

        this.uiState = {
            ReceiptScreen: {
                inputEmail: '',
                // if null: not yet tried to send
                // if false/true: tried sending email
                emailSuccessful: null,
                emailNotice: '',
            },
            TipScreen: {
                inputTipAmount: '',
            }
        };

        if (options.json) {
            this.init_from_JSON(options.json);
        } else {
            this.sequence_number = this.pos.pos_session.sequence_number++;
            this.uid  = this.generate_unique_id();
            this.name = _.str.sprintf(_t("Order %s"), this.uid);
            this.validation_date = undefined;
            this.fiscal_position = _.find(this.pos.fiscal_positions, function(fp) {
                return fp.id === self.pos.config.default_fiscal_position_id[0];
            });
        }

        if (this.pos.config.iface_customer_facing_display) {
            // modelBus.on("PAYMENT_DONE", this.pos, () => this.pos.send_current_order_to_customer_facing_display());
            // modelBus.on("PAYMENT_COLLECTION_DONE", this.pos, () => this.pos.send_current_order_to_customer_facing_display());
            // modelBus.on("ORDERLINE_COLLECTION_DONE", this.pos, () => this.pos.send_current_order_to_customer_facing_display());
            // modelBus.on("ORDERLINE_DONE", this.pos, () => this.pos.send_current_order_to_customer_facing_display());
        }

        return this;
    }
    save_to_db(){
        if (!this.temporary && !this.locked) {
            this.pos.db.save_unpaid_order(this);
        }
    }
    /**
     * Initialize PoS order from a JSON string.
     *
     * If the order was created in another session, the sequence number should be changed so it doesn't conflict
     * with orders in the current session.
     * Else, the sequence number of the session should follow on the sequence number of the loaded order.
     *
     * @param {object} json JSON representing one PoS order.
     */
    init_from_JSON(json) {
        var client;
        if (json.pos_session_id !== this.pos.pos_session.id) {
            this.sequence_number = this.pos.pos_session.sequence_number++;
        } else {
            this.sequence_number = json.sequence_number;
            this.pos.pos_session.sequence_number = Math.max(this.sequence_number+1,this.pos.pos_session.sequence_number);
        }
        this.session_id = this.pos.pos_session.id;
        this.uid = json.uid;
        this.name = _.str.sprintf(_t("Order %s"), this.uid);
        this.validation_date = json.creation_date;
        this.server_id = json.server_id ? json.server_id : false;
        this.user_id = json.user_id;

        if (json.fiscal_position_id) {
            var fiscal_position = _.find(this.pos.fiscal_positions, function (fp) {
                return fp.id === json.fiscal_position_id;
            });

            if (fiscal_position) {
                this.fiscal_position = fiscal_position;
            } else {
                console.error('ERROR: trying to load a fiscal position not available in the pos');
            }
        }

        if (json.pricelist_id) {
            this.pricelist = _.find(this.pos.pricelists, function (pricelist) {
                return pricelist.id === json.pricelist_id;
            });
        } else {
            this.pricelist = this.pos.default_pricelist;
        }

        if (json.partner_id) {
            client = this.pos.db.get_partner_by_id(json.partner_id);
            if (!client) {
                console.error('ERROR: trying to load a partner not available in the pos');
            }
        } else {
            client = null;
        }
        this.set_client(client);

        this.temporary = false;     // FIXME
        this.to_invoice = false;    // FIXME
        this.to_ship = false;

        var orderlines = json.lines;
        for (var i = 0; i < orderlines.length; i++) {
            var orderline = orderlines[i][2];
            this.add_orderline(new (PosModelRegistry.get(Orderline))({}, {pos: this.pos, order: this, json: orderline}));
        }

        var paymentlines = json.statement_ids;
        for (var i = 0; i < paymentlines.length; i++) {
            var paymentline = paymentlines[i][2];
            var newpaymentline = new (PosModelRegistry.get(Payment))({},{pos: this.pos, order: this, json: paymentline});
            this.paymentlines.add(newpaymentline);

            if (i === paymentlines.length - 1) {
                this.select_paymentline(newpaymentline);
            }
        }

        // Tag this order as 'locked' if it is already paid.
        this.locked = ['paid', 'done', 'invoiced'].includes(json.state);
        this.state = json.state;
        this.amount_return = json.amount_return;
        this.account_move = json.account_move;
        this.backendId = json.id;
        this.isFromClosedSession = json.is_session_closed;
        this.is_tipped = json.is_tipped || false;
        this.tip_amount = json.tip_amount || 0;
    }
    export_as_JSON() {
        var orderLines, paymentLines;
        orderLines = [];
        this.orderlines.forEach(item => {
            return orderLines.push([0, 0, item.export_as_JSON()]);
        });
        paymentLines = [];
        this.paymentlines.forEach(_.bind( function(item) {
            return paymentLines.push([0, 0, item.export_as_JSON()]);
        }, this));
        var json = {
            name: this.get_name(),
            amount_paid: this.get_total_paid() - this.get_change(),
            amount_total: this.get_total_with_tax(),
            amount_tax: this.get_total_tax(),
            amount_return: this.get_change(),
            lines: orderLines,
            statement_ids: paymentLines,
            pos_session_id: this.pos_session_id,
            pricelist_id: this.pricelist ? this.pricelist.id : false,
            partner_id: this.get_client() ? this.get_client().id : false,
            user_id: this.pos.user.id,
            uid: this.uid,
            sequence_number: this.sequence_number,
            creation_date: this.validation_date || this.creation_date, // todo: rename creation_date in master
            fiscal_position_id: this.fiscal_position ? this.fiscal_position.id : false,
            server_id: this.server_id ? this.server_id : false,
            to_invoice: this.to_invoice ? this.to_invoice : false,
            to_ship: this.to_ship ? this.to_ship : false,
            is_tipped: this.is_tipped || false,
            tip_amount: this.tip_amount || 0,
        };
        if (!this.is_paid && this.user_id) {
            json.user_id = this.user_id;
        }
        return json;
    }
    export_for_printing(){
        var orderlines = [];
        var self = this;

        this.orderlines.forEach(function(orderline){
            orderlines.push(orderline.export_for_printing());
        });

        // If order is locked (paid), the 'change' is saved as negative payment,
        // and is flagged with is_change = true. A receipt that is printed first
        // time doesn't show this negative payment so we filter it out.
        var paymentlines = this.paymentlines
            .filter(function (paymentline) {
                return !paymentline.is_change;
            })
            .map(function (paymentline) {
                return paymentline.export_for_printing();
            });
        var client  = this.client;
        var cashier = this.pos.get_cashier();
        var company = this.pos.company;
        var date    = new Date();

        function is_html(subreceipt){
            return subreceipt ? (subreceipt.split('\n')[0].indexOf('<!DOCTYPE QWEB') >= 0) : false;
        }

        function render_html(subreceipt){
            if (!is_html(subreceipt)) {
                return subreceipt;
            } else {
                subreceipt = subreceipt.split('\n').slice(1).join('\n');
                var qweb = new QWeb2.Engine();
                    qweb.debug = config.isDebug();
                    qweb.default_dict = _.clone(QWeb.default_dict);
                    qweb.add_template('<templates><t t-name="subreceipt">'+subreceipt+'</t></templates>');

                return qweb.render('subreceipt',{'pos':self.pos,'order':self, 'receipt': receipt}) ;
            }
        }

        var receipt = {
            orderlines: orderlines,
            paymentlines: paymentlines,
            subtotal: this.get_subtotal(),
            total_with_tax: this.get_total_with_tax(),
            total_rounded: this.get_total_with_tax() + this.get_rounding_applied(),
            total_without_tax: this.get_total_without_tax(),
            total_tax: this.get_total_tax(),
            total_paid: this.get_total_paid(),
            total_discount: this.get_total_discount(),
            rounding_applied: this.get_rounding_applied(),
            tax_details: this.get_tax_details(),
            change: this.locked ? this.amount_return : this.get_change(),
            name : this.get_name(),
            client: client ? client : null ,
            invoice_id: null,   //TODO
            cashier: cashier ? cashier.name : null,
            precision: {
                price: 2,
                money: 2,
                quantity: 3,
            },
            date: {
                year: date.getFullYear(),
                month: date.getMonth(),
                date: date.getDate(),       // day of the month
                day: date.getDay(),         // day of the week
                hour: date.getHours(),
                minute: date.getMinutes() ,
                isostring: date.toISOString(),
                localestring: this.formatted_validation_date,
                validation_date: this.validation_date,
            },
            company:{
                email: company.email,
                website: company.website,
                company_registry: company.company_registry,
                contact_address: company.partner_id[1],
                vat: company.vat,
                vat_label: company.country && company.country.vat_label || _t('Tax ID'),
                name: company.name,
                phone: company.phone,
                logo:  this.pos.company_logo_base64,
            },
            currency: this.pos.currency,
        };

        if (is_html(this.pos.config.receipt_header)){
            receipt.header = '';
            receipt.header_html = render_html(this.pos.config.receipt_header);
        } else {
            receipt.header = this.pos.config.receipt_header || '';
        }

        if (is_html(this.pos.config.receipt_footer)){
            receipt.footer = '';
            receipt.footer_html = render_html(this.pos.config.receipt_footer);
        } else {
            receipt.footer = this.pos.config.receipt_footer || '';
        }

        return receipt;
    }
    is_empty(){
        return this.orderlines.length === 0;
    }
    generate_unique_id() {
        // Generates a public identification number for the order.
        // The generated number must be unique and sequential. They are made 12 digit long
        // to fit into EAN-13 barcodes, should it be needed

        function zero_pad(num,size){
            var s = ""+num;
            while (s.length < size) {
                s = "0" + s;
            }
            return s;
        }
        return zero_pad(this.pos.pos_session.id,5) +'-'+
               zero_pad(this.pos.pos_session.login_number,3) +'-'+
               zero_pad(this.sequence_number,4);
    }
    get_name() {
        return this.name;
    }
    assert_editable() {
        if (this.finalized) {
            throw new Error('Finalized Order cannot be modified');
        }
    }
    /* ---- Order Lines --- */
    add_orderline(line){
        this.assert_editable();
        if(line.order){
            line.order.remove_orderline(line);
        }
        line.order = this;
        this.orderlines.add(line);
        this.select_orderline(this.get_last_orderline());
    }
    get_orderline(id){
        var orderlines = this.orderlines;
        for(var i = 0; i < orderlines.length; i++){
            if(orderlines[i].id === id){
                return orderlines[i];
            }
        }
        return null;
    }
    get_orderlines(){
        return this.orderlines;
    }
    get_last_orderline(){
        const orderlines = this.orderlines;
        return this.orderlines.at(orderlines.length -1);
    }
    get_tip() {
        var tip_product = this.pos.db.get_product_by_id(this.pos.config.tip_product_id[0]);
        var lines = this.get_orderlines();
        if (!tip_product) {
            return 0;
        } else {
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].get_product() === tip_product) {
                    return lines[i].get_unit_price();
                }
            }
            return 0;
        }
    }

    initialize_validation_date () {
        this.validation_date = new Date();
        this.formatted_validation_date = field_utils.format.datetime(
            moment(this.validation_date), {}, {timezone: false});
    }

    set_tip(tip) {
        var tip_product = this.pos.db.get_product_by_id(this.pos.config.tip_product_id[0]);
        var lines = this.get_orderlines();
        if (tip_product) {
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].get_product() === tip_product) {
                    lines[i].set_unit_price(tip);
                    lines[i].set_lst_price(tip);
                    lines[i].price_manually_set = true;
                    lines[i].order.tip_amount = tip;
                    return;
                }
            }
            return this.add_product(tip_product, {
              is_tip: true,
              quantity: 1,
              price: tip,
              lst_price: tip,
              extras: {price_manually_set: true},
            });
        }
    }
    set_fiscal_position(fiscal_position) {
        this.fiscal_position = fiscal_position;
    }
    set_pricelist (pricelist) {
        var self = this;
        this.pricelist = pricelist;

        var lines_to_recompute = _.filter(this.get_orderlines(), function (line) {
            return ! line.price_manually_set;
        });
        _.each(lines_to_recompute, function (line) {
            line.set_unit_price(line.product.get_price(self.pricelist, line.get_quantity(), line.get_price_extra()));
            self.fix_tax_included_price(line);
        });
    }
    remove_orderline( line ){
        this.assert_editable();
        this.orderlines.remove(line);
        this.select_orderline(this.get_last_orderline());
    }

    fix_tax_included_price(line){
        line.set_unit_price(line.compute_fixed_price(line.price));
    }

    add_product(product, options){
        if(this._printed){
            this.destroy();
            return this.pos.get_order().add_product(product, options);
        }
        this.assert_editable();
        options = options || {};
        var line = new (PosModelRegistry.get(Orderline))({}, {pos: this.pos, order: this, product: product});
        this.fix_tax_included_price(line);

        this.set_orderline_options(line, options);

        var to_merge_orderline;
        for (var i = 0; i < this.orderlines.length; i++) {
            if(this.orderlines.at(i).can_be_merged_with(line) && options.merge !== false){
                to_merge_orderline = this.orderlines.at(i);
            }
        }
        if (to_merge_orderline){
            to_merge_orderline.merge(line);
            this.select_orderline(to_merge_orderline);
        } else {
            this.orderlines.add(line);
            this.select_orderline(this.get_last_orderline());
        }

        if (options.draftPackLotLines) {
            this.selected_orderline.setPackLotLines(options.draftPackLotLines);
        }
        if (this.pos.config.iface_customer_facing_display) {
            this.pos.send_current_order_to_customer_facing_display();
        }
    }
    set_orderline_options(orderline, options) {
        if(options.quantity !== undefined){
            orderline.set_quantity(options.quantity);
        }

        if (options.price_extra !== undefined){
            orderline.price_extra = options.price_extra;
            orderline.set_unit_price(orderline.product.get_price(this.pricelist, orderline.get_quantity(), options.price_extra));
            this.fix_tax_included_price(orderline);
        }

        if(options.price !== undefined){
            orderline.set_unit_price(options.price);
            this.fix_tax_included_price(orderline);
        }

        if(options.lst_price !== undefined){
            orderline.set_lst_price(options.lst_price);
        }

        if(options.discount !== undefined){
            orderline.set_discount(options.discount);
        }

        if (options.description !== undefined){
            orderline.description += options.description;
        }

        if(options.extras !== undefined){
            for (var prop in options.extras) {
                orderline[prop] = options.extras[prop];
            }
        }
        if (options.is_tip) {
            this.is_tipped = true;
            this.tip_amount = options.price;
        }
        if (options.refunded_orderline_id) {
            orderline.refunded_orderline_id = options.refunded_orderline_id;
        }
        if (options.tax_ids) {
            orderline.tax_ids = options.tax_ids;
        }
    }
    get_selected_orderline(){
        return this.selected_orderline;
    }
    select_orderline(line){
        if(line){
            if(line !== this.selected_orderline){
                // if line (new line to select) is not the same as the old
                // selected_orderline, then we set the old line to false,
                // and set the new line to true. Also, set the new line as
                // the selected_orderline.
                if(this.selected_orderline){
                    this.selected_orderline.set_selected(false);
                }
                this.selected_orderline = line;
                this.selected_orderline.set_selected(true);
            }
        }else{
            this.selected_orderline = undefined;
        }
    }
    deselect_orderline(){
        if(this.selected_orderline){
            this.selected_orderline.set_selected(false);
            this.selected_orderline = undefined;
        }
    }

    /* ---- Payment Lines --- */
    add_paymentline(payment_method) {
        this.assert_editable();
        var newPaymentline = new (PosModelRegistry.get(Payment))({},{order: this, payment_method:payment_method, pos: this.pos});
        this.paymentlines.add(newPaymentline);
        this.select_paymentline(newPaymentline);
        if(this.pos.config.cash_rounding){
          this.selected_paymentline.set_amount(0);
        }
        newPaymentline.set_amount(this.get_due());
        return newPaymentline;
    }
    get_paymentlines(){
        return this.paymentlines;
    }
    /**
     * Retrieve the paymentline with the specified cid
     *
     * @param {String} cid
     */
    get_paymentline (cid) {
        var lines = this.get_paymentlines();
        return lines.find(function (line) {
            return line.cid === cid;
        });
    }
    remove_paymentline(line){
        this.assert_editable();
        if(this.selected_paymentline === line){
            this.select_paymentline(undefined);
        }
        this.paymentlines.remove(line);
    }
    clean_empty_paymentlines() {
        var lines = this.paymentlines;
        var empty = [];
        for ( var i = 0; i < lines.length; i++) {
            if (!lines[i].get_amount()) {
                empty.push(lines[i]);
            }
        }
        for ( var i = 0; i < empty.length; i++) {
            this.remove_paymentline(empty[i]);
        }
    }
    select_paymentline(line){
        if(line !== this.selected_paymentline){
            if(this.selected_paymentline){
                this.selected_paymentline.set_selected(false);
            }
            this.selected_paymentline = line;
            if(this.selected_paymentline){
                this.selected_paymentline.set_selected(true);
            }
        }
    }
    electronic_payment_in_progress() {
        return this.get_paymentlines()
            .some(function(pl) {
                if (pl.payment_status) {
                    return !['done', 'reversed'].includes(pl.payment_status);
                } else {
                    return false;
                }
            });
    }
    /**
     * Stops a payment on the terminal if one is running
     */
    stop_electronic_payment () {
        var lines = this.get_paymentlines();
        var line = lines.find(function (line) {
            var status = line.get_payment_status();
            return status && !['done', 'reversed', 'reversing', 'pending', 'retry'].includes(status);
        });
        if (line) {
            line.set_payment_status('waitingCancel');
            line.payment_method.payment_terminal.send_payment_cancel(this, line.cid).finally(function () {
                line.set_payment_status('retry');
            });
        }
    }
    /* ---- Payment Status --- */
    get_subtotal(){
        return round_pr(this.orderlines.reduce((function(sum, orderLine){
            return sum + orderLine.get_display_price();
        }), 0), this.pos.currency.rounding);
    }
    get_total_with_tax() {
        return this.get_total_without_tax() + this.get_total_tax();
    }
    get_total_without_tax() {
        return round_pr(this.orderlines.reduce((function(sum, orderLine) {
            return sum + orderLine.get_price_without_tax();
        }), 0), this.pos.currency.rounding);
    }
    get_total_discount() {
        return round_pr(this.orderlines.reduce((function(sum, orderLine) {
            sum += (orderLine.get_unit_price() * (orderLine.get_discount()/100) * orderLine.get_quantity());
            if (orderLine.display_discount_policy() === 'without_discount'){
                sum += ((orderLine.get_lst_price() - orderLine.get_unit_price()) * orderLine.get_quantity());
            }
            return sum;
        }), 0), this.pos.currency.rounding);
    }
    get_total_tax() {
        if (this.pos.company.tax_calculation_rounding_method === "round_globally") {
            // As always, we need:
            // 1. For each tax, sum their amount across all order lines
            // 2. Round that result
            // 3. Sum all those rounded amounts
            var groupTaxes = {};
            this.orderlines.forEach(function (line) {
                var taxDetails = line.get_tax_details();
                var taxIds = Object.keys(taxDetails);
                for (var t = 0; t<taxIds.length; t++) {
                    var taxId = taxIds[t];
                    if (!(taxId in groupTaxes)) {
                        groupTaxes[taxId] = 0;
                    }
                    groupTaxes[taxId] += taxDetails[taxId];
                }
            });

            var sum = 0;
            var taxIds = Object.keys(groupTaxes);
            for (var j = 0; j<taxIds.length; j++) {
                var taxAmount = groupTaxes[taxIds[j]];
                sum += round_pr(taxAmount, this.pos.currency.rounding);
            }
            return sum;
        } else {
            return round_pr(this.orderlines.reduce((function(sum, orderLine) {
                return sum + orderLine.get_tax();
            }), 0), this.pos.currency.rounding);
        }
    }
    get_total_paid() {
        return round_pr(this.paymentlines.reduce((function(sum, paymentLine) {
            if (paymentLine.is_done()) {
                sum += paymentLine.get_amount();
            }
            return sum;
        }), 0), this.pos.currency.rounding);
    }
    get_tax_details(){
        var details = {};
        var fulldetails = [];

        this.orderlines.forEach(function(line){
            var ldetails = line.get_tax_details();
            for(var id in ldetails){
                if(ldetails.hasOwnProperty(id)){
                    details[id] = (details[id] || 0) + ldetails[id];
                }
            }
        });

        for(var id in details){
            if(details.hasOwnProperty(id)){
                fulldetails.push({amount: details[id], tax: this.pos.taxes_by_id[id], name: this.pos.taxes_by_id[id].name});
            }
        }

        return fulldetails;
    }
    // Returns a total only for the orderlines with products belonging to the category
    get_total_for_category_with_tax(categ_id){
        var total = 0;
        var self = this;

        if (categ_id instanceof Array) {
            for (var i = 0; i < categ_id.length; i++) {
                total += this.get_total_for_category_with_tax(categ_id[i]);
            }
            return total;
        }

        this.orderlines.forEach(function(line){
            if ( self.pos.db.category_contains(categ_id,line.product.id) ) {
                total += line.get_price_with_tax();
            }
        });

        return total;
    }
    get_total_for_taxes(tax_id){
        var total = 0;

        if (!(tax_id instanceof Array)) {
            tax_id = [tax_id];
        }

        var tax_set = {};

        for (var i = 0; i < tax_id.length; i++) {
            tax_set[tax_id[i]] = true;
        }

        this.orderlines.forEach(line => {
            var taxes_ids = this.tax_ids || line.get_product().taxes_id;
            for (var i = 0; i < taxes_ids.length; i++) {
                if (tax_set[taxes_ids[i]]) {
                    total += line.get_price_with_tax();
                    return;
                }
            }
        });

        return total;
    }
    get_change(paymentline) {
        if (!paymentline) {
            var change = this.get_total_paid() - this.get_total_with_tax() - this.get_rounding_applied();
        } else {
            var change = -this.get_total_with_tax();
            var lines  = this.paymentlines;
            for (var i = 0; i < lines.length; i++) {
                change += lines[i].get_amount();
                if (lines[i] === paymentline) {
                    break;
                }
            }
        }
        return round_pr(Math.max(0,change), this.pos.currency.rounding);
    }
    get_due(paymentline) {
        if (!paymentline) {
            var due = this.get_total_with_tax() - this.get_total_paid() + this.get_rounding_applied();
        } else {
            var due = this.get_total_with_tax();
            var lines = this.paymentlines;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i] === paymentline) {
                    break;
                } else {
                    due -= lines[i].get_amount();
                }
            }
        }
        return round_pr(due, this.pos.currency.rounding);
    }
    get_rounding_applied() {
        if(this.pos.config.cash_rounding) {
            const only_cash = this.pos.config.only_round_cash_method;
            const paymentlines = this.get_paymentlines();
            const last_line = paymentlines ? paymentlines[paymentlines.length-1]: false;
            const last_line_is_cash = last_line ? last_line.payment_method.is_cash_count == true: false;
            if (!only_cash || (only_cash && last_line_is_cash)) {
                var remaining = this.get_total_with_tax() - this.get_total_paid();
                var total = round_pr(remaining, this.pos.cash_rounding[0].rounding);
                var sign = remaining > 0 ? 1.0 : -1.0;

                var rounding_applied = total - remaining;
                rounding_applied *= sign;
                // because floor and ceil doesn't include decimals in calculation, we reuse the value of the half-up and adapt it.
                if (utils.float_is_zero(rounding_applied, this.pos.currency.decimals)){
                    // https://xkcd.com/217/
                    return 0;
                }
                else if(this.pos.cash_rounding[0].rounding_method === "UP" && rounding_applied < 0 && remaining > 0) {
                    rounding_applied += this.pos.cash_rounding[0].rounding;
                }
                else if(this.pos.cash_rounding[0].rounding_method === "UP" && rounding_applied > 0 && remaining < 0) {
                    rounding_applied -= this.pos.cash_rounding[0].rounding;
                }
                else if(this.pos.cash_rounding[0].rounding_method === "DOWN" && rounding_applied > 0 && remaining > 0){
                    rounding_applied -= this.pos.cash_rounding[0].rounding;
                }
                else if(this.pos.cash_rounding[0].rounding_method === "DOWN" && rounding_applied < 0 && remaining < 0){
                    rounding_applied += this.pos.cash_rounding[0].rounding;
                }
                return sign * rounding_applied;
            }
            else {
                return 0;
            }
        }
        return 0;
    }
    has_not_valid_rounding() {
        if(!this.pos.config.cash_rounding)
            return false;

        const only_cash = this.pos.config.only_round_cash_method;
        var lines = this.paymentlines;

        for(var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (only_cash && !line.payment_method.is_cash_count)
                continue;

            if(!utils.float_is_zero(line.amount - round_pr(line.amount, this.pos.cash_rounding[0].rounding), 6))
                return line;
        }
        return false;
    }
    is_paid(){
        return this.get_due() <= 0 && this.check_paymentlines_rounding();
    }
    is_paid_with_cash(){
        return !!this.paymentlines.find( function(pl){
            return pl.payment_method.is_cash_count;
        });
    }
    check_paymentlines_rounding() {
        if(this.pos.config.cash_rounding) {
            var cash_rounding = this.pos.cash_rounding[0].rounding;
            var default_rounding = this.pos.currency.rounding;
            for(var id in this.get_paymentlines()) {
                var line = this.get_paymentlines()[id];
                var diff = round_pr(round_pr(line.amount, cash_rounding) - round_pr(line.amount, default_rounding), default_rounding);
                if(diff && line.payment_method.is_cash_count) {
                    return false;
                } else if(!this.pos.config.only_round_cash_method && diff) {
                    return false;
                }
            }
            return true;
        }
        return true;
    }
    get_total_cost() {
        return this.orderlines.reduce((function(sum, orderLine) {
            return sum + orderLine.get_total_cost();
        }), 0)
    }
    finalize(){
        this.destroy();
    }
    destroy(){
        this.pos.db.remove_unpaid_order(this);
        if (this.unregisterObserver) {
            this.unregisterObserver();
        }
    }
    /* ---- Invoice --- */
    set_to_invoice(to_invoice) {
        this.assert_editable();
        this.to_invoice = to_invoice;
    }
    is_to_invoice(){
        return this.to_invoice;
    }
    /* ---- Client / Customer --- */
    // the client related to the current order.
    set_client(client){
        this.assert_editable();
        this.client = client;
    }
    get_client(){
        return this.client;
    }
    get_client_name(){
        var client = this.client;
        return client ? client.name : "";
    }
    get_cardholder_name(){
        var card_payment_line = this.paymentlines.find(pl => pl.cardholder_name);
        return card_payment_line ? card_payment_line.cardholder_name : "";
    }
    /* ---- Screen Status --- */
    // the order also stores the screen status, as the PoS supports
    // different active screens per order. This method is used to
    // store the screen status.
    set_screen_data(value){
        this.screen_data['value'] = value;
    }
    //see set_screen_data
    get_screen_data(){
        const screen = this.screen_data['value'];
        // If no screen data is saved
        //   no payment line -> product screen
        //   with payment line -> payment screen
        if (!screen) {
            if (this.get_paymentlines().length > 0) return { name: 'PaymentScreen' };
            return { name: 'ProductScreen' };
        }
        if (!this.finalized && this.get_paymentlines().length > 0) {
            return { name: 'PaymentScreen' };
        }
        return screen;
    }
    wait_for_push_order () {
        return false;
    }
    /**
     * @returns {Object} object to use as props for instantiating OrderReceipt.
     */
    getOrderReceiptEnv() {
        // Formerly get_receipt_render_env defined in ScreenWidget.
        return {
            order: this,
            receipt: this.export_for_printing(),
            orderlines: this.get_orderlines(),
            paymentlines: this.get_paymentlines(),
        };
    }
    updatePricelist(newClient) {
        let newClientPricelist, newClientFiscalPosition;
        const defaultFiscalPosition = this.pos.fiscal_positions.find(
            (position) => position.id === this.pos.config.default_fiscal_position_id[0]
        );
        if (newClient) {
            newClientFiscalPosition = newClient.property_account_position_id
                ? this.pos.fiscal_positions.find(
                      (position) => position.id === newClient.property_account_position_id[0]
                  )
                : defaultFiscalPosition;
            newClientPricelist =
                this.pos.pricelists.find(
                    (pricelist) => pricelist.id === newClient.property_product_pricelist[0]
                ) || this.pos.default_pricelist;
        } else {
            newClientFiscalPosition = defaultFiscalPosition;
            newClientPricelist = this.pos.default_pricelist;
        }
        this.set_fiscal_position(newClientFiscalPosition);
        this.set_pricelist(newClientPricelist);
    }
    /* ---- Ship later --- */
    set_to_ship(to_ship) {
        this.assert_editable();
        this.to_ship = to_ship;
    }
    is_to_ship(){
        return this.to_ship;
    }
    getHasRefundLines() {
        for (const line of this.get_orderlines()) {
            if (line.refunded_orderline_id) {
                return true;
            }
        }
        return false;
    }
    /**
     * Returns false if the current order is empty and has no payments.
     * @returns {boolean}
     */
    _isValidEmptyOrder() {
        if (this.get_orderlines().length == 0) {
            return this.get_paymentlines().length != 0;
        } else {
            return true;
        }
    }
}
PosModelRegistry.add(Order);

return {
    register_payment_method,
    load_fields,
    load_models,
    PosGlobalState,
    Product,
    Orderline,
    Packlotline,
    Payment,
    Order,
};

});
