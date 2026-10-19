import { Component, usePlugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { KeyMomentCard } from "../key_moment_card/key_moment_card";
import { LearningModePlugin } from "../services/learning_mode_plugin";

/** Offered once, on a new user's first login. */
export class WelcomeOffer extends Component {
    static template = "learning.WelcomeOffer";
    static components = { KeyMomentCard };

    setup() {
        this.learning = usePlugin(LearningModePlugin);
    }
}

registry.category("main_components").add("learning.WelcomeOffer", { Component: WelcomeOffer });
