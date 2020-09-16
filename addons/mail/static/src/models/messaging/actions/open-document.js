/** @odoo-module alias=mail.models.Messaging.actions.openDocument **/

import action from 'mail.action.define';

/**
 * Opens the form view of the record with provided id and model.
 */
export default action({
    name: 'Messaging/openDocument',
    id: 'mail.models.Messaging.actions.openDocument',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {integer} param1.id
     * @param {string} param1.model
     */
    async 'Messaging/openDocument'(
        { ctx, env },
        {
            id,
            model,
        },
    ) {
        env.bus.trigger('do-action', {
            action: {
                type: 'ir.actions.act_window',
                res_model: model,
                views: [[false, 'form']],
                res_id: id,
            },
        });
        if (env.services.model.messaging.device(ctx).isMobile(ctx)) {
            // messaging menu has a higher z-index than views so it must
            // be closed to ensure the visibility of the view
            env.services.action.dispatch(
                'MessagingMenu/close',
                env.services.model.messaging.messagingMenu(ctx),
            );
        }
    },
});
