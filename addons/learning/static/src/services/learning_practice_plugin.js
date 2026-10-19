import { Plugin, proxy, usePlugin } from "@odoo/owl";
import { ORM } from "@web/core/orm_plugin";
import { services } from "@web/core/services";
import { LearningModePlugin } from "./learning_mode_plugin";

/**
 * Knows which real records are practice records, so they can be labelled.
 */
export class LearningPracticePlugin extends Plugin {
    orm = usePlugin(ORM);
    learning = usePlugin(LearningModePlugin);

    /** Practice record ids per model, missing while loading. */
    practiceIds = proxy({});
    requested = new Set();

    isPractice(resModel, resId) {
        if (!this.learning.active() || !resId) {
            return false;
        }
        if (!this.requested.has(resModel)) {
            this.load(resModel);
        }
        return Boolean(this.practiceIds[resModel]?.includes(resId));
    }

    /** Reloads the practice ids of a model, e.g. after a lesson created some. */
    async load(resModel) {
        this.requested.add(resModel);
        this.practiceIds[resModel] = await this.orm.call(
            "learning.practice.record",
            "get_practice_ids",
            [resModel]
        );
    }
}

services.add(LearningPracticePlugin);
