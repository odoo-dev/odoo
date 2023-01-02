/* @odoo-module */

import { Follower } from "@mail/new/core/follower_model";
import { Activity as ActivityModel } from "@mail/new/core/activity_model";
import { Thread } from "../thread/thread";
import { useMessaging } from "../messaging_hook";
import { useDropzone } from "@mail/new/dropzone/dropzone_hook";
import { AttachmentList } from "@mail/new/thread/attachment_list";
import { Composer } from "../composer/composer";
import { Activity } from "@mail/new/activity/activity";
import {
    Component,
    markup,
    onMounted,
    onPatched,
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
import { useAttachmentUploader, useHover, useScrollPosition } from "@mail/new/utils/hooks";
import { FollowerSubtypeDialog } from "./follower_subtype_dialog";
import { Attachment } from "../core/attachment_model";
import { _t } from "@web/core/l10n/translation";

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

    /** @type {import("@mail/new/core/messaging").Messaging} */
    messaging;
    /**
     * @type {import("@mail/new/core/thread_model").Thread}
     */
    thread;

    setup() {
        this.action = useService("action");
        this.messaging = useMessaging();
        this.activity = useState(useService("mail.activity"));
        this.chatter = useState(useService("mail.chatter"));
        this.orm = useService("orm");
        this.rpc = useService("rpc");
        this.state = useState({
            attachments: [],
            showActivities: true,
            isAttachmentBoxOpened: this.props.isAttachmentBoxOpenedInitially,
            isLoadingAttachments: false,
        });
        this.unfollowHover = useHover("unfollow");
        this.attachmentUploader = useAttachmentUploader(
            this.chatter.getThread(this.props.resModel, this.props.resId)
        );
        this.scrollPosition = useScrollPosition("scrollable", undefined, "top");
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

        onMounted(this.scrollPosition.restore);
        onPatched(this.scrollPosition.restore);
        onWillStart(() => this.load(this.props.resId, ["followers", "attachments"]));
        onWillUpdateProps((nextProps) => {
            if (nextProps.resId !== this.props.resId) {
                this.state.isLoadingAttachments = false;
                this.load(nextProps.resId, ["followers", "attachments"]);
                if (nextProps.resId === false) {
                    this.thread.composer.type = false;
                }
            }
        });
    }

    /**
     * @returns {import("@mail/new/core/activity_model").Activity[]}
     */
    get activities() {
        return Object.values(this.messaging.state.activities).filter((activity) => {
            return (
                activity.res_model === this.props.resModel && activity.res_id === this.props.resId
            );
        });
    }

    get displayName() {
        return this.props.displayName ? `"${this.props.displayName}"` : "this document";
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
        const thread = this.chatter.getThread(resModel, resId);
        this.thread = thread;
        this.scrollPosition.model = this.thread.scrollPosition;
        if (!resId) {
            // todo: reset activities/attachments/followers
            return;
        }
        this.state.isLoadingAttachments = requestList.includes("attachments");
        if (this.props.hasActivity && !requestList.includes("activities")) {
            requestList.push("activities");
        }
        this.chatter.fetchData(resId, resModel, requestList).then((result) => {
            this.thread.hasReadAccess = result.hasReadAccess;
            this.thread.hasWriteAccess = result.hasWriteAccess;
            if ("activities" in result) {
                const existingIds = new Set();
                for (const activity of result.activities) {
                    if (activity.note) {
                        activity.note = markup(activity.note);
                    }
                    existingIds.add(ActivityModel.insert(this.messaging.state, activity).id);
                }
                for (const activity of this.activities) {
                    if (!existingIds.has(activity.id)) {
                        activity.delete();
                    }
                }
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
        await this.chatter.removeFollower(follower);
        this.onFollowerChanged();
        document.body.click(); // hack to close dropdown
    }

    async onClickUnfollow() {
        await this.chatter.removeFollower(this.thread.followerOfCurrentUser);
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
        await this.activity.schedule(this.props.resModel, this.props.resId);
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
