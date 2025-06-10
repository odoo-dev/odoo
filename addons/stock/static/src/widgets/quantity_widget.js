import { FloatField, floatField } from "@web/views/fields/float/float_field";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class QuantityWidget extends FloatField {
    static template = "stock.QuantityWidget";

    setup() {
        super.setup();
        this.actionService = useService("action");
    }

    async showDetails() {
        const { resId, resModel, data } = this.props.record;
        if (!data.is_quantity_done_editable && resId) {
            const action = await this.props.record.model.orm.call(resModel, 'action_show_details', [resId]);
            return this.actionService.doAction(action);
        }
    }
}

export const quantityWidget = {
    ...floatField,
    component: QuantityWidget,
};

registry.category("fields").add("quantity_widget", quantityWidget);
