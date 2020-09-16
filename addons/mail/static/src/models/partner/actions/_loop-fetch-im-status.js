/** @odoo-module alias=mail.models.Partner.actions._loopFetchImStatus **/

import action from 'mail.model.define';

export default action({
    name: 'Partner/_loopFetchImStatus',
    id: 'mail.models.Partner.actions._loopFetchImStatus',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     */
    func(
        { env },
    ) {
        setTimeout(async () => {
            await env.services.action.dispatch(
                'Partner/_fetchImStatus',
            );
            env.services.action.dispatch(
                'Partner/_loopFetchImStatus',
            );
        }, 50 * 1000);
    },
});
