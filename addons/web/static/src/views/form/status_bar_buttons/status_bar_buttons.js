import { Component, t, usePlugin, useProps } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { UIPlugin } from "@web/core/ui/ui_plugin";

export class StatusBarButtons extends Component {
    static template = "web.StatusBarButtons";
    static components = {
        Dropdown,
        DropdownItem,
    };
    props = useProps({
        slots: t.object().optional(),
    });

    setup() {
        this.uiService = usePlugin(UIPlugin);
    }

    get visibleSlotNames() {
        if (!this.props.slots) {
            return [];
        }
        return Object.entries(this.props.slots)
            .filter((entry) => entry[1].isVisible)
            .map((entry) => entry[0]);
    }
}
