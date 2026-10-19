import { Component, usePlugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { KeyMomentCard } from "../key_moment_card/key_moment_card";
import { LessonRecoveryPlugin } from "../services/lesson_recovery_plugin";
import { LessonRunnerPlugin } from "../services/lesson_runner_plugin";

/** Tells what the lesson is about before it starts. */
export class LessonIntro extends Component {
    static template = "learning.LessonIntro";
    static components = { KeyMomentCard };

    setup() {
        this.runner = usePlugin(LessonRunnerPlugin);
        this.recovery = usePlugin(LessonRecoveryPlugin);
    }

    async start() {
        await this.runner.begin();
    }

    async startWithDemo() {
        await this.runner.begin();
        await this.recovery.showMe();
    }
}

registry.category("main_components").add("learning.LessonIntro", { Component: LessonIntro });
