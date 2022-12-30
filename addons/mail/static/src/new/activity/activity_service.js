/** @odoo-module */

import { _t } from "@web/core/l10n/translation";

export class ActivityService {
    constructor(env, state, orm) {
        this.env = env;
        this.state = state;
        this.orm = orm;
        Object.assign(this.state, {
            /** @type {Object.<number, import("@mail/new/core/activity_model").Activity>} */
            activities: {},
            activityCounter: 0,
        });
    }

    /**
     * @param {import("@mail/new/core/activity_model").Activity} activity
     * @param {number[]} attachmentIds
     */
    async markAsDone(activity, attachmentIds = []) {
        await this.orm.call("mail.activity", "action_feedback", [[activity.id]], {
            attachment_ids: attachmentIds,
            feedback: activity.feedback,
        });
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
}

export const activityService = {
    dependencies: ["mail.state", "orm"],
    start(env, { "mail.state": state, orm }) {
        return new ActivityService(env, state, orm);
    },
};
