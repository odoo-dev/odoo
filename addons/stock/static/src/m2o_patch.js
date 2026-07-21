import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { Many2XAutocomplete } from "@web/views/fields/relational_utils";

patch(Many2XAutocomplete.prototype, {
    setup() {
        super.setup(...arguments);
        this.stockWarehouse = useService("stock_warehouse");
    },

    slowCreate(...args) {
        if (this.props.resModel === "stock.warehouse") {
            this.stockWarehouse.set(true);
        }
        return super.slowCreate(...args);
    },

    buildCreateSuggestion(request) {
        const suggestion = super.buildCreateSuggestion(request);
        const originalOnSelect = suggestion.onSelect;
        suggestion.onSelect = async () => {
            if (this.props.resModel === "stock.warehouse") {
                this.stockWarehouse.set(true);
            }
            return await originalOnSelect();
        };
        return suggestion;
    },
});
