import { registry } from "@web/core/registry";
import { UPDATE_METHODS } from "@web/core/orm_service";
import { rpcBus } from "@web/core/network/rpc";

registry.category("services").add("stock_warehouse", {
    dependencies: ["action"],
    start(env, { action }) {
        rpcBus.addEventListener("RPC:RESPONSE", (ev) => {
            const { data, error } = ev.detail;
            const { model, method } = data.params;
            if (!error && model === "stock.warehouse") {
                if (UPDATE_METHODS.includes(method) && !localStorage.getItem("running_tour")) {
                    action.doAction("reload_context");
                }
            }
        });
    },
});
