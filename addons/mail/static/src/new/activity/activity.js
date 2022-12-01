/** @odoo-module */

import { Component, useState, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePopover } from "@web/core/popover/popover_hook";
import { ActivityMarkAsDone } from "./activity_markasdone_popover";
import { computeDelay } from "@mail/new/utils/dates";

export class Activity extends Component {
    setup() {
        this.orm = useService("orm");
        this.activity = useService("mail.activity");
        this.state = useState({
            showDetails: false,
        });
        this.popover = usePopover();
        this.delay = computeDelay(this.props.data.date_deadline);
        onWillUpdateProps((nextProps) => {
            this.delay = computeDelay(nextProps.data.date_deadline);
        });
    }

    toggleDetails() {
        this.state.showDetails = !this.state.showDetails;
    }

    async markAsDone(ev) {
        this.popover.add(
            ev.currentTarget,
            ActivityMarkAsDone,
            {
                activity: this.props.data,
                reload: this.env.chatter ? this.env.chatter.reload : undefined,
            },
            { position: "right" }
        );
    }

    async edit() {
        const { id, res_model, res_id } = this.props.data;
        await this.activity.scheduleActivity(res_model, res_id, id);
        if (this.env.chatter) {
            this.env.chatter.reload();
        }
    }

    async unlink() {
        await this.orm.unlink("mail.activity", [this.props.data.id]);
        if (this.env.chatter) {
            this.env.chatter.reload();
        }
    }
}

Object.assign(Activity, {
    props: ["data"],
    template: "mail.activity",
});
