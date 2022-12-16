/* @odoo-module */

import { Component, useState, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";
import { usePopover } from "@web/core/popover/popover_hook";
import { FileUploader } from "@web/views/fields/file_handler";

import { ActivityMarkAsDone } from "./activity_markasdone_popover";
import { computeDelay } from "@mail/new/utils/dates";
import { useAttachmentUploader } from "@mail/new/utils/hooks";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/views/chatter").ActivityData} data
 * @property {function} [onUpdate]
 * @extends {Component<Props, Env>}
 */
export class Activity extends Component {
    static components = { FileUploader };
    static props = ["data", "onUpdate?"];
    static defaultProps = { onUpdate: () => {} };
    static template = "mail.activity";

    /** @type {function} */
    closePopover;

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

    get displayName() {
        if (this.props.data.summary) {
            return sprintf(this.env._t("“%s”"), this.props.data.summary);
        }
        return this.props.data.display_name;
    }

    /**
     * @param {MouseEvent} ev
     * @param {Object} mailTemplate
     */
    onClickPreview(ev, mailTemplate) {
        ev.stopPropagation();
        ev.preventDefault();
        const action = {
            name: this.env._t("Compose Email"),
            type: "ir.actions.act_window",
            res_model: "mail.compose.message",
            views: [[false, "form"]],
            target: "new",
            context: {
                default_res_id: this.props.data.res_id,
                default_model: this.props.data.res_model,
                default_use_template: true,
                default_template_id: mailTemplate.id,
                force_email: true,
            },
        };
        this.env.services.action.doAction(action, {
            onClose: () => this.props.onUpdate(),
        });
    }

    /**
     * @param {MouseEvent} ev
     * @param {Object} mailTemplate
     */
    async onClickSend(ev, mailTemplate) {
        ev.stopPropagation();
        ev.preventDefault();
        await this.env.services.orm.call(this.props.data.res_model, "activity_send_mail", [
            [this.props.data.res_id],
            mailTemplate.id,
        ]);
        this.props.onUpdate();
    }

    toggleDetails() {
        this.state.showDetails = !this.state.showDetails;
    }

    async markAsDone(ev) {
        if (this.closePopover) {
            this.closePopover();
            this.closePopover = undefined;
            return;
        }
        this.closePopover = this.popover.add(
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
