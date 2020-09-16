/** @odoo-module alias=mail.models.Activity.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'Activity/convertData',
    id: 'mail.models.Activity.actions.convertData',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} data
     * @returns {Object}
     */
    func(
        { env },
        data,
    ) {
        const data2 = {};
        if ('activity_category' in data) {
            data2.category = data.activity_category;
        }
        if ('can_write' in data) {
            data2.canWrite = data.can_write;
        }
        if ('create_date' in data) {
            data2.dateCreate = data.create_date;
        }
        if ('date_deadline' in data) {
            data2.dateDeadline = data.date_deadline;
        }
        if ('chaining_type' in data) {
            data2.chainingType = data.chaining_type;
        }
        if ('icon' in data) {
            data2.icon = data.icon;
        }
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('note' in data) {
            data2.note = data.note;
        }
        if ('state' in data) {
            data2.state = data.state;
        }
        if ('summary' in data) {
            data2.summary = data.summary;
        }
        // relation
        if ('activity_type_id' in data) {
            if (!data.activity_type_id) {
                data2.type = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                data2.type = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        displayName: data.activity_type_id[1],
                        id: data.activity_type_id[0],
                    },
                );
            }
        }
        if ('create_uid' in data) {
            if (!data.create_uid) {
                data2.creator = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                data2.creator = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        displayName: data.create_uid[1],
                        id: data.create_uid[0],
                    },
                );
            }
        }
        if ('mail_template_ids' in data) {
            data2.mailTemplates = env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: data.mail_template_ids.id,
                    name: data.mail_template_ids.name,
                },
            );
        }
        if ('res_id' in data && 'res_model' in data) {
            data2.thread = env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: data.res_id,
                    model: data.res_model,
                },
            );
        }
        if ('user_id' in data) {
            if (!data.user_id) {
                data2.assignee = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                data2.assignee = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        displayName: data.user_id[1],
                        id: data.user_id[0],
                    },
                );
            }
        }
        if ('request_partner_id' in data) {
            if (!data.request_partner_id) {
                data2.requestingPartner = env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            } else {
                data2.requestingPartner = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        displayName: data.request_partner_id[1],
                        id: data.request_partner_id[0],
                    },
                );
            }
        }
        return data2;
    },
});
