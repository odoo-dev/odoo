/** @odoo-module alias=mail.classes.RecordFieldCommand **/

/**
 * Allows field update to detect if the value it received is a command to
 * execute (in which was it will be an instance of this class) or an actual
 * value to set (in all other cases).
 */
export class RecordFieldCommand {
    /**
     * @constructor
     * @param {function} func function to call when executing this command.
     * The function should ALWAYS return a boolean value
     * to indicate whether the value changed.
     */
    constructor(func) {
        this.func = func;
    }

    /**
     * @param {web.env} env
     * @param {ModelField} field
     * @param {Object} [options]
     * @returns {boolean} whether the value changed for the current field
     */
    execute(env, field, options) {
        return this.func(env, field, options);
    }
}
