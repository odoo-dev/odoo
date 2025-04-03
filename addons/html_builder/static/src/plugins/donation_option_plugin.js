import { Plugin } from "@html_editor/plugin";
import { withSequence } from "@html_editor/utils/resource";
import { registry } from "@web/core/registry";
import { renderToElement } from "@web/core/utils/render";

class DonationOptionPlugin extends Plugin {
    static id = "DonationOption";
    resources = {
        builder_options: [
            withSequence(50, {
                template: "html_builder.DonationOption",
                selector: ".s_donation",
            }),
        ],
        builder_actions: {
            setPrefilledOptions: {
                getValue: this.getPrefilledOptions.bind(this),
                apply: this.applyPrefilledOptions.bind(this),
            },
        },
    };

    getPrefilledOptions({ editingElement }) {
        const options = [];
        const containerEl = editingElement.querySelector(".s_donation_prefilled_buttons");
        if (containerEl) {
            for (const optionEl of containerEl.querySelectorAll(".s_donation_btn_description")) {
                const btnEl = optionEl.querySelector(".btn");
                const descriptionEl = optionEl.querySelector(".s_donation_description");
                options.push({
                    value: btnEl.dataset.donationValue,
                    description: descriptionEl.innerText,
                });
            }
        }
        return JSON.stringify(options);
    }

    applyPrefilledOptions({ editingElement, value }) {
        this.rebuildPrefilledOptions(editingElement, JSON.parse(value));
    }

    rebuildPrefilledOptions(editingElement, options) {
        const doRebuild = editingElement.dataset.displayOptions;
        editingElement
            .querySelectorAll(".s_donation_prefilled_buttons")
            .forEach((el) => el.remove());
        const layout = editingElement.dataset.customAmount;
        const sliderEl = editingElement.querySelector(".s_donation_range_slider_wrap");
        if (layout !== "slider" || !doRebuild) {
            sliderEl?.remove();
        }
        if (doRebuild) {
            const donateButtonEl = editingElement.querySelector(".s_donation_donate_btn");
            if (layout === "slider" && !sliderEl) {
                const sliderEl = renderToElement("html_builder.website_payment.donation.slider", {
                    minimum_amount: editingElement.dataset.minimumAmount,
                    maximum_amount: editingElement.dataset.maximumAmount,
                    slider_step: editingElement.dataset.sliderStep,
                });
                donateButtonEl.parentNode.insertBefore(sliderEl, donateButtonEl);
            }
            const prefilledOptions = editingElement.dataset.prefilledOptions;
            const showDescriptions = prefilledOptions && editingElement.dataset.descriptions;
            const prefilledButtonsEl = renderToElement(
                `html_builder.website_payment.donation.prefilledButtons${
                    showDescriptions ? "Descriptions" : ""
                }`,
                {
                    prefilled_buttons: prefilledOptions ? options : [],
                    custom_input: layout === "freeAmount",
                    minimum_amount: editingElement.dataset.minimumAmount,
                }
            );
            const descriptionInputsEl = editingElement.querySelector(
                "#s_donation_description_inputs"
            );
            descriptionInputsEl.parentNode.insertBefore(
                prefilledButtonsEl,
                descriptionInputsEl.nextSibling
            );
        }
    }
}
registry.category("website-plugins").add(DonationOptionPlugin.id, DonationOptionPlugin);
