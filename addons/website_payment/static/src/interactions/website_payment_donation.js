import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

export class WebsitePaymentDonation extends Interaction {
    static selector = ".o_donation_payment_form";
    dynamicContent = {
        ".o_amount_input:t-on-focus": () => this.el.querySelector("#other_amount")?.checked = true,
        "#donation_comment_checkbox:t-on-change": this.onChange,
    }

    /**
     * @param {Event} ev
     */
    onChange(ev) {
        const checked = ev.currentTarget.checked;
        const donationCommentEl = this.el.querySelector('#donation_comment');
        donationCommentEl.classList.toggle('d-none', !checked);
        if (!checked) {
            donationCommentEl.value = "";
        }
    }
}

registry
    .category("public.interactions")
    .add("website_payment.website_payment_donation", WebsitePaymentDonation);
