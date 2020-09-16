/** @odoo-module alias=website_livechat.models.Visitor.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'Visitor/convertData',
    id: 'website_livechat.models.Visitor.actions.convertData',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} data
     */
    func(
        { env },
        data,
    ) {
        const data2 = {};
        if ('country_id' in data) {
            if (data.country_id) {
                data2.country = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        id: data.country_id,
                        code: data.country_code,
                    },
                );
            } else {
                data2.country = env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            }
        }
        if ('history' in data) {
            data2.history = data.history;
        }
        if ('is_connected' in data) {
            data2.isConnected = data.is_connected;
        }
        if ('lang_name' in data) {
            data2.langName = data.lang_name;
        }
        if ('display_name' in data) {
            data2.displayName = data.display_name;
        }
        if ('partner_id' in data) {
            if (data.partner_id) {
                data2.partner = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    { id: data.partner_id },
                );
            } else {
                data2.partner = env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            }
        }
        if ('website_name' in data) {
            data2.websiteName = data.website_name;
        }
        return data2;
    },
});
