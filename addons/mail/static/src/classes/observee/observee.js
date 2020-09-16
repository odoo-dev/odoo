/** @odoo-module alias=mail.classes.Observee **/

class Observee {
    /**
     * @param {web.env} env
     * @param {Field} field
     */
    constructor(env, field) {
        this.env = env;
        this.localId = field.localId;
        this.observers = new Set();
    }
}

export default Observee;
