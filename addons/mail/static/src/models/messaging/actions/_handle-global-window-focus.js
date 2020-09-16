/** @odoo-module alias=mail.models.Messaging.actions._handleGlobalWindowFocus **/

import action from 'mail.action.define';

export default action({
    name: 'Messaging/_handleGlobalWindowFocus',
    id: 'mail.models.Messaging.actions._handleGlobalWindowFocus',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Messaging} messaging
     */
    func(
        { env },
        messaging,
    ) {
        env.services.action.dispatch(
            'Record/update',
            messaging,
            { outOfFocusUnreadMessageCounter: 0 },
        );
        env.bus.trigger(
            'set_title_part',
            { part: '_chat' },
        );
    },
});
