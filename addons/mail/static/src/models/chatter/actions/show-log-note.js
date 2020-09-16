/** @odoo-module alias=mail.models.Chatter.actions.showLogNote **/

import action from 'mail.action.define';

export default action({
    name: 'Chatter/showLogNote',
    id: 'mail.models.Chatter.actions.showLogNote',
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
            { isComposerVisible: true },
        );
        env.services.action.dispatch(
            'Record/update',
            chatter.thread(ctx).composer(ctx),
            { isLog: true },
        );
        env.services.action.dispatch(
            'Chatter/focus',
            chatter,
        );
    },
});
