/** @odoo-module alias=mail.models.RecordField **/

import model from 'mail.model.define';

export default model({
    name: 'RecordField',
    id: 'mail.model.RecordField',
    global: true,
    actions: [
        'mail.model.RecordField.actions._convertX2ManyValue',
        'mail.model.RecordField.actions._linkX2Many',
        'mail.model.RecordField.actions._linkX2One',
        'mail.model.RecordField.actions._unlinkX2Many',
        'mail.model.RecordField.actions._unlinkX2One',
        'mail.model.RecordField.actions._verifyRelationalValue',
        'mail.model.RecordField.actions.clear',
        'mail.model.RecordField.actions.compute',
        'mail.model.RecordField.actions.create',
        'mail.model.RecordField.actions.insert',
        'mail.model.RecordField.actions.insertAndReplace',
        'mail.model.RecordField.actions.link',
        'mail.model.RecordField.actions.read',
        'mail.model.RecordField.actions.replace',
        'mail.model.RecordField.actions.set',
        'mail.model.RecordField.actions.unlink',
        'mail.model.RecordField.actions.unlinkAll',
    ],
});

// class RecordField {

//     //--------------------------------------------------------------------------
//     // Public
//     //--------------------------------------------------------------------------

//     /**
//      * @param {web.env} env
//      * @param {ModelField} modelField
//      * @param {any} value
//      * @param {Record} record
//      */
//     constructor({ localId, modelField, record, value }) {
//         this.modelFieldLocalId = modelField.localId;
//         this.localId = localId;
//         this.recordLocalId = record.localId;
//         this.value = value;

//         this.env.services.action.dispatch('RecordField/register', this);
//         record.addField(this);
//         if (this.type === 'relation') {
//             if (['one2many', 'many2many'].includes(this.relType)) {
//                 this.value = new Set();
//             }
//         }
//         if (this.compute) {
//             this._compute = this.compute;
//         }
//         if (this.related) {
//             this._compute = this._computeRelated;
//         }
//     }

//     //--------------------------------------------------------------------------
//     // Public
//     //--------------------------------------------------------------------------

//     /**
//      * @static
//      * @param {ModelField} definition
//      * @param {Record} record
//      * @returns {string}
//      */
//     static makeLocalId(definition, record) {
//         return `Field__${record.localId}__${definition.name}`;
//     }

//     /**
//      * @returns {ModelField}
//      */
//     get def() {
//         return this.env.services.action.dispatch('ModelField/get', this._modelFieldLocalId);
//     }

//     /**
//      * @returns {Record}
//      */
//     get record() {
//         return this.env.services.action.dispatch('Record/get', this._recordLocalId);
//     }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    // /**
    //  * Compute method when this field is related.
    //  *
    //  * @private
    //  * @param {RecordField} field
    //  * @returns {any}
    //  */
    // 'RecordField/_computeRelated'(field) {
    //     const [relationName, relatedFieldName] = field.related.split('.');
    //     const model = field.record.model;
    //     const relationField = model.fields.get(relationName);
    //     if (['one2many', 'many2many'].includes(relationField.relType)) {
    //         const newVal = [];
    //         for (const otherRecord of field.record[relationName]()) {
    //             const otherField = otherRecord.field(relatedFieldName);
    //             const otherValue = this.env.services.action.dispatch('RecordField/read', otherField);
    //             if (otherValue) {
    //                 if (otherValue instanceof Array) {
    //                     // avoid nested array if otherField is x2many too
    //                     // TODO IMP task-2261221
    //                     for (const v of otherValue) {
    //                         newVal.push(v);
    //                     }
    //                 } else {
    //                     newVal.push(otherValue);
    //                 }
    //             }
    //         }
    //         if (field.type === 'relation') {
    //             return env.services.action.dispatch('RecordFieldCommand/replace', newVal);
    //         }
    //         return newVal;
    //     }
    //     const otherRecord = field.record[relationName]();
    //     if (otherRecord) {
    //         const otherField = otherRecord.field(relatedFieldName);
    //         const newVal = this.env.services.action.dispatch('RecordField/read', otherField);
    //         if (field.type === 'relation') {
    //             if (newVal) {
    //                 return env.services.action.dispatch('RecordFieldCommand/replace', newVal);
    //             } else {
    //                 return env.services.action.dispatch('RecordFieldCommand/unlinkAll');
    //             }
    //         }
    //         return newVal;
    //     }
    //     if (field.type === 'relation') {
    //         return [];
    //     }
    // }
