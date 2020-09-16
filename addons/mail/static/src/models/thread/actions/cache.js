/** @odoo-module alias=mail.models.Thread.actions.cache **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/cache',
    id: 'mail.models.Thread.actions.cache',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {string} [stringifiedDomain='[]']
     * @returns {ThreadCache}
     */
    func(
        { env },
        thread,
        stringifiedDomain = '[]',
    ) {
        return env.services.action.dispatch(
            'ThreadCache/insert',
            {
                stringifiedDomain: stringifiedDomain,
                thread: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    thread,
                ),
            },
        );
    },
});
