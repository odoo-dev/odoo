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
            toggleDisplayOptions: {
                isApplied: this.getDisplayOptions.bind(this),
                apply: this.toggleDisplayOptions.bind(this),
            },
            togglePrefilledOptions: {
                isApplied: this.getPrefilledOptions.bind(this),
                apply: this.togglePrefilledOptions.bind(this),
            },
            setPrefilledOptions: {
                getValue: this.getPrefilledOptionList.bind(this),
                apply: this.applyPrefilledOptions.bind(this),
            },
            selectAmountInput: {
                isApplied: this.isAmountInputApplied.bind(this),
                apply: this.setAmountInput.bind(this),
            },
            setMinimumAmount: {
                getValue: this.getMinimumAmount.bind(this),
                apply: this.setMinimumAmount.bind(this),
            },
            setMaximumAmount: {
                getValue: this.getMaximumAmount.bind(this),
                apply: this.setMaximumAmount.bind(this),
            },
            setSliderStep: {
                getValue: this.getSliderStep.bind(this),
                apply: this.setSliderStep.bind(this),
            },
        },
    };

    getDisplayOptions({ editingElement }) {
        return editingElement.dataset.displayOptions;
    }

    toggleDisplayOptions({ editingElement, value }) {
        console.log(...arguments);
        editingElement.dataset.displayOptions = value;
        if (!value && editingElement.dataset.customAmount === "slider") {
            editingElement.dataset.customAmount = "freeAmount";
        } else if (value && !editingElement.dataset.prefilledOptions) {
            editingElement.dataset.customAmount = "slider";
        }
        this.rebuildPrefilledOptions(editingElement);
    }

    getPrefilledOptions({ editingElement }) {
        return editingElement.dataset.prefilledOptions;
    }

    togglePrefilledOptions({ editingElement, value }) {
        editingElement.dataset.prefilledOptions = value;
        if (!value && editingElement.dataset.displayOptions) {
            editingElement.dataset.customAmount = "slider";
        }
        this.rebuildPrefilledOptions(editingElement);
    }

    getPrefilledOptionList({ editingElement }) {
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
        this.rebuildPrefilledOptions(editingElement, value);
    }

    isAmountInputApplied({ editingElement, param }) {
        return editingElement.dataset.customAmount === param.mainParam;
    }

    setAmountInput({ editingElement, param }) {
        editingElement.dataset.customAmount = param.mainParam;
        this.rebuildPrefilledOptions(editingElement);
    }

    getMinimumAmount({ editingElement }) {
        return editingElement.dataset.minimumAmount;
    }

    setMinimumAmount({ editingElement, value }) {
        editingElement.dataset.minimumAmount = value;
        const rangeSliderEl = editingElement.querySelector("#s_donation_range_slider");
        const amountInputEl = editingElement.querySelector("#s_donation_amount_input");
        if (rangeSliderEl) {
            rangeSliderEl.min = value;
        } else if (amountInputEl) {
            amountInputEl.min = value;
        }
    }

    getMaximumAmount({ editingElement }) {
        return editingElement.dataset.maximumAmount;
    }

    setMaximumAmount({ editingElement, value }) {
        editingElement.dataset.maximumAmount = value;
        const rangeSliderEl = editingElement.querySelector("#s_donation_range_slider");
        const amountInputEl = editingElement.querySelector("#s_donation_amount_input");
        if (rangeSliderEl) {
            rangeSliderEl.max = value;
        } else if (amountInputEl) {
            amountInputEl.max = value;
        }
    }

    getSliderStep({ editingElement }) {
        return editingElement.dataset.sliderStep;
    }

    setSliderStep({ editingElement, value }) {
        editingElement.dataset.sliderStep = value;
        const rangeSliderEl = editingElement.querySelector("#s_donation_range_slider");
        if (rangeSliderEl) {
            rangeSliderEl.step = value;
        }
    }

    rebuildPrefilledOptions(editingElement, options) {
        options = JSON.parse(options || this.getPrefilledOptionList({ editingElement }));
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
