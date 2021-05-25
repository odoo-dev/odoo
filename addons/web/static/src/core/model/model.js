/** @odoo-module **/

const { EventBus } = owl.core;

export class Model extends EventBus {
    /**
     * @param {object} env
     */
    constructor(env) {
        super();
        this.env = env;
        this.setup();
    }

    setup() {}
}
