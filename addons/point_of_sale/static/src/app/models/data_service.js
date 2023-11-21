/** @odoo-module */

import { Reactive } from "@web/core/utils/reactive";
import { createRelatedModels } from "@point_of_sale/app/models/related_models";
import { registry } from "@web/core/registry";

const INDEXED_DB_NAME = {
    "product.product": ["id", "barcode", "pos_categ_ids", "write_date"],
    "product.template.attribute.value": ["id"],
    "account.tax": ["id"],
    "pos.category": ["id"],
    "pos.order": ["id"],
    "res.partner": ["id"],
    "pos.combo": ["id"],
    "pos.combo.line": ["id"],
};

export class PosData extends Reactive {
    // if empty, all python listed models will be loaded
    static modelToLoad = [];
    static serviceDependencies = ["orm"];

    constructor() {
        super();
        this.ready = this.setup(...arguments).then(() => this);
        this.custom = {};
        this.indexed = {};
    }

    async setup(env, { orm }) {
        this.orm = orm;

        this.relations = [];

        for (const model of PosData.modelToLoad) {
            this[model.replaceAll(".", "_")] = [];
        }

        await this.initData(env);
    }

    async initData(env) {
        const modelClasses = {};
        const response = await this.orm.call("pos.session", "load_data", [
            odoo.pos_session_id,
            PosData.modelToLoad,
        ]);

        for (const posModel of registry.category("pos_available_models").getAll()) {
            modelClasses[posModel.pythonModel] = posModel;
        }

        // need model override to be able to use the correct mod
        const [models, records] = createRelatedModels(
            response.relations,
            modelClasses,
            INDEXED_DB_NAME
        );

        this.relations = response.relations;
        this.models = models;
        this.models.loadData(response.data);

        for (const [name, model] of Object.entries(records)) {
            this[name.replaceAll(".", "_")] = Object.values(model);
        }

        this.createIndex();
    }

    createIndex() {
        for (const [name, fields] of Object.entries(INDEXED_DB_NAME)) {
            const jsName = name.replaceAll(".", "_");
            this.indexed[jsName] = {};

            for (const field of fields) {
                this.indexed[jsName][field] = {};

                for (const record of this[jsName]) {
                    if (field in record) {
                        this.indexed[jsName][field][record[field]] = record;
                    }
                }
            }
        }
    }
}

export const PosDataService = {
    dependencies: PosData.serviceDependencies,
    async start(env, deps) {
        return new PosData(env, deps).ready;
    },
};

registry.category("services").add("pos_data", PosDataService);
