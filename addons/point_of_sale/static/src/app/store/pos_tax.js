/** @odoo-module */
// import { registry } from "@web/core/registry";
import { Reactive } from "@web/core/utils/reactive";
import { roundPrecision as round_pr } from "@web/core/utils/numbers";
import { _t } from "@web/core/l10n/translation";

/* Returns an array containing all elements of the given
 * array corresponding to the rule function {agg} and without duplicates
 *
 * @template T
 * @template F
 * @param {T[]} array
 * @param {F} function
 * @returns {T[]}
 */
export function uniqueBy(array, agg) {
    const map = new Map();
    for (const item of array) {
        const key = agg(item);
        if (!map.has(key)) {
            map.set(key, item);
        }
    }
    return [...map.values()];
}

const { DateTime } = luxon;

export class PosTax extends Reactive {
    constructor() {
        super();
        this.setup(...arguments);
    }

    setup(company, currency, priceList, taxes_by_id, config) {
        this.currency = currency;
        this.company = company;
        this.taxes_by_id = taxes_by_id;
        this.priceList = priceList;
        this.config = config;
        this.partner = null;
    }

    getTaxesByIds(taxIds) {
        const taxes = [];
        for (let i = 0; i < taxIds.length; i++) {
            if (this.taxes_by_id[taxIds[i]]) {
                taxes.push(this.taxes_by_id[taxIds[i]]);
            }
        }
        return taxes;
    }

    get_display_price(pricelist, quantity, order, product) {
        const taxes = this.get_taxes_after_fp(product.taxes_id, order && order.fiscal_position);
        const currentTaxes = this.getTaxesByIds(product.taxes_id);
        const priceAfterFp = this.computePriceAfterFp(
            this.get_price(product, pricelist, quantity),
            currentTaxes,
            order
        );
        const allPrices = this.compute_all(taxes, priceAfterFp, 1, this.currency.rounding);
        if (this.config.iface_tax_included === "total") {
            return allPrices.total_included;
        } else {
            return allPrices.total_excluded;
        }
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
    get_price(product, pricelist, quantity, price_extra = 0, recurring = false) {
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
            : (product.applicablePricelistItems[pricelist.id] || []).filter((item) =>
                  product.isPricelistItemUsable(item, date)
              );

        let price = product.lst_price + (price_extra || 0);
        const rule = rules.find((rule) => !rule.min_quantity || quantity >= rule.min_quantity);
        if (!rule) {
            return price;
        }

        if (rule.base === "pricelist") {
            const base_pricelist = product.pos.pricelists.find(
                (pricelist) => pricelist.id === rule.base_pricelist_id[0]
            );
            if (base_pricelist) {
                price = product.get_price(base_pricelist, quantity, 0, true);
            }
        } else if (rule.base === "standard_price") {
            price = product.standard_price;
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

    /**
     * Taxes after fiscal position mapping.
     * @param {number[]} taxIds
     * @param {object | falsy} fpos - fiscal position
     * @returns {object[]}
     */
    get_taxes_after_fp(taxIds, fpos) {
        if (!fpos) {
            return taxIds.map((taxId) => this.taxes_by_id[taxId]);
        }
        const mappedTaxes = [];
        for (const taxId of taxIds) {
            const tax = this.taxes_by_id[taxId];
            if (tax) {
                const taxMaps = Object.values(fpos.fiscal_position_taxes_by_id).filter(
                    (fposTax) => fposTax.tax_src_id[0] === tax.id
                );
                if (taxMaps.length) {
                    for (const taxMap of taxMaps) {
                        if (taxMap.tax_dest_id) {
                            const mappedTax = this.taxes_by_id[taxMap.tax_dest_id[0]];
                            if (mappedTax) {
                                mappedTaxes.push(mappedTax);
                            }
                        }
                    }
                } else {
                    mappedTaxes.push(tax);
                }
            }
        }
        return uniqueBy(mappedTaxes, (tax) => tax.id);
    }

    computePriceAfterFp(price, taxes, order) {
        if (order && order.fiscal_position) {
            const mapped_included_taxes = [];
            let new_included_taxes = [];
            taxes.forEach((tax) => {
                const line_taxes = this.get_taxes_after_fp([tax.id], order.fiscal_position);
                if (line_taxes.length && line_taxes[0].price_include) {
                    new_included_taxes = new_included_taxes.concat(line_taxes);
                }
                if (tax.price_include && !line_taxes.includes(tax)) {
                    mapped_included_taxes.push(tax);
                }
            });

            if (mapped_included_taxes.length > 0) {
                if (new_included_taxes.length > 0) {
                    const price_without_taxes = this.compute_all(
                        mapped_included_taxes,
                        price,
                        1,
                        this.currency.rounding,
                        true
                    ).total_excluded;
                    return this.compute_all(
                        new_included_taxes,
                        price_without_taxes,
                        1,
                        this.currency.rounding,
                        false
                    ).total_included;
                } else {
                    return this.compute_all(
                        mapped_included_taxes,
                        price,
                        1,
                        this.currency.rounding,
                        true
                    ).total_excluded;
                }
            }
        }
        return price;
    }

    /**
     * Mirror JS method of:
     * _compute_amount in addons/account/models/account.py
     */
    _compute_all(tax, base_amount, quantity, price_exclude) {
        if (price_exclude === undefined) {
            var price_include = tax.price_include;
        } else {
            price_include = !price_exclude;
        }
        if (tax.amount_type === "fixed") {
            // Use sign on base_amount and abs on quantity to take into account the sign of the base amount,
            // which includes the sign of the quantity and the sign of the price_unit
            // Amount is the fixed price for the tax, it can be negative
            // Base amount included the sign of the quantity and the sign of the unit price and when
            // a product is returned, it can be done either by changing the sign of quantity or by changing the
            // sign of the price unit.
            // When the price unit is equal to 0, the sign of the quantity is absorbed in base_amount then
            // a "else" case is needed.
            if (base_amount) {
                return Math.sign(base_amount) * Math.abs(quantity) * tax.amount;
            } else {
                return quantity * tax.amount;
            }
        }
        if (tax.amount_type === "percent" && !price_include) {
            return (base_amount * tax.amount) / 100;
        }
        if (tax.amount_type === "percent" && price_include) {
            return base_amount - base_amount / (1 + tax.amount / 100);
        }
        if (tax.amount_type === "division" && !price_include) {
            return base_amount / (1 - tax.amount / 100) - base_amount;
        }
        if (tax.amount_type === "division" && price_include) {
            return base_amount - base_amount * (tax.amount / 100);
        }
        return false;
    }

    /**
     * Mirror JS method of:
     * compute_all in addons/account/models/account.py
     *
     * Read comments in the python side method for more details about each sub-methods.
     */
    compute_all(taxes, price_unit, quantity, currency_rounding, handle_price_include = true) {
        var self = this;

        // 1) Flatten the taxes.
        var _collect_taxes = function (taxes, all_taxes) {
            taxes = [...taxes].sort(function (tax1, tax2) {
                return tax1.sequence - tax2.sequence;
            });
            taxes.forEach((tax) => {
                if (tax.amount_type === "group") {
                    all_taxes = _collect_taxes(tax.children_tax_ids, all_taxes);
                } else {
                    all_taxes.push(tax);
                }
            });
            return all_taxes;
        };
        var collect_taxes = function (taxes) {
            return _collect_taxes(taxes, []);
        };

        taxes = collect_taxes(taxes);

        // 2) Deal with the rounding methods

        var round_tax = this.company.tax_calculation_rounding_method != "round_globally";

        var initial_currency_rounding = currency_rounding;
        if (!round_tax) {
            currency_rounding = currency_rounding * 0.00001;
        }

        // 3) Iterate the taxes in the reversed sequence order to retrieve the initial base of the computation.
        var recompute_base = function (base_amount, fixed_amount, percent_amount, division_amount) {
            return (
                (((base_amount - fixed_amount) / (1.0 + percent_amount / 100.0)) *
                    (100 - division_amount)) /
                100
            );
        };

        var base = round_pr(price_unit * quantity, initial_currency_rounding);

        var sign = 1;
        if (base < 0) {
            base = -base;
            sign = -1;
        }

        var total_included_checkpoints = {};
        var i = taxes.length - 1;
        var store_included_tax_total = true;

        var incl_fixed_amount = 0.0;
        var incl_percent_amount = 0.0;
        var incl_division_amount = 0.0;

        var cached_tax_amounts = {};
        if (handle_price_include) {
            taxes.reverse().forEach(function (tax) {
                if (tax.include_base_amount) {
                    base = recompute_base(
                        base,
                        incl_fixed_amount,
                        incl_percent_amount,
                        incl_division_amount
                    );
                    incl_fixed_amount = 0.0;
                    incl_percent_amount = 0.0;
                    incl_division_amount = 0.0;
                    store_included_tax_total = true;
                }
                if (tax.price_include) {
                    if (tax.amount_type === "percent") {
                        incl_percent_amount += tax.amount * tax.sum_repartition_factor;
                    } else if (tax.amount_type === "division") {
                        incl_division_amount += tax.amount * tax.sum_repartition_factor;
                    } else if (tax.amount_type === "fixed") {
                        incl_fixed_amount +=
                            Math.abs(quantity) * tax.amount * tax.sum_repartition_factor;
                    } else {
                        var tax_amount = self._compute_all(tax, base, quantity);
                        incl_fixed_amount += tax_amount;
                        cached_tax_amounts[i] = tax_amount;
                    }
                    if (store_included_tax_total) {
                        total_included_checkpoints[i] = base;
                        store_included_tax_total = false;
                    }
                }
                i -= 1;
            });
        }

        var total_excluded = round_pr(
            recompute_base(base, incl_fixed_amount, incl_percent_amount, incl_division_amount),
            initial_currency_rounding
        );
        var total_included = total_excluded;

        // 4) Iterate the taxes in the sequence order to fill missing base/amount values.

        base = total_excluded;

        var skip_checkpoint = false;

        var taxes_vals = [];
        i = 0;
        var cumulated_tax_included_amount = 0;
        taxes.reverse().forEach(function (tax) {
            if (tax.price_include || tax.is_base_affected) {
                var tax_base_amount = base;
            } else {
                tax_base_amount = total_excluded;
            }

            if (
                !skip_checkpoint &&
                tax.price_include &&
                total_included_checkpoints[i] !== undefined &&
                tax.sum_repartition_factor != 0
            ) {
                var tax_amount =
                    total_included_checkpoints[i] - (base + cumulated_tax_included_amount);
                cumulated_tax_included_amount = 0;
            } else {
                tax_amount = self._compute_all(tax, tax_base_amount, quantity, true);
            }

            tax_amount = round_pr(tax_amount, currency_rounding);
            var factorized_tax_amount = round_pr(
                tax_amount * tax.sum_repartition_factor,
                currency_rounding
            );

            if (tax.price_include && total_included_checkpoints[i] === undefined) {
                cumulated_tax_included_amount += factorized_tax_amount;
            }

            taxes_vals.push({
                id: tax.id,
                name: tax.name,
                amount: sign * factorized_tax_amount,
                base: sign * round_pr(tax_base_amount, currency_rounding),
            });

            if (tax.include_base_amount) {
                base += factorized_tax_amount;
                if (!tax.price_include) {
                    skip_checkpoint = true;
                }
            }

            total_included += factorized_tax_amount;
            i += 1;
        });

        return {
            taxes: taxes_vals,
            total_excluded: sign * round_pr(total_excluded, this.currency.rounding),
            total_included: sign * round_pr(total_included, this.currency.rounding),
        };
    }
}
