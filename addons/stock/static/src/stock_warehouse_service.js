import { registry } from "@web/core/registry";

registry.category("services").add("stock_warehouse", {
    start(env) {
        let isWarehouseCreated = false;
        return {
            set(value) { isWarehouseCreated = value },
            get() { return isWarehouseCreated }
        }
    },
});
