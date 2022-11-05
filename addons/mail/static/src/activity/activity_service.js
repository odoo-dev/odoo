/** @odoo-module */

import { reactive } from "@odoo/owl";
import { registry } from "@web/core/registry";

export const activityService = {
    dependencies: ["orm", "action"],
    start(env, { orm, action }) {
        const state = reactive({
            counter: 0,
            activities: [],
        });

        // not waiting for this on purpose: we do not want to delay the web client
        orm.call("res.users", "systray_get_activities").then((activities) => {
            let total = 0;
            for (const activity of activities) {
                total += activity.total_count;
            }
            state.counter = total;
            state.activities = activities;
        });

        async function scheduleActivity(resModel, resId, activityId = false) {
            const context = {
                default_res_model: resModel,
                default_res_id: resId,
            };
            return new Promise((resolve) => {
                action.doAction(
                    {
                        type: "ir.actions.act_window",
                        name: env._t("Schedule Activity"),
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

        return {
            state,
            scheduleActivity,
        };
    },
};

registry.category("services").add("mail.activity", activityService);
