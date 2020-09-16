/** @odoo-module alias=mail.models.Message.actions.convertData **/

import action from 'mail.action.define';

import { str_to_datetime } from 'web.time';

export default action({
    name: 'Message/convertData',
    id: 'mail.models.Message.actions.convertData',
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
        if ('attachment_ids' in data) {
            if (!data.attachment_ids) {
                data2.attachments = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                data2.attachments = env.services.action.dispatch(
                    'RecordFieldCommand/insertAndReplace',
                    data.attachment_ids.map(
                        attachmentData => env.services.action.dispatch(
                            'Attachment/convertData',
                            attachmentData,
                        ),
                    ),
                );
            }
        }
        if ('author_id' in data) {
            if (!data.author_id) {
                data2.author = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else if (data.author_id[0] !== 0) {
                // partner id 0 is a hack of message_format to refer to an
                // author non-related to a partner. display_name equals
                // email_from, so this is omitted due to being redundant.
                data2.author = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        displayName: data.author_id[1],
                        id: data.author_id[0],
                    },
                );
            }
        }
        if ('body' in data) {
            data2.body = data.body;
        }
        if ('channel_ids' in data && data.channel_ids) {
            const channels = data.channel_ids
                .map(channelId =>
                    env.services.action.dispatch(
                        'Thread/findById',
                        {
                            id: channelId,
                            model: 'mail.channel',
                        },
                    ),
                ).filter(channel => !!channel);
            data2.serverChannels = env.services.action.dispatch(
                'RecordFieldCommand/replace',
                channels,
            );
        }
        if ('date' in data && data.date) {
            data2.date = moment(str_to_datetime(data.date));
        }
        if ('email_from' in data) {
            data2.emailFrom = data.email_from;
        }
        if ('history_partner_ids' in data) {
            data2.isHistory = data.history_partner_ids.includes(
                env.services.model.messaging.currentPartner().id(),
            );
        }
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('is_discussion' in data) {
            data2.isDiscussion = data.is_discussion;
        }
        if ('is_note' in data) {
            data2.isNote = data.is_note;
        }
        if ('is_notification' in data) {
            data2.isNotification = data.is_notification;
        }
        if ('message_type' in data) {
            data2.type = data.message_type;
        }
        if ('model' in data && 'res_id' in data && data.model && data.res_id) {
            const originThreadData = {
                id: data.res_id,
                model: data.model,
            };
            if ('record_name' in data && data.record_name) {
                originThreadData.name = data.record_name;
            }
            if ('res_model_name' in data && data.res_model_name) {
                originThreadData.modelName = data.res_model_name;
            }
            if ('module_icon' in data) {
                originThreadData.moduleIcon = data.module_icon;
            }
            data2.originThread = env.services.action.dispatch(
                'RecordFieldCommand/insert',
                originThreadData,
            );
        }
        if ('moderation_status' in data) {
            data2.moderationStatus = data.moderation_status;
        }
        if ('needaction_partner_ids' in data) {
            data2.isNeedaction = data.needaction_partner_ids.includes(
                env.services.model.messaging.currentPartner().id(),
            );
        }
        if ('notifications' in data) {
            data2.notifications = env.services.action.dispatch(
                'RecordFieldCommand/insert',
                data.notifications.map(
                    notificationData => env.services.action.dispatch(
                        'Notification/convertData',
                        notificationData,
                    ),
                ),
            );
        }
        if ('starred_partner_ids' in data) {
            data2.isStarred = data.starred_partner_ids.includes(
                env.services.model.messaging.currentPartner().id(),
            );
        }
        if ('subject' in data) {
            data2.subject = data.subject;
        }
        if ('subtype_description' in data) {
            data2.subtypeDescription = data.subtype_description;
        }
        if ('subtype_id' in data) {
            data2.subtypeId = data.subtype_id;
        }
        if ('tracking_value_ids' in data) {
            data2.trackingValues = data.tracking_value_ids;
        }
        return data2;
    },
});
