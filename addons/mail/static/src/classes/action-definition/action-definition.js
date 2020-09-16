/** @odoo-module alias=mail.classes.ActionDefinition **/

export default class ActionDefinition {
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
         * Name of the action of this action definition.
         */
        this.actionName = actionName;
        /**
         * Behaviour related to this action definition.
         */
        this.func = func;
        /**
         * Unique id of this action definition.
         */
        this.id = id; // if not provided, auto-generated
    }
}