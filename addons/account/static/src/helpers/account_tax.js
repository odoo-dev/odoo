import { floatIsZero, roundPrecision } from "@web/core/utils/numbers";
import { _t } from "@web/core/l10n/translation";

/**
 * Round to the closest integer, ties going to the even one: the behavior of the python builtin `round`,
 * used when spreading a delta in account_tax.py. `Math.round` sends ties up, which gives the python and
 * javascript sides different distributions as soon as a share falls exactly on a half unit.
 */
function roundHalfEven(value) {
    return Math.abs(value % 1) === 0.5 ? 2 * Math.round(value / 2) : Math.round(value);
}

export const accountTaxHelpers = {
    // -------------------------------------------------------------------------
    // HELPERS IN BOTH PYTHON/JAVASCRIPT (account_tax.js / account_tax.py)
    // -------------------------------------------------------------------------

    /**
     * Helper to stringify a grouping key that could contains some records.
     *
     * [!] Only added javascript-side.
     */
    stringify_grouping_key(grouping_key) {
        if (!grouping_key || typeof grouping_key !== "object") {
            return grouping_key;
        }

        if ("id" in grouping_key) {
            return grouping_key.id;
        }

        const serializable_grouping_key = { ...grouping_key };
        for (const [key, value] of Object.entries(grouping_key)) {
            if (value && typeof value === "object" && "id" in value) {
                serializable_grouping_key[key] = value.id;
            }
        }
        return JSON.stringify(serializable_grouping_key);
    },

    // -------------------------------------------------------------------------
    // PREPARE TAXES COMPUTATION
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    flatten_taxes_and_sort_them(taxes) {
        function sort_key(taxes) {
            return taxes.toSorted((t1, t2) => t1.sequence - t2.sequence || t1.id - t2.id);
        }

        const group_per_tax = {};
        const sorted_taxes = [];
        for (const tax of sort_key(taxes)) {
            if (tax.amount_type === "group") {
                const children = sort_key(tax.children_tax_ids);
                for (const child of children) {
                    group_per_tax[child.id] = tax;
                    sorted_taxes.push(child);
                }
            } else {
                sorted_taxes.push(tax);
            }
        }
        return { sorted_taxes, group_per_tax };
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    is_price_included(tax, { document_tax_mode = null, special_mode = null }) {
        if (tax.has_negative_factor) {
            return false;
        }
        if (special_mode === 'total_included') {
            return true;
        }
        if (special_mode === 'total_excluded') {
            return false;
        }
        if (tax.price_include_override) {
            return tax.price_include_override === 'tax_included';
        }
        if (document_tax_mode) {
            return document_tax_mode === 'tax_included';
        }
        return tax.price_include;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    batch_for_taxes_computation(taxes, { special_mode = null, filter_tax_function = null, document_tax_mode = null } = {}) {
        let { sorted_taxes, group_per_tax } = this.flatten_taxes_and_sort_them(taxes);
        if (filter_tax_function) {
            sorted_taxes = sorted_taxes.filter(filter_tax_function);
        }

        const results = {
            batch_per_tax: {},
            group_per_tax: group_per_tax,
            sorted_taxes: sorted_taxes,
        };

        // Group them per batch.
        let batch = [];
        let is_base_affected = false;
        for (const tax of results.sorted_taxes.toReversed()) {
            if (batch.length > 0) {
                const same_batch =
                    tax.amount_type === batch[0].amount_type &&
                    (special_mode || this.is_price_included(tax, { document_tax_mode }) === this.is_price_included(batch[0], { document_tax_mode })) &&
                    tax.include_base_amount === batch[0].include_base_amount &&
                    ((tax.include_base_amount && !is_base_affected) || !tax.include_base_amount);
                if (!same_batch) {
                    for (const batch_tax of batch) {
                        results.batch_per_tax[batch_tax.id] = batch;
                    }
                    batch = [];
                }
            }

            is_base_affected = tax.is_base_affected;
            batch.push(tax);
        }

        if (batch.length !== 0) {
            for (const batch_tax of batch) {
                results.batch_per_tax[batch_tax.id] = batch;
            }
        }
        return results;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    propagate_extra_taxes_base(taxes, tax, taxes_data, { special_mode = null, document_tax_mode = null  } = {}) {
        function* get_tax_before() {
            for (const tax_before of taxes) {
                if (taxes_data[tax.id].batch.includes(tax_before)) {
                    break;
                }
                yield tax_before;
            }
        }

        function* get_tax_after() {
            for (const tax_after of taxes.toReversed()) {
                if (taxes_data[tax.id].batch.includes(tax_after)) {
                    break;
                }
                yield tax_after;
            }
        }

        function add_extra_base(other_tax, sign) {
            const tax_amount = taxes_data[tax.id].tax_amount;
            if (!("tax_amount" in taxes_data[other_tax.id])) {
                taxes_data[other_tax.id].extra_base_for_tax += sign * tax_amount;
            }
            taxes_data[other_tax.id].extra_base_for_base += sign * tax_amount;
        }

        if (this.is_price_included(tax, { document_tax_mode })) {
            // Case: special mode is False or 'total_included'
            if (!special_mode || special_mode === "total_included") {
                if (tax.include_base_amount) {
                    for (const other_tax of get_tax_after()) {
                        if (!other_tax.is_base_affected) {
                            add_extra_base(other_tax, -1);
                        }
                    }
                } else {
                    for (const other_tax of get_tax_after()) {
                        add_extra_base(other_tax, -1);
                    }
                }
                for (const other_tax of get_tax_before()) {
                    add_extra_base(other_tax, -1);
                }

                // Case: special_mode = 'total_excluded'
            } else {
                if (tax.include_base_amount) {
                    for (const other_tax of get_tax_after()) {
                        if (other_tax.is_base_affected) {
                            add_extra_base(other_tax, 1);
                        }
                    }
                }
            }
        } else {
            // Case: special_mode is False or 'total_excluded'
            if (!special_mode || special_mode === "total_excluded") {
                if (tax.include_base_amount) {
                    for (const other_tax of get_tax_after()) {
                        if (other_tax.is_base_affected) {
                            add_extra_base(other_tax, 1);
                        }
                    }
                }

                // Case: special_mode = 'total_included'
            } else {
                if (!tax.include_base_amount) {
                    for (const other_tax of get_tax_after()) {
                        add_extra_base(other_tax, -1);
                    }
                }
                for (const other_tax of get_tax_before()) {
                    add_extra_base(other_tax, -1);
                }
            }
        }
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_fixed_amount(tax, batch, raw_base, evaluation_context) {
        if (tax.amount_type === "fixed") {
            const sign = evaluation_context.price_unit < 0.0 ? -1 : 1;
            return sign * evaluation_context.quantity * tax.amount;
        }
        return null;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_price_included(tax, batch, raw_base, evaluation_context) {
        if (tax.amount_type === "percent") {
            const total_percentage =
                batch.reduce((sum, batch_tax) => sum + batch_tax.amount, 0) / 100.0;
            const to_price_excluded_factor =
                total_percentage !== -1 ? 1 / (1 + total_percentage) : 0.0;
            return (raw_base * to_price_excluded_factor * tax.amount) / 100.0;
        }

        if (tax.amount_type === "division") {
            return (raw_base * tax.amount) / 100.0;
        }
        return null;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_price_excluded(tax, batch, raw_base, evaluation_context) {
        if (tax.amount_type === "percent") {
            return (raw_base * tax.amount) / 100.0;
        }

        if (tax.amount_type === "division") {
            const total_percentage =
                batch.reduce((sum, batch_tax) => sum + batch_tax.amount, 0) / 100.0;
            const incl_base_multiplicator = total_percentage === 1.0 ? 1.0 : 1 - total_percentage;
            return (raw_base * tax.amount) / 100.0 / incl_base_multiplicator;
        }
        return null;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    get_tax_details(
        taxes,
        price_unit,
        quantity,
        {
            precision_rounding = null,
            // When product is null, we need the product default values to make the "formula" taxes
            // working. In that case, we need to deal with the product default values before calling this
            // method because we have no way to deal with it automatically in this method since it depends of
            // the type of involved fields and we don't have access to this information js-side.
            product = null,
            product_uom = null,
            special_mode = null,
            filter_tax_function = null,
            document_tax_mode = null,
        } = {}
    ) {
        const self = this;
        const round_per_line = precision_rounding !== null;

        function add_tax_amount_to_results(tax, tax_amount) {
            taxes_data[tax.id].tax_amount = tax_amount;
            if (round_per_line) {
                taxes_data[tax.id].tax_amount = roundPrecision(
                    taxes_data[tax.id].tax_amount,
                    precision_rounding
                );
            }
            if (tax.has_negative_factor) {
                reverse_charge_taxes_data[tax.id].tax_amount = -taxes_data[tax.id].tax_amount;
            }

            self.propagate_extra_taxes_base(sorted_taxes, tax, taxes_data, {
                special_mode: special_mode,
                document_tax_mode: document_tax_mode,
            });
        }

        function eval_tax_amount(tax_amount_function, tax) {
            const is_already_computed = "tax_amount" in taxes_data[tax.id];
            if (is_already_computed) {
                return;
            }

            const tax_amount = tax_amount_function(
                tax,
                taxes_data[tax.id].batch,
                raw_base + taxes_data[tax.id].extra_base_for_tax,
                evaluation_context
            );
            if (tax_amount !== null) {
                add_tax_amount_to_results(tax, tax_amount);
            }
        }

        // Flatten the taxes, order them and filter them if necessary.

        function prepare_tax_extra_data(tax, kwargs = {}) {
            return {
                ...kwargs,
                tax: tax,
                price_include: self.is_price_included(tax, { document_tax_mode, special_mode }),
                original_price_include: self.is_price_included(tax, { document_tax_mode }),
                document_tax_mode: document_tax_mode,
                extra_base_for_tax: 0.0,
                extra_base_for_base: 0.0,
            };
        }

        const batching_results = this.batch_for_taxes_computation(taxes, {
            special_mode: special_mode,
            filter_tax_function: filter_tax_function,
            document_tax_mode: document_tax_mode,
        });
        let sorted_taxes = batching_results.sorted_taxes;
        const taxes_data = {};
        const reverse_charge_taxes_data = {};
        for (const tax of sorted_taxes) {
            taxes_data[tax.id] = prepare_tax_extra_data(tax, {
                group: batching_results.group_per_tax[tax.id],
                batch: batching_results.batch_per_tax[tax.id],
                document_tax_mode: document_tax_mode,
            });
            if (tax.has_negative_factor) {
                reverse_charge_taxes_data[tax.id] = {
                    ...taxes_data[tax.id],
                    is_reverse_charge: true,
                };
            }
        }

        let raw_base = quantity * price_unit;
        if (round_per_line) {
            raw_base = roundPrecision(raw_base, precision_rounding);
        }

        let evaluation_context = {
            product: product || {},
            uom: product_uom || {},
            price_unit: price_unit,
            quantity: quantity,
            raw_base: raw_base,
            special_mode: special_mode,
            document_tax_mode: document_tax_mode,
        };

        // Define the order in which the taxes must be evaluated.
        // Fixed taxes are computed directly because they could affect the base of a price included batch right after.
        for (const tax of sorted_taxes.toReversed()) {
            eval_tax_amount(this.eval_tax_amount_fixed_amount.bind(this), tax);
        }

        // Then, let's travel the batches in the reverse order and process the price-included taxes.
        for (const tax of sorted_taxes.toReversed()) {
            if (taxes_data[tax.id].price_include) {
                eval_tax_amount(this.eval_tax_amount_price_included.bind(this), tax);
            }
        }

        // Then, let's travel the batches in the normal order and process the price-excluded taxes.
        for (const tax of sorted_taxes) {
            if (!taxes_data[tax.id].price_include) {
                eval_tax_amount(this.eval_tax_amount_price_excluded.bind(this), tax);
            }
        }

        // Mark the base to be computed in the descending order. The order doesn't matter for no special mode or 'total_excluded' but
        // it must be in the reverse order when special_mode is 'total_included'.
        const subsequent_taxes = [];
        for (const tax of sorted_taxes.toReversed()) {
            const tax_data = taxes_data[tax.id];
            if (!("tax_amount" in tax_data)) {
                continue;
            }

            // Base amount.
            const total_tax_amount =
                taxes_data[tax.id].batch.reduce(
                    (sum, other_tax) => sum + taxes_data[other_tax.id].tax_amount,
                    0
                ) +
                Object.values(taxes_data[tax.id].batch)
                    .filter((other_tax) => other_tax.has_negative_factor)
                    .reduce(
                        (sum, other_tax) =>
                            sum + reverse_charge_taxes_data[other_tax.id].tax_amount,
                        0
                    );
            let base = raw_base + taxes_data[tax.id].extra_base_for_base;
            if (tax_data.price_include && (!special_mode || special_mode === "total_included")) {
                base -= total_tax_amount;
            }
            tax_data.base = base;

            // Subsequence taxes.
            tax_data.taxes = [];
            if (tax.include_base_amount) {
                tax_data.taxes.push(...subsequent_taxes);
            }

            // Reverse charge.
            if (tax.has_negative_factor) {
                const reverse_charge_tax_data = reverse_charge_taxes_data[tax.id];
                reverse_charge_tax_data.base = base;
                reverse_charge_tax_data.taxes = tax_data.taxes;
            }

            if (tax.is_base_affected) {
                subsequent_taxes.push(tax);
            }
        }

        const taxes_data_list = [];
        for (const tax of sorted_taxes) {
            const tax_data = taxes_data[tax.id];
            if ("tax_amount" in tax_data) {
                taxes_data_list.push(tax_data);
                if (tax.has_negative_factor) {
                    taxes_data_list.push(reverse_charge_taxes_data[tax.id]);
                }
            }
        }

        let total_excluded, total_included;
        if (taxes_data_list.length > 0) {
            total_excluded = taxes_data_list[0].base;
            const tax_amount = taxes_data_list.reduce(
                (sum, tax_data) => sum + tax_data.tax_amount,
                0
            );
            total_included = total_excluded + tax_amount;
        } else {
            total_excluded = total_included = raw_base;
        }

        return {
            total_excluded: total_excluded,
            total_included: total_included,
            taxes_data: taxes_data_list.map((tax_data) =>
                Object.assign(
                    {},
                    {
                        tax: tax_data.tax,
                        taxes: tax_data.taxes,
                        group: batching_results.group_per_tax[tax_data.tax.id],
                        batch: batching_results.batch_per_tax[tax_data.tax.id],
                        tax_amount: tax_data.tax_amount,
                        price_include: tax_data.price_include,
                        original_price_include: tax_data.original_price_include,
                        base_amount: tax_data.base,
                        is_reverse_charge: tax_data.is_reverse_charge || false,
                    }
                )
            ),
        };
    },

    // -------------------------------------------------------------------------
    // MAPPING PRICE_UNIT
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    adapt_price_unit_to_another_taxes(
        price_unit,
        product,
        original_taxes,
        new_taxes,
        { product_uom = null, document_tax_mode = null } = {}
    ) {
        const original_tax_ids = new Set(original_taxes.map((x) => x.id));
        const new_tax_ids = new Set(new_taxes.map((x) => x.id));
        if (
            (original_tax_ids.size === new_tax_ids.size &&
                [...original_tax_ids].every((value) => new_tax_ids.has(value))) ||
            original_taxes.some((x) => !this.is_price_included(x, { document_tax_mode }))
        ) {
            return price_unit;
        }

        // Find the price unit without tax.
        let taxes_computation = this.get_tax_details(original_taxes, price_unit, 1.0, {
            product: product,
            product_uom: product_uom,
            document_tax_mode: document_tax_mode,
        });
        price_unit = taxes_computation.total_excluded;

        // Find the new price unit after applying the price included taxes.
        taxes_computation = this.get_tax_details(new_taxes, price_unit, 1.0, {
            product: product,
            product_uom: product_uom,
            special_mode: "total_excluded",
            document_tax_mode: document_tax_mode,
        });
        let delta = 0.0;
        for (const tax_data of taxes_computation.taxes_data) {
            if (this.is_price_included(tax_data.tax, { document_tax_mode })) {
                delta += tax_data.tax_amount;
            }
        }
        return price_unit + delta;
    },

    // -------------------------------------------------------------------------
    // GENERIC REPRESENTATION OF BUSINESS OBJECTS & METHODS
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    export_base_line_tax_pins(base_line) {
        if (!base_line.pins) {
            return {};
        }
        return {
            ...base_line.pins,
            valid_for: {
                currency_id: base_line.currency_id.id,
                price_unit: base_line.price_unit,
                discount: base_line.discount,
                quantity: base_line.quantity,
                rate: base_line.rate,
                tax_ids: this.flatten_taxes_and_sort_them(base_line.tax_ids).sorted_taxes.map(
                    (tax) => tax.id
                ),
            },
        };
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    import_base_line_tax_pins(base_line, tax_pins) {
        const valid_for = tax_pins && tax_pins.valid_for;
        if (!valid_for) {
            return null;
        }

        // compare_amounts does not exist in numbers.js
        const currency_dp = base_line.currency_id.decimal_places;
        const are_amounts_equal = (a, b) =>
            floatIsZero(
                roundPrecision(a, currency_dp) - roundPrecision(b, currency_dp),
                currency_dp
            );
        const tax_ids = this.flatten_taxes_and_sort_them(base_line.tax_ids).sorted_taxes.map(
            (tax) => tax.id
        );
        const pinned_tax_ids = new Set(valid_for.tax_ids);
        if (
            base_line.currency_id.id !== valid_for.currency_id ||
            !are_amounts_equal(base_line.price_unit, valid_for.price_unit) ||
            !are_amounts_equal(base_line.discount, valid_for.discount) ||
            !are_amounts_equal(base_line.quantity, valid_for.quantity) ||
            tax_ids.length !== pinned_tax_ids.size ||
            !tax_ids.every((tax_id) => pinned_tax_ids.has(tax_id))
        ) {
            return null;
        }

        // The amounts in company currency follow the rate of the base line.
        const delta_rate =
            base_line.rate && valid_for.rate ? base_line.rate / valid_for.rate : 1.0;
        const pins = { ...tax_pins };
        delete pins.valid_for;
        if ("total_excluded" in pins) {
            pins.total_excluded /= delta_rate;
        }
        if ("tax_amounts" in pins) {
            pins.tax_amounts = Object.fromEntries(
                Object.entries(pins.tax_amounts).map(([tax_id_str, amounts]) => [
                    tax_id_str,
                    Object.fromEntries(
                        Object.entries(amounts).map(([field, amount]) => [
                            field,
                            field.endsWith("_currency") ? amount : amount / delta_rate,
                        ])
                    ),
                ])
            );
        }
        return pins;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    reverse_quantity_base_line_tax_pins(tax_pins) {
        if (!tax_pins || !Object.keys(tax_pins).length) {
            return null;
        }
        const new_tax_pins = JSON.parse(JSON.stringify(tax_pins));
        for (const field of ["total_excluded_currency", "total_excluded", "target_total_included"]) {
            if (field in new_tax_pins) {
                new_tax_pins[field] *= -1;
            }
        }
        new_tax_pins.valid_for.quantity *= -1;
        for (const amounts of Object.values(new_tax_pins.tax_amounts || {})) {
            for (const field in amounts) {
                amounts[field] *= -1;
            }
        }
        return new_tax_pins;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    get_base_line_field_value_from_record(record, field, extra_values, fallback) {
        if (field in extra_values) {
            return extra_values[field] || fallback;
        }
        if (record && field in record) {
            return record[field] || fallback;
        }
        return fallback;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    prepare_base_line_for_taxes_computation(record, kwargs = {}) {
        const load = (field, fallback) =>
            this.get_base_line_field_value_from_record(record, field, kwargs, fallback);
        const currency =
            load("currency_id", null) ||
            load("company_currency_id", null) ||
            load("company_id", {}).currency_id ||
            {};

        const base_line = {
            ...kwargs,
            record: record,
            id: load("id", 0),
            product_id: load("product_id", {}),
            product_uom_id: load("product_uom_id", {}),
            tax_ids: load("tax_ids", []),
            price_unit: load("price_unit", 0.0),
            quantity: load("quantity", 0.0),
            discount: load("discount", 0.0),
            currency_id: currency,
            sign: load("sign", 1.0),
            special_mode: kwargs.special_mode || null,
            document_tax_mode: load("document_tax_mode", null),
            special_type: kwargs.special_type || null,
            rate: load("rate", 1.0),
            filter_tax_function: kwargs.filter_tax_function || null,
        };

        const tax_pins = load("tax_pins", null);
        const pins = this.import_base_line_tax_pins(base_line, tax_pins);
        if (pins) {
            base_line.price_unit = tax_pins.valid_for.price_unit;
        }
        Object.assign(base_line, {
            computation_key: kwargs.computation_key || load("tax_rounding_subset", null) || null,
            pins: kwargs.pins || pins,
        });

        // Propagate custom values.
        if (record && typeof record === "object") {
            for (const [k, v] of Object.entries(record)) {
                if (k && typeof k === "string" && k.startsWith("_") && !(k in base_line)) {
                    base_line[k] = v;
                }
            }
        }

        return base_line;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    add_tax_details_in_base_line(base_line, company, { policy = null } = {}) {
        policy = policy || company.tax_rounding_settings;
        const round_per_line = policy.tax_grain === "line";
        const price_unit_after_discount = base_line.price_unit * (1 - base_line.discount / 100.0);
        const currency_pd = base_line.currency_id.rounding;
        const company_currency_pd = company.currency_id.rounding;
        const taxes_computation = this.get_tax_details(
            base_line.tax_ids,
            price_unit_after_discount,
            base_line.quantity,
            {
                precision_rounding: round_per_line ? currency_pd : null,
                product: base_line.product_id,
                product_uom: base_line.product_uom_id,
                special_mode: base_line.special_mode,
                filter_tax_function: base_line.filter_tax_function,
                document_tax_mode: base_line.document_tax_mode,
            }
        );

        const rate = base_line.rate;
        const tax_details = (base_line.tax_details = {
            raw_total_excluded_currency: taxes_computation.total_excluded,
            raw_total_excluded: rate ? taxes_computation.total_excluded / rate : 0.0,
            raw_total_included_currency: taxes_computation.total_included,
            raw_total_included: rate ? taxes_computation.total_included / rate : 0.0,
            taxes_data: [],
        });

        if (round_per_line) {
            tax_details.raw_total_excluded = roundPrecision(
                tax_details.raw_total_excluded,
                company_currency_pd
            );
            tax_details.raw_total_included = roundPrecision(
                tax_details.raw_total_included,
                company_currency_pd
            );
        }

        for (const tax_data of taxes_computation.taxes_data) {
            let tax_amount = rate ? tax_data.tax_amount / rate : 0.0;
            let base_amount = rate ? tax_data.base_amount / rate : 0.0;

            if (round_per_line) {
                tax_amount = roundPrecision(tax_amount, company_currency_pd);
                base_amount = roundPrecision(base_amount, company_currency_pd);
            }

            tax_details.taxes_data.push({
                ...tax_data,
                raw_tax_amount_currency: tax_data.tax_amount,
                raw_tax_amount: tax_amount,
                raw_base_amount_currency: tax_data.base_amount,
                raw_base_amount: base_amount,
            });
        }

        const pins = base_line.pins;
        if (pins && "target_total_included" in pins && !("tax_amounts" in pins)) {
            base_line.pins = {
                ...pins,
                ...this.get_pins_reaching_total_included(
                    base_line,
                    company,
                    pins.target_total_included
                ),
            };
        }
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    get_pins_reaching_total_included(base_line, company, target_total_included) {
        const target_base_line = this.prepare_base_line_for_taxes_computation(base_line);
        this.add_tax_details_in_base_lines([target_base_line], company);
        const reduced_base_lines = this.reduce_base_lines_to_target_amount(
            [target_base_line],
            company,
            "fixed",
            target_total_included
        );
        if (!reduced_base_lines.length) {
            return {};
        }
        this.pin_base_lines_tax_details(reduced_base_lines, company);
        return reduced_base_lines[0].pins || {};
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    add_tax_details_in_base_lines(base_lines, company) {
        const policy = company.tax_rounding_settings;
        for (const base_line of base_lines) {
            this.add_tax_details_in_base_line(base_line, company, { policy });
        }
        this.round_base_lines_tax_details(base_lines, company, { policy });
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    normalize_target_factors(target_factors, { allow_negative_factors = false } = {}) {
        const factors = target_factors.map((x, i) => [
            i,
            allow_negative_factors ? x.factor : Math.abs(x.factor),
        ]);
        const plus_factors = factors.filter((x) => x[1] >= 0);
        const neg_factors = factors.filter((x) => x[1] < 0);
        plus_factors.sort((a, b) => b[1] - a[1]);
        neg_factors.sort((a, b) => a[1] - b[1]);
        const sum_of_factors = factors.reduce((sum, x) => sum + x[1], 0.0);
        const plus_sum_of_factors = plus_factors.reduce((sum, x) => sum + x[1], 0.0);
        const neg_sum_of_factors = neg_factors.reduce((sum, x) => sum - x[1], 0.0);
        return {
            plus_factors: plus_factors.map((x) => [
                x[0],
                plus_sum_of_factors ? x[1] / plus_sum_of_factors : 1 / plus_factors.length,
            ]),
            neg_factors: neg_factors.map((x) => [
                x[0],
                neg_sum_of_factors ? x[1] / neg_sum_of_factors : 1 / neg_factors.length,
            ]),
            sum_of_factors: sum_of_factors,
            plus_sum_of_factors: plus_sum_of_factors,
            neg_sum_of_factors: neg_sum_of_factors,
        };
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    distribute_delta_amount_smoothly(
        precision_digits,
        delta_amount,
        target_factors,
        { allow_negative_factors = false } = {}
    ) {
        if (!target_factors.length) {
            return [];
        }

        const precision_rounding = Number(`1e-${precision_digits}`);
        const amounts_to_distribute = target_factors.map((x) => 0.0);
        if (floatIsZero(delta_amount, precision_digits)) {
            return amounts_to_distribute;
        }

        const sign = delta_amount < 0.0 ? -1 : 1;

        // Distribute using the factor first.
        const normalize_results = this.normalize_target_factors(target_factors, {
            allow_negative_factors: allow_negative_factors,
        });
        const sum_of_factors = normalize_results.sum_of_factors;
        const plus_delta_factor = sum_of_factors ? normalize_results.plus_sum_of_factors / sum_of_factors : 0.0;
        const neg_delta_factor = sum_of_factors ? normalize_results.neg_sum_of_factors / sum_of_factors : 0.0;
        const factor_groups = [
            [
                1,
                normalize_results.plus_factors,
                plus_delta_factor
            ],
            [
                -1,
                normalize_results.neg_factors,
                neg_delta_factor
            ],
        ];

        for (const [sign_factor, signed_factors, delta_factor] of factor_groups) {
            const nb_of_errors = roundHalfEven(
                Math.abs((delta_amount * delta_factor) / precision_rounding)
            );
            let remaining_errors = nb_of_errors;

            for (const [i, factor] of signed_factors) {
                if (!remaining_errors) {
                    break;
                }

                const nb_of_amount_to_distribute = Math.min(
                    roundHalfEven(sign_factor * factor * nb_of_errors),
                    remaining_errors
                );

                remaining_errors -= nb_of_amount_to_distribute;
                const amount_to_distribute =
                    sign_factor * sign * nb_of_amount_to_distribute * precision_rounding;
                amounts_to_distribute[i] += amount_to_distribute;
            }

            // Distribute the remaining cents across the factors.
            // When forcing factors is possible that there are negative factors included, thus we need to specify
            // if we need to remove or add from what we have remaining.
            for (let i = 0; i < remaining_errors; i++) {
                amounts_to_distribute[signed_factors[i][0]] +=
                    sign_factor * sign * precision_rounding;
            }
        }

        return amounts_to_distribute;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    reach_target(
        items,
        field,
        target,
        precision_digits,
        { weights = null, allow_negative_factors = false } = {}
    ) {
        weights = weights || items.map((item) => item[`raw_${field}`]);
        const amounts_to_distribute = this.distribute_delta_amount_smoothly(
            precision_digits,
            target - items.reduce((sum, item) => sum + item[field], 0.0),
            weights.map((weight) => ({ factor: weight })),
            { allow_negative_factors }
        );
        items.forEach((item, i) => {
            item[field] += amounts_to_distribute[i];
        });
        return amounts_to_distribute;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     *
     * @returns A list of { grouping_key, items } where items is a list of [base_line, tax_data].
     */
    group_tax_data(base_lines, grouping_function) {
        const groups = {};
        for (const base_line of base_lines) {
            for (const tax_data of base_line.tax_details.taxes_data) {
                const grouping_key = grouping_function(base_line, tax_data);
                const key = this.stringify_grouping_key(grouping_key);
                if (!(key in groups)) {
                    groups[key] = { grouping_key, items: [] };
                }
                groups[key].items.push([base_line, tax_data]);
            }
        }
        return Object.values(groups);
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    get_tax_details_target(base_line, tax_data, field) {
        let pins = base_line.pins || {};
        let values = base_line.tax_details;
        if (tax_data) {
            values = tax_data;
            pins = (pins.tax_amounts || {})[tax_data.tax.id.toString()] || {};
        }
        const currency_field = field.endsWith("_currency") ? field : `${field}_currency`;
        if (field in pins || currency_field in pins) {
            return values[field];
        }
        return values[`raw_${field}`];
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    round_and_pin_tax_details(base_line, company) {
        const currency = base_line.currency_id;
        const company_currency = company.currency_id;
        const rate = base_line.rate;
        const tax_details = base_line.tax_details;
        const pins = base_line.pins || {};
        const pinned_tax_amounts = pins.tax_amounts || {};

        const amounts = [[tax_details, "total_excluded", pins, 1]];
        for (const tax_data of tax_details.taxes_data) {
            const tax_pins = pinned_tax_amounts[tax_data.tax.id.toString()] || {};
            amounts.push([tax_data, "base_amount", tax_pins, 1]);
            amounts.push([tax_data, "tax_amount", tax_pins, tax_data.is_reverse_charge ? -1 : 1]);
        }

        for (const [values, field, field_pins, sign] of amounts) {
            const currency_field = `${field}_currency`;
            values[currency_field] = roundPrecision(
                currency_field in field_pins
                    ? sign * field_pins[currency_field]
                    : values[`raw_${currency_field}`],
                currency.rounding
            );
            if (field in field_pins) {
                values[field] = roundPrecision(sign * field_pins[field], company_currency.rounding);
            } else if (currency_field in field_pins && rate) {
                values[field] = roundPrecision(values[currency_field] / rate, company_currency.rounding);
            } else {
                values[field] = roundPrecision(values[`raw_${field}`], company_currency.rounding);
            }
        }
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    reach_tax_rounding_targets(base_lines, company, policy) {
        const authority = policy.authority;
        const company_currency = company.currency_id;
        const sum = (values) => values.reduce((total, value) => total + value, 0.0);

        // Per tax.
        const tax_groups = this.group_tax_data(base_lines, (base_line, tax_data) => ({
            tax: tax_data.tax,
            currency: base_line.currency_id,
            is_refund: base_line.is_refund,
            is_reverse_charge: tax_data.is_reverse_charge,
            price_include: tax_data.price_include,
            computation_key: base_line.computation_key,
        }));
        for (const suffix of ["_currency", ""]) {
            const tax_field = `tax_amount${suffix}`;
            const base_field = `base_amount${suffix}`;
            for (const { grouping_key, items } of tax_groups) {
                const currency = suffix ? grouping_key.currency : company_currency;
                const taxes_data = items.map(([_base_line, tax_data]) => tax_data);
                const target_tax_amount = sum(
                    items.map(([base_line, tax_data]) =>
                        this.get_tax_details_target(base_line, tax_data, tax_field)
                    )
                );
                let target_base_amount = sum(
                    items.map(([base_line, tax_data]) =>
                        this.get_tax_details_target(base_line, tax_data, base_field)
                    )
                );
                this.reach_target(
                    taxes_data,
                    tax_field,
                    roundPrecision(target_tax_amount, currency.rounding),
                    currency.decimal_places
                );
                if (authority === "included" || (authority === "mixed" && grouping_key.price_include)) {
                    target_base_amount =
                        roundPrecision(target_base_amount + target_tax_amount, currency.rounding) -
                        sum(taxes_data.map((tax_data) => tax_data[tax_field]));
                }
                this.reach_target(
                    taxes_data,
                    base_field,
                    roundPrecision(target_base_amount, currency.rounding),
                    currency.decimal_places
                );
            }
        }

        // Whole document.
        const document_groups = {};
        for (const base_line of base_lines) {
            const key = this.stringify_grouping_key({
                currency: base_line.currency_id,
                is_refund: base_line.is_refund,
                computation_key: base_line.computation_key,
            });
            if (!(key in document_groups)) {
                document_groups[key] = [];
            }
            document_groups[key].push(base_line);
        }
        for (const group_base_lines of Object.values(document_groups)) {
            const currency = group_base_lines[0].currency_id;
            const is_included =
                authority === "included" ||
                (authority === "mixed" &&
                    !group_base_lines.some((base_line) =>
                        base_line.tax_details.taxes_data.some(
                            (tax_data) =>
                                !tax_data.price_include &&
                                (!floatIsZero(tax_data.tax_amount_currency, currency.decimal_places) ||
                                    !floatIsZero(tax_data.tax_amount, company_currency.decimal_places))
                        )
                    ));
            for (const suffix of ["_currency", ""]) {
                const suffix_currency = suffix ? currency : company_currency;
                const field = `total_excluded${suffix}`;
                const tax_field = `tax_amount${suffix}`;
                let target = sum(
                    group_base_lines.map((base_line) =>
                        this.get_tax_details_target(base_line, null, field)
                    )
                );
                let tax_amount = 0.0;
                if (is_included) {
                    for (const base_line of group_base_lines) {
                        for (const tax_data of base_line.tax_details.taxes_data) {
                            target += this.get_tax_details_target(base_line, tax_data, tax_field);
                            tax_amount += tax_data[tax_field];
                        }
                    }
                }
                if (!target) {
                    continue;
                }

                const taxes_details = group_base_lines.map((base_line) => base_line.tax_details);
                this.reach_target(
                    taxes_details,
                    field,
                    roundPrecision(target, suffix_currency.rounding) - tax_amount,
                    suffix_currency.decimal_places,
                    {
                        weights: is_included
                            ? taxes_details.map((tax_details) => tax_details[`raw_total_included${suffix}`])
                            : null,
                    }
                );
                for (const tax_details of taxes_details) {
                    tax_details[field] = roundPrecision(tax_details[field], suffix_currency.rounding);
                }
            }
        }
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    round_base_lines_tax_details(base_lines, company, { policy = null } = {}) {
        policy = policy || company.tax_rounding_settings;
        for (const base_line of base_lines) {
            this.round_and_pin_tax_details(base_line, company);
        }

        if (policy.tax_grain === "tax") {
            this.reach_tax_rounding_targets(base_lines, company, policy);
        }

        for (const base_line of base_lines) {
            const tax_details = base_line.tax_details;
            for (const [suffix, currency] of [
                ["_currency", base_line.currency_id],
                ["", company.currency_id],
            ]) {
                let total_included = tax_details[`total_excluded${suffix}`];
                for (const tax_data of tax_details.taxes_data) {
                    total_included += tax_data[`tax_amount${suffix}`];
                }
                tax_details[`total_included${suffix}`] = roundPrecision(
                    total_included,
                    currency.rounding
                );
            }
        }
    },

    // -------------------------------------------------------------------------
    // TAX TOTALS SUMMARY
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    get_tax_totals_summary(base_lines, currency, company, { cash_rounding = null } = {}) {
        const company_pd = company.currency_id.rounding;
        const tax_totals_summary = {
            currency_id: currency.id,
            currency_pd: currency.rounding,
            company_currency_id: company.currency_id.id,
            company_currency_pd: company.currency_id.rounding,
            has_tax_groups: false,
            subtotals: [],
            base_amount_currency: 0.0,
            base_amount: 0.0,
            tax_amount_currency: 0.0,
            tax_amount: 0.0,
        };

        // Global tax values.
        const global_grouping_function = (base_line, tax_data) => tax_data !== null;

        let values_per_grouping_key = this.aggregate_tax_details(
            base_lines,
            global_grouping_function
        );

        for (const values of Object.values(values_per_grouping_key)) {
            if (values.grouping_key) {
                tax_totals_summary.has_tax_groups = true;
            }
            tax_totals_summary.base_amount_currency += values.total_excluded_currency;
            tax_totals_summary.base_amount += values.total_excluded;
            tax_totals_summary.tax_amount_currency += values.tax_amount_currency;
            tax_totals_summary.tax_amount += values.tax_amount;
        }

        // Tax groups.
        const untaxed_amount_subtotal_label = _t("Untaxed Amount");
        const subtotals = {};

        const tax_group_grouping_function = (base_line, tax_data) => {
            if (!tax_data) {
                return;
            }
            return tax_data.tax.tax_group_id;
        };

        values_per_grouping_key = this.aggregate_tax_details(
            base_lines,
            tax_group_grouping_function
        );

        const sorted_total_per_tax_group = Object.values(values_per_grouping_key)
            .filter((values) => values.grouping_key)
            .sort(
                (a, b) =>
                    a.grouping_key.sequence - b.grouping_key.sequence ||
                    a.grouping_key.id - b.grouping_key.id
            );

        const encountered_base_amounts = new Set();
        const subtotals_order = {};

        for (const [order, values] of sorted_total_per_tax_group.entries()) {
            const tax_group = values.grouping_key;

            // Get all involved taxes in the tax group.
            const involved_tax_ids = new Set();
            const involved_amount_types = new Set();
            const involved_price_include = new Set();
            values.base_line_x_taxes_data.forEach(([base_line, taxes_data]) => {
                taxes_data.forEach((tax_data) => {
                    const tax = tax_data.tax;
                    involved_tax_ids.add(tax.id);
                    involved_amount_types.add(tax.amount_type);
                    involved_price_include.add(this.is_price_included(tax, { document_tax_mode: base_line.document_tax_mode }));
                });
            });

            // Compute the display base amounts.
            let display_base_amount;
            let display_base_amount_currency;
            if (involved_amount_types.size === 1 && involved_amount_types.has("fixed")) {
                display_base_amount = false;
                display_base_amount_currency = false;
            } else if (
                involved_amount_types.size === 1 &&
                involved_amount_types.has("division") &&
                involved_price_include.size === 1 &&
                involved_price_include.has(true)
            ) {
                display_base_amount = 0.0;
                display_base_amount_currency = 0.0;
                values.base_line_x_taxes_data.forEach(([base_line, _taxes_data]) => {
                    const tax_details = base_line.tax_details;
                    display_base_amount += tax_details.total_excluded;
                    display_base_amount_currency += tax_details.total_excluded_currency;
                    for (const tax_data of tax_details.taxes_data) {
                        display_base_amount_currency += tax_data.tax_amount_currency;
                        display_base_amount += tax_data.tax_amount;
                    }
                });
            } else {
                display_base_amount = values.base_amount;
                display_base_amount_currency = values.base_amount_currency;
            }

            if (typeof display_base_amount_currency === "number") {
                encountered_base_amounts.add(
                    parseFloat(display_base_amount_currency.toFixed(currency.decimal_places))
                );
            }

            // Order of the subtotals.
            const preceding_subtotal =
                tax_group.preceding_subtotal || untaxed_amount_subtotal_label;
            if (!(preceding_subtotal in subtotals)) {
                subtotals[preceding_subtotal] = {
                    tax_groups: [],
                    tax_amount_currency: 0.0,
                    tax_amount: 0.0,
                    base_amount_currency: 0.0,
                    base_amount: 0.0,
                };
            }
            if (!(preceding_subtotal in subtotals_order)) {
                subtotals_order[preceding_subtotal] = order;
            }

            subtotals[preceding_subtotal].tax_groups.push({
                id: tax_group.id,
                involved_tax_ids: Array.from(involved_tax_ids),
                tax_amount_currency: values.tax_amount_currency,
                tax_amount: values.tax_amount,
                base_amount_currency: values.base_amount_currency,
                base_amount: values.base_amount,
                display_base_amount_currency,
                display_base_amount,
                group_name: tax_group.name,
                group_label: tax_group.pos_receipt_label,
            });
        }

        // Subtotals.
        if (!Object.keys(subtotals).length) {
            subtotals[untaxed_amount_subtotal_label] = {
                tax_groups: [],
                tax_amount_currency: 0.0,
                tax_amount: 0.0,
                base_amount_currency: 0.0,
                base_amount: 0.0,
            };
        }

        const ordered_subtotals = Array.from(Object.entries(subtotals)).sort(
            (a, b) => (subtotals_order[a[0]] || 0) - (subtotals_order[b[0]] || 0)
        );
        let accumulated_tax_amount_currency = 0.0;
        let accumulated_tax_amount = 0.0;
        for (const [subtotal_label, subtotal] of ordered_subtotals) {
            subtotal.name = subtotal_label;
            subtotal.base_amount_currency =
                tax_totals_summary.base_amount_currency + accumulated_tax_amount_currency;
            subtotal.base_amount = tax_totals_summary.base_amount + accumulated_tax_amount;
            for (const tax_group of subtotal.tax_groups) {
                subtotal.tax_amount_currency += tax_group.tax_amount_currency;
                subtotal.tax_amount += tax_group.tax_amount;
                accumulated_tax_amount_currency += tax_group.tax_amount_currency;
                accumulated_tax_amount += tax_group.tax_amount;
            }
            tax_totals_summary.subtotals.push(subtotal);
        }

        // Cash rounding
        const cash_rounding_lines = base_lines.filter(
            (base_line) => base_line.special_type === "cash_rounding"
        );
        if (cash_rounding_lines.length) {
            tax_totals_summary.cash_rounding_base_amount_currency = 0.0;
            tax_totals_summary.cash_rounding_base_amount = 0.0;
            cash_rounding_lines.forEach((base_line) => {
                const tax_details = base_line.tax_details;
                tax_totals_summary.cash_rounding_base_amount_currency +=
                    tax_details.total_excluded_currency;
                tax_totals_summary.cash_rounding_base_amount += tax_details.total_excluded;
            });
        } else if (cash_rounding !== null) {
            const strategy = cash_rounding.strategy;
            const cash_rounding_pd = cash_rounding.rounding;
            const cash_rounding_method = cash_rounding.rounding_method;
            // Round first so cash rounding doesn't inflate a sub-unit float residue.
            const total_amount_currency = roundPrecision(
                tax_totals_summary.base_amount_currency + tax_totals_summary.tax_amount_currency,
                currency.rounding
            );
            const total_amount = roundPrecision(
                tax_totals_summary.base_amount + tax_totals_summary.tax_amount,
                company_pd
            );
            const expected_total_amount_currency = roundPrecision(
                total_amount_currency,
                cash_rounding_pd,
                cash_rounding_method
            );
            let cash_rounding_base_amount_currency =
                expected_total_amount_currency - total_amount_currency;
            const rate = total_amount ? Math.abs(total_amount_currency / total_amount) : 0.0;
            let cash_rounding_base_amount = rate
                ? roundPrecision(cash_rounding_base_amount_currency / rate, company_pd)
                : 0.0;
            if (!floatIsZero(cash_rounding_base_amount_currency, currency.decimal_places)) {
                if (strategy === "add_invoice_line") {
                    tax_totals_summary.cash_rounding_base_amount_currency =
                        cash_rounding_base_amount_currency;
                    tax_totals_summary.cash_rounding_base_amount = cash_rounding_base_amount;
                    tax_totals_summary.base_amount_currency += cash_rounding_base_amount_currency;
                    tax_totals_summary.base_amount += cash_rounding_base_amount;
                    subtotals[untaxed_amount_subtotal_label].base_amount_currency +=
                        cash_rounding_base_amount_currency;
                    subtotals[untaxed_amount_subtotal_label].base_amount +=
                        cash_rounding_base_amount;
                } else if (strategy === "biggest_tax") {
                    const all_subtotal_tax_group = tax_totals_summary.subtotals.flatMap(
                        (subtotal) =>
                            subtotal.tax_groups
                                .filter((tax_group) => !floatIsZero(tax_group.tax_amount_currency, currency.decimal_places))
                                .map((tax_group) => [subtotal, tax_group])
                    );

                    if (all_subtotal_tax_group.length) {
                        const [max_subtotal, max_tax_group] = all_subtotal_tax_group.reduce(
                            (a, b) => (b[1].tax_amount_currency > a[1].tax_amount_currency ? b : a)
                        );

                        max_tax_group.tax_amount_currency += cash_rounding_base_amount_currency;
                        max_tax_group.tax_amount += cash_rounding_base_amount;
                        max_subtotal.tax_amount_currency += cash_rounding_base_amount_currency;
                        max_subtotal.tax_amount += cash_rounding_base_amount;
                        tax_totals_summary.tax_amount_currency +=
                            cash_rounding_base_amount_currency;
                        tax_totals_summary.tax_amount += cash_rounding_base_amount;
                        tax_totals_summary.has_biggest_tax_cash_rounding = true;
                    } else {
                        // Failed to apply the cash rounding since there is no tax.
                        cash_rounding_base_amount_currency = 0.0;
                        cash_rounding_base_amount = 0.0;
                    }
                }
            }
        }

        // Subtract the cash rounding from the untaxed amounts.
        const cash_rounding_base_amount_currency =
            tax_totals_summary.cash_rounding_base_amount_currency || 0.0;
        const cash_rounding_base_amount = tax_totals_summary.cash_rounding_base_amount || 0.0;
        tax_totals_summary.base_amount_currency -= cash_rounding_base_amount_currency;
        tax_totals_summary.base_amount -= cash_rounding_base_amount;
        for (const subtotal of tax_totals_summary.subtotals) {
            subtotal.base_amount_currency -= cash_rounding_base_amount_currency;
            subtotal.base_amount -= cash_rounding_base_amount;
        }
        encountered_base_amounts.add(
            parseFloat(tax_totals_summary.base_amount_currency.toFixed(currency.decimal_places))
        );
        tax_totals_summary.same_tax_base = encountered_base_amounts.size === 1;

        // Total amount.
        tax_totals_summary.total_amount_currency =
            tax_totals_summary.base_amount_currency +
            tax_totals_summary.tax_amount_currency +
            cash_rounding_base_amount_currency;
        tax_totals_summary.total_amount =
            tax_totals_summary.base_amount +
            tax_totals_summary.tax_amount +
            cash_rounding_base_amount;

        return tax_totals_summary;
    },

    // -------------------------------------------------------------------------
    // AGGREGATOR OF TAX DETAILS
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    aggregate_tax_details(base_lines, grouping_function) {
        const amount_fields = [];
        for (const prefix of ["", "raw_"]) {
            for (const field of ["base_amount", "tax_amount", "total_excluded"]) {
                for (const suffix of ["_currency", ""]) {
                    amount_fields.push(`${prefix}${field}${suffix}`);
                }
            }
        }
        const values_per_grouping_key = {};
        for (const base_line of base_lines) {
            const tax_details = base_line.tax_details;
            const tax_amount_to_propagate = {};

            // The amounts of the base line per grouping key, added to the ones of the document afterwards.
            const line_values_per_grouping_key = {};
            for (const tax_data of tax_details.taxes_data.length ? tax_details.taxes_data : [null]) {
                const raw_grouping_key = grouping_function(base_line, tax_data);
                const grouping_key = this.stringify_grouping_key(raw_grouping_key);

                let line_values = line_values_per_grouping_key[grouping_key];
                if (!line_values) {
                    line_values = line_values_per_grouping_key[grouping_key] = {
                        grouping_key: raw_grouping_key,
                        taxes_data: [],
                    };
                    for (const prefix of ["", "raw_"]) {
                        for (const suffix of ["_currency", ""]) {
                            let total_excluded = tax_details[`${prefix}total_excluded${suffix}`];
                            if (tax_data) {
                                total_excluded +=
                                    tax_amount_to_propagate[tax_data.tax.id]?.[
                                        `${prefix}total_excluded${suffix}`
                                    ] || 0.0;
                            }
                            line_values[`${prefix}total_excluded${suffix}`] = total_excluded;
                            line_values[`${prefix}base_amount${suffix}`] = tax_data
                                ? tax_data[`${prefix}base_amount${suffix}`]
                                : total_excluded;
                            line_values[`${prefix}tax_amount${suffix}`] = 0.0;
                        }
                    }
                }

                if (tax_data) {
                    for (const tax of tax_data.taxes) {
                        const amounts = (tax_amount_to_propagate[tax.id] ||= {});
                        for (const prefix of ["", "raw_"]) {
                            for (const suffix of ["_currency", ""]) {
                                const field = `${prefix}total_excluded${suffix}`;
                                amounts[field] =
                                    (amounts[field] || 0.0) + tax_data[`${prefix}tax_amount${suffix}`];
                            }
                        }
                    }
                    for (const prefix of ["", "raw_"]) {
                        for (const suffix of ["_currency", ""]) {
                            line_values[`${prefix}tax_amount${suffix}`] +=
                                tax_data[`${prefix}tax_amount${suffix}`];
                        }
                    }
                    line_values.taxes_data.push(tax_data);
                }
            }

            for (const [grouping_key, line_values] of Object.entries(line_values_per_grouping_key)) {
                let values = values_per_grouping_key[grouping_key];
                if (!values) {
                    values = values_per_grouping_key[grouping_key] = {
                        grouping_key: line_values.grouping_key,
                        taxes_data: [],
                        base_line_x_taxes_data: [],
                    };
                    for (const field of amount_fields) {
                        values[field] = 0.0;
                    }
                }
                for (const field of amount_fields) {
                    values[field] += line_values[field];
                }
                values.taxes_data.push(...line_values.taxes_data);
                values.base_line_x_taxes_data.push([base_line, line_values.taxes_data]);
            }
        }
        return values_per_grouping_key;
    },

    // -------------------------------------------------------------------------
    // ADVANCED LINES MANIPULATION HELPERS
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    can_be_discounted(tax) {
        return !["fixed", "code"].includes(tax.amount_type);
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    merge_tax_details(tax_details_1, tax_details_2) {
        const results = {};
        for (const prefix of ["raw_", ""]) {
            for (const field of ["total_excluded", "total_included"]) {
                for (const suffix of ["_currency", ""]) {
                    const key = `${prefix}${field}${suffix}`;
                    results[key] = tax_details_1[key] + tax_details_2[key];
                }
            }
        }

        const agg_taxes_data = {};
        for (const tax_details of [tax_details_1, tax_details_2]) {
            for (const tax_data of tax_details.taxes_data) {
                const tax = tax_data.tax;
                const tax_id_str = tax.id.toString();
                if (tax_id_str in agg_taxes_data) {
                    const agg_tax_data = agg_taxes_data[tax_id_str];
                    for (const prefix of ["raw_", ""]) {
                        for (const suffix of ["_currency", ""]) {
                            for (const field of ["base_amount", "tax_amount"]) {
                                const field_with_prefix = `${prefix}${field}${suffix}`;
                                agg_tax_data[field_with_prefix] += tax_data[field_with_prefix];
                            }
                        }
                    }
                } else {
                    agg_taxes_data[tax_id_str] = { ...tax_data };
                }
            }
        }
        results.taxes_data = Object.values(agg_taxes_data);

        // In case there is some taxes that are in tax_details_1 but not on tax_details_2,
        // we have to shift manually the base amount. It happens with fixed taxes in which the base
        // is meaningless but still used in the computations.
        const taxes_data_in_2 = new Set(tax_details_2.taxes_data.map((td) => td.tax.id));
        const not_discountable_taxes_data = new Set(
            tax_details_1.taxes_data
                .filter((td) => !taxes_data_in_2.has(td.tax.id))
                .map((td) => td.tax.id)
        );
        for (const tax_data of results.taxes_data) {
            if (not_discountable_taxes_data.has(tax_data.tax.id)) {
                for (const suffix of ["_currency", ""]) {
                    for (const prefix of ["raw_", ""]) {
                        tax_data[`${prefix}base_amount${suffix}`] +=
                            tax_details_2[`${prefix}total_excluded${suffix}`];
                    }
                }
            }
        }

        return results;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    pin_base_lines_tax_details(base_lines, company, { filter_function = null } = {}) {
        for (const base_line of base_lines) {
            const tax_details = base_line.tax_details;
            const taxes_data = tax_details.taxes_data;
            if (!taxes_data.length) {
                continue;
            }

            const pinned_tax_amounts = {};
            base_line.pins = {
                total_excluded_currency: tax_details.total_excluded_currency,
                total_excluded: tax_details.total_excluded,
                tax_amounts: pinned_tax_amounts,
            };
            for (const tax_data of taxes_data) {
                if (tax_data.is_reverse_charge) {
                    continue;
                }
                const tax = tax_data.tax;
                const tax_id_str = tax.id.toString();
                pinned_tax_amounts[tax_id_str] = {};
                if (filter_function && !filter_function(base_line, tax_data)) {
                    continue;
                }

                pinned_tax_amounts[tax_id_str] = {
                    tax_amount_currency: tax_data.tax_amount_currency,
                    tax_amount: tax_data.tax_amount,
                    base_amount_currency: tax_data.base_amount_currency,
                    base_amount: tax_data.base_amount,
                };
            }
        }
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    split_tax_data(base_line, tax_data, company, target_factors) {
        const new_taxes_data = target_factors.map(() => null);
        for (const [index, factor] of this.normalize_target_factors(target_factors).plus_factors) {
            new_taxes_data[index] = { ...tax_data };
            for (const field of ["tax_amount_currency", "tax_amount", "base_amount_currency", "base_amount"]) {
                new_taxes_data[index][`raw_${field}`] = factor * tax_data[`raw_${field}`];
                new_taxes_data[index][field] = 0.0;
            }
        }

        const weights = target_factors.map((target_factor) => target_factor.factor);
        for (const [suffix, currency] of [
            ["_currency", base_line.currency_id],
            ["", company.currency_id],
        ]) {
            for (const field of [`tax_amount${suffix}`, `base_amount${suffix}`]) {
                this.reach_target(new_taxes_data, field, tax_data[field], currency.decimal_places, {
                    weights,
                });
            }
        }
        return new_taxes_data;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    set_tax_details_total_included(tax_details, { prefixes = ["raw_", ""] } = {}) {
        for (const prefix of prefixes) {
            for (const suffix of ["_currency", ""]) {
                let total_included = tax_details[`${prefix}total_excluded${suffix}`];
                for (const tax_data of tax_details.taxes_data) {
                    total_included += tax_data[`${prefix}tax_amount${suffix}`];
                }
                tax_details[`${prefix}total_included${suffix}`] = total_included;
            }
        }
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    reduce_base_lines_with_grouping_function(
        base_lines,
        { grouping_function = null, aggregate_function = null, computation_key = null } = {}
    ) {
        const base_line_map = {};
        for (const base_line of base_lines) {
            const price_unit_after_discount =
                base_line.price_unit * (1 - base_line.discount / 100.0);
            const new_base_line = this.prepare_base_line_for_taxes_computation(base_line, {
                price_unit: base_line.quantity * price_unit_after_discount,
                quantity: 1.0,
                discount: 0.0,
            });
            const raw_grouping_key = { tax_ids: new_base_line.tax_ids.map((tax) => tax.id) };
            const grouping_key = { tax_ids: new_base_line.tax_ids.map((tax) => tax) };
            if (grouping_function) {
                const generated_grouping_key = grouping_function(new_base_line);

                // There is no FrozenDict in javascript.
                // When the key is a record, it can't be jsonified so this is a trick to provide both the
                // raw_grouping_key (to be jsonified) from the grouping_key (to be added to the values).
                if ("raw_grouping_key" in generated_grouping_key) {
                    Object.assign(raw_grouping_key, generated_grouping_key.raw_grouping_key);
                    Object.assign(grouping_key, generated_grouping_key.grouping_key);
                } else {
                    Object.assign(raw_grouping_key, generated_grouping_key);
                    Object.assign(grouping_key, generated_grouping_key);
                }
            }

            const grouping_key_json = JSON.stringify(raw_grouping_key);
            let target_base_line = base_line_map[grouping_key_json];
            if (target_base_line) {
                target_base_line.price_unit += new_base_line.price_unit;
                target_base_line.tax_details = this.merge_tax_details(
                    target_base_line.tax_details,
                    base_line.tax_details
                );
            } else {
                target_base_line = base_line_map[grouping_key_json] =
                    this.prepare_base_line_for_taxes_computation(new_base_line, {
                        ...grouping_key,
                        computation_key: computation_key,
                        tax_details: {
                            ...base_line.tax_details,
                            taxes_data: base_line.tax_details.taxes_data.map((tax_data) => ({
                                ...tax_data,
                            })),
                        },
                    });
            }
            if (aggregate_function) {
                aggregate_function(target_base_line, base_line);
            }
        }

        return Object.values(base_line_map).filter(
            (base_line) => !floatIsZero(base_line.price_unit, base_line.currency_id.decimal_places)
        );
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     *
     * @returns {Object} { totals, totals_per_tax } where totals_per_tax maps the tax ids to { tax, amounts }.
     */
    get_tax_totals_per_tax(base_lines) {
        const totals = { _currency: 0.0, "": 0.0 };
        const totals_per_tax = {};
        for (const base_line of base_lines) {
            const tax_details = base_line.tax_details;
            for (const suffix of ["_currency", ""]) {
                totals[suffix] += tax_details[`total_excluded${suffix}`];
            }
            const counted_taxes = new Set();
            for (const tax_data of tax_details.taxes_data) {
                const tax = tax_data.tax;
                if (!(tax.id in totals_per_tax)) {
                    totals_per_tax[tax.id] = {
                        tax,
                        amounts: {
                            tax_amount_currency: 0.0,
                            tax_amount: 0.0,
                            base_amount_currency: 0.0,
                            base_amount: 0.0,
                        },
                    };
                }
                const amounts = totals_per_tax[tax.id].amounts;
                for (const suffix of ["_currency", ""]) {
                    totals[suffix] += tax_data[`tax_amount${suffix}`];
                    amounts[`tax_amount${suffix}`] += tax_data[`tax_amount${suffix}`];
                    if (!counted_taxes.has(tax.id)) {
                        amounts[`base_amount${suffix}`] += tax_data[`base_amount${suffix}`];
                    }
                }
                counted_taxes.add(tax.id);
            }
        }
        return { totals, totals_per_tax };
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    reduce_base_lines_to_target_amount(
        base_lines,
        company,
        amount_type,
        amount,
        { computation_key = null, grouping_function = null, aggregate_function = null, document_tax_mode = null } = {}
    ) {
        if (!base_lines.length) {
            return [];
        }

        const currency = base_lines[0].currency_id;
        const rate = base_lines[0].rate;
        const columns = [
            ["_currency", currency],
            ["", company.currency_id],
        ];
        const sum = (values) => values.reduce((total, value) => total + value, 0.0);

        // The part of each total to reach.
        const { totals, totals_per_tax } = this.get_tax_totals_per_tax(base_lines);
        const sign = amount < 0.0 ? -1 : 1;
        let percentage;
        const expected_totals = {};
        if (amount_type === "fixed") {
            percentage = totals._currency ? (sign * amount) / totals._currency : 0.0;
            expected_totals._currency = roundPrecision(amount, currency.rounding);
            expected_totals[""] = rate
                ? roundPrecision(expected_totals._currency / rate, company.currency_id.rounding)
                : 0.0;
        } else {
            percentage = (sign * amount) / 100.0;
            for (const [suffix, suffix_currency] of columns) {
                expected_totals[suffix] = roundPrecision(
                    totals[suffix] * sign * percentage,
                    suffix_currency.rounding
                );
            }
        }
        const expected_totals_per_tax = {};
        for (const [tax_id, { amounts }] of Object.entries(totals_per_tax)) {
            expected_totals_per_tax[tax_id] = {};
            for (const prefix of ["tax", "base"]) {
                for (const [suffix, suffix_currency] of columns) {
                    const field = `${prefix}_amount${suffix}`;
                    expected_totals_per_tax[tax_id][field] = roundPrecision(
                        amounts[field] * sign * percentage,
                        suffix_currency.rounding
                    );
                }
            }
        }

        // Merge and scale the base lines.
        const reduced_base_lines = this.reduce_base_lines_with_grouping_function(base_lines, {
            grouping_function: grouping_function,
            aggregate_function: aggregate_function,
            computation_key: computation_key,
        });
        if (!reduced_base_lines.length) {
            return [];
        }
        const new_base_lines = reduced_base_lines.map((base_line) =>
            this.prepare_base_line_for_taxes_computation(base_line, {
                price_unit: base_line.price_unit * sign * percentage,
                computation_key: computation_key,
            })
        );
        this.add_tax_details_in_base_lines(new_base_lines, company);
        const new_totals_per_tax = this.get_tax_totals_per_tax(new_base_lines).totals_per_tax;
        const has_total_excluded = Boolean(
            sum(new_base_lines.map((base_line) => base_line.tax_details.total_excluded_currency))
        );
        const sorted_base_lines = new_base_lines.sort((base_line_1, base_line_2) => {
            const key_1 = [
                Boolean(base_line_1.special_type),
                -base_line_1.tax_details.total_excluded_currency,
            ];
            const key_2 = [
                Boolean(base_line_2.special_type),
                -base_line_2.tax_details.total_excluded_currency,
            ];
            if (key_1[0] !== key_2[0]) {
                return key_1[0] - key_2[0];
            }
            return key_1[1] - key_2[1];
        });

        // Each tax reaches its part.
        for (const [tax_id, { amounts: new_tax_totals }] of Object.entries(new_totals_per_tax)) {
            const taxes_data = sorted_base_lines.flatMap((base_line) =>
                base_line.tax_details.taxes_data.filter((tax_data) => tax_data.tax.id.toString() === tax_id)
            );
            for (const [suffix, suffix_currency] of columns) {
                for (const prefix of ["tax", "base"]) {
                    if (!new_tax_totals[`${prefix}_amount_currency`]) {
                        continue;
                    }
                    const field = `${prefix}_amount${suffix}`;
                    this.reach_target(
                        taxes_data,
                        field,
                        // The base of a reverse charged tax counts once per base line, see 'get_tax_totals_per_tax'.
                        expected_totals_per_tax[tax_id][field] -
                            new_tax_totals[field] +
                            sum(taxes_data.map((tax_data) => tax_data[field])),
                        suffix_currency.decimal_places,
                        {
                            weights: taxes_data.map((tax_data) =>
                                Math.abs(tax_data[`${prefix}_amount_currency`])
                            ),
                        }
                    );
                }
            }
        }

        // The base lines reach the part of the total.
        const taxes_details = sorted_base_lines.map((base_line) => base_line.tax_details);
        for (const [suffix, suffix_currency] of columns) {
            const field = `total_excluded${suffix}`;
            const amounts = this.reach_target(
                taxes_details,
                field,
                expected_totals[suffix] -
                    sum(
                        Object.values(expected_totals_per_tax).map(
                            (expected_tax_totals) => expected_tax_totals[`tax_amount${suffix}`]
                        )
                    ),
                suffix_currency.decimal_places,
                {
                    weights: taxes_details.map((tax_details) =>
                        has_total_excluded ? Math.abs(tax_details.total_excluded_currency) : 0.0
                    ),
                }
            );
            sorted_base_lines.forEach((base_line, i) => {
                const tax_details = base_line.tax_details;
                tax_details[field] = roundPrecision(tax_details[field], suffix_currency.rounding);
                tax_details[`total_included${suffix}`] = roundPrecision(
                    tax_details[`total_included${suffix}`] + amounts[i],
                    suffix_currency.rounding
                );
                if (suffix) {
                    base_line.price_unit += amounts[i];
                }
            });
        }
        return new_base_lines;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    prepare_discountable_base_lines(base_lines, company, { exclude_function = null } = {}) {
        return this.dispatch_taxes_into_new_base_lines(
            base_lines,
            company,
            (base_line, tax_data) =>
                !this.can_be_discounted(tax_data.tax) ||
                (exclude_function && exclude_function(base_line, tax_data))
        );
    },

    // -------------------------------------------------------------------------
    // GLOBAL DISCOUNT
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    prepare_global_discount_lines(
        base_lines,
        company,
        amount_type,
        amount,
        { computation_key = "global_discount", grouping_function = null } = {}
    ) {
        const new_base_lines = this.reduce_base_lines_to_target_amount(
            this.prepare_discountable_base_lines(base_lines, company),
            company,
            amount_type,
            -amount,
            { computation_key: computation_key, grouping_function: grouping_function }
        );
        this.pin_base_lines_tax_details(new_base_lines, company);
        return new_base_lines;
    },

    // -------------------------------------------------------------------------
    // DOWN PAYMENT
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    prepare_down_payment_lines(
        base_lines,
        company,
        amount_type,
        amount,
        { computation_key = "down_payment", grouping_function = null } = {}
    ) {
        const new_base_lines = this.reduce_base_lines_to_target_amount(
            this.prepare_discountable_base_lines(base_lines, company),
            company,
            amount_type,
            amount,
            { computation_key: computation_key, grouping_function: grouping_function }
        );
        this.pin_base_lines_tax_details(new_base_lines, company);
        return new_base_lines;
    },

    // -------------------------------------------------------------------------
    // DISPATCHING OF LINES
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    extract_tax_data(base_line, company, index) {
        const tax_details = base_line.tax_details;
        const taxes_data = tax_details.taxes_data;
        const tax_data_to_remove = taxes_data[index];

        const first_tax_details = {
            raw_total_excluded_currency: tax_details.raw_total_excluded_currency,
            raw_total_excluded: tax_details.raw_total_excluded,
            total_excluded_currency: tax_details.total_excluded_currency,
            total_excluded: tax_details.total_excluded,
            taxes_data: taxes_data.slice(0, index),
        };
        const second_tax_details = {
            raw_total_excluded_currency: tax_data_to_remove.raw_tax_amount_currency,
            raw_total_excluded: tax_data_to_remove.raw_tax_amount,
            total_excluded_currency: tax_data_to_remove.tax_amount_currency,
            total_excluded: tax_data_to_remove.tax_amount,
            taxes_data: [],
        };
        const target_factors = [
            { factor: first_tax_details.raw_total_excluded_currency },
            { factor: second_tax_details.raw_total_excluded_currency },
        ];
        for (const remaining_tax_data of taxes_data.slice(index + 1)) {
            let first_tax_data = remaining_tax_data;
            if (tax_data_to_remove.taxes.includes(remaining_tax_data.tax)) {
                let second_tax_data;
                [first_tax_data, second_tax_data] = this.split_tax_data(
                    base_line,
                    remaining_tax_data,
                    company,
                    target_factors
                );
                second_tax_details.taxes_data.push(second_tax_data);
            }
            first_tax_details.taxes_data.push(first_tax_data);
        }
        this.set_tax_details_total_included(first_tax_details);
        this.set_tax_details_total_included(second_tax_details);

        const second_price_unit =
            second_tax_details.raw_total_excluded_currency +
            second_tax_details.taxes_data
                .filter((tax_data) =>
                    this.is_price_included(tax_data.tax, {
                        document_tax_mode: base_line.document_tax_mode,
                    })
                )
                .reduce((sum, tax_data) => sum + tax_data.raw_tax_amount_currency, 0.0);
        return [
            this.prepare_base_line_for_taxes_computation(base_line, {
                tax_ids: first_tax_details.taxes_data.map((tax_data) => tax_data.tax),
                tax_details: first_tax_details,
            }),
            this.prepare_base_line_for_taxes_computation(base_line, {
                tax_ids: second_tax_details.taxes_data.map((tax_data) => tax_data.tax),
                price_unit: second_price_unit / (base_line.quantity || 1.0),
                tax_details: second_tax_details,
                _removed_tax_data: tax_data_to_remove,
            }),
        ];
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    dispatch_taxes_into_new_base_lines(base_lines, company, exclude_function) {
        return base_lines.map((base_line) => {
            const taxes_to_exclude = base_line.tax_details.taxes_data
                .filter((tax_data) => exclude_function(base_line, tax_data))
                .map((tax_data) => tax_data.tax);
            const new_base_lines = [];
            let to_process = [base_line];
            while (to_process.length) {
                const current_base_line = to_process.shift();
                const index = current_base_line.tax_details.taxes_data.findIndex((tax_data) =>
                    taxes_to_exclude.includes(tax_data.tax)
                );
                if (index === -1) {
                    new_base_lines.push({ ...current_base_line });
                } else {
                    to_process = [
                        ...this.extract_tax_data(current_base_line, company, index),
                        ...to_process,
                    ];
                }
            }
            new_base_lines[0].removed_taxes_data_base_lines = new_base_lines.slice(1);
            return new_base_lines[0];
        });
    },
};
