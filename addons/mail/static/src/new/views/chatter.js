/* @odoo-module */

import { Follower } from "@mail/new/core/follower_model";
import { Thread } from "../thread/thread";
import { useMessaging } from "../messaging_hook";
import { useDropzone } from "@mail/new/dropzone/dropzone_hook";
import { AttachmentList } from "@mail/new/thread/attachment_list";
import { Composer } from "../composer/composer";
import { Activity } from "@mail/new/activity/activity";
import {
    Component,
    markup,
    onWillStart,
    onWillUpdateProps,
    useChildSubEnv,
    useRef,
    useState,
} from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useService } from "@web/core/utils/hooks";
import { FileUploader } from "@web/views/fields/file_handler";
import { isDragSourceExternalFile } from "@mail/new/utils/misc";
import { removeFromArrayWithPredicate } from "@mail/new/utils/arrays";
import { useAttachmentUploader, useHover } from "@mail/new/utils/hooks";
import { FollowerSubtypeDialog } from "./follower_subtype_dialog";
import { Attachment } from "../core/attachment_model";
import { _t } from "@web/core/l10n/translation";
import { createLocalId } from "../core/thread_model.create_local_id";

/**
 * @typedef ActivityData
 * @property {string} activity_category
 * @property {[number, string]} activity_type_id
 * @property {string|false} activity_decoration
 * @property {boolean} can_write
 * @property {'suggest'|'trigger'} chaining_type
 * @property {string} create_date
 * @property {[number, string]} create_uid
 * @property {string} date_deadline
 * @property {string} display_name
 * @property {boolean} has_recommended_activities
 * @property {string} icon
 * @property {number} id
 * @property {Object[]} mail_template_ids
 * @property {string} note
 * @property {number|false} previous_activity_type_id
 * @property {number|false} recommended_activity_type_id
 * @property {string} res_model
 * @property {[number, string]} res_model_id
 * @property {string} res_id
 * @property {string} res_name
 * @property {number|false} request_partner_id
 * @property {'overdue'|'planned'|'today'} state
 * @property {string} summary
 * @property {[number, string]} user_id
 * @property {string} write_date
 * @property {[number, string]} write_uid
 */

export class Chatter extends Component {
    static components = { AttachmentList, Dropdown, Thread, Composer, Activity, FileUploader };
    static props = [
        "hasActivity",
        "resId",
        "resModel",
        "displayName?",
        "isAttachmentBoxOpenedInitially?",
    ];
    static template = "mail.chatter";

    /**
     * @type {import("@mail/new/core/thread_model").Thread}
     */
    thread;

    setup() {
        this.action = useService("action");
        this.activity = useService("mail.activity");
        this.messaging = useMessaging();
        this.orm = useService("orm");
        this.rpc = useService("rpc");
        this.state = useState({
            /** @type {ActivityData[]} */
            activities: [],
            attachments: [],
            showActivities: true,
            isAttachmentBoxOpened: this.props.isAttachmentBoxOpenedInitially,
            isLoadingAttachments: false,
        });
        this.unfollowHover = useHover("unfollow");
        this.attachmentUploader = useAttachmentUploader({
            threadLocalId: createLocalId(this.props.resModel, this.props.resId),
        });
        this.rootRef = useRef("root");
        useChildSubEnv({
            inChatter: true,
        });
        useDropzone(this.rootRef, (ev) => {
            if (this.thread.composer.type) {
                return;
            }
            if (isDragSourceExternalFile(ev.dataTransfer)) {
                [...ev.dataTransfer.files].forEach(this.attachmentUploader.uploadFile);
                this.state.isAttachmentBoxOpened = true;
            }
        });

        onWillStart(() => this.load());
        onWillUpdateProps((nextProps) => {
            if (nextProps.resId !== this.props.resId) {
                this.state.isLoadingAttachments = false;
                this.load(nextProps.resId);
                if (nextProps.resId === false) {
                    this.thread.composer.type = false;
                }
            }
        });
    }

    get followerButtonLabel() {
        return _t("Show Followers");
    }

    get followingText() {
        return _t("Following");
    }

    /**
     * @returns {boolean}
     */
    get isDisabled() {
        return !this.props.resId || !this.thread.hasReadAccess;
    }

    load(resId = this.props.resId, requestList = ["followers", "attachments", "messages"]) {
        const { resModel } = this.props;
        const thread = this.messaging.getChatterThread(resModel, resId);
        this.thread = thread;
        if (!resId) {
            // todo: reset activities/attachments/followers
            return;
        }
        this.state.isLoadingAttachments = requestList.includes("attachments");
        if (this.props.hasActivity && !requestList.includes("activities")) {
            requestList.push("activities");
        }
        this.messaging.fetchChatterData(resId, resModel, requestList).then((result) => {
            this.thread.hasReadAccess = result.hasReadAccess;
            this.thread.hasWriteAccess = result.hasWriteAccess;
            if ("activities" in result) {
                for (const activity of result.activities) {
                    if (activity.note) {
                        activity.note = markup(activity.note);
                    }
                }
                this.state.activities = result.activities;
            }
            if ("attachments" in result) {
                this.state.attachments = result.attachments.map((attachment) =>
                    Attachment.insert(this.messaging.state, attachment)
                );
                this.state.isLoadingAttachments = false;
            }
            if ("followers" in result) {
                for (const followerData of result.followers) {
                    Follower.insert(this.messaging.state, {
                        followedThread: this.thread,
                        ...followerData,
                    });
                }
            }
        });
    }

    onClickAddFollowers() {
        document.body.click(); // hack to close dropdown
        const action = {
            type: "ir.actions.act_window",
            res_model: "mail.wizard.invite",
            view_mode: "form",
            views: [[false, "form"]],
            name: _t("Invite Follower"),
            target: "new",
            context: {
                default_res_model: this.props.resModel,
                default_res_id: this.props.resId,
            },
        };
        this.env.services.action.doAction(action, {
            onClose: () => this.onFollowerChanged(),
        });
    }

    onClickDetails(ev, follower) {
        this.messaging.openDocument({ id: follower.partner.id, model: "res.partner" });
        document.body.click(); // hack to close dropdown
    }

    /**
     * @param {MouseEvent} ev
     * @param {import("@mail/new/core/follower_model").Follower} follower
     */
    async onClickEdit(ev, follower) {
        this.env.services.dialog.add(FollowerSubtypeDialog, {
            follower,
            onFollowerChanged: () => this.onFollowerChanged(),
        });
        document.body.click(); // hack to close dropdown
    }

    async onClickFollow() {
        await this.orm.call(this.props.resModel, "message_subscribe", [[this.props.resId]], {
            partner_ids: [this.messaging.state.user.partnerId],
        });
        this.onFollowerChanged();
    }

    /**
     * @param {MouseEvent} ev
     * @param {import("@mail/new/core/follower_model").Follower} follower
     */
    async onClickRemove(ev, follower) {
        await this.messaging.removeFollower(follower);
        this.onFollowerChanged();
        document.body.click(); // hack to close dropdown
    }

    async onClickUnfollow() {
        await this.messaging.removeFollower(this.thread.followerOfCurrentUser);
        this.onFollowerChanged();
    }

    onFollowerChanged() {
        // TODO reload parent view (message_follower_ids / hasParentReloadOnFollowersUpdate)
        this.load(this.props.resId, ["followers", "suggestedRecipients"]);
    }

    toggleComposer(mode = false) {
        if (this.thread.composer.type === mode) {
            this.thread.composer.type = false;
        } else {
            this.thread.composer.type = mode;
        }
    }

    toggleActivities() {
        this.state.showActivities = !this.state.showActivities;
    }

    async scheduleActivity() {
        await this.activity.scheduleActivity(this.props.resModel, this.props.resId);
        this.load(this.props.resId, ["activities"]);
    }

    get unfollowText() {
        return _t("Unfollow");
    }

    async unlinkAttachment(attachment) {
        await this.attachmentUploader.unlink(attachment);
        removeFromArrayWithPredicate(this.state.attachments, ({ id }) => attachment.id === id);
    }
}
