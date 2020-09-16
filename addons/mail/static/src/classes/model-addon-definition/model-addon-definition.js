/** @odoo-module alias=mail.classes.ModelAddonDefinition **/

export default class ModelAddonDefinition {
    /**
     * @param {Object} param0
     * @param {mail.classes.ActionAddonDefinition[]} [param0.actionAddons]
     * @param {mail.classes.ActionDefinition[]} [param0.actions]
     * @param {Object} [param0.fields]
     * @param {string} [param0.id]
     * @param {string} param0.modelName
     */
    constructor({
        actionAddons,
        actions,
        fields,
        id,
        modelName,
    }) {
        /**
         * Action addon definitions related to this model addon definition.
         */
        this.actionAddons = actionAddons;
        /**
         * Action definitions related to this model addon definition.
         */
        this.actions = actions;
        /**
         * Model field definitions related of this model addon definition.
         */
        this.fields = fields;
        /**
         * Unique id of this model addon definition.
         */
        this.id = id; // if not provided, auto-generated
        /**
         * Model name of this model addon definition.
         */
        this.modelName = modelName;
    }
}
