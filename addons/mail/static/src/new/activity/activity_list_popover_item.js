/* @odoo-module */

import { ActivityMarkAsDone } from "@mail/new/activity/activity_markasdone_popover";

import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";
import { FileUploader } from "@web/views/fields/file_handler";

import { computeDelay } from "@mail/new/utils/dates";
import { useAttachmentUploader } from "@mail/new/utils/hooks";

import { Component, useState } from "@odoo/owl";

export class ActivityListPopoverItem extends Component {
    static components = { ActivityMarkAsDone, FileUploader };
    static props = [
        "activity",
        "onActivityChanged",
        "onClickDoneAndScheduleNext?",
        "onClickEditActivityButton",
    ];
    static template = "mail.ActivityListPopoverItem";

    setup() {
        this.user = useService("user");
        this.state = useState({ hasMarkDoneView: false });
        if (this.props.activity.activity_category === "upload_file") {
            this.attachmentUploader = useAttachmentUploader({
                threadLocalId: this.env.services["mail.messaging"].getChatterThread(
                    this.props.activity.res_model,
                    this.props.activity.res_id
                ).localId,
            });
        }
        this.closeMarkAsDone = this.closeMarkAsDone.bind(this);
    }

    closeMarkAsDone() {
        this.state.hasMarkDoneView = false;
    }

    get delayLabel() {
        const diff = computeDelay(this.props.activity.date_deadline);
        if (diff === 0) {
            return this.env._t("Today");
        } else if (diff === -1) {
            return this.env._t("Yesterday");
        } else if (diff < 0) {
            return sprintf(this.env._t("%s days overdue"), Math.round(Math.abs(diff)));
        } else if (diff === 1) {
            return this.env._t("Tomorrow");
        } else {
            return sprintf(this.env._t("Due in %s days"), Math.round(Math.abs(diff)));
        }
    }

    get hasEditButton() {
        return this.props.activity.chaining_type === "suggest" && this.props.activity.can_write;
    }

    get hasFileUploader() {
        return this.props.activity.activity_category === "upload_file";
    }

    get hasMarkDoneButton() {
        return !this.hasFileUploader;
    }

    onClickEditActivityButton() {
        this.props.onClickEditActivityButton();
        this.env.services["mail.activity"]
            .scheduleActivity(
                this.props.activity.res_model,
                this.props.activity.res_id,
                this.props.activity.id
            )
            .then(() => this.props.onActivityChanged());
    }

    onClickMarkAsDone() {
        this.state.hasMarkDoneView = !this.state.hasMarkDoneView;
    }

    async onFileUploaded(data) {
        const { id: attachmentId } = await this.attachmentUploader.uploadData(data);
        await this.env.services["mail.activity"].markAsDone(this.props.activity.id, [attachmentId]);
        this.props.onActivityChanged();
    }
}
