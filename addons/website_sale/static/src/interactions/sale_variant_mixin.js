import { Interaction } from "@web/public/interaction";

import { localization } from "@web/core/l10n/localization";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { KeepLast } from "@web/core/utils/concurrency";
import { memoize, uniqueId } from "@web/core/utils/functions";
import { insertThousandsSep } from "@web/core/utils/numbers";

export class VariantMixin extends Interaction {
    dynamicContent = {
        ".css_attribute_color input": { "t-on-change": onChangeColorAttribute },
        ".o_variant_pills": { "t-on-click": onClickVariantPills },
    }

    /**
     * When a variant is changed, this will check:
     * - If the selected combination is available or not
     * - The extra price if applicable
     * - The display name of the product ("Customizable desk (White, Steel)")
     * - The new total price
     * - The need of adding a "custom value" input
     *   If the custom value is the only available value
     *   (defined by its data "is_single_and_custom"),
     *   the custom value will have it's own input & label
     *
     * "change" events triggered by the user entered custom values are ignored since they
     * are not relevant
     *
     * @param {MouseEvent} ev
     */
    onChangeVariant(ev) {
        const productEl = ev.target.closest(".js_product");
        if (productEl.dataset.uniqueId) {
            productEl.dataset.uniqueId = uniqueId();
        }
        this.throttledGetCombinationInfo(this, productEl.dataset.uniqueId)(ev);
    }

    /**
     * @see onChangeVariant
     *
     * @param {Event} ev
     * @returns {Deferred}
     */
    getCombinationInfo(ev) {
        if (ev.target.classList.contains("variant_custom_value")) {
            return Promise.resolve();
        }
        const productEl = ev.target.closest(".js_product");
        if (!productEl) {
            return Promise.resolve();
        }
        const combination = this.getSelectedVariantValues(productEl);
        return rpc("/website_sale/get_combination_info", {
            "product_template_id": parseInt(productEl.querySelector(".product_template_id").value),
            "product_id": this.getProductId(productEl),
            "combination": combination,
            "add_qty": parseInt(productEl.querySelector("input[name='add_qty']").value),
            "context": this.context,
            ...this.getOptionalCombinationInfoParam(productEl),
        }).then((combinationData) => {
            if (this.isDestroyed) {
                return;
            }
            this.onChangeCombination(ev, productEl, combinationData);
            this.checkExclusions(productEl, combination);
        });
    }

    /**
     * Hook to add optional info to the combination info call.
     *
     * @param {HTMLElement} product
     */
    getOptionalCombinationInfoParam(product) {
        return {};
    }

    /**
     * Will add the "custom value" input for this attribute value if
     * the attribute value is configured as "custom" (see product_attribute_value.is_custom)
     *
     * @param {MouseEvent} ev
     */
    handleCustomValues(targetEl) {
        let variantContainer = undefined;
        let customInput = undefined;
        if (targetEl.tagName == "INPUT" && targetEl.type == "radio" && targetEl.checked) {
            variantContainer = targetEl.closest("ul").closest("li");
            customInput = targetEl;
        } else if (targetEl.tagName == "SELECT") {
            variantContainer = target.closest("li");
            customInput = targetEl.querySelector(`option[value=${target.value}]`);
        }

        if (variantContainer) {
            if (customInput && customInput.dataset.is_custom === "True") {
                const attributeValueId = customInput.dataset.value_id;
                const attributeValueName = customInput.dataset.value_name;
                if (variantContainer.querySelector(".variant_custom_value").dataset.custom_product_template_attribute_value_id !== parseInt(attributeValueId)) {
                    variantContainer.querySelector(".variant_custom_value").remove();
                }
                if (!variantContainer.querySelector(".variant_custom_value")) {
                    const previousCustomValue = customInput.getAttribute("previous_custom_value");
                    const input = document.createElement("input");
                    input.type = "text"
                    input.placeholder = attributeValueName
                    input.classList.add("variant_custom_value form-control mt-2 custom_value_radio")
                    input.dataset.custom_product_template_attribute_value_id = attributeValueId
                    input.dataset.attribute_value_name = attributeValueName
                    if (previousCustomValue) {
                        input.value = previousCustomValue;
                    }
                    variantContainer.appendChild(input);
                }
            } else {
                variantContainer.querySelector(".variant_custom_value").remove();
            }
        }
    }

    /**
     * Hack to add and remove from cart with json
     *
     * @param {MouseEvent} ev
     */
    onClickAddCartJSON(ev) {
        ev.preventDefault();
        const input = ev.currentTarget.closest(".input-group").querySelector("input");
        const min = parseFloat(input.dataset.min || 0);
        const max = parseFloat(input.dataset.max || Infinity);
        const previousQty = parseFloat(input.value || 0, 10);
        const quantity = (ev.currentTarget.querySelector(".fa-minus") ? -1 : 1) + previousQty;
        const newQty = quantity > min ? (quantity < max ? quantity : max) : min;

        if (newQty !== previousQty) {
            input.value = newQty;
            input.dispatchEvent(new Event("change"));
        }
        return false;
    }

    /**
     * When the quantity is changed, we need to query the new price of the product.
     * Based on the pricelist, the price might change when quantity exceeds a certain amount.
     *
     * @param {MouseEvent} ev
     */
    onChangeAddQuantity(ev) {
        const formEl = ev.currentTarget.closest("form");
        if (formEl) {
            this.triggerVariantChange(formEl);
        }
    }

    /**
     * Triggers the price computation and other variant specific changes
     *
     * @param {HTMLFormElement} formEl
     */
    triggerVariantChange(formEl) {
        formEl.querySelector("ul[data-attribute_exclusions]").dispatchEvent(new Event("change"));
        const variantChangeEls = formEl.querySelector("input.js_variant_change:checked, select.js_variant_change");
        for (const variantChangeEl of variantChangeEls) {
            this.handleCustomValues(variantChangeEl);
        }
    }

    /**
     * Will look for user custom attribute values
     * in the provided container
     *
     * @param {HTMLElement} container
     * @returns {Array} array of custom values with the following format
     *   {integer} custom_product_template_attribute_value_id
     *   {string} attribute_value_name
     *   {string} custom_value
     */
    getCustomVariantValues(container) {
        const variantCustomValues = [];
        const customValueEls = container.querySelectorAll(".variant_custom_value");
        for (const customValueEl of customValueEls) {
            variantCustomValues.push({
                "custom_product_template_attribute_value_id": customValueEl.dataset.custom_product_template_attribute_value_id,
                "attribute_value_name": customValueEl.dataset.attribute_value_name,
                "custom_value": customValueEl.value,
            });
        }
        return variantCustomValues;
    }

    /**
     * Will look for attribute values that do not create product variant
     * (see product_attribute.create_variant "dynamic")
     *
     * @param {HTMLElement} container
     * @returns {Array} array of attribute values with the following format
     *   {integer} custom_product_template_attribute_value_id
     *   {string} attribute_value_name
     *   {integer} value
     *   {string} attribute_name
     *   {boolean} is_custom
    */
    getNoVariantAttributeValues(container) {
        const noVariantAttributeValues = [];
        const noVariantAttributeEls = container.querySelectorAll("input.no_variant.js_variant_change:checked, select.no_variant.js_variant_change")
        for (let noVariantAttributeEl of noVariantAttributeEls) {
            const singleNoCustom = noVariantAttributeEl.dataset.is_single && !noVariantAttributeEl.dataset.is_custom;

            if (noVariantAttributeEl.tagName == "SELECT") {
                noVariantAttributeEl = noVariantAttributeEl.querySelector(`option[value=${noVariantAttributeEl.value}]`);
            }

            if (noVariantAttributeEl && !singleNoCustom) {
                noVariantAttributeValues.push({
                    "custom_product_template_attribute_value_id": noVariantAttributeEl.dataset.value_id,
                    "attribute_value_name": noVariantAttributeEl.dataset.value_name,
                    "value": noVariantAttributeEl.value,
                    "attribute_name": noVariantAttributeEl.dataset.attribute_name,
                    "is_custom": noVariantAttributeEl.dataset.is_custom,
                });
            }
        }
        return noVariantAttributeValues;
    }

    /**
     * Will return the list of selected product.template.attribute.value ids
     *
     * @param {HTMLElement} container the container to look into
     */
    getSelectedVariantValues(container) {
        const values = [];
        const variantChangeEls = container.querySelectorAll("input.js_variant_change:checked, select.js_variant_change");
        for (const variantChangeEl of variantChangeEls) {
            values.push(parseFloat(variantChangeEl.value))
        }
        return values;
    }

    /**
     * Will return a promise:
     *
     * - If the product already exists, immediately resolves it with the product_id
     * - If the product does not exist yet ("dynamic" variant creation), this method will
     *   create the product first and then resolve the promise with the created product's id
     *
     * @param {HTMLElement} $container the container to look into
     * @param {integer} productId the product id
     * @param {integer} productTemplateId the corresponding product template id
     * @returns {Promise} the promise that will be resolved with a {integer} productId
     */
    selectOrCreateProduct(container, productId, productTemplateId) {
        const productId = parseInt(productId);
        const productTemplateId = parseInt(productTemplateId);
        if (productId) {
            return Promise.resolve(productId);
        } else {
            return rpc("/sale/create_product_variant", {
                product_template_id: productTemplateId,
                product_template_attribute_value_ids:
                    JSON.stringify(this.getSelectedVariantValues(container)),
            });
        }
    }

    /**
     * Will disable attribute value's inputs based on combination exclusions
     * and will disable the "add" button if the selected combination
     * is not available
     *
     * This will check both the exclusions within the product itself and
     * the exclusions coming from the parent product (meaning that this product
     * is an option of the parent product)
     *
     * It will also check that the selected combination does not exactly
     * match a manually archived product
     *
     * @private
     * @param {$.Element} parentEl the parent container to apply exclusions
     * @param {Array} combination the selected combination of product attribute values
 */
    checkExclusions(parentEl, combination) { ///////////////////////:
        var combinationData = parentEl.querySelector("ul[data-attribute_exclusions]").dataset.attribute_exclusions;

        const variantPillsEls = parentEl.querySelectorAll("option, input, label, .o_variant_pills");
        for (const variantPillsEl of variantPillsEls) {
            variantPillsEl.classList.remove("css_not_available");
            variantPillsEl.setAttribute("title", () => this.dataset.value_name || "");
            variantPillsEl.dataset.excludedBy = "";
        }

        // exclusion rules: array of ptav
        // for each of them, contains array with the other ptav they exclude
        if (combinationData.exclusions) {
            // browse all the currently selected attributes
            Object.values(combination).forEach((current_ptav) => {
                if (combinationData.exclusions.hasOwnProperty(current_ptav)) {
                    // for each exclusion of the current attribute:
                    Object.values(combinationData.exclusions[current_ptav]).forEach((excluded_ptav) => {
                        // disable the excluded input (even when not already selected)
                        // to give a visual feedback before click
                        self.disableInput(
                            parentEl,
                            excluded_ptav,
                            current_ptav,
                            combinationData.mapped_attribute_names
                        );
                    });
                }
            });
        }
        // combination exclusions: array of array of ptav
        // for example a product with 3 variation and one specific variation is disabled (archived)
        //  requires the first 2 to be selected for the third to be disabled
        if (combinationData.archived_combinations) {
            combinationData.archived_combinations.forEach((excludedCombination) => {
                const ptavCommon = excludedCombination.filter((ptav) => combination.includes(ptav));
                if (
                    !!ptavCommon
                    && (combination.length === excludedCombination.length)
                    && (ptavCommon.length === combination.length)
                ) {
                    // Selected combination is archived, all attributes must be disabled from each other
                    combination.forEach((ptav) => {
                        combination.forEach((ptavOther) => {
                            if (ptav === ptavOther) {
                                return;
                            }
                            self.disableInput(
                                parentEl,
                                ptav,
                                ptavOther,
                                combinationData.mapped_attribute_names,
                            );
                        })
                    })
                } else if (
                    !!ptavCommon
                    && (combination.length === excludedCombination.length)
                    && (ptavCommon.length === (combination.length - 1))
                ) {
                    // In this case we only need to disable the remaining ptav
                    const disabledPtav = excludedCombination.find((ptav) => !combination.includes(ptav));
                    excludedCombination.forEach((ptav) => {
                        if (ptav === disabledPtav) {
                            return;
                        }
                        self.disableInput(
                            parentEl,
                            disabledPtav,
                            ptav,
                            combinationData.mapped_attribute_names,
                        )
                    });
                }
            });
        }
    }

    /**
     * Extracted to a method to be extendable by other modules
     *
     * @param {HTMLElement} parentEl
     */
    getProductId(parentEl) {
        return parseInt(parentEl.querySelector(".product_id").value);
    }

    /**
     * Will disable the input/option that refers to the passed attributeValueId.
     * This is used for showing the user that some combinations are not available.
     *
     * It will also display a message explaining why the input is not selectable.
     * Based on the "excludedBy" and the "productName" params.
     * e.g: Not available with Color: Black
     *
     * @param {HTMLElement} parentEl
     * @param {integer} attributeValueId
     * @param {integer} excludedBy The attribute value that excludes this input
     * @param {Object} attributeNames A dict containing all the names of the attribute values
     *   to show a human readable message explaining why the input is disabled.
     * @param {string} [productName] The parent product. If provided, it will be appended before
     *   the name of the attribute value that excludes this input
     *   e.g: Not available with Customizable Desk (Color: Black)
     */
    disableInput(parentEl, attributeValueId, excludedBy, attributeNames, productName) {
        const input = parentEl.querySelector(`option[value=${attributeValueId}], input[value=${attributeValueId}]`);
        input.classList.add("css_not_available");
        input.closest("label").classList.add("css_not_available");
        input.closest(".o_variant_pills").classList.add("css_not_available");
        if (excludedBy && attributeNames) {
            const targetEl = input.tagName == "OPTION" ? input : input.closest("label").appendChild(input);
            var excludedByData = [];
            if (targetEl.dataset.excludedBy) {
                excludedByData = JSON.parse(targetEl.dataset.excludedBy);
            }
            var excludedByName = attributeNames[excludedBy];
            if (productName) {
                excludedByName = productName + " (" + excludedByName + ")";
            }
            excludedByData.push(excludedByName);
            targetEl.setAttribute("title", _t("Not available with %s", excludedByData.join(", ")));
            targetEl.dataset.excludedBy = JSON.stringify(excludedByData);
        }
    }

    /**
     * @see onChangeVariant
     *
     * @param {MouseEvent} ev
     * @param {HTMLElement} parentEl
     * @param {Array} combination
     */
    onChangeCombination(ev, parentEl, combination) {
        const isCombinationPossible = !!combination.is_combination_possible;
        const pricePerUom = parentEl.querySelector(".o_base_unit_price:first .oe_currency_value");
        if (pricePerUom) {
            if (isCombinationPossible && combination.base_unit_price != 0) {
                pricePerUom.closest(".o_base_unit_price_wrapper").classList.remove("d-none");
                pricePerUom.innerText = this.priceToString(combination.base_unit_price);
                parentEl.querySelector(".oe_custom_base_unit:first").innerText = combination.base_unit_name;
            } else {
                pricePerUom.closest(".o_base_unit_price_wrapper").classList.add("d-none");
            }
        }

        // Triggers a new JS event with the correct payload, which is then handled
        // by the google analytics tracking code.
        // Indeed, every time another variant is selected, a new view_item event
        // needs to be tracked by google analytics.
        if ("product_tracking_info" in combination) {
            const product = document.querySelector("#product_detail");
            product.dataset.productTrackingInfo = combination["product_tracking_info"];
            product.dispatchEvent(new Event("view_item_event", combination["product_tracking_info"]));
        }
        const addToCart = parentEl.querySelector("#add_to_cart_wrap");
        const contactUsButton = parentEl.querySelector("#contact_us_wrapper");
        const productPrice = parentEl.querySelector(".product_price");
        const quantity = parentEl.querySelector(".css_quantity");
        const product_unavailable = parentEl.querySelector("#product_unavailable");
        if (combination.prevent_zero_price_sale) {
            productPrice.classList.remove("d-inline-block")
            productPrice.classList.classList.add("d-none");
            quantity.classList.remove("d-inline-flex")
            quantity.classList.add("d-none");
            addToCart.classList.remove("d-inline-flex")
            addToCart.classList.add("d-none");
            contactUsButton.classList.remove("d-none")
            contactUsButton.classList.add("d-flex");
            product_unavailable.classList.remove("d-none")
            product_unavailable.classList.add("d-flex");
        } else {
            productPrice.classList.remove("d-none")
            productPrice.classList.add("d-inline-block");
            quantity.classList.remove("d-none")
            quantity.classList.add("d-inline-flex");
            addToCart.classList.remove("d-none")
            addToCart.classList.add("d-inline-flex");
            contactUsButton.classList.remove("d-flex")
            contactUsButton.classList.add("d-none");
            product_unavailable.classList.remove("d-flex")
            product_unavailable.classList.add("d-none");
        }

        const price = parentEl.querySelector(".oe_price:first .oe_currency_value");
        const default_price = parentEl.querySelector(".oe_default_price:first .oe_currency_value");
        const compare_price = parentEl.querySelector(".oe_compare_list_price")
        price.innerText = this.priceToString(combination.price);
        default_price.innerText = this.priceToString(combination.list_price);

        this.toggleDisable(parentEl, isCombinationPossible);

        if (combination.has_discounted_price) {
            default_price.closest(".oe_website_sale").classList.add("discount");
            default_price.parentElement.classList.remove("d-none");
            compare_price.classList.add("d-none");
        } else {
            default_price.closest(".oe_website_sale").classList.remove("discount");
            default_price.parentElement.classList.add("d-none");
            compare_price.classList.remove("d-none");
        }

        // update images & tags only when changing product
        // or when either ids are "false", meaning dynamic products.
        // Dynamic products don't have images BUT they may have invalid
        // combinations that need to disable the image.
        if (!combination.no_product_change) {
            this.updateProductImage(
                parentEl.closest("tr.js_product, .oe_website_sale"),
                combination.display_image,
                combination.product_id,
                combination.product_template_id,
                combination.carousel,
                isCombinationPossible
            );
            parentEl.querySelector(".o_product_tags").innerHTML = combination.product_tags;
        }

        parentEl.querySelector(".product_id").value = (combination.product_id || 0)
        parentEl.querySelector(".product_id").dispatchEvent(new Event("change"));

        this.handleCustomValues(ev.target);
    }

    /**
     * returns the formatted price
     *
     * @param {float} price
     */
    priceToString(price) {
        var precision = 2;

        if (document.querySelectorAll(".decimal_precision")) {
            precision = parseInt(document.querySelector(".decimal_precision").last.dataset.precision);
        }
        const formatted = price.toFixed(precision).split(".");
        const { thousandsSep, decimalPoint, grouping } = localization;
        formatted[0] = insertThousandsSep(formatted[0], thousandsSep, grouping);
        return formatted.join(decimalPoint);
    }

    /**
     * Returns a throttled `getCombinationInfo` with a leading and a trailing
     * call, which is memoized per `uniqueId`, and for which previous results
     * are dropped.
     *
     * The uniqueId is needed because on the configurator modal there might be
     * multiple elements triggering the rpc at the same time, and we need each
     * individual product rpc to be executed, but only once per individual
     * product.
     *
     * The leading execution is to keep good reactivity on the first call, for
     * a better user experience. The trailing is because ultimately only the
     * information about the last selected combination is useful. All
     * intermediary rpc can be ignored and are therefore best not done at all.
     *
     * The keepLast is to make sure we only consider the result of the last call, when several
     * (asynchronous) calls are done in parallel.
     *
     * @param {string} uniqueId
     * @returns {function}
    */
    throttledGetCombinationInfo = memoize(function (self, uniqueId) {
        const keepLast = new KeepLast();
        return (ev, params) => keepLast.add(this.throttleForAnimation(this.getCombinationInfo(ev, params)));
    })

    /**
     * Toggles the disabled class depending on the parentEl element
     * and the possibility of the current combination.
     *
     * @param {HTMLElement} parentEl
     * @param {boolean} isCombinationPossible
    */
    toggleDisable(parentEl, isCombinationPossible) {
        parentEl.classList.toggle("css_not_available", !isCombinationPossible);
    }

    /**
     * Updates the product image.
     * This will use the productId if available or will fallback to the productTemplateId.
     *
     * @private
     * @param {HTMLElement} container
     * @param {boolean} displayImage will hide the image if true. It will use the "invisible" class
     *   instead of d-none to prevent layout change
     * @param {integer} product_id
     * @param {integer} productTemplateId
    */
    updateProductImage(container, displayImage, productId, productTemplateId) {
        var model = productId ? "product.product" : "product.template";
        var modelId = productId || productTemplateId;
        var imageUrl = "/web/image/{0}/{1}/" + (this.productImageField ? this.productImageField : "image_1024");
        var imageSrc = imageUrl.replace("{0}", model).replace("{1}", modelId);

        const img = container.querySelector("span[data-oe-model^='product.'][data-oe-type='image'] img:first, img.product_detail_img")
        if (displayImage) {
            img.classList.remove("invisible")
            img.setAttribute("src", imageSrc);
        } else {
            img.classList.add("invisible");
        }
    }

    /**
     * Highlight selected color
     *
     * @param {MouseEvent} ev
    */
    onChangeColorAttribute(ev) {
        const cssAttributeColorEls = ev.target.closest(".js_product").querySelectorAll(".css_attribute_color")
        for (const cssAttributeColorEl of cssAttributeColorEls) {
            cssAttributeColorEl.classList.remove("active").filter(":has(input:checked)").classList.add("active")
        }
    }

    /**
     * @param {MouseEvent} ev
    */
    onChangePillsAttribute(ev) {
        const radio = ev.target.closest(".o_variant_pills").querySelector("input").click(); // Trigger onChangeVariant.
        const cssAttributeColorEls = ev.target.closest(".js_product").querySelectorAll(".o_variant_pills")
        for (const cssAttributeColorEl of cssAttributeColorEls) {
            cssAttributeColorEl.classList.remove("active").filter(":has(input:checked)").classList.add("active")
        }
    }

    /**
     * Extension point for website_sale
     *
     * @param {string} uri The uri to adapt
     */
    getURI(uri) {
        return uri;
    }

}
