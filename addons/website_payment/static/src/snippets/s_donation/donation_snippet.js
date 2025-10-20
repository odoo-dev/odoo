
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

const CUSTOM_BUTTON_EXTRA_WIDTH = 10;

export class DonationSnippet extends Interaction {
    static selector = ".s_donation";
    dynamicContent = {
        ".s_donation_btn": {
            "t-on-click.withTarget": this.onPrefilledClick,
            "t-att-class": (el) => ({ "active": el === this.activeButtonEl }),
        },
        ".s_donation_donate_btn": {
            "t-on-click.withTarget": this.locked(this.onDonateClick, true),
        },
        "#s_donation_range_slider": { "t-on-input": this.onRangeSliderInput },
        "#s_donation_amount_input": {
            "t-on-input": () => {
                this.el.querySelector(".o_donation_custom_btn_warning")?.classList.add("d-none");
            },
        },
    };

    setup() {
        this.currency = null;
        this.activeButtonEl = null;
        this.rangeSliderEl = this.el.querySelector("#s_donation_range_slider");
        this.defaultAmount = this.el.dataset.defaultAmount;
        if (!!this.rangeSliderEl) {
            this.rangeSliderEl.value = this.defaultAmount;
            this.setBubble();
        }
    }

    async willStart() {
        // Note: we do not await the rpc call as we want to be able to click on
        // the send button without having to wait for the currency. This will be
        // up to the handler to properly wait for the currency, with a loading
        // effect once needed (thanks to `locked`).
        // FIXME It seems impossible to make it work without making start async
        // (see explanation in start)
        //
        // TODO the "cached" parameters has no effect: the actual cache is not
        // initialized on the frontend side at the moment.
        // TODO Also it should be the third param of rpc, not the second one...
        this.currencyProm = rpc("/website/get_current_currency", { cache: true });
        this.currencyProm.then(currency => {
            this.currency = currency;
        });
    }

    start() {
        // FIXME this should probably be awaited somehow... but start is not
        // async anymore... how to achieve this? This actually triggers a
        // warning in edit mode (on runbot only somehow)...
        this.currencyProm.then(() => this.displayCurrency());

        const customButtonEl = this.el.querySelector("#s_donation_amount_input");
        if (customButtonEl) {
            this.registerCleanup(() => { customButtonEl.style.maxWidth = "" });
            const canvasEl = document.createElement("canvas");
            const context = canvasEl.getContext("2d");
            context.font = window.getComputedStyle(customButtonEl).font;
            const width = context.measureText(customButtonEl.placeholder).width;
            customButtonEl.style.maxWidth = `${Math.ceil(width) + CUSTOM_BUTTON_EXTRA_WIDTH}px`;
        }
    }

    displayCurrency() {
        const prefilledButtonEls = this.el.querySelectorAll(".s_donation_btn, .s_range_bubble");
        for (const prefilledButtonEl of prefilledButtonEls) {
            // Remove existing currency
            prefilledButtonEl.querySelector(".s_donation_currency")?.remove();
            const insertBefore = this.currency.position === "before";
            const currencyEl = document.createElement("span");
            currencyEl.innerText = this.currency.symbol;
            currencyEl.classList.add("s_donation_currency", insertBefore ? "pe-1" : "ps-1");
            this.insert(currencyEl, prefilledButtonEl, insertBefore ? "afterbegin" : "beforeend");
        }
    }

    setBubble() {
        const bubbleEl = this.el.querySelector(".s_range_bubble");
        const val = this.rangeSliderEl.value;
        const min = this.rangeSliderEl.min || 0;
        const max = this.rangeSliderEl.max || 100;
        const newVal = Number(((val - min) * 100) / (max - min));
        const tipOffsetLow = 8 - (newVal * 0.16); // the range thumb size is 16px*16px. The '8' and the '0.16' are related to that 16px (50% and 1% of 16px)

        for (const child of bubbleEl.childNodes) {
            if (child.nodeType === 3) {
                child.nodeValue = val;
            }
        }
        // Sorta magic numbers based on size of the native UI thumb (source: https://css-tricks.com/value-bubbles-for-range-inputs/)
        bubbleEl.style.insetInlineStart = `calc(${newVal}% + (${tipOffsetLow}px))`;
    }

    /**
     * @param {Event} ev
     * @param {HTMLElement} currentTargetEl
     */
    onPrefilledClick(ev, currentTargetEl) {
        this.activeButtonEl = currentTargetEl;
        const amountInputEl = this.el.querySelector("#s_donation_amount_input");
        if (!currentTargetEl.classList.contains("s_donation_custom_btn") && amountInputEl) {
            this.el.querySelector(".o_donation_custom_btn_warning")?.classList.add("d-none");
            amountInputEl.value = "";
        }
        if (this.rangeSliderEl) {
            this.rangeSliderEl.value = this.activeButtonEl.dataset.donationValue;
            this.setBubble();
        }
    }

    /**
     * @param {Event} ev
     * @param {HTMLElement} currentTargetEl
     */
    async onDonateClick(ev, currentTargetEl) {
        await this.currencyProm;

        this.el.querySelector(".alert-danger")?.remove();
        const donationButtonEls = this.el.querySelectorAll(".s_donation_btn");
        let amount = this.activeButtonEl ? parseFloat(this.activeButtonEl.dataset.donationValue) : 0;
        if (this.el.dataset.displayOptions && !amount) {
            if (this.rangeSliderEl) {
                amount = parseFloat(this.rangeSliderEl.value);
            } else if (donationButtonEls.length) {
                amount = parseFloat(this.el.querySelector("#s_donation_amount_input")?.value);
                let errorMessage = "";
                const minAmount = parseFloat(this.el.dataset.minimumAmount);
                if (!amount) {
                    errorMessage = _t("Please select or enter an amount");
                } else if (amount < minAmount) {
                    errorMessage = _t(
                        "The minimum donation amount is %(amount)s",
                        {
                            amount: formatCurrency(minAmount, this.currency.id),
                        }
                    );
                }
                if (errorMessage) {
                    const pEl = document.createElement("p");
                    pEl.classList.add("alert", "alert-danger", "o_donation_custom_btn_warning");
                    pEl.innerText = errorMessage;
                    this.insert(pEl, currentTargetEl, "beforebegin");
                    return;
                }
            }
        }
        if (!amount) {
            amount = this.defaultAmount;
        }
        const formEl = this.el.querySelector(".s_donation_form");

        const inputsParams = [
            ["amount", amount],
            ["currency_id", this.currency.id],
            ["csrf_token", odoo.csrf_token],
            ["donation_options", JSON.stringify(this.el.dataset)],
        ];

        for (const inputParams of inputsParams) {
            const inputEl = document.createElement("input");
            inputEl.setAttribute("type", "hidden");
            inputEl.setAttribute("name", inputParams[0]);
            inputEl.setAttribute("value", inputParams[1]);
            this.insert(inputEl, formEl);
        }

        formEl.submit();
        // Keep the button locked with loading effect during page reload
        return new Promise(() => {});
    }

    onRangeSliderInput() {
        this.activeButtonEl = null;
        this.setBubble();
    }
}

registry
    .category("public.interactions")
    .add("website_payment.donation_snippet", DonationSnippet);
