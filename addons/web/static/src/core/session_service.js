import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";

export const lazySession = {
    start(env) {
        let config = null;
        let resolve = null;
        let allowCall = false;
        const lazyConfigPromise = new Promise((r) => (resolve = r));
        const clientReadyListener = async () => {
            if (allowCall) {
                config = await rpc("/web/session/lazy_session_info");
                resolve();
            }
            env.bus.removeEventListener("WEB_CLIENT_READY", clientReadyListener);
        };
        env.bus.addEventListener("WEB_CLIENT_READY", clientReadyListener);
        return {
            getValue(key) {
                allowCall = true;
                return lazyConfigPromise.then(() => config[key]);
            },
        };
    },
};

registry.category("services").add("lazySession", lazySession);
