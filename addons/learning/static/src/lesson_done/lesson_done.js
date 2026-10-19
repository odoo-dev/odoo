import { Component, usePlugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";
import { KeyMomentCard } from "../key_moment_card/key_moment_card";
import { getLessons } from "../lessons/lesson_registry";
import { LearningModePlugin } from "../services/learning_mode_plugin";
import { LessonRunnerPlugin } from "../services/lesson_runner_plugin";

/** Celebrates a finished lesson and suggests the next one. */
export class LessonDone extends Component {
    static template = "learning.LessonDone";
    static components = { KeyMomentCard };

    setup() {
        this.runner = usePlugin(LessonRunnerPlugin);
        this.learning = usePlugin(LearningModePlugin);
        this.action = usePlugin(ActionPlugin);
    }

    get nextLesson() {
        const done = this.learning.doneLessons();
        return getLessons().find((lesson) => !done.has(lesson.key));
    }

    startNext() {
        this.runner.open(this.nextLesson.key);
    }

    openMap() {
        this.runner.close();
        this.action.doAction("learning.learning_map_action");
    }
}

registry.category("main_components").add("learning.LessonDone", { Component: LessonDone });
