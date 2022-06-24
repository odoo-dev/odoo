/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { formatMonetary } from "../formatters";
import { parseMonetary } from "../parsers";
import { useInputField } from "../input_field_hook";
import { useNumpadDecimal } from "../numpad_decimal_hook";
import { standardFieldProps } from "../standard_field_props";
import { session } from "@web/session";

const { Component } = owl;

export class MonetaryField extends Component {
    setup() {
        useInputField({
            getValue: () => this.formattedValue,
            refName: "numpadDecimal",
            parse: (v) => parseMonetary(v, { currencyId: this.props.currencyId }),
        });
        useNumpadDecimal();
    }

    get currency() {
        if (!isNaN(this.props.currencyId) && this.props.currencyId in session.currencies) {
            return session.currencies[this.props.currencyId];
        }
        return null;
    }

    get currencySymbol() {
        return this.currency ? this.currency.symbol : "";
    }

    get currencyPosition() {
        return this.currency && this.currency.position;
    }

    get currencyDigits() {
        if (this.props.digits) {
            return this.props.digits;
        }
        if (!this.currency) {
            return null;
        }
        return session.currencies[this.props.currencyId].digits;
    }

    get formattedValue() {
        if (this.props.inputType === "number" && !this.props.readonly && this.props.value) {
            return this.props.value;
        }
        return formatMonetary(this.props.value, {
            digits: this.currencyDigits,
            currencyId: this.props.currencyId,
            noSymbol: !this.props.readonly || this.props.hideSymbol,
        });
    }
}

MonetaryField.template = "web.MonetaryField";
MonetaryField.props = {
    ...standardFieldProps,
    currencyId: { type: Number, optional: true },
    inputType: { type: String, optional: true },
    digits: { type: Array, optional: true },
    hideSymbol: { type: Boolean, optional: true },
    invalidate: { type: Function, optional: true },
    placeholder: { type: String, optional: true },
};
MonetaryField.defaultProps = {
    hideSymbol: false,
    inputType: "text",
    invalidate: () => {},
};

MonetaryField.supportedTypes = ["monetary", "float"];
MonetaryField.displayName = _lt("Monetary");

MonetaryField.extractProps = function (fieldName, record, attrs) {
    return {
        currencyId: attrs.options.currency_field
            ? record.data[attrs.options.currency_field][0]
            : (record.data.currency_id && record.data.currency_id[0]) || undefined,
        inputType: attrs.type,
        digits: [16, 2],
        hideSymbol: attrs.options.no_symbol,
        invalidate: () => record.setInvalidField(fieldName),
        placeholder: attrs.placeholder,
    };
};

registry.category("fields").add("monetary", MonetaryField);
