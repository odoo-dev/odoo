/* @odoo-module */

import { Thread } from "../core_ui/thread";
import { useMessaging, useStore } from "../core/messaging_hook";
import { useDropzone } from "@mail/new/dropzone/dropzone_hook";
import { AttachmentList } from "@mail/new/attachments/attachment_list";
import { Composer } from "../composer/composer";
import { Activity } from "@mail/new/web/activity/activity";
import {
    Component,
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
import { useAttachmentUploader } from "@mail/new/attachments/attachment_uploader_hook";
import { useHover, useScrollPosition } from "@mail/new/utils/hooks";
import { FollowerSubtypeDialog } from "./follower_subtype_dialog";
import { _t } from "@web/core/l10n/translation";
import { SuggestedRecipientsList } from "./suggested_recipient_list";

/**
 * @typedef {Object} Props
 * @property {function} [close]
 * @extends {Component<Props, Env>}
 */
export class Chatter extends Component {
    static template = "mail.chatter";
    static components = {
        AttachmentList,
        Dropdown,
        Thread,
        Composer,
        Activity,
        FileUploader,
        SuggestedRecipientsList,
    };
    static props = [
        "close?",
        "compactHeight?",
        "displayName?",
        "hasActivities?",
        "hasExternalBorder?",
        "hasFollowers?",
        "hasMessageList?",
        "hasMessageListScrollAdjust?",
        "hasParentReloadOnAttachmentsChanged?",
        "hasParentReloadOnFollowersUpdate?",
        "hasParentReloadOnMessagePosted?",
        "isAttachmentBoxVisibleInitially?",
        "isInFormSheetBg?",
        "threadId?",
        "threadModel",
        "webRecord?",
        "saveRecord?",
    ];
    static defaultProps = {
        compactHeight: false,
        hasActivities: true,
        hasExternalBorder: true,
        hasFollowers: true,
        hasMessageList: true,
        hasMessageListScrollAdjust: false,
        hasParentReloadOnAttachmentsChanged: false,
        hasParentReloadOnFollowersUpdate: false,
        hasParentReloadOnMessagePosted: false,
        isAttachmentBoxVisibleInitially: false,
        isInFormSheetBg: true,
        threadId: false,
    };

    setup() {
        this.action = useService("action");
        this.messaging = useMessaging();
        /** @type {import("@mail/new/activity/activity_service").ActivityService} */
        this.activityService = useState(useService("mail.activity"));
        /** @type {import("@mail/new/core/thread_service").ThreadService} */
        this.threadService = useService("mail.thread");
        this.store = useStore();
        this.orm = useService("orm");
        this.rpc = useService("rpc");
        this.state = useState({
            isAttachmentBoxOpened: this.props.isAttachmentBoxVisibleInitially,
            showActivities: true,
            /** @type {import("@mail/new/core/thread_model").Thread} */
            thread: undefined,
        });
        this.unfollowHover = useHover("unfollow");
        this.attachmentUploader = useAttachmentUploader(
            this.threadService.getThread(this.props.threadModel, this.props.threadId)
        );
        this.scrollPosition = useScrollPosition("scrollable", undefined, "top");
        this.rootRef = useRef("root");
        useChildSubEnv({
            inChatter: true,
        });
        useDropzone(this.rootRef, (ev) => {
            if (this.state.thread.composer.type) {
                return;
            }
            if (isDragSourceExternalFile(ev.dataTransfer)) {
                [...ev.dataTransfer.files].forEach(this.attachmentUploader.uploadFile);
                this.state.isAttachmentBoxOpened = true;
            }
        });

        onMounted(this.scrollPosition.restore);
        onPatched(this.scrollPosition.restore);
        onWillStart(() => {
            if (this.props.threadId) {
                this.state.thread = this.threadService.insert({
                    id: this.props.threadId,
                    model: this.props.threadModel,
                    name: this.props.displayName || undefined,
                });
            }
            return this.load(this.props.threadId, [
                "followers",
                "attachments",
                "suggestedRecipients",
            ]);
        });
        onWillUpdateProps((nextProps) => {
            this.load(nextProps.threadId, ["followers", "attachments", "suggestedRecipients"]);
            if (nextProps.threadId === false) {
                this.state.thread.composer.type = false;
            }
            if (this.onNextUpdate) {
                this.onNextUpdate(nextProps);
                this.onNextUpdate = null;
            }
        });
    }

    /**
     * @returns {import("@mail/new/web/activity/activity_model").Activity[]}
     */
    get activities() {
        return this.state.thread.activities;
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
        return !this.props.threadId || !this.state.thread.hasReadAccess;
    }

    get attachments() {
        return this.state.thread?.attachments ?? [];
    }

    /**
     * @param {number} threadId
     * @param {['activities'|'followers'|'attachments'|'messages'|'suggestedRecipients']} requestList
     */
    load(
        threadId = this.props.threadId,
        requestList = ["followers", "attachments", "messages", "suggestedRecipients"]
    ) {
        const { threadModel } = this.props;
        this.state.thread = this.threadService.getThread(threadModel, threadId);
        this.scrollPosition.model = this.state.thread.scrollPosition;
        if (!threadId) {
            return;
        }
        if (this.props.hasActivities && !requestList.includes("activities")) {
            requestList.push("activities");
        }
        this.threadService.fetchData(this.state.thread, requestList);
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
                default_res_model: this.props.threadModel,
                default_res_id: this.props.threadId,
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
        await this.orm.call(this.props.threadModel, "message_subscribe", [[this.props.threadId]], {
            partner_ids: [this.store.self.id],
        });
        this.onFollowerChanged();
    }

    /**
     * @param {MouseEvent} ev
     * @param {import("@mail/new/core/follower_model").Follower} follower
     */
    async onClickRemove(ev, follower) {
        await this.threadService.removeFollower(follower);
        this.onFollowerChanged();
        document.body.click(); // hack to close dropdown
    }

    async onClickUnfollow() {
        await this.threadService.removeFollower(this.state.thread.followerOfSelf);
        this.onFollowerChanged();
    }

    onFollowerChanged() {
        // TODO condition to reload parent view (message_follower_ids / hasParentReloadOnFollowersUpdate)
        this.reloadParentView();
        this.load(this.props.threadId, ["followers", "suggestedRecipients"]);
    }

    onPostCallback() {
        if (this.props.hasParentReloadOnMessagePosted) {
            this.reloadParentView();
        }
        this.toggleComposer();
        // Load new messages to fetch potential new messages from other users (useful due to lack of auto-sync in chatter).
        this.load(this.props.threadId, ["followers", "messages", "suggestedRecipients"]);
    }

    async reloadParentView() {
        if (this.props.webRecord) {
            await this.props.webRecord.model.root.load(
                { resId: this.props.threadId },
                { keepChanges: true }
            );
            this.props.webRecord.model.notify();
        }
    }

    toggleComposer(mode = false) {
        const toggle = () => {
            if (this.state.thread.composer.type === mode) {
                this.state.thread.composer.type = false;
            } else {
                this.state.thread.composer.type = mode;
            }
        };
        if (this.props.threadId) {
            toggle();
        } else {
            this.onNextUpdate = (nextProps) => {
                // if there is no threadId, the save operation probably failed
                // probably because some required field is not set
                if (nextProps.threadId) {
                    toggle();
                }
            };
            if (this.props.saveRecord) {
                this.props.saveRecord();
            }
        }
    }

    toggleActivities() {
        this.state.showActivities = !this.state.showActivities;
    }

    async scheduleActivity() {
        await this.activityService.schedule(this.props.threadModel, this.props.threadId);
        this.load(this.props.threadId, ["activities"]);
    }

    get unfollowText() {
        return _t("Unfollow");
    }

    async unlinkAttachment(attachment) {
        await this.attachmentUploader.unlink(attachment);
    }

    onUploaded(data) {
        this.attachmentUploader.uploadData(data);
        this.state.isAttachmentBoxOpened = true;
        this.scrollPosition.ref.el.scrollTop = 0;
    }

    onClickAddAttachments() {
        if (this.attachments.length === 0) {
            return;
        }
        this.state.isAttachmentBoxOpened = !this.state.isAttachmentBoxOpened;
        this.scrollPosition.ref.el.scrollTop = 0;
    }
}
