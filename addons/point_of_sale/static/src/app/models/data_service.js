/** @odoo-module */

import { registry } from "@web/core/registry";
import { Reactive } from "@web/core/utils/reactive";

export class PosData extends Reactive {
    static serviceDependencies = ["orm"];

    constructor() {
        super();
        this.ready = this.setup(...arguments).then(() => this);
    }

    async setup(env, { orm }) {
        this.orm = orm;

        this._relations = [];

        for (const model of PosData.modelToLoad) {
            this[model.replaceAll(".", "_")] = [];
        }

        await this.initData();
    }

    async initData() {
        const response = await this.orm.call("pos.session", "load_data", [
            odoo.pos_session_id,
            PosData.modelToLoad,
        ]);

        for (const [model, data] of Object.entries(response.data)) {
            if (!data) {
                continue;
            }

            if (registry.category("pos_available_models").contains(model)) {
                const jsModel = registry.category("pos_available_models").get(model);
                this[model.replaceAll(".", "_")] = data.map((p) => new jsModel(p));
            }
        }

        this._relations = response._relations;
    }

    async loadMissingData(model, ids) {
        const response = await this.orm.call("pos.session", "load_missing_data", [
            odoo.pos_session_id,
            model,
            ids,
        ]);

        if (registry.category("pos_available_models").contains(model)) {
            const jsModel = registry.category("pos_available_models").get(model);
            this[model.replaceAll(".", "_")] = this[model.replaceAll(".", "_")].push(
                response.data.map((p) => new jsModel(p))
            );

            this.createRelation();
        }
    }

    createRelation() {
        for (const { field, model, relation, type } of this._relations) {
            const relationModels = relation.replaceAll(".", "_");
            const currentModel = model.replaceAll(".", "_");

            if (!this[relationModels] || !this[currentModel]) {
                continue;
            }

            for (const modelData of this[currentModel]) {
                const currentValue = modelData[field];

                if (!currentValue) {
                    continue;
                }

                if (type === "many2many" || type === "one2many") {
                    modelData[field] = this[relationModels].filter((rel) => {
                        return currentValue.includes(rel.id);
                    });
                } else if (type === "many2one") {
                    const rel = this[relationModels].find((rel) => rel.id === currentValue);
                    modelData[field] = rel ? rel : currentValue;
                }
            }
        }
    }

    // needed to save in localstorage
    deleteRelation() {}

    createNewOfflineOrder() {}
}

PosData.modelToLoad = [
    "account.tax",
    "pos.category",
    "pos.bill",
    "pos.combo",
    "pos.config",
    "pos.order",
    "pos.session",
    "product.category",
    "product.packaging",
    "product.product",
    "product.pricelist",
    "res.company",
    "res.country.state",
    "res.country",
    "res.currency",
    "res.lang",
    "res.partner",
    "stock.picking.type",
    "res.users",
    "uom.uom",
    "pos.payment.method",
    "pos.order",
    "pos.order.line",
    "pos.combo.line",
    "decimal.precision",
    "account.tax.repartition.line",
    "account.fiscal.position",
    "account.cash.rounding",
];

export const PosDataService = {
    dependencies: PosData.serviceDependencies,
    async start(env, deps) {
        return new PosData(env, deps).ready;
    },
};

registry.category("services").add("pos_data", PosDataService);
