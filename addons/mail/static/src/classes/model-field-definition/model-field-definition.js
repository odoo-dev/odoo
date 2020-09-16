/** @odoo-module alias=mail.classes.ModelFieldDefinition **/

export default class ModelFieldDefinition {
    /**
     * @param {Object} param0
     * @param {mail.classes.ActionDefinition} [param0.action]
     * @param {any} [param0.default]
     * @param {boolean} [param0.id=false]
     * @param {string} [param0.inverse]
     * @param {boolean} [param0.isCausal=false]
     * @param {boolean} [param0.readonly=false]
     * @param {boolean} [param0.required=false]
     * @param {string} [param0.targetModelName]
     */
    constructor({
        action,
        default: def,
        id = false,
        inverse,
        isCausal = false,
        readonly = false,
        required = false,
        targetModelName,
    }) {
        /**
         * Action definition related to this model field definition (whether
         * compute or related).
         */
        this.action = action;
        /**
         * Default value of this model field definition.
         */
        this.default = def;
        /**
         * States whether this field makes part of identifying record of
         * related model.
         */
        this.id = id;
        /**
         * For relational field: states the field in target model name
         * that is inverse of current model field.
         */
        this.inverse = inverse;
        /**
         * For relational field: states whether deleting of record of this
         * field should also delete records in this relation.
         */
        this.isCausal = isCausal;
        /**
         * States whether this field is readonly or not. By readonly, it means
         * the user cannot manually update the field. However, it doesn't
         * prevent auto-update such as with compute or related.
         */
        this.readonly = readonly;
        /**
         * States whether this field is required to be set for any record.
         */
        this.required = required;
        /**
         * For relational field: state the model name targeted by this
         * relational field.
         */
        this.targetModelName = targetModelName;
    }
}
