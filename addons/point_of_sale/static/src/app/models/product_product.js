/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

/**
 * ProductProduct, shadow of product.product in python.
 * To works properly, this model needs to be registered in the registry
 * with the key "pos_available_models". And to be instanciated with the
 * method createRelatedModels from related_models.js
 *
 * Models to load: product.product, uom.uom
 */

export class ProductProduct extends Base {
    static pythonModel = "product.product";

    // Getter
    isAllowOnlyOneLot() {
        const productUnit = this.uom_uom;
        return this.tracking === "lot" || !productUnit || !productUnit.is_pos_groupable;
    }

    isTracked() {
        return (
            ["serial", "lot"].includes(this.tracking) &&
            (this.pos.stock_picking_type.use_create_lots ||
                this.pos.stock_picking_type.use_existing_lots)
        );
    }
    async _onScaleNotAvailable() {}
    get isScaleAvailable() {
        return true;
    }
    getFormattedUnitPrice() {
        const formattedUnitPrice = this.env.utils.formatCurrency(this.get_display_price());
        if (this.to_weight) {
            return `${formattedUnitPrice}/${this.get_unit().name}`;
        } else {
            return formattedUnitPrice;
        }
    }
    async getAddProductOptions(code) {
        let price_extra = 0.0;
        let draftPackLotLines, packLotLinesToEdit, attribute_value_ids;
        let quantity = 1;
        let comboLines = [];
        let attribute_custom_values = {};

        if (code && this.pos.db.product_packaging_by_barcode[code.code]) {
            quantity = this.pos.db.product_packaging_by_barcode[code.code].qty;
        }

        const attributes = this.pos.product_attribute.filter((attr) =>
            this.attribute_line_ids.includes(attr.id)
        );

        if (attributes.length > 0) {
            const { confirmed, payload } = await this.env.services.popup.add(
                ProductConfiguratorPopup,
                {
                    product: this,
                    attributes: attributes,
                    quantity: quantity,
                }
            );

            if (confirmed) {
                attribute_value_ids = payload.attribute_value_ids;
                attribute_custom_values = payload.attribute_custom_values;
                price_extra += payload.price_extra;
                quantity = payload.quantity;
            } else {
                return;
            }
        }
        if (this.combo_ids.length) {
            const { confirmed, payload } = await this.env.services.popup.add(
                ComboConfiguratorPopup,
                { product: this }
            );
            if (!confirmed) {
                return;
            }
            comboLines = payload;
        }
        // Gather lot information if required.
        if (this.isTracked()) {
            packLotLinesToEdit =
                (!this.isAllowOnlyOneLot() &&
                    this.pos.selectedOrder
                        .get_orderlines()
                        .filter((line) => !line.get_discount())
                        .find((line) => line.product.id === this.id)
                        ?.getPackLotLinesToEdit()) ||
                [];
            // if the lot information exists in the barcode, we don't need to ask it from the user.
            if (code && code.type === "lot") {
                // consider the old and new packlot lines
                const modifiedPackLotLines = Object.fromEntries(
                    packLotLinesToEdit.filter((item) => item.id).map((item) => [item.id, item.text])
                );
                const newPackLotLines = [{ lot_name: code.code }];
                draftPackLotLines = { modifiedPackLotLines, newPackLotLines };
            } else {
                draftPackLotLines = await this.pos.getEditedPackLotLines(
                    this.isAllowOnlyOneLot(),
                    packLotLinesToEdit,
                    this.display_name
                );
            }
            if (!draftPackLotLines) {
                return;
            }
        }

        // Take the weight if necessary.
        if (this.to_weight && this.pos.pos_config.iface_electronic_scale) {
            // Show the ScaleScreen to weigh the product.
            if (this.isScaleAvailable) {
                const product = this;
                const { confirmed, payload } = await this.env.services.pos.showTempScreen(
                    "ScaleScreen",
                    {
                        product,
                    }
                );
                if (confirmed) {
                    quantity = payload.weight;
                } else {
                    // do not add the product;
                    return;
                }
            } else {
                await this._onScaleNotAvailable();
            }
        }

        return {
            draftPackLotLines,
            quantity,
            attribute_custom_values,
            price_extra,
            comboLines,
            attribute_value_ids,
        };
    }
    isPricelistItemUsable(item, date) {
        const categories = this.parent_category_ids.concat(this.categ.id);
        return (
            (!item.categ_id || categories.includes(item.categ_id[0])) &&
            (!item.date_start || deserializeDate(item.date_start) <= date) &&
            (!item.date_end || deserializeDate(item.date_end) >= date)
        );
    }
    // Port of _get_product_price on product.pricelist.
    //
    // Anything related to UOM can be ignored, the POS will always use
    // the default UOM set on the product and the user cannot change
    // it.
    //
    // Pricelist items do not have to be sorted. All
    // product.pricelist.item records are loaded with a search_read
    // and were automatically sorted based on their _order by the
    // ORM. After that they are added in this order to the pricelists.
    get_price(pricelist, quantity, price_extra = 0, recurring = false) {
        const date = DateTime.now();

        // In case of nested pricelists, it is necessary that all pricelists are made available in
        // the POS. Display a basic alert to the user in the case where there is a pricelist item
        // but we can't load the base pricelist to get the price when calling this method again.
        // As this method is also call without pricelist available in the POS, we can't just check
        // the absence of pricelist.
        if (recurring && !pricelist) {
            alert(
                _t(
                    "An error occurred when loading product prices. " +
                        "Make sure all pricelists are available in the POS."
                )
            );
        }

        const rules = !pricelist
            ? []
            : (this.applicablePricelistItems[pricelist.id] || []).filter((item) =>
                  this.isPricelistItemUsable(item, date)
              );

        let price = this.lst_price + (price_extra || 0);
        const rule = rules.find((rule) => !rule.min_quantity || quantity >= rule.min_quantity);
        if (!rule) {
            return price;
        }

        if (rule.base === "pricelist") {
            const base_pricelist = this.pos.product_pricelist.find(
                (pricelist) => pricelist.id === rule.base_pricelist_id[0]
            );
            if (base_pricelist) {
                price = this.get_price(base_pricelist, quantity, 0, true);
            }
        } else if (rule.base === "standard_price") {
            price = this.standard_price;
        }

        if (rule.compute_price === "fixed") {
            price = rule.fixed_price;
        } else if (rule.compute_price === "percentage") {
            price = price - price * (rule.percent_price / 100);
        } else {
            var price_limit = price;
            price -= price * (rule.price_discount / 100);
            if (rule.price_round) {
                price = round_pr(price, rule.price_round);
            }
            if (rule.price_surcharge) {
                price += rule.price_surcharge;
            }
            if (rule.price_min_margin) {
                price = Math.max(price, price_limit + rule.price_min_margin);
            }
            if (rule.price_max_margin) {
                price = Math.min(price, price_limit + rule.price_max_margin);
            }
        }

        // This return value has to be rounded with round_di before
        // being used further. Note that this cannot happen here,
        // because it would cause inconsistencies with the backend for
        // pricelist that have base == 'pricelist'.
        return price;
    }
    get_display_price({
        pricelist = this.pos.getDefaultPricelist(),
        quantity = 1,
        price = this.get_price(pricelist, quantity),
        iface_tax_included = this.pos.pos_config.iface_tax_included,
    } = {}) {
        const order = this.pos.get_order();
        const taxes = this.pos.get_taxes_after_fp(this.taxes_id, order && order.fiscal_position);
        const currentTaxes = this.pos.indexed.account_tax.id[this.taxes_id];
        const priceAfterFp = this.pos.computePriceAfterFp(price, currentTaxes);
        const allPrices = this.pos.compute_all(
            taxes,
            priceAfterFp,
            1,
            this.pos.res_currency.rounding
        );
        if (iface_tax_included === "total") {
            return allPrices.total_included;
        } else {
            return allPrices.total_excluded;
        }
    }
}
registry.category("pos_available_models").add(ProductProduct.pythonModel, ProductProduct);
