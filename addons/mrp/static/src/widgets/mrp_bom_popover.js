import { registry } from "@web/core/registry";
import {
    PopoverComponent,
    PopoverWidgetField,
    popoverWidgetField,
} from "@stock/widgets/popover_widget";

class BomPopover extends PopoverComponent {
    static template = "mrp.bomPopover";
}

class BomPopoverField extends PopoverWidgetField {
    static components = {
        Popover: BomPopover,
    };
    setup(){
        super.setup();
    }
}

registry.category("fields").add("mrp_bom_popover", {
    ...popoverWidgetField,
    component: BomPopoverField,
});
