/** @odoo-module **/

import { queryOne } from "@odoo/hoot-dom";
import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import tourUtils from "@website_sale/js/tours/tour_utils";

var orderIdKey = 'website_sale.tour_shop_cart_recovery.orderId';
var recoveryLinkKey = 'website_sale.tour_shop_cart_recovery.recoveryLink';

registry.category("web_tour.tours").add('shop_cart_recovery', {
    test: true,
    url: '/shop',
    steps: () => [
        ...tourUtils.addToCart({productName: "Acoustic Bloc Screens"}),
        tourUtils.goToCart(),
    {
        content: "check product is in cart, get cart id, logout, go to login",
        trigger: 'div:has(a>h6:contains("Acoustic Bloc Screens"))',
        run: function () {
            const orderId = document.querySelector(".my_cart_quantity").getAttribute("order-id");
            browser.localStorage.setItem(orderIdKey, orderId);
            window.location.href = "/web/session/logout?redirect=/web/login";
        },
    },
    {
        content: "login as admin and go to the SO (backend)",
        trigger: '.oe_login_form',
        run: function () {
            var orderId = browser.localStorage.getItem(orderIdKey);
            var url = "/web#action=sale.action_orders&view_type=form&id=" + orderId;
            var loginForm = document.querySelector('.oe_login_form');
            loginForm.querySelector('input[name="login"]').value = "admin";
            loginForm.querySelector('input[name="password"]').value = "admin";
            loginForm.querySelector('input[name="redirect"]').value = url;
            loginForm.submit();
        },
    },
    {
        content: "click action",
        trigger: '.o_cp_action_menus .dropdown-toggle',
    },
    {
        content: "click Send a Cart Recovery Email",
        trigger: "span:contains(/^Send a Cart Recovery Email$/)",
    },
    {
        content: "click Send email",
        trigger: '.btn[name="action_send_mail"]',
    },
    {
        content: "check the mail is sent, grab the recovery link, and logout",
        trigger: ".o-mail-Message-body a:contains(/^Resume order$/)",
        run: function () {
            var link = queryOne('.o-mail-Message-body a:contains("Resume order")').getAttribute('href');
            browser.localStorage.setItem(recoveryLinkKey, link);
            window.location.href = "/web/session/logout?redirect=/";
        }
    },
    {
        content: "go to the recovery link",
        trigger: 'a[href="/web/login"]',
        run: function () {
            const localStorage = browser.localStorage;
            window.location.href = localStorage.getItem(recoveryLinkKey);
        },
    },
    {
        content: "check the page is working, click on restore",
        extra_trigger: 'p:contains("This is your current cart")',
        trigger: 'p:contains("restore") a:contains("Click here")',
    },
    {
        content: "check product is in restored cart",
        trigger: 'div>a>h6:contains("Acoustic Bloc Screens")',
        run: function () {},
    },
]});
