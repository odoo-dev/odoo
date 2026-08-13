import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";


patch(PosStore.prototype, {
    async editLots(product, packLotLinesToEdit) {
        const result = await super.editLots(product, packLotLinesToEdit);
        if (!result?.newPackLotLines?.length) {
            return result;
        }

        const existingLots = await this.data.call("pos.order.line", "get_existing_lots", [
            this.company.id,
            this.config.id,
            product.id,
        ]);

        const costByName = Object.fromEntries(
            existingLots.map((lot) => [lot.name, lot.standard_price])
        );

        result.newPackLotLines = result.newPackLotLines.map((line) => ({
            ...line,
            standard_price: costByName[line.lot_name] ?? 0,
        }));

        return result;
    },
});