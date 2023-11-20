/* @odoo-module */

const ID_CONTAINER = {};

function uuid(model) {
    if (!(model in ID_CONTAINER)) {
        ID_CONTAINER[model] = 1;
    }
    return `${model}_${ID_CONTAINER[model]++}`;
}

let dummyNameId = 1;

function getDummyName(model, suffix) {
    return `dummy_${model}_${dummyNameId++}_${suffix}`;
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function mapObj(obj, fn) {
    return Object.fromEntries(Object.entries(obj).map(([k, v], i) => [k, fn(k, v, i)]));
}

const RELATION_TYPES = new Set(["many2many", "many2one", "one2many"]);
const X2MANY_TYPES = new Set(["many2many", "one2many"]);

function processModelDefs(modelDefs) {
    modelDefs = clone(modelDefs);
    const inverseMap = new Map();
    const many2oneFields = [];
    for (const model in modelDefs) {
        const fields = modelDefs[model];
        for (const fieldName in fields) {
            const field = fields[fieldName];
            if (!RELATION_TYPES.has(field.type)) {
                continue;
            }

            if (inverseMap.has(field)) {
                continue;
            }

            const comodel = modelDefs[field.relation];
            if (!comodel) {
                continue;
            }

            if (field.type === "many2many") {
                let [inverseField, ...others] = Object.entries(comodel).filter(
                    (model_name, f) => model_name === field.relation
                );
                if (others.length > 0) {
                    throw new Error("Many2many relation must have only one inverse");
                }
                if (!inverseField) {
                    const dummyName = getDummyName(model, "ids");
                    inverseField = {
                        name: dummyName,
                        type: "many2many",
                        relation: model,
                        dummy: true,
                    };
                    comodel[dummyName] = inverseField;
                }
                inverseMap.set(field, inverseField);
                inverseMap.set(inverseField, field);
            } else if (field.type === "one2many") {
                let inverseField = Object.values(comodel).find(
                    (f) => f.relation === model && f.name === field.inverse_name
                );
                if (!inverseField) {
                    const dummyName = getDummyName(model, "id");
                    inverseField = {
                        name: dummyName,
                        type: "many2one",
                        relation: model,
                        dummy: true,
                    };
                    comodel[dummyName] = inverseField;
                }
                inverseMap.set(field, inverseField);
                inverseMap.set(inverseField, field);
            } else if (field.type === "many2one") {
                many2oneFields.push([model, field]);
            }
        }
    }

    for (const [model, field] of many2oneFields) {
        if (inverseMap.has(field)) {
            continue;
        }

        const comodel = modelDefs[field.relation];
        if (!comodel) {
            throw new Error(`Model ${field.relation} not found`);
        }

        const dummyName = getDummyName(model, "ids");
        const dummyField = {
            name: dummyName,
            type: "one2many",
            relation: model,
            inverse_name: field.name,
            dummy: true,
        };
        comodel[dummyName] = dummyField;
        inverseMap.set(field, dummyField);
        inverseMap.set(dummyField, field);
    }
    return [inverseMap, modelDefs];
}

export function createRelatedModels(
    modelDefs,
    env,
    reactive = (x) => x,
    modelOverrides = (x) => x
) {
    const [inverseMap, processedModelDefs] = processModelDefs(modelDefs);
    const records = reactive(mapObj(processedModelDefs, () => reactive({})));

    // maps the model to its set of getters.
    // Values are filled during the compilation of the models.
    const getterMap = new Map();

    class Base {}

    function getFields(model) {
        return processedModelDefs[model];
    }

    function connect(field, ownerRecord, recordToConnect) {
        const inverse = inverseMap.get(field);

        if (field.type === "many2one") {
            const prevConnectedRecord = ownerRecord[field.name];
            if (prevConnectedRecord === recordToConnect) {
                return;
            }
            recordToConnect[inverse.name].add(ownerRecord);
            if (prevConnectedRecord) {
                prevConnectedRecord[inverse.name].delete(ownerRecord);
            }
            ownerRecord[field.name] = recordToConnect;
        } else if (field.type === "one2many") {
            const prevConnectedRecord = recordToConnect[inverse.name];
            if (prevConnectedRecord === ownerRecord) {
                return;
            }
            recordToConnect[inverse.name] = ownerRecord;
            if (prevConnectedRecord) {
                prevConnectedRecord[field.name].delete(recordToConnect);
            }
            ownerRecord[field.name].add(recordToConnect);
        } else if (field.type === "many2many") {
            ownerRecord[field.name].add(recordToConnect);
            recordToConnect[inverse.name].add(ownerRecord);
        }
    }

    function disconnect(field, ownerRecord, recordToDisconnect) {
        if (!recordToDisconnect) {
            throw new Error("recordToDisconnect is undefined");
        }
        const inverse = inverseMap.get(field);
        if (field.type === "many2one") {
            const prevConnectedRecord = ownerRecord[field.name];
            if (prevConnectedRecord === recordToDisconnect) {
                ownerRecord[field.name] = undefined;
                recordToDisconnect[inverse.name].delete(ownerRecord);
            }
        } else if (field.type === "one2many") {
            ownerRecord[field.name].delete(recordToDisconnect);
            const prevConnectedRecord = recordToDisconnect[inverse.name];
            if (prevConnectedRecord === ownerRecord) {
                recordToDisconnect[inverse.name] = undefined;
            }
        } else if (field.type === "many2many") {
            ownerRecord[field.name].delete(recordToDisconnect);
            recordToDisconnect[inverse.name].delete(ownerRecord);
        }
    }

    function exists(model, id) {
        return id in records[model];
    }

    function create(model, vals) {
        if (!("id" in vals)) {
            vals["id"] = uuid(model);
        }

        const Model = models[model];
        const record = reactive(new Model(vals));
        const id = vals["id"];
        record.id = id;
        records[model][id] = record;

        const fields = getFields(model);
        for (const name in fields) {
            if (name === "id") {
                continue;
            }

            const field = fields[name];

            if (field.required && !(name in vals)) {
                throw new Error(`'${name}' field is required when creating '${model}' record.`);
            }

            if (RELATION_TYPES.has(field.type)) {
                if (X2MANY_TYPES.has(field.type)) {
                    record[name] = new Set([]);
                } else if (field.type === "many2one") {
                    record[name] = undefined;
                }

                const comodelName = field.relation;
                if (!vals[name]) {
                    continue;
                }

                if (X2MANY_TYPES.has(field.type)) {
                    for (const [command, ...items] of vals[name]) {
                        if (command === "create") {
                            const newRecords = items.map((_vals) => create(comodelName, _vals));
                            for (const record2 of newRecords) {
                                connect(field, record, record2);
                            }
                        } else if (command === "link") {
                            const existingRecords = items.filter((record) =>
                                exists(comodelName, record.id)
                            );
                            for (const record2 of existingRecords) {
                                connect(field, record, record2);
                            }
                        }
                    }
                } else if (field.type === "many2one") {
                    const val = [vals[name]];
                    if (typeof val === "object") {
                        if (exists(comodelName, val.id)) {
                            connect(field, record, val);
                        }
                    } else {
                        const newRecord = create(comodelName, val);
                        connect(field, record, newRecord);
                    }
                }
            } else {
                record[name] = vals[name];
            }
        }
        record.setup(vals);
        return record;
    }

    function update(model, record, vals) {
        const fields = getFields(model);
        for (const name in vals) {
            if (!(name in fields)) {
                continue;
            }
            const field = fields[name];
            const comodelName = field.relation;
            if (X2MANY_TYPES.has(field.type)) {
                for (const command of vals[name]) {
                    const [type, ...items] = command;
                    if (type === "unlink") {
                        for (const record2 of items) {
                            disconnect(field, record, record2);
                        }
                    } else if (type === "clear") {
                        const linkedRecs = record[name];
                        for (const record2 of [...linkedRecs]) {
                            disconnect(field, record, record2);
                        }
                    } else if (type === "create") {
                        const newRecords = items.map((vals) => create(comodelName, vals));
                        for (const record2 of newRecords) {
                            connect(field, record, record2);
                        }
                    } else if (type === "link") {
                        const existingRecords = items.filter((record) =>
                            exists(comodelName, record.id)
                        );
                        for (const record2 of existingRecords) {
                            connect(field, record, record2);
                        }
                    }
                }
            } else if (field.type === "many2one") {
                if (vals[name]) {
                    if (vals[name] instanceof Base) {
                        if (exists(comodelName, vals[name].id)) {
                            connect(field, record, vals[name]);
                        }
                    } else {
                        const newRecord = create(comodelName, vals[name]);
                        connect(field, record, newRecord);
                    }
                } else {
                    const linkedRec = record[name];
                    disconnect(field, record, linkedRec);
                }
            } else {
                record[name] = vals[name];
            }
        }
    }

    function delete_(model, record) {
        const id = record.id;
        const fields = getFields(model);
        for (const name in fields) {
            const field = fields[name];
            if (X2MANY_TYPES.has(field.type)) {
                for (const record2 of [...record[name]]) {
                    disconnect(field, record, record2);
                }
            } else if (field.type === "many2one" && record[name]) {
                disconnect(field, record, record[name]);
            }
        }
        delete records[model][id];
    }

    function createCRUD(model) {
        return {
            create(vals) {
                return create(model, vals);
            },
            createMany(valsList) {
                const result = [];
                for (const vals of valsList) {
                    result.push(create(model, vals));
                }
                return result;
            },
            update(record, vals) {
                return update(model, record, vals);
            },
            delete(record) {
                return delete_(model, record);
            },
            deleteMany(records) {
                const result = [];
                for (const record of records) {
                    result.push(delete_(model, record));
                }
                return result;
            },
            read(id) {
                if (!(model in records)) {
                    return;
                }
                return records[model][id];
            },
            readAll() {
                return Object.values(records[model]);
            },
            readMany(ids) {
                if (!(model in records)) {
                    return [];
                }
                return ids.map((id) => records[model][id]);
            },
            find(predicate) {
                return Object.values(records[model]).find(predicate);
            },
            findAll(predicate) {
                return Object.values(records[model]).filter(predicate);
            },
        };
    }

    /**
     * Return a contructor that extends the given `Model` with the given `name`.
     * @param {Constructor} Model
     * @param {string} name
     * @returns {Constructor}
     */
    function namedModel(Model, name) {
        return new Function("Model", `return class ${name} extends Model {};`)(Model);
    }

    const baseModels = mapObj(processedModelDefs, (model, fields) => {
        class Model extends Base {
            static _name = model;
            static _fields = fields;
            /**
             * Called after the instantiation of the record.
             */
            setup(_vals) {}
            get env() {
                return env;
            }
            update(vals) {
                return update(model, this, vals);
            }
            delete() {
                return delete_(model, this);
            }
        }

        return namedModel(
            Model,
            model
                .split(".")
                .map((word) => word[0].toUpperCase() + word.slice(1))
                .join("")
        );
    });

    const models = { ...baseModels, ...modelOverrides(baseModels) };

    /**
     * traverse the prototype chain and return all methods.
     * @param {object} proto
     * @returns {string[]}
     */
    function getAllGetters(proto) {
        const getters = new Set();
        while (proto !== null) {
            const descriptors = Object.getOwnPropertyDescriptors(proto);
            for (const [name, descriptor] of Object.entries(descriptors)) {
                if (descriptor.get) {
                    getters.add(name);
                }
            }
            proto = Object.getPrototypeOf(proto);
        }
        return [...getters];
    }

    // Set the getterMap
    for (const model in models) {
        const Model = models[model];
        const getters = getAllGetters(Model.prototype);
        getterMap.set(Model, new Set(getters));
    }

    return mapObj(processedModelDefs, (model) => createCRUD(model));
}
