odoo.define('mail.store.mutations', function (require) {
"use strict";

const AttachmentViewer = require('mail.component.AttachmentViewer');

const core = require('web.core');
const time = require('web.time');

const _t = core._t;

const mutations = {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} chatWindowLocalId either 'new_message' or thread local Id, a
     *   valid Id in `chatWindowLocalIds` list of chat window manager.
     */
    closeChatWindow({ commit, state }, chatWindowLocalId) {
        const cwm = state.chatWindowManager;
        cwm.chatWindowLocalIds =
            cwm.chatWindowLocalIds.filter(id => id !== chatWindowLocalId);
        if (chatWindowLocalId !== 'new_message') {
            commit('updateThread', chatWindowLocalId, {
                is_minimized: false,
                state: 'closed',
            });
        }
        commit('_computeChatWindows');
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} dialogId
     */
    closeDialog({ state }, dialogId) {
        state.dialogManager.dialogs =
            state.dialogManager.dialogs.filter(item => item.id !== dialogId);
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     */
    closeDiscuss({ commit, state }) {
        if (!state.discuss.isOpen) {
            return;
        }
        Object.assign(state.discuss, {
            activeMobileNavbarTabId: 'mailbox',
            activeThreadLocalId: undefined,
            domain: [],
            isOpen: false,
            stringifiedDomain: '[]',
            targetThreadCounter: 0,
            targetThreadLocalId: null,
        });
        commit('_computeChatWindows');
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     */
    closeMessagingMenu({ state }) {
        Object.assign(state.messagingMenu, {
            activeTabId: 'all',
            isMobileNewMessageToggled: false,
            isOpen: false,
        });
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} data
     * @param {string} data.filename
     * @param {integer} [data.id]
     * @param {boolean} [data.isTemporary=false]
     * @param {string} [data.mimetype]
     * @param {string} [data.name]
     * @param {integer} [data.size]
     * @return {string} attachment local Id
     */
    createAttachment({ commit, state }, data) {
        let {
            filename,
            id,
            isTemporary=false,
            mimetype,
            name,
            res_id,
            res_model,
            size,
        } = data;
        if (isTemporary) {
            id = state.attachmentNextTemporaryId;
            mimetype = '';
            state.attachmentNextTemporaryId--;
        }
        const attachment = {
            filename,
            id,
            isTemporary,
            mimetype,
            name,
            res_id,
            res_model,
            size,
        };

        commit('_computeAttachment', attachment);
        owl.core.Observer.set(state.attachments, attachment.localId, attachment);
        if (isTemporary) {
            owl.core.Observer.set(
                state.temporaryAttachmentLocalIds,
                attachment.filename,
                attachment.localId);
        } else {
            // check if there is a temporary attachment linked to this attachment,
            // and remove + replace it in the composer at the correct position
            const temporaryAttachmentLocalId = state.temporaryAttachmentLocalIds[filename];
            if (temporaryAttachmentLocalId) {
                // change temporary attachment links with non-temporary one
                const temporaryAttachment = state.attachments[temporaryAttachmentLocalId];
                const composerId = temporaryAttachment.composerId;
                if (composerId) {
                    commit('_replaceAttachmentInComposer',
                        composerId,
                        temporaryAttachmentLocalId,
                        attachment.localId);
                }
                commit('deleteAttachment', temporaryAttachmentLocalId);
            }
        }
        return attachment.localId;
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} composerId
     * @param {Object} [initialState={}]
     */
    createComposer({ state }, composerId, initialState={}) {
        owl.core.Observer.set(state.composers, composerId, initialState);
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {Object[]} param1.attachment_ids
     * @param {string} param1.attachment_ids[i].filename
     * @param {integer} param1.attachment_ids[i].id
     * @param {boolean} [param1.attachment_ids[i].is_main]
     * @param {string} param1.attachment_ids[i].mimetype
     * @param {string} param1.attachment_ids[i].name
     * @param {Array} [param1.author_id]
     * @param {integer} [param1.author_id[0]]
     * @param {string} [param1.author_id[1]]
     * @param {string} param1.body
     * @param {integer[]} param1.channel_ids
     * @param {Array} param1.customer_email_data
     * @param {string} param1.customer_email_status
     * @param {string} param1.date
     * @param {string} param1.email_from
     * @param {integer} param1.id
     * @param {boolean} [param1.isTransient=false]
     * @param {boolean} param1.is_discussion
     * @param {boolean} param1.is_note
     * @param {boolean} param1.is_notification
     * @param {string} param1.message_type
     * @param {string|boolean} [param1.model=false]
     * @param {string} param1.moderation_status
     * @param {string} param1.module_icon
     * @param {integer[]} param1.needaction_partner_ids
     * @param {string} param1.record_name
     * @param {integer|boolean} param1.res_id
     * @param {boolean} param1.snailmail_error
     * @param {string} param1.snailmail_status
     * @param {integer[]} param1.starred_partner_ids
     * @param {string|boolean} param1.subject
     * @param {string|boolean} param1.subtype_description
     * @param {Array} param1.subtype_id
     * @param {integer} param1.subtype_id[0]
     * @param {string} param1.subtype_id[1]
     * @param {Object[]} param1.tracking_value_ids
     * @param {*} param1.tracking_value_ids[i].changed_field
     * @param {integer} param1.tracking_value_ids[i].id
     * @param {string} param1.tracking_value_ids[i].field_type
     * @param {*} param1.tracking_value_ids[i].new_value
     * @param {*} param1.tracking_value_ids[i].old_value
     * @return {string} message local Id
     */
    createMessage(
        { commit, state },
        {
            attachment_ids,
            author_id, author_id: [
                authorId,
                authorDisplayName
            ]=[],
            body,
            channel_ids,
            customer_email_data,
            customer_email_status,
            date,
            email_from,
            id,
            isTransient=false,
            is_discussion,
            is_note,
            is_notification,
            message_type,
            model,
            moderation_status,
            module_icon,
            needaction_partner_ids,
            record_name,
            res_id,
            snailmail_error,
            snailmail_status,
            starred_partner_ids,
            subject,
            subtype_description,
            subtype_id,
            tracking_value_ids,
        },
    ) {
        // 1. make message
        const message = {
            attachment_ids,
            author_id,
            body,
            channel_ids,
            customer_email_data,
            customer_email_status,
            date,
            email_from,
            id,
            isTransient,
            is_discussion,
            is_note,
            is_notification,
            message_type,
            model,
            moderation_status,
            module_icon,
            needaction_partner_ids,
            record_name,
            res_id,
            snailmail_error,
            snailmail_status,
            starred_partner_ids,
            subject,
            subtype_description,
            subtype_id,
            tracking_value_ids,
        };
        commit('_computeMessage', message);
        const messageLocalId = message.localId;
        if (state.messages[messageLocalId]) {
            // message already exists in store
            console.warn(`${messageLocalId} already exists in store`);
            return;
        }
        owl.core.Observer.set(state.messages, messageLocalId, message);
        // 2. author: create/update + link
        if (authorId) {
            const partnerLocalId = commit('insertPartner', {
                display_name: authorDisplayName,
                id: authorId,
            });
            commit('_linkMessageToAuthorPartner', {
                messageLocalId,
                partnerLocalId,
            });
        }
        // 3. threads: create/update + link
        if (message.originThreadLocalId) {
            commit('insertThread', {
                _model: model,
                id: res_id,
            });
            if (message.record_name) {
                commit('updateThread', message.originThreadLocalId, {
                    name: record_name,
                });
            }
        }
        // 3a. link message <- threads
        for (const threadLocalId of message.threadLocalIds) {
            if (!state.threads[threadLocalId]) {
                const [threadModel, threadId] = threadLocalId.split('_');
                commit('createThread', {
                    _model: threadModel,
                    id: threadId,
                });
            }
            commit('_linkMessageToThread', {
                messageLocalId,
                threadLocalId,
            });
        }
        // 4. attachments: create/update + link
        if (attachment_ids) {
            for (const data of attachment_ids) {
                const {
                    filename,
                    id: attachmentId,
                    is_main,
                    mimetype,
                    name,
                } = data;
                const attachmentLocalId = commit('insertAttachment', {
                    filename,
                    id: attachmentId,
                    is_main,
                    mimetype,
                    name,
                });
                commit('_linkMessageToAttachment', attachmentLocalId, messageLocalId);
            }
        }
        return message.localId;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} [param1.display_name]
     * @param {string} [param1.email]
     * @param {integer} param1.id
     * @param {string} [param1.im_status]
     * @param {string} [param1.name]
     * @param {integer} [param1.userId]
     * @return {string} partner local Id
     */
    createPartner(
        { commit, state },
        {
            display_name,
            email,
            id,
            im_status,
            name,
            userId,
        }
    ) {
        const partner = {
            display_name,
            email,
            id,
            im_status,
            name,
            userId,
        };
        commit('_computePartner', partner);
        const partnerLocalId = partner.localId;
        if (state.partners[partnerLocalId]) {
            // partner already exists in store
            return;
        }
        owl.core.Observer.set(state.partners, partnerLocalId, partner);
        // todo: links
        return partnerLocalId;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} [param1.channel_type]
     * @param {integer} [param1.counter]
     * @param {integer} [param1.create_uid]
     * @param {string|boolean} [param1.custom_channel_name]
     * @param {Object[]} [param1.direct_partner]
     * @param {boolean} [param1.group_based_subscription]
     * @param {integer} param1.id
     * @param {boolean} [param1.isPinned=true]
     * @param {boolean} [param1.is_minimized]
     * @param {boolean} [param1.is_moderator]
     * @param {boolean} [param1.mass_mailing]
     * @param {Object} [param1.members=[]]
     * @param {string} [param1.members[i].email]
     * @param {integer} [param1.members[i].id]
     * @param {string} [param1.members[i].name]
     * @param {integer} [param1.message_needaction_counter]
     * @param {integer} [param1.message_unread_counter]
     * @param {boolean} [param1.moderation]
     * @param {string} [param1.name]
     * @param {string} [param1.public]
     * @param {integer} [param1.seen_message_id]
     * @param {Object[]} [param1.seen_partners_info]
     * @param {integer} [param1.seen_partners_info[i].fetched_message_id]
     * @param {integer} [param1.seen_partners_info[i].partner_id]
     * @param {integer} [param1.seen_partners_info[i].seen_message_id]
     * @param {string} [param1.state]
     * @param {string} [param1.uuid]
     * @param {string} [param1._model]
     * @return {string} thread local Id
     */
    createThread(
        { commit, state },
        {
            channel_type,
            counter,
            create_uid,
            custom_channel_name,
            direct_partner,
            group_based_subscription,
            id,
            isPinned=true,
            is_minimized,
            is_moderator,
            mass_mailing,
            members,
            message_needaction_counter,
            message_unread_counter,
            moderation,
            name,
            public: public2, // public is reserved keyword
            seen_message_id,
            seen_partners_info,
            state: fold_state,
            uuid,
            _model,
        }
    ) {
        const thread = {
            channel_type,
            counter,
            create_uid,
            custom_channel_name,
            direct_partner,
            group_based_subscription,
            id,
            isPinned,
            is_minimized,
            is_moderator,
            mass_mailing,
            members,
            message_needaction_counter,
            message_unread_counter,
            moderation,
            name,
            public: public2,
            seen_message_id,
            seen_partners_info,
            state: fold_state,
            uuid,
            _model,
        };
        commit('_computeThread', thread);
        const threadLocalId = thread.localId;
        if (state.threads[threadLocalId]) {
            // thread already exists in store
            return;
        }
        /* Update thread data */
        owl.core.Observer.set(state.threads, thread.localId, thread);
        commit('createThreadCache', { threadLocalId });
        /* Update thread relationships */
        if (members) {
            for (const member of members) {
                commit('insertPartner', member);
            }
        }
        if (direct_partner && direct_partner[0]) {
            commit('insertPartner', direct_partner[0]);
        }
        if (is_minimized) {
            commit('openThread', threadLocalId, {
                chatWindowMode: 'last',
            });
        }
        return threadLocalId;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} [param1.stringifiedDomain='[]']
     * @param {string} param1.threadLocalId
     * @return {string} thread cache local Id
     */
    createThreadCache({ commit, state }, { stringifiedDomain='[]', threadLocalId }) {
        const threadCache = {
            stringifiedDomain,
            threadLocalId,
        };
        commit('_computeThreadCache', threadCache);
        const threadCacheLocalId = threadCache.localId;
        owl.core.Observer.set(state.threadCaches, threadCacheLocalId, threadCache);

        if (!state.threads[threadLocalId]) {
            throw new Error('no thread exists for new thread cache');
        }
        const thread = state.threads[threadLocalId];
        if (Object.values(thread.cacheLocalIds).includes(threadCacheLocalId)) {
            return;
        }
        commit('updateThread', threadLocalId, {
            cacheLocalIds: {
                ...thread.cacheLocalIds,
                [stringifiedDomain]: threadCacheLocalId
            },
        });
        return threadCacheLocalId;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} attachmentLocalId
     */
    deleteAttachment({ commit, state }, attachmentLocalId) {
        const attachment = state.attachments[attachmentLocalId];
        if (attachment.isTemporary) {
            owl.core.Observer.delete(
                state.temporaryAttachmentLocalIds,
                attachment.filename);
        }
        // remove attachment from composers
        for (const composerId in state.composers) {
            const composer = state.composers[composerId];
            if (composer.attachmentLocalIds.includes(attachmentLocalId)) {
                commit('_updateComposer', composerId, {
                    attachmentLocalIds:
                        composer.attachmentLocalIds.filter(localId =>
                            localId !== attachmentLocalId)
                });
            }
        }
        // remove attachment from messages
        for (const messageLocalId of attachment.messageLocalIds) {
            commit('_unlinkAttachmentFromMessage', messageLocalId, attachmentLocalId);
        }
        owl.core.Observer.delete(state.attachments, attachmentLocalId);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} composerId
     */
    deleteComposer({ state }, composerId) {
        owl.core.Observer.delete(state.composers, composerId);
    },
    /**
     * Unused for the moment, but may be useful for moderation
     *
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} messageLocalId
     */
    deleteMessage({ commit, state }, messageLocalId) {
        delete state.messages[messageLocalId];
        for (const threadLocalId of Object.keys(state.threads)) {
            commit('_unlinkMessageFromthread', {
                messageLocalId,
                threadLocalId,
            });
        }
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} chatWindowLocalId either 'new_message' or minimized
     *   thread local Id, a valid chat window in `chatWindowLocalIds` list of
     *   chat window manager
     */
    focusChatWindow({ state }, chatWindowLocalId) {
        const cwm = state.chatWindowManager;
        const visibleChatWindowLocalIds =
            cwm.computed.visible.map(item => item.chatWindowLocalId);
        if (!visibleChatWindowLocalIds.includes(chatWindowLocalId)) {
            return;
        }
        cwm.autofocusChatWindowLocalId = chatWindowLocalId;
        cwm.autofocusCounter++;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} data
     * @param {integer} data.globalWindowInnerHeight
     * @param {integer} data.globalWindowInnerWidth
     * @param {boolean} data.isMobile
     */
    handleGlobalWindowResize({ commit, state }, data) {
        const wasMobile = state.isMobile;
        const {
            globalWindowInnerHeight,
            globalWindowInnerWidth,
            isMobile,
        } = data;
        // update global window data
        state.globalWindow.innerHeight = globalWindowInnerHeight;
        state.globalWindow.innerWidth = globalWindowInnerWidth;
        state.isMobile = isMobile; // config.device.isMobile;

        // update discuss
        if (
            state.isMobile &&
            !wasMobile &&
            state.discuss.isOpen &&
            state.discuss.activeThreadLocalId
        ) {
            const activeDiscussThread = state.threads[state.discuss.activeThreadLocalId];
            state.discuss.activeMobileNavbarTabId =
                activeDiscussThread._model === 'mail.box' ? 'mailbox'
                : activeDiscussThread.channel_type === 'channel' ? 'channel'
                : activeDiscussThread.channel_type === 'chat' ? 'chat'
                : state.discuss.activeMobileNavbarTabId;
        }

        // update docked chat windows
        commit('_computeChatWindows');
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} data
     */
    handleNotificationNeedaction({ commit, state }, data) {
        const messageLocalId = commit('insertMessage', data);
        const message = state.messages[messageLocalId];
        state.threads['mail.box_inbox'].counter++;
        for (const threadLocalId of message.threadLocalIds) {
            const thread = state.threads[threadLocalId];
            if (
                thread.channel_type === 'channel' &&
                message.needaction_partner_ids.includes(state.partners[state.currentPartnerLocalId])
            ) {
                commit('updateThread', threadLocalId, {
                    message_needaction_counter: thread.message_needaction_counter + 1,
                });
            }
            commit('linkMessageToThreadCache', {
                messageLocalId,
                threadCacheLocalId: thread.cacheLocalIds['[]'],
            });
        }
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.getters
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {integer[]} [param1.channel_ids=[]]
     * @param {integer[]} [param1.message_ids=[]]
     */
    handleNotificationPartnerMarkAsRead(
        { commit, getters, state },
        {
            channel_ids=[],
            message_ids=[],
        }
    ) {
        const inboxLocalId = 'mail.box_inbox';
        const inbox = state.threads[inboxLocalId];
        for (const cacheLocalId of Object.values(inbox.cacheLocalIds)) {
            for (const messageId of message_ids) {
                const messageLocalId = `mail.message_${messageId}`;
                commit('_unlinkMessageFromThreadCache', {
                    messageLocalId,
                    threadCacheLocalId: cacheLocalId,
                });
            }
        }
        const mailChannelList = getters.mailChannelList();
        for (const mailChannel of mailChannelList) {
            commit('updateThread', mailChannel.localId, {
                message_needaction_counter: 0,
            });
        }
        commit('updateThread', inboxLocalId, {
            counter: inbox.counter - message_ids.length,
        });
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {integer[]} param1.message_ids
     * @param {boolean} param1.starred
     */
    handleNotificationPartnerToggleStar(
        { commit, state },
        { message_ids=[], starred }
    ) {
        const starredBoxLocalId = 'mail.box_starred';
        const starredBox = state.threads[starredBoxLocalId];
        for (const messageId of message_ids) {
            const messageLocalId = `mail.message_${messageId}`;
            const message = state.messages[messageLocalId];
            if (!message) {
                continue;
            }
            if (starred) {
                commit('_setMessageStar', messageLocalId);
                commit('updateThread', starredBoxLocalId, {
                    counter: starredBox.counter + 1,
                });
            } else {
                commit('_unsetMessageStar', messageLocalId);
                commit('updateThread', starredBoxLocalId, {
                    counter: starredBox.counter - 1,
                });
            }
        }
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {...Object} param1.kwargs
     */
    handleNotificationPartnerTransientMessage(
        { commit, state },
        {
            ...kwargs
        }
    ) {
        const messageIds = Object.values(state.messages).map(message => message.id);
        const odoobot = state.partners['res.partner_odoobot'];
        commit('createMessage', {
            ...kwargs,
            author_id: [odoobot.id, odoobot.name],
            id: (messageIds ? Math.max(...messageIds) : 0) + 0.01,
            isTransient: true,
        });
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} threadLocalId
     * @param {Object} param2
     * @param {Object} param2.messageData
     * @param {Array} [param2.searchDomain=[]]
     */
    handleThreadLoaded(
        { commit, state },
        threadLocalId,
        { messagesData, searchDomain=[] }
    ) {
        const stringifiedDomain = JSON.stringify(searchDomain);
        const threadCacheLocalId = commit('_insertThreadCache', {
            isAllHistoryLoaded: messagesData.length < state.MESSAGE_FETCH_LIMIT,
            isLoaded: true,
            isLoading: false,
            isLoadingMore: false,
            stringifiedDomain,
            threadLocalId,
        });
        for (const data of messagesData) {
            const messageLocalId = commit('insertMessage', data);
            commit('linkMessageToThreadCache', {
                messageLocalId,
                threadCacheLocalId,
            });
        }
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {Object} param1.channel_slots
     * @param {Array} [param1.commands=[]]
     * @param {Object} param1.currentPartnerData
     * @param {string} param1.currentPartnerData.displayName
     * @param {integer} param1.currentPartnerData.id
     * @param {string} param1.currentPartnerData.name
     * @param {integer} param1.currentPartnerData.userId
     * @param {boolean} [param1.is_moderator=false]
     * @param {Object[]} [param1.mail_failures=[]]
     * @param {Object[]} [param1.mention_partner_suggestions=[]]
     * @param {Object[]} [param1.moderation_channel_ids=[]]
     * @param {integer} [param1.moderation_counter=0]
     * @param {integer} [param1.needaction_inbox_counter=0]
     * @param {Object[]} [param1.shortcodes=[]]
     * @param {integer} [param1.starred_counter=0]
     */
    initMessaging(
        { commit, state },
        {
            channel_slots,
            commands=[],
            currentPartnerData: {
                displayName: currentPartnerDisplayName,
                id: currentPartnerId,
                name: currentPartnerName,
                userId: currentPartnerUserId,
            },
            is_moderator=false,
            mail_failures=[],
            mention_partner_suggestions=[],
            menu_id,
            moderation_channel_ids=[],
            moderation_counter=0,
            needaction_inbox_counter=0,
            shortcodes=[],
            starred_counter=0
        }
    ) {
        commit('_initMessagingPartners', {
            currentPartner: {
                displayName: currentPartnerDisplayName,
                id: currentPartnerId,
                name: currentPartnerName,
                userId: currentPartnerUserId,
            },
        });
        commit('_initMessagingCommands', commands); // required for channels, hence before
        commit('_initMessagingChannels', channel_slots);
        commit('_initMessagingMailboxes', {
            is_moderator,
            moderation_counter,
            needaction_inbox_counter,
            starred_counter
        });
        commit('_initMessagingMailFailures', mail_failures);
        commit('_initMessagingCannedResponses', shortcodes);
        commit('_initMessagingMentionPartnerSuggestions', mention_partner_suggestions);
        state.discuss.menu_id = menu_id;
    },
    /**
     * Update existing attachment or create a new attachment
     *
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {integer} param1.id
     * @param {...Object} param1.kwargs
     * @return {string} attachment local Id
     */
    insertAttachment({ commit, state }, { id, ...kwargs }) {
        const attachmentLocalId = `ir.attachment_${id}`;
        if (!state.attachments[attachmentLocalId]) {
            commit('createAttachment', { id, ...kwargs });
        } else {
            commit('_updateAttachment', attachmentLocalId, kwargs);
        }
        return attachmentLocalId;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {integer} param1.id
     * @param {...Object} param1.kwargs
     * @return {string} message local Id
     */
    insertMessage({ commit, state }, { id, ...kwargs }) {
        const messageLocalId = `mail.message_${id}`;
        if (!state.messages[messageLocalId]) {
            commit('createMessage', { id, ...kwargs });
        } else {
            commit('_updateMessage', messageLocalId, kwargs);
        }
        return messageLocalId;
    },
    /**
     * Update existing partner or create a new partner
     *
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {integer} param1.id
     * @param {...Object} param1.kwargs
     * @return {string} partner local Id
     */
    insertPartner({ commit, state }, { id, ...kwargs }) {
        const partnerLocalId = `res.partner_${id}`;
        if (!state.partners[partnerLocalId]) {
            commit('createPartner', { id, ...kwargs });
        } else {
            commit('updatePartner', partnerLocalId, kwargs);
        }
        return partnerLocalId;
    },
    /**
     * Update existing thread or create a new thread
     *
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} param1._model
     * @param {integer} param1.id
     * @param {...Object} param1.kwargs
     * @return {string} thread local Id
     */
    insertThread({ commit, state }, { _model, id, ...kwargs }) {
        const threadLocalId = `${_model}_${id}`;
        if (!state.threads[threadLocalId]) {
            commit('createThread', { _model, id, ...kwargs });
        } else {
            commit('updateThread', threadLocalId, kwargs);
        }
        return threadLocalId;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} composerId
     * @param {string} attachmentLocalId
     */
    linkAttachmentToComposer({ commit, state }, composerId, attachmentLocalId) {
        const composerAttachmentLocalIds = state.composers[composerId].attachmentLocalIds;
        if (composerAttachmentLocalIds.includes(attachmentLocalId)) {
            return;
        }
        commit('_updateComposer', composerId, {
            attachmentLocalIds: composerAttachmentLocalIds.concat([attachmentLocalId]),
        });
        commit('_linkComposerToAttachment', attachmentLocalId, composerId);
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} param1.messageLocalId
     * @param {string} param1.threadCacheLocalId
     */
    linkMessageToThreadCache(
        { commit, state },
        { messageLocalId, threadCacheLocalId }
    ) {
        const cache = state.threadCaches[threadCacheLocalId];
        const message = state.messages[messageLocalId];
        if (cache.messageLocalIds.includes(messageLocalId)) {
            return;
        }
        // messages are ordered by id
        const index = cache.messageLocalIds.findIndex(localId => {
            const otherMessage = state.messages[localId];
            return otherMessage.id > message.id;
        });
        let newMessageLocalIds = [...cache.messageLocalIds];
        if (index !== -1) {
            newMessageLocalIds.splice(index, 0, messageLocalId);
        } else {
            newMessageLocalIds.push(messageLocalId);
        }
        commit('updateThreadCache', threadCacheLocalId, {
            messageLocalIds: newMessageLocalIds,
        });
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} chatWindowLocalId chat Id that is invisible
     */
    makeChatWindowVisible({ commit, state }, chatWindowLocalId) {
        const cwm = state.chatWindowManager;
        const {
            length: l,
            [l-1]: { chatWindowLocalId: lastVisibleChatWindowLocalId }
        } = cwm.computed.visible;
        commit('_swapChatWindows', chatWindowLocalId, lastVisibleChatWindowLocalId);
        const thread = state.threads[chatWindowLocalId];
        if (thread && thread.state !== 'open') {
            commit('updateThread', chatWindowLocalId, {
                state: 'open',
            });
        }
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} threadLocalId
     * @param {Object} param2
     * @param {string} [param2.chatWindowMode]
     * @param {boolean} [param2.resetDiscussDomain=false]
     */
    openThread(
        { commit, state },
        threadLocalId,
        {
            chatWindowMode,
            resetDiscussDomain=false
        }={}
    ) {
        if (state.discuss.isOpen) {
            if (resetDiscussDomain) {
                commit('setDiscussDomain', []);
            }
            commit('_openThreadInDiscuss', threadLocalId);
        } else {
            commit('_openChatWindow', threadLocalId, {
                mode: chatWindowMode,
            });
        }
        commit('closeMessagingMenu');
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} oldChatWindowLocalId chat window to replace
     * @param {string} newChatWindowLocalId chat window to replace with
     */
    replaceChatWindow(
        { commit, state },
        oldChatWindowLocalId,
        newChatWindowLocalId
    ) {
        commit('_swapChatWindows', newChatWindowLocalId, oldChatWindowLocalId);
        commit('closeChatWindow', oldChatWindowLocalId);
        const thread = state.threads[newChatWindowLocalId];
        if (thread && !thread.state !== 'open') {
            commit('updateThread', newChatWindowLocalId, {
                state: 'open',
            });
        }
        commit('focusChatWindow', newChatWindowLocalId);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} tabId
     */
    setDiscussActiveMobileNavbarTab({ state }, tabId) {
        state.discuss.activeMobileNavbarTabId = tabId;
        if (state.discuss.activeMobileNavbarTabId === 'mailbox') {
            state.discuss.activeThreadLocalId = 'mail.box_inbox';
        } else {
            state.discuss.activeThreadLocalId = null;
        }
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {Array} domain
     */
    setDiscussDomain({ state }, domain) {
        state.discuss.domain = domain;
        state.discuss.stringifiedDomain = JSON.stringify(state.discuss.domain);
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     */
    setDiscussOpen({ commit, state }) {
        if (state.discuss.isOpen) {
            return;
        }
        state.discuss.isOpen = true;
        commit('_computeChatWindows');
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string|null} threadLocalId
     */
    setDiscussTargetThread({ state }, threadLocalId) {
        if (
            !state.discuss.targetThreadLocalId &&
            !threadLocalId
        ) {
            return;
        }
        state.discuss.targetThreadLocalId = threadLocalId;
        state.discuss.targetThreadCounter++;
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} tabId
     */
    setMessagingMenuActiveTab({ state }, tabId) {
        state.messagingMenu.activeTabId = tabId;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} chatWindowLocalId either 'new_message' or thread local Id
     */
    shiftLeftChatWindow({ commit, state }, chatWindowLocalId) {
        const cwm = state.chatWindowManager;
        const index = cwm.chatWindowLocalIds.findIndex(localId =>
            localId === chatWindowLocalId);
        if (index === cwm.chatWindowLocalIds.length-1) {
            // already left-most
            return;
        }
        const otherChatWindowLocalId = cwm.chatWindowLocalIds[index+1];
        owl.core.Observer.set(cwm.chatWindowLocalIds, index, otherChatWindowLocalId);
        owl.core.Observer.set(cwm.chatWindowLocalIds, index+1, chatWindowLocalId);
        commit('_computeChatWindows');
        commit('focusChatWindow', chatWindowLocalId);
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} chatWindowLocalId either 'new_message' or thread local Id
     */
    shiftRightChatWindow({ commit, state }, chatWindowLocalId) {
        const dcwm = state.chatWindowManager;
        const index = dcwm.chatWindowLocalIds.findIndex(localId =>
            localId === chatWindowLocalId);
        if (index === 0) {
            // already right-most
            return;
        }
        const otherChatWindowLocalId = dcwm.chatWindowLocalIds[index-1];
        owl.core.Observer.set(dcwm.chatWindowLocalIds, index, otherChatWindowLocalId);
        owl.core.Observer.set(dcwm.chatWindowLocalIds, index-1, chatWindowLocalId);
        commit('_computeChatWindows');
        commit('focusChatWindow', chatWindowLocalId);
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} threadLocalId
     */
    toggleFoldThread({ commit, state }, threadLocalId) {
        const thread = state.threads[threadLocalId];
        const newFoldState = thread.state === 'open' ? 'folded' : 'open';
        commit('updateThread', threadLocalId, {
            state: newFoldState,
        });
        if (newFoldState === 'open') {
            commit('focusChatWindow', threadLocalId);
        }
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     */
    toggleMessagingMenuMobileNewMessage({ state }) {
        state.messagingMenu.isMobileNewMessageToggled =
            !state.messagingMenu.isMobileNewMessageToggled;
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     */
    toggleMessagingMenuOpen({ state }) {
        state.messagingMenu.isOpen = !state.messagingMenu.isOpen;
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} composerId
     */
    unlinkAttachmentsFromComposer({ commit, state }, composerId) {
        const attachmentLocalIds = state.composers[composerId].attachmentLocalIds;
        commit('_updateComposer', composerId, {
            attachmentLocalIds: [],
        });
        for (const attachmentLocalId of attachmentLocalIds) {
            commit('_unlinkComposerFromAttachment', attachmentLocalId, composerId);
        }
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} threadLocalId
     */
    unpinThread({ commit }, threadLocalId) {
        commit('updateThread', threadLocalId, { isPinned: false });
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {Object} changes
     */
    updateChatWindowManager({ state }, changes) {
        Object.assign(state.chatWindowManager, changes);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} id
     * @param {any} changes
     */
    updateDialogInfo({ state }, id, changes) {
        const dialog  = state.dialogManager.dialogs.find(dialog => dialog.id === id);
        if (!dialog) {
            return;
        }
        Object.assign(dialog.info, changes);
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {string} documentThreadLocalId
     * @param {integer[]} messageIds
     */
    updateDocumentThreadMessageIds({ commit }, documentThreadLocalId, messageIds) {
        commit('updateThread', documentThreadLocalId, {
            isLoaded: false, // force re-loading it
            messageIds,
        });
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} partnerLocalId
     * @param {Object} changes
     */
    updatePartner({ commit, state }, partnerLocalId, changes) {
        const partner = state.partners[partnerLocalId];
        Object.assign(partner, changes);
        commit('_computePartner', partner);
        // todo: changes of links, e.g. messageLocalIds
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} threadLocalId
     * @param {Object} changes
     * @param {boolean} [changes.is_minimized]
     */
    updateThread({ commit, state }, threadLocalId, changes) {
        const thread = state.threads[threadLocalId];
        const wasMinimized = thread.is_minimized;
        Object.assign(thread, changes);
        commit('_computeThread', thread);
        const cwm = state.chatWindowManager;
        if (
            !wasMinimized &&
            thread.is_minimized &&
            !cwm.chatWindowLocalIds.includes(threadLocalId)
        ) {
            commit('openThread', threadLocalId, {
                chatWindowMode: 'last',
            });
        }
        if (
            wasMinimized &&
            !thread.is_minimized &&
            cwm.chatWindowLocalIds.includes(threadLocalId)
        ) {
            commit('closeChatWindow', threadLocalId);
        }
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} threadCacheLocalId
     * @param {Object} changes
     */
    updateThreadCache({ commit, state }, threadCacheLocalId, changes) {
        const threadCache = state.threadCaches[threadCacheLocalId];
        Object.assign(threadCache, changes);
        commit('_computeThreadCache', threadCache);
    },
    /**
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param1
     * @param {string|undefined} [param1.attachmentLocalId]
     * @param {string[]} param1.attachmentLocalIds
     * @return {string|undefined} unique id of open dialog, if open
     */
    viewAttachments({ commit }, { attachmentLocalId, attachmentLocalIds }) {
        if (!attachmentLocalIds) {
            return;
        }
        if (!attachmentLocalId) {
            attachmentLocalId = attachmentLocalIds[0];
        }
        if (!attachmentLocalIds.includes(attachmentLocalId)) {
            return;
        }
        return commit('_openDialog', AttachmentViewer, {
            attachmentLocalId,
            attachmentLocalIds,
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Object} unused
     * @param {mail.store.model.Attachment} attachment
     */
    _computeAttachment(unused, attachment) {
        const {
            composerId=null,
            id,
            messageLocalIds=[],
        } = attachment;

        Object.assign(attachment, {
            _model: 'ir.attachment',
            composerId,
            localId: `ir.attachment_${id}`,
            messageLocalIds,
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {Object} param0.state
     */
    _computeChatWindows({ state }) {
        const BETWEEN_GAP_WIDTH = 5;
        const CHAT_WINDOW_WIDTH = 325;
        const END_GAP_WIDTH = state.isMobile ? 0 : 10;
        const GLOBAL_WINDOW_WIDTH = state.globalWindow.innerWidth;
        const HIDDEN_MENU_WIDTH = 200; // max width, including width of dropup list items
        const START_GAP_WIDTH = state.isMobile ? 0 : 10;
        const cwm = state.chatWindowManager;
        const isDiscussOpen = state.discuss.isOpen;
        const chatWindowLocalIds = cwm.chatWindowLocalIds;
        let computed = {
            /**
             * Amount of visible slots available for chat windows.
             */
            availableVisibleSlots: 0,
            /**
             * Data related to the hidden menu.
             */
            hidden: {
                /**
                 * List of hidden docked chat windows. Useful to compute counter.
                 * Chat windows are ordered by their `chatWindowLocalIds` order.
                 */
                chatWindowLocalIds: [],
                /**
                 * Whether hidden menu is visible or not
                 */
                isVisible: false,
                /**
                 * Offset of hidden menu starting point from the starting point
                 * of chat window manager. Makes only sense if it is visible.
                 */
                offset: 0,
            },
            /**
             * Data related to visible chat windows. Index determine order of
             * docked chat windows.
             *
             * Value:
             *
             *  {
             *      chatWindowLocalId,
             *      offset,
             *  }
             *
             * Offset is offset of starting point of docked chat window from
             * starting point of dock chat window manager. Docked chat windows
             * are ordered by their `chatWindowLocalIds` order
             */
            visible: [],
        };
        if (!state.isMobile && isDiscussOpen) {
            cwm.computed = computed;
            return;
        }
        if (!chatWindowLocalIds.length) {
            cwm.computed = computed;
            return;
        }
        const relativeGlobalWindowWidth = GLOBAL_WINDOW_WIDTH - START_GAP_WIDTH - END_GAP_WIDTH;
        let maxAmountWithoutHidden = Math.floor(
            relativeGlobalWindowWidth / (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH));
        let maxAmountWithHidden = Math.floor(
            (relativeGlobalWindowWidth - HIDDEN_MENU_WIDTH - BETWEEN_GAP_WIDTH) /
            (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH));
        if (state.isMobile) {
            maxAmountWithoutHidden = 1;
            maxAmountWithHidden = 1;
        }
        if (chatWindowLocalIds.length <= maxAmountWithoutHidden) {
            // all visible
            for (let i = 0; i < chatWindowLocalIds.length; i++) {
                const chatWindowLocalId = chatWindowLocalIds[i];
                const offset = START_GAP_WIDTH + i * (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH);
                computed.visible.push({ chatWindowLocalId, offset });
            }
            computed.availableVisibleSlots = maxAmountWithoutHidden;
        } else if (maxAmountWithHidden > 0) {
            // some visible, some hidden
            for (let i = 0; i < maxAmountWithHidden; i++) {
                const chatWindowLocalId = chatWindowLocalIds[i];
                const offset = START_GAP_WIDTH + i * ( CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH );
                computed.visible.push({ chatWindowLocalId, offset });
            }
            if (chatWindowLocalIds.length > maxAmountWithHidden) {
                computed.hidden.isVisible = !state.isMobile;
                computed.hidden.offset = computed.visible[maxAmountWithHidden-1].offset
                    + CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH;
            }
            for (let j = maxAmountWithHidden; j < chatWindowLocalIds.length; j++) {
                computed.hidden.chatWindowLocalIds.push(chatWindowLocalIds[j]);
            }
            computed.availableVisibleSlots = maxAmountWithHidden;
        } else {
            // all hidden
            computed.hidden.isVisible = !state.isMobile;
            computed.hidden.offset = START_GAP_WIDTH;
            computed.hidden.chatWindowLocalIds.concat(chatWindowLocalIds);
            console.warn('cannot display any visible chat windows (screen is too small)');
            computed.availableVisibleSlots = 0;
        }
        cwm.computed = computed;
    },
    /**
     * @private
     * @param {Object} unused
     * @param {mail.store.model.MailFailure} mailFailure
     */
    _computeMailFailure(unused, mailFailure) {
        const { message_id } = mailFailure;
        Object.assign(mailFailure, {
            _model: 'mail.failure',
            localId: `mail.failure_${message_id}`,
        });
        // /**
        //  * Get a valid object for the 'mail.preview' template
        //  *
        //  * @returns {Object}
        //  */
        // getPreview: function () {
        //     var preview = {
        //         body: _t("An error occured when sending an email"),
        //         date: this._lastMessageDate,
        //         documentId: this.documentId,
        //         documentModel: this.documentModel,
        //         id: 'mail_failure',
        //         imageSRC: this._moduleIcon,
        //         title: this._modelName,
        //     };
        //     return preview;
        // },
    },
    /**
     * @private
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {mail.store.model.Message} message
     */
    _computeMessage({ state }, message) {
        const {
            attachment_ids,
            author_id,
            channel_ids,
            date,
            id,
            model,
            needaction_partner_ids,
            res_id,
            starred_partner_ids,
        } = message;

        const currentPartner = state.partners[state.currentPartnerLocalId];
        let threadLocalIds = channel_ids
            ? channel_ids.map(id => `mail.channel_${id}`)
            : [];
        if (
            needaction_partner_ids &&
            needaction_partner_ids.includes(currentPartner.id)
        ) {
            threadLocalIds.push('mail.box_inbox');
        }
        if (
            starred_partner_ids &&
            starred_partner_ids.includes(currentPartner.id)
        ) {
            threadLocalIds.push('mail.box_starred');
        }
        if (model && res_id) {
            const originThreadLocalId = `${model}_${res_id}`;
            if (originThreadLocalId && !threadLocalIds.includes(originThreadLocalId)) {
                threadLocalIds.push(originThreadLocalId);
            }
        }

        Object.assign(message, {
            _model: 'mail.message',
            attachmentLocalIds: attachment_ids ? attachment_ids.map(({ id }) => `ir.attachment_${id}`) : [],
            authorLocalId: author_id ? `res.partner_${author_id[0]}` : undefined,
            dateMoment: date ? moment(time.str_to_datetime(date)) : moment(),
            localId: `mail.message_${id}`,
            originThreadLocalId: res_id && model ? `${model}_${res_id}` : undefined,
            threadLocalIds,
        });
    },
    /**
     * @private
     * @param {Object} unused
     * @param {mail.store.model.Partner} partner
     */
    _computePartner(unused, partner) {
        const {
            authorMessageLocalIds=[],
            id,
        } = partner;

        Object.assign(partner, {
            _model: 'res.partner',
            authorMessageLocalIds,
            localId: `res.partner_${id}`,
        });
    },
    /**
     * @private
     * @param {Object} unused
     * @param {mail.store.model.Thread} thread
     */
    _computeThread(unused, thread) {
        let {
            _model,
            id,
            cacheLocalIds={},
            channel_type,
            direct_partner: [{
                id: directPartnerId,
                im_status: directPartnerImStatus,
                email: directPartnerEmail,
                name: directPartnerName,
            }={}]=[],
            members=[],
            messageLocalIds=[],
            typingMemberLocalIds=[],
        } = thread;

        if (!_model && channel_type) {
            _model = 'mail.channel';
        }
        if (!_model || !id) {
            throw new Error('thread must always have `model` and `id`');
        }

        Object.assign(thread, {
            _model,
            cacheLocalIds,
            directPartnerLocalId: directPartnerId
                ? `res.partner_${directPartnerId}`
                : undefined,
            localId: `${_model}_${id}`,
            memberLocalIds: members
                ? members.map(member => `res.partner_${member.id}`)
                : [],
            messageLocalIds,
            typingMemberLocalIds,
        });
    },
    /**
     * @private
     * @param {Object} unused
     * @param {mail.store.model.ThreadCache} threadCache
     */
    _computeThreadCache(unused, threadCache) {
        let {
            currentPartnerMessagePostCounter=0,
            isAllHistoryLoaded=false,
            isLoaded=false,
            isLoading=false,
            isLoadingMore=false,
            messageLocalIds=[],
            stringifiedDomain,
            threadLocalId,
        } = threadCache;

        if (isLoaded) {
            isLoading = false;
        }

        Object.assign(threadCache, {
            currentPartnerMessagePostCounter,
            isAllHistoryLoaded,
            isLoaded,
            isLoading,
            isLoadingMore,
            localId: `${threadLocalId}_${stringifiedDomain}`,
            messageLocalIds,
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {Object[]} shortcodes
     */
    _initMessagingCannedResponses({ state }, shortcodes) {
        const cannedResponses = shortcodes
            .map(s => {
                const { id, source, substitution } = s;
                return { id, source, substitution };
            })
            .reduce((obj, cr) => {
                obj[cr.id] = cr;
                return obj;
            }, {});
        Object.assign(state, { cannedResponses });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param1
     * @param {Object[]} [param1.channel_channel=[]]
     * @param {Object[]} [param1.channel_direct_message=[]]
     * @param {Object[]} [param1.channel_private_group=[]]
     */
    _initMessagingChannels(
        { commit },
        {
            channel_channel=[],
            channel_direct_message=[],
            channel_private_group=[],
        }
    ) {
        for (const data of channel_channel) {
            commit('insertThread', { _model: 'mail.channel', ...data });
        }
        for (const data of channel_direct_message) {
            commit('insertThread', { _model: 'mail.channel', ...data });
        }
        for (const data of channel_private_group) {
            commit('insertThread', { _model: 'mail.channel', ...data });
        }
    },
    /**
     * @private
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {Object[]} commandsData
     */
    _initMessagingCommands({ state }, commandsData) {
        const commands = commandsData
            .map(command => {
                return {
                    id: command.name,
                    ...command
                };
            })
            .reduce((obj, command) => {
                obj[command.id] = command;
                return obj;
            }, {});
        Object.assign(state, { commands });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param1
     * @param {boolean} param1.is_moderator
     * @param {integer} param1.moderation_counter
     * @param {integer} param1.needaction_inbox_counter
     * @param {integer} param1.starred_counter
     */
    _initMessagingMailboxes(
        { commit },
        {
            is_moderator,
            moderation_counter,
            needaction_inbox_counter,
            starred_counter
        }
    ) {
        commit('createThread', {
            _model: 'mail.box',
            counter: needaction_inbox_counter,
            id: 'inbox',
            name: _t("Inbox"),
        });
        commit('createThread', {
            _model: 'mail.box',
            counter: starred_counter,
            id: 'starred',
            name: _t("Starred"),
        });
        if (is_moderator) {
            commit('createThread', {
                _model: 'mail.box',
                counter: moderation_counter,
                id: 'moderation',
                name: _t("Moderate Messages"),
            });
        }
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object[]} mailFailuresData
     */
    _initMessagingMailFailures({ commit, state }, mailFailuresData) {
        for (const data of mailFailuresData) {
            const mailFailure = { ...data };
            commit('_computeMailFailure', mailFailure);
            owl.core.Observer.set(state.mailFailures, mailFailure.localId, mailFailure);
        }
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object[]} mentionPartnerSuggestionsData
     */
    _initMessagingMentionPartnerSuggestions({ commit }, mentionPartnerSuggestionsData) {
        for (const suggestions of mentionPartnerSuggestionsData) {
            for (const suggestion of suggestions) {
                const { email, id, name } = suggestion;
                commit('insertPartner', { email, id, name });
            }
        }
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {Object} param1.currentPartner
     * @param {string} param1.currentPartnerData.displayName
     * @param {integer} param1.currentPartnerData.id
     * @param {string} param1.currentPartnerData.name
     * @param {integer} param1.currentPartnerData.userId
     */
    _initMessagingPartners(
        { commit, state },
        {
            currentPartner: {
                displayName: currentPartnerDisplayName,
                id: currentPartnerId,
                name: currentPartnerName,
                userId: currentPartnerUserId,
            },
        }
    ) {
        commit('createPartner', {
            id: 'odoobot',
            name: _t("OdooBot"),
        });
        const currentPartnerLocalId = commit('createPartner', {
            display_name: currentPartnerDisplayName,
            id: currentPartnerId,
            name: currentPartnerName,
            userId: currentPartnerUserId,
        });
        state.currentPartnerLocalId = currentPartnerLocalId;
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} [param1.stringifiedDomain='[]']
     * @param {string} param1.threadLocalId
     * @param {...Object} param1.kwargs
     * @return {string} thread cache local Id
     */
    _insertThreadCache(
        { commit, state },
        { stringifiedDomain='[]', threadLocalId, ...kwargs }
    ) {
        let threadCacheLocalId;
        if (!state.threads[threadLocalId].cacheLocalIds[stringifiedDomain]) {
            threadCacheLocalId = commit('createThreadCache', {
                stringifiedDomain,
                threadLocalId,
                ...kwargs,
            });
        } else {
            threadCacheLocalId = state.threads[threadLocalId].cacheLocalIds[stringifiedDomain];
            commit('updateThreadCache', threadCacheLocalId, kwargs);
        }
        return threadCacheLocalId;
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} attachmentLocalId
     * @param {string} composerId
     */
    _linkComposerToAttachment({ commit, state }, attachmentLocalId, composerId) {
        const attachment = state.attachments[attachmentLocalId];
        if (attachment.composerId === composerId) {
            return;
        }
        commit('_updateAttachment', attachmentLocalId, {
            composerId,
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} attachmentLocalId
     * @param {string} messageLocalId
     */
    _linkMessageToAttachment({ commit, state }, attachmentLocalId, messageLocalId) {
        const attachment = state.attachments[attachmentLocalId];
        if (attachment.messageLocalIds.includes(messageLocalId)) {
            return;
        }
        commit('_updateAttachment', attachment.localId, {
            messageLocalIds: attachment.messageLocalIds.concat([messageLocalId]),
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} param1.messageLocalId
     * @param {string} param1.partnerLocalId
     */
    _linkMessageToAuthorPartner(
        { commit, state },
        { messageLocalId, partnerLocalId }
    ) {
        const partner = state.partners[partnerLocalId];
        if (partner.authorMessageLocalIds.includes(messageLocalId)) {
            return;
        }
        commit('updatePartner', partnerLocalId, {
            authorMessageLocalIds: partner.authorMessageLocalIds.concat([messageLocalId])
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} param1.messageLocalId
     * @param {string} param1.threadLocalId
     */
    _linkMessageToThread(
        { commit, state },
        { messageLocalId, threadLocalId }
    ) {
        const thread = state.threads[threadLocalId];
        const message = state.messages[messageLocalId];
        if (thread.messageLocalIds.includes(messageLocalId)) {
            return;
        }
        // messages are ordered by id
        const index = thread.messageLocalIds.findIndex(localId => {
            const otherMessage = state.messages[localId];
            return otherMessage.id > message.id;
        });
        let newMessageLocalIds = [...thread.messageLocalIds];
        if (index !== -1) {
            newMessageLocalIds.splice(index, 0, messageLocalId);
        } else {
            newMessageLocalIds.push(messageLocalId);
        }
        commit('updateThread', threadLocalId, {
            messageLocalIds: newMessageLocalIds,
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} chatWindowLocalId either a thread local Id or
     *   'new_message', if the chat window is already in `chatWindowLocalIds`
     *   and visible, simply focuses it. If it is already in
     *   `chatWindowLocalIds` and invisible, it swaps with last visible chat
     *   window. New chat window is added based on provided mode.
     * @param {Object} param2
     * @param {boolean} [param2.focus=true]
     * @param {string} [param2.mode='last_visible'] either 'last' or 'last_visible'
     */
    _openChatWindow(
        { commit, state },
        chatWindowLocalId,
        {
            focus=true,
            mode='last_visible',
        }={}
    ) {
        const cwm = state.chatWindowManager;
        const thread = state.threads[chatWindowLocalId];
        if (cwm.chatWindowLocalIds.includes(chatWindowLocalId)) {
            // open already minimized chat window
            if (
                mode === 'last_visible' &&
                cwm.computed.hidden.chatWindowLocalIds.includes(chatWindowLocalId)
            ) {
                commit('makeChatWindowVisible', chatWindowLocalId);
            }
        } else {
            // new chat window
            cwm.chatWindowLocalIds.push(chatWindowLocalId);
            if (chatWindowLocalId !== 'new_message') {
                commit('updateThread', chatWindowLocalId, {
                    is_minimized: true,
                    state: 'open',
                });
            }
            commit('_computeChatWindows');
            if (mode === 'last_visible') {
                commit('makeChatWindowVisible', chatWindowLocalId);
            }
        }
        if (thread && thread.state !== 'open') {
            commit('updateThread', chatWindowLocalId, {
                state: 'open',
            });
        }
        if (focus) {
            commit('focusChatWindow', chatWindowLocalId);
        }
    },
    /**
     * @private
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {owl.Component} Component
     * @param {any} info
     * @return {string} unique id of the newly open dialog
     */
    _openDialog({ state }, Component, info) {
        const id = _.uniqueId('o_Dialog');
        state.dialogManager.dialogs.push({
            Component,
            id,
            info,
        });
        return id;
    },
    /**
     * @private
     * @param {Object} param0
     * @param {functiom} param0.commit
     * @param {Object} param0.state
     * @param {string|null} threadLocalId
     */
    _openThreadInDiscuss({ commit, state }, threadLocalId) {
        if (state.discuss.activeThreadLocalId === threadLocalId) {
            return;
        }
        state.discuss.activeThreadLocalId = threadLocalId;
        commit('setDiscussTargetThread', threadLocalId);
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} composerId
     * @param {string} oldAttachmentLocalId
     * @param {string} newAttachmentLocalId
     */
    _replaceAttachmentInComposer(
        { commit, state },
        composerId,
        oldAttachmentLocalId,
        newAttachmentLocalId
    ) {
        // change link in composer
        const composer = state.composers[composerId];
        const index = composer.attachmentLocalIds.findIndex(localId =>
            localId === oldAttachmentLocalId);
        composer.attachmentLocalIds.splice(index, 1);
        if (index >= composer.attachmentLocalIds.length) {
            composer.attachmentLocalIds.push(newAttachmentLocalId);
        } else {
            composer.attachmentLocalIds.splice(index, 0, newAttachmentLocalId);
        }
        // change link in attachments
        commit('_updateAttachment', oldAttachmentLocalId, {
            composerId: null,
        });
        commit('_updateAttachment', newAttachmentLocalId, {
            composerId,
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} messageLocalId
     */
    _setMessageStar({ commit, state }, messageLocalId) {
        const message = state.messages[messageLocalId];
        const currentPartner = state.partners[state.currentPartnerLocalId];
        if (message.starred_partner_ids.includes(currentPartner.id)) {
            return;
        }
        commit('_updateMessage', messageLocalId, {
            starred_partner_ids: message.starred_partner_ids.concat([currentPartner.id]),
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} chatWindowLocalId1
     * @param {string} chatWindowLocalId2
     */
    _swapChatWindows(
        { commit, state },
        chatWindowLocalId1,
        chatWindowLocalId2
    ) {
        const cwm = state.chatWindowManager;
        const chatWindowLocalIds = cwm.chatWindowLocalIds;
        const index1 = chatWindowLocalIds.findIndex(localId =>
            localId === chatWindowLocalId1);
        const index2 = chatWindowLocalIds.findIndex(localId =>
            localId === chatWindowLocalId2);
        if (index1 === -1 || index2 === -1) {
            return;
        }
        owl.core.Observer.set(chatWindowLocalIds, index1, chatWindowLocalId2);
        owl.core.Observer.set(chatWindowLocalIds, index2, chatWindowLocalId1);
        commit('_computeChatWindows');
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} messageLocalId
     * @param {string} attachmentLocalId
     */
    _unlinkAttachmentFromMessage({ commit, state }, messageLocalId, attachmentLocalId) {
        const message = state.messages[messageLocalId];
        if (!message.attachmentLocalIds.includes(attachmentLocalId)) {
            return;
        }
        commit('_updateMessage', messageLocalId, {
            attachmentLocalIds:
                message.attachmentLocalIds.filter(localId =>
                    localId !== attachmentLocalId)
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} attachmentLocalId
     * @param {string} composerId
     */
    _unlinkComposerFromAttachment({ commit, state }, attachmentLocalId, composerId) {
        const attachment = state.attachments[attachmentLocalId];
        if (!attachment.composerId === composerId) {
            return;
        }
        commit('_updateAttachment', attachmentLocalId, {
            composerId: null,
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} param1.messageLocalId
     * @param {string} param1.partnerLocalId
     */
    _unlinkMessageFromAuthorPartner(
        { commit, state },
        { messageLocalId, partnerLocalId }
    ) {
        const partner = state.partners[partnerLocalId];
        if (partner.authorMessageLocalIds.includes(messageLocalId)) {
            return;
        }
        commit('updatePartner', partnerLocalId, {
            authorMessageLocalIds:
                partner.authorMessageLocalIds.filter(localId =>
                    localId !== messageLocalId),
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} param1.messageLocalId
     * @param {string} param1.threadLocalId
     */
    _unlinkMessageFromThread(
        { commit, state },
        { messageLocalId, threadLocalId }
    ) {
        const thread = state.threads[threadLocalId];
        if (!thread.messageLocalIds.includes(messageLocalId)) {
            return;
        }
        for (const threadCacheLocalId of Object.values(thread.cacheLocalIds)) {
            commit('_unlinkMessageFromThreadCache', {
                messageLocalId,
                threadCacheLocalId,
            });
        }
        commit('updateThread', threadLocalId, {
            messageLocalIds:
                thread.messageLocalIds.filter(localId => localId !== messageLocalId),
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} param1.messageLocalId
     * @param {string} param1.threadCacheLocalId
     */
    _unlinkMessageFromThreadCache(
        { commit, state },
        { messageLocalId, threadCacheLocalId }
    ) {
        const cache = state.threadCaches[threadCacheLocalId];
        if (!cache.messageLocalIds.includes(messageLocalId)) {
            return;
        }
        commit('updateThreadCache', threadCacheLocalId, {
            messageLocalIds:
                cache.messageLocalIds.filter(localId => localId !== messageLocalId),
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} messageLocalId
     */
    _unsetMessageStar({ commit, state }, messageLocalId) {
        const message = state.messages[messageLocalId];
        const currentPartner = state.partners[state.currentPartnerLocalId];
        if (!message.starred_partner_ids.includes(currentPartner.id)) {
            return;
        }
        commit('_updateMessage', messageLocalId, {
            starred_partner_ids:
                message.starred_partner_ids.filter(id => id !== currentPartner.id),
        });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {string} attachmentLocalId
     * @param {Object} changes
     */
    _updateAttachment({ commit, state }, attachmentLocalId, changes) {
        const attachment = state.attachments[attachmentLocalId];
        Object.assign(attachment, changes);
        commit('_computeAttachment', attachment);
    },
    /**
     * @private
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} composerId
     * @param {Object} changes
     */
    _updateComposer({ state }, composerId, changes) {
        const composer = state.composers[composerId];
        if (!composer) {
            throw new Error(`Cannot update non-existing composer store data for ID ${composerId}`);
        }
        for (const changeKey in changes) {
            if (changeKey in composer) {
                composer[changeKey] = changes[changeKey];
            } else {
                owl.core.Observer.set(composer, changeKey, changes[changeKey]);
            }
        }
    },
    /**
     * @private
     * @param {Object} param0
     * @param {function} param0.commit
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} messageLocalId
     * @param {Object} changes
     * @param {Object[]} [changes.attachmentLocalIds]
     * @param {Array} [changes.author_id]
     */
    _updateMessage({ commit, state }, messageLocalId, changes) {
        const {
            attachmentLocalIds,
            author_id: [
                authorPartnerId,
                authorDisplayName
            ]=[],
        } = changes;
        const message = state.messages[messageLocalId];
        const prevAuthorLocalId = message.authorLocalId;
        const prevThreadLocalIds = [ ...message.threadLocalIds ];

        // 1. alter message
        Object.assign(message, changes);
        commit('_computeMessage', message);
        if (authorPartnerId) {
            commit('insertPartner', {
                display_name: authorDisplayName,
                id: authorPartnerId,
            });
        }
        // 2. author: create/update + link
        if (prevAuthorLocalId && prevAuthorLocalId !== message.authorLocalId) {
            commit('_unlinkMessageFromAuthorPartner', {
                messageLocalId,
                partnerLocalId: prevAuthorLocalId,
            });
        }
        if (
            message.authorLocalId &&
            prevAuthorLocalId !== message.authorLocalId
        ) {
            commit('_linkMessageToAuthorPartner', {
                messageLocalId,
                partnerLocalId: message.authorLocalId,
            });
        }

        // 3. threads: create/update + link
        const oldThreadLocalIds = prevThreadLocalIds.filter(localId =>
            !message.threadLocalIds.includes(localId));
        for (const threadLocalId of oldThreadLocalIds) {
            commit('_unlinkMessageFromThread', {
                messageLocalId,
                threadLocalId,
            });
        }
        const newThreadLocalIds = message.threadLocalIds.filter(localId =>
            !prevThreadLocalIds.includes(localId));
        for (const threadLocalId of newThreadLocalIds) {
            if (!state.threads[threadLocalId]) {
                const [threadModel, threadId] = threadLocalId.split('_');
                commit('createThread', {
                    _model: threadModel,
                    id: threadId,
                });
            }
            commit('_linkMessageToThread', {
                messageLocalId,
                threadLocalId,
            });
        }
    },
};

return mutations;

});
