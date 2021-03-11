odoo.define('point_of_sale.PointOfSaleModel', function (require) {
    'use strict';

    const env = require('web.env');
    const OrderFetcher = require('point_of_sale.OrderFetcher');
    const BarcodeParser = require('barcodes.BarcodeParser');
    const BarcodeReader = require('point_of_sale.BarcodeReader');
    // IMPROVEMENT: maybe extract the htmlToImg method from Printer to avoid this Printer dependency.
    const { Printer } = require('point_of_sale.Printer');
    const devices = require('point_of_sale.devices');
    const time = require('web.time');
    const { _t, qweb } = require('web.core');
    const { format, parse } = require('web.field_utils');
    const { round_decimals, round_precision, float_is_zero, unaccent, is_email } = require('web.utils');
    const { cloneDeep, uuidv4, sum, maxDateString, generateWrappedName } = require('point_of_sale.utils');
    const { EventBus } = owl.core;
    const { Component } = owl;
    const { onMounted, onWillUnmount, useSubEnv } = owl.hooks;
    const { getImplementation } = require('point_of_sale.PaymentInterface');

    class PointOfSaleModel extends EventBus {
        constructor(webClient, searchLimit = 100) {
            super(...arguments);
            this.setup(webClient, searchLimit);
        }
        /**
         * `constructor` is not patchable so we introduce this method as alternative
         * to be able to patch the initialization of this class.
         * This is a good place to declare the top-level fields.
         */
        setup(webClient, searchLimit) {
            this.data = {
                records: this._initDataRecords(),
                derived: this._initDataDerived(),
                uiState: this._initDataUiState(),
                fields: {},
            };
            this.searchLimit = searchLimit;
            this.webClient = webClient;
            this.barcodeReader = new BarcodeReader({ model: this });
            this.orderFetcher = new OrderFetcher(this);
            this.proxy = new devices.ProxyDevice(this);
            this.proxy_queue = new devices.JobQueue();
            this.customerDisplayWindow = null;
            this.extrasFieldsMap = this._defineExtrasFields();
            // other top-level fields (@see _assignTopLevelFields)
            // Declare here in case it is needed before mounting `PointOfSaleUI`.
            this.session = {};
            this.config = {};
            this.company = {};
            this.currency = {};
            this.cashRounding = {};
            this.companyCurrency = {};
            this.user = {};
            this.pickingType = {};
            this.backStatement = {};
            this.version = {};
        }
        useModel() {
            const component = Component.current;
            useSubEnv({ actionHandler: this.actionHandler.bind(this) });
            onMounted(() => {
                this.on('ACTION_DONE', this, () => {
                    component.render();
                });
            });
            onWillUnmount(() => {
                this.off('ACTION_DONE', this);
            });
        }
        /**
         * @param {Object} action
         * @param {string} action.name
         * @param {any[]} action.args args needed by the action
         */
        async actionHandler(action) {
            try {
                const handler = this[action.name];
                if (!handler) throw new Error(`Action '${action.name}' is not defined.`);
                return await handler.call(this, ...(action.args || []));
            } finally {
                this.trigger('ACTION_DONE');
                this.persistActiveOrder();
                // NOTE: Calling this only on actions that involve the activeOrder is better performance-wise.
                this._updateCustomerDisplay();
            }
        }
        /**
         * Declare the containers of the models that are dynamic in the pos ui and those that are not
         * loaded during `load_pos_data`. We don't declare `res.partner` here even though it is dynamic
         * since it is part of the loaded records.
         */
        _initDataRecords() {
            return {
                ['pos.order']: {},
                ['pos.order.line']: {},
                ['pos.payment']: {},
                ['pos.pack.operation.lot']: {},
            };
        }
        /**
         * Declare here the initial values of the data that will be derived after `load_pos_data`.
         */
        _initDataDerived() {
            return {
                decimalPrecisionByName: {},
                productByBarcode: {},
                fiscalPositionTaxMaps: {},
                // sorted payment methods (cash method first)
                paymentMethods: [],
                // Maps the `use_payment_terminal` field of a payment method to its `PaymentInterface` implementation _instance_.
                paymentTerminals: {},
                // it's value can be one of the three:
                // 'NO_ROUNDING' | 'WITH_ROUNDING' | 'ONLY_CASH_ROUNDING'
                roundingScheme: 'NO_ROUNDING',
                companyLogoBase64: false,
                categoryParent: {},
                categoryChildren: {},
                categoryAncestors: {},
                /**
                 * The idea is to construct this search string which will contain all the partners.
                 * Then, we pattern match the string to get the ids of the search result.
                 * The search string will look like:
                 * ```
                 *  1:partner 1 name|partner 1 address...
                 *  2:partner 2 name|partner 2 address...
                 * ```
                 */
                partnerSearchString: '',
                // Contains similar string values as `partnerSearchString`, keyed by category id.
                categorySearchStrings: {},
                productsByCategoryId: { 0: [] },
                attributes_by_ptal_id: {},
                partnerByBarcode: {},
                latestWriteDates: {},
            };
        }
        /**
         * Declare here the initial values of all the global ui states.
         */
        _initDataUiState() {
            return {
                loading: {
                    state: 'LOADING', // 'LOADING' | 'READY' | 'CLOSING'
                    message: 'Loading',
                },
                showOfflineError: true,
                previousScreen: '',
                activeScreen: '',
                activeScreenProps: {},
                activeOrderId: false,
                activeCategoryId: 0,
                TicketScreen: {
                    filter: undefined,
                    searchDetails: {},
                },
                OrderManagementScreen: {
                    managementOrderIds: new Set([]),
                    activeOrderId: false,
                    searchTerm: '',
                },
            };
        }
        /**
         * Maps model name -> _extras fields
         * Declare here the _extras signature of the model. Each field
         * should be serializeable because `_extras` is part of a record which
         * is saved in the localStorage.
         * IMPROVEMENT: use the defined type for validation.
         */
        _defineExtrasFields() {
            return {
                'pos.order': {
                    activeScreen: 'string',
                    activeOrderlineId: 'string',
                    activePaymentId: 'string',
                    uid: 'string',
                    // when this is set, it also means that the order is validated and
                    // that it is supposed to be synced. So if this extra field has
                    // value, and there is no value set to server_id, it means that
                    // the order failed to sync to the backend.
                    validationDate: 'string',
                    server_id: 'number',
                    ReceiptScreen: {
                        inputEmail: 'string',
                        emailSuccessful: 'boolean',
                        emailNotice: 'string',
                    },
                    printed: 'number',
                    isFromClosedSession: 'boolean',
                    deleted: 'boolean',
                },
                'pos.order.line': {
                    description: 'string',
                    price_extra: 'number',
                    dontMerge: 'boolean',
                },
                'pos.payment': {
                    can_be_reversed: 'boolean',
                },
                'product.product': {
                    image_base64: 'string',
                },
            };
        }

        //#region LOADING

        /**
         * This is called after call to `loadPosData` succeeded.
         */
        async afterLoadPosData() {
            this._loadPersistedOrders();
            if (this.getUseProxy()) {
                await this.actionHandler({ name: 'actionConnectToProxy' });
            }
        }
        /**
         * Method called when the `PointOfSaleUI` component is mounted.
         */
        async loadPosData() {
            const [records, fields] = await this._rpc({
                model: 'pos.session',
                method: 'load_pos_data',
                args: [[odoo.pos_session_id]],
            });
            this._assignDataRecords(records);
            this._assignDataFields(fields);
            await this._assignTopLevelFields();
            await this._assignDataDerived();
        }
        _assignDataRecords(records) {
            Object.assign(this.data.records, records);
        }
        _assignDataFields(fields) {
            Object.assign(this.data.fields, fields);
        }
        async _assignTopLevelFields() {
            this.session = this.getRecord('pos.session', odoo.pos_session_id);
            this.config = this.getRecord('pos.config', this.session.config_id);
            this.company = this.getRecord('res.company', this.config.company_id);
            this.currency = this.getRecord('res.currency', this.config.currency_id);
            this.cashRounding = this.getRecord('account.cash.rounding', this.config.rounding_method);
            this.companyCurrency = this.getRecord('res.currency', this.company.currency_id);
            this.user = this.getRecord('res.users', this.session.user_id);
            this.pickingType = this.getRecord('stock.picking.type', this.config.picking_type_id);
            this.backStatement = this.getRecord('account.bank.statement', this.session.cash_register_id);
            this.version = await this._getVersion();
        }
        async _assignDataDerived() {
            this._setDecimalPrecisionByName();
            this._setFiscalPositionMap();
            this._setupProducts();
            this._setPartnerByBarcode();
            this._initPartnerLatestWriteDate();
            this._setPartnerSearchString();
            this._setPaymentMethods();
            this._setCashRounding();
            await this._setCompanyLogo();
            await this._setBarcodeParser();
        }
        /**
         * Call related methods in setting up product and pos category data.
         */
        _setupProducts() {
            this._processCategories();
            this._setProductByBarcode();
            this._setProductSearchStrings();
            this._setProductAttributes();
        }
        _processCategories() {
            this.setRecord('pos.category', 0, {
                id: 0,
                name: 'Root',
                parent_id: false,
            });
            const categoryParent = this.data.derived.categoryParent;
            const categoryChildren = this.data.derived.categoryChildren;
            const categoryAncestors = this.data.derived.categoryAncestors;
            for (const category of this.getRecords('pos.category')) {
                if (category.id === 0) continue;
                let parentId = category.parent_id;
                if (!parentId || !this.exists('pos.category', parentId)) {
                    parentId = 0;
                }
                categoryParent[category.id] = parentId;
                if (!categoryChildren[parentId]) {
                    categoryChildren[parentId] = [];
                }
                categoryChildren[parentId].push(category.id);
            }
            (function makeAncestors(categoryId, ancestors) {
                categoryAncestors[categoryId] = ancestors;

                ancestors = ancestors.slice(0);
                ancestors.push(categoryId);

                const children = categoryChildren[categoryId] || [];
                for (let i = 0, len = children.length; i < len; i++) {
                    makeAncestors(children[i], ancestors);
                }
            })(0, []);
            this.data.uiState.activeCategoryId = this.config.iface_start_categ_id
                ? this.config.iface_start_categ_id
                : 0;
        }
        _setProductSearchStrings() {
            const productsByCategoryId = this.data.derived.productsByCategoryId;
            const categorySearchStrings = this.data.derived.categorySearchStrings;
            for (const product of this.getRecords('product.product')) {
                if (!product.available_in_pos) continue;
                const searchString = unaccent(this._getProductSearchString(product));
                const categoryId = product.pos_categ_id ? product.pos_categ_id : 0;
                if (!productsByCategoryId[categoryId]) {
                    productsByCategoryId[categoryId] = [];
                }
                productsByCategoryId[categoryId].push(product.id);
                if (categorySearchStrings[categoryId] === undefined) {
                    categorySearchStrings[categoryId] = '';
                }
                categorySearchStrings[categoryId] += searchString;
                for (const ancestor of this.getCategoryAncestorIds(categoryId) || []) {
                    if (!productsByCategoryId[ancestor]) {
                        productsByCategoryId[ancestor] = [];
                    }
                    productsByCategoryId[ancestor].push(product.id);
                    if (categorySearchStrings[ancestor] === undefined) {
                        categorySearchStrings[ancestor] = '';
                    }
                    categorySearchStrings[ancestor] += searchString;
                }
            }
        }
        /**
         * IMPROVEMENT: Perhaps it is better to generalize indexing of records
         * based on other fields. E.g. the products and partners are indexed
         * by barcode here. pos.order can also be indexed by it's name.
         */
        _setProductByBarcode() {
            for (const product of this.getRecords('product.product')) {
                if (!product.barcode) continue;
                if (product.barcode in this.data.derived.productByBarcode) {
                    console.warn(
                        `Failed to set '${product.display_name} (id=${product.id})' to barcode '${product.barcode}'. The barcode is already assign to another product.`
                    );
                    continue;
                }
                this.data.derived.productByBarcode[product.barcode] = product;
            }
        }
        _setPartnerByBarcode() {
            for (const partner of this.getRecords('res.partner')) {
                if (!partner.barcode) continue;
                this.data.derived.partnerByBarcode[partner.barcode] = partner;
            }
        }
        _setDecimalPrecisionByName() {
            for (const dp of this.getRecords('decimal.precision')) {
                this.data.derived.decimalPrecisionByName[dp.name] = dp;
            }
        }
        _setFiscalPositionMap() {
            for (const fiscalPosition of this.getRecords('account.fiscal.position')) {
                const fiscalPositionTaxes = fiscalPosition.tax_ids.map((id) =>
                    this.getRecord('account.fiscal.position.tax', id)
                );
                const taxMapping = {};
                for (const fptax of fiscalPositionTaxes) {
                    // It's possible the single source tax maps to multiple different destination taxes.
                    if (!taxMapping[fptax.tax_src_id]) {
                        taxMapping[fptax.tax_src_id] = [];
                    }
                    taxMapping[fptax.tax_src_id].push(fptax.tax_dest_id);
                }
                this.data.derived.fiscalPositionTaxMaps[fiscalPosition.id] = taxMapping;
            }
        }
        _loadPersistedOrders() {
            this.recoverPersistedOrders();
            const orders = this.getDraftOrders().sort((order1, order2) =>
                order1.date_order > order2.date_order ? -1 : 1
            );
            if (orders.length) {
                this.actionSelectOrder(orders[0]);
            } else {
                const order = this._createDefaultOrder();
                this._setActiveOrderId(order.id);
            }
        }
        _initPartnerLatestWriteDate() {
            this._setLatestWriteDate(
                'res.partner',
                maxDateString(...this.getRecords('res.partner').map((partner) => partner.write_date))
            );
        }
        _setPartnerSearchString() {
            let searchString = '';
            for (const partner of this.getRecords('res.partner')) {
                searchString += this._getPartnerSearchString(partner);
            }
            this.data.derived.partnerSearchString = unaccent(searchString);
        }
        _setPaymentMethods() {
            this.data.derived.paymentMethods = this.getRecords('pos.payment.method').sort((a, b) => {
                if (a.is_cash_count && !b.is_cash_count) {
                    return -1;
                } else if (!a.is_cash_count && b.is_cash_count) {
                    return 1;
                } else {
                    return a.id - b.id;
                }
            });
            for (const paymentMethod of this.data.derived.paymentMethods) {
                this._setPaymentTerminal(paymentMethod);
            }
        }
        _setProductAttributes() {
            const attributes_by_ptal_id = this.data.derived.attributes_by_ptal_id;
            for (const ptav of this.getRecords('product.template.attribute.value')) {
                if (!attributes_by_ptal_id[ptav.attribute_line_id]) {
                    const productAttribute = this.getRecord('product.attribute', ptav.attribute_id);
                    attributes_by_ptal_id[ptav.attribute_line_id] = {
                        id: ptav.attribute_line_id,
                        name: productAttribute.name,
                        display_type: productAttribute.display_type,
                        values: [],
                    };
                }
                const productAttributeValue = this.getRecord(
                    'product.attribute.value',
                    ptav.product_attribute_value_id
                );
                attributes_by_ptal_id[ptav.attribute_line_id].values.push({
                    id: ptav.product_attribute_value_id,
                    name: productAttributeValue.name,
                    is_custom: productAttributeValue.is_custom,
                    html_color: productAttributeValue.html_color,
                    price_extra: ptav.price_extra,
                });
            }
        }
        _setCashRounding() {
            if (this.config.cash_rounding) {
                this.data.derived.roundingScheme = this.config.only_round_cash_method
                    ? 'ONLY_CASH_ROUNDING'
                    : 'WITH_ROUNDING';
            } else {
                this.data.derived.roundingScheme = 'NO_ROUNDING';
            }
        }
        _setCompanyLogo() {
            const companyLogoImg = new Image();
            return new Promise((resolve) => {
                companyLogoImg.onload = () => {
                    let ratio = 1;
                    const targetwidth = 300;
                    const maxheight = 150;
                    if (companyLogoImg.width !== targetwidth) {
                        ratio = targetwidth / companyLogoImg.width;
                    }
                    if (companyLogoImg.height * ratio > maxheight) {
                        ratio = maxheight / companyLogoImg.height;
                    }
                    const width = Math.floor(companyLogoImg.width * ratio);
                    const height = Math.floor(companyLogoImg.height * ratio);
                    const c = document.createElement('canvas');
                    c.width = width;
                    c.height = height;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(companyLogoImg, 0, 0, width, height);
                    this.data.derived.companyLogoBase64 = c.toDataURL();
                    resolve();
                };
                companyLogoImg.onerror = () => {
                    console.warn(_t('Unexpected error when loading company logo.'));
                };
                companyLogoImg.crossOrigin = 'anonymous';
                companyLogoImg.src =
                    '/web/binary/company_logo' +
                    '?dbname=' +
                    env.session.db +
                    '&company=' +
                    this.company.id +
                    '&_' +
                    Math.random();
            });
        }
        /**
         * Barcode can only be loaded/configured when the config is loaded.
         */
        async _setBarcodeParser() {
            const barcodeParser = new BarcodeParser({ nomenclature_id: [this.config.barcode_nomenclature_id] });
            await barcodeParser.is_loaded();
            this.barcodeReader.set_barcode_parser(barcodeParser);
        }
        async _getVersion() {
            return env.session.rpc('/web/webclient/version_info', {});
        }
        /**
         * This method instantiates the PaymentInterface implementation that corresponds
         * to the `use_payment_terminal` of the given `paymentMethod`.
         * @see PaymentInterface
         * @see _setPaymentMethods
         * @param {'pos.payment.method'} paymentMethod
         */
        _setPaymentTerminal(paymentMethod) {
            const paymentTerminals = this.data.derived.paymentTerminals;
            const terminalName = paymentMethod.use_payment_terminal;
            if (terminalName && !(terminalName in paymentTerminals)) {
                const Implementation = getImplementation(terminalName);
                if (!Implementation) {
                    throw new Error(
                        `PaymentInterface implementation of '${terminalName}' for payment method '${paymentMethod.name}' is missing.`
                    );
                }
                paymentTerminals[terminalName] = new Implementation(this, paymentMethod);
            }
        }

        //#endregion LOADING

        //#region UTILITY

        /**
         * Checks if there is an existing `model` record for the given `id`.
         * @param
         */
        exists(model, id) {
            if (!(model in this.data.records)) return false;
            return id in this.data.records[model];
        }
        _getNextId() {
            return uuidv4();
        }
        _createDefaultOrder() {
            const sequenceNumber = this.session.sequence_number;
            const uid = this._generateOrderUID(sequenceNumber);
            this.session.sequence_number++;
            const newOrder = this.createRecord(
                'pos.order',
                {
                    id: uid,
                    fiscal_position_id: this.config.default_fiscal_position_id,
                    pricelist_id: this.config.pricelist_id,
                    sequence_number: sequenceNumber,
                    session_id: this.session.id,
                    user_id: this.user.id,
                    state: 'draft',
                },
                this._defaultOrderExtras(uid)
            );
            return newOrder;
        }
        _defaultOrderExtras(uid) {
            return {
                uid,
                activeScreen: 'ProductScreen',
                ReceiptScreen: {
                    inputEmail: '',
                    // if null, email is not yet sent
                    emailSuccessful: null,
                    emailNotice: '',
                },
                printed: 0,
                deleted: false,
            };
        }
        _createOrderline(vals, extras) {
            return this.createRecord('pos.order.line', vals, extras);
        }
        /**
         * Returns true if the given screen can be set a active screen of an order.
         * @param {string} screen
         * @return {boolean}
         */
        _shouldSetScreenToOrder(screen) {
            return ['ProductScreen', 'PaymentScreen', 'ReceiptScreen', 'TipScreen'].includes(screen);
        }
        /**
         * @param {'pos.order'} order
         * @param {string} screen one of the available screens
         */
        _setScreenToOrder(order, screen) {
            order._extras.activeScreen = screen;
        }
        _canBeMergedWith(existingLine, line2merge) {
            const existingLineUnit = this.getOrderlineUnit(existingLine);
            const existingLineProduct = this.getRecord('product.product', existingLine.product_id);
            if (existingLine.product_id !== line2merge.product_id) {
                return false;
            } else if (!existingLineUnit || !existingLineUnit.is_pos_groupable) {
                return false;
            } else if (existingLine.discount > 0) {
                return false;
            } else if (
                existingLineProduct.tracking == 'lot' &&
                (this.pickingType.use_create_lots || this.pickingType.use_existing_lots)
            ) {
                return false;
            } else if (existingLine._extras.description !== line2merge._extras.description) {
                return false;
            } else if (
                !float_is_zero(
                    this.getOrderlineUnitPrice(existingLine) - this.getOrderlineUnitPrice(line2merge),
                    this.currency.decimal_places
                )
            ) {
                return false;
            } else {
                return true;
            }
        }
        _getProductSearchString(product) {
            let str = product.display_name;
            if (product.barcode) {
                str += '|' + product.barcode;
            }
            if (product.default_code) {
                str += '|' + product.default_code;
            }
            if (product.description) {
                str += '|' + product.description;
            }
            if (product.description_sale) {
                str += '|' + product.description_sale;
            }
            return product.id + ':' + str.replace(/:/g, '') + '\n';
        }
        _getPartnerSearchString(partner) {
            let str = partner.name || '';
            if (partner.barcode) {
                str += '|' + partner.barcode;
            }
            const address = this.getAddress(partner);
            if (address) {
                str += '|' + address;
            }
            if (partner.phone) {
                str += '|' + partner.phone.split(' ').join('');
            }
            if (partner.mobile) {
                str += '|' + partner.mobile.split(' ').join('');
            }
            if (partner.email) {
                str += '|' + partner.email;
            }
            if (partner.vat) {
                str += '|' + partner.vat;
            }
            str = '' + partner.id + ':' + str.replace(':', '') + '\n';
            return str;
        }
        _setLatestWriteDate(model, date) {
            this.data.derived.latestWriteDates[model] = date;
        }
        _getShouldBeConfigured(product) {
            return (
                this.config.product_configurator &&
                _.some(product.attribute_line_ids, (id) => id in this.data.derived.attributes_by_ptal_id)
            );
        }
        _getOrderTaxDetails(linesTaxDetails) {
            const details = {};
            for (const taxDetail of linesTaxDetails) {
                for (const id in taxDetail) {
                    if (details[id]) {
                        details[id] += taxDetail[id];
                    } else {
                        details[id] = taxDetail[id];
                    }
                }
            }
            return Object.keys(details).map((taxId) => {
                const tax = this.getRecord('account.tax', taxId);
                return {
                    amount: details[taxId],
                    tax: tax,
                    name: tax.name,
                };
            });
        }
        _generateOrderUID(sequenceNumber) {
            // Generates a public identification number for the order.
            // The generated number must be unique and sequential. They are made 12 digit long
            // to fit into EAN-13 barcodes, should it be needed
            const zero_pad = (num, size) => {
                let s = '' + num;
                while (s.length < size) {
                    s = '0' + s;
                }
                return s;
            };
            return (
                zero_pad(this.session.id, 5) + '-' + zero_pad(odoo.login_number, 3) + '-' + zero_pad(sequenceNumber, 4)
            );
        }
        /**
         * There is no flag in the orm model stating that a unit price is manually set
         * in an orderline. So we proxy it with this method such that if the current
         * `price_unit` is zero, then it's unit price is _not_ manually set. This means
         * that orderline's unit price is computed based on the price list computation.
         * Otherwise, we use the _manually_ set `price_unit`. @see getOrderlineUnitPrice
         *
         * @param {'pos.order.line'} orderline
         * @return {boolean}
         */
        _isManualPrice(orderline) {
            return orderline.price_manually_set;
        }
        /**
         * @param {'pos.pack.operation.lot'[]} existingPackLots
         * @param {{ id: string | undefined, text: string }[]} modifications
         * @return {[{ id: string, text: string }[], { text: string }[], Set<string>]}
         */
        _getPackLotChanges(existingPackLots, modifications) {
            const toUpdate = [];
            const toAdd = [];
            const toRemove = [];
            for (const modif of modifications) {
                if (modif.id) {
                    toUpdate.push({ id: modif.id, text: modif.text });
                } else {
                    toAdd.push({ text: modif.text });
                }
            }
            const toUpdateIds = new Set(toUpdate.map((item) => item.id));
            for (const existingLot of existingPackLots) {
                if (!toUpdateIds.has(existingLot.id)) {
                    toRemove.push(existingLot.id);
                }
            }
            return [toUpdate, toAdd, new Set(toRemove)];
        }
        /**
         * Returns the formatted value based on the session's currency or explicitly provided
         * currency. Number of decimal places will be based on the currency's decimal places
         * or on the digits of provided precision name.
         * @param {number} value
         * @param {object} [options]
         * @param {string?} [options.precisionName]
         * @param {'res.currency'?} [options.currency]
         * @param {boolean?} [options.withSymbol]
         */
        formatValue(value, options = {}) {
            const currency = options.currency || this.currency;
            let decimalPlaces = currency.decimal_places;
            if (options.precisionName) {
                const dp = this.getDecimalPrecision(options.precisionName);
                // Would be nice to log a warning if dp is not found. It might not be loaded
                // or the provided name is invalid.
                decimalPlaces = dp ? dp.digits : decimalPlaces;
            }
            return options.withSymbol
                ? format.monetary(value, undefined, { currency, digits: [false, decimalPlaces], forceString: true })
                : format.float(value, undefined, { currency, digits: [false, decimalPlaces] });
        }
        formatCurrency(value, precisionName = false) {
            const currency = this.currency;
            return this.formatValue(value, { currency, precisionName, withSymbol: true });
        }
        formatCurrencyNoSymbol(value, precisionName = false) {
            const currency = this.currency;
            return this.formatValue(value, { currency, precisionName, withSymbol: false });
        }
        /**
         * Returns the fields info of the given model.
         * @param {string} model
         * @return {object}
         */
        getModelFields(model) {
            return this.data.fields[model];
        }
        /**
         * Creates a model record based on the given vals and extras.
         * @param {string} model name of the ORM model
         * @param {object} vals an object to create the record
         * @param {object} extras saved to `_extras` field of a record
         */
        createRecord(model, vals, extras) {
            const fields = this.getModelFields(model);
            if (!fields) throw new Error(`No field definitions for '${model}' model.`);
            const record = {};
            for (const name in fields) {
                const fieldsInfo = fields[name];
                switch (fieldsInfo.type) {
                    case 'integer':
                    case 'float':
                    case 'monetary':
                        record[name] = vals[name] || 0;
                        break;
                    case 'many2many':
                    case 'one2many':
                        record[name] = vals[name] || [];
                        break;
                    case 'boolean':
                    case 'many2one':
                        record[name] = vals[name] || false;
                        break;
                    case 'datetime':
                    case 'date':
                        // Set date as string so that it's not a speciale case during
                        // serialization (e.g. saving to localStorage). Convert it
                        // to Date object when necessary.
                        record[name] = vals[name] || new Date().toISOString();
                        break;
                    case 'text':
                    case 'char':
                        record[name] = vals[name] || '';
                        break;
                    case 'selection':
                        const choices = fieldsInfo.selection;
                        record[name] = vals[name] || choices[0];
                    default:
                        record[name] = vals[name] || false;
                        break;
                }
            }
            // _extras field will be the container of information that is not defined in the orm model
            if (extras) {
                record._extras = extras;
            }
            this.data.records[model][record.id] = record;
            return record;
        }
        /**
         * Returns a model record of the given id.
         * @param {string} model
         * @param {string | number} id
         */
        getRecord(model, id) {
            if (!(model in this.data.records)) return undefined;
            return this.data.records[model][id];
        }
        /**
         * Returns all the records of the given model, filtered using
         * the given predicate.
         * @param {string} model
         * @param {(record: object) => boolean | undefined} [pred]
         * @return {object[]}
         */
        getRecords(model, pred) {
            if (!(model in this.data.records)) return [];
            if (!pred) return Object.values(this.data.records[model]);
            return Object.values(this.data.records[model]).filter((record) => pred(record));
        }
        /**
         * Manually set an `obj` as a record of a `model`.
         * @param {string} model
         * @param {string | number} id
         * @param {object} obj object that is compatible as record of `model`
         * @param {object | undefined} extras _extras to be set for the obj
         */
        setRecord(model, id, obj, extras) {
            if (extras) {
                if ('_extras' in obj) {
                    Object.assign(obj._extras, extras);
                } else {
                    Object.assign(obj, { _extras: extras });
                }
            }
            this.data.records[model][id] = obj;
        }
        /**
         * Clones a record for a given model.
         * @param {string} model
         * @param {object} record
         * @param {object} [newVals] used to override existing fields of the cloned record
         * @return {object} cloned record
         */
        cloneRecord(model, record, newVals = {}) {
            const newObj = cloneDeep(record, newVals);
            this.data.records[model][newObj.id] = newObj;
            return newObj;
        }
        /**
         * Updates the record of the given id and model using the given vals.
         * @param {string} model
         * @param {object} record
         * @param {object} vals
         * @return {object} modified record
         */
        updateRecord(model, id, vals, extras) {
            if (!vals) vals = {};
            if (!extras) extras = {};
            const record = this.getRecord(model, id);
            if (!record) {
                throw new Error('No record found to update.');
            }
            const fields = this.getModelFields(model);
            for (const field in vals) {
                if (!(field in fields)) continue;
                record[field] = vals[field];
            }
            for (const field in extras) {
                record._extras[field] = extras[field];
            }
            return record;
        }
        /**
         * Deletes the model record of the given id.
         * @param {string} model
         * @param {string | number} id
         */
        deleteRecord(model, id) {
            delete this.data.records[model][id];
        }
        /**
         * Mirror JS method of:
         * compute_all in addons/account/models/account.py
         *
         * Read comments in the python side method for more details about each sub-methods.
         */
        compute_all(taxes, price_unit, quantity, currency_rounding, handle_price_include = true) {
            var self = this;

            // 1) Flatten the taxes.

            var _collect_taxes = function (taxes, all_taxes) {
                taxes.sort(function (tax1, tax2) {
                    return tax1.sequence - tax2.sequence;
                });
                _(taxes).each(function (tax) {
                    if (tax.amount_type === 'group')
                        all_taxes = _collect_taxes(
                            tax.children_tax_ids.map((id) => self.data['account.tax'][id]),
                            all_taxes
                        );
                    else all_taxes.push(tax);
                });
                return all_taxes;
            };
            var collect_taxes = function (taxes) {
                return _collect_taxes(taxes, []);
            };

            taxes = collect_taxes(taxes);

            // 2) Avoid dealing with taxes mixing price_include=False && include_base_amount=True
            // with price_include=True

            var base_excluded_flag = false; // price_include=False && include_base_amount=True
            var included_flag = false; // price_include=True
            _(taxes).each(function (tax) {
                if (tax.price_include) included_flag = true;
                else if (tax.include_base_amount) base_excluded_flag = true;
                if (base_excluded_flag && included_flag)
                    throw new Error(
                        'Unable to mix any taxes being price included with taxes affecting the base amount but not included in price.'
                    );
            });

            // 3) Deal with the rounding methods

            var round_tax = this.company.tax_calculation_rounding_method != 'round_globally';

            var initial_currency_rounding = currency_rounding;
            if (!round_tax) currency_rounding = currency_rounding * 0.00001;

            // 4) Iterate the taxes in the reversed sequence order to retrieve the initial base of the computation.
            var recompute_base = function (base_amount, fixed_amount, percent_amount, division_amount) {
                return (
                    (((base_amount - fixed_amount) / (1.0 + percent_amount / 100.0)) * (100 - division_amount)) / 100
                );
            };

            var base = round_precision(price_unit * quantity, initial_currency_rounding);

            var sign = 1;
            if (base < 0) {
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
            if (handle_price_include) {
                _(taxes.reverse()).each(function (tax) {
                    if (tax.include_base_amount) {
                        base = recompute_base(base, incl_fixed_amount, incl_percent_amount, incl_division_amount);
                        incl_fixed_amount = 0.0;
                        incl_percent_amount = 0.0;
                        incl_division_amount = 0.0;
                        store_included_tax_total = true;
                    }
                    if (tax.price_include) {
                        if (tax.amount_type === 'percent') incl_percent_amount += tax.amount;
                        else if (tax.amount_type === 'division') incl_division_amount += tax.amount;
                        else if (tax.amount_type === 'fixed') incl_fixed_amount += quantity * tax.amount;
                        else {
                            var tax_amount = self._compute_all(tax, base, quantity);
                            incl_fixed_amount += tax_amount;
                            cached_tax_amounts[i] = tax_amount;
                        }
                        if (store_included_tax_total) {
                            total_included_checkpoints[i] = base;
                            store_included_tax_total = false;
                        }
                    }
                    i -= 1;
                });
            }

            var total_excluded = round_precision(
                recompute_base(base, incl_fixed_amount, incl_percent_amount, incl_division_amount),
                initial_currency_rounding
            );
            var total_included = total_excluded;

            // 5) Iterate the taxes in the sequence order to fill missing base/amount values.

            base = total_excluded;

            var taxes_vals = [];
            i = 0;
            var cumulated_tax_included_amount = 0;
            _(taxes.reverse()).each(function (tax) {
                if (tax.price_include && total_included_checkpoints[i] !== undefined) {
                    var tax_amount = total_included_checkpoints[i] - (base + cumulated_tax_included_amount);
                    cumulated_tax_included_amount = 0;
                } else var tax_amount = self._compute_all(tax, base, quantity, true);

                tax_amount = round_precision(tax_amount, currency_rounding);

                if (tax.price_include && total_included_checkpoints[i] === undefined)
                    cumulated_tax_included_amount += tax_amount;

                taxes_vals.push({
                    id: tax.id,
                    name: tax.name,
                    amount: sign * tax_amount,
                    base: sign * round_precision(base, currency_rounding),
                });

                if (tax.include_base_amount) base += tax_amount;

                total_included += tax_amount;
                i += 1;
            });

            return {
                taxes: taxes_vals,
                total_excluded: sign * round_precision(total_excluded, this.currency.rounding),
                total_included: sign * round_precision(total_included, this.currency.rounding),
            };
        }
        /**
         * Mirror JS method of:
         * _compute_amount in addons/account/models/account.py
         */
        _compute_all(tax, base_amount, quantity, price_exclude) {
            if (price_exclude === undefined) var price_include = tax.price_include;
            else var price_include = !price_exclude;
            if (tax.amount_type === 'fixed') {
                var sign_base_amount = Math.sign(base_amount) || 1;
                // Since base amount has been computed with quantity
                // we take the abs of quantity
                // Same logic as bb72dea98de4dae8f59e397f232a0636411d37ce
                return tax.amount * sign_base_amount * Math.abs(quantity);
            }
            if (tax.amount_type === 'percent' && !price_include) {
                return (base_amount * tax.amount) / 100;
            }
            if (tax.amount_type === 'percent' && price_include) {
                return base_amount - base_amount / (1 + tax.amount / 100);
            }
            if (tax.amount_type === 'division' && !price_include) {
                return base_amount / (1 - tax.amount / 100) - base_amount;
            }
            if (tax.amount_type === 'division' && price_include) {
                return base_amount - base_amount * (tax.amount / 100);
            }
            return false;
        }
        /**
         * @param {number} productId
         * @param {number} pricelistId
         * @param {number} quantity
         * @return {number}
         */
        _computeProductPrice(productId, pricelistId, quantity) {
            const product = this.getRecord('product.product', productId);
            const pricelist = this.getRecord('product.pricelist', pricelistId);
            const date = moment().startOf('day');

            if (pricelist === undefined) {
                return product.lst_price;
            }

            const category_ids = [];
            let categoryId = product.categ_id;
            while (categoryId) {
                category_ids.push(categoryId);
                categoryId = this.getRecord('product.category', categoryId).parent_id;
            }

            const pricelistItems = pricelist.item_ids
                .map((itemId) => this.getRecord('product.pricelist.item', itemId))
                .filter((item) => {
                    return (
                        (!item.product_tmpl_id || item.product_tmpl_id === product.product_tmpl_id) &&
                        (!item.product_id || item.product_id === product.id) &&
                        (!item.categ_id || category_ids.includes(item.categ_id)) &&
                        (!item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                        (!item.date_end || moment(item.date_end).isSameOrAfter(date))
                    );
                });

            let price = product.lst_price;
            pricelistItems.find((rule) => {
                if (rule.min_quantity && quantity < rule.min_quantity) {
                    return false;
                }

                if (rule.base === 'pricelist') {
                    price = this._computeProductPrice(productId, rule.base_pricelist_id, quantity);
                } else if (rule.base === 'standard_price') {
                    price = product.standard_price;
                }

                if (rule.compute_price === 'fixed') {
                    price = rule.fixed_price;
                    return true;
                } else if (rule.compute_price === 'percentage') {
                    price = price - price * (rule.percent_price / 100);
                    return true;
                } else {
                    var price_limit = price;
                    price = price - price * (rule.price_discount / 100);
                    if (rule.price_round) {
                        price = round_precision(price, rule.price_round);
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
        /**
         * /!\ ATTENTION: not the same to `float_compare` of orm.
         *
         * Compares a and b based on the given decimal digits. If decimal digits
         * is not provided, the config's currency will be used.
         * @param {number} a
         * @param {number} b
         * @param {number?} decimalPlaces number of decimal digits
         * @return {-1 | 0 | 1} If a and b are equal, returns 0. If a greater than b, returns 1. Otherwise returns -1.
         */
        floatCompare(a, b, decimalPlaces) {
            if (!decimalPlaces) {
                decimalPlaces = this.currency.decimal_places;
            }
            const delta = a - b;
            if (float_is_zero(delta, decimalPlaces)) return 0;
            return delta > 0 ? 1 : -1;
        }
        /**
         * @param {'pos.order'} order
         * @param {string} email
         * @param {HTMLElement} receiptEl
         */
        async _sendReceipt(order, email, receiptEl) {
            if (!receiptEl) throw new Error("receipt can't be null");
            if (!is_email(email)) {
                return { successful: false, message: _t('Invalid email.') };
            }
            try {
                const printer = new Printer();
                const receiptString = receiptEl.outerHTML;
                const ticketImage = await printer.htmlToImg(receiptString);
                const client = this.getRecord('res.partner', order.partner_id);
                const orderName = this.getOrderName(order);
                const orderClient = {
                    email,
                    name: client ? client.name : email,
                };
                const order_server_id = order._extras.server_id;
                await this._rpc({
                    model: 'pos.order',
                    method: 'action_receipt_to_customer',
                    args: [[order_server_id], orderName, orderClient, ticketImage],
                });
                return { successful: true, message: _t('Email sent.') };
            } catch (error) {
                return { successful: false, message: _t('Sending email failed. Please try again.') };
            }
        }
        /**
         * Returns the tip orderline of the given order.
         * @param {'pos.order'} order
         */
        _getTipLine(order) {
            return this.getOrderlines(order).find((line) => line.product_id === this.config.tip_product_id);
        }
        /**
         * Returns the current tip amount of the given order.
         * @param {'pos.order'} order
         */
        _getExistingTipAmount(order) {
            const tipLine = this._getTipLine(order);
            if (!tipLine) return 0;
            return this.getOrderlineUnitPrice(tipLine);
        }
        /**
         * Sets as tip the provided amount to the order. Removes the tip
         * if the given amount is zero.
         * @param {'pos.order'} order
         * @param {number} amount
         * @returns {'pos.order.line' | undefined} tip orderline
         */
        async _setTip(order, amount) {
            const tipLine = this._getTipLine(order);
            const amountIsZero = this.floatCompare(amount, 0) === 0;
            if (tipLine) {
                if (amountIsZero) {
                    this.actionDeleteOrderline(order, tipLine);
                    return;
                } else {
                    this.updateRecord('pos.order.line', tipLine.id, { price_unit: amount, qty: 1 });
                    return tipLine;
                }
            } else {
                if (amountIsZero) return;
                const tipProduct = this.getRecord('product.product', this.config.tip_product_id);
                return await this.actionAddProduct(order, tipProduct, {
                    qty: 1,
                    price_unit: amount,
                    price_manually_set: true,
                });
            }
        }
        /**
         * Returns true if the given order has at least one cash payment.
         * @param {'pos.order'} order
         * @return {boolean}
         */
        _hasCashPayments(order) {
            const payments = order.payment_ids.map((id) => this.getRecord('pos.payment', id));
            return _.some(payments, (payment) => {
                const paymentMethod = this.getRecord('pos.payment.method', payment.payment_method_id);
                return paymentMethod.is_cash_count;
            });
        }
        /**
         * Remove the payments that are not done from the given order.
         * @param {'pos.order'} order
         */
        _cleanPayments(order) {
            const payments = this.getPayments(order);
            const paymentsToKeep = [];
            const paymentsToDelete = [];
            for (const payment of payments) {
                if (payment.payment_status && payment.payment_status !== 'done') {
                    paymentsToDelete.push(payment);
                } else {
                    paymentsToKeep.push(payment);
                }
            }
            for (const toDelete of paymentsToDelete) {
                this.deleteRecord('pos.payment', toDelete.id);
            }
            this.updateRecord('pos.order', order.id, { payment_ids: paymentsToKeep.map((payment) => payment.id) });
        }
        /**
         * Wraps the `_pushOrders` method to perform extra procedures.
         * It deletes the pushed orders if they're supposed to be deleted,
         * or persist them to make sure what is saved in the localStorage
         * is updated.
         * @param {'pos.order'[]} orders
         */
        async _syncOrders(orders) {
            await this._pushOrders(orders);
            for (const order of orders) {
                if (order._extras.deleted) {
                    this._tryDeleteOrder(order);
                } else {
                    // Persist each order because each was updated during the
                    // _pushOrders call, new information has been added.
                    this.persistOrder(order);
                }
            }
        }
        /**
         * Saves multiple orders to the backend in one request. It also
         * sets the _extras.server_id and account_move to the corresponding order.
         * @param {'pos.order'[]} orders
         * @param {boolean} [draft=false]
         * @return {Promise<{ pos_reference: string, id: number }[]>}
         */
        async _pushOrders(orders, draft = false) {
            const orderData = orders.map((order) => {
                return { id: order.id, data: this.getOrderJSON(order) };
            });
            const result = await this._rpc(
                {
                    model: 'pos.order',
                    method: 'create_from_ui',
                    args: [orderData, draft],
                    kwargs: { context: env.session.user_context },
                },
                {
                    timeout: 30000,
                }
            );
            // IMPROVEMENT: can be optimized if the create_from_ui returns
            // mapping of pos_reference to the id, from O(n2) to O(n).
            for (const { id, pos_reference, account_move } of result) {
                for (const order of orders) {
                    if (this.getOrderName(order) === pos_reference) {
                        order._extras.server_id = id;
                        order.account_move = account_move;
                    }
                }
            }
            return result;
        }
        /**
         * Saves an order to the backend.
         * @param {'pos.order'} order
         * @return {Promise<{ pos_reference: string, id: number, account_move: number } | undefined>}
         */
        async _pushOrder(order) {
            try {
                const result = await this._pushOrders([order]);
                return result[0];
            } catch (error) {
                if (error.message && error.message.code < 0) {
                    this.ui.askUser('OfflineErrorPopup', {
                        title: _t('Unable to sync order'),
                        body: _t(
                            'Check the internet connection then try to sync again by clicking on the red wifi button (upper right of the screen).'
                        ),
                        show: this.data.uiState.showOfflineError,
                    });
                } else if (error.message && error.message.code === 200) {
                    this.ui.askUser('ErrorTracebackPopup', {
                        title: error.message.data.message || _t('Server Error'),
                        body:
                            error.message.data.debug ||
                            _t('The server encountered an error while receiving your order.'),
                    });
                } else {
                    this.ui.askUser('ErrorPopup', {
                        title: _t('Unknown Error'),
                        body: _t('The order could not be sent to the server due to an unknown error'),
                    });
                }
                throw error;
            }
        }
        /**
         * This is a hook method during `actionValidateOrder` which is called (and awaited)
         * after pushing the order to the backend but before any invoicing.
         * @param {'pos.order'} order
         */
        async _postPushOrder(order) {}
        /**
         * @param {'pos.order'} order
         */
        async _invoiceOrder(order) {
            try {
                await this.webClient.do_action('point_of_sale.pos_invoice_report', {
                    additional_context: {
                        active_ids: [order._extras.server_id],
                    },
                });
            } catch (error) {
                this.ui.askUser('ErrorPopup', {
                    title: _t('Please print the invoice from the backend'),
                    body:
                        _t(
                            'The order has been synchronized earlier. Please make the invoice from the backend for the order: '
                        ) + this.getOrderName(order),
                });
                throw error;
            }
        }
        /**
         * @param {{
         *  'pos.order': object[],
         *  'pos.order.line': object[],
         *  'pos.payment': object[],
         *  'pos.pack.operation.lot': object[]
         * }} data
         * @param {Set<number>} closedOrders ids of closed orders
         */
        loadManagementOrders(data, closedOrders) {
            let extras = {};
            for (const model in data) {
                for (const record of data[model]) {
                    if (model === 'pos.order') {
                        this.data.uiState.OrderManagementScreen.managementOrderIds.add(record.id);
                        extras = { isFromClosedSession: closedOrders.has(record.id), server_id: record.id };
                    }
                    this.setRecord(model, record.id, record, extras);
                    extras = {};
                }
            }
        }
        /**
         * Deletes the order with the given id and it's related records (orderline, payment, etc).
         * @param {string | number} orderId
         */
        deleteOrder(orderId) {
            const order = this.getRecord('pos.order', orderId);
            const orderlines = this.getOrderlines(order);
            for (const orderline of orderlines) {
                for (const lotId of orderline.pack_lot_ids) {
                    this.deleteRecord('pos.pack.operation.lot', lotId);
                }
                this.deleteRecord('pos.order.line');
            }
            for (const paymentId of order.payment_ids) {
                this.deleteRecord('pos.payment', paymentId);
            }
            this.deleteRecord('pos.order', orderId);
            this.removePersistedOrder(order);
        }
        async _rpc() {
            try {
                this.ui && this.ui.setSyncStatus('connecting');
                const result = await env.services.rpc(...arguments);
                this.ui && this.ui.setSyncStatus('connected');
                return result;
            } catch (error) {
                this.ui && this.ui.setSyncStatus('disconnected');
                throw error;
            }
        }
        /**
         * If the order should be synced and is not yet properly synced because
         * of missing `_extras.server_id`, then it should not be removed from
         * ram and from localStorage. Instead, flag it as `deleted`. It will completely
         * be deleted during @see actionSyncOrders.
         * @param {'pos.order'} order
         */
        _tryDeleteOrder(order) {
            if (order._extras.validationDate && !order._extras.server_id) {
                order._extras.deleted = true;
            } else {
                this.deleteOrder(order.id);
            }
        }
        /**
         * @return {Promise<string>}
         */
        async renderCustomerDisplay() {
            const order = this.getActiveOrder();
            const orderlines = this.getOrderlines(order);
            for (const line of orderlines) {
                const product = this.getRecord('product.product', line.product_id);
                if (product._extras?.image_base64) continue;
                // If we're using an external device like the IoT Box, we
                // cannot get /web/image?model=product.product because the
                // IoT Box is not logged in and thus doesn't have the access
                // rights to access product.product. So instead we'll base64
                // encode it and embed it in the HTML.
                product._extras = { image_base64: await this._getProductImageBase64(product) };
            }
            return qweb.render('CustomerFacingDisplayOrder', {
                order,
                model: this,
                origin: window.location.origin,
            });
        }
        /**
         * @return {Promise<string>}
         */
        _getProductImageBase64(product) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('CANVAS');
                    const ctx = canvas.getContext('2d');
                    canvas.height = img.height;
                    canvas.width = img.width;
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg'));
                };
                img.crossOrigin = 'use-credentials';
                img.src = `/web/image?model=product.product&field=image_128&id=${product.id}&write_date=${product.write_date}&unique=1`;
            });
        }
        async _updateCustomerDisplay() {
            const renderedHtml = await this.renderCustomerDisplay();
            if (this.customerDisplayWindow) {
                const $renderedHtml = $('<div>').html(renderedHtml);
                $(this.customerDisplayWindow.document.body).html($renderedHtml.find('.pos-customer_facing_display'));
                const orderlines = $(this.customerDisplayWindow.document.body).find('.pos_orderlines_list');
                orderlines.scrollTop(orderlines.prop('scrollHeight'));
            } else {
                this.proxy.update_customer_facing_display(renderedHtml);
            }
        }
        /**
         * Call this when setting new active order. This makes sure that the
         * previous active order is persisted properly before being replaced.
         * @param {string | number} orderId
         */
        _setActiveOrderId(orderId) {
            const currentActiveOrder = this.getActiveOrder();
            if (currentActiveOrder) this.persistOrder(currentActiveOrder);
            this.data.uiState.activeOrderId = orderId;
        }
        /**
         * The active order can be deleted in an action and needs to be replaced. Use
         * this method to properly create new order or select an existing one.
         */
        _setActiveOrderAutomatically() {
            const orders = this.getDraftOrders();
            // IMPROVEMENT: perhaps select the order next to the deleted one instead of the first order
            const orderToSet = orders.length ? orders[0] : this._createDefaultOrder();
            this._setActiveOrderId(orderToSet.id);
        }
        /**
         * Loads the given order data to ram.
         * @param {object} orderData
         * @param {'pos.order'} orderData.order
         * @param {'pos.order.line'[]} orderData.orderlines
         * @param {'pos.payment'[]} orderData.payments
         * @param {'pos.pack.operation.lot'[]} orderData.packlots
         */
        _loadOrderData({ order, orderlines, payments, packlots }) {
            if (!order) return;
            this.setRecord('pos.order', order.id, order);
            for (const line of orderlines) {
                this.setRecord('pos.order.line', line.id, line);
            }
            for (const payment of payments) {
                this.setRecord('pos.payment', payment.id, payment);
            }
            for (const lot of packlots) {
                this.setRecord('pos.pack.operation.lot', lot.id, lot);
            }
        }
        /**
         * Stops the existing electronic payment request.
         * @param {'pos.order'} order
         */
        async _stopElectronicPayment(order) {
            const payments = this.getPayments(order);
            const waitingPayment = payments.find(function (payment) {
                const status = payment.payment_status;
                return status && !['done', 'reversed', 'reversing', 'pending', 'retry'].includes(status);
            });
            if (waitingPayment) {
                await this.actionSendPaymentCancel(order, waitingPayment);
            }
        }

        //#endregion UTILITY

        //#region LIFECYLE HOOKS

        /**
         * This is an async hook that is called before changing screen. It allows to block
         * the changing of screen when one wants to make a network request that needs to
         * be awaited.
         *
         * /!\ ATTENTION: Make sure to not overwhelm this method so that changing screen
         * is still fast.
         *
         * NOTE: willUnmount is not async so this hook is introduced.
         *
         * @param {string} prevScreen
         * @param {string} nextScreen
         */
        async beforeChangeScreen(prevScreen, nextScreen) {
            if (prevScreen === 'PaymentScreen') {
                await this._stopElectronicPayment(this.getActiveOrder());
            }
        }

        //#endregion LIFECYLE HOOKS

        //#region PERSISTENCE OF ORDERS

        /**
         * Returns a string which serves a key to localStorage to save the order.
         * @param {'pos.order'} order
         * @return {string}
         */
        _constructPersistKey(order) {
            return `odoo-pos-data/${this.config.uuid}/${order.session_id}/${order.id}`;
        }
        /**
         * Deconstructs the string created by _constructPersistKey.
         * @param {string} key
         * @return {[string, string, string]}
         */
        _desconstructPersistKey(key) {
            return key.split('/');
        }
        /**
         * Persist the given order to the localStorage.
         * @param {'pos.order'} order
         */
        persistOrder(order) {
            if (!order) return;
            const orderlines = this.getOrderlines(order);
            const payments = this.getPayments(order);
            const packlots = orderlines
                .map((line) => line.pack_lot_ids.map((lotId) => this.getRecord('pos.pack.operation.lot', lotId)))
                .flat();
            const orderData = JSON.stringify({ order, orderlines, payments, packlots });
            localStorage.setItem(this._constructPersistKey(order), orderData);
        }
        /**
         * Persist to the localStorage the active order.
         */
        persistActiveOrder() {
            this.persistOrder(this.getActiveOrder());
        }
        removePersistedOrder(order) {
            localStorage.removeItem(this._constructPersistKey(order));
        }
        recoverPersistedOrders() {
            const ordersToLoad = this._getPersistedOrders();
            for (const [, orderData] of ordersToLoad) {
                this._loadOrderData(orderData);
            }
        }
        /**
         * Returns all the persisted orders in the localStorage that belong to the config of the
         * opened session. May include orders from closed sessions -- those that are not properly
         * synced.
         * @return {[
         *  string,
         *  {
         *      order: 'pos.order',
         *      orderlines: 'pos.order.line'[],
         *      payments: 'pos.payment'[],
         *      packlots: 'pos.pack.operation.lot'[]
         *  }
         * ][]}
         */
        _getPersistedOrders() {
            const orderData = [];
            for (const [key, orderJSON] of Object.entries(localStorage)) {
                const [prefix, configUUID] = this._desconstructPersistKey(key);
                if (!(prefix === 'odoo-pos-data' && configUUID === this.config.uuid)) continue;
                orderData.push([key, JSON.parse(orderJSON)]);
            }
            return orderData;
        }
        getPersistedPaidOrders() {
            return this._getPersistedOrders().filter(([, item]) => item.order._extras.validationDate);
        }
        getPersistedUnpaidOrders() {
            return this._getPersistedOrders().filter(([, item]) => !item.order._extras.validationDate);
        }

        //#endregion PERSISTENCE OF ORDERS

        //#region ACTIONS

        /**
         * @see PointOfSaleUI.mounted
         */
        async actionDoneLoading() {
            this.data.uiState.loading.state = 'READY';
            const startScreen = this.getStartScreen();
            await this.actionShowScreen(startScreen);
        }
        actionSetActiveCategoryId(categoryId) {
            this.data.uiState.activeCategoryId = categoryId;
        }
        /**
         * @param {'pos.order.line'} orderline
         * @return {{ cancelled: boolean }} result
         */
        async actionSetOrderlineLots(orderline) {
            const product = this.getRecord('product.product', orderline.product_id);
            const currentPackLots = orderline.pack_lot_ids.map((lotId) =>
                this.getRecord('pos.pack.operation.lot', lotId)
            );
            const isSingleItem = product.tracking === 'lot';
            const dialogTitle = isSingleItem ? _t('A Lot Number Required') : _t('Serial Numbers Required');
            const [confirm, modifiedPackLots] = await this.ui.askUser('EditListPopup', {
                title: dialogTitle,
                array: currentPackLots.map((lot) => ({ id: lot.id, text: lot.lot_name })),
                isSingleItem,
            });
            if (!confirm) return { cancelled: true };
            const [toUpdate, toAdd, toRemove] = this._getPackLotChanges(currentPackLots, modifiedPackLots);
            for (const item of toUpdate) {
                this.updateRecord('pos.pack.operation.lot', item.id, { lot_name: item.text });
            }
            for (const item of toAdd) {
                const newLot = this.createRecord(
                    'pos.pack.operation.lot',
                    {
                        id: this._getNextId(),
                        lot_name: item.text,
                    },
                    {}
                );
                orderline.pack_lot_ids.push(newLot.id);
            }
            for (const id of toRemove) {
                this.deleteRecord('pos.pack.operation.lot', id);
            }
            orderline.pack_lot_ids = orderline.pack_lot_ids.filter((id) => !toRemove.has(id));
            // automatically set the quantity to the number of lots.
            orderline.qty = orderline.pack_lot_ids.length;
            return { cancelled: false };
        }
        /**
         * @param {'pos.order'} order
         * @param {'product.product'} product
         * @param {Object} [vals] additional field values in creating `pos.order.line`
         * @param {number?} [vals.qty]
         * @param {number?} [vals.price_unit]
         * @param {number?} [vals.discount]
         */
        async actionAddProduct(order, product, vals, extras) {
            if (!vals) vals = {};
            if (!extras) extras = {};
            if (this._getShouldBeConfigured(product)) {
                const attributes = product.attribute_line_ids
                    .map((id) => this.data.derived.attributes_by_ptal_id[id])
                    .filter((attr) => attr !== undefined);
                const [confirmed, productConfig] = await this.ui.askUser('ProductConfiguratorPopup', {
                    product: product,
                    attributes: attributes,
                });
                if (confirmed) {
                    extras.description = productConfig.selected_attributes.join(', ');
                    extras.price_extra = productConfig.price_extra;
                } else {
                    return;
                }
            }
            const line = this._createOrderline(
                {
                    id: this._getNextId(),
                    product_id: product.id,
                    order_id: order.id,
                    qty: vals.qty || 1,
                    price_unit: vals.price_unit,
                    discount: vals.discount,
                    price_manually_set: vals.price_manually_set || false,
                },
                extras
            );
            const mergeWith = this.getOrderlines(order).find((existingLine) =>
                this._canBeMergedWith(existingLine, line)
            );
            if (mergeWith && !line._extras.dontMerge) {
                if (product.tracking === 'serial') {
                    const { cancelled } = await this.actionSetOrderlineLots(mergeWith);
                    if (cancelled) return;
                } else {
                    mergeWith.qty += line.qty;
                }
                this.actionSelectOrderline(order, mergeWith.id)
                return mergeWith;
            } else {
                if (product.tracking === 'serial' || product.tracking === 'lot') {
                    const { cancelled } = await this.actionSetOrderlineLots(line);
                    if (cancelled) {
                        this.deleteRecord('pos.order.line', line.id);
                        return;
                    }
                }
                order.lines.push(line.id);
                this.actionSelectOrderline(order, line.id);
                return line;
            }
        }
        actionSelectOrderline(order, lineID) {
            order._extras.activeOrderlineId = lineID;
        }
        actionUpdateOrderline(orderline, vals) {
            if ('price_unit' in vals) {
                vals['price_manually_set'] = true;
            }
            this.updateRecord('pos.order.line', orderline.id, vals);
        }
        actionDeleteOrderline(order, orderline) {
            // needed to set the new active orderline
            const indexOfDeleted = order.lines.indexOf(orderline.id);
            order.lines = order.lines.filter((id) => id !== orderline.id);
            for (const lotId of orderline.pack_lot_ids) {
                this.deleteRecord('pos.pack.operation.lot', lotId);
            }
            this.deleteRecord('pos.order.line', orderline.id);
            if (order.lines.length) {
                // set as active the orderline with the same index as the deleted
                if (indexOfDeleted === order.lines.length) {
                    this.actionSelectOrderline(order, order.lines[order.lines.length - 1]);
                } else {
                    this.actionSelectOrderline(order, order.lines[indexOfDeleted]);
                }
            }
        }
        async actionShowDecreaseQuantityPopup(order) {
            const orderline = this.getActiveOrderline(order);
            const [confirm, inputNumber] = await this.ui.askUser('NumberPopup', {
                startingValue: orderline.qty,
                title: _t('Set the new quantity'),
            });
            if (!confirm || (confirm && inputNumber === '')) return;
            const currentQuantity = orderline.qty;
            const newQuantity = parse.float(inputNumber);
            const isLastOrderline = order.lines[order.lines.length - 1] === orderline.id;
            if (
                (currentQuantity === 1 && isLastOrderline) ||
                (currentQuantity !== 1 && newQuantity > currentQuantity)
            ) {
                orderline.qty = newQuantity;
            } else {
                const decreasedQuantity = currentQuantity - newQuantity;
                const newLine = this.cloneRecord('pos.order.line', orderline, {
                    qty: -decreasedQuantity,
                    id: this._getNextId(),
                });
                order.lines.push(newLine.id);
                this.actionSelectOrderline(order, newLine.id);
            }
        }
        /**
         * Change the `activeScreen` using the given `screen` and set, if needed,
         * the given screen to the active order.
         * @param {string} screen
         */
        async actionShowScreen(screen, props) {
            if (!props) props = {};
            const prevScreen = this.getActiveScreen();
            if (prevScreen === screen) return;
            await this.beforeChangeScreen(prevScreen, screen);
            if (this._shouldSetScreenToOrder(screen)) {
                this._setScreenToOrder(this.getActiveOrder(), screen);
            }
            this.data.uiState.previousScreen = prevScreen;
            this.data.uiState.activeScreen = screen;
            this.data.uiState.activeScreenProps = props;
        }
        async actionSelectOrder(order) {
            if (this.data.uiState.OrderManagementScreen.managementOrderIds.has(order.id)) {
                this.data.uiState.OrderManagementScreen.activeOrderId = order.id;
            } else {
                this._setActiveOrderId(order.id);
                await this.actionShowScreen(this.getOrderScreen(order));
            }
        }
        actionDeleteOrder(order) {
            this._tryDeleteOrder(order);
            this._setActiveOrderAutomatically();
        }
        actionCreateNewOrder() {
            const newOrder = this._createDefaultOrder();
            this.actionSelectOrder(newOrder);
        }
        /**
         * @param {string} screenToToggle
         */
        async actionToggleScreen(screenToToggle) {
            const activeScreen = this.getActiveScreen();
            const screen = activeScreen === screenToToggle ? this.getPreviousScreen() : screenToToggle;
            await this.actionShowScreen(screen);
        }
        /**
         * @param {string} [filter]
         */
        actionSetTicketScreenFilter(filter) {
            this.data.uiState.TicketScreen.filter = filter;
        }
        /**
         * @param {{ field: string, term: string }} [searchDetails]
         */
        actionSetTicketScreenSearchDetails(searchDetails) {
            this.data.uiState.TicketScreen.searchDetails = searchDetails;
        }
        /**
         * Changing the client in an order should also set the pricelist and
         * fiscal position to the order.
         * @param {number | false} [selectedClientId]
         */
        actionSetClient(order, selectedClientId) {
            if (!selectedClientId) {
                this.updateRecord('pos.order', order.id, {
                    partner_id: false,
                    pricelist_id: this.config.pricelist_id,
                    fiscal_position_id: this.config.default_fiscal_position_id,
                });
            } else {
                const customer = this.getRecord('res.partner', selectedClientId);
                this.updateRecord('pos.order', order.id, {
                    partner_id: customer.id,
                    pricelist_id: customer.property_product_pricelist || this.config.pricelist_id,
                    fiscal_position_id: customer.property_account_position_id || this.config.default_fiscal_position_id,
                });
            }
        }
        async actionLoadUpdatedPartners() {
            const domain = [['write_date', '>', this.getLatestWriteDate('res.partner')]];
            const fieldNames = Object.keys(this.getModelFields('res.partner'));
            try {
                const newPartners = await this._rpc(
                    {
                        model: 'res.partner',
                        method: 'search_read',
                        args: [domain, fieldNames],
                        kwargs: { load: false },
                    },
                    {
                        timeout: 3000,
                        shadow: true,
                    }
                );
                for (const partner of newPartners) {
                    this.setRecord('res.partner', partner.id, partner);
                }
                this._setLatestWriteDate(
                    'res.partner',
                    maxDateString(...newPartners.map((partner) => partner.write_date))
                );
                this._setPartnerSearchString();
            } catch (error) {
                console.warn(error);
            }
        }
        /**
         * @param {'pos.order'} order
         * @param {'pos.payment.method'} paymentMethod
         * @param {number | undefined} amount
         */
        actionAddPayment(order, paymentMethod, amount) {
            // Create a new payment record without an amount.
            const newPayment = this.createRecord(
                'pos.payment',
                {
                    id: this._getNextId(),
                    pos_order_id: order.id,
                    payment_method_id: paymentMethod.id,
                },
                {}
            );
            order.payment_ids.push(newPayment.id);
            amount = amount === undefined ? this.getOrderDue(order) : amount;
            this.updateRecord('pos.payment', newPayment.id, {
                amount,
                payment_status: this.getPaymentTerminal(paymentMethod.id) ? 'pending' : '',
            });
            order._extras.activePaymentId = newPayment.id;
            return newPayment;
        }
        actionSelectPayment(payment) {
            const order = this.getRecord('pos.order', payment.pos_order_id);
            order._extras.activePaymentId = payment.id;
        }
        async actionDeletePayment(payment) {
            const order = this.getRecord('pos.order', payment.pos_order_id);
            // If a paymentline with a payment terminal linked to is removed,
            // the terminal should get a cancel request.
            if (['waiting', 'waitingCard', 'timeout'].includes(payment.payment_status)) {
                const paymentTerminal = this.getPaymentTerminal(payment.payment_method_id);
                await paymentTerminal.send_payment_cancel(order, payment.id);
            }
            this.updateRecord('pos.order', order.id, {
                payment_ids: order.payment_ids.filter((paymentId) => paymentId !== payment.id),
            });
            this.deleteRecord('pos.payment', payment.id);
        }
        actionUpdatePayment(payment, vals) {
            this.updateRecord('pos.payment', payment.id, vals);
        }
        /**
         * Render the next screen when done with the currently active order.
         * Create new order and set the created order as active.
         * @param {string} nextScreen name of screen to render
         */
        async actionOrderDone(order, nextScreen) {
            const newOrder = this._createDefaultOrder();
            this._tryDeleteOrder(order);
            this._setActiveOrderId(newOrder.id);
            await this.actionShowScreen(nextScreen);
        }
        /**
         * Set the pricelist of the active order using the given pricelist id.
         * @param {string} pricelistId
         */
        actionSetPricelist(order, pricelistId) {
            this.updateRecord('pos.order', order.id, { pricelist_id: pricelistId });
        }
        /**
         * Set the fiscal position of the active order using the given fiscal position id.
         * @param {string} fiscalPositionId
         */
        actionSetFiscalPosition(order, fiscalPositionId) {
            this.updateRecord('pos.order', order.id, { fiscal_position_id: fiscalPositionId });
        }
        /**
         * @param {'pos.order'} order
         * @param {HTMLElement} receiptEl
         */
        async actionSendReceipt(order, receiptEl) {
            const { successful, message } = await this._sendReceipt(
                order,
                order._extras.ReceiptScreen.inputEmail,
                receiptEl
            );
            order._extras.ReceiptScreen.emailSuccessful = successful;
            order._extras.ReceiptScreen.emailNotice = message;
        }
        actionToggleToInvoice(order) {
            this.updateRecord('pos.order', order.id, { to_invoice: !order.to_invoice });
        }
        actionToggleToShip(order) {
            this.updateRecord('pos.order', order.id, { to_ship: !order.to_ship });
        }
        async actionAddTip(order) {
            const existingTipAmount = this._getExistingTipAmount(order);
            const hasTip = this.floatCompare(existingTipAmount, 0) !== 0;
            const startingValue = hasTip ? existingTipAmount : this.getOrderChange(order);
            const [confirmed, amountStr] = await this.ui.askUser('NumberPopup', {
                title: hasTip ? _t('Change Tip') : _t('Add Tip'),
                startingValue,
            });
            if (confirmed) {
                const amount = parse.float(amountStr);
                await this._setTip(order, amount);
            }
        }
        async actionSendPaymentRequest(order, payment) {
            for (const _payment of this.getPayments(order)) {
                // Other payment lines can not be reversed anymore
                _payment._extras.can_be_reversed = false;
            }
            const paymentTerminal = this.getPaymentTerminal(payment.payment_method_id);
            // We are calling the method using the actionHandler because we want the ui
            // to reflect the change we made with the payment status.
            // We basically want the ui to rerender before the parent action call is done.
            await this.actionHandler({ name: 'actionSetPaymentStatus', args: [payment, 'waiting'] });
            const isPaymentSuccessful = await paymentTerminal.send_payment_request(payment.id);
            if (isPaymentSuccessful) {
                this.actionSetPaymentStatus(payment, 'done');
                payment._extras.can_be_reversed = paymentTerminal.supports_reversals;
            } else {
                this.actionSetPaymentStatus(payment, 'retry');
            }
        }
        async actionSendPaymentCancel(order, payment) {
            const paymentTerminal = this.getPaymentTerminal(payment.payment_method_id);
            await this.actionHandler({ name: 'actionSetPaymentStatus', args: [payment, 'waitingCancel'] });
            try {
                await paymentTerminal.send_payment_cancel(order, payment.id);
            } finally {
                this.actionSetPaymentStatus(payment, 'retry');
            }
        }
        async actionSendPaymentReverse(order, payment) {
            const paymentTerminal = this.getPaymentTerminal(payment.payment_method_id);
            await this.actionHandler({ name: 'actionSetPaymentStatus', args: [payment, 'reversing'] });
            const isReversalSuccessful = await paymentTerminal.send_payment_reversal(payment.id);
            if (isReversalSuccessful) {
                payment.amount = 0;
                this.actionSetPaymentStatus(payment, 'reversed');
            } else {
                payment._extras.can_be_reversed = false;
                this.actionSetPaymentStatus(payment, 'done');
            }
        }
        async actionSendForceDone(order, payment) {
            this.actionSetPaymentStatus(payment, 'done');
        }
        actionSetPaymentStatus(payment, status) {
            payment.payment_status = status;
        }
        actionSetReceiptInfo(payment, value) {
            payment.ticket += value;
        }
        /**
         * @param {'pos.order'} order
         * @param {string} nextScreen
         */
        async actionValidateOrder(order, nextScreen) {
            this._cleanPayments(order);
            if (this._hasCashPayments(order) && this.proxy.printer && this.config.iface_cashdrawer) {
                this.proxy.printer.open_cashbox();
            }
            try {
                order._extras.validationDate = new Date().toISOString();
                await this._pushOrder(order);
                await this._postPushOrder(order);
                if (order.to_invoice) {
                    await this._invoiceOrder(order);
                }
            } finally {
                await this.actionShowScreen(nextScreen);
            }
        }
        /**
         * Sync remaining unsynced orders.
         */
        async actionSyncOrders() {
            try {
                const unsyncedOrders = this.getOrdersToSync();
                if (!unsyncedOrders.length) return;
                await this._syncOrders(unsyncedOrders);
            } catch (error) {
                this.ui.askUser('ErrorPopup', {
                    title: _t('Failed to sync orders'),
                    body: _t(
                        'Check the internet connection then try to sync again by clicking on the red wifi button (upper right of the screen).'
                    ),
                });
            }
        }
        async actionsetNPerPage(val) {
            await this.orderFetcher.setNPerPage(val);
        }
        async actionSearch(domain) {
            await this.orderFetcher.setSearchDomain(domain);
        }
        async actionNextPage() {
            await this.orderFetcher.nextPage();
        }
        async actionPrevPage() {
            await this.orderFetcher.prevPage();
        }
        async actionClosePos() {
            const ordersToSync = this.getOrdersToSync();
            if (!ordersToSync.length) {
                window.location = '/web#action=point_of_sale.action_client_pos_menu';
            } else {
                // If there are orders in the db left unsynced, we try to sync.
                // If sync successful, close without asking.
                // Otherwise, ask again saying that some orders are not yet synced.
                try {
                    await this._syncOrders(ordersToSync);
                    window.location = '/web#action=point_of_sale.action_client_pos_menu';
                } catch (error) {
                    if (error instanceof Error) throw error;
                    let message;
                    if (error.message && error.message.code === 200) {
                        message = _t(
                            'Some orders could not be submitted to ' +
                                'the server due to configuration errors. ' +
                                'You can exit the Point of Sale, but do ' +
                                'not close the session before the issue ' +
                                'has been resolved.'
                        );
                    } else {
                        message = _t(
                            'Some orders could not be submitted to ' +
                                'the server due to internet connection issues. ' +
                                'You can exit the Point of Sale, but do ' +
                                'not close the session before the issue ' +
                                'has been resolved.'
                        );
                    }
                    const confirmed = await this.ui.askUser('ConfirmPopup', {
                        title: _t('Offline Orders'),
                        body: message,
                    });
                    if (confirmed) {
                        window.location = '/web#action=point_of_sale.action_client_pos_menu';
                    }
                }
            }
        }
        /**
         * This removes orders from ram and from localStorage. Takes `orders` param
         * with signature similar to the return of @see _getPersistedOrders.
         */
        async actionRemoveOrders(orders) {
            for (const [key, { order }] of orders) {
                localStorage.removeItem(key);
                if (this.exists('pos.order', order.id)) {
                    this.deleteOrder(order.id);
                }
            }
            // If the active order is also deleted, we make sure to set a new one.
            if (!this.getActiveOrder()) {
                this._setActiveOrderAutomatically();
                await this.actionShowScreen(this.getOrderScreen(this.getActiveOrder()));
            }
        }
        /**
         * This imports paid or unpaid orders from a json file whose
         * contents are provided as the string str.
         * It returns a report of what could and what could not be
         * imported.
         */
        actionImportOrders(str) {
            const json = JSON.parse(str);
            const report = {
                // Number of paid orders that were imported
                paid: 0,
                // Number of unpaid orders that were imported
                unpaid: 0,
                // Orders that were not imported because they already exist (uid conflict)
                unpaid_skipped_existing: 0,
                // Orders that were not imported because they belong to another session
                unpaid_skipped_session: 0,
                // The list of session ids to which skipped orders belong.
                unpaid_skipped_sessions: [],
            };
            if (json.paid_orders) {
                for (const [key, orderData] of json.paid_orders) {
                    this._loadOrderData(orderData);
                    localStorage.setItem(key, JSON.stringify(orderData));
                }
                report.paid = json.paid_orders.length;
            }
            if (json.unpaid_orders) {
                let ordersToLoad = [];
                const skipped_sessions = {};
                for (const [key, orderData] of json.unpaid_orders) {
                    const order = orderData.order;
                    if (order.session_id !== this.session.id) {
                        report.unpaid_skipped_session += 1;
                        skipped_sessions[order.session_id] = true;
                    } else if (this.exists('pos.order', order.id)) {
                        report.unpaid_skipped_existing += 1;
                    } else {
                        ordersToLoad.push([key, orderData]);
                    }
                }
                // IMPROVEMENT: Is this sorting necessary?
                ordersToLoad = ordersToLoad.sort(function (a, b) {
                    const [, { order: orderA }] = a;
                    const [, { order: orderB }] = b;
                    return orderA.sequence_number - orderB.sequence_number;
                });
                for (const [key, orderData] of ordersToLoad) {
                    this._loadOrderData(orderData);
                    localStorage.setItem(key, JSON.stringify(orderData));
                }
                report.unpaid = ordersToLoad.length;
                report.unpaid_skipped_sessions = _.keys(skipped_sessions);
            }
            return report;
        }
        async actionPrintSalesDetails() {
            const saleDetails = await this._rpc({
                model: 'report.point_of_sale.report_saledetails',
                method: 'get_sale_details',
                args: [false, false, false, [this.session.id]],
            });
            const report = qweb.render(
                'SaleDetailsReport',
                Object.assign({}, saleDetails, {
                    date: new Date().toLocaleString(),
                    model: this,
                })
            );
            // IMPROVEMENT: Allow downloading the report as image/pdf.
            // Strategy used in `htmlToImg` can be employed.
            if (this.proxy.printer) {
                const printResult = await this.proxy.printer.print_receipt(report);
                if (!printResult.successful) {
                    await this.ui.askUser('ErrorPopup', {
                        title: printResult.message.title,
                        body: printResult.message.body,
                    });
                }
            }
        }
        async actionLoadDemoData() {
            const confirmed = await this.ui.askUser('ConfirmPopup', {
                title: _t('You do not have any products'),
                body: _t('Would you like to load demo data?'),
                confirmText: this.env._t('Yes'),
                cancelText: this.env._t('No'),
            });
            if (confirmed) {
                await this._rpc({
                    route: '/pos/load_onboarding_data',
                });
                const { products, categories } = await this._rpc({
                    model: 'pos.session',
                    method: 'get_onboarding_data',
                    args: [],
                });
                this.data.records['product.product'] = products;
                this.data.records['pos.category'] = categories;
                this._setupProducts();
            }
        }
        async actionConnectToProxy() {
            // TODO jcb: ui indicator that pos is connecting to iot
            this.barcodeReader.disconnect_from_proxy();
            // this.setLoadingMessage(_t('Connecting to the IoT Box'), 0);
            // this.showLoadingSkip(function () {
            //     this.proxy.stop_searching();
            // });
            try {
                await this.proxy.autoconnect({
                    force_ip: this.config.proxy_ip || undefined,
                    progress: function (prog) {
                        // this.setLoadingProgress(prog);
                    },
                });
                if (this.config.iface_scan_via_proxy) {
                    this.barcodeReader.connect_to_proxy(this.proxy);
                }
            } catch (error) {
                if (error instanceof Error) throw error;
                const [statusText, url] = error;
                if (statusText == 'error' && window.location.protocol == 'https:') {
                    this.ui.askUser('ErrorPopup', {
                        title: _t('HTTPS connection to IoT Box failed'),
                        body: _.str.sprintf(
                            _t(
                                'Make sure you are using IoT Box v18.12 or higher. Navigate to %s to accept the certificate of your IoT Box.'
                            ),
                            url
                        ),
                    });
                }
            }
        }

        //#endregion ACTIONS

        //#region GETTERS

        getLoadingMessage() {
            return this.data.uiState.loading.message;
        }
        getLatestWriteDate(model) {
            return this.data.derived.latestWriteDates[model];
        }
        getActiveScreen() {
            return this.data.uiState.activeScreen;
        }
        getActiveScreenProps() {
            return Object.assign({}, this.data.uiState.activeScreenProps, { activeOrder: this.getActiveOrder() });
        }
        /**
         * Returns the active screen of the given order.
         * @param {'pos.order'} order
         * @return {string}
         */
        getOrderScreen(order) {
            return order._extras.activeScreen || 'ProductScreen';
        }
        getActiveOrder() {
            return this.getRecord('pos.order', this.data.uiState.activeOrderId);
        }
        getOrderName(order) {
            if (order.pos_reference) return order.pos_reference;
            return _.str.sprintf(_t('Order %s'), order._extras.uid);
        }
        getOrderTotals(order) {
            const orderlines = this.getOrderlines(order);
            let noTaxNoDiscount = 0,
                noTaxWithDiscount = 0,
                withTaxNoDiscount = 0,
                withTaxWithDiscount = 0,
                totalTax = 0;
            const linesTaxDetails = [];
            for (const line of orderlines) {
                const {
                    priceWithTax,
                    priceWithoutTax,
                    noDiscountPriceWithTax,
                    noDiscountPriceWithoutTax,
                    tax,
                    taxDetails,
                } = this.getOrderlinePrices(line);
                noTaxNoDiscount += noDiscountPriceWithoutTax;
                noTaxWithDiscount += priceWithoutTax;
                withTaxNoDiscount += noDiscountPriceWithTax;
                withTaxWithDiscount += priceWithTax;
                totalTax += tax;
                linesTaxDetails.push(taxDetails);
            }
            const orderTaxDetails = this._getOrderTaxDetails(linesTaxDetails);
            return {
                noTaxNoDiscount,
                noTaxWithDiscount,
                withTaxNoDiscount,
                withTaxWithDiscount,
                totalTax,
                orderTaxDetails,
            };
        }
        /**
         * Returns the rounding value to properly round the give amount.
         * @param {number} amount
         * @return {number}
         */
        getRounding(amount) {
            if (!this.cashRounding) return 0;
            const total = round_precision(amount, this.cashRounding.rounding);
            const sign = total > 0 ? 1.0 : -1.0;
            let rounding_applied = sign * (total - amount);
            // because floor and ceil doesn't include decimals in calculation, we reuse the value of the half-up and adapt it.
            if (float_is_zero(rounding_applied, this.currency.decimals)) {
                return 0;
            } else if (this.cashRounding.rounding_method === 'UP' && rounding_applied < 0) {
                rounding_applied += this.cashRounding.rounding;
            } else if (this.cashRounding.rounding_method === 'DOWN' && rounding_applied > 0) {
                rounding_applied -= this.cashRounding.rounding;
            }
            return sign * rounding_applied;
        }
        /**
         * @param {'pos.order'} order
         * @return {boolean}
         */
        getShouldBeRounded(order) {
            const scheme = this.data.derived.roundingScheme;
            const hasCashPayments = this._hasCashPayments(order);
            return scheme === 'ONLY_CASH_ROUNDING' ? hasCashPayments : scheme === 'WITH_ROUNDING';
        }
        getTotalAmountToPay(order) {
            return this.getOrderTotals(order).withTaxWithDiscount;
        }
        getPaymentsTotalAmount(order) {
            const donePayments = this.getPayments(order).filter((payment) =>
                payment.payment_status ? payment.payment_status === 'done' : true
            );
            return sum(donePayments, (payment) => payment.amount);
        }
        getOrderChange(order) {
            const change = this.getPaymentsTotalAmount(order) - this.getTotalAmountToPay(order);
            if (this.floatCompare(change, 0) > 0) {
                // Convert the change as long as the scheme is NO_ROUNDING, even if there are no
                // cash payments in the order because change is always cash.
                return change + (this.data.derived.roundingScheme !== 'NO_ROUNDING' ? this.getRounding(change) : 0);
            }
            return 0;
        }
        getOrderDue(order) {
            const due = this.getTotalAmountToPay(order) - this.getPaymentsTotalAmount(order);
            if (this.floatCompare(due, 0) > 0) {
                return due + (this.getShouldBeRounded(order) ? this.getRounding(due) : 0);
            }
            return 0;
        }
        getCategoryAncestorIds(categoryId) {
            return this.data.derived.categoryAncestors[categoryId] || [];
        }
        getPartners(queryString) {
            const partnerIds = [];
            if (!queryString) return this.getRecords('res.partner').slice(0, this.searchLimit);
            queryString = queryString
                .replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, '.')
                .replace(/ /g, '.+');
            const re = RegExp('([0-9]+):.*?' + unaccent(queryString), 'gi');
            for (let i = 0; i < this.searchLimit; i++) {
                const r = re.exec(this.data.derived.partnerSearchString);
                if (r) {
                    partnerIds.push(r[1]);
                } else {
                    break;
                }
            }
            return partnerIds.map((id) => this.getRecord('res.partner', id));
        }
        /**
         * @param {string} categoryId
         * @param {string} searchTerm
         */
        getProducts(categoryId, searchTerm) {
            if (!searchTerm) {
                const products = this.data.derived.productsByCategoryId[categoryId] || [];
                return products.map((productId) => this.getRecord('product.product', productId));
            }
            try {
                const query = searchTerm
                    .replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, '.')
                    .replace(/ /g, '.+');
                const re = RegExp('([0-9]+):.*?' + unaccent(query), 'gi');
                const results = [];
                for (let i = 0; i < this.searchLimit; i++) {
                    const r = re.exec(this.data.derived.categorySearchStrings[categoryId]);
                    if (r) {
                        const res = this.getRecord('product.product', r[1]);
                        if (res) results.push(res);
                    } else {
                        break;
                    }
                }
                return results;
            } catch (e) {
                return [];
            }
        }
        /**
         * Returns all the orders including those that are fetched from the backend.
         * @return {'pos.order'[]}
         */
        getOrders(predicate) {
            return this.getRecords('pos.order').filter(predicate);
        }
        getUndeletedOrders() {
            return this.getOrders((order) => order.session_id === odoo.pos_session_id && !order._extras.deleted);
        }
        /**
         * Returns the draft orders -- those without state or has state == 'draft and those
         * not flagged as `deleted`.
         * @return {'pos.order'[]}
         */
        getDraftOrders() {
            return this.getUndeletedOrders().filter((order) => !order.state || order.state === 'draft');
        }
        getPaidOrders() {
            return this.getUndeletedOrders().filter((order) => ['paid', 'invoice'].includes(order.state));
        }
        /**
         * @param {'pos.order' | undefined} order
         * @return {'pos.order.line'[]}
         */
        getOrderlines(order) {
            if (!order) return [];
            return order.lines.map((lineId) => this.getRecord('pos.order.line', lineId));
        }
        /**
         * @param {'pos.order'} order
         * @return {'pos.payment'[]}
         */
        getPayments(order) {
            return order.payment_ids.map((paymentId) => this.getRecord('pos.payment', paymentId));
        }
        /**
         * @param {string} name
         * @returns {'decimal.precision'}
         */
        getDecimalPrecision(name) {
            return this.data.derived.decimalPrecisionByName[name];
        }
        getOrderPricelist(orderId) {
            const order = this.getRecord('pos.order', orderId);
            return this.getRecord('product.pricelist', order.pricelist_id);
        }
        /**
         * @param {string} barcode
         */
        getProductByBarcode(barcode) {
            return this.data.derived.productByBarcode[barcode];
        }
        /**
         * @param {string} barcode
         */
        getPartnerByBarcode(barcode) {
            return this.data.derived.partnerByBarcode[barcode];
        }
        getProductUnit(productId) {
            const product = this.getRecord('product.product', productId);
            if (!productId || !product) return false;
            if (!product.uom_id) return false;
            return this.getRecord('uom.uom', product.uom_id);
        }
        /**
         * Returns the raw price of the product based on the given pricelist and quantity.
         * @param {number} productId
         * @param {number} pricelistId
         * @param {number} quantity
         * @return {number}
         */
        getProductPrice(productId, pricelistId, quantity) {
            const productPrice = this._computeProductPrice(productId, pricelistId, quantity);
            const dp = this.getDecimalPrecision('Product Price');
            return round_decimals(productPrice, dp.digits);
        }
        /**
         * Returns the taxes of the given orderline. It doesn't take into account the fiscal position.
         * @param {'pos.order.line'} orderline
         * @return {'account.tax'[]}
         */
        getOrderlineTaxes(orderline) {
            const product = this.getRecord('product.product', orderline.product_id);
            const taxIds = orderline.tax_ids.length ? orderline.tax_ids : product.taxes_id;
            return taxIds.map((id) => this.getRecord('account.tax', id)).filter(Boolean);
        }
        /**
         * Converts the given taxes to their fiscal position mapping.
         * @param {'account.tax'} taxes
         * @param {number?} fiscalPositionId
         * @return {'account.tax'[]}
         */
        getFiscalPositionTaxes(taxes, fiscalPositionId = false) {
            if (!fiscalPositionId) return taxes;
            const mappedTaxIds = [];
            for (const tax of taxes) {
                for (const destTaxId of this.data.derived.fiscalPositionTaxMaps[fiscalPositionId][tax.id]) {
                    if (!destTaxId) continue;
                    mappedTaxIds.push(destTaxId);
                }
            }
            return _.uniq(mappedTaxIds).map((taxId) => this.getRecord('account.tax', taxId));
        }
        /**
         * Given a base price (which contains included taxes) and the taxes, this method returns
         * the untaxed and fully-taxed amounts.
         * @param {number} basePrice the base price containing included taxes
         * @param {'account.tax'[]} taxes
         * @return {[number, number]} [untaxed, taxed]
         */
        getUnitPrices(basePrice, taxes = []) {
            if (taxes.length === 0) return [basePrice, basePrice];
            const prices = this.compute_all(taxes, basePrice, 1, this.currency.rounding, true);
            return [prices.total_excluded, prices.total_included];
        }
        /**
         * Simply returns the unit price of the given orderline.
         * @param {'pos.order.line'} orderline
         * @return {number}
         */
        getOrderlineUnitPrice(orderline) {
            let unitPrice = orderline._extras.price_extra || 0.0;
            const order = this.getRecord('pos.order', orderline.order_id);
            if (this._isManualPrice(orderline)) {
                unitPrice += orderline.price_unit;
            } else {
                unitPrice += this.getProductPrice(orderline.product_id, order.pricelist_id, orderline.qty);
            }
            return unitPrice;
        }
        getOrderlinePrices(orderline) {
            const unitPrice = this.getOrderlineUnitPrice(orderline);
            const discountedUnitPrice = unitPrice * (1.0 - orderline.discount / 100.0);
            const order = this.getRecord('pos.order', orderline.order_id);
            const taxes = this.getFiscalPositionTaxes(this.getOrderlineTaxes(orderline), order.fiscal_position_id);
            const rounding = this.currency.rounding;

            const [noTaxUnitPrice, withTaxUnitPrice] = this.getUnitPrices(unitPrice, taxes);
            const allTaxes = this.compute_all(taxes, discountedUnitPrice, orderline.qty, rounding, true);
            const allTaxesBeforeDiscount = this.compute_all(taxes, unitPrice, orderline.qty, rounding, true);

            let taxTotal = 0;
            const taxDetails = {};
            for (const tax of allTaxes.taxes) {
                taxTotal += tax.amount;
                taxDetails[tax.id] = tax.amount;
            }

            return {
                priceWithTax: allTaxes.total_included,
                priceWithoutTax: allTaxes.total_excluded,
                noDiscountPriceWithTax: allTaxesBeforeDiscount.total_included,
                noDiscountPriceWithoutTax: allTaxesBeforeDiscount.total_excluded,
                priceSumTaxVoid: allTaxes.total_void,
                tax: taxTotal,
                taxDetails,
                unitPrice,
                noTaxUnitPrice,
                withTaxUnitPrice,
            };
        }
        getActivePayment(order) {
            return this.getRecord('pos.payment', order._extras.activePaymentId);
        }
        getDiscountPolicy(orderline) {
            const order = this.getRecord('pos.order', orderline.order_id);
            const pricelist = this.getRecord('product.pricelist', order.pricelist_id);
            return pricelist.discount_policy;
        }
        getOrderlineUnit(orderline) {
            const product = this.getRecord('product.product', orderline.product_id);
            const unit = this.getRecord('uom.uom', product.uom_id);
            return unit;
        }
        getFullProductName(orderline) {
            if (orderline.full_product_name) return orderline.full_product_name;
            const product = this.getRecord('product.product', orderline.product_id);
            const description = orderline._extras.description;
            return description ? `${product.display_name} (${description})` : product.display_name;
        }
        getQuantityStr(orderline) {
            const product = this.getRecord('product.product', orderline.product_id);
            const unit = this.getRecord('uom.uom', product.uom_id);
            if (unit) {
                if (unit.rounding) {
                    const decimals = this.getDecimalPrecision('Product Unit of Measure').digits;
                    return format.float(orderline.qty, { digits: [false, decimals] });
                } else {
                    return orderline.qty.toFixed(0);
                }
            } else {
                return '' + orderline.qty;
            }
        }
        getOrderlineDisplayPrice(orderlinePrices) {
            return this.config.iface_tax_included === 'subtotal'
                ? orderlinePrices.priceWithoutTax
                : orderlinePrices.priceWithTax;
        }
        getIsZeroDiscount(orderline) {
            return float_is_zero(orderline.discount, 3);
        }
        getCustomer(order) {
            return this.getRecord('res.partner', order.partner_id) || false;
        }
        getCustomerName(order) {
            const customer = this.getCustomer(order);
            return customer ? customer.name : '';
        }
        getAddress(partner) {
            const state = this.getRecord('res.country.state', partner.state_id);
            const country = this.getRecord('res.country', partner.country_id);
            return (
                (partner.street ? partner.street + ', ' : '') +
                (partner.zip ? partner.zip + ', ' : '') +
                (partner.city ? partner.city + ', ' : '') +
                (state ? state.name + ', ' : '') +
                (country ? country.name : '')
            );
        }
        /**
         * Returns a serializeable version of the order that is compatible as argument
         * to the remote 'pos.order' `create_from_ui` method.
         * @param {'pos.order'} order
         */
        getOrderJSON(order) {
            const orderlines = order.lines.map((lineId) => this.getRecord('pos.order.line', lineId));
            const payments = order.payment_ids.map((paymentId) => this.getRecord('pos.payment', paymentId));
            const { withTaxWithDiscount, totalTax } = this.getOrderTotals(order);
            return {
                name: this.getOrderName(order),
                amount_paid: this.getPaymentsTotalAmount(order) - this.getOrderChange(order),
                amount_total: withTaxWithDiscount,
                amount_tax: totalTax,
                amount_return: this.getOrderChange(order),
                lines: orderlines.map((orderline) => [0, 0, this.getOrderlineJSON(orderline)]),
                statement_ids: payments.map((payment) => [0, 0, this.getPaymentJSON(payment)]),
                pos_session_id: order.session_id,
                pricelist_id: order.pricelist_id,
                partner_id: order.partner_id,
                user_id: order.user_id,
                uid: order._extras.uid,
                sequence_number: order.sequence_number,
                creation_date: order._extras.validationDate || order.date_order,
                fiscal_position_id: order.fiscal_position_id,
                server_id: order._extras.server_id || false,
                to_invoice: order.to_invoice,
                is_tipped: order.is_tipped,
                tip_amount: order.tip_amount || 0,
            };
        }
        /**
         * @param {'pos.order.line'} line
         */
        getOrderlineJSON(line) {
            const { priceWithTax, priceWithoutTax } = this.getOrderlinePrices(line);
            return {
                id: line.id,
                qty: line.qty,
                price_unit: this.getOrderlineUnitPrice(line),
                price_manually_set: line.price_manually_set,
                price_subtotal: priceWithoutTax,
                price_subtotal_incl: priceWithTax,
                discount: line.discount,
                product_id: line.product_id,
                tax_ids: [[6, false, this.getOrderlineTaxes(line).map((tax) => tax.id)]],
                pack_lot_ids: line.pack_lot_ids
                    .map((id) => this.getRecord('pos.pack.operation.lot', id))
                    .map((lot) => [0, 0, this.getPackLotJSON(lot)]),
                description: line._extras.description,
                full_product_name: this.getFullProductName(line),
            };
        }
        /**
         * @param {'pos.payment'} payment
         */
        getPaymentJSON(payment) {
            return {
                name: time.datetime_to_str(new Date()),
                payment_method_id: payment.payment_method_id,
                amount: payment.amount,
                payment_status: payment.payment_status,
                ticket: payment.ticket,
                card_type: payment.card_type,
                cardholder_name: payment.cardholder_name,
                transaction_id: payment.transaction_id,
            };
        }
        /**
         * @param {'pos.pack.operation.lot'} lot
         */
        getPackLotJSON(lot) {
            return {
                lot_name: lot.lot_name,
            };
        }
        /**
         * @param {'pos.order'} order
         * @return {'pos.order.line' | undefined} orderline
         */
        getActiveOrderline(order) {
            const id = order._extras.activeOrderlineId;
            return id ? this.getRecord('pos.order.line', id) : undefined;
        }
        getDisallowLineQuantityChange() {
            return false;
        }
        /**
         * @param {number} paymentMethodId
         * @param {PaymentInterface}
         */
        getPaymentTerminal(paymentMethodId) {
            const paymentMethod = this.getRecord('pos.payment.method', paymentMethodId);
            if (!paymentMethod) {
                throw new Error(_t('Payment method not found.'));
            }
            if (!paymentMethod.use_payment_terminal) return undefined;
            return this.data.derived.paymentTerminals[paymentMethod.use_payment_terminal];
        }
        /**
         * Returns the first payment that is not rounded properly.
         * @param {'pos.order'} order
         */
        getInvalidRoundingPayment(order) {
            const paymentsToCheck = this.getPayments(order).filter((payment) => {
                const method = this.getRecord('pos.payment.method', payment.payment_method_id);
                const scheme = this.data.derived.roundingScheme;
                if (scheme === 'NO_ROUNDING') {
                    return false;
                } else if (scheme === 'ONLY_CASH_ROUNDING') {
                    return method.is_cash_count;
                } else {
                    return true;
                }
            });
            for (const payment of paymentsToCheck) {
                const roundedAmount = round_precision(payment.amount, this.cashRounding.rounding);
                const isEqual = this.floatCompare(payment.amount, roundedAmount) === 0;
                if (!isEqual) return payment;
            }
            return undefined;
        }
        getCashierName() {
            return this.user.name;
        }
        /**
         * Return the orders that are supposed to be synced -- meaning, order is validated but it still has no server_id.
         */
        getOrdersToSync() {
            return this.getOrders((order) => order._extras.validationDate && !order._extras.server_id);
        }
        getIsCashierManager() {
            const userGroupIds = this.user?.groups_id || [];
            return userGroupIds.includes(this.config.group_pos_manager_id);
        }
        getStartScreen() {
            const activeOrder = this.getActiveOrder();
            return this.getOrderScreen(activeOrder);
        }
        getUseProxy() {
            return (
                this.config.is_posbox &&
                (this.config.iface_electronic_scale ||
                    this.config.iface_print_via_proxy ||
                    this.config.iface_scan_via_proxy ||
                    this.config.iface_customer_facing_display_via_proxy)
            );
        }
        getPreviousScreen() {
            return this.data.uiState.previousScreen;
        }
        /**
         * Returns the data needed to render the receipt based on the given order.
         * @param {'pos.order'} order
         */
        getOrderInfo(order) {
            const orderlines = this.getOrderlines(order).map((line) => this._getOrderlineInfo(line));
            const payments = this
                .getPayments(order)
                .filter((payment) => !payment.is_change)
                .map((payment) => this._getPaymentInfo(payment));
            const changePayment = this.getPayments(order).find((payment) => payment.is_change);
            const company = this.company;

            function is_html(subreceipt) {
                return subreceipt ? subreceipt.split('\n')[0].indexOf('<!DOCTYPE QWEB') >= 0 : false;
            }

            const render_html = (subreceipt, receipt) => {
                if (!is_html(subreceipt)) {
                    return subreceipt;
                } else {
                    subreceipt = subreceipt.split('\n').slice(1).join('\n');
                    const qweb = new QWeb2.Engine();
                    qweb.debug = config.isDebug();
                    qweb.default_dict = _.clone(QWeb.default_dict);
                    qweb.add_template('<templates><t t-name="subreceipt">' + subreceipt + '</t></templates>');
                    return qweb.render('subreceipt', { model: this, order, receipt });
                }
            };

            const {
                noTaxNoDiscount,
                noTaxWithDiscount,
                withTaxWithDiscount,
                totalTax,
                orderTaxDetails,
            } = this.getOrderTotals(order);

            const receipt = {
                orderlines,
                paymentlines: payments,
                subtotal: noTaxWithDiscount,
                total_with_tax: withTaxWithDiscount,
                total_rounded: withTaxWithDiscount + this.getRounding(withTaxWithDiscount),
                total_tax: totalTax,
                total_discount: noTaxNoDiscount - noTaxWithDiscount,
                tax_details: orderTaxDetails,
                change: changePayment ? Math.abs(changePayment.amount) : this.getOrderChange(order),
                name: this.getOrderName(order),
                cashier: this.getCashierName(),
                date: {
                    localestring: format.datetime(moment(order._extras.validationDate), {}, { timezone: false }),
                },
                company: {
                    email: company.email,
                    website: company.website,
                    company_registry: company.company_registry,
                    contact_address: this.getRecord('res.partner', company.partner_id).display_name,
                    vat: company.vat,
                    vat_label: (company.country && company.country.vat_label) || _t('Tax ID'),
                    name: company.name,
                    phone: company.phone,
                    logo: this.data.derived.companyLogoBase64,
                },
            };

            if (is_html(this.config.receipt_header)) {
                receipt.header = '';
                receipt.header_html = render_html(this.config.receipt_header, receipt);
            } else {
                receipt.header = this.config.receipt_header || '';
            }

            if (is_html(this.config.receipt_footer)) {
                receipt.footer = '';
                receipt.footer_html = render_html(this.config.receipt_footer, receipt);
            } else {
                receipt.footer = this.config.receipt_footer || '';
            }

            return receipt;
        }
        /**
         * @param {'pos.order.line'} line
         */
        _getOrderlineInfo(line) {
            const order = this.getRecord('pos.order', line.order_id);
            const product = this.getRecord('product.product', line.product_id);
            const unit = this.getProductUnit(line.product_id);
            const pricelist = this.getOrderPricelist(line.order_id);
            const prices = this.getOrderlinePrices(line);
            const unitPrice = this.getOrderlineUnitPrice(line);
            const taxes = this.getFiscalPositionTaxes(
                this.getOrderlineTaxes(line),
                order.fiscal_position_id
            );
            const [noTaxUnitPrice, withTaxUnitPrice] = this.getUnitPrices(unitPrice, taxes);
            let price, price_display;
            if (this.config.iface_tax_included === 'total') {
                price_display = prices.priceWithTax;
                price = withTaxUnitPrice;
            } else {
                price_display = prices.priceWithoutTax;
                price = noTaxUnitPrice;
            }
            return {
                id: line.id,
                quantity: line.qty,
                unit_name: unit.name,
                price,
                discount: line.discount,
                product_name: product.display_name,
                product_name_wrapped: generateWrappedName(this.getFullProductName(line)),
                price_lst: product.lst_price,
                display_discount_policy: pricelist.discount_policy,
                price_display_one: price * (1.0 - line.discount / 100.0),
                price_display,
                price_with_tax: prices.priceWithTax,
                price_without_tax: prices.priceWithoutTax,
                price_with_tax_before_discount: prices.noDiscountPriceWithTax,
                tax: prices.tax,
                product_description: product.description,
                product_description_sale: product.description_sale,
                pack_lot_lines: line.pack_lot_ids.map((id) => this.getRecord('pos.pack.operation.lot', id)),
            };
        }
        /**
         * @param {'pos.payment'} payment
         */
        _getPaymentInfo(payment) {
            const paymentMethod = this.getRecord('pos.payment.method', payment.payment_method_id);
            return {
                id: payment.id,
                amount: payment.amount,
                name: paymentMethod.name,
                ticket: payment.ticket,
            };
        }

        //#endregion GETTERS
    }

    return PointOfSaleModel;
});
