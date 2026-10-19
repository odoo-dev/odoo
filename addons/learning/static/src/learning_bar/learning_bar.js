import { Component, usePlugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { UIPlugin } from "@web/core/ui/ui_plugin";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";
import { RecoveryPanel } from "../recovery_panel/recovery_panel";
import { LearningFocusPlugin } from "../services/learning_focus_plugin";
import { LearningModePlugin } from "../services/learning_mode_plugin";
import { LessonRecoveryPlugin } from "../services/lesson_recovery_plugin";
import { LessonRunnerPlugin } from "../services/lesson_runner_plugin";

/**
 * Bar at the bottom of the screen in learning mode: the current instruction,
 * the lesson's progress, and help one click away.
 */
export class LearningBar extends Component {
    static template = "learning.LearningBar";
    static components = { RecoveryPanel };

    setup() {
        this.learning = usePlugin(LearningModePlugin);
        this.runner = usePlugin(LessonRunnerPlugin);
        this.recovery = usePlugin(LessonRecoveryPlugin);
        this.focus = usePlugin(LearningFocusPlugin);
        this.ui = usePlugin(UIPlugin);
        this.action = usePlugin(ActionPlugin);
    }

    get running() {
        return this.runner.state.status === "running";
    }

    get showHelp() {
        return this.running && (this.recovery.helpOpen() || Boolean(this.runner.state.stuck));
    }

    get dots() {
        const current = this.runner.stepNumber();
        return Array.from({ length: this.runner.stepCount() }, (_, i) =>
            i < current ? "done" : i === current ? "current" : "todo"
        );
    }

    openMap() {
        this.action.doAction("learning.learning_map_action");
    }
}

registry.category("main_components").add("learning.LearningBar", { Component: LearningBar });
