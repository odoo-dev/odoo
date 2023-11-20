/** @odoo-module */

import { registry } from "@web/core/registry";
import { Reactive } from "@web/core/utils/reactive";
import { clone } from "../utils/clone";

export class PosData extends Reactive {
    // if empty, all python listed models will be loaded
    static modelToLoad = [];
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

        // effect(
        //     (args) => {
        //         this.saveToLocalStorage();
        //     },
        //     [this.pos_order, this.pos_order_line]
        // );
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
            } else {
                this[model.replaceAll(".", "_")] = data;
            }
        }

        this._relations = response._relations;
        this.createRelation();
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
        const relations = [];

        for (const models of Object.values(this._relations)) {
            for (const field of Object.values(models)) {
                relations.push(field);
            }
        }

        for (const { field, model, relation, type } of relations) {
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
        this.saveToLocalStorage();
    }

    // needed to save in localstorage
    deleteRelation(copy = false) {
        const data = copy ? copy : this.pos_order;
        const relations = [];

        for (const models of Object.values(this._relations)) {
            for (const field of Object.values(models)) {
                relations.push(field);
            }
        }

        for (const { field, model, type } of relations) {
            const currentModel = model.replaceAll(".", "_");

            if (!data[currentModel]) {
                continue;
            }

            for (const modelData of data[currentModel]) {
                const currentValue = modelData[field];

                if (!currentValue) {
                    continue;
                }

                if (type === "many2many" || type === "one2many") {
                    modelData[field] = currentValue.map((rel) => rel.id);
                } else if (type === "many2one") {
                    modelData[field] = currentValue.id;
                }
            }
        }

        return data;
    }

    saveToLocalStorage() {
        const dataToSave = this.deleteRelation({
            pos_order: clone(this.pos_order),
            pos_order_line: clone(this.pos_order_line),
        });

        localStorage.setItem(
            `pos_order-pos_session${odoo.pos_session_id}`,
            JSON.stringify(dataToSave)
        );
    }

    parseFromLocalStorage() {
        const data = JSON.parse(
            localStorage.getItem(`pos_order-pos_session${odoo.pos_session_id}`)
        );

        if (!data) {
            return;
        }

        for (const [model, data] of Object.entries(data)) {
            if (!data) {
                continue;
            }

            if (registry.category("pos_available_models").contains(model)) {
                const jsModel = registry.category("pos_available_models").get(model);
                this[model.replaceAll(".", "_")] = data.map((p) => new jsModel(p));
            }
        }

        this.createRelation();
    }
}

export const PosDataService = {
    dependencies: PosData.serviceDependencies,
    async start(env, deps) {
        return new PosData(env, deps).ready;
    },
};

registry.category("services").add("pos_data", PosDataService);
