/** @odoo-module **/

import { evaluateExpr } from "@web/core/py_js/py";
import { RadioField, radioField } from "@web/views/fields/radio/radio_field";
import { registry } from "@web/core/registry";

class NemhandelRadioField extends RadioField {
    static template = "l10n_dk_nemhandel.NemhandelRadioField";
    static props = {
        ...RadioField.props,
        hiddenItems: { type: String, optional: true },
        readonlyItems: { type: String, optional: true },
    };

    setup() {
        super.setup()
        this.initialSelection = this.props.record.data[this.props.name];
        this.readonlyItems = evaluateExpr(this.props.readonlyItems || "[]", this.props.record.evalContext);
        this.hiddenItems = evaluateExpr(this.props.hiddenItems || "[]", this.props.record.evalContext).filter(item => (item != this.initialSelection));
    }

    get items() {
        return super.items.filter(item => !(this.hiddenItems.includes(item[0])))
    }
}

const nemhandelRadioField = {
    ...radioField,
    component: NemhandelRadioField,
    extractProps: ({attrs, options}, dynamicInfo) => {
        return {
            hiddenItems: attrs.hidden_items || "[]",
            readonlyItems: attrs.readonly_items  || "[]",
            ...radioField.extractProps({attrs, options}, dynamicInfo),
        }
    },
}
registry.category("fields").add("l10n_dk_nemhandel_radio_field", nemhandelRadioField);
