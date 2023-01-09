/** @odoo-module */

import { Activity } from "@mail/new/core/activity_model";
import { _t } from "@web/core/l10n/translation";

export class ActivityService {
    constructor(env, store, orm) {
        this.env = env;
        /** @type {import("@mail/new/core/store_service").Store} */
        this.store = store;
        this.orm = orm;
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

    /**
     * @param {import("@mail/new/core/activity_model").Data} data
     * @returns {import("@mail/new/core/activity_model").Activity}
     */
    insert(data) {
        const activity = this.store.activities[data.id] ?? new Activity(this.store, data);
        this.update(activity, data);
        return activity;
    }

    /**
     * @param {import("@mail/new/core/activity_model").Data} data
     */
    update(activity, data) {
        const {
            activity_category = activity.activity_category,
            activity_type_id = activity.activity_type_id,
            activity_decoration = activity.activity_decoration,
            can_write = activity.can_write,
            chaining_type = activity.chaining_type,
            create_date = activity.create_date,
            create_uid = activity.create_uid,
            date_deadline = activity.date_deadline,
            display_name = activity.display_name,
            has_recommended_activities = activity.has_recommended_activities,
            icon = activity.icon,
            mail_template_ids = activity.mail_template_ids,
            note = activity.note,
            previous_activity_type_id = activity.previous_activity_type_id,
            recommended_activity_type_id = activity.recommended_activity_type_id,
            res_model = activity.res_model,
            res_model_id = activity.res_model_id,
            res_id = activity.res_id,
            res_name = activity.res_name,
            request_partner_id = activity.request_partner_id,
            state = activity.state,
            summary = activity.summary,
            user_id = activity.user_id,
            write_date = activity.write_date,
            write_uid = activity.write_uid,
        } = data;
        Object.assign(activity, {
            activity_category,
            activity_type_id,
            activity_decoration,
            can_write,
            chaining_type,
            create_date,
            create_uid,
            date_deadline,
            display_name,
            has_recommended_activities,
            icon,
            mail_template_ids,
            note,
            previous_activity_type_id,
            recommended_activity_type_id,
            res_model,
            res_model_id,
            res_id,
            res_name,
            request_partner_id,
            state,
            summary,
            user_id,
            write_date,
            write_uid,
        });
    }

    delete(activity) {
        delete this.store.activities[activity.id];
    }
}

export const activityService = {
    dependencies: ["mail.store", "orm"],
    start(env, { "mail.store": store, orm }) {
        return new ActivityService(env, store, orm);
    },
};
