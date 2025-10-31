import { serializeDateTime, serializeDate } from "@web/core/l10n/dates";
import { X2MANY_TYPES, DATE_TIME_TYPE } from "./utils";

const serializeDirtyRecords = (models, { dynamicModels }) => {
    const results = {};
    const dynamicModelSets = new Set(dynamicModels);
    const uuidMapping = {};

    // Serialize dirty records into a stack for processing, all dirty
    // local records will be serialized. Not only the order of processing.
    const stack = dynamicModels.reduce((acc, model) => {
        const uuids = models._dirtyRecords[model];
        acc[model] = new Map();
        uuidMapping[model] = {};

        for (const uuid of Array.from(uuids)) {
            const record = models[model].getBy("uuid", uuid);

            if (record) {
                acc[model].set(record.uuid, serialize(record));
                models._dirtyRecords[model].delete(uuid);
            }
        }

        return acc;
    }, {});

    // Link relational fields between serialized records in the stack
    // Eg: order.lines = [[0, 0, {product_id: 1}], [0, 0, {product_id: 2}]]
    for (const [model, records] of Object.entries(stack)) {
        for (const record of Array.from(records.values())) {
            for (const fieldName of Object.keys(record)) {
                const fieldParams = models[model].fields[fieldName];
                const isRelationalField = fieldParams && fieldParams.relation;

                if (!isRelationalField || !dynamicModelSets.has(fieldParams.relation)) {
                    continue;
                }

                mapRecords(record, fieldName, models, {
                    fieldParams,
                    stack,
                    uuidMapping,
                });
            }
        }
    }

    // Format the final result separating creates and updates
    for (const [model, records] of Object.entries(stack)) {
        const data = Array.from(records.values());
        if (!data.length) {
            continue;
        }

        if (!results[model]) {
            results[model] = {
                create: [],
                update: [],
                delete: [],
            };
        }

        for (const record of Array.from(data.values())) {
            if (typeof record.id === "number") {
                results[model].update.push(record);
            } else {
                results[model].create.push(record);
            }
        }
    }

    return [results, uuidMapping];
};

const mapRecords = (record, fieldName, models, { fieldParams, stack, uuidMapping }) => {
    const processRelatedRecord = (relRec, model) => {
        for (const [name, data] of Object.entries(relRec)) {
            const params = models[model].fields[name];
            const relFieldParams = models[fieldParams.relation].fields[name];
            const isRelationalField = fieldParams && fieldParams.relation;

            if (!isRelationalField || !stack[relFieldParams.relation]) {
                continue;
            }

            if (X2MANY_TYPES.has(params.type)) {
                relRec[name] = data
                    .map((val) => {
                        if (val && typeof val !== "number") {
                            uuidMapping[model][record.uuid] ??= {};
                            uuidMapping[model][record.uuid][name] ??= [];
                            uuidMapping[model][record.uuid][name].push(val);
                        }

                        return val;
                    })
                    .filter((val) => typeof val.id === "number");
            } else {
                if (data && typeof data !== "number") {
                    uuidMapping[model][record.uuid] ??= {};
                    uuidMapping[model][record.uuid][name] = data;
                }

                relRec[name] = typeof data === "number" ? data : false;
            }
        }
    };

    const linker = (value) => {
        const model = fieldParams.relation;
        const isSaved = typeof value === "number";
        const uuid = isSaved ? models[model].get(value)?.uuid : value;
        const relRec = stack[model].get(uuid);

        // If the related record is not in the stack, it means it has not been modified
        if (!relRec) {
            return false;
        }

        stack[fieldParams.relation].delete(uuid);
        processRelatedRecord(relRec, model);
        return isSaved ? [1, value, relRec] : [0, 0, relRec];
    };

    if (X2MANY_TYPES.has(fieldParams.type)) {
        record[fieldName] = record[fieldName].map(linker).filter(Boolean);
    } else {
        record[fieldName] = linker(record[fieldName]);
    }
};

const serialize = (record) => {
    const result = {};
    const fields = record.model.fields;

    for (const [fieldName, field] of Object.entries(fields)) {
        if (field.local || field.related || field.compute || field.dummy) {
            continue;
        }

        if (fieldName === "id") {
            if (typeof record[fieldName] === "number") {
                result[fieldName] = record[fieldName];
            }
            continue;
        }

        if (X2MANY_TYPES.has(field.type)) {
            const records = record[fieldName] || [];
            result[fieldName] = records.map((c) => (typeof c.id === "number" ? c.id : c.uuid));
            continue;
        }

        if (field.type === "many2one") {
            const isSaved = typeof record[fieldName]?.id === "number";
            const recordId = isSaved ? record[fieldName].id : record[fieldName]?.uuid;
            result[fieldName] = recordId;
            continue;
        }

        if (DATE_TIME_TYPE.has(field.type) && typeof record[fieldName] === "object") {
            const isDatetime = field.type === "datetime";
            const value = record[fieldName];
            result[fieldName] = isDatetime ? serializeDateTime(value) : serializeDate(value);
            continue;
        }

        result[fieldName] = record[fieldName] ? record[fieldName] : false;
    }

    return result;
};

const deepSerialization = (
    record,
    opts,
    { serialized = {}, uuidMapping = {}, parentRelInverseName = null, stack = [] }
) => {
    const result = {};
    const { fields, name: currentModel } = record.model;
    const DYNAMIC_MODELS = opts.dynamicModels;
    const recursiveSerialize = (childRecord, parentRelInverseName) =>
        deepSerialization(childRecord, opts, {
            serialized,
            uuidMapping,
            parentRelInverseName,
            stack,
        });

    // We only care about the fields present in python model
    for (const [fieldName, field] of Object.entries(fields)) {
        if (field.local || field.related || field.compute || field.dummy) {
            continue;
        }

        const relatedModel = field.relation;
        const targetModel = field.model;
        const modelCommands = record.models.commands[currentModel];

        if (relatedModel) {
            if (!record.models[relatedModel]) {
                // Ignore not "loaded" model
                continue;
            }

            if (DYNAMIC_MODELS.includes(relatedModel) && !serialized[relatedModel]) {
                serialized[relatedModel] = {};
            }
        }
        if (DYNAMIC_MODELS.includes(currentModel) && !serialized[currentModel]) {
            serialized[currentModel] = { [record.uuid]: record.uuid };
        }
        if (DYNAMIC_MODELS.includes(targetModel) && !uuidMapping[targetModel]) {
            uuidMapping[targetModel] = {};
        }
        if (X2MANY_TYPES.has(field.type) && record[fieldName]) {
            if (DYNAMIC_MODELS.includes(relatedModel)) {
                const toUpdate = [];
                const toCreate = [];

                for (const childRecord of record[fieldName]) {
                    if (serialized[relatedModel][childRecord.uuid]) {
                        continue;
                    }

                    if (typeof childRecord.id === "number" && childRecord._dirty) {
                        toUpdate.push(childRecord);

                        if (!opts.keepCommands) {
                            childRecord.unmarkDirty();
                        }
                    } else if (typeof childRecord.id !== "number") {
                        toCreate.push(childRecord);
                    }
                    serialized[relatedModel][childRecord.uuid] = childRecord.uuid;
                }
                // The stack defers processing of x2many relationships to ensure objects are only serialized
                // once in their first encountered parent, preventing redundant serialization.
                stack.push([
                    result,
                    fieldName,
                    () => [
                        ...(result[fieldName] || []),
                        ...toUpdate.map((childRecord) => [
                            1,
                            childRecord.id,
                            recursiveSerialize(childRecord, field.inverse_name),
                        ]),
                        ...toCreate.map((childRecord) => [
                            0,
                            0,
                            recursiveSerialize(childRecord, field.inverse_name),
                        ]),
                    ],
                ]);
            } else {
                result[fieldName] = record[fieldName]
                    .filter((childRecord) => childRecord.id)
                    .map((childRecord) => {
                        if (typeof childRecord.id !== "number") {
                            throw new Error(
                                `Trying to create a non serializable record '${relatedModel}'`
                            );
                        }
                        return childRecord.id;
                    });
            }

            if (modelCommands.unlink.has(fieldName) || modelCommands.delete.has(fieldName)) {
                result[fieldName] = result[fieldName] || [];
                const processRecords = (records, cmdCode) => {
                    for (const { id, parentId } of records) {
                        const isAlreadyDeleted = serialized[relatedModel]?.["_deleted_" + id];
                        if (parentId === record.id && !isAlreadyDeleted) {
                            const isCascadeDelete =
                                record.models[relatedModel]?.fields[field.inverse_name]?.ondelete;
                            if (isCascadeDelete) {
                                serialized[relatedModel]["_deleted_" + id] = true;
                            }
                            result[fieldName].push([cmdCode, id]);
                        }
                    }
                };
                processRecords(modelCommands.unlink.get(fieldName) || [], 3);
                processRecords(modelCommands.delete.get(fieldName) || [], 2);

                for (const commands of [modelCommands.unlink, modelCommands.delete]) {
                    const commandList = commands.get(fieldName) || [];
                    const remainingCommands = commandList.filter(
                        ({ parentId }) => parentId !== record.id
                    );

                    if (opts.keepCommands) {
                        continue;
                    }

                    if (remainingCommands.length) {
                        commands.set(fieldName, remainingCommands);
                    } else {
                        commands.delete(fieldName);
                    }
                }
            }
            continue;
        }

        if (field.type === "many2one") {
            const recordId = record[fieldName]?.id;
            if (DYNAMIC_MODELS.includes(relatedModel) && record[fieldName]) {
                if (
                    fieldName !== parentRelInverseName && //mapping not needed for direct child
                    record.uuid &&
                    serialized[relatedModel][record[fieldName].uuid]
                ) {
                    if (typeof recordId !== "number") {
                        //  mapping is only needed for newly created records
                        uuidMapping[targetModel][record.uuid] ??= {};
                        uuidMapping[targetModel][record.uuid][fieldName] = record[fieldName].uuid;
                    }
                }
                serialized[relatedModel][record[fieldName].uuid] = record[fieldName].uuid;
            }
            if (typeof recordId === "number" && recordId >= 0) {
                result[fieldName] = recordId;
            } else if (record[fieldName] === undefined) {
                result[fieldName] = false;
            }
            continue;
        }
        if (DATE_TIME_TYPE.has(field.type) && typeof record[fieldName] === "object") {
            result[fieldName] =
                field.type === "datetime"
                    ? serializeDateTime(record[fieldName])
                    : serializeDate(record[fieldName]);
            continue;
        }
        if (fieldName === "id") {
            if (typeof record[fieldName] === "number") {
                result[fieldName] = record[fieldName];
            }
            continue;
        }
        result[fieldName] = record[fieldName] !== undefined ? record[fieldName] : false;
    }

    while (stack.length) {
        const [res, key, getValue] = stack.pop();
        res[key] = getValue();
    }

    if (!opts.keepCommands) {
        record.unmarkDirty();
    }

    // Cleanup: remove empty entries from uuidMapping.
    for (const key in uuidMapping) {
        if (
            uuidMapping[key] &&
            typeof uuidMapping[key] === "object" &&
            Object.keys(uuidMapping[key]).length === 0
        ) {
            delete uuidMapping[key];
        }
    }

    return result;
};

export const ormSerialization = (record, opts) => {
    const test = serializeDirtyRecords(record.models, opts);
    console.log(test);
    const uuidMapping = {};
    const result = deepSerialization(record, opts, {
        uuidMapping,
    });
    if (Object.keys(uuidMapping).length !== 0) {
        result.relations_uuid_mapping = uuidMapping;
    }
    return result;
};
