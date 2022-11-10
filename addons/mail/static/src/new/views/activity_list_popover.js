/** @odoo-module **/

import { ActivityListPopoverItem } from "@mail/new/activity/activity_list_popover_item";

import { useService } from "@web/core/utils/hooks";

import { Component, onWillUpdateProps, useState } from "@odoo/owl";

export class ActivityListPopover extends Component {
    setup() {
        this.orm = useService("orm");
        this.activity = useService("mail.activity");
        this.user = useService("user");
        this.state = useState({ activities: [] });
        this.updateFromProps(this.props);
        onWillUpdateProps((props) => this.updateFromProps(props));
    }

    onClickAddActivityButton() {
        this.activity
            .scheduleActivity(this.props.record.resModel, this.props.record.resId)
            .then(() => this.reload());
        this.props.close();
    }

    get overdueActivities() {
        return this.state.activities.filter((activity) => activity.state === "overdue");
    }

    get plannedActivities() {
        return this.state.activities.filter((activity) => activity.state === "planned");
    }

    reload() {
        this.props.record.model.load({ resId: this.props.record.resId });
    }

    get todayActivities() {
        return this.state.activities.filter((activity) => activity.state === "today");
    }

    async updateFromProps(props) {
        this.state.activities = (
            await this.orm.silent.call(
                "mail.activity",
                "activity_format",
                [props.record.data.activity_ids.currentIds],
                { context: this.user.user_context }
            )
        ).sort(function (a, b) {
            if (a.date_deadline === b.date_deadline) {
                return a.id - b.id;
            }
            return a.date_deadline < b.date_deadline ? -1 : 1;
        });
    }
}

Object.assign(ActivityListPopover, {
    components: { ActivityListPopoverItem },
    props: ["close", "record"],
    template: "mail.ActivityListPopover",
});
