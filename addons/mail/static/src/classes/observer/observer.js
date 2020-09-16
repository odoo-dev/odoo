/** @odoo-module alias=mail.classes.Observer **/

class Observer {
    /**
     * @param {web.env} env
     * @param {owl.Component|field} ctx
     */
    constructor(env, ctx) {
        this.env = env;
        this.localId = ctx.localId;
        this.observees = new Set();
        this.rev = 0;
    }
}

export default Observer;
