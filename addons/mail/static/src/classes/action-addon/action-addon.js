/** @odoo-module alias=mail.classes.ActionAddon **/

class ActionAddon {
    /**
     * @param {string} id
     */
    constructor(id) {
        /**
         * Model addon id that this action addon is related to. Undefined when
         * this action addon is not related to a model addon id.
         */
        this['ModelAddon/id'] = undefined;
        /**
         * Model field addon id that this action addon is related to.
         * Undefined when this action addon is not related to a model field
         * addon.
         */
        this['ModelFieldAddon/id'] = undefined;
        /**
         * Behaviour related to this action addon.
         */
        this.func = undefined;
        /**
         * Unique id of this action addon.
         */
        this.id = id;
    }
}

export default ActionAddon;
