/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { FloatField } from "@web/views/fields/float/float_field";
import { _lt } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

 /**
    * Dialog called if user changes a value in the sale order line.
    * The wizard will open only if
    *  (1) Sale order line is 3 or more
    *  (2) First sale order line is changed
    *  (3) value is the same in all other sale order line
 */

export class ProductDiscountField extends FloatField {
    setup() {
        super.setup();
        this.dialogService = useService("dialog");
    }

    onChange(ev) {
        const orderLines = this.env.x2mList.records.filter(line => !line.data.display_type);

        if (orderLines.length < 3) {
            return; // nothing to do here
        }

        const isFirstOrderLine = this.props.record.data.id === orderLines[0].data.id;
        
        if (isFirstOrderLine && sameValue(orderLines)) {
            const body = _lt("Do you want to apply this value to all lines ?");

            this.dialogService.add(ConfirmationDialog, {
                body: body,
                confirm: () => {
                    const commands = orderLines.slice(1).map((line) => {
                        return {
                            operation: "UPDATE",
                            record: line,
                            data: {["discount"]: Number(ev.target.value)},
                        };
                    });

                    this.env.x2mList.applyBatchedCommands(commands);
                },
                cancel: () => {},
            });
        }
    }
}

export function sameValue(orderLines) {
    const compareValue = orderLines[1].data["discount"];
    return orderLines.slice(1).every(line => line.data["discount"] == compareValue);
}


ProductDiscountField.components = { ConfirmationDialog };
ProductDiscountField.template = "sale.ProductDiscountField";
ProductDiscountField.displayName = _lt("Disc.%");

registry.category("fields").add("product_discount", ProductDiscountField)
