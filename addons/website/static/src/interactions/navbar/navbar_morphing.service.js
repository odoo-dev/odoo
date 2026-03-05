/** @odoo-module **/
import { registry } from "@web/core/registry";
import { NavbarMorphingController } from "./navbar_morphing.controller";

const NavbarMorphingService = {
    start(env) {
        let controller = null;

        return {
            open(anchor, menuElement, navbarEl) {
                if (!controller) {
                    // Initialize controller with the navbar as parent
                    controller = NavbarMorphingController.get(env, navbarEl);
                }
                controller.morphTo(anchor, menuElement, navbarEl);
            },
            close() {
                // Hover-driven dismiss: ignored while the user has click-locked the panel.
                if (controller && !controller.clickLocked) controller.hide();
            },
            drillIn(subMenuEl, label) {
                if (controller) controller.drillIn(subMenuEl, label);
            },
            drillBack() {
                if (controller) controller.drillBack();
            },
            lockClick() {
                if (controller) controller.lockClick();
            },
        };
    },
};
registry.category("services").add("navbar_morphing_service", NavbarMorphingService);