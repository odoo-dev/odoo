import { AWAY_DELAY } from "@bus/im_status_service";
import { registry } from "@web/core/registry";

export const userInactivity = {
    dependencies: ["action", "presence"],
    start(env, { action, presence }) {
        let inactivityTimer;

        const startInactivityTimer = () => {
            inactivityTimer = setTimeout(async () => {
                // Empty the current view, to not let any confidential data displayed
                // not even inspecting the dom or through the console using Javascript.
                env.bus.trigger("ACTION_MANAGER:UPDATE", {});
                // Display the check identity dialog
                await env.services.check_identity.run(["password"]);
                // Reload the view to display back the data that was displayed before.
                action.doAction("soft_reload");
                startInactivityTimer();
            }, AWAY_DELAY);
        }

        presence.bus.addEventListener("presence", () => {
            if (!env.services.check_identity._promise){
                clearTimeout(inactivityTimer);
                startInactivityTimer();
            }
        });

        startInactivityTimer();

    }
}

registry.category("services").add("user_inactivity", userInactivity);
