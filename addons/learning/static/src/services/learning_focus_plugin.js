import { Plugin, proxy, signal, usePlugin } from "@odoo/owl";
import { ORM } from "@web/core/orm_plugin";
import { services } from "@web/core/services";
import { isFieldInFocus, pickTopImportant } from "../focus/focus_rule";
import { LearningModePlugin } from "./learning_mode_plugin";
import { LessonRunnerPlugin } from "./lesson_runner_plugin";

/**
 * Focus mode: in learning mode, form fields the learner does not need yet
 * are dimmed. See `focus_rule.js` for the rule itself.
 */
export class LearningFocusPlugin extends Plugin {
    orm = usePlugin(ORM);
    learning = usePlugin(LearningModePlugin);
    runner = usePlugin(LessonRunnerPlugin);

    /** The learner chose to see every field. */
    showAll = signal(false);
    /** Form views on screen (pages and windows): the only places fields are dimmed. */
    openForms = signal(0);
    /** Importance scores per model, missing while loading. */
    profiles = proxy({});
    /** Models whose profile was requested (not reactive: only read to avoid double fetches). */
    requested = new Set();

    isEnabled() {
        return this.learning.active() && !this.showAll();
    }

    getProfile(resModel) {
        if (!this.requested.has(resModel)) {
            this.requested.add(resModel);
            this.orm
                .call("learning.importance", "get_focus_profile", [resModel])
                .then((profile) => (this.profiles[resModel] = profile));
        }
        return this.profiles[resModel];
    }

    /** Field names the current lesson and step point at. */
    getTargets() {
        const lesson = this.runner.state.status === "running" && this.runner.lesson();
        if (!lesson) {
            return new Set();
        }
        return new Set([...(lesson.focus || []), ...(this.runner.step()?.focus || [])]);
    }

    /**
     * @param {Object} record a relational model record
     * @param {{name: string, required: boolean, empty: boolean, invalid: boolean}} field
     */
    isInFocus(record, field) {
        const profile = this.getProfile(record.resModel);
        if (!profile) {
            return true; // never dim before knowing what matters
        }
        const prefix = `${record.resModel}.`;
        const learnedFields = new Set(
            [...this.learning.learnedFields()]
                .filter((name) => name.startsWith(prefix))
                .map((name) => name.slice(prefix.length))
        );
        const topImportant = pickTopImportant({
            profile,
            fields: record.fields,
            learnedTypes: this.learning.learnedTypes(),
            learnedFields,
            cap: this.learning.focusCap(),
        });
        return isFieldInFocus(field, { targets: this.getTargets(), topImportant });
    }
}

services.add(LearningFocusPlugin);
