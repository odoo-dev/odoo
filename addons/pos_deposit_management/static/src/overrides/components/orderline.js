import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";

patch(Orderline.prototype, {
    get lineContainerClasses() {
        const isComboNested =
            this.line.combo_parent_id || this.line.deposit_parent_line_id?.combo_parent_id;
        return {
            selected: this.line.isSelected() && this.props.mode === "display",
            ...this.line.getDisplayClasses(),
            ...(this.props.class || []),
            "border-start": isComboNested,
            "orderline-combo fst-italic ms-4": isComboNested,
            "position-relative d-flex align-items-center lh-sm cursor-pointer": true,
        };
    },
});
