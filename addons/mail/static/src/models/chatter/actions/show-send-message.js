/** @odoo-module alias=mail.models.Chatter.actions.showSendMessage **/

import action from 'mail.action.define';

export default action({
    name: 'Chatter/showSendMessage',
    id: 'mail.models.Chatter.actions.showSendMessage',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Chatter} chatter
     */
    func(
        { ctx, env },
        chatter,
    ) {
        env.services.action.dispatch(
            'Record/update',
            chatter,
            { isComposerVisible: true });
        env.services.action.dispatch(
            'Record/update',
            chatter.thread(ctx).composer(ctx),
            { isLog: false },
        );
        env.services.action.dispatch(
            'Chatter/focus',
            chatter,
        );
    },
});
