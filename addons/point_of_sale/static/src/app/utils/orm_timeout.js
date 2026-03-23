import { ConnectionLostError } from "@web/core/network/rpc";

export function applyOrmTimeout(orm) {
    if (orm.__timeoutPatched) {
        return orm;
    }

    const originalRpc = orm.rpc;

    orm.rpc = async function (route, params = {}, settings = {}) {
        const kwargs = params.kwargs ?? {};
        const { timeout, ...cleanKwargs } = kwargs;

        params.kwargs = cleanKwargs;

        if (!timeout) {
            return originalRpc.call(this, route, params, settings);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const xhr = new XMLHttpRequest();

        controller.signal.addEventListener("abort", () => {
            xhr.abort();
        });

        try {
            const finalSettings = {
                ...settings,
                xhr,
            };

            // cache
            // - Avoid duplicate RPC calls
            // - Avoid duplicate RPC calls
            // - Reuse previous results

            // It conflicts with xhr because:
            // cache = shared request
            // abort = individual control
            delete finalSettings.cache;

            return await originalRpc.call(this, route, params, finalSettings);
        } catch (err) {
            if (err.name === "AbortError") {
                throw new ConnectionLostError();
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    };

    orm.__timeoutPatched = true;
    return orm;
}
