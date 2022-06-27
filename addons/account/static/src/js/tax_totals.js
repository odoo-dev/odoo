/** @odoo-module **/

import { formatFloat } from "@web/views/fields/formatters";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { registry } from "@web/core/registry";
import { session } from "@web/session";

const { Component, onPatched, onWillUpdateProps, useRef, useState } = owl;

/**
    A line of some TaxTotalsComponent, giving the values of a tax group.
**/
class TaxGroupComponent extends Component {
    setup() {
        this.inputTax = useRef("taxValueInput");
        this.state = useState({value: "readonly"});
        onPatched(() => {
            if (this.state.value === "edit") {
                this.inputTax.el.focus(); // Focus the input
                this.inputTax.el.value = this.props.taxGroup.tax_group_amount;
            }
        });
        onWillUpdateProps(() => {
            this.setState("readonly");
        });
    }

    get allowTaxEdition() {
        return !this.props.isReadonly && this.props.allowTaxEdition;
    }
    //--------------------------------------------------------------------------
    // Main methods
    //--------------------------------------------------------------------------

    /**
     * The purpose of this method is to change the state of the component.
     * It can have one of the following three states:
     *  - readonly: display in read-only mode of the field,
     *  - edit: display with a html input field,
     *  - disable: display with a html input field that is disabled.
     *
     * If a value other than one of these 3 states is passed as a parameter,
     * the component is set to readonly by default.
     *
     * @param {String} value
     */
    setState(value) {
        if (["readonly", "edit", "disable"].includes(value)) {
            this.state.value = value;
        }
        else {
            this.state.value = "readonly";
        }
    }

    /**
     * This method handles the "_onChangeTaxValue" event. In this method,
     * we get the new value for the tax group, we format it and we call
     * the method to recalculate the tax lines. At the moment the method
     * is called, we disable the html input field.
     *
     * In case the value has not changed or the tax group is equal to 0,
     * the modification does not take place.
     */
    _onChangeTaxValue() {
        this.setState("disable"); // Disable the input
        let newValue = Number(this.inputTax.el.value); // Get the new value
        try {
            newValue = formatFloat(newValue, { digits: this.props.currency.digits }); // Return a string rounded to currency precision
        } catch (_err) {
            this.props.invalidate();
            this.setState("edit");
            return;
        }
        // The newValue can"t be equals to 0
        if (newValue === this.props.taxGroup.tax_group_amount || newValue === 0) {
            this.setState("readonly");
            return;
        }
        const oldValue = this.props.taxGroup.tax_group_amount;
        this.props.taxGroup.tax_group_amount = newValue;
        this.props.taxGroup.formatted_tax_group_amount = this.props.taxGroup.formatted_tax_group_amount.replace(oldValue.toString(), newValue.toString());
        this.props.onChangeTaxGroup({
            oldValue,
            newValue: Number(newValue),
            taxGroupId: this.props.taxGroup.tax_group_id
        });
    }
}

TaxGroupComponent.props = {
    currency: {},
    taxGroup: { optional: true },
    allowTaxEdition: { optional: true },
    onChangeTaxGroup: { optional: true },
    isReadonly: Boolean,
    invalidate: Function,
};
TaxGroupComponent.template = "account.TaxGroupComponent";

/**
    Widget used to display tax totals by tax groups for invoices, PO and SO,
    and possibly allowing editing them.

    Note that this widget requires the object it is used on to have a
    currency_id field.
**/
export class TaxTotalsComponent extends Component {
    setup() {
        this.totals = this.props.parsedValue;
        onWillUpdateProps((nextProps) => {
            // We only reformat tax groups if there are changed
            this.totals = nextProps.parsedValue;
        });
    }

    /**
     * This method is the main function of the tax group widget.
     * It is called by the TaxGroupComponent and receives the
     * newer tax value.
     *
     * It is responsible for calculating taxes based on tax groups and triggering
     * an event to notify the ORM of a change.
     */
    _onChangeTaxValueByTaxGroup({ oldValue, newValue, taxGroupId }) {
        if (oldValue === newValue) return;
        const [oldTotal, newTotal] = [this.totals.amount_total, this.totals.amount_untaxed + newValue];
        this.totals.amount_total = newTotal;
        this.totals.formatted_amount_total = this.totals.formatted_amount_total.replace(oldTotal.toString(), newTotal.toString());
        this.props.update(JSON.stringify(this.totals));
    }
}

TaxTotalsComponent.template = "account.TaxTotalsField";
TaxTotalsComponent.components = { TaxGroupComponent };
TaxTotalsComponent.props = {
    ...standardFieldProps,
    allowTaxEdition: {type: Boolean, optional: true},
    currency: {},
    invalidate: Function,
    parsedValue: Object,
}

TaxTotalsComponent.extractProps = (fieldName, record, attrs) => {
    const parsedValue = record.data[fieldName] ? JSON.parse(record.data[fieldName]) : null;
    return {
        parsedValue,
        currency: session.currencies[record.data.currency_id[0]],
        allowTaxEdition: parsedValue && parsedValue.allow_tax_edition || attrs.allowTaxEdition,
        invalidate: () => record.setInvalidField(fieldName),
    };
};

registry.category("fields").add("account-tax-totals-field", TaxTotalsComponent);
