/** @odoo-module alias=mail.classes.Action **/

class Action {
    constructor() {
        /**
         * Action addon ids related to this action.
         */
        this['<ActionAddon/id>'] = new Set();
        /**
         * Action original id related to this action.
         */
        this['ActionOriginal/id'] = undefined;
        /**
         * Unique id of this action, used to get action from id using
         * env['Item/id => Item'].
         */
        this.id = undefined;
        /**
         * Name of this action.
         */
        this.name = undefined;
    }
}

export default Action;
