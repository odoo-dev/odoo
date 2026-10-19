import { computed, onWillStart, Plugin, signal, usePlugin } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { NotificationPlugin } from "@web/core/notifications/notification_plugin";
import { ORM } from "@web/core/orm_plugin";
import { services } from "@web/core/services";
import { session } from "@web/session";
import { getLesson } from "../lessons/lesson_registry";

/** Where the lesson being played is kept between page loads (see LessonRunnerPlugin). */
export const CURRENT_LESSON_KEY = "learning.current";

/**
 * Whether the user is in learning mode, and what they learned so far.
 */
export class LearningModePlugin extends Plugin {
    orm = usePlugin(ORM);
    notification = usePlugin(NotificationPlugin);

    active = signal(Boolean(session.learning_mode));
    offerPending = signal(Boolean(session.learning_offer_pending) && !session.learning_mode);
    progress = signal({ done: [], running: {} });

    doneLessons = computed(() => new Set(this.progress().done));

    /** Field types the learner masters (e.g. "char"), from finished lessons. */
    learnedTypes = computed(() => this.collectTaught("types"));

    /** Specific "model.field" the learner met in finished lessons. */
    learnedFields = computed(() => this.collectTaught("fields"));

    /** How many "important and known" fields focus mode shows: grows lesson after lesson. */
    focusCap = computed(() => 1 + this.progress().done.length);

    setup() {
        onWillStart(() => this.active() && this.loadProgress());
    }

    collectTaught(kind) {
        const taught = new Set();
        for (const key of this.progress().done) {
            for (const item of getLesson(key)?.teaches?.[kind] || []) {
                taught.add(item);
            }
        }
        return taught;
    }

    async loadProgress() {
        this.progress.set(await this.orm.call("learning.progress", "get_state", []));
    }

    /**
     * Turning learning mode on or off changes menus: reload the web client.
     * Turning it off leaves the learning screens for the home page.
     */
    async setActive(value) {
        await this.orm.call("res.users", "switch_learning_mode", [value]);
        if (value) {
            browser.location.reload();
        } else {
            browser.localStorage.removeItem(CURRENT_LESSON_KEY);
            browser.location.assign("/odoo");
        }
    }

    async dismissOffer() {
        this.offerPending.set(false);
        await this.orm.call("res.users", "dismiss_learning_offer", []);
    }

    /** @returns {Promise<string>} the server time, used to find records created since */
    async markCheckpoint(lessonKey, checkpointKey) {
        return this.orm.call("learning.progress", "checkpoint", [lessonKey, checkpointKey]);
    }

    async completeLesson(lessonKey) {
        await this.orm.call("learning.progress", "complete", [lessonKey]);
        await this.loadProgress();
    }

    async cleanupPractice() {
        const count = await this.orm.call("learning.practice.record", "cleanup", []);
        if (count) {
            const message =
                count === 1
                    ? _t("1 practice record was removed. Your real data was not touched.")
                    : _t("%s practice records were removed. Your real data was not touched.", count);
            this.notification.add(message, { type: "success" });
        } else {
            this.notification.add(_t("You have no practice data left."), { type: "info" });
        }
    }
}

services.add(LearningModePlugin);
