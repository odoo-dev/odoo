import { registry } from "@web/core/registry";

export const lazySession = {
    dependencies: ["orm"],
    start(env, { orm }) {
        let config = null;
        let resolve = null;
        let allowCall = false;
        const lazyConfigPromise = new Promise((r) => (resolve = r));
        const clientReadyListener = async () => {
            if (allowCall) {
                config = await orm.call("ir.http", "lazy_session_info", [[]]);
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
