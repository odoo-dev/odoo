/** @odoo-module alias=mail.models.Thread.actions.computeLastCurrentPartnerMessageSeenByEveryone **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/computeLastCurrentPartnerMessageSeenByEveryone',
    id: 'mail.models.Thread.actions.computeLastCurrentPartnerMessageSeenByEveryone',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} [thread] the concerned thread
     */
    func(
        { env },
        thread,
    ) {
        const threads = thread
            ? [thread]
            : env.services.action.dispatch('Thread/all');
        threads.map(localThread => {
            env.services.action.dispatch(
                'Record/update',
                localThread,
                {
                    lastCurrentPartnerMessageSeenByEveryone:
                        env.services.action.dispatch(
                            'Thread/_computeLastCurrentPartnerMessageSeenByEveryone',
                            localThread,
                        ),
                },
            );
        });
    },
});
