odoo.define('website_sale.utils', function (require) {
'use strict';

const wUtils = require('website.utils');

const cartHandlerMixin = {
    getRedirectOption() {
        const html = document.documentElement;
        this.stayOnPageOption = html.dataset.add2cartRedirect === '1';
        this.forceDialog = html.dataset.add2cartRedirect === '2';
    },
    getCartHandlerOptions(ev) {
        this.isBuyNow = ev.currentTarget.classList.contains('o_we_buy_now');
        const targetSelector = ev.currentTarget.dataset.animationSelector || 'img';
        this.$itemImgContainer = this.$(ev.currentTarget).closest(`:has(${targetSelector})`);
    },
    /**
     * Used to add product depending on stayOnPageOption value.
     */
    addToCart(params) {
        if (this.isBuyNow) {
            params.express = true;
        } else if (this.stayOnPageOption) {
            return this._addToCartInPage(params);
        }
        return wUtils.sendRequest('/shop/cart/update', params);
    },
    /**
     * @private
     */
    _addToCartInPage(params) {
        params.force_create = true;
        return this._rpc({
            route: "/shop/cart/update_json",
            params: params,
        }).then(async data => {
            sessionStorage.setItem('website_sale_cart_quantity', data.cart_quantity);
            if (data.cart_quantity && (data.cart_quantity !== parseInt($(".my_cart_quantity").text()))) {
                updateCartNavBar(data);
            }
        });
    },
};

/**
 * Updates both navbar cart
 * @param {Object} data
 */
function updateCartNavBar(data) {
    $(".my_cart_quantity")
        .parents('li.o_wsale_my_cart').removeClass('d-none').end()
        .addClass('o_mycart_zoom_animation').delay(300)
        .queue(function () {
            $(this)
                .toggleClass('fa fa-warning', !data.cart_quantity)
                .attr('title', data.warning)
                .text(data.cart_quantity || '')
                .removeClass('o_mycart_zoom_animation')
                .dequeue();
        });

    $(".js_cart_lines").first().before(data['website_sale.cart_lines']).end().remove();
    $(".js_cart_summary").replaceWith(data['website_sale.short_cart_summary']);
}

/**
 * Displays `message` in an alert box at the top of the page if it's a
 * non-empty string.
 *
 * @param {string | null} message
 */
function showWarning(message) {
    if (!message) {
        return;
    }
    var $page = $('.oe_website_sale');
    var cart_alert = $page.children('#data_warning');
    if (!cart_alert.length) {
        cart_alert = $(
            '<div class="alert alert-danger alert-dismissible" role="alert" id="data_warning">' +
                '<button type="button" class="btn-close" data-bs-dismiss="alert">&times;</button> ' +
                '<span></span>' +
            '</div>').prependTo($page);
    }
    cart_alert.children('span:last-child').text(message);
}

return {
    updateCartNavBar: updateCartNavBar,
    cartHandlerMixin: cartHandlerMixin,
    showWarning: showWarning,
};
});
