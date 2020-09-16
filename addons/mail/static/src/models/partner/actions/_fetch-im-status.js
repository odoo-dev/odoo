/** @odoo-module alias=mail.models.Partner.actions._fetchImStatus **/

import action from 'mail.model.define';

export default action({
    name: 'Partner/_fetchImStatus',
    id: 'mail.models.Partner.actions._fetchImStatus',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     */
    async func(
        { ctx, env },
    ) {
        const partnerIds = [];
        for (const partner of env.services.action.dispatch('Partner/all')) {
            if (
                partner.imStatus() !== 'im_partner' &&
                partner.id(ctx) > 0
            ) {
                partnerIds.push(partner.id());
            }
        }
        if (partnerIds.length === 0) {
            return;
        }
        const dataList = await env.services.rpc({
            route: '/longpolling/im_status',
            params: {
                partner_ids: partnerIds,
            },
        }, { shadow: true });
        env.services.action.dispatch(
            'Partner/insert',
            dataList.map(
                data => {
                    return {
                        id: data.id,
                        im_status: data.im_status,
                    };
                },
            ),
        );
    },
});
