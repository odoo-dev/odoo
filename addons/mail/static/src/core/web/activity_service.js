/* @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { browser } from "@web/core/browser/browser";

export class ActivityService {
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {Partial<import("services").Services>} services
     */
    constructor(env, services) {
        try {
            // useful for synchronizing activity data between multiple tabs
            this.broadcastChannel = new browser.BroadcastChannel("mail.activity.channel");
            this.broadcastChannel.onmessage = this._onBroadcastChannelMessage.bind(this);
        } catch {
            // BroadcastChannel API is not supported (e.g. Safari < 15.4), so disabling it.
            this.broadcastChannel = null;
        }
        this.env = env;
        this.store = services["mail.store"];
        this.orm = services.orm;
    }

    /**
     * @param {import("@mail/core/web/activity_model").Activity} activity
     * @param {number[]} attachmentIds
     */
    async markAsDone(activity, attachmentIds = []) {
        await this.orm.call("mail.activity", "action_feedback", [[activity.id]], {
            attachment_ids: attachmentIds,
            feedback: activity.feedback,
        });
        this.broadcastChannel?.postMessage({
            type: "reload chatter",
            payload: { resId: activity.res_id, resModel: activity.res_model },
        });
    }

    async markAsDoneAndScheduleNext(activity) {
        const action = await this.env.services.orm.call(
            "mail.activity",
            "action_feedback_schedule_next",
            [[activity.id]],
            { feedback: activity.feedback }
        );
        this.broadcastChannel?.postMessage({
            type: "reload chatter",
            payload: { resId: activity.res_id, resModel: activity.res_model },
        });
        return action;
    }

    async schedule(resModel, resId, activityId = false, defaultActivityTypeId = undefined) {
        const context = {
            default_res_model: resModel,
            default_res_id: resId,
        };
        if (defaultActivityTypeId !== undefined) {
            context.default_activity_type_id = defaultActivityTypeId;
        }
        return new Promise((resolve) => {
            this.env.services.action.doAction(
                {
                    type: "ir.actions.act_window",
                    name: _t("Schedule Activity"),
                    res_model: "mail.activity",
                    view_mode: "form",
                    views: [[false, "form"]],
                    target: "new",
                    context,
                    res_id: activityId,
                },
                { onClose: resolve }
            );
        });
    }

    /**
     * @param {import("@mail/core/web/activity_model").Data} data
     * @param {Object} [param1]
     * @param {boolean} param1.broadcast
     * @returns {import("@mail/core/web/activity_model").Activity}
     */
    insert(data, { broadcast = true } = {}) {
        return this.store.Activity.insert(data, { broadcast });
    }

    delete(activity, { broadcast = true } = {}) {
        delete this.store.Activity.records[activity.id];
        if (broadcast) {
            this.broadcastChannel?.postMessage({ type: "delete", payload: { id: activity.id } });
        }
    }

    _onBroadcastChannelMessage({ data }) {
        switch (data.type) {
            case "insert":
                this.insert(data.payload, { broadcast: false });
                break;
            case "delete":
                this.delete(data.payload, { broadcast: false });
                break;
            case "reload chatter": {
                const thread = this.env.services["mail.thread"].getThread(
                    data.payload.resModel,
                    data.payload.resId
                );
                this.env.services["mail.thread"].fetchNewMessages(thread);
                break;
            }
        }
    }
}

export const activityService = {
    dependencies: ["mail.store", "orm"],
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {Partial<import("services").Services>} services
     */
    start(env, services) {
        return new ActivityService(env, services);
    },
};

registry.category("services").add("mail.activity", activityService);
