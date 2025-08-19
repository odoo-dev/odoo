import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { STORE_SYMBOL } from "@point_of_sale/app/models/related_models/utils";
import { accountTaxHelpers } from "@account/helpers/account_tax";

export function computeProductPrice(selfOrder, productTemplate, selectedAttributes, qty) {
    const lineValues = getOrderLineValues(selfOrder, productTemplate, qty, "", selectedAttributes);
    const order = lineValues.order_id;
    const line = createTransientLine(order, {
        ...lineValues,
        order_id: order.id,
        product_id: lineValues.product_id.id,
        tax_ids: lineValues.tax_ids.map((t) => t.id),
        attribute_value_ids: lineValues.attribute_value_ids?.map((a) => a.id),
    });

    return selfOrder.isTaxesIncludedInPrice() ? line.getPriceWithTax() : line.getPriceWithoutTax();
}

export function computeTotalComboPrice(selfOrder, productTemplate, comboValues, qty) {
    if (!comboValues || !comboValues.length) {
        return selfOrder.getProductDisplayPrice(productTemplate);
    }

    const baseLineValues = getOrderLineValues(
        selfOrder,
        productTemplate,
        qty,
        "",
        {},
        {},
        comboValues
    );
    const order = baseLineValues.order_id;

    // Generate temporary order lines to compute the price
    const transientLines = baseLineValues.combo_line_ids.map((cline) => {
        const comboLine = cline[1]; //cline[O] is "create"
        return createTransientLine(order, {
            ...comboLine,
            combo_item_id: comboLine.combo_item_id.id,
            product_id: comboLine.product_id.id,
            tax_ids: comboLine.tax_ids.map((t) => t.id),
            attribute_value_ids: comboLine.attribute_value_ids?.map((a) => a.id),
        });
    });
    return selfOrder.isTaxesIncludedInPrice()
        ? order.getTotalWithTaxOfLines(transientLines)
        : order.getTotalWithoutTaxOfLines(transientLines);
}

export function getOrderLineValues(
    selfOrder,
    productTemplate,
    qty,
    customer_note,
    selectedValues = {},
    customValues = {},
    comboValues = {}
) {
    const product = productTemplate.product_variant_ids[0];
    const productPrice = selfOrder.getProductPriceInfo(productTemplate, product);
    const { models, currentOrder } = selfOrder;

    const values = {
        order_id: currentOrder,
        product_id: product,
        tax_ids: [...productTemplate.taxes_id],
        qty: qty,
        note: customer_note || "",
        price_unit: productPrice.pricelist_price,
        price_extra: 0,
        price_type: "original",
    };

    if (Object.entries(selectedValues).length > 0) {
        const productVariant = models["product.product"].find(
            (prd) =>
                prd.product_tmpl_id.id === productTemplate.id &&
                prd.product_template_variant_value_ids.every((ptav) =>
                    Object.values(selectedValues).some((value) => ptav.id == value)
                )
        );

        if (productVariant) {
            Object.assign(values, {
                product_id: productVariant,
                price_unit: productVariant.lst_price,
                tax_ids: [...productVariant.taxes_id],
            });
        }

        values.attribute_value_ids = Object.entries(selectedValues).reduce(
            (acc, [attributeId, options]) => {
                const optionEntries = Object.entries(
                    typeof options === "object" ? options : { [options]: true }
                ).filter(([, isSelected]) => isSelected); // Only true values

                optionEntries.forEach(([optionId]) => {
                    const attrVal = models["product.template.attribute.value"].get(
                        Number(optionId)
                    );
                    if (attrVal.attribute_id.create_variant !== "always") {
                        values.price_extra += attrVal.price_extra;
                    }
                    acc.push(attrVal);
                });
                return acc;
            },
            []
        );

        if (Object.values(customValues).length > 0) {
            values.custom_attribute_value_ids = Object.values(customValues).map((c) => [
                "create",
                c,
            ]);
        }
    }

    if (Object.entries(comboValues).length > 0) {
        const comboChoices = [];
        const extraComboChoices = [];
        const order = values.order_id;

        // Group comboValues by combo_id
        const groupedByCombo = new Map();
        for (const item of comboValues) {
            const comboId = item.combo_item_id.combo_id;
            if (!groupedByCombo.has(comboId)) {
                groupedByCombo.set(comboId, []);
            }
            groupedByCombo.get(comboId).push(item);
        }

        for (const [combo, items] of groupedByCombo) {
            const maxFree = combo.qty_free;
            // Split items between free items and extra items.
            let freeCount = 0;
            for (const item of items) {
                const availableFreeQty = Math.max(0, maxFree - freeCount);
                const freeQty = Math.min(item.qty, availableFreeQty);
                const extraQty = item.qty - freeQty;

                if (freeQty > 0) {
                    comboChoices.push({ ...item, qty: freeQty });
                    freeCount += freeQty;
                }

                if (extraQty > 0) {
                    extraComboChoices.push({ ...item, qty: extraQty });
                }
            }
        }

        const comboChoiceBaseLines = order.prepareComboChoiceBaseLines(comboChoices);
        const comboItemBaseLines = order.prepareComboItemBaseLines(product, comboChoiceBaseLines);
        const extraComboChoiceBaseLines = order.prepareComboChoiceBaseLines(extraComboChoices);

        values.price_unit = 0;
        values.combo_id = product.combo_id;
        values.combo_line_ids = [...comboItemBaseLines, ...extraComboChoiceBaseLines].map((baseLine) => [
            "create",
            {
                product_id: baseLine.product_id,
                tax_ids: baseLine.tax_ids.map((tax) => [
                    "link",
                    tax,
                ]),
                combo_item_id: baseLine._combo_item_id,
                price_unit: baseLine.price_unit,
                order_id: order,
                qty: baseLine.quantity * qty,  // TODO: wtf is that multiplication?
                attribute_value_ids: baseLine._attribute_value_ids.map((attributeId) => [
                    "link",
                    attributeId,
                ]),
                custom_attribute_value_ids: Object.entries(baseLine._attribute_custom_values).map(
                    ([id, cus]) => ["create", cus]
                ),
                extra_tax_data: accountTaxHelpers.export_base_line_extra_tax_data(baseLine),
            },
        ]);
    }

    if (values.price_extra > 0) {
        const price = values.product_id.getPrice(
            currentOrder.pricelist_id,
            values.qty,
            values.price_extra,
            false,
            values.product_id
        );

        values.price_unit = price;
    }
    return values;
}

function createTransientLine(order, raw) {
    // TODO hack we need to find a better solution
    raw.order_id = order.id;
    const line = new PosOrderline({
        model: {
            models: order.models,
        },
        raw: raw,
        store: order.records,
    });
    line[STORE_SYMBOL] = order[STORE_SYMBOL];
    return line;
}
