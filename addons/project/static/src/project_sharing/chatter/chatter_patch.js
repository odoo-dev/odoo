import { Chatter } from "@mail/chatter/web_portal_project/chatter";
import { RecipientsInput } from "@mail/core/web/recipients_input";
import { ProjectSharingPlugin } from "@project/project_sharing/chatter/project_sharing_plugin";

import { plugin, props, providePlugins, t, useEffect } from "@odoo/owl";

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";

Object.assign(Chatter.components, { RecipientsInput });

patch(Chatter.prototype, {
    setup() {
        super.setup(...arguments);
        this.projectSharingProps = props({
            displayFollowButton: t.boolean().optional(false),
            isFollower: t.boolean().optional(false),
            projectSharingId: t.number().optional(),
        });
        Object.assign(this.state, {
            isFollower: this.projectSharingProps.isFollower,
        });
        this.orm = useService("orm");
        providePlugins([ProjectSharingPlugin]);
        this.projectSharingPlugin = plugin(ProjectSharingPlugin);
        useEffect(
            () => {
                this.projectSharingPlugin.projectSharingId.set(
                    this.projectSharingProps.projectSharingId ?? session.project_id
                );
            },
            () => [this.projectSharingProps.projectSharingId, session.project_id]
        );
    },

    get requestList() {
        return ["followers", "suggestedRecipients"];
    },

    get afterPostRequestList() {
        return ["messages", "followers", "suggestedRecipients"];
    },

    async toggleIsFollower() {
        this.state.isFollower = await this.orm.call(
            this.thread().model,
            "project_sharing_toggle_is_follower",
            [this.thread().id]
        );
    },

    onPostCallback() {
        super.onPostCallback();
        this.state.isFollower = true;
    },
});
