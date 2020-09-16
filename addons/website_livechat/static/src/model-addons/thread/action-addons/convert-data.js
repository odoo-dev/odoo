/** @odoo-module alias=website_livechat.modelAddons.Thread **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'Thread',
    id: 'website_livechat.modelAddons.Thread.actionAddons.convertData',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {Object} data
     */
    func(
        { env, original },
        data,
    ) {
        const data2 = original(data);
        if ('visitor' in data) {
            if (data.visitor) {
                data2.visitor = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    env.services.action.dispatch(
                        'Visitor/convertData',
                        data.visitor,
                    ),
                );
            } else {
                data2.visitor = env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            }
        }
        return data2;
    },
});
