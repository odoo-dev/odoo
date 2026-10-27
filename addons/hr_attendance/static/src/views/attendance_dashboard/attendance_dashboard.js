import { Component, onWillStart, proxy, t, useProps } from "@odoo/owl";
import { user } from "@web/core/user";
import { KeepLast } from "@web/core/utils/concurrency";
import { useBus, useService } from "@web/core/utils/hooks";
import { useDebounced } from "@web/core/utils/timing";

/**
 * KPI cards displayed on top of the attendance list view. Each card shows the
 * number of attendances matching a filter of the search view, and toggles that
 * filter when clicked.
 */
export class AttendanceDashboard extends Component {
    static template = "hr_attendance.AttendanceDashboard";

    props = useProps({
        model: t.any(),
    });

    setup() {
        this.orm = useService("orm");
        this.keepLast = new KeepLast();
        this.state = proxy({ cards: [], isOfficer: false });
        const debouncedLoad = useDebounced(() => this.loadCards(), 300);
        // counts change when records are approved, refused, edited...
        useBus(this.props.model.bus, "update", debouncedLoad);
        useBus(this.env.searchModel, "update", () => this.state.cards = [...this.state.cards]);
        onWillStart(async () => {
            this.state.isOfficer = await user.hasGroup("hr_attendance.group_hr_attendance_officer");
            if (this.state.isOfficer) {
                await this.loadCards();
            }
        });
    }

    async loadCards() {
        if (!this.state.isOfficer) {
            return;
        }
        this.state.cards = await this.keepLast.add(
            this.orm.call("hr.attendance", "get_attendance_dashboard", [])
        );
    }

    getFilter(card) {
        return this.env.searchModel
            .getSearchItems((item) => item.type === "filter" && item.name === card.filter)
            .at(0);
    }

    isActive(card) {
        return Boolean(this.getFilter(card)?.isActive);
    }

    onCardClick(card) {
        const searchModel = this.env.searchModel;
        // only one card filter at a time: deactivate the other ones
        for (const other of this.state.cards) {
            const filter = this.getFilter(other);
            if (other !== card && filter?.isActive) {
                searchModel.toggleSearchItem(filter.id);
            }
        }
        const filter = this.getFilter(card);
        if (filter) {
            searchModel.toggleSearchItem(filter.id);
        }
    }
}
