/** @odoo-module alias=mail.services.Model **/

import AbstractService from 'web.AbstractService';

export default AbstractService.extend({
    /**
     * @override {web.AbstractService}
     */
    start() {
        this._super(...arguments);

        this['Action/name => Action/id'] = new Map();
        this['Item/id => Item'] = new Map();
        this['Model/name => Model/id'] = new Map();

        this.env.services.model.messagingCreatedPromise.then(() => this.env.services.model.messaging.start());
    },
    doAction(actionName, ...args) {
        const actionId = this['Action/name => Action/id'].get(actionName);
        const action = this['Item/id => Item'].get(actionId);
        return action.do(...args);
    },
});
