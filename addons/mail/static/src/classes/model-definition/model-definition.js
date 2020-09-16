/** @odoo-module alias=mail.classes.ModelDefinition **/

export default class ModelDefinition {
    /**
     * @param {Object} param0
     * @param {mail.classes.ActionDefinition[]} param0.actions
     * @param {Object} [param0.fields]
     * @param {string} [param0.id]
     * @param {string} param0.modelName
     */
    constructor({
        actions,
        fields,
        id,
        modelName,
    }) {
        /**
         * Action definitions related to this model definition.
         */
        this.actions = actions;
        /**
         * Model field definitions related of this model definition.
         */
        this.fields = fields;
        /**
         * Unique id of this model definition.
         */
        this.id = id; // if not provided, auto-generated
        /**
         * Model name of this model definition.
         */
        this.modelName = modelName;
    }
}
