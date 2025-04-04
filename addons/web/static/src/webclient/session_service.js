import { registry } from "@web/core/registry";
import { deepCopy } from "@web/core/utils/objects";

export const lazySession = {
    dependencies: ["orm"],
    start(env, { orm }) {
        let allParams = {};
        let webclientReady = false;
        let resolveWebClientReady;
        let lazyConfigPromise;
        const fetchServerData = async () => {
            await webClientReadyPromise;
            webclientReady = true;
            const response = orm.call("ir.http", "lazy_session_info", [[]], allParams);
            allParams = null;
            return response;
        };
        const webClientReadyPromise = new Promise((r) => (resolveWebClientReady = r));
        env.bus.addEventListener("WEB_CLIENT_READY", resolveWebClientReady);
        return {
            getValue(key, callback, params) {
                if (params) {
                    if (webclientReady) {
                        throw new Error(
                            "Web client ready, you can't call lazy session with params !"
                        );
                    }
                    allParams[key] = params;
                }
                if (!lazyConfigPromise) {
                    lazyConfigPromise = fetchServerData();
                }
                lazyConfigPromise.then((config) => callback(deepCopy(config)[key]));
            },
            rpcDone: () => webclientReady,
        };
    },
};

registry.category("services").add("lazy_session", lazySession);
