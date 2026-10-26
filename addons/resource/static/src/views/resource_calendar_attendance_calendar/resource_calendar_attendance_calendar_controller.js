import { onMounted, onWillUnmount } from "@odoo/owl";
import { useRef } from "@web/owl2/utils";
import { CalendarController } from "@web/views/calendar/calendar_controller";
import { ResourceMultiSelectionButtons } from "@resource/views/view_components/resource_multi_selection_buttons";

export class ResourceCalendarAttendanceCalendarController extends CalendarController {
    static components = {
        ...CalendarController.components,
        MultiSelectionButtons: ResourceMultiSelectionButtons,
    };

    setup() {
        super.setup();
        const rootRef = useRef("root");
        const containers = [];
        onMounted(() => {
            // Let the form (and its dialog) give the calendar all the height.
            for (const selector of [".o_resource_form", ".modal-content"]) {
                const container = rootRef.el.closest(selector);
                if (container) {
                    container.classList.add("o_resource_calendar_attendance_calendar_container");
                    containers.push(container);
                }
            }
        });
        onWillUnmount(() => {
            for (const container of containers) {
                container.classList.remove("o_resource_calendar_attendance_calendar_container");
            }
        });
    }

    /**
     * @override
     */
    onMultiDelete(selectedCells) {
        const ids = this.getSelectedRecordIds(selectedCells);
        const dates = this.getDates(selectedCells);
        this.model.multiExcludeDates(ids, dates);
    }
}
