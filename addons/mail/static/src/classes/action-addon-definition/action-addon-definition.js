/** @odoo-module alias=mail.classes.ActionAddonDefinition **/

export default class ActionAddonDefinition {
    /**
     * @param {Object} param0
     * @param {string} param0.actionName
     * @param {string} [param0.id]
     * @param {function} param0.func
     */
    constructor({
        actionName,
        id,
        func,
    }) {
        /**
         * Name of the action of this action addon definition.
         */
        this.actionName = actionName;
        /**
         * Behaviour related to this action addon definition.
         */
        this.func = func;
        /**
         * Unique id of this action addon definition.
         */
        this.id = id; // if not provided, auto-generated
    }
}