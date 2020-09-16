/** @odoo-module alias=mail.model.init **/

import actions from 'mail.actions.define';
import ModelField from 'mail.model.ModelField';
import registry from 'mail.model.registry';
import patchClassMethods from 'mail.utils.patchClassMethods';

export default actions({
    id: 'mail.model.init',
    actions: {
        /**
         * Called after actions and models have been registered, including
         * addons. This launches the generation of actions and models.
         *
         * @param {Object} param0
         * @param {web.env} param0.env
         * @throws {Error} in case it cannot generate actions and/or models.
         */
        'init/start'(
            { env }
        ) {
            env.actions = new Map();
            env.services.action.dispatch('init/_makeActions');
            env.services.action.dispatch('init/_makeModels');
            /**
             * Check that declared model fields are correct.
             */
            env.services.action.dispatch('init/_checkDeclaredFieldsOnModels');
            /**
             * Process declared model fields definitions, so that these field
             * definitions are much easier to use in the system. For instance, all
             * relational field definitions have an inverse.
             */
            env.services.action.dispatch('init/_processDeclaredFieldsOnModels');
            /**
             * Check that all model fields are correct, notably one relation
             * should have matching reversed relation.
             */
            env.services.action.dispatch('init/_checkProcessedFieldsOnModels');
        },
        /**
         * @private
         * @param {Object} _
         * @param {Model} model
         * @param {Object} patch
         */
        'init/_applyModelPatchFields'(
            _,
            model,
            patch
        ) {
            for (const [fieldName, field] of Object.entries(patch)) {
                if (!model.fields.has(fieldName)) {
                    model.fields.set(fieldName, field);
                }
            }
        },
        /**
         * @private
         * @param {Object} param0
         * @param {web.env} param0.env
         * @throws {Error} in case some declared fields are not correct.
         */
        'init/_checkDeclaredFieldsOnModels'(
            { env }
        ) {
            for (const model of env.models.values()) {
                for (const field of model.fields.values()) {
                    // 0. Get parented declared fields
                    const parentedMatchingFields = [];
                    let targetModel = model.__proto__;
                    while (env.models.get(targetModel.name)) {
                        if (targetModel.fields) {
                            const matchingField = targetModel.fields.get(field.name);
                            if (matchingField) {
                                parentedMatchingFields.push(matchingField);
                            }
                        }
                        targetModel = targetModel.__proto__;
                    }
                    // 1. Field type is required.
                    if (!(['attribute', 'relation'].includes(field.type))) {
                        throw new Error(`Field definition "${model.name}/${field.name}" has unsupported type ${field.type}.`);
                    }
                    // 2. Invalid keys based on field type.
                    if (field.type === 'attribute') {
                        const invalidKeys = Object.keys(field).filter(key =>
                            ![
                                'compute',
                                'default',
                                'related',
                                'type',
                            ].includes(key)
                        );
                        if (invalidKeys.length > 0) {
                            throw new Error(`Field Definition "${model.name}/${field.name}" contains some invalid keys: "${invalidKeys.join(", ")}".`);
                        }
                    }
                    if (field.type === 'relation') {
                        const invalidKeys = Object.keys(field).filter(key =>
                            ![
                                'compute',
                                'default',
                                'inverseName',
                                'isCausal',
                                'related',
                                'relModelName',
                                'relType',
                                'type',
                            ].includes(key)
                        );
                        if (invalidKeys.length > 0) {
                            throw new Error(`Field Definition "${model.name}/${field.name}" contains some invalid keys: "${invalidKeys.join(", ")}".`);
                        }
                        if (!env.models.has(field.relModelName)) {
                            throw new Error(`Relational field definition "${model.name}/${field.name}" targets to unknown model name "${field.relModelName}".`);
                        }
                        if (field.isCausal && !(['one2many', 'one2one'].includes(field.relType))) {
                            throw new Error(`Relational field definition "${model.name}/${field.name}" has "isCausal" true with a relation of type "${field.relType}" but "isCausal" is only supported for "one2many" and "one2one".`);
                        }
                    }
                    // 3. Computed field.
                    if (
                        field.compute &&
                        !(typeof field.compute === 'string')
                    ) {
                        throw new Error(`Field definition "${model.name}/${field.name}" property "compute" must be a string (instance method name).`);
                    }
                    if (
                        field.compute &&
                        // AKU TODO
                        !(model.prototype[field.compute])
                    ) {
                        throw new Error(`Field definition "${model.name}/${field.name}" property "compute" does not refer to an instance method of this Model.`);
                    }
                    // 4. Related field.
                    if (field.compute && field.related) {
                        throw new Error(`Field definition "${model.name}/${field.name}" cannot be a related and compute field at the same time.`);
                    }
                    if (field.related) {
                        if (!(typeof field.related === 'string')) {
                            throw new Error(`Field definition "${model.name}/${field.name}" property "related" has invalid format.`);
                        }
                        const [relationName, relatedFieldName, other] = field.related.split('.');
                        if (!relationName || !relatedFieldName || other) {
                            throw new Error(`Field definition "${model.name}/${field.name}" property "related" has invalid format.`);
                        }
                        // find relation on self or parents.
                        let relatedRelation;
                        let targetModel = model;
                        while (env.models.has(targetModel.name) && !relatedRelation) {
                            if (targetModel.fields) {
                                relatedRelation = targetModel.fields.get(relationName);
                            }
                            targetModel = targetModel.__proto__;
                        }
                        if (!relatedRelation) {
                            throw new Error(`Related field "${model.name}/${field.name}" relates to unknown relation name "${relationName}".`);
                        }
                        if (relatedRelation.type !== 'relation') {
                            throw new Error(`Related field "${model.name}/${field.name}" relates to non-relational field "${relationName}".`);
                        }
                        // Assuming related relation is valid...
                        // find field name on related model or any parents.
                        const relatedModel = env.models.get(relatedRelation.relModelName);
                        let relatedField;
                        targetModel = relatedModel;
                        while (env.models.has(targetModel.name) && !relatedField) {
                            if (targetModel.fields) {
                                relatedField = targetModel.fields.get(relatedFieldName);
                            }
                            targetModel = targetModel.__proto__;
                        }
                        if (!relatedField) {
                            throw new Error(`Related field "${model.name}/${field.name}" relates to unknown related model field "${relatedFieldName}".`);
                        }
                        if (relatedField.type !== field.type) {
                            throw new Error(`Related field "${model.name}/${field.name}" has mismatch type with its related model field.`);
                        }
                        if (
                            relatedField.type === 'relation' &&
                            relatedField.relModelName !== field.relModelName
                        ) {
                            throw new Error(`Related field "${model.name}/${field.name}" has mismatch target model name with its related model field.`);
                        }
                    }
                }
            }
        },
        /**
         * @private
         * @param {Object} param0
         * @param {web.env} param0.env
         * @throws {Error} in case some fields are not correct.
         */
        'init/_checkProcessedFieldsOnModels'(
            { env }
        ) {
            for (const model of env.models.values()) {
                for (const field of model.fields.values()) {
                    if (!(['attribute', 'relation'].includes(field.type))) {
                        throw new Error(`Field "${model.name}/${field.name}" has unsupported type ${field.type}.`);
                    }
                    if (field.compute && field.related) {
                        throw new Error(`Field "${model.name}/${field.name}" cannot be a related and compute field at the same time.`);
                    }
                    if (field.type === 'attribute') {
                        continue;
                    }
                    if (!field.relType) {
                        throw new Error(
                            `Field "${model.name}/${field.name}" must define a relation type in "relType".`
                        );
                    }
                    if (!(['one2one', 'one2many', 'many2one', 'many2many'].includes(field.relType))) {
                        throw new Error(
                            `Field "${model.name}/${field.name}" has invalid relation type "${field.relType}".`
                        );
                    }
                    if (!field.inverseFieldName) {
                        throw new Error(
                            `Field "${
                                model.name
                            }/${
                                field.name
                            }" must define an inverse relation name in "inverseFieldName".`
                        );
                    }
                    if (!field.relModelName) {
                        throw new Error(
                            `Relation "${
                                model.names
                            }/${
                                field.name
                            }" must define a model name in "to" (1st positional parameter of relation field helpers).`
                        );
                    }
                    const relatedModel = env.models.get(field.relModelName);
                    if (!relatedModel) {
                        throw new Error(
                            `Model name of relation "${model.name}/${field.name}" does not exist.`
                        );
                    }
                    const inverseField = relatedModel.fields.get(field.inverseFieldName);
                    if (!inverseField) {
                        throw new Error(
                            `Relation "${
                                model.name
                            }/${
                                field.name
                            }" has no inverse field "${relatedModel.name}/${field.inverseFieldName}".`
                        );
                    }
                    if (inverseField.inverseFieldName !== field.name) {
                        throw new Error(
                            `Inverse field name of relation "${
                                model.name
                            }/${
                                field.name
                            }" does not match with field name of relation "${
                                relatedModel.name
                            }/${
                                inverseField.inverseFieldName
                            }".`
                        );
                    }
                    const allSelfAndParentNames = [];
                    let targetModel = model;
                    while (targetModel) {
                        allSelfAndParentNames.push(targetModel.name);
                        targetModel = targetModel.__proto__;
                    }
                    if (!allSelfAndParentNames.includes(inverseField.relModelName)) {
                        throw new Error(
                            `Relation "${
                                model.name
                            }/${
                                field.name
                            }" has inverse relation "${
                                relatedModel.name
                            }/${
                                field.inverseFieldName
                            }" misconfigured (currently "${
                                inverseField.relModelName
                            }", should instead refer to this model or parented models: ${
                                allSelfAndParentNames.map(name => `"${name}"`).join(', ')
                            }?)`
                        );
                    }
                    if (
                        (field.relType === 'many2many' && inverseField.relType !== 'many2many') ||
                        (field.relType === 'one2one' && inverseField.relType !== 'one2one') ||
                        (field.relType === 'one2many' && inverseField.relType !== 'many2one') ||
                        (field.relType === 'many2one' && inverseField.relType !== 'one2many')
                    ) {
                        throw new Error(
                            `Mismatch relations types "${
                                model.name
                            }/${
                                field.name
                            }" (${
                                field.relType
                            }) and "${
                                relatedModel.name
                            }/${
                                field.inverseFieldName
                            }" (${
                                inverseField.relType
                            }).`
                        );
                    }
                }
            }
        },
        /**
         * @private
         * @param {Object} param0
         * @param {web.env} param0.env
         */
        'init/_makeActions'(
            { env }
        ) {
            // process all actions from registry
            env.actions = new Map();
        },
        /**
         * @private
         * @param {Object} param0
         * @param {web.env} param0.env
         */
        'init/_makeModels'(
            { env }
        ) {
            env.models = new Map();
            const allNames = Object.keys(registry);
            const generatedNames = [];
            let toGenerateNames = [...allNames];
            while (toGenerateNames.length > 0) {
                const generatable = toGenerateNames
                    .map(name => registry[name])
                    .find(entry => {
                        let isGenerateable = true;
                        for (const dependencyName of entry.dependencies) {
                            if (!generatedNames.includes(dependencyName)) {
                                isGenerateable = false;
                            }
                        }
                        return isGenerateable;
                    });
                if (!generatable) {
                    throw new Error(`Cannot generate following model: ${toGenerateNames.join(', ')}`);
                }
                // Make environment accessible from model.
                const model = generatable.factory(env.models);
                model.generated();
                model.env = env;
                for (const patch of generatable.patches) {
                    switch (patch.type) {
                        case 'class':
                            patchClassMethods(model, patch.name, patch.patch);
                            break;
                        case 'instance':
                            patch(model, patch.name, patch.patch);
                            break;
                        case 'field':
                            env.services.action.dispatch('init/_applyModelPatchFields', model, patch.patch);
                            break;
                    }
                }
                if (generatedNames.includes(model.name)) {
                    throw new Error(`Duplicate model name "${model.name}" shared on 2 distinct models.`);
                }
                env.models.set(model.name, model);
                generatedNames.push(model.name);
                toGenerateNames = toGenerateNames.filter(name => name !== model.name);
            }
        },
        /**
         * @private
         * @param {Object} param0
         * @param {web.env} param0.env
         * @param {Model} model
         * @param {ModelField} field
         * @returns {ModelField}
         */
        'init/_makeInverseRelationField'(
            { env },
            model,
            field
        ) {
            const relFunc =
                field.relType === 'many2many' ? many2many
                : field.relType === 'many2one' ? one2many
                : field.relType === 'one2many' ? many2one
                : field.relType === 'one2one' ? one2one
                : undefined;
            if (!relFunc) {
                throw new Error(`Cannot compute inverse Relation of "${model.name}/${field.name}".`);
            }
            const fieldName = `_inverse_${model.name}/${field.name}`;
            const inverseField = new ModelField(
                env,
                model,
                fieldName,
                relFunc(model.name, { inverseFieldName: field.name })
            );
            return inverseField;
        },
        /**
         * This function processes definition of declared fields in provided models.
         * Basically, models have fields declared in static prop `fields`, and this
         * function processes and modifies them in place so that they are fully
         * configured. For instance, model relations need bi-directional mapping, but
         * inverse relation may be omitted in declared field: this function auto-fill
         * this inverse relation.
         *
         * @private
         * @param {Object} param0
         * @param {web.env} param0.env
         */
        'init/_processDeclaredFieldsOnModels'(
            { env }
        ) {
            /**
             * 1. Prepare fields.
             */
            for (const model of env.models.values()) {
                // Make fields aware of their field name.
                for (const [fieldName, fieldData] of model.fields.entries()) {
                    model.fields.set(
                        fieldName,
                        new ModelField(env, model, fieldName, { ...fieldData })
                    );
                }
            }
            /**
             * 2. Auto-generate definitions of undeclared inverse relations.
             */
            for (const model of env.models.values()) {
                for (const field of model.fields.values()) {
                    if (field.type !== 'relation') {
                        continue;
                    }
                    if (field.inverseFieldName) {
                        continue;
                    }
                    const relatedModel = env.models.get(field.relModelName);
                    const inverseField = env.services.action.dispatch(
                        'init/_makeInverseRelationField',
                        model,
                        field
                    );
                    field.inverseFieldName = inverseField.name;
                    relatedModel.fields.set(inverseField.name, inverseField);
                }
            }
            /**
             * 3. Extend definition of fields of a model with the definition of
             * fields of its parents. Field definitions on self has precedence over
             * parented fields.
             */
            for (const model of env.models.values()) {
                model.__combinedFields = new Map();
                for (const field of model.fields.values()) {
                    model.__combinedFields.set(field.name, field);
                }
                let targetModel = model.__proto__;
                while (targetModel && targetModel.fields) {
                    for (const targetField of targetModel.fields) {
                        const field = model.__combinedFields.get(targetField.name);
                        if (!field) {
                            model.__combinedFields.set(targetField.name, targetField);
                        }
                    }
                    targetModel = targetModel.__proto__;
                }
            }
            /**
             * 4. Register final fields and make field accessors, to redirects field
             * access to field getter and to prevent field from being written
             * without calling update (which is necessary to process update cycle).
             */
            for (const model of env.models.values()) {
                model.fields = model.__combinedFields;
                // Add field accessors.
                for (const modelField of model.fields.values()) {
                    model.prototype[modelField.name] = function (ctx) {
                        const fieldLocalId = this.fields[modelField.name];
                        const field = env.services.action.dispatch('RecordField/get', fieldLocalId);
                        return env.services.action.dispatch('RecordField/read', field, ctx);
                    };
                    // Object.defineProperty(Model.prototype, field.name, {
                    //     get() {
                    //         return field.get(this); // this is bound to record
                    //     },
                    // });
                }
                delete model.__combinedFields;
            }
        },
    },
});
