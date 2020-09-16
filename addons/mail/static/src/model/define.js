/** @odoo-module alias=mail.model.define **/

import action from 'mail.action.define';
import ModelDefinition from 'mail.classes.ModelDefinition';
import Record from 'mail.classes.Record';
import RecordField from 'mail.classes.RecordField';

/**
 * @param {Object} param0
 * @param {Object} [param0.actions]
 * @param {Object} [param0.fields]
 * @param {boolean} [param0.global=false]
 * @param {string} [param0.id]
 * @param {Object} [param0.lifecycles]
 * @param {string} param0.name
 * @returns {mail.classes.ModelDefinition}
 */
export default function define({
    actions,
    fields,
    global = false,
    id,
    lifecycles,
    name: modelName,
}) {
    // TODO: check id and name not already used in global
    const actionAll = _actionAll({ modelName });
    const actionCreate = _actionCreate({ modelName });
    const actionDataToStringifiedDataId = _actionDataToStringifiedDataId({ modelName });
    const actionFind = _actionFind({ modelName });
    const actionFindById = _actionFindById({ modelName });
    const actionInsert = _actionInsert({ modelName });
    const customActions = new Set();
    if (actions) {
        for (const actionName of actions.getOwnPropertyNames()) {
            const customAction = action({
                action: {
                    [actionName]: actions[actionName],
                },
            });
            customActions.add(customAction);
        }
    }
    if (lifecycles) {
        for (const lifecycleName of lifecycles.getOwnPropertyNames()) {
            const customLifecycleAction = action({
                action: {
                    [`${modelName}/${lifecycleName}`]: lifecycles[lifecycleName],
                },
            });
            customActions.add(customLifecycleAction);
        }
    }
    const modelDefinition = new ModelDefinition({
        actions: [
            actionAll,
            actionCreate,
            actionDataToStringifiedDataId,
            actionFind,
            actionFindById,
            actionInsert,
            ...customActions,
        ],
        fields,
        id,
        modelName,
    });
    // TODO: if global set, add to global registry
    return modelDefinition;
}

/**
 * @private
 * @param {Object} param0
 * @param {string} param0.modelName
 * @returns {mail.classes.ActionDefinition}
 */
function _actionAll({ modelName }) {
    return action({
        /**
         * @param {Object} param0
         * @param {web.env} param0.env
         * @param {function} [func]
         * @returns {Record[]}
         */
        [`${modelName}/all`](
            { env },
            func,
        ) {
            env.models.items;
            const model = env['Item/id => Item'].get(
                env['Model/name => Model/id'].get(modelName),
            );
            const records = model['<Record/id>'].map(
                recordId => env['Item/id => Item'].get(recordId)
            );
            if (!func) {
                return records;
            }
            return records.filter(func);
        },
    });
}

/**
 * @private
 * @param {Object} param0
 * @param {string} param0.modelName
 * @returns {mail.classes.ActionDefinition}
 */
function _actionCreate({ modelName }) {
    return action({
        /**
         * @param {Object} param0
         * @param {Object} param0.env
         * @param {Object} data
         * @returns {Record|Record[]}
         */
        [`${modelName}/create`](
            { env },
            data,
        ) {
            const isMulti = typeof data[Symbol.iterator] === 'function';
            const dataList = isMulti ? data : [data];
            const res = dataList.map(data => {
                const stringifiedDataId = env.services.action.dispatch(
                    `${modelName}/dataToStringifiedDataId`,
                    data,
                );
                const record = new Record({
                    id: `${modelName}:Record:${stringifiedDataId}`,
                    data,
                });
                env['Item/id => Item'].set(
                    record.id,
                    record,
                );
                const model = env['Item/id => Item'].get(
                    env['Model/name => Model/id'].get(modelName),
                );
                model['<Record/id>'].add(record.id);
                model['Record/stringifiedDataId => Record/id'].set(
                    stringifiedDataId,
                    record.id,
                );
                record['Model/id'] = model.id;
                for (const modelFieldId of model['<ModelField/id>']) {
                    const modelField = env['Item/id => Item'].get(modelFieldId);
                    const recordField = new RecordField({
                        ['ModelField/id']: modelField.id,
                        ['Record/id']: record.id,
                        id: `${record.id}:RecordField:${modelField.name}`,
                    });
                    env['Item/id => Item'].set(
                        recordField.id,
                        recordField,
                    );
                    record['<RecordField/id>'].add(recordField.id);
                    record['fieldName => RecordField/id'].set(
                        modelField.name,
                        recordField.id,
                    );
                }
                env.services.action.dispatch(
                    'Record/update',
                    record,
                    data,
                );
                return record;
            });
            return isMulti ? res : res[0];
        },
    });
}

/**
 * @private
 * @param {Object} param0
 * @param {string} param0.modelName
 * @returns {mail.classes.ActionDefinition}
 */
function _actionDataToStringifiedDataId({ modelName }) {
    return action({
        /**
         * @param {Object} param0
         * @param {web.env} param0.env
         * @param {Object} data
         * @returns {string}
         */
        [`${modelName}/dataToStringifiedDataId`](
            { env },
            data,
        ) {
            const model = env['Item/id => Item'].get(
                env['Model/name => Model/id'].get(modelName),
            );
            model['Record/stringifiedDataId => Record/id'];
        },
    });
}

/**
 * @private
 * @param {Object} param0
 * @param {string} param0.modelName
 * @returns {mail.classes.ActionDefinition}
 */
function _actionFind({ modelName }) {
    return action({
        /**
         * @param {Object} param0
         * @param {web.env} param0.env
         * @param {function} func
         * @returns {Record}
         */
        [`${modelName}/find`](
            { env },
            func,
        ) {
            const model = env['Item/id => Item'].get(
                env['Model/name => Model/id'].get(modelName),
            );
            const allRecords = model['<Record/id>'].map(
                recordId => env['Item/id => Item'].get(recordId)
            );
            return allRecords.find(func);
        },
    });
}

/**
 * @private
 * @param {Object} param0
 * @param {string} param0.modelName
 * @returns {mail.classes.ActionDefinition}
 */
function _actionFindById({ modelName }) {
    return action({
        /**
         * @param {Object} param0
         * @param {web.env} param0.env
         * @param {Object} data
         * @returns {Record|undefined}
         */
        [`${modelName}/findById`](
            { env },
            data,
        ) {
            const stringifiedDataId = env.services.action.dispatch(
                `${modelName}/dataToStringifiedDataId`,
                data,
            );
            const model = env['Item/id => Item'].get(
                env['Model/name => Model/id'].get(modelName),
            );
            const recordId = model['Record/stringifiedDataId => Record/id'].get(
                stringifiedDataId,
            );
            if (!recordId) {
                return undefined;
            }
            return env['Item/id => Item'].get(recordId);
        },
    });
}

/**
 * @private
 * @param {Object} param0
 * @param {string} param0.modelName
 * @returns {mail.classes.ActionDefinition}
 */
function _actionInsert({ modelName }) {
    return action({
        /**
         * @param {Object} param0
         * @param {Object} param0.env
         * @param {Object} data
         * @returns {Record|Record[]}
         */
        [`${modelName}/insert`](
            { env },
            data,
        ) {
            const isMulti = typeof data[Symbol.iterator] === 'function';
            const dataList = isMulti ? data : [data];
            const records = [];
            for (const data of dataList) {
                let record = env.services.action.dispatch(
                    `${modelName}/findById`,
                    data,
                );
                if (!record) {
                    record = env.services.action.dispatch(
                        `${modelName}/create`,
                        data,
                    );
                } else {
                    env.services.action.dispatch(
                        'Record/update',
                        record,
                        data,
                    );
                }
                records.push(record);
            }
            return isMulti ? records : records[0];
        },
    });
}
