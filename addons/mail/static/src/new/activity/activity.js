/* @odoo-module */

import { Component, useState, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePopover } from "@web/core/popover/popover_hook";
import { FileUploader } from "@web/views/fields/file_handler";

import { ActivityMarkAsDone } from "./activity_markasdone_popover";
import { computeDelay } from "@mail/new/utils/dates";
import { useAttachmentUploader } from "@mail/new/utils/hooks";

export class Activity extends Component {
    static components = { FileUploader };
    static props = ["data", "onUpdate?"];
    static defaultProps = { onUpdate: () => {} };
    static template = "mail.activity";

    setup() {
        this.orm = useService("orm");
        this.activity = useService("mail.activity");
        this.messaging = useService("mail.messaging");
        this.state = useState({
            showDetails: false,
        });
        this.popover = usePopover();
        this.delay = computeDelay(this.props.data.date_deadline);
        onWillUpdateProps((nextProps) => {
            this.delay = computeDelay(nextProps.data.date_deadline);
        });
        if (this.props.data.activity_category === "upload_file") {
            this.attachmentUploader = useAttachmentUploader({
                threadLocalId: this.thread.localId,
            });
        }
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
                hasHeader: true,
                reload: this.props.onUpdate,
            },
            { position: "right" }
        );
    }

    async onFileUploaded(data) {
        const { id: attachmentId } = await this.attachmentUploader.uploadData(data);
        await this.activity.markAsDone(this.props.data.id, [attachmentId]);
        this.props.onUpdate();
        await this.messaging.fetchThreadMessagesNew(this.thread.localId);
    }

    async edit() {
        const { id, res_model, res_id } = this.props.data;
        await this.activity.scheduleActivity(res_model, res_id, id);
        this.props.onUpdate();
    }

    async unlink() {
        await this.orm.unlink("mail.activity", [this.props.data.id]);
        this.props.onUpdate();
    }

    get thread() {
        return this.messaging.getChatterThread(this.props.data.res_model, this.props.data.res_id);
    }
}
