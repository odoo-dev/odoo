import { accountTaxHelpers } from "@account/helpers/account_tax";
import { computeComboItems } from "./compute_combo_items";

/**
 * Combo suggestion helpers for POS and self-order flows.
 *
 * This file answers three related questions:
 * 1. Which combo products can be built from the current standalone order lines?
 * 2. Which exact order lines should be consumed to build those combos?
 * 3. How should that combination be represented when the combo is added back to the cart?
 *
 * The main flow is:
 * - `getApplicableProductCombo()` finds combo products that can be built.
 * - `getSortedBestPotentialCombos()` prepares the "best suggestion" candidates for the UI.
 *
 * Example:
 * If an order contains one burger and one drink as standalone lines, and a "Meal Combo" includes
 * those items, this module can detect that match, compute the combo price, and return the combo
 * item payload needed to replace the standalone lines with the combo product.
 */
const MAX_COMBO_COMPUTATIONS = 20;

function getProductOrderMap(order) {
    const lines = order.unsentLines || order.lines;
    return lines.reduce((acc, line) => {
        if (line.isPartOfCombo()) {
            return acc;
        }

        const productId = line.product_id.id;
        if (!acc[productId]) {
            acc[productId] = { lines: {}, totalQty: 0 };
        }

        acc[productId].lines[line.uuid] = line.qty;
        acc[productId].totalQty += line.qty;
        return acc;
    }, {});
}

/**
 * Computes how many units can contribute to each combo group across the current order.
 *
 * A combo group can accept several products, so we sum the quantities of every matching standalone
 * line to estimate whether the group can satisfy its free-item requirement.
 */
function getTotalQtyAvailableByCombo(models, productInOrder) {
    return models["product.combo"]
        .getAll()
        .flatMap((combo) => combo.combo_item_ids)
        .reduce((acc, item) => {
            const productId = item.product_id.id;
            const productQty = productInOrder[productId]?.totalQty;
            if (productQty) {
                acc[item.combo_id.id] = (acc[item.combo_id.id] || 0) + productQty;
            }
            return acc;
        }, {});
}

function getProductsToCheck(productCombos, mode, productTmpl) {
    const getPrice = (comboProduct) =>
        comboProduct.product_tmpl_id?.list_price ?? comboProduct.list_price ?? 0;

    if (mode === "full" && productTmpl) {
        return [productTmpl];
    }

    return [...productCombos].sort((a, b) => getPrice(a) - getPrice(b));
}

/**
 * Determines how many times a combo product can be assembled with the current cart content.
 *
 * Non-upsell groups must be fully satisfied, while upsell groups only contribute metadata used by
 * the UI to explain that extra paid items may still be needed.
 */
function getComboAvailability(comboGroups, totalQtyAvailable) {
    let comboQty = Infinity;
    let hasUpsell = false;

    for (const combo of comboGroups) {
        if (combo.is_upsell) {
            hasUpsell = true;
            continue;
        }

        const availableQty = totalQtyAvailable[combo.id] || 0;
        if (availableQty < combo.qty_free) {
            return { comboQty: 0, hasUpsell };
        }

        comboQty = Math.min(availableQty / combo.qty_free, comboQty);
    }

    return { comboQty, hasUpsell };
}

function getLineComboData(line, comboItem, qty) {
    return {
        qty,
        combo_item: comboItem,
        line_price: line.displayPriceUnit * qty,
        display_name: line.full_product_name || line.product_id.display_name,
        attribute_value_ids: line.attribute_value_ids.map((value) => value.id),
        attribute_value_extra_price: line.attribute_value_ids.reduce(
            (sum, value) => sum + value.price_extra,
            0
        ),
    };
}

/**
 * Builds the concrete order-line selection for one combo group.
 *
 * The method mutates `availableQty` on purpose so later groups and later combination passes do not
 * reuse the same source line quantities twice.
 */
function buildCombinationForGroup(order, combo, availableQty, totalQtyAvailable, comboQty) {
    const quantityTaken = {};
    let qtyNeeded = Math.min(Math.ceil(totalQtyAvailable[combo.id] / comboQty), combo.qty_max);

    for (const item of combo.combo_item_ids) {
        const productLines = availableQty[item.product_id.id]?.lines;
        if (!productLines) {
            continue;
        }

        for (const [lineUuid, qty] of Object.entries(productLines)) {
            if (qtyNeeded === 0) {
                break;
            }
            if (qty === 0) {
                continue;
            }

            const line = order.lines.find((orderLine) => orderLine.uuid === lineUuid);
            const takenQty = Math.min(qty, qtyNeeded);
            quantityTaken[lineUuid] = getLineComboData(line, item, takenQty);
            productLines[lineUuid] -= takenQty;
            qtyNeeded -= takenQty;
        }
    }

    if (combo.is_upsell) {
        quantityTaken.upsell = true;
    }

    return quantityTaken;
}

/**
 * Creates one or more concrete combinations for a combo product.
 *
 * In `combinations` mode we compute up to `MAX_COMBO_COMPUTATIONS` concrete combinations and
 * group equivalent ones for the suggestion popup.
 * In fuller modes we also cap the work to avoid expensive combinatorics on large carts.
 */
function buildCombinations(order, comboGroups, productInOrder, totalQtyAvailable, comboQty) {
    const combinations = [];
    const availableQty = JSON.parse(JSON.stringify(productInOrder));
    const qtyToCheck = Math.min(comboQty, MAX_COMBO_COMPUTATIONS);

    for (let i = 0; i < qtyToCheck; i++) {
        const combination = {};
        for (const combo of comboGroups) {
            combination[combo.id] = buildCombinationForGroup(
                order,
                combo,
                availableQty,
                totalQtyAvailable,
                comboQty
            );
        }
        combinations.push(combination);
    }

    return combinations;
}

function flattenCombinationItems(combinations) {
    return combinations
        .flatMap((items) => Object.values(items))
        .flatMap((item) => Object.values(item))
        .filter((value) => value && typeof value === "object");
}

/**
 * Separates combo items into free inclusions and paid extras.
 *
 * Quantities up to `qty_free` stay in the combo base price; the remainder is priced as extra
 * items when evaluating the suggestion.
 */
function splitFreeAndExtraComboItems(itemLines) {
    const remainingFreeByCombo = new Map();
    const includedItems = [];
    const extraItems = [];

    for (const item of itemLines) {
        const comboItem = item.combo_item;
        const comboId = comboItem.combo_id.id;
        const remainingFree = remainingFreeByCombo.get(comboId) ?? comboItem.combo_id.qty_free;
        const freeQty = Math.min(item.qty, remainingFree);
        const extraQty = item.qty - freeQty;
        const baseItem = {
            combo_item_id: comboItem,
            configuration: {
                attribute_value_ids: item.attribute_value_ids,
                price_extra: item.attribute_value_extra_price,
            },
        };

        if (freeQty > 0) {
            includedItems.push({ ...baseItem, qty: freeQty });
        }
        if (extraQty > 0) {
            extraItems.push({ ...baseItem, qty: extraQty });
        }

        remainingFreeByCombo.set(comboId, remainingFree - freeQty);
    }

    return { includedItems, extraItems };
}

function getComboBaseLines(context, comboProduct, includedItems, extraItems) {
    const { order, models, currency } = context;
    const comboPrices = computeComboItems(
        comboProduct,
        includedItems,
        order.pricelist_id,
        models["decimal.precision"].getAll(),
        models["product.template.attribute.value"].getAllBy("id"),
        extraItems,
        currency
    );
    return comboPrices.map((comboPrice) =>
        accountTaxHelpers.prepare_base_line_for_taxes_computation(
            {},
            {
                currency_id: currency,
                quantity: comboPrice.qty,
                price_unit: comboPrice.price_unit,
                tax_ids: comboPrice.combo_item_id.product_id.taxes_id,
                product_id: comboPrice.combo_item_id.product_id,
            }
        )
    );
}

function getCombinationsTaxSummary(context, comboProduct, combinations) {
    const { currency, company, config } = context;
    const baseLines = combinations.flatMap((combination) => {
        const itemLines = flattenCombinationItems([combination]);
        const { includedItems, extraItems } = splitFreeAndExtraComboItems(itemLines);
        return getComboBaseLines(context, comboProduct, includedItems, extraItems);
    });

    accountTaxHelpers.add_tax_details_in_base_lines(baseLines, company);
    accountTaxHelpers.round_base_lines_tax_details(baseLines, company);

    return accountTaxHelpers.get_tax_totals_summary(baseLines, currency, company, {
        cash_rounding: config.cash_rounding ? config.rounding_method : null,
    });
}

function getMatchingComboEntry(context, comboProduct, combinations, comboQty) {
    const itemLines = flattenCombinationItems(combinations);
    const taxSummary = getCombinationsTaxSummary(context, comboProduct, combinations);
    const totalComboPrice =
        context.config.iface_tax_included === "total"
            ? taxSummary.total_amount
            : taxSummary.base_amount;

    return {
        product: comboProduct,
        combinations,
        combinationsQty: comboQty,
        totalComboPrice,
        totalSplitedComboLinePrice: context.currency.round(
            itemLines.reduce((sum, line) => sum + line.line_price, 0)
        ),
    };
}

function sortPotentialCombos(potentialCombos) {
    potentialCombos.applicable.sort((a, b) => b.comboPrice - a.comboPrice);
    potentialCombos.upsell.sort((a, b) => {
        if (a.numberOfUpsell === b.numberOfUpsell) {
            return b.comboPrice - a.comboPrice;
        }
        return a.numberOfUpsell - b.numberOfUpsell;
    });
    return potentialCombos;
}

function getOrCreateChoiceEntry(comboItems, name, comboProduct, upsell = false) {
    if (!comboItems[name]) {
        comboItems[name] = {
            quantity: 0,
            upsell,
            sequence: comboProduct.sequence,
            id: comboProduct.id,
        };
    }
    return comboItems[name];
}

function sortComboChoiceLines(lines) {
    return lines.sort((a, b) => {
        if (a.upsell !== b.upsell) {
            return a.upsell ? 1 : -1;
        }
        if (a.sequence !== b.sequence) {
            return a.sequence - b.sequence;
        }
        return a.id - b.id;
    });
}

/**
 * Returns combo products that can be assembled from the current non-combo order lines.
 *
 * Modes:
 * - `limited`: quick existence check used when only a small preview is needed.
 * - `combinations`: computes up to `MAX_COMBO_COMPUTATIONS` concrete combinations, then groups
 *   equivalent ones for suggestion UIs.
 * - `full`: computes the full combo entry for a specific product template.
 */
export function getApplicableProductCombo(context, mode = "limited", productTmpl = null) {
    const matchingCombos = [];
    const productInOrder = getProductOrderMap(context.order);
    const totalQtyAvailable = getTotalQtyAvailableByCombo(context.models, productInOrder);
    const productsToCheck = getProductsToCheck(context.productCombos, mode, productTmpl);

    for (const comboProduct of productsToCheck) {
        const comboGroups = comboProduct.combo_ids;
        const { comboQty, hasUpsell } = getComboAvailability(comboGroups, totalQtyAvailable);
        const usableComboAvailability = comboQty !== 0 && comboQty !== Infinity;

        if (!usableComboAvailability) {
            continue;
        }

        if (mode === "limited") {
            matchingCombos.push({
                product: comboProduct,
                quantity: comboQty,
                hasUpsell,
            });
            if (matchingCombos.length > 1) {
                break;
            }
            continue;
        }

        const combinations = buildCombinations(
            context.order,
            comboGroups,
            productInOrder,
            totalQtyAvailable,
            comboQty
        );

        const grouped = [];

        for (const combination of combinations) {
            let found = false;

            for (const group of grouped) {
                if (isSameCombination(group[0], combination)) {
                    group.push(combination);
                    found = true;
                    break;
                }
            }

            if (!found) {
                grouped.push([combination]);
            }
        }

        for (const group of grouped) {
            matchingCombos.push(getMatchingComboEntry(context, comboProduct, group, group.length));
        }
    }

    return matchingCombos;
}

/**
 * Checks whether two computed combinations consume the same combo items with the same attributes.
 *
 * Grouping equivalent combinations keeps the suggestion list compact and lets the UI expose the
 * quantity of a reusable combination instead of showing duplicates.
 */
function isSameCombination(a, b) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
        return false;
    }

    for (const comboId of keysA) {
        const comboA = a[comboId];
        const comboB = b[comboId];

        if (!!comboA.upsell !== !!comboB.upsell) {
            return false;
        }

        const itemsA = Object.values(comboA).filter((v) => typeof v === "object");
        const itemsB = Object.values(comboB).filter((v) => typeof v === "object");

        if (itemsA.length !== itemsB.length) {
            return false;
        }

        for (let i = 0; i < itemsA.length; i++) {
            const itemA = itemsA[i];
            const itemB = itemsB[i];

            if (itemA.combo_item.id !== itemB.combo_item.id) {
                return false;
            }
            if (itemA.qty !== itemB.qty) {
                return false;
            }

            const attrsA = itemA.attribute_value_ids.join(",");
            const attrsB = itemB.attribute_value_ids.join(",");

            if (attrsA !== attrsB) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Splits applicable combos into direct matches and upsell-based matches, then sorts them so the UI
 * can present the most useful suggestions first.
 */
export function getSortedBestPotentialCombos(context) {
    const potentialCombos = {
        applicable: [],
        upsell: [],
    };

    getApplicableProductCombo(context, "combinations").forEach((combo) => {
        combo.comboPrice = combo.product.getPrice(
            context.order.pricelist_id,
            combo.combinationsQty
        );
        combo.numberOfUpsell = Object.values(combo.combinations[0]).reduce(
            (acc, c) => acc + (c.upsell ? 1 : 0),
            0
        );
        if (combo.numberOfUpsell > 0) {
            potentialCombos.upsell.push(combo);
        } else {
            potentialCombos.applicable.push(combo);
        }
    });

    return sortPotentialCombos(potentialCombos);
}

/**
 * Formats one combination into readable choice lines for the combo suggestion dialog.
 *
 * Upsell placeholders are represented as synthetic lines when a combo group still has remaining
 * capacity that would need an extra paid item.
 */
export function getComboChoiceLines(models, combinations) {
    const comboItems = {};
    const comboList = Array.isArray(combinations) ? combinations : [combinations];

    for (const combination of comboList) {
        for (const [comboId, comboChoice] of Object.entries(combination)) {
            const comboProduct = models["product.combo"].get(comboId);
            const totalChosenQty = Object.values(comboChoice).reduce(
                (sum, line) => (line === true || typeof line === "number" ? sum : sum + line.qty),
                0
            );

            for (const line of Object.values(comboChoice)) {
                if (line === true) {
                    if (totalChosenQty < comboProduct.qty_max) {
                        const choice = getOrCreateChoiceEntry(
                            comboItems,
                            comboProduct.name,
                            comboProduct,
                            true
                        );
                        choice.quantity += comboProduct.qty_max - totalChosenQty;
                    }
                    continue;
                }

                const choice = getOrCreateChoiceEntry(
                    comboItems,
                    line.display_name || line.combo_item.product_id.display_name,
                    comboProduct
                );
                choice.quantity += line.qty;
            }
        }
    }

    return sortComboChoiceLines(
        Object.entries(comboItems).map(([name, value]) => ({
            name,
            ...value,
        }))
    );
}

export function getAllComboChoices(models, potentialCombos) {
    const applicableCombos = potentialCombos.applicable.map((combo) => ({
        ...combo,
        lines: getComboChoiceLines(models, combo.combinations),
    }));
    const upsellCombos = potentialCombos.upsell.map((combo) => ({
        ...combo,
        upsell: true,
        lines: getComboChoiceLines(models, combo.combinations),
    }));
    return [...applicableCombos, ...upsellCombos];
}

// NO need
/**
 * Converts one computed combination into the `comboValues` payload expected by combo creation.
 */
export function getComboValuesFromCombination(combination) {
    const result = [];

    for (const combo of Object.values(combination)) {
        if (!combo) {
            continue;
        }

        for (const item of Object.values(combo)) {
            if (!item || typeof item !== "object" || item.qty <= 0) {
                continue;
            }

            result.push({
                combo_item_id: item.combo_item,
                qty: item.qty,
                configuration: {
                    attribute_custom_values: [],
                    attribute_value_ids: item.attribute_value_ids,
                    price_extra: item.attribute_value_extra_price,
                },
            });
        }
    }

    return result;
}
