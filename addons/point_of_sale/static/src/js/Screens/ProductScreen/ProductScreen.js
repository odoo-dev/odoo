odoo.define('point_of_sale.ProductScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const SetPricelistButton = require('point_of_sale.SetPricelistButton');
    const SetFiscalPositionButton = require('point_of_sale.SetFiscalPositionButton');
    const Orderline = require('point_of_sale.Orderline');
    const OrderSummary = require('point_of_sale.OrderSummary');
    const ActionpadWidget = require('point_of_sale.ActionpadWidget');
    const NumpadWidget = require('point_of_sale.NumpadWidget');
    const MobileOrderWidget = require('point_of_sale.MobileOrderWidget');
    const { useListener } = require('web.custom_hooks');
    const { useBarcodeReader } = require('point_of_sale.custom_hooks');
    const { useState } = owl.hooks;
    const { parse } = require('web.field_utils');
    const { barcodeRepr } = require('point_of_sale.utils');

    class ProductScreen extends PosComponent {
        static components = {
            SetPricelistButton,
            SetFiscalPositionButton,
            Orderline,
            OrderSummary,
            ActionpadWidget,
            NumpadWidget,
            MobileOrderWidget,
        };
        constructor() {
            super(...arguments);
            useListener('update-selected-orderline', this._onUpdateSelectedOrderline);
            useListener('click-product', this._onClickProduct);
            useListener('click-customer', this._onClickCustomer);
            useListener('click-pay', this._onClickPay);
            useListener('select-orderline', this.onSelectOrderline);
            useListener('click-lot', this.onClickLot);
            useListener('set-numpad-mode', this.onChangeMode);
            useListener('switchpane', this.onSwitchPane);
            useListener('categ-popup', this.onCategPopup);
            useBarcodeReader(this.env.model.barcodeReader, {
                product: this._onProductScan,
                weight: this._onProductScan,
                price: this._onProductScan,
                discount: this._onProductScan,
                client: this._onClientScan,
                error: (parsedCode) => {
                    this.env.ui.askUser('ErrorBarcodePopup', { code: barcodeRepr(parsedCode) });
                },
            });
            NumberBuffer.use({
                nonKeyboardInputEvent: 'numpad-click-input',
                triggerAtInput: 'update-selected-orderline',
                useWithBarcode: true,
            });
            this.state = useState({ numpadMode: 'quantity', searchTerm: '' });
            this._clearSearchBar = this.props.basicSearchBar.useSearchBar({
                onSearchTermChange: owl.utils.debounce(this._onSearchTermChange, 100),
                placeholder: this.env._t('Search Products...'),
            });
            this.mobile_pane = this.props.mobile_pane || 'right';
        }
        mounted() {
            this._onMounted();
        }
        async _onMounted() {
            if (this.env.model.config.cash_control && this.env.model.session.state == 'opening_control') {
                await this.env.ui.askUser('CashOpeningPopup');
            }
            if (this.env.model.getProducts(0).length === 0) {
                await this.env.actionHandler({ name: 'actionLoadDemoData' });
            }
        }
        _onUpdateSelectedOrderline(event) {
            const buffer = event.detail.buffer;
            const order = this.props.activeOrder;
            const orderline = this.env.model.getActiveOrderline(order);
            if (!orderline) return;
            const isLowerQuantity = (buffer ? parse.float(buffer) : 0) < orderline.qty;
            if (
                this.state.numpadMode === 'quantity' &&
                this.env.model.getDisallowLineQuantityChange() &&
                isLowerQuantity
            ) {
                this.env.actionHandler({
                    name: 'actionShowDecreaseQuantityPopup',
                    args: [this.props.activeOrder],
                });
                NumberBuffer.reset();
            } else if (this.state.numpadMode === 'quantity' && buffer === null) {
                this.env.actionHandler({
                    name: 'actionDeleteOrderline',
                    args: [this.props.activeOrder, orderline],
                });
                NumberBuffer.reset();
            } else {
                const orderlineFieldName = { quantity: 'qty', price: 'price_unit', discount: 'discount' }[
                    this.state.numpadMode
                ];
                this.env.actionHandler({
                    name: 'actionUpdateOrderline',
                    args: [orderline, { [orderlineFieldName]: buffer ? parse.float(buffer) : 0 }],
                });
            }
        }
        async _onClickProduct(event) {
            const product = event.detail;
            const [proceed, options] = await this._beforeAddProduct(product);
            if (!proceed) return;
            this.env.actionHandler({ name: 'actionAddProduct', args: [this.props.activeOrder, product, options] });
            this.state.numpadMode = 'quantity';
            NumberBuffer.reset();
        }
        async _onClickCustomer() {
            // IMPROVEMENT: This code snippet is very similar to selectClient of PaymentScreen.
            const [confirmed, selectedClientId] = await this.showTempScreen('ClientListScreen', {
                clientId: this.props.activeOrder.partner_id,
            });
            if (confirmed) {
                this.env.actionHandler({
                    name: 'actionSetClient',
                    args: [this.props.activeOrder, selectedClientId || false],
                });
            }
        }
        _onClickPay() {
            this.env.actionHandler({ name: 'actionShowScreen', args: ['PaymentScreen'] });
        }
        /**
         * This single method is used to act on multiple types of barcode, specifically, the
         * 'weight', 'price', 'discount' and 'product' barcode types.
         * @param {Object} parsedCode
         * @param {string} parsedCode.type
         * @param {string} parsedCode.base_code
         * @param {any} parsedCode.value
         */
        _onProductScan(parsedCode) {
            const product = this.env.model.getProductByBarcode(parsedCode.base_code);
            const barcodeTypeMapping = {
                weight: 'qty',
                price: 'price_unit',
                discount: 'discount',
            };
            if (product) {
                const options = {};
                if (parsedCode.type !== 'product') {
                    options[barcodeTypeMapping[parsedCode.type]] = parsedCode.value;
                }
                this.env.actionHandler({ name: 'actionAddProduct', args: [this.props.activeOrder, product, options] });
            } else if (!product && parsedCode.type === 'product') {
                this.env.ui.askUser('ErrorBarcodePopup', {
                    code: barcodeRepr(parsedCode),
                    message: `The product with base barcode of ${parsedCode.base_code} was not loaded or does not exist.`,
                });
            } else {
                const orderline = this.env.model.getActiveOrderline(this.props.activeOrder);
                this.env.actionHandler({
                    name: 'actionUpdateOrderline',
                    args: [orderline, { [barcodeTypeMapping[parsedCode.type]]: parsedCode.value }],
                });
            }
        }
        /**
         * @param {Object} parsedCode
         * @param {string} parsedCode.base_code
         */
        _onClientScan(parsedCode) {
            const partner = this.env.model.getPartnerByBarcode(parsedCode.base_code);
            if (partner) {
                this.env.actionHandler({ name: 'actionSetClient', args: [partner.id] });
            } else {
                this.env.ui.askUser('ErrorBarcodePopup', {
                    code: barcodeRepr(parsedCode),
                    message: this.env._t('Unable to find the customer with the scanned barcode.'),
                });
            }
        }
        onSpaceClickProduct(product, event) {
            if (event.which === 32) {
                this.trigger('click-product', product);
            }
        }
        onChangeMode({ detail: mode }) {
            NumberBuffer.capture();
            NumberBuffer.reset();
            this.state.numpadMode = mode;
        }
        onSelectOrderline({ detail: orderline }) {
            this.state.numpadMode = 'quantity';
            this.env.actionHandler({ name: 'actionSelectOrderline', args: [this.props.activeOrder, orderline.id] });
            NumberBuffer.reset();
        }
        async _onSearchTermChange([searchTerm, key]) {
            this.state.searchTerm = searchTerm;
            if (key && key === 'Enter') {
                const products = this.getProductsToDisplay();
                if (products.length === 1) {
                    await this.env.actionHandler({
                        name: 'actionAddProduct',
                        args: [this.props.activeOrder, products[0], {}],
                    });
                    this._clearSearchBar();
                    NumberBuffer.reset();
                }
            }
        }
        onClickLot({ detail: orderline }) {
            this.env.actionHandler({ name: 'actionSetOrderlineLots', args: [orderline] });
        }
        onSwitchPane() {
            if (this.mobile_pane === 'left') {
                this.mobile_pane = 'right';
            } else {
                this.mobile_pane = 'left';
            }
            this.render();
        }
        async onCategPopup(event) {
            const subcategories = event.detail;
            const activeCategoryId = this.getActiveCategoryId();
            const selectionList = [
                {
                    id: 0,
                    label: 'All Items',
                    isSelected: 0 === activeCategoryId,
                },
                ...subcategories.map((category) => ({
                    id: category.id,
                    label: category.name,
                    isSelected: category.id === activeCategoryId,
                })),
            ];
            const [confirmed, selectedCategory] = await this.env.ui.askUser('SelectionPopup', {
                title: this.env._t('Select the category'),
                list: selectionList,
            });
            if (confirmed) {
                this.env.actionHandler({ name: 'actionSetActiveCategoryId', args: [selectedCategory.id] });
            }
        }
        getActiveOrderlineId() {
            return this.props.activeOrder._extras.activeOrderlineId;
        }
        getOrderlineAdditionalClasses(orderline) {
            return {
                selected: orderline.id === this.getActiveOrderlineId(),
            };
        }
        showSetPricelistButton() {
            return (
                this.env.model.config.use_pricelist && this.env.model.getRecords('product.pricelist').length > 1
            );
        }
        showSetFiscalPositionButton() {
            return this.env.model.getRecords('account.fiscal.position').length > 0;
        }
        getCategoryImageURL(category) {
            return `/web/image?model=pos.category&field=image_128&id=${category.id}&write_date=${category.write_date}&unique=1`;
        }
        getProductImageURL(product) {
            return `/web/image?model=product.product&field=image_128&id=${product.id}&write_date=${product.write_date}&unique=1`;
        }
        getActiveCategoryId() {
            return this.env.model.data.uiState.activeCategoryId;
        }
        getActiveCategory() {
            return this.env.model.getRecord('pos.category', this.getActiveCategoryId());
        }
        getProductsToDisplay() {
            const categoryId = this.getActiveCategoryId();
            return this.env.model.getProducts(categoryId, this.state.searchTerm);
        }
        getCategoryChildrenIds(categoryId) {
            return this.env.model.data.derived.categoryChildren[categoryId] || [];
        }
        getSubcategories(categoryId) {
            const categoryChildrenIds = this.getCategoryChildrenIds(categoryId);
            return categoryChildrenIds.map((id) => this.env.model.getRecord('pos.category', id));
        }
        getBreadcrumbs(categoryId) {
            if (categoryId === 0) return [];
            return [...this.env.model.getCategoryAncestorIds(categoryId).slice(1), categoryId].map((id) =>
                this.env.model.getRecord('pos.category', id)
            );
        }
        getProductDisplayPrice(product) {
            const order = this.props.activeOrder;
            if (!order.pricelist_id) {
                throw new Error('An order should have pricelist.');
            }
            const basePrice = this.env.model.getProductPrice(product.id, order.pricelist_id, 1);
            const productTaxes = product.taxes_id.map((id) => this.env.model.getRecord('account.tax', id));
            const taxes = this.env.model.getFiscalPositionTaxes(productTaxes, order.fiscal_position_id);
            const [withoutTax, withTax] = this.env.model.getUnitPrices(basePrice, taxes);
            const unitPrice = this.env.model.config.iface_tax_included === 'subtotal' ? withoutTax : withTax;
            return this.env.model.formatCurrencyNoSymbol(unitPrice);
        }
        get hasNoCategories() {
            return this.getCategoryChildrenIds(0).length === 0;
        }
        /**
         * This is a hook method before calling `actionAddProduct`. It allows to `proceed` on calling
         * the action or completely ignore it. Return `[true, options]` to proceed with the action or
         * `[false]` to cancel it.
         * @param {'product.product'} product
         * @returns {[boolean, { qty: number?, price_unit: number?, discount: number? }]} [proceed, options]
         */
        async _beforeAddProduct(product) {
            if (product.to_weight && this.env.model.config.iface_electronic_scale) {
                const [confirmed, payload] = await this.showTempScreen('ScaleScreen', { product });
                if (confirmed) {
                    return [true, { qty: payload.weight }];
                } else {
                    return [false, {}];
                }
            } else {
                return [true, {}];
            }
        }
    }
    ProductScreen.template = 'ProductScreen';

    return ProductScreen;
});
