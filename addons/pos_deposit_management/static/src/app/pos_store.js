/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    async addLineToCurrentOrder(vals, opts = {}, configure = true) {
        const line = await super.addLineToCurrentOrder(vals, opts, configure);
        if (line && !opts.isDepositLine) {
            const productTmpl = vals.product_tmpl_id;
            if (productTmpl && productTmpl.deposit_product_id) {
                const depositLine = await super.addLineToCurrentOrder(
                    {
                        product_tmpl_id: productTmpl.deposit_product_id.product_tmpl_id,
                    },
                    { ...opts, isDepositLine: true },
                    configure
                );
                // Link the main line to its deposit line and vice versa
                // so that quantity changes are synchronized between them.
                if (depositLine && depositLine !== line) {
                    line._depositLine = depositLine;
                    depositLine._mainLine = line;
                }
            }
        }

        return line;
    },
});
