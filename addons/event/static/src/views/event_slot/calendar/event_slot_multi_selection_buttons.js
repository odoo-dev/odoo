import { usePlugin } from "@odoo/owl";
import { UIPlugin } from "@web/core/ui/ui_plugin";
import { MultiSelectionButtons } from "@web/views/view_components/multi_selection_buttons";

export class EventSlotCalendarMultiSelectionButtons extends MultiSelectionButtons {
    // Add a hint to ensure users understand they need to click on a date to add slots.
    static template = "event.EventSlotCalendarMultiSelectionButtons";

    setup() {
        super.setup();
        this.uiService = usePlugin(UIPlugin);
    }
};
