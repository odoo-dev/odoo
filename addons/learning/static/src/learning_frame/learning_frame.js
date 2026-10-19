import { Component, usePlugin, useEffect } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { LearningModePlugin } from "../services/learning_mode_plugin";

/**
 * Thin amber frame around the whole screen while learning mode is on, like
 * a "recording" light: always visible, never in the way.
 */
export class LearningFrame extends Component {
    static template = "learning.LearningFrame";

    setup() {
        this.learning = usePlugin(LearningModePlugin);
        useEffect(() => {
            document.body.classList.toggle("o_learning_mode", this.learning.active());
        });
    }
}

registry.category("main_components").add("learning.LearningFrame", { Component: LearningFrame });
