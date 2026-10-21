import { Component, usePlugin } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { LessonRecoveryPlugin } from "../services/lesson_recovery_plugin";
import { LessonRunnerPlugin } from "../services/lesson_runner_plugin";

/**
 * The learning bar's help state: shown when the learner says they are lost,
 * or when the lesson notices it. Big buttons, from light to strong help.
 */
export class RecoveryPanel extends Component {
    static template = "learning.RecoveryPanel";

    setup() {
        this.runner = usePlugin(LessonRunnerPlugin);
        this.recovery = usePlugin(LessonRecoveryPlugin);
    }

    get message() {
        if (this.runner.state.stuck === "invalid") {
            return _t("A field in red is missing or wrong, so Odoo cannot save. Fill it in, or let me take you back.");
        }
        if (this.runner.state.stuck === "window") {
            return _t("A window is open on top of the lesson. Close it to continue.");
        }
        if (this.runner.state.stuck === "lost") {
            return _t("I can't find the next step on this screen. Do you need help?");
        }
        return _t("No problem. How can I help?");
    }
}
