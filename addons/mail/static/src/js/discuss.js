odoo.define('mail.Discuss', function (require) {
"use strict";

var BasicComposer = require('mail.composer.Basic');
var ExtendedComposer = require('mail.composer.Extended');
var ThreadWidget = require('mail.widget.Thread');

var AbstractAction = require('web.AbstractAction');
var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var dom = require('web.dom');

var QWeb = core.qweb;
var _t = core._t;

/**
 * Widget : Invite People to Channel Dialog
 *
 * Popup containing a 'many2many_tags' custom input to select multiple partners.
 * Searches user according to the input, and triggers event when selection is
 * validated.
 */
var PartnerInviteDialog = Dialog.extend({
    dialog_title: _t("Invite people"),
    template: 'mail.PartnerInviteDialog',

    /**
     * @override
     * @param {integer|string} channelID id of the channel,
     *      a string for static channels (e.g. 'mailbox_inbox').
     */
    init: function (parent, title, channelID) {
        this._channelID = channelID;

        this._super(parent, {
            title: title,
            size: 'medium',
            buttons: [{
                text: _t("Invite"),
                close: true,
                classes: 'btn-primary',
                click: this._addChannel.bind(this),
            }],
        });
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        this.$input = this.$('.o_mail_discuss_partner_invite_input');
        this.$input.select2({
            width: '100%',
            allowClear: true,
            multiple: true,
            query: function (query) {
                self.call('mail_service', 'searchPartner', query.term, 20)
                    .then(function (partners) {
                        query.callback({
                            results: _.map(partners, function (partner) {
                                return _.extend(partner, { text: partner.label });
                            }),
                        });
                    });
            }
        });
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {Promise}
     */
    _addChannel: function () {
        var self = this;
        var data = this.$input.select2('data');
        if (data.length >= 1) {
            return this._rpc({
                    model: 'mail.channel',
                    method: 'channel_invite',
                    args: [this._channelID],
                    kwargs: {partner_ids: _.pluck(data, 'id')},
                }).then(function () {
                    var names = _.escape(_.pluck(data, 'text').join(', '));
                    var notification =
                        _.str.sprintf(
                            _t("You added <b>%s</b> to the conversation."),
                            names
                        );
                    self.do_notify(_t("New people"), notification);
                    // Update list of members with the invited user, so that
                    // we can mention this user in this channel right away.
                    var channel = self.call('mail_service', 'getChannel', self._channelID);
                    channel.forceFetchMembers();
                });
        }
    },
});

/**
 * Widget : Rename Conversation Dialog
 */
var RenameConversationDialog = Dialog.extend({
    dialog_title: _t("Rename conversation"),
    template: 'mail.RenameConversationDialog',
    /**
     * @override
     * @param {integer|string} channelID id of the channel
     * @param {function} callback to call when successfully renaming
     *   conversation.
     */
    init: function (parent, channelID, callback) {
        this._channelID = channelID;
        this._callback = callback;

        this._super(parent, {
            title: _t('Rename conversation'),
            size: 'medium',
            buttons: [{
                text: _t("Rename"),
                close: true,
                classes: 'btn-primary o_mail_conversation_rename',
                click: this._rename.bind(this),
            }, {
                text: _t("Discard"),
                close: true,
            }],
        });
    },
    /**
     * @override
     * @returns {$.Promise}
     */
    start: function () {
        var channel = this.call('mail_service', 'getChannel', this._channelID);
        this.$('input').val(channel.getName());
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {$.Promise}
     */
    _rename: function () {
        var self = this;
        var name = this.$('input').val();
        return this._rpc({
            model: 'mail.channel',
            method: 'channel_set_custom_name',
            args: [this._channelID],
            kwargs: {
                name: name,
            }
        }).then(function () {
            var channel = self.call('mail_service', 'getThread', self._channelID);
            channel.setName(name);
            self._callback();
        });
    },
});

var Discuss = AbstractAction.extend({
    contentTemplate: 'mail.legacy.discuss',
    custom_events: _.extend({}, AbstractAction.prototype.custom_events, {
        discard_extended_composer: '_onDiscardExtendedComposer',
    }),
    events: {
        'click .o_mail_sidebar_title .o_add': '_onAddThread',
        'blur .o_mail_add_thread input': '_onAddThreadBlur',
        'click .o_mail_channel_settings': '_onChannelSettingsClicked',
        'click .o_mail_discuss_item': '_onDiscussItemClicked',
        'keydown': '_onKeydown',
        'click .o_mail_open_channels': '_onPublicChannelsClick',
        'click .o_mail_partner_unpin': '_onUnpinChannel',
        'input .o_discuss_sidebar_quick_search input': '_onInputSidebarQuickSearchInput',
    },
    hasControlPanel: true,
    loadControlPanel: true,
    withSearchBar: true,
    searchMenuTypes: ['filter', 'favorite'],

    /**
     * @override
     * @param {Object} [options]
     * @param {integer} [options.channelQuickSearchThreshold=20] amount of
     *   channels (dm inluded) for which a quick search appears in the sidebar.
     */
    init: function (parent, action, options) {
        this._super.apply(this, arguments);

        this.action = action;
        this.context = action.context;
        this.action_manager = parent;
        this.domain = [];
        this.options = options || {};

        if (!('channelQuickSearchThreshold' in this.options)) {
            this.options.channelQuickSearchThreshold = 20;
        }

        this._isMessagingReady = this.call('mail_service', 'isReady');
        this._isStarted = false;
        this._threadsScrolltop = {};
        this._composerStates = {};
        this._defaultThreadID = this.options.active_id ||
                                this.action.context.active_id ||
                                this.action.params.default_active_id ||
                                'mailbox_inbox';
        this._selectedMessage = null;
        this._throttledUpdateThreads = _.throttle(
            this._updateThreads.bind(this), 100, { leading: false });

        this.controlPanelModelConfig.modelName = 'mail.message';
        this.call('mail_service', 'getMailBus').on('messaging_ready', this, this._onMessagingReady);
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        this._isStarted = true;
        return this._super.apply(this, arguments).then(function () {
            if (!self._isMessagingReady) {
                return;
            }
            return self._initRender();
        });
    },
    /**
     * @override
     */
    do_show: function () {
        this._super.apply(this, arguments);
        this.updateControlPanel();
        this.action_manager.do_push_state({
            action: this.action.id,
            active_id: this._thread.getID(),
        });
    },
    /**
     * @override
     */
    destroy: function () {
        if (this.$buttons) {
            this.$buttons.off().remove();
        }
        this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    on_attach_callback: function () {
        this._super();
        this.call('mail_service', 'getMailBus').trigger('discuss_open', true);
        if (this._thread) {
            this._threadWidget.scrollToPosition(this._threadsScrolltop[this._thread.getID()]);
            this._loadEnoughMessages();
        }
    },
    /**
     * @override
     */
    on_detach_callback: function () {
        this._super();
        this.call('mail_service', 'getMailBus').trigger('discuss_open', false);
        if (this._thread) {
            this._threadsScrolltop[this._thread.getID()] = this._threadWidget.getScrolltop();
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Ask confirmation to the user to unsubscribe, due to the user being the
     * administrator of the channel.
     *
     * @private
     * @param {mail.model.Channel} channel a channel for which the current user
     *   is administrator of.
     */
    _askConfirmationAdminUnsubscribe: function (channel) {
        Dialog.confirm(this,
            _t("You are the administrator of this channel. Are you sure you want to unsubscribe?"),
            {
                buttons: [{
                    text: _t("Unsubscribe"),
                    classes: 'btn-primary',
                    close: true,
                    click: function () {
                        channel.unsubscribe();
                    }
                }, {
                    text: _t("Discard"),
                    close: true,
                }]
            }
        );
    },
    /**
     * @private
     * @returns {Promise}
     */
    _fetchAndRenderThread: function () {
        var self = this;
        return this._thread.fetchMessages(this.domain)
            .then(function () {
                self._threadWidget.render(
                    self._thread,
                    self._getThreadRenderingOptions()
                );
                return self._loadEnoughMessages();
            });
    },
    /**
     * @private
     * @returns {Object}
     */
    _getThreadRenderingOptions: function () {
        // Compute position of the 'New messages' separator, only once when
        // joining a channel to keep it in the thread when new messages arrive
        if (_.isUndefined(this.messagesSeparatorPosition)) {
            if (!this._unreadCounter) {
                // no unread message -> don't display separator
                this.messagesSeparatorPosition = false;
            } else {
                var messageID = this._thread.getLastSeenMessageID();
                this.messagesSeparatorPosition = messageID || 'top';
            }
        }
        var hasThreadMessages = this._thread.hasMessages({domain: this.domain});
        return {
            displayLoadMore: !this._thread.isAllHistoryLoaded(this.domain),
            displayMarkAsRead: this._thread.getID() === 'mailbox_inbox',
            domain: this.domain,
            messagesSeparatorPosition: this.messagesSeparatorPosition,
            squashCloseMessages: this._thread.getType() !== 'mailbox' &&
                                    !this._thread.isMassMailing(),
            displayEmptyThread: !hasThreadMessages && !this.domain.length,
            displayNoMatchFound: !hasThreadMessages && !!this.domain.length,
            displaySubjectOnMessages: this._thread.isMassMailing() ||
                this._thread.getID() === 'mailbox_inbox',
            displayReplyIcons: true,
            displayBottomThreadFreeSpace: true,
        };
    },
    /**
     * @private
     */
    _initRender: function () {
        var self = this;
        this.$('.o_mail_discuss_loading').remove();
        this._basicComposer = new BasicComposer(this, {
            mentionPartnersRestricted: true,
        });
        this._extendedComposer = new ExtendedComposer(this, {
            mentionPartnersRestricted: true,
        });
        this._basicComposer
            .on('post_message', this, this._onPostMessage)
            .on('input_focused', this, this._onComposerFocused);
        this._extendedComposer
            .on('post_message', this, this._onPostMessage)
            .on('input_focused', this, this._onComposerFocused);
        this._renderButtons();

        var defs = [];
        defs.push(
            this._renderThread()
        );
        defs.push(
            this._basicComposer.appendTo(this.$('.o_mail_discuss_content')));
        defs.push(
            this._extendedComposer.appendTo(this.$('.o_mail_discuss_content')));

        return Promise.all(defs)
            .then(function () {
                return self._setThread(self._defaultThreadID);
            })
            .then(function () {
                self._initThreads();
                self._startListening();
                self._threadWidget.$el.on('scroll', null, _.debounce(function () {
                    if (
                        self._threadWidget.getScrolltop() < 20 &&
                        !self._threadWidget.$('.o_mail_no_content').length &&
                        !self._thread.isAllHistoryLoaded(self.domain)
                    ) {
                        self._loadMoreMessages();
                    }
                    if (
                        self._threadWidget.isAtBottom() &&
                        self._thread.getType() !== 'mailbox'
                    ) {
                        self._thread.markAsRead();
                    }
                }, 100));
            });
    },
    /**
     * Renders the mainside bar with current threads
     *
     * @private
     */
    _initThreads: function () {
        var self = this;
        var $sidebar = this._renderSidebar();
        this.$('.o_mail_discuss_sidebar').html($sidebar.contents());
        _.each(['dm_chat', 'multi_user_channel'], function (type) {
            var $input = self.$('.o_mail_add_thread[data-type=' + type + '] input');
            self._prepareAddThreadInput($input, type);
        });
    },
    /**
     * Ensures that enough messages have been loaded to fill the entire screen
     * (this is particularily important because remaining messages can only be
     * loaded when scrolling to the top, so they can't be loaded if there is no
     * scrollbar)
     *
     * @returns {Promise} resolved when there are enough messages to fill the
     *   screen, or when there is no more message to fetch
     */
    _loadEnoughMessages: function () {
        var loadMoreMessages =
            this._threadWidget.el.clientHeight &&
            (this._threadWidget.el.clientHeight === this._threadWidget.el.scrollHeight) &&
            !this._thread.isAllHistoryLoaded(this.domain);
        if (loadMoreMessages) {
            return this._loadMoreMessages().then(this._loadEnoughMessages.bind(this));
        }
    },
    /**
     * Load more messages for the current thread
     *
     * @private
     * @returns {Promise}
     */
    _loadMoreMessages: function () {
        var self = this;
        var oldestMessageID = this.$('.o_thread_message').first().data('messageId');
        var oldestMessageSelector = '.o_thread_message[data-message-id="' + oldestMessageID + '"]';
        var offset = -dom.getPosition(document.querySelector(oldestMessageSelector)).top;
        return this._thread.fetchMessages(this.domain, true)
            .then(function () {
                if (self.messagesSeparatorPosition === 'top') {
                    // reset value to re-compute separator position
                    self.messagesSeparatorPosition = undefined;
                }
                self._threadWidget.render(
                    self._thread,
                    self._getThreadRenderingOptions()
                );
                offset += dom.getPosition(document.querySelector(oldestMessageSelector)).top;
                self._threadWidget.scrollToPosition(offset);
            });
    },
    /**
     * Binds handlers on the given $input to make them autocomplete and/or
     * create threads.
     *
     * @private
     * @param {JQuery} $input the input to prepare
     * @param {string} type the type of thread to create ('dm_chat',
     *   'multi_user_channel')
     */
    _prepareAddThreadInput: function ($input, type) {
        var self = this;
        if (type === 'multi_user_channel') {
            $input.autocomplete({
                autoFocus: true,
                source: function (request, response) {
                    self._lastSearchVal = _.escape(request.term);
                    self._searchChannel(self._lastSearchVal).then(function (result){
                        result.push({
                            label:  _.str.sprintf(
                                        '<strong>' + _t("Create %s (Public)") + '</strong>',
                                        '<em>"#' + self._lastSearchVal + '"</em>'
                            ),
                            value: self._lastSearchVal,
                            special: 'public',
                        }, {
                            label:  _.str.sprintf(
                                        '<strong>' + _t("Create %s (Private)") + '</strong>',
                                        '<em>"#' + self._lastSearchVal + '"</em>'
                            ),
                            value: self._lastSearchVal,
                            special: 'private',
                        });
                        response(result);
                    });
                },
                select: function (ev, ui) {
                    if (self._lastSearchVal) {
                        if (ui.item.special) {
                            if (ui.item.special === 'public') {
                                self.call('mail_service', 'createChannel', self._lastSearchVal, 'public');
                            } else {
                                self.call('mail_service', 'createChannel', self._lastSearchVal, 'private');
                            }
                        } else {
                            self.call( 'mail_service', 'joinChannel', ui.item.id);
                        }
                    }
                },
                focus: function (ev) {
                    ev.preventDefault();
                },
                html: true,
            });
        } else if (type === 'dm_chat') {
            $input.autocomplete({
                autoFocus: true,
                source: function (request, response) {
                    self._lastSearchVal = _.escape(request.term);
                    self.call('mail_service', 'searchPartner', self._lastSearchVal, 10).then(response);
                },
                select: function (ev, ui) {
                    var partnerID = ui.item.id;
                    var dmChat = self.call('mail_service', 'getDMChatFromPartnerID', partnerID);
                    if (dmChat) {
                        self._setThread(dmChat.getID());
                    } else {
                        self.call('mail_service', 'createChannel', partnerID, 'dm_chat');
                    }
                    // clear the input
                    $(this).val('');
                    return false;
                },
                focus: function (ev) {
                    ev.preventDefault();
                },
            });
        }
    },
    /**
     * @private
     */
    _renderButtons: function () {
        this.$buttons = $(QWeb.render('mail.legacy.discuss.ControlButtons', { debug: config.isDebug() }));
        this.$buttons.find('button').css({display:'inline-block'});
        this.$buttons
            .on('click', '.o_mail_discuss_button_invite', this._onInviteButtonClicked.bind(this))
    },
    /**
     * Render the sidebar of discuss app
     *
     * @private
     * @returns {jQueryElement}
     */
    _renderSidebar: function () {
        var channels = this.call('mail_service', 'getChannels');
        channels = this._sortChannels(channels);
        var $sidebar = $(QWeb.render('mail.legacy.discuss.Sidebar', {
            activeThreadID: this._thread ? this._thread.getID() : undefined,
            inbox: this.call('mail_service', 'getMailbox', 'inbox'),
            channels: channels,
            displayQuickSearch: channels.length >= this.options.channelQuickSearchThreshold,
            options: this.options,
        }));
        return $sidebar;
    },
    /**
     * @private
     * @param {Object} options
     * @param {string} [options.searchChannelVal='']
     */
    _renderSidebarChannels: function (options) {
        options.searchChannelVal = options.searchChannelVal || '';
        var channels = this.call('mail_service', 'getChannels');
        var searchChannelValLowerCase = options.searchChannelVal.toLowerCase();
        channels = _.filter(channels, function (channel) {
            var channelNameLowerCase = channel.getName().toLowerCase();
            return channelNameLowerCase.indexOf(searchChannelValLowerCase) !== -1;
        });
        channels = this._sortChannels(channels);
        this.$('.o_mail_discuss_sidebar_channels').html(
            QWeb.render('mail.legacy.discuss.SidebarChannels', {
                activeThreadID: this._thread ? this._thread.getID() : undefined,
                channels: channels,
                displayQuickSearch: channels.length >= this.options.channelQuickSearchThreshold,
            })
        );
    },
    /**
     * @private
     */
    _renderSidebarMailboxes: function () {
        this.$('.o_mail_discuss_sidebar_mailboxes').html(
            QWeb.render('mail.legacy.discuss.SidebarMailboxes', {
                activeThreadID: this._thread ? this._thread.getID() : undefined,
                inbox: this.call('mail_service', 'getMailbox', 'inbox'),
            })
        );
    },
    /**
     * @private
     * @param {string} template
     * @param {Object} context rendering context
     * @param {integer} [timeout=20000] the delay before the snackbar disappears
     */
    _renderSnackbar: function (template, context, timeout) {
        if (this.$snackbar) {
            this.$snackbar.remove();
        }
        timeout = timeout || 20000;
        this.$snackbar = $(QWeb.render(template, context));
        this.$('.o_mail_discuss_content').append(this.$snackbar);
        // Hide snackbar after [timeout] milliseconds (by default, 20s)
        var $snackbar = this.$snackbar;
        setTimeout(function () { $snackbar.fadeOut(); }, timeout);
    },
    /**
     * Renders, binds events and appends a thread widget.
     *
     * @private
     * @returns {Promise}
     */
    _renderThread: function () {
        this._threadWidget = new ThreadWidget(this, {
            loadMoreOnScroll: true
        });

        this._threadWidget
            .on('redirect', this, function (resModel, resID) {
                this.call('mail_service', 'redirect', resModel, resID, this._setThread.bind(this));
            })
            .on('redirect_to_channel', this, function (channelID) {
                this.call('mail_service', 'joinChannel', channelID).then(this._setThread.bind(this));
            })
            .on('load_more_messages', this, this._loadMoreMessages)
            .on('mark_as_read', this, function (messageID) {
                this.call('mail_service', 'markMessagesAsRead', [messageID]);
            })
            .on('select_message', this, this._selectMessage)
            .on('unselect_message', this, this._unselectMessage);

        return this._threadWidget.appendTo(this.$('.o_mail_discuss_content'));
    },
    /**
     * @private
     * @param {mail.model.Channel} channel
     */
    _restoreComposerState: function (channel) {
        var composer = channel.isMassMailing() ? this._extendedComposer : this._basicComposer;
        var composerState = this._composerStates[channel.getUUID()];
        if (composerState) {
            composer.setState(composerState);
        }
    },
    /**
     * Restores the scroll position and composer state of the current thread
     *
     * @private
     */
    _restoreThreadState: function () {
        var $newMessagesSeparator = this.$('.o_thread_new_messages_separator');
        if ($newMessagesSeparator.length) {
            this._threadWidget.$el.scrollTo($newMessagesSeparator);
        } else {
            var newThreadScrolltop = this._threadsScrolltop[this._thread.getID()];
            this._threadWidget.scrollToPosition(newThreadScrolltop);
        }
        if (this._thread.getType() !== 'mailbox') {
            this._restoreComposerState(this._thread);
        }
    },
    /**
     * @private
     * @param {string} searchVal
     * @returns {Promise<Array>}
     */
    _searchChannel: function (searchVal){
        return this._rpc({
                model: 'mail.channel',
                method: 'channel_search_to_join',
                args: [searchVal]
            })
            .then(function (result){
                var values = [];
                _.each(result, function (channel){
                    var escapedName = _.escape(channel.name);
                    values.push(_.extend(channel, {
                        'value': escapedName,
                        'label': escapedName,
                    }));
                });
                return values;
            });
    },
    /**
     * @private
     * @param {integer} messageID
     */
    _selectMessage: function (messageID) {
        this.$el.addClass('o_mail_selection_mode');
        var message = this.call('mail_service', 'getMessage', messageID);
        this._selectedMessage = message;
        var subject = "Re: " + message.getDocumentName();
        this._extendedComposer.setSubject(subject);
        this._extendedComposer.showDiscardButton();

        if (this._thread.getType() !== 'mailbox') {
            this._basicComposer.do_hide();
        }
        this._extendedComposer.do_show();

        this._threadWidget.scrollToMessage({
            messageID: messageID,
            duration: 200,
            onlyIfNecessary: true
        });
        this._extendedComposer.focus('body');
    },
    /**
     * Set the selected thread with ID `threadID`.
     * If there is no thread with such ID, fallback on mailbox 'inbox'.
     *
     * @private
     * @param {integer} threadID a thread with such ID
     * @returns {Promise}
     */
    _setThread: async function (threadID) {
        // Store scroll position and composer state of the previous thread
        this._storeThreadState();

        this._thread = this.call('mail_service', 'getThread', threadID) ||
                        this.call('mail_service', 'getMailbox', 'inbox');

        // reset value on channel change
        this.messagesSeparatorPosition = undefined;
        this._unreadCounter = this._thread.getUnreadCounter();
        if (this.$snackbar) {
            this.$snackbar.remove();
        }

        this.action.context.active_id = this._thread.getID();
        this.action.context.active_ids = [this._thread.getID()];

        this._basicComposer.setThread(this._thread);
        this._extendedComposer.setThread(this._thread);

        await this._fetchAndRenderThread();
        // Mark thread's messages as read and clear needactions
        if (this._thread.getType() !== 'mailbox') {
            this._thread.markAsRead();
        }
        // Restore scroll position and composer of the new current thread
        this._restoreThreadState();

        // Update control panel before focusing the composer, otherwise
        // focus is on the searchview
        await this.updateControlPanel({
            title: '#' + this._thread.getName(),
            cp_content: {
                $buttons: this.$buttons,
            },
        });
        this._updateControlPanelButtons(this._thread);

        // Display and focus the adequate composer, and unselect possibly
        // selected message to prevent sending messages as reply to that
        // message
        this._unselectMessage();

        this.action_manager.do_push_state({
            action: this.action.id,
            active_id: this._thread.getID(),
        });
    },
    /**
     * @private
     * @param {mail.model.Channel[]} channels
     * @returns {mail.model.Channel[]}
     */
    _sortChannels: function (channels) {
        return channels;
    },
    /**
     * Binds handlers on mail bus events
     *
     * @private
     */
    _startListening: function () {
        this.call('mail_service', 'getMailBus')
            .on('open_thread_in_discuss', this, this._onOpenThreadInDiscuss)
            .on('new_message', this, this._onNewMessage)
            .on('update_message', this, this._onMessageUpdated)
            .on('new_channel', this, this._onNewChannel)
            .on('is_thread_bottom_visible', this, this._onIsThreadBottomVisible)
            .on('unsubscribe_from_channel', this, this._onChannelLeft)
            .on('update_needaction', this, this._onUpdateNeedaction)
            .on('update_thread_unread_counter', this, this._onUpdateThreadUnreadCounter)
            .on('activity_updated', this, this._onActivityUpdated)
            .on('update_channel', this, this._onUpdateChannel);
    },
    /**
     * @private
     * @param {mail.model.Channel} channel
     */
    _storeComposerState: function (channel) {
        var composer = channel.isMassMailing() ? this._extendedComposer : this._basicComposer;
        this._composerStates[channel.getUUID()] = composer.getState();
        composer.clearComposer();
    },
    /**
     * Stores the scroll position of the current thread.
     * For channels, also stores composer state.
     *
     * @private
     */
    _storeThreadState: function () {
        if (this._thread) {
            this._threadsScrolltop[this._thread.getID()] = this._threadWidget.getScrolltop();
            if (this._thread.getType() !== 'mailbox') {
                this._storeComposerState(this._thread);
            }
        }
    },
    /**
     * @private
     */
    _unselectMessage: function () {
        this._basicComposer.do_toggle(this._thread.getType() !== 'mailbox' && !this._thread.isMassMailing());
        this._extendedComposer.do_toggle(this._thread.isMassMailing());
        this._extendedComposer.hideDiscardButton();

        if (!config.device.isMobile) {
            var composer = this._thread.getType() !== 'mailbox' && this._thread.isMassMailing() ?
                            this._extendedComposer :
                            this._basicComposer;
            composer.focus();
        }
        this.$el.removeClass('o_mail_selection_mode');
        this._threadWidget.unselectMessage();
        this._selectedMessage = null;
    },
    /**
     * Updates the control panel buttons visibility based on thread type
     *
     * @private
     * @param {mail.model.Thread} thread
     */
    _updateControlPanelButtons: function (thread) {
        // Hide 'unsubscribe' button in state channels and DM chats and channels with group-based subscription
        // Invite
        if (thread.getType() !== 'dm_chat' && thread.getType() !== 'mailbox') {
            this.$buttons
                .find('.o_mail_discuss_button_invite, .o_mail_discuss_button_settings')
                .removeClass('d-none d-md-inline-block')
                .addClass('d-none d-md-inline-block');
        } else {
            this.$buttons
                .find('.o_mail_discuss_button_invite, .o_mail_discuss_button_settings')
                .removeClass('d-none d-md-inline-block')
                .addClass('d-none');
        }

        this.$('.o_mail_discuss_item')
            .removeClass('o_active')
            .filter('[data-thread-id=' + thread.getID() + ']')
            .removeClass('o_unread_message')
            .addClass('o_active');
    },
    /**
     * Re-renders the mainside bar with current threads
     *
     * @private
     * @param {Object} [options={}]
     * @param {string} [options.searchChannelVal='']
     */
    _updateThreads: function (options) {
        var self = this;
        options = options || {};
        this._renderSidebarMailboxes(options);
        this._renderSidebarChannels(options);
        _.each(['dm_chat', 'multi_user_channel'], function (type) {
            var $input = self.$('.o_mail_add_thread[data-type=' + type + '] input');
            self._prepareAddThreadInput($input, type);
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onActivityUpdated: function () {
        this._throttledUpdateThreads();
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onAddThread: function (ev) {
        ev.preventDefault();
        var type = $(ev.target).data('type');
        this.$('.o_mail_add_thread[data-type=' + type + ']')
            .show()
            .find('input').focus();
    },
    /**
     * @private
     */
    _onAddThreadBlur: function () {
        this.$('.o_mail_add_thread').hide();
    },
    /**
     * @private
     * @param {integer|string} channelID
     */
    _onChannelLeft: function (channelID) {
        if (this._thread.getID() === channelID) {
            this._setThread('mailbox_inbox');
        }
        this._updateThreads();
        delete this._threadsScrolltop[channelID];
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onChannelSettingsClicked: function (ev) {
        ev.stopPropagation();
        var threadID = $(ev.currentTarget).data('thread-id');
        var thread = this.call('mail_service', 'getThread', threadID);
        if (thread.getType() === 'dm_chat') {
            new RenameConversationDialog(this, threadID, this._updateThreads.bind(this)).open();
            return;
        }
        this.do_action({
            type: 'ir.actions.act_window',
            res_model: 'mail.channel',
            res_id: threadID,
            views: [[false, 'form']],
            target: 'current'
        });
    },
    /**
     * @private
     */
    _onComposerFocused: function () {
        var composer = this._thread.isMassMailing() ? this._extendedComposer : this._basicComposer;
        var commands = this._thread.getCommands();
        var partners = this._thread.getMentionPartnerSuggestions();
        composer.mentionSetCommands(commands);
        composer.mentionSetPrefetchedPartners(partners);
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onDiscardExtendedComposer: function (ev) {
        ev.stopPropagation();
        this._unselectMessage();
    },
    /**
     * When clicking on an item in the sidebar
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onDiscussItemClicked: function (ev) {
        ev.preventDefault();
        var threadID = $(ev.currentTarget).data('thread-id');
        this._setThread(threadID);
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onInputSidebarQuickSearchInput: function (ev) {
        ev.preventDefault();
        this._updateThreads({
            searchChannelVal: $(ev.currentTarget).val(),
        });
    },
    /**
     * Invite button is only for channels (not mailboxes)
     *
     * @private
     */
    _onInviteButtonClicked: function () {
        var title = _.str.sprintf(_t("Invite people to #%s"), this._thread.getName());
        new PartnerInviteDialog(this, title, this._thread.getID()).open();
    },
    /**
     * Called when someone asks discuss whether the bottom of `thread` is
     * visible or not. An object `query` is provided in order to reponse on the
     * key `isVisible`.
     *
     * @private
     * @param {mail.model.Thread} thread
     * @param {Object} query
     * @param {boolean} query.isVisible the response to provide on whether the
     *   bottom of the thread is visible in discuss.
     */
    _onIsThreadBottomVisible: function (thread, query) {
        query.isVisible = query.isVisible ||
                            (
                                thread.getID() === this._thread.getID() &&
                                this._threadWidget.isAtBottom()
                            );
    },
    /**
     * @private
     * @param {KeyEvent} ev
     */
    _onKeydown: function (ev) {
        if (ev.which === $.ui.keyCode.ESCAPE && this._selectedMessage) {
            this._unselectMessage();
        }
    },
    /**
     * @private
     * @param {mail.model.Message} message
     * @param {string} [type] the channel
     */
    _onMessageUpdated: function (message, type) {
        var self = this;
        var currentThreadID = this._thread.getID();
        if (
            (currentThreadID === 'mailbox_inbox' && !message.isNeedaction())
        ) {
            this._thread.fetchMessages(this.domain)
                .then(function () {
                    var options = self._getThreadRenderingOptions();
                    self._threadWidget.removeMessageAndRender(message.getID(), self._thread, options);
                });
        } else if (_.contains(message.getThreadIDs(), currentThreadID)) {
            this._fetchAndRenderThread();
        }
    },
    /**
     * @private
     */
    _onMessagingReady: function () {
        if (this._isMessagingReady) {
            return;
        }
        this._isMessagingReady = true;
        if (!this._isStarted) {
            return;
        }
        this._initRender();
    },
    /**
     * @private
     * @param {mail.model.Channel} channel
     */
    _onNewChannel: function (channel) {
        this._updateThreads();
        if (channel.isAutoswitch()) {
            this._setThread(channel.getID());
        }
    },
    /**
     * @private
     * @param {mail.model.Message} message
     */
    _onNewMessage: function (message) {
        var self = this;
        if (_.contains(message.getThreadIDs(), this._thread.getID())) {
            if (this._thread.getType() !== 'mailbox' && this._threadWidget.isAtBottom()) {
                this._thread.markAsRead();
            }
            var shouldScroll = this._threadWidget.isAtBottom();
            this._fetchAndRenderThread().then(function () {
                if (shouldScroll) {
                    self._threadWidget.scrollToMessage({ msgID: message.getID() });
                }
            });
        }
        // Re-render sidebar to indicate that there is a new message in the corresponding threads
        this._updateThreads();
        // Dump scroll position of threads in which the new message arrived
        this._threadsScrolltop = _.omit(this._threadsScrolltop, message.getThreadIDs());
    },
    /**
     * Called when opening a thread in discuss, due to discuss being open.
     * All threads except document threads are valid for discuss app.
     *
     * @private
     * @param {mail.model.Thread}
     */
    _onOpenThreadInDiscuss: function (thread) {
        if (thread.getType() !== 'document_thread') {
            this._setThread(thread.getID());
        }
    },
    /**
     * @private
     * @param {Object} messageData
     */
    _onPostMessage: function (messageData) {
        var self = this;
        var options = {};
        if (this._selectedMessage) {
            messageData.subtype_xmlid = this._selectedMessage.isNote() ? 'mail.mt_note': 'mail.mt_comment';
            messageData.subtype_id = false;
            messageData.message_type = 'comment';

            options.documentID = this._selectedMessage.getDocumentID();
            options.documentModel = this._selectedMessage.getDocumentModel();
        }
        this._thread.postMessage(messageData, options)
            .then(function () {
                if (self._selectedMessage) {
                    self._renderSnackbar('mail.legacy.discuss.MessageSentSnackbar', {
                        documentName: self._selectedMessage.getDocumentName()
                    }, 5000);
                    self._unselectMessage();
                } else {
                    self._threadWidget.scrollToBottom();
                }
            });
    },
    /**
     * @private
     */
    _onPublicChannelsClick: function () {
        this.do_action({
            name: _t("Public Channels"),
            type: 'ir.actions.act_window',
            res_model: 'mail.channel',
            views: [[false, 'kanban'], [false, 'form']],
            domain: [['public', '!=', 'private']],
        }, {
            on_reverse_breadcrumb: this.on_reverse_breadcrumb,
        });
    },
    /**
     * @private
     * @param {Object} searchQuery
     */
    _onSearch: function (searchQuery) {
        this.domain = searchQuery.domain;
        if (this._thread) {
            // initially (when _onSearch is called manually), there is no
            // thread set yet, so don't try to fetch and render the thread as
            // this will be done as soon as the default thread is set
            this._fetchAndRenderThread();
        }
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onUnpinChannel: function (ev) {
        ev.stopPropagation();
        var channelID = $(ev.target).data('thread-id');
        var channel = this.call('mail_service', 'getChannel', channelID);
        if (channel.isMyselfAdministrator()) {
            this._askConfirmationAdminUnsubscribe(channel);
        } else {
            channel.unsubscribe();
        }
    },
    /**
     * @private
     * @param {integer} channelID
     */
    _onUpdateChannel: function (channelID) {
        if (this._thread.getID() !== channelID) {
            return;
        }
        this._fetchAndRenderThread();
    },
    /**
     * @private
     */
    _onUpdateNeedaction: function () {
        this._throttledUpdateThreads();
    },
    /**
     * @private
     */
    _onUpdateThreadUnreadCounter: function () {
        this._throttledUpdateThreads();
    },
});

core.action_registry.add('mail.discuss', Discuss);

return Discuss;

});
