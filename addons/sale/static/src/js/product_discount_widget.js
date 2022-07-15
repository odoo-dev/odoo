/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { FloatField } from "@web/views/fields/float/float_field";
import { _lt } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";


const { onWillUpdateProps } = owl;

export class ProductDiscountField extends FloatField {
    setup() {
        super.setup();
        this.dialogService = useService("dialog");
    }

    onChange(ev) {
        // get the order lines (no section name and no note)
        console.log("ev", ev.target.value);
        console.log("props", this.props.value);

        let orderLines = this.props.record.model.root.data.order_line.records.filter(line => !line.data.display_type);
        if (orderLines.length < 3) {
            return;
        }

        let newValue = ev.target.value;
        let fieldName = "discount";
        let isFirstOrderLine = this.props.record.data.id === orderLines[0].data.id;

        if (isFirstOrderLine && this.sameValue(orderLines, fieldName)) {
            let body = "Do you want to apply this value to all lines ?";
            this.dialogService.add(ConfirmationDialog, {
                body: body,
                confirm: this.apply_changes_to_all(ev, newValue, orderLines, fieldName),
            });
        }
    }


    apply_changes_to_all(ev, newValue, orderLines, fieldName) {
        console.log("changes to all");
        let customValuesCommands = [];

        orderLines.slice(1).forEach((line) => {
            customValuesCommands.push({
                operation: "UPDATE",
                id: line.id,
                data: { [fieldName]: newValue },
            });
        });

        console.log(customValuesCommands);

        const parentID = this.props.record.model.__bm__.localData[this.props.record.__bm_handle__].parentID;
        this.props.record.model.__bm__.notifyChanges(parentID, {
            category: {
                operation: "MULTI",
                customValuesCommands,
            },
        });

    }


    sameValue(orderLines, fieldName) {
        let compareValue = orderLines[1].data[fieldName];
        return orderLines.slice(1).every(line => line.data[fieldName] === compareValue);
    }
}

ProductDiscountField.template = "sale.ProductDiscountWidget";
ProductDiscountField.displayName = _lt("Disc.%"); // TODO: I don't like hard coding the display name

registry.category("fields").add("product_discount", ProductDiscountField)
