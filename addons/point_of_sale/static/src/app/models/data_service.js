/** @odoo-module */

import { Reactive } from "@web/core/utils/reactive";
import { reactive } from "@odoo/owl";
import { createRelatedModels } from "@point_of_sale/app/models/related_models";
import { registry } from "@web/core/registry";

const INDEXED_DB_NAME = {
    "product.product": ["barcode", "pos_categ_ids"],
};

export class PosData extends Reactive {
    // if empty, all python listed models will be loaded
    static modelToLoad = [];
    static serviceDependencies = ["orm"];

    constructor() {
        super();
        this.ready = this.setup(...arguments).then(() => this);
        this.custom = {};
        this.idMap = {};
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
            env,
            reactive,
            modelClasses
        );

        this.relations = response.relations;
        this.models = models;
        this.models.loadData(response.data);

        for (const [name, model] of Object.entries(records)) {
            this[name.replaceAll(".", "_")] = Object.values(model);
            this.idMap[name.replaceAll(".", "_")] = model;
        }
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

    createIndex() {}
}

export const PosDataService = {
    dependencies: PosData.serviceDependencies,
    async start(env, deps) {
        return new PosData(env, deps).ready;
    },
};

registry.category("services").add("pos_data", PosDataService);
