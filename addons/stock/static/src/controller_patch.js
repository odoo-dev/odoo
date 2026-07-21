import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";
import { ListController } from "@web/views/list/list_controller";

function patchWithStockWarehouse(Controller) {
    patch(Controller.prototype, {
        setup() {
            super.setup(...arguments);
            this.stockWarehouse = useService("stock_warehouse");
            this.actionService = useService("action")
        },

        async beforeLeave(...args) {
            const res = await super.beforeLeave(...args);
            if (this.stockWarehouse.get()) {
                this.stockWarehouse.set(false)
                this.actionService.doAction("reload_context");
            }
            return res;
        },
    });
}

patchWithStockWarehouse(FormController);
patchWithStockWarehouse(ListController);
