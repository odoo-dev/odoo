import { ProductCatalogKanbanModel } from "@product/product_catalog/kanban_model";

export class SaleProductCatalogKanbanModel extends ProductCatalogKanbanModel {

    async _loadData(params) {
        const limit = params.limit || this.initialLimit;
        const offset = params.offset || 0;
        const new_limit = await this.orm.searchCount(params.resModel, params.domain);
        params.limit = new_limit;
        params.offset = 0;
        const result = await super._loadData(...arguments);

        if (!params.isMonoRecord && !params.groupBy.length) {
            if (Object.values(result.records.map((record)=>{return record.productCatalogData})).some(obj => 'last_invoice_date' in obj)){
                const prioritized_products = Object.values(result.records).filter(obj => obj.productCatalogData.last_invoice_date != false)
                const remaining_products = Object.values(result.records).filter(obj => obj.productCatalogData.last_invoice_date == false)
                result.records = Object.values(prioritized_products).sort((obj1, obj2) => {
                    return new Date(obj2.productCatalogData.last_invoice_date || 0) - new Date(obj1.productCatalogData.last_invoice_date || 0);
                });
                result.records.push(...remaining_products);
            }
        }
        result.records = result.records.slice(offset, limit + offset);
        params.limit = limit;
        params.offset = offset;
        return result;
    }
}
