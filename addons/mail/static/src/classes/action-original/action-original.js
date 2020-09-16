/** @odoo-module alias=mail.classes.ActionOriginal **/

export default class ActionOriginal {
    constructor({
        actionName,
        id,
        func,
    }) {
        /**
         * Name of the action of this action original.
         */
        this.actionName = actionName;
        /**
         * Behaviour related to this action original.
         */
        this.func = func;
        /**
         * Unique id of this action original.
         */
        this.id = id;
    }
}