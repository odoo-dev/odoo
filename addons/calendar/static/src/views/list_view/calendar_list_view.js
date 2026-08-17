import { listView } from "@web/views/list/list_view";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { _t } from "@web/core/l10n/translation";
import { CaledarListController } from "./calendar_list_controller";

export class CalendarListModel extends listView.Model {
    setup(params, { action, dialog, notification, rpc, user, view, company }) {
        super.setup(...arguments);
        this.attendeeFilterApplied = false;
    }

    /**
     * @override
     * Add the calendar view's selected attendees to the list view's domain.
     */
    async load(params = {}) {
        const filters = params?.context?.calendar_filters;
        const emptyDomain = Array.isArray(params?.domain) && params.domain.length == 0;
        if (filters && emptyDomain && !this.attendeeFilterApplied) {
            const selectedPartners = await this.orm.call(
                "res.users",
                "get_selected_calendars_partners",
                [[user.userId], filters["user"]]
            );
            const selectedPartnerIds = selectedPartners.map((p) => p.id);
            // Filter attendees to be shown if 'everybody' filter isn't active.
            if (!filters["all"] && selectedPartnerIds.length) {
                params.domain.push(["partner_ids", "in", selectedPartnerIds]);
                const searchItem = Object.values(this.env.searchModel.searchItems).find(
                    (item) => item.fieldName === "partner_ids"
                );

                if (searchItem) {
                    this.env.searchModel.addAutoCompletionValues(searchItem.id, {
                        label: selectedPartners.map((p) => p.display_name).join(` ${_t("or")} `),
                        value: selectedPartnerIds,
                        operator: "in",
                    });
                    this.attendeeFilterApplied = true;
                }
            }
        }
        return super.load(params);
    }
}

export const CalendarListView = {
    ...listView,
    Model: CalendarListModel,
    Controller: CaledarListController,
};

function _mockGetCalendarPartnerIds(params) {
    /* Mock function for when there aren't records to be shown. */
    return [];
}

registry.category("views").add("calendar_list_view", CalendarListView);
registry
    .category("sample_server")
    .add("get_selected_calendars_partners", _mockGetCalendarPartnerIds);
