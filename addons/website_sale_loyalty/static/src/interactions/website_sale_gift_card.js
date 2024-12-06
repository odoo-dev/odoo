import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { browser } from '@web/core/browser/browser';

export class WebsiteSaleGiftCardCopy extends Interaction {
    static selector = ".coupon-message";
    dynamicContent = {
        ".copy-to-clipboard:t-on-click": this.onClick,
    }

    /**
     * @param {Event} ev
     */
    onClick(ev) {
        const textValue = ev.target.dataset.clipboardText;
        browser.navigator.clipboard.writeText(textValue);
    }
}

registry
    .category("public.interactions")
    .add("website_sale_loyalty.coupon_toaster", WebsiteSaleGiftCardCopy);
