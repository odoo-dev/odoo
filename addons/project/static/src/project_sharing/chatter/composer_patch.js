import { Composer } from "@mail/core/common/composer";
import { maybePlugin } from "@mail/utils/common/misc";
import { ProjectSharingPlugin } from "@project/project_sharing/chatter/project_sharing_plugin";
import { _t } from "@web/core/l10n/translation";

import { patch } from "@web/core/utils/patch";
import { onWillStart } from "@odoo/owl";
import { session } from "@web/session";

patch(Composer.prototype, {
    setup() {
        super.setup(...arguments);
        this.projectSharingPlugin = maybePlugin(ProjectSharingPlugin);
        onWillStart(() => {
            if (this.thread && !this.thread.id) {
                this.state.active = false;
            }
        });
    },

    get placeholder() {
        if (this.thread && this.thread.model === "project.task" && this.props.type === "message") {
            return _t("Send a message to all followers and selected contacts…");
        }
        return super.placeholder;
    },

    get extraData() {
        const extraData = super.extraData;
        const projectSharingId =
            this.projectSharingPlugin?.projectSharingId() ?? session.project_id;
        if (projectSharingId) {
            extraData.project_sharing_id = projectSharingId;
        }
        return extraData;
    },

    get isSendButtonDisabled() {
        if (this.thread && !this.thread.id) {
            return true;
        }
        return super.isSendButtonDisabled;
    },

    get allowUpload() {
        if (this.thread && !this.thread.id) {
            return false;
        }
        return super.allowUpload;
    },
});
