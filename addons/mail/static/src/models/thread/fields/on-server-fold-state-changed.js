/** @odoo-module alias=mail.models.Thread.fields.onServerFoldStateChanged **/

import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to trigger `onServerFoldStateChanged` when one of
 * the dependencies changes.
 */
export default attr({
    name: 'onServerFoldStateChanged',
    id: 'mail.models.Thread.fields.onServerFoldStateChanged',
    global: true,
    dependencies: [
        'serverFoldState',
    ],
    /**
     * Handles change of fold state coming from the server. Useful to
     * synchronize corresponding chat window.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     */
    compute({ ctx, env, record }) {
        if (!env.services.model.messaging.chatWindowManager(ctx)) {
            // avoid crash during destroy
            return;
        }
        if (env.services.model.messaging.device(ctx).isMobile(ctx)) {
            return;
        }
        if (record.serverFoldState(ctx) === 'closed') {
            env.services.action.dispatch(
                'ChatWindowManager/closeThread',
                env.services.model.messaging.chatWindowManager(ctx),
                record,
                { notifyServer: false },
            );
        } else {
            env.services.action.dispatch(
                'ChatWindowManager/openThread',
                env.services.model.messaging.chatWindowManager(ctx),
                record,
                {
                    isFolded: record.serverFoldState(ctx) === 'folded',
                    notifyServer: false,
                },
            );
        }
    },
});
