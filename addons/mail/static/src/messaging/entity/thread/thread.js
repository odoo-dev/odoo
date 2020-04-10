odoo.define('mail.messaging.entity.Thread', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2many, many2one, one2many, one2one } = require('mail.messaging.EntityField');
const throttle = require('mail.messaging.utils.throttle');
const Timer = require('mail.messaging.utils.Timer');

function ThreadFactory({ Entity }) {

    class Thread extends Entity {

        /**
         * @override
         */
        init(...args) {
            super.init(...args);
            /**
             * Timer of current partner that was currently typing something, but
             * there is no change on the input for 5 seconds. This is used
             * in order to automatically notify other members that current
             * partner has stopped typing something, due to making no changes
             * on the composer for some time.
             */
            this._currentPartnerInactiveTypingTimer = new Timer(
                this.env,
                () => this.async(() => this._onCurrentPartnerInactiveTypingTimeout()),
                5 * 1000
            );
            /**
             * Last 'is_typing' status of current partner that has been notified
             * to other members. Useful to prevent spamming typing notifications
             * to other members if it hasn't changed. An exception is the
             * current partner long typing scenario where current partner has
             * to re-send the same typing notification from time to time, so
             * that other members do not assume he/she is no longer typing
             * something from not receiving any typing notifications for a
             * very long time.
             *
             * Supported values: true/false/undefined.
             * undefined makes only sense initially and during current partner
             * long typing timeout flow.
             */
            this._currentPartnerLastNotifiedIsTyping = undefined;
            /**
             * Timer of current partner that is typing a very long text. When
             * the other members do not receive any typing notification for a
             * long time, they must assume that the related partner is no longer
             * typing something (e.g. they have closed the browser tab).
             * This is a timer to let other members know that current partner
             * is still typing something, so that they should not assume he/she
             * has stopped typing something.
             */
            this._currentPartnerLongTypingTimer = new Timer(
                this.env,
                () => this.async(() => this._onCurrentPartnerLongTypingTimeout()),
                50 * 1000
            );
            /**
             * Determines whether the next request to notify current partner
             * typing status should always result to making RPC, regardless of
             * whether last notified current partner typing status is the same.
             * Most of the time we do not want to notify if value hasn't
             * changed, exception being the long typing scenario of current
             * partner.
             */
            this._forceNotifyNextCurrentPartnerTypingStatus = false;
            /**
             * Registry of timers of partners currently typing in the thread,
             * excluding current partner. This is useful in order to
             * automatically unregister typing members when not receive any
             * typing notification after a long time. Timers are internally
             * indexed by partner entities as key. The current partner is
             * ignored in this registry of timers.
             *
             * @see registerOtherMemberTypingMember
             * @see unregisterOtherMemberTypingMember
             */
            this._otherMembersLongTypingTimers = new Map();

            /**
             * Clearable and cancellable throttled version of the
             * `_notifyCurrentPartnerTypingStatus` method.
             * This is useful when the current partner posts a message and
             * types something else afterwards: it must notify immediately that
             * he/she is typing something, instead of waiting for the throttle
             * internal timer.
             *
             * @see _notifyCurrentPartnerTypingStatus
             */
            this._throttleNotifyCurrentPartnerTypingStatus = throttle(
                this.env,
                ({ isTyping }) => this.async(() => this._notifyCurrentPartnerTypingStatus({ isTyping })),
                2.5 * 1000
            );
        }

        /**
         * @override
         */
        delete(...args) {
            this._currentPartnerInactiveTypingTimer.clear();
            this._currentPartnerLongTypingTimer.clear();
            this._throttleNotifyCurrentPartnerTypingStatus.clear();
            for (const timer of this._otherMembersLongTypingTimers.values()) {
                timer.clear();
            }
            super.delete(...args);
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @static
         * @param {Object} data
         * @return {Object}
         */
        static convertData(data) {
            const data2 = {};
            if ('channel_type' in data) {
                data2.channel_type = data.channel_type;
                data2.model = 'mail.channel';
            }
            if ('create_uid' in data) {
                data2.creator = [['insert', { id: data.create_uid }]];
            }
            if ('custom_channel_name' in data) {
                data2.custom_channel_name = data.custom_channel_name;
            }
            if ('group_based_subscription' in data) {
                data2.group_based_subscription = data.group_based_subscription;
            }
            if ('id' in data) {
                data2.id = data.id;
            }
            if ('is_minimized' in data && 'state' in data) {
                data2.foldState = data.is_minimized ? data.state : 'closed';
            }
            if ('is_moderator' in data) {
                data2.is_moderator = data.is_moderator;
            }
            if ('mass_mailing' in data) {
                data2.mass_mailing = data.mass_mailing;
            }
            if ('moderation' in data) {
                data2.moderation = data.moderation;
            }
            if ('message_needaction_counter' in data) {
                data2.message_needaction_counter = data.message_needaction_counter;
            }
            if ('message_unread_counter' in data) {
                data2.message_unread_counter = data.message_unread_counter;
            }
            if ('name' in data) {
                data2.name = data.name;
            }
            if ('public' in data) {
                data2.public = data.public;
            }
            if ('seen_message_id' in data) {
                data2.seen_message_id = data.seen_message_id;
            }
            if ('seen_partners_info' in data) {
                data2.seen_partners_info = data.seen_partners_info;
            }
            if ('uuid' in data) {
                data2.uuid = data.uuid;
            }

            // relation
            if ('direct_partner' in data) {
                if (!data.direct_partner) {
                    data2.correspondent = [['unlink-all']];
                } else {
                    data2.correspondent = [
                        ['insert', this.env.entities.Partner.convertData(data.direct_partner[0])]
                    ];
                }
            }
            if ('members' in data) {
                if (!data.members) {
                    data2.members = [['unlink-all']];
                } else {
                    data2.members = [
                        ['insert-and-replace', data.members.map(memberData => this.env.entities.Partner.convertData(memberData))]
                    ];
                }
            }

            return data2;
        }

        /**
         * Create a channel, which is a special kind of thread on model
         * 'mail.channel' with multiple members.
         *
         * @static
         * @param {Object} param0
         * @param {boolean} [param0.autoselect=false] if set, when channel
         *   has been created, it auto-open the channel. This opens in discuss
         *   or chat window, depending on whether discuss is open or not.
         * @param {string} [param0.autoselectChatWindowMode]
         * @param {string} param0.name
         * @param {integer} [param0.partnerId]
         * @param {string} [param0.public]
         * @param {string} param0.type
         */
        static async createChannel({
            autoselect = false,
            autoselectChatWindowMode,
            name,
            partnerId,
            public: publicStatus,
            type,
        }) {
            const device = this.env.messaging.device;
            const data = await this.env.rpc({
                model: 'mail.channel',
                method: type === 'chat' ? 'channel_get' : 'channel_create',
                args: type === 'chat' ? [[partnerId]] : [name, publicStatus],
                kwargs: {
                    context: Object.assign({}, this.env.session.user_content, {
                        isMobile: device.isMobile,
                    }),
                }
            });
            const thread = this.create(Object.assign(
                {},
                this.convertData(data),
                { isPinned: true }
            ));
            if (autoselect) {
                thread.open({ chatWindowMode: autoselectChatWindowMode });
            }
        }

        /**
         * Join a channel. This channel may not yet exists in the store.
         *
         * @static
         * @param {integer} channelId
         * @param {Object} param1
         * @param {boolean} [param1.autoselect=false]
         */
        static async joinChannel(channelId, { autoselect = false } = {}) {
            const channel = this.find(thread =>
                thread.id === channelId &&
                thread.model === 'mail.channel'
            );
            if (channel && channel.isPinned) {
                return;
            }
            const data = await this.env.rpc({
                model: 'mail.channel',
                method: 'channel_join_and_get_info',
                args: [[channelId]]
            });
            const thread = this.create(Object.assign(
                {},
                this.convertData(data),
                { isPinned: true }
            ));
            if (autoselect) {
                thread.open({ resetDiscussDomain: true });
            }
        }

        /**
         * Load the previews of the specified threads. Basically, it fetches the
         * last messages, since they are used to display inline content of them.
         *
         * @static
         * @param {mail.messaging.entity.Thread>[]} threads
         */
        static async loadPreviews(threads) {
            const channelIds = threads.reduce((list, thread) => {
                if (thread.model === 'mail.channel') {
                    return list.concat(thread.id);
                }
                return list;
            }, []);
            const messagePreviews = await this.env.rpc({
                model: 'mail.channel',
                method: 'channel_fetch_preview',
                args: [channelIds],
            }, { shadow: true });
            for (const preview of messagePreviews) {
                const messageData = preview.last_message;
                this.env.entities.Message.insert(
                    this.env.entities.Message.convertData(messageData)
                );
            }
        }

        /**
         * @static
         */
        static openNewMessage() {
            const discuss = this.env.messaging.discuss;
            if (discuss.isOpen) {
                discuss.openNewMessage();
            } else {
                this.env.messaging.chatWindowManager.openNewMessage();
            }
        }

        /**
         * @param {string} [stringifiedDomain='[]']
         * @returns {mail.messaging.entity.ThreadCache}
         */
        cache(stringifiedDomain = '[]') {
            let cache = this.caches.find(cache => cache.stringifiedDomain === stringifiedDomain);
            if (!cache) {
                cache = this.env.entities.ThreadCache.create({
                    stringifiedDomain,
                    thread: [['link', this]],
                });
            }
            return cache;
        }

        /**
         * Fetch attachments linked to a record. Useful for populating the store
         * with these attachments, which are used by attachment box in the chatter.
         */
        async fetchAttachments() {
            const attachmentsData = await this.async(() => this.env.rpc({
                model: 'ir.attachment',
                method: 'search_read',
                domain: [
                    ['res_id', '=', this.id],
                    ['res_model', '=', this.model],
                ],
                fields: ['id', 'name', 'mimetype'],
                orderBy: [{ name: 'id', asc: false }],
            }));
            for (const attachmentData of attachmentsData) {
                this.env.entities.Attachment.insert(Object.assign({
                    originThread: [['link', this]],
                }, this.env.entities.Attachment.convertData(attachmentData)));
            }
            this.update({ areAttachmentsLoaded: true });
        }

        /**
         * Add current user to provided thread's followers.
         */
        async follow() {
            await this.async(() => this.env.rpc({
                model: this.model,
                method: 'message_subscribe',
                args: [[this.id]],
                kwargs: {
                    partner_ids: [this.env.messaging.currentPartner.id],
                    context: {}, // FIXME empty context to be overridden in session.js with 'allowed_company_ids' task-2243187
                },
            }));
            this.refreshFollowers();
        }

        /**
         * Load new messages on the main cache of this thread.
         */
        loadNewMessages() {
            this.mainCache.loadNewMessages();
        }

        /**
         * Mark the specified conversation as read/seen.
         */
        async markAsSeen() {
            if (this.message_unread_counter === 0) {
                return;
            }
            if (this.model === 'mail.channel') {
                const seen_message_id = await this.async(() => this.env.rpc({
                    model: 'mail.channel',
                    method: 'channel_seen',
                    args: [[this.id]]
                }, { shadow: true }));
                this.update({ seen_message_id });
            }
            this.update({ message_unread_counter: 0 });
        }

        /**
         * Notify server the fold state of this thread. Useful for cross-tab
         * and cross-device chat window state synchronization.
         */
        async notifyFoldStateToServer() {
            await this.async(() => this.env.rpc({
                model: 'mail.channel',
                method: 'channel_fold',
                kwargs: {
                    uuid: this.uuid,
                    state: this.foldState,
                }
            }, { shadow: true }));
        }

        /**
         * Open provided thread, either in discuss app or as a chat window.
         *
         * @param {Object} param0
         * @param {string} [param0.chatWindowMode]
         * @param {boolean} [param0.resetDiscussDomain=false]
         */
        open({ chatWindowMode, resetDiscussDomain = false } = {}) {
            const device = this.env.messaging.device;
            const discuss = this.env.messaging.discuss;
            const messagingMenu = this.env.messaging.messagingMenu;
            if (
                (!device.isMobile && discuss.isOpen) ||
                (device.isMobile && this.model === 'mail.box')
            ) {
                if (resetDiscussDomain) {
                    discuss.threadViewer.update({ stringifiedDomain: '[]' });
                }
                discuss.threadViewer.update({ thread: [['link', this]] });
            } else {
                this.env.messaging.chatWindowManager.openThread(this, { mode: chatWindowMode });
            }
            if (!device.isMobile) {
                messagingMenu.close();
            }
        }

        /**
         * Open this thread in an expanded way, that is not in a chat window.
         */
        openExpanded() {
            const discuss = this.env.messaging.discuss;
            if (['mail.channel', 'mail.box'].includes(this.model)) {
                this.env.do_action('mail.action_new_discuss', {
                    clear_breadcrumbs: false,
                    active_id: discuss.threadToActiveId(this),
                    on_reverse_breadcrumb: () => discuss.close(),
                });
            } else {
                this.env.do_action({
                    type: 'ir.actions.act_window',
                    res_model: this.model,
                    views: [[false, 'form']],
                    res_id: this.id,
                });
            }
        }

        /**
         * Open a dialog to add channels as followers.
         */
        promptAddChannelFollower() {
            this._promptAddFollower({ mail_invite_follower_channel_only: true });
        }

        /**
         * Open a dialog to add partners as followers.
         */
        promptAddPartnerFollower() {
            this._promptAddFollower({ mail_invite_follower_channel_only: false });
        }

        /**
         * Refresh followers information from server.
         */
        async refreshFollowers() {
            // FIXME Do that with only one RPC (see task-2243180)
            const [{ message_follower_ids: followerIds }] = await this.async(() => this.env.rpc({
                model: this.model,
                method: 'read',
                args: [this.id, ['message_follower_ids']],
            }));
            if (followerIds && followerIds.length > 0) {
                const { followers } = await this.async(() => this.env.rpc({
                    route: '/mail/read_followers',
                    params: {
                        follower_ids: followerIds,
                        context: {}, // FIXME empty context to be overridden in session.js with 'allowed_company_ids' task-2243187
                    }
                }));
                this.update({
                    followers: [['insert-and-replace', followers.map(data => this.env.entities.Follower.convertData(data))]],
                });
            } else {
                this.update({
                    followers: [['unlink-all']],
                });
            }
        }

        /**
         * Refresh the typing status of the current partner.
         */
        refreshCurrentPartnerIsTyping() {
            this._currentPartnerInactiveTypingTimer.reset();
        }

        /**
         * Called to refresh a registered other member partner that is typing
         * something.
         *
         * @param {mail.messaging.entity.Partner} partner
         */
        refreshOtherMemberTypingMember(partner) {
            this._otherMembersLongTypingTimers.get(partner).reset();
        }

        /**
         * Called when current partner is inserting some input in composer.
         * Useful to notify current partner is currently typing something in the
         * composer of this thread to all other members.
         */
        async registerCurrentPartnerIsTyping() {
            // Handling of typing timers.
            this._currentPartnerInactiveTypingTimer.start();
            this._currentPartnerLongTypingTimer.start();
            // Manage typing member relation.
            const currentPartner = this.env.messaging.currentPartner;
            const newOrderedTypingMemberLocalIds = this.orderedTypingMemberLocalIds
                .filter(localId => localId !== currentPartner.localId);
            newOrderedTypingMemberLocalIds.push(currentPartner.localId);
            this.update({
                orderedTypingMemberLocalIds: newOrderedTypingMemberLocalIds,
                typingMembers: [['link', currentPartner]],
            });
            // Notify typing status to other members.
            await this._throttleNotifyCurrentPartnerTypingStatus({ isTyping: true });
        }

        /**
         * Called to register a new other member partner that is typing
         * something.
         *
         * @param {mail.messaging.entity.Partner} partner
         */
        registerOtherMemberTypingMember(partner) {
            const timer = new Timer(
                this.env,
                () => this.async(() => this._onOtherMemberLongTypingTimeout(partner)),
                60 * 1000
            );
            this._otherMembersLongTypingTimers.set(partner, timer);
            timer.start();
            const newOrderedTypingMemberLocalIds = this.orderedTypingMemberLocalIds
                .filter(localId => localId !== partner.localId);
            newOrderedTypingMemberLocalIds.push(partner.localId);
            this.update({
                orderedTypingMemberLocalIds: newOrderedTypingMemberLocalIds,
                typingMembers: [['link', partner]],
            });
        }

        /**
         * Rename the given thread with provided new name.
         *
         * @param {string} newName
         */
        async rename(newName) {
            if (this.channel_type === 'chat') {
                await this.async(() => this.env.rpc({
                    model: 'mail.channel',
                    method: 'channel_set_custom_name',
                    args: [this.id],
                    kwargs: {
                        name: newName,
                    },
                }));
            }
            this.update({ custom_channel_name: newName });
        }

        /**
         * Unfollow current partner from this thread.
         */
        async unfollow() {
            const currentPartnerFollower = this.followers.find(
                follower => follower.partner === this.env.messaging.currentPartner
            );
            await this.async(() => currentPartnerFollower.remove());
        }

        /**
         * Called when current partner has explicitly stopped inserting some
         * input in composer. Useful to notify current partner has currently
         * stopped typing something in the composer of this thread to all other
         * members.
         *
         * @param {Object} [param0={}]
         * @param {boolean} [param0.immediateNotify=false] if set, is typing
         *   status of current partner is immediately notified and doesn't
         *   consume throttling at all.
         */
        async unregisterCurrentPartnerIsTyping({ immediateNotify = false } = {}) {
            // Handling of typing timers.
            this._currentPartnerInactiveTypingTimer.clear();
            this._currentPartnerLongTypingTimer.clear();
            // Manage typing member relation.
            const currentPartner = this.env.messaging.currentPartner;
            const newOrderedTypingMemberLocalIds = this.orderedTypingMemberLocalIds
                .filter(localId => localId !== currentPartner.localId);
            this.update({
                orderedTypingMemberLocalIds: newOrderedTypingMemberLocalIds,
                typingMembers: [['unlink', currentPartner]],
            });
            // Notify typing status to other members.
            if (immediateNotify) {
                this._throttleNotifyCurrentPartnerTypingStatus.clear();
            }
            await this.async(
                () => this._throttleNotifyCurrentPartnerTypingStatus({ isTyping: false })
            );
        }

        /**
         * Called to unregister an other member partner that is no longer typing
         * something.
         *
         * @param {mail.messaging.entity.Partner} partner
         */
        unregisterOtherMemberTypingMember(partner) {
            this._otherMembersLongTypingTimers.get(partner).clear();
            this._otherMembersLongTypingTimers.delete(partner);
            const newOrderedTypingMemberLocalIds = this.orderedTypingMemberLocalIds
                .filter(localId => localId !== partner.localId);
            this.update({
                orderedTypingMemberLocalIds: newOrderedTypingMemberLocalIds,
                typingMembers: [['unlink', partner]],
            });
        }

        /**
         * Unsubscribe current user from provided channel.
         */
        async unsubscribe() {
            if (this.channel_type === 'mail.channel') {
                return this.async(() => this.env.rpc({
                    model: 'mail.channel',
                    method: 'action_unfollow',
                    args: [[this.id]]
                }));
            }
            return this.async(() => this.env.rpc({
                model: 'mail.channel',
                method: 'channel_pin',
                args: [this.uuid, false]
            }));
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @override
         */
        static _findFunctionFromData(data) {
            return entity => entity.id === data.id && entity.model === data.model;
        }

        /**
         * @private
         * @returns {mail.messaging.entity.Attachment[]}
         */
        _computeAllAttachments() {
            const allAttachments = [...new Set(this.originThreadAttachments.concat(this.attachments))]
                .sort((a1, a2) => a1.id < a2.id ? 1 : -1);
            return [['replace', allAttachments]];
        }

        /**
         * @private
         * @returns {mail.messaging.entity.ChatWindow[]}
         */
        _computeChatWindows() {
            const chatWindowViewers = this.viewers.filter(viewer => !!viewer.chatWindow);
            return [['replace', chatWindowViewers.map(viewer => viewer.chatWindow)]];
        }

        /**
         * @private
         * @returns {string}
         */
        _computeDisplayName() {
            if (this.channel_type === 'chat' && this.correspondent) {
                return this.custom_channel_name || this.correspondent.nameOrDisplayName;
            }
            return this.name;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsCurrentPartnerFollowing() {
            return this.followers.some(follower =>
                follower.partner && follower.partner === this.env.messaging.currentPartner
            );
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsModeratedByCurrentPartner() {
            if (this.model !== 'mail.channel') {
                return false;
            }
            if (!this.messaging) {
                return false;
            }
            if (!this.messaging.currentPartner) {
                return false;
            }
            return this.messaging.currentPartner.moderatedChannelIds.includes(this.id);
        }

        /**
         * @private
         * @returns {mail.messaging.entity.ThreadCache}
         */
        _computeMainCache() {
            return [['replace', this.cache('[]')]];
        }

        /**
         * @private
         * @returns {mail.messaging.entity.Messaging}
         */
        _computeMessaging() {
            return [['link', this.env.messaging]];
        }

        /**
         * @private
         * @returns {mail.messaging.entity.Partner[]}
         */
        _computeOrderedOtherTypingMembers() {
            return [[
                'replace',
                this.orderedTypingMembers.filter(
                    member => member !== this.env.messaging.currentPartner
                ),
            ]];
        }

        /**
         * @private
         * @returns {mail.messaging.entity.Partner[]}
         */
        _computeOrderedTypingMembers() {
            return [[
                'replace',
                this.orderedTypingMemberLocalIds
                    .map(localId => this.env.entities.Partner.get(localId))
                    .filter(member => !!member),
            ]];
        }

        /**
         * @private
         * @returns {string}
         */
        _computeTypingStatusText() {
            if (this.orderedOtherTypingMembers.length === 0) {
                return this.constructor.fields.typingStatusText.default;
            }
            if (this.orderedOtherTypingMembers.length === 1) {
                return _.str.sprintf(
                    this.env._t("%s is typing..."),
                    this.orderedOtherTypingMembers[0].nameOrDisplayName
                );
            }
            if (this.orderedOtherTypingMembers.length === 2) {
                return _.str.sprintf(
                    this.env._t("%s and %s are typing..."),
                    this.orderedOtherTypingMembers[0].nameOrDisplayName,
                    this.orderedOtherTypingMembers[1].nameOrDisplayName
                );
            }
            return _.str.sprintf(
                this.env._t("%s, %s and more are typing..."),
                this.orderedOtherTypingMembers[0].nameOrDisplayName,
                this.orderedOtherTypingMembers[1].nameOrDisplayName
            );
        }

        /**
         * @override
         */
        _createInstanceLocalId(data) {
            const { channel_type, id, isTemporary = false, model } = data;
            let threadModel = model;
            if (!threadModel && channel_type) {
                threadModel = 'mail.channel';
            }
            if (isTemporary) {
                return `${this.constructor.entityName}_${id}`;
            }
            return `${this.constructor.entityName}_${threadModel}_${id}`;
        }

        /**
         * @private
         * @param {Object} param0
         * @param {boolean} param0.isTyping
         */
        async _notifyCurrentPartnerTypingStatus({ isTyping }) {
            if (
                this._forceNotifyNextCurrentPartnerTypingStatus ||
                isTyping !== this._currentPartnerLastNotifiedIsTyping
            ) {
                if (this.model === 'mail.channel') {
                    await this.async(() => this.env.rpc({
                        model: 'mail.channel',
                        method: 'notify_typing',
                        args: [this.id],
                        kwargs: { is_typing: isTyping },
                    }, { shadow: true }));
                }
                if (isTyping && this._currentPartnerLongTypingTimer.isRunning) {
                    this._currentPartnerLongTypingTimer.reset();
                }
            }
            this._forceNotifyNextCurrentPartnerTypingStatus = false;
            this._currentPartnerLastNotifiedIsTyping = isTyping;
        }

        /**
         * @private
         * @param {Object} [param0={}]
         * @param {boolean} [param0.mail_invite_follower_channel_only=false]
         */
        _promptAddFollower({ mail_invite_follower_channel_only = false } = {}) {
            const action = {
                type: 'ir.actions.act_window',
                res_model: 'mail.wizard.invite',
                view_mode: 'form',
                views: [[false, 'form']],
                name: this.env._t("Invite Follower"),
                target: 'new',
                context: {
                    default_res_model: this.model,
                    default_res_id: this.id,
                    mail_invite_follower_channel_only,
                },
            };
            this.env.do_action(action, {
                on_close: () => this.refreshFollowers(),
            });
        }

        /**
         * @override
         */
        _updateAfter(previous) {
            if (
                this.model === 'mail.channel' &&
                previous.foldState &&
                this.foldState !== previous.foldState
            ) {
                this.notifyFoldStateToServer();
            }

            // TODO FIXME prevent to open/close a channel on mobile when you
            // open/close it on desktop (task-2267593)

            // chat window
            if (this.foldState !== 'closed' && this.chatWindows.length === 0) {
                this.env.messaging.chatWindowManager.openThread(this);
            }
            if (this.foldState === 'closed' && this.chatWindows.length > 0) {
                for (const chatWindow of this.chatWindows) {
                    chatWindow.close();
                }
            }
        }

        /**
         * @override
         */
        _updateBefore() {
            return {
                foldState: this.foldState,
            };
        }

        //----------------------------------------------------------------------
        // Handlers
        //----------------------------------------------------------------------

        /**
         * @private
         */
        async _onCurrentPartnerInactiveTypingTimeout() {
            await this.async(() => this.unregisterCurrentPartnerIsTyping());
        }

        /**
         * Called when current partner has been typing for a very long time.
         * Immediately notify other members that he/she is still typing.
         *
         * @private
         */
        async _onCurrentPartnerLongTypingTimeout() {
            this._forceNotifyNextCurrentPartnerTypingStatus = true;
            this._throttleNotifyCurrentPartnerTypingStatus.clear();
            await this.async(
                () => this._throttleNotifyCurrentPartnerTypingStatus({ isTyping: true })
            );
        }

        /**
         * @private
         * @param {mail.messaging.entity.Partner} partner
         */
        async _onOtherMemberLongTypingTimeout(partner) {
            if (!this.typingMembers.includes(partner)) {
                this._otherMembersLongTypingTimers.delete(partner);
                return;
            }
            this.unregisterOtherMemberTypingMember(partner);
        }
    }

    Thread.entityName = 'Thread';

    Thread.fields = {
        allAttachments: many2many('Attachment', {
            compute: '_computeAllAttachments',
            dependencies: [
                'attachments',
                'originThreadAttachments',
            ],
        }),
        areAttachmentsLoaded: attr({
            default: false,
        }),
        attachments: many2many('Attachment', {
            inverse: 'threads',
        }),
        caches: one2many('ThreadCache', {
            inverse: 'thread',
            isCausal: true,
        }),
        channel_type: attr(),
        chatWindows: one2many('ChatWindow', {
            compute: '_computeChatWindows',
            dependencies: ['viewersChatWindow'],
        }),
        composer: one2one('Composer', {
            autocreate: true,
            inverse: 'thread',
            isCausal: true,
        }),
        correspondent: many2one('Partner', {
            inverse: 'correspondentThreads',
        }),
        correspondentNameOrDisplayName: attr({
            related: 'correspondent.nameOrDisplayName',
        }),
        counter: attr({
            default: 0,
        }),
        creator: many2one('User'),
        custom_channel_name: attr(),
        displayName: attr({
            compute: '_computeDisplayName',
            dependencies: [
                'channel_type',
                'correspondent',
                'correspondentNameOrDisplayName',
                'custom_channel_name',
                'name',
            ],
        }),
        foldState: attr({
            default: 'closed',
        }),
        followersPartner: many2many('Partner', {
            related: 'followers.partner',
        }),
        followers: one2many('Follower', {
            inverse: 'followedThread',
        }),
        group_based_subscription: attr({
            default: false,
        }),
        id: attr(),
        isCurrentPartnerFollowing: attr({
            compute: '_computeIsCurrentPartnerFollowing',
            default: false,
            dependencies: [
                'followersPartner',
                'messagingCurrentPartner',
            ],
        }),
        isModeratedByCurrentPartner: attr({
            compute: '_computeIsModeratedByCurrentPartner',
            dependencies: [
                'model',
                'messagingCurrentPartner',
            ],
        }),
        isPinned: attr({
            default: false,
        }),
        isTemporary: attr({
            default: false,
        }),
        is_moderator: attr({
            default: false,
        }),
        lastMessage: many2one('Message', {
            related: 'mainCache.lastMessage',
        }),
        mainCache: one2one('ThreadCache', {
            compute: '_computeMainCache',
            dependencies: ['caches'],
        }),
        mass_mailing: attr({
            default: false,
        }),
        members: many2many('Partner', {
            inverse: 'memberThreads',
        }),
        message_needaction_counter: attr({
            default: 0,
        }),
        message_unread_counter: attr({
            default: 0,
        }),
        messaging: many2one('Messaging', {
            compute: '_computeMessaging',
        }),
        messagingCurrentPartner: many2one('Partner', {
            related: 'messaging.currentPartner',
        }),
        model: attr(),
        model_name: attr(),
        moderation: attr({
            default: false,
        }),
        name: attr(),
        /**
         * Ordered typing members on this thread, excluding the current partner.
         */
        orderedOtherTypingMembers: many2many('Partner', {
            compute: '_computeOrderedOtherTypingMembers',
            dependencies: ['orderedTypingMembers'],
        }),
        /**
         * Ordered typing members on this thread. Lower index means this member
         * is currently typing for the longest time. This list includes current
         * partner as typer.
         */
        orderedTypingMembers: many2many('Partner', {
            compute: '_computeOrderedTypingMembers',
            dependencies: [
                'orderedTypingMemberLocalIds',
                'typingMembers',
            ],
        }),
        /**
         * Technical attribute to manage ordered list of typing members.
         */
        orderedTypingMemberLocalIds: attr({
            default: [],
        }),
        originThreadAttachments: one2many('Attachment', {
            inverse: 'originThread',
        }),
        public: attr(),
        seen_message_id: attr(),
        seen_partners_info: attr(),
        /**
         * Members that are currently typing something in the composer of this
         * thread, including current partner.
         */
        typingMembers: many2many('Partner'),
        /**
         * Text that represents the status on this thread about typing members.
         */
        typingStatusText: attr({
            compute: '_computeTypingStatusText',
            default: '',
            dependencies: ['orderedOtherTypingMembers'],
        }),
        uuid: attr(),
        viewers: one2many('ThreadViewer', {
            inverse: 'thread',
        }),
        viewersChatWindow: many2many('ChatWindow', {
            related: 'viewers.chatWindow',
        }),
    };

    return Thread;
}

registerNewEntity('Thread', ThreadFactory);

});
