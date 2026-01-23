import { EventBus } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";

const STATE = Object.freeze({
    INIT: "INIT",
    MASTER: "MASTER",
    REGISTERED: "REGISTERED",
    UNREGISTERED: "UNREGISTERED",
});

export const multiTabSharedWorkerService = {
    dependencies: ["worker_service"],
    start(env, { worker_service: workerService }) {
        const bus = new EventBus();
        let state = STATE.INIT;
        browser.addEventListener("pagehide", unregister);
        const workerClient = workerService.get("ELECTION");
        workerClient.subscribe("HEARTBEAT_REQUEST", () => workerClient.send("HEARTBEAT"));
        workerClient.subscribe("ASSIGN_MASTER", () => {
            state = STATE.MASTER;
            bus.trigger("become_main_tab");
        });
        workerClient.subscribe("UNASSIGN_MASTER", () => {
            if (state !== STATE.UNREGISTERED) {
                state = STATE.REGISTERED;
            }
            bus.trigger("no_longer_main_tab");
        });

        async function startWorker() {
            await workerClient.ensureStarted();
            workerClient.send("REGISTER");
            state = STATE.REGISTERED;
        }

        function unregister() {
            workerClient.send("UNREGISTER");
            state = STATE.UNREGISTERED;
        }

        return {
            bus,
            isOnMainTab: async () => {
                if (state === STATE.UNREGISTERED) {
                    return false;
                }
                if (state === STATE.INIT) {
                    await startWorker();
                }
                return workerClient.send("IS_MASTER?");
            },
            unregister,
        };
    },
};
