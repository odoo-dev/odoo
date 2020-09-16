/** @odoo-module alias=mail.models.Partner.actions.openProfile **/

import action from 'mail.model.define';

/**
 * Opens the most appropriate view that is a profile for this partner.
 */
export default action({
    name: 'Partner/openProfile',
    id: 'mail.models.Partner.actions.openProfile',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Partner} partner
     */
     async func(
        { ctx, env },
        partner,
    ) {
        return env.services.action.dispatch(
            'Messaging/openDocument',
            {
                id: partner.id(ctx),
                model: 'res.partner',
            },
        );
    },
});
