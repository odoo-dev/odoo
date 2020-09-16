/** @odoo-module alias=mail.models.Discuss.actions.clearReplyingToMessage **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/clearReplyingToMessage',
    id: 'mail.models.Discuss.actions.clearReplyingToMessage',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     */
    func(
        { env },
        discuss,
    ) {
        env.services.action.dispatch(
            'Record/update',
            discuss,
            {
                replyingToMessage: env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                ),
            },
        );
    },
});
