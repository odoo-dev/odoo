import { Component } from "@odoo/owl";
import { formatCurrency } from "@web/core/currency";
import { BadgeTag } from "@web/core/tags_list/badge_tag";
import { localization as l10n } from "@web/core/l10n/localization";
import { accountTaxHelpers } from "@account/helpers/account_tax";
import { formatMonetary } from "@web/views/fields/formatters";

export class Orderline extends Component {
    static components = { BadgeTag };
    static template = "point_of_sale.Orderline";
    static props = {
        line: Object,
        class: { type: Object, optional: true },
        slots: { type: Object, optional: true },
        showTaxGroupLabels: { type: Boolean, optional: true },
        showTaxGroup: { type: Boolean, optional: true },
        mode: { type: String, optional: true }, // display, receipt
        basic_receipt: { type: Boolean, optional: true },
    };
    static defaultProps = {
        showImage: false,
        showTaxGroupLabels: false,
        showTaxGroup: false,
        mode: "display",
        basic_receipt: false,
    };

    formatCurrency(amount) {
        return formatCurrency(amount, this.line.currency.id);
    }

    get line() {
        return this.props.line;
    }

    get taxGroup() {
        return [
            ...new Set(
                this.line.product_id.taxes_id
                    ?.map((tax) => tax.tax_group_id.pos_receipt_label)
                    .filter((label) => label)
            ),
        ].join(" ");
    }
    getInternalNotes() {
        return JSON.parse(this.line.note || "[]");
    }

    quantityStr(qty) {
        let unitPart = "";
        let decimalPart = "";
        const unit = this.line.product_id.uom_id;
        const decimalPoint = l10n.decimalPoint;

        if (unit) {
            if (unit.rounding) {
                if (qty % 1 === 0) {
                    unitPart = qty.toFixed(0);
                } else {
                    const parts = qty.toString().split(decimalPoint);
                    unitPart = parts[0];
                    decimalPart = parts[1] || "";
                }
            } else {
                unitPart = qty.toFixed(0);
            }
        } else {
            unitPart = "" + qty;
        }
        return {
            qtyStr: unitPart + (decimalPart ? decimalPoint + decimalPart : ""),
            unitPart: unitPart,
            decimalPoint: decimalPoint,
            decimalPart: decimalPart,
        };
    }

    orderDisplayProductName(line) {
        return {
            name: line.product_id?.name,
            attributeString: constructAttributeString(line),
        };
    }

    unitDisplayPrice(line) {
        const prices =
            line.combo_line_ids.length > 0
                ? line.combo_line_ids.reduce(
                      (acc, cl) => ({
                          priceWithTax: acc.priceWithTax + this.getAllPrices(cl).priceWithTax,
                          priceWithoutTax: acc.priceWithoutTax + this.getAllPrices(cl).priceWithoutTax,
                      }),
                      { priceWithTax: 0, priceWithoutTax: 0 }
                  )
                : this.getAllPrices(line);

        return line.config.iface_tax_included === "total"
            ? prices.priceWithTax
            : prices.priceWithoutTax;
    }

    getAllPrices(line) {
        const qty = line.qty || 1;
        const company = line.company;
        const product = line.product_id;
        const taxes = line.tax_ids || product.taxes_id;
        const baseLine = accountTaxHelpers.prepare_base_line_for_taxes_computation(
            line,
            this.prepareBaseLineForTaxesComputationExtraValues(line, {
                quantity: qty,
                tax_ids: taxes,
            })
        );
        accountTaxHelpers.add_tax_details_in_base_line(baseLine, company);
        accountTaxHelpers.round_base_lines_tax_details([baseLine], company);

        const baseLineNoDiscount = accountTaxHelpers.prepare_base_line_for_taxes_computation(
            line,
            this.prepareBaseLineForTaxesComputationExtraValues(line, {
                quantity: qty,
                tax_ids: taxes,
                discount: 0.0,
            })
        );
        accountTaxHelpers.add_tax_details_in_base_line(baseLineNoDiscount, company);
        accountTaxHelpers.round_base_lines_tax_details([baseLineNoDiscount], company);

        // Tax details.
        const taxDetails = {};
        for (const taxData of baseLine.tax_details.taxes_data) {
            taxDetails[taxData.tax.id] = {
                amount: taxData.tax_amount_currency,
                base: taxData.base_amount_currency,
            };
        }

        return {
            priceWithTax: baseLine.tax_details.total_included_currency,
            priceWithoutTax: baseLine.tax_details.total_excluded_currency,
            priceWithTaxBeforeDiscount: baseLineNoDiscount.tax_details.total_included_currency,
            priceWithoutTaxBeforeDiscount: baseLineNoDiscount.tax_details.total_excluded_currency,
            tax:
                baseLine.tax_details.total_included_currency -
                baseLine.tax_details.total_excluded_currency,
            taxDetails: taxDetails,
            taxesData: baseLine.tax_details.taxes_data,
        };
    }
    prepareBaseLineForTaxesComputationExtraValues(line, customValues = {}) {
        const order = line.order_id;
        const currency = order.config.currency_id;
        const extraValues = { currency_id: currency };
        const product = line.product_id;
        const priceUnit = line.price;
        const discount = line.discount;

        const values = {
            ...extraValues,
            quantity: line.qty,
            price_unit: priceUnit,
            discount: discount,
            tax_ids: line.tax_ids,
            product_id: product,
            rate: 1.0,
            is_refund: line.qty * priceUnit < 0,
            ...customValues,
        };
        if (order.fiscal_position_id) {
            values.tax_ids = this.getTaxesAfterFiscalPosition(
                values.tax_ids,
                order.fiscal_position_id,
                order.models
            );
        }
        return values;
    }
    getDiscountStr(line) {
        return line.discount ? line.discount.toString() : "";
    }
    orderDisplayProductName(line) {
        let attributeString = "";
        if (line.attribute_value_ids && line.attribute_value_ids.length > 0) {
            for (const value of line.attribute_value_ids) {
                if (value.is_custom) {
                    const customValue = line.custom_attribute_value_ids.find(
                        (cus) =>
                            cus.custom_product_template_attribute_value_id?.id == parseInt(value.id)
                    );
                    if (customValue) {
                        attributeString += `${value.attribute_id.name}: ${value.name}: ${customValue.custom_value}, `;
                    }
                } else {
                    attributeString += `${value.name}, `;
                }
            }
            attributeString = attributeString.slice(0, -2);
        }
        return attributeString;
    }
    getDisplayClasses(line) {
        return {};
    }
    getPriceString(line) {
        return line.discount.toString() === "100"
            ? // free if the discount is 100
                _t("Free")
            : line.combo_line_ids.length > 0
            ? // total of all combo lines if it is combo parent
                formatMonetary(
                    line.combo_line_ids.reduce((total, cl) => total + this.getDisplayPrice(cl), 0),
                    line.config.currency_id.id
                )
            : line.combo_parent_id
            ? // empty string if it has combo parent
                ""
            : formatMonetary(this.getDisplayPrice(line), line.config.currency_id.id);
    }
    getDisplayPrice(line) {
        if (line.config.iface_tax_included === "total") {
            return this.getAllPrices(line).priceWithTax;
        } else {
            return this.getAllPrices(line).priceWithoutTax;
        }
    }
    getTaxesAfterFiscalPosition = (taxes, fiscalPosition, models) => {
        if (!fiscalPosition) {
            return taxes;
        }

        if (fiscalPosition.tax_ids?.length == 0) {
            return [];
        }

        const newTaxIds = [];
        for (const tax of taxes) {
            if (fiscalPosition.tax_map[tax.id]) {
                for (const mapTaxId of fiscalPosition.tax_map[tax.id]) {
                    newTaxIds.push(mapTaxId);
                }
            } else {
                newTaxIds.push(tax.id);
            }
        }

        return models["account.tax"].filter((tax) => newTaxIds.includes(tax.id));
    };

}
