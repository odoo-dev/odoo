/** @odoo-module alias=mail.models.Partner.actions.imSearch **/

import action from 'mail.model.define';

import { unaccent } from 'web.utils';

/**
 * Search for partners matching `keyword`.
 */
export default action({
    name: 'Partner/imSearch',
    id: 'mail.models.Partner.actions.imSearch',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {function} param1.callback
     * @param {string} param1.keyword
     * @param {integer} [param1.limit=10]
     */
    async func(
        { ctx, env },
        {
            callback,
            keyword,
            limit = 10,
        },
    ) {
        // prefetched partners
        let partners = [];
        const searchRegexp = new RegExp(
            _.str.escapeRegExp(unaccent(keyword)),
            'i',
        );
        const currentPartner = env.services.model.messaging.currentPartner();
        for (const partner of env.services.action.dispatch(
            'Partner/all',
            partner => partner.active(ctx),
        )) {
            if (partners.length < limit) {
                if (
                    partner !== currentPartner &&
                    searchRegexp.test(partner.name(ctx)) &&
                    partner.user(ctx)
                ) {
                    partners.push(partner);
                }
            }
        }
        if (!partners.length) {
            const partnersData = await env.services.rpc(
                {
                    model: 'res.partner',
                    method: 'im_search',
                    args: [keyword, limit],
                },
                { shadow: true },
            );
            const newPartners = env.services.action.dispatch(
                'Partner/insert',
                partnersData.map(
                    partnerData => env.services.action.dispatch(
                        'Partner/convertData',
                        partnerData,
                    ),
                ),
            );
            partners.push(...newPartners);
        }
        callback(partners);
    },
});
