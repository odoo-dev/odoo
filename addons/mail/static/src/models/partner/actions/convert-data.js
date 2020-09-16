/** @odoo-module alias=mail.models.Partner.actions.convertData **/

import action from 'mail.model.define';

export default action({
    name: 'Partner/convertData',
    id: 'mail.models.Partner.actions.convertData',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} data
     * @return {Object}
     */
    func(
        { env },
        data,
    ) {
        const data2 = {};
        if ('active' in data) {
            data2.active = data.active;
        }
        if ('country' in data) {
            if (!data.country) {
                data2.country = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                data2.country = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        id: data.country[0],
                        name: data.country[1],
                    },
                );
            }
        }
        if ('display_name' in data) {
            data2.displayName = data.display_name;
        }
        if ('email' in data) {
            data2.email = data.email;
        }
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('im_status' in data) {
            data2.imStatus = data.im_status;
        }
        if ('name' in data) {
            data2.name = data.name;
        }
        // relation
        if ('user_id' in data) {
            if (!data.user_id) {
                data2.user = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                let user = {};
                if (Array.isArray(data.user_id)) {
                    user = {
                        displayName: data.user_id[1],
                        id: data.user_id[0],
                    };
                } else {
                    user = {
                        id: data.user_id,
                    };
                }
                data2.user = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    user,
                );
            }
        }
        return data2;
    },
});
