
import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { formatCurrency } from "@web/core/currency";
import { rpc } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";

const CUSTOM_BUTTON_EXTRA_WIDTH = 10;
let cachedCurrency;

export class DonationSnippet extends Interaction {
    static selector = ".s_donation";
    dynamicContent = {
        ".s_donation_btn:t-on-click": this.onClickPrefilled,
        ".s_donation_donate_btn:t-on-click": this.onClickDonate,
        "#s_donation_range_slider:t-on-input": this.onInputRangeSlider,
    }

    setup() {
        this.rangeSlider = this.el.querySelector('#s_donation_range_slider');
        this.defaultAmount = this.el.dataset.defaultAmount;
        if (!!this.rangeSlider) {
            this.rangeSlider.value = this.defaultAmount;
            this.setBubble(this.rangeSlider);
        }
    }

    async willStart() {
        await this.displayCurrencies();
    }

    start() {
        const customButtonEl = this.el.querySelector("#s_donation_amount_input");
        if (customButtonEl) {
            this.registerCleanup(() => customButtonEl.style.maxWidth = "");
            const canvasEl = document.createElement("canvas");
            const context = canvasEl.getContext("2d");
            context.font = window.getComputedStyle(customButtonEl).font;
            const width = context.measureText(customButtonEl.placeholder).width;
            customButtonEl.style.maxWidth = `${Math.ceil(width) + CUSTOM_BUTTON_EXTRA_WIDTH}px`;
        }
    }

    destroy() {
        const currencyEls = this.el.querySelectorAll(".s_donation_currency");
        for (const currencyEl of currencyEls) {
            currencyEl.remove();
        }
        const alertEls = this.el.querySelectorAll(".alert-danger");
        for (const alertEl of alertEls) {
            alertEl.remove();
        }
        this.deselectPrefilledButtons();
    }

    deselectPrefilledButtons() {
        const donationBtnEls = this.el.querySelectorAll(".s_donation_btn")
        for (const donationBtnEl of donationBtnEls) {
            donationBtnEl.classList.remove("active");
        }
    }

    /**
     * @param {HTMLInputElement} range
     */
    setBubble(range) {
        const bubble = this.el.querySelector('.s_range_bubble');
        const val = range.value;
        const min = range.min || 0;
        const max = range.max || 100;
        const newVal = Number(((val - min) * 100) / (max - min));
        const tipOffsetLow = 8 - (newVal * 0.16); // the range thumb size is 16px*16px. The '8' and the '0.16' are related to that 16px (50% and 1% of 16px)

        // Sorta magic numbers based on size of the native UI thumb (source: https://css-tricks.com/value-bubbles-for-range-inputs/)
        bubble.style.left = `calc(${newVal}% + (${tipOffsetLow}px))`;
    }

    displayCurrencies() {
        return this.getCachedCurrency().then((result) => {
            // No need to recreate the elements if the currency is already set.
            if (this.currency === result) {
                return;
            }
            this.currency = result;
            this.el.querySelector('.s_donation_currency')?.remove();
            const prefilledButtonEls = this.el.querySelectorAll('.s_donation_btn, .s_range_bubble');
            for (const prefilledButtonEl of prefilledButtonEls) {
                const before = result.position === "before";
                const currencySymbol = document.createElement('span');
                currencySymbol.innerText = result.symbol;
                currencySymbol.classList.add('s_donation_currency', before ? "pe-1" : "ps-1");
                if (before) {
                    this.insert(currencySymbol, prefilledButtonEl, "afterbegin")
                } else {
                    this.insert(currencySymbol, prefilledButtonEl, "beforeend")
                }
            }
        });
    }

    getCachedCurrency() {
        return cachedCurrency
            ? Promise.resolve(cachedCurrency)
            : rpc("/website/get_current_currency").then((result) => {
                cachedCurrency = result;
                return result;
            });
    }

    /**
     * @param {Event} ev
     */
    onClickPrefilled(ev) {
        const button = ev.currentTarget;
        this.deselectPrefilledButtons();
        button.classList.add("active");
        if (this.rangeSlider) {
            this.rangeSlider.value = button.dataset.donationValue;
            this.setBubble(this.rangeSlider);
        }
    }

    /**
     * @param {Event} ev
     */
    onClickDonate(ev) {
        this.el.querySelector('.alert-danger')?.remove();
        const buttons = this.el.querySelectorAll('.s_donation_btn');
        const selectedButton = this.el.querySelector('.s_donation_btn.active');
        let amount = selectedButton ? selectedButton.dataset.donationValue : 0;
        if (this.el.dataset.displayOptions && !amount) {
            if (this.rangeSlider) {
                amount = this.rangeSlider.value;
            } else if (buttons) {
                amount = parseFloat(this.el.querySelector('#s_donation_amount_input').value);
                let errorMessage = '';
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
                    const p = document.createElement("p");
                    p.classList.add("alert alert-danger");
                    p.innerText = errorMessage;
                    this.insert(p, ev.currentTarget, "beforebegin")
                    return;
                }
            }
        }
        if (!amount) {
            amount = this.defaultAmount;
        }
        const form = this.el.querySelector('.s_donation_form');

        const input1 = document.createElement("input");
        input1.setAttribute("type", "hidden");
        input1.setAttribute("name", "amount");
        input1.setAttribute("value", amount);
        this.insert(input1, form);

        const input2 = document.createElement("input");
        input2.setAttribute("type", "hidden");
        input2.setAttribute("name", "currency_id");
        input2.setAttribute("value", this.currency.id);
        this.insert(input2, form);

        const input3 = document.createElement("input");
        input3.setAttribute("type", "hidden");
        input3.setAttribute("name", "csrf_token");
        input3.setAttribute("value", odoo.csrf_token);
        this.insert(input3, form);

        const input4 = document.createElement("input");
        input4.setAttribute("type", "hidden");
        input4.setAttribute("name", "donation_options");
        input4.setAttribute("value", JSON.stringify(this.el.dataset));
        this.insert(input4, form);

        form.submit();
    }

    /**
     * @param {Event} ev
     */
    onInputRangeSlider(ev) {
        this.deselectPrefilledButtons();
        this.setBubble(ev.currentTarget);
    }

}

registry
    .category("public.interactions")
    .add("website_payment.donation_snippet", DonationSnippet);
