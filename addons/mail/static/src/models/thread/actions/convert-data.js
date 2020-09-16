/** @odoo-module alias=mail.models.Thread.actions.convertData **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/convertData',
    id: 'mail.models.Thread.actions.convertData',
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
        const data2 = {
            messagesAsServerChannel: [],
        };
        if ('model' in data) {
            data2.model = data.model;
        }
        if ('channel_type' in data) {
            data2.channelType = data.channel_type;
            data2.model = 'mail.channel';
        }
        if ('create_uid' in data) {
            data2.creator = env.services.action.dispatch(
                'RecordFieldCommand/insert',
                { id: data.create_uid },
            );
        }
        if ('custom_channel_name' in data) {
            data2.customChannelName = data.custom_channel_name;
        }
        if ('group_based_subscription' in data) {
            data2.isGroupBasedSubscription = data.group_based_subscription;
        }
        if ('id' in data) {
            data2.id = data.id;
        }
        if ('is_minimized' in data && 'state' in data) {
            data2.serverFoldState = data.is_minimized ? data.state : 'closed';
        }
        if ('is_moderator' in data) {
            data2.isModerator = data.is_moderator;
        }
        if ('is_pinned' in data) {
            data2.isServerPinned = data.is_pinned;
        }
        if ('last_message' in data && data.last_message) {
            data2.messagesAsServerChannel.push(
                env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    { id: data.last_message.id },
                ),
            );
            data2.serverLastMessageId = data.last_message.id;
        }
        if ('last_message_id' in data && data.last_message_id) {
            data2.messagesAsServerChannel.push(
                env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    { id: data.last_message_id },
                ),
            );
            data2.serverLastMessageId = data.last_message_id;
        }
        if ('mass_mailing' in data) {
            data2.isMassMailing = data.mass_mailing;
        }
        if ('moderation' in data) {
            data2.moderation = data.moderation;
        }
        if ('message_needaction_counter' in data) {
            data2.messageNeedactionCounter = data.message_needaction_counter;
        }
        if ('message_unread_counter' in data) {
            data2.serverMessageUnreadCounter = data.message_unread_counter;
        }
        if ('name' in data) {
            data2.name = data.name;
        }
        if ('public' in data) {
            data2.public = data.public;
        }
        if ('seen_message_id' in data) {
            data2.lastSeenByCurrentPartnerMessageId = data.seen_message_id || 0;
        }
        if ('uuid' in data) {
            data2.uuid = data.uuid;
        }
        // relations
        if ('members' in data) {
            if (!data.members) {
                data2.members = env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                );
            } else {
                data2.members = env.services.action.dispatch(
                    'RecordFieldCommand/insertAndReplace',
                    data.members.map(
                        memberData => env.services.action.dispatch(
                            'Partner/convertData',
                            memberData,
                        ),
                    ),
                );
            }
        }
        if ('seen_partners_info' in data) {
            if (!data.seen_partners_info) {
                data2.partnerSeenInfos =
                    env.services.action.dispatch(
                        'RecordFieldCommand/unlinkAll',
                    );
            } else {
                /**
                 * FIXME: not optimal to write on relation given the fact
                 * that the relation will be (re)computed based on given
                 * fields.
                 * (here channelId will compute partnerSeenInfo.thread)
                 * task-2336946
                 */
                data2.partnerSeenInfos = env.services.action.dispatch(
                    'RecordFieldCommand/insertAndReplace',
                    data.seen_partners_info.map(
                        ({ fetched_message_id, partner_id, seen_message_id }) => {
                            return {
                                channelId: data2.id,
                                lastFetchedMessage: fetched_message_id
                                    ? env.services.action.dispatch(
                                        'RecordFieldCommand/insert',
                                        { id: fetched_message_id },
                                    )
                                    : env.services.action.dispatch(
                                        'RecordFieldCommand/unlinkAll',
                                    ),
                                lastSeenMessage: seen_message_id
                                    ? env.services.action.dispatch(
                                        'RecordFieldCommand/insert',
                                        { id: seen_message_id },
                                    )
                                    : env.services.action.dispatch(
                                        'RecordFieldCommand/unlinkAll',
                                    ),
                                partnerId: partner_id,
                            };
                        },
                    ),
                );
                if (data.id) {
                    const messageIds = data.seen_partners_info.reduce(
                        (currentSet, { fetched_message_id, seen_message_id }) => {
                            if (fetched_message_id) {
                                currentSet.add(fetched_message_id);
                            }
                            if (seen_message_id) {
                                currentSet.add(seen_message_id);
                            }
                            return currentSet;
                        },
                        new Set(),
                    );
                    if (messageIds.size > 0) {
                        /**
                         * FIXME: not optimal to write on relation given the fact that the relation
                         * will be (re)computed based on given fields.
                         * (here channelId will compute messageSeenIndicator.thread))
                         * task-2336946
                         */
                        data2.messageSeenIndicators = env.services.action.dispatch(
                            'RecordFieldCommand/insert',
                            [...messageIds].map(
                                messageId => {
                                    return {
                                        channelId: data.id,
                                        messageId: messageId,
                                    };
                                },
                            ),
                        );
                    }
                }
            }
        }
        return data2;
    },
});
