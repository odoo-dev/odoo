/** @odoo-module alias=mail.models.Partner.actions.startLoopFetchImStatus **/

import action from 'mail.model.define';

export default action({
    name: 'Partner/startLoopFetchImStatus',
    id: 'mail.models.Partner.actions.startLoopFetchImStatus',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     */
    async func(
        { env },
    ) {
        await env.services.action.dispatch(
            'Partner/_fetchImStatus',
        );
        env.services.action.dispatch(
            'Partner/_loopFetchImStatus',
        );
    },
});
