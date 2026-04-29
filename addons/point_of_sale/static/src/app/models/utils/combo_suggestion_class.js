function _getProductOrderMap(order) {
    const lines = order.unsentLines || order.lines;
    return lines.reduce((acc, line) => {
        if (line.isPartOfCombo() || line.qty <= 0) {
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

function _getComboAvailability(comboGroups, totalQtyAvailable) {
    let comboQty = 0;
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
        const qtyToAdd = availableQty / combo.qty_free;
        comboQty = comboQty ? Math.min(qtyToAdd, comboQty) : qtyToAdd;
    }

    return { comboQty, hasUpsell };
}

function _getLineComboData(line, comboItem, qty) {
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
const MAX_COMBO_COMPUTATIONS = 20;

export class ComboSuggestion {
    constructor(models, currency, company, config) {
        this.models = models;
        this.config = config;
        this.company = company;
        this.currency = currency;
        this.productCombos = this._getProductCombos();
    }

    _getProductCombos() {
        const getPrice = (comboProduct) =>
            comboProduct.product_tmpl_id?.list_price ?? comboProduct.list_price ?? 0;
        return this.models["product.product"]
            .filter((product) => product.type === "combo")
            .sort((a, b) => getPrice(a) - getPrice(b));
    }

    _getTotalQtyAvailableByCombo(productInOrder) {
        return this.models["product.combo"]
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

    _buildCombinationForGroup(order, combo, availableQty, totalQtyAvailable, comboQty) {
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
                quantityTaken[lineUuid] = _getLineComboData(line, item, takenQty);
                productLines[lineUuid] -= takenQty;
                qtyNeeded -= takenQty;
            }
        }

        if (combo.is_upsell) {
            quantityTaken.upsell = true;
        }

        return quantityTaken;
    }

    _buildCombinations(order, comboGroups, productInOrder, totalQtyAvailable, comboQty) {
        const combinations = [];
        const availableQty = JSON.parse(JSON.stringify(productInOrder));
        const qtyToCheck = Math.min(comboQty, MAX_COMBO_COMPUTATIONS);

        for (let i = 0; i < qtyToCheck; i++) {
            const combination = {};
            for (const combo of comboGroups) {
                combination[combo.id] = this._buildCombinationForGroup(
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

    // @param {string} mode: limited | combinaison | full
    getApplicableProductCombo(order, mode = "limited") {
        const matchingCombos = [];
        const productsToCheck = this.productCombos;
        const productInOrder = _getProductOrderMap(order);
        const totalQtyAvailable = this._getTotalQtyAvailableByCombo(productInOrder);

        for (const comboProduct of productsToCheck) {
            const comboGroups = comboProduct.combo_ids;
            const { comboQty, hasUpsell } = _getComboAvailability(comboGroups, totalQtyAvailable);

            if (comboQty === 0) {
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

            // const combinations = this._buildCombinations(
            //     order,
            //     comboGroups,
            //     productInOrder,
            //     totalQtyAvailable,
            //     comboQty
            // );
        }
        return matchingCombos;
    }

    // old getSortedBestPotentialCombos
    getPotentialCombos(order) {
        const applicable = [],
            upsell = [];

        this.getApplicableProductCombo(order, "combinations").forEach((combo) => {
            combo.comboPrice = combo.product.getPrice(order.pricelist_id, combo.combinationsQty);
            combo.numberOfUpsell = Object.values(combo.combinations[0]).reduce(
                (acc, c) => acc + (c.upsell ? 1 : 0),
                0
            );
            if (combo.numberOfUpsell > 0) {
                upsell.push(combo);
            } else {
                applicable.push(combo);
            }
        });

        return {
            applicable: applicable.sort((a, b) => b.comboPrice - a.comboPrice),
            upsell: upsell.sort((a, b) =>
                a.numberOfUpsell === b.numberOfUpsell
                    ? b.comboPrice - a.comboPrice
                    : a.numberOfUpsell - b.numberOfUpsell
            ),
        };
    }
}
