import { useSubEnv } from "@web/owl2/utils";
import { ProductCatalogKanbanRecord } from "@product/product_catalog/kanban_record";
import { ProductCatalogAccountMoveLine } from "./account_move_line";
import { patch } from "@web/core/utils/patch";
import { useSearchModel } from "@web/search/search_model";

patch(ProductCatalogKanbanRecord.prototype, {
    setup() {
        super.setup();
        this.searchModel = useSearchModel();

        useSubEnv({
            ...this.env,
            selectedSectionId: this.searchModel.selectedSection.sectionId,
        });
    },

    get orderLineComponent() {
        if (this.env.orderResModel === "account.move") {
            return ProductCatalogAccountMoveLine;
        }
        return super.orderLineComponent;
    },

    _getUpdateQuantityAndGetPriceParams() {
        return {
            ...super._getUpdateQuantityAndGetPriceParams(),
            section_id: this.env.selectedSectionId ?? this.searchModel.selectedSection.sectionId,
        };
    },

    addProduct(qty = 1) {
        if (this.productCatalogData.quantity === 0 && qty < this.productCatalogData.min_qty) {
            qty = this.productCatalogData.min_qty; // Take seller's minimum if trying to add less
        }
        super.addProduct(qty);
    },

    updateQuantity(quantity) {
        const lineCountChange = (quantity > 0) - (this.productCatalogData.quantity > 0);
        if (lineCountChange !== 0) {
            this.notifyLineCountChange(lineCountChange);
        }

        super.updateQuantity(quantity);
    },

    notifyLineCountChange(lineCountChange) {
        this.searchModel.trigger('section-line-count-change', {
            sectionId: this.env.selectedSectionId,
            lineCountChange: lineCountChange,
        });
    },
})
