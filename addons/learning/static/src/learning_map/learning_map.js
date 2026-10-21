import { Component, onWillStart, usePlugin, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { standardActionServiceProps } from "@web/webclient/actions/action_plugin";
import { getLessons } from "../lessons/lesson_registry";
import { LearningModePlugin } from "../services/learning_mode_plugin";
import { LessonRunnerPlugin } from "../services/lesson_runner_plugin";

const LEVEL_NAMES = {
    A: _t("The basics"),
    B: _t("Your contacts"),
    C: _t("Your products"),
    D: _t("Working with documents"),
};

/**
 * Full page showing the learning path: what is done, what comes next, and
 * every lesson ready to be (re)played.
 */
export class LearningMap extends Component {
    static template = "learning.LearningMap";
    props = useProps(standardActionServiceProps);

    setup() {
        this.learning = usePlugin(LearningModePlugin);
        this.runner = usePlugin(LessonRunnerPlugin);
        onWillStart(() => this.learning.loadProgress());
    }

    get levels() {
        const levels = {};
        for (const lesson of getLessons()) {
            levels[lesson.level] ??= { key: lesson.level, name: LEVEL_NAMES[lesson.level] || lesson.level, lessons: [] };
            levels[lesson.level].lessons.push(lesson);
        }
        return Object.values(levels);
    }

    get nextLessonKey() {
        const done = this.learning.doneLessons();
        return getLessons().find((lesson) => !done.has(lesson.key))?.key;
    }

    isDone(lesson) {
        return this.learning.doneLessons().has(lesson.key);
    }
}

registry.category("actions").add("learning.map", LearningMap);
