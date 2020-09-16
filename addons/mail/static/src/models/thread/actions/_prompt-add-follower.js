/** @odoo-module alias=mail.models.Thread.actions._promptAddFollower **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/_promptAddFollower',
    id: 'mail.models.Thread.actions._promptAddFollower',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {Object} [param2={}]
     * @param {boolean} [param2.mail_invite_follower_channel_only=false]
     */
    func(
        { ctx, env },
        thread,
        { mail_invite_follower_channel_only = false } = {},
    ) {
        const action = {
            type: 'ir.actions.act_window',
            res_model: 'mail.wizard.invite',
            view_mode: 'form',
            views: [[false, 'form']],
            name: env._t("Invite Follower"),
            target: 'new',
            context: {
                default_res_model: thread.model(ctx),
                default_res_id: thread.id(ctx),
                mail_invite_follower_channel_only,
            },
        };
        env.bus.trigger('do-action', {
            action,
            options: {
                on_close: async () => {
                    await env.services.action.dispatch(
                        'Record/doAsync',
                        thread,
                        () => env.services.action.dispatch(
                            'Thread/refreshFollowers',
                            thread,
                        ),
                    );
                    env.bus.trigger('Thread:promptAddFollower-closed');
                },
            },
        });
    },
});
