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

        return Promise.race([
            originalRpc.call(this, route, params, settings),
            new Promise((_, reject) =>
                setTimeout(() => reject(new ConnectionLostError()), timeout)
            ),
        ]);
    };

    orm.__timeoutPatched = true;
    return orm;
}
