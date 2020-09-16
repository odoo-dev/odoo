/** @odoo-module alias=mail.models.User.lifecycles.onDelete **/

import lifecycle from 'mail.model.lifecycle.define';

export default lifecycle({
    name: 'onDelete',
    id: 'mail.models.User.lifecycles.onDelete',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {User} param0.record
     */
    func({ ctx, env, record }) {
        if (env.services.model.messaging) {
            if (record === env.services.model.messaging.currentUser(ctx)) {
                env.services.action.dispatch(
                    'Record/update',
                    env.services.model.messaging,
                    {
                        currentUser: env.services.action.dispatch(
                            'RecordFieldCommand/unlink',
                        ),
                    },
                );
            }
        }
    },
});
