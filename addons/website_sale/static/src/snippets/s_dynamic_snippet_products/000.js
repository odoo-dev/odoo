odoo.define('website_sale.s_dynamic_snippet_products', function (require) {
'use strict';

const config = require('web.config');
const core = require('web.core');
const publicWidget = require('web.public.widget');
const DynamicSnippetCarousel = require('website.s_dynamic_snippet_carousel');
var wSaleUtils = require('website_sale.utils');

const DynamicSnippetProducts = DynamicSnippetCarousel.extend({
    selector: '.s_dynamic_snippet_products',
    read_events: {
        'click .js_add_cart': '_onAddToCart',
        'click .js_remove': '_onRemoveFromRecentlyViewed',
    },

    /**
     * @constructor
     */
    start: function () {
        if (!this.$el.get(0).dataset.productSelection) {
            this.$el.get(0).dataset.productSelection = 'newest';
        }
        this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Method to be overridden in child components if additional configuration elements
     * are required in order to fetch data.
     * @override
     * @private
     */
    _isConfigComplete: function () {
        return this._super.apply(this, arguments) &&
            this.$el.get(0).dataset.productSelection !== undefined;
    },
    /**
     *
     * @override
     * @private
     */
    _mustMessageWarningBeHidden: function() {
        const isInitialDrop = this.$el.get(0).dataset.templateKey === undefined;
        // This snippet has default values obtained after the initial start and render after drop.
        // Because of this there is an initial refresh happening right after.
        // We want to avoid showing the incomplete config message before this refresh.
        // Since the refreshed call will always happen with a defined templateKey,
        // if it is not set yet, we know it is the drop call and we can avoid showing the message.
        return isInitialDrop || this._super.apply(this, arguments);
    },
    /**
     * Method to be overridden in child components in order to provide a search
     * domain if needed.
     * @override
     * @private
     */
    _getSearchDomain: function () {
        const searchDomain = this._super.apply(this, arguments);
        let productCategoryId = this.$el.get(0).dataset.productCategoryId;
        if (productCategoryId && productCategoryId !== 'all') {
            if (productCategoryId === 'current') {
                const url = new URL(window.location);
                productCategoryId = url.searchParams.get("category");
                if (!productCategoryId) {
                    const parts = url.pathname.split('/');
                    productCategoryId = parts[parts.indexOf('category') + 1];
                }
                if (productCategoryId && productCategoryId.lastIndexOf('-')) {
                    productCategoryId = productCategoryId.substring(productCategoryId.lastIndexOf('-') + 1);
                }
            }
            if (productCategoryId) {
                searchDomain.push(['public_categ_ids', 'child_of', parseInt(productCategoryId)]);
            }
        }
        const productNames = this.$el.get(0).dataset.productNames;
        if (productNames) {
            const nameDomain = [];
            for (const productName of productNames.split(',')) {
                if (nameDomain.length) {
                    nameDomain.unshift('|');
                }
                nameDomain.push(['name', 'ilike', productName]);
            }
            searchDomain.push(...nameDomain);
        }
        return searchDomain;
    },
    /**
     * @override
     */
    _getRpcParameters: function () {
        const productId = $("#product_details").find(".product_id");
        return Object.assign(this._super.apply(this, arguments), {
            productSelection: this.$el.get(0).dataset.productSelection || 'newest',
            productId: productId && productId.length ? productId[0].value : undefined,
        });
    },
    /**
     * Add product to cart and reload the carousel.
     * @private
     * @param {Event} ev
     */
    _onAddToCart: function (ev) {
        var self = this;
        var $card = $(ev.currentTarget).closest('.card');
        this._rpc({
            route: "/shop/cart/update_json",
            params: {
                product_id: $card.find('input[data-product-id]').data('product-id'),
                add_qty: 1
            },
        }).then(function (data) {
            wSaleUtils.updateCartNavBar(data);
            var $navButton = $('header .o_wsale_my_cart').first();
            var fetch = self._fetchData();
            var animation = wSaleUtils.animateClone($navButton, $(ev.currentTarget).parents('.card'), 25, 40);
            Promise.all([fetch, animation]).then(function (values) {
                self._render();
            });
        });
    },

    /**
     * Remove product from recently viewed products.
     * @private
     * @param {Event} ev
     */
    _onRemoveFromRecentlyViewed: function (ev) {
        var self = this;
        var $card = $(ev.currentTarget).closest('.card');
        this._rpc({
            route: "/shop/products/recently_viewed_delete",
            params: {
                product_id: $card.find('input[data-product-id]').data('product-id'),
            },
        }).then(function (data) {
            self._fetchData().then(() => self._render());
        });
    },

});
publicWidget.registry.dynamic_snippet_products = DynamicSnippetProducts;

return DynamicSnippetProducts;
});
