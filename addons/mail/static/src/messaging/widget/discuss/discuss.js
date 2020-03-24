odoo.define('mail.widget.Discuss', function (require) {
'use strict';

const DiscussComponent = require('mail.component.Discuss');
const InvitePartnerDialog = require('mail.widget.DiscussInvitePartnerDialog');

const AbstractAction = require('web.AbstractAction');
const { _t, action_registry, qweb } = require('web.core');

const DiscussWidget = AbstractAction.extend({
    template: 'mail.widget.Discuss',
    hasControlPanel: true,
    loadControlPanel: true,
    withSearchBar: true,
    searchMenuTypes: ['filter', 'favorite'],
    custom_events: {
        search: '_onSearch',
    },
    /**
     * @override {web.AbstractAction}
     * @param {web.ActionManager} parent
     * @param {Object} action
     * @param {Object} [action.context]
     * @param {string} [action.context.active_id]
     * @param {Object} [action.params]
     * @param {string} [action.params.default_active_id]
     * @param {Object} [options={}]
     */
    init(parent, action, options={}) {
        this._super(...arguments);

        // render buttons in control panel
        this.$buttons = $(qweb.render('mail.widget.DiscussControlButtons'));
        this.$buttons.find('button').css({ display: 'inline-block' });
        this.$buttons.on('click', '.o_invite', ev => this._onClickInvite(ev));
        this.$buttons.on('click', '.o_widget_Discuss_controlPanelButtonMarkAllRead',
            ev => this._onClickMarkAllAsRead(ev)
        );
        this.$buttons.on('click', '.o_mobile_new_channel', ev => this._onClickMobileNewChannel(ev));
        this.$buttons.on('click', '.o_mobile_new_message', ev => this._onClickMobileNewMessage(ev));
        this.$buttons.on('click', '.o_unstar_all', ev => this._onClickUnstarAll(ev));
        this.$buttons.on('click', '.o_widget_Discuss_controlPanelButtonSelectAll', ev => this._onClickSelectAll(ev));
        this.$buttons.on('click', '.o_widget_Discuss_controlPanelButtonUnselectAll', ev => this._onClickUnselectAll(ev));
        this.$buttons.on('click', '.o_widget_Discuss_controlPanelButtonModeration.o-accept', ev => this._onClickModerationAccept(ev));
        this.$buttons.on('click', '.o_widget_Discuss_controlPanelButtonModeration.o-discard', ev => this._onClickModerationDiscard(ev));
        this.$buttons.on('click', '.o_widget_Discuss_controlPanelButtonModeration.o-reject', ev => this._onClickModerationReject(ev));

        // control panel attributes
        this.action = action;
        this.actionManager = parent;
        this.controlPanelParams.modelName = 'mail.message';
        this.options = options;

        this.component = undefined;

        this._initActiveThreadLocalId = this.options.active_id ||
            (this.action.context && this.action.context.active_id) ||
            (this.action.params && this.action.params.default_active_id) ||
            'mail.box_inbox';
        this._lastPushStateActiveThreadLocalId = null;
    },
    /**
     * @override
     */
    async willStart() {
        await this._super(...arguments);
        this.env = this.call('messaging', 'getMessagingEnv');
    },
    /**
     * @override {web.AbstractAction}
     */
    destroy() {
        if (this.component) {
            this.component.destroy();
            this.component = undefined;
        }
        if (this.$buttons) {
            this.$buttons.off().remove();
        }
        this._super(...arguments);
    },
    /**
     * @override {web.AbstractAction}
     */
    on_attach_callback() {
        this._super(...arguments);
        if (this.component) {
            // prevent twice call to on_attach_callback (FIXME)
            return;
        }
        DiscussComponent.env = this.env;
        this.component = new DiscussComponent(null, {
            initActiveThreadLocalId: this._initActiveThreadLocalId,
        });
        this._pushStateActionManagerEventListener = ev => {
            ev.stopPropagation();
            if (this._lastPushStateActiveThreadLocalId === ev.detail.activeThreadLocalId) {
                return;
            }
            this._pushStateActionManager(ev.detail.activeThreadLocalId);
            this._lastPushStateActiveThreadLocalId = ev.detail.activeThreadLocalId;
        };
        this._showRainbowManEventListener = ev => {
            ev.stopPropagation();
            this._showRainbowMan();
        };
        this._updateControlPanelEventListener = ev => {
            ev.stopPropagation();
            this._updateControlPanel();
        };

        this.el.addEventListener(
            'o-push-state-action-manager',
            this._pushStateActionManagerEventListener
        );
        this.el.addEventListener(
            'o-show-rainbow-man',
            this._showRainbowManEventListener
        );
        this.el.addEventListener(
            'o-update-control-panel',
            this._updateControlPanelEventListener
        );
        return this.component.mount(this.$el[0]);
    },
    /**
     * @override {web.AbstractAction}
     */
    on_detach_callback() {
        this._super(...arguments);
        if (this.component) {
            this.component.destroy();
        }
        this.component = undefined;
        this.el.removeEventListener(
            'o-push-state-action-manager',
            this._pushStateActionManagerEventListener
        );
        this.el.removeEventListener(
            'o-show-rainbow-man',
            this._showRainbowManEventListener
        );
        this.el.removeEventListener(
            'o-update-control-panel',
            this._updateControlPanelEventListener
        );
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {string} activeThreadLocalId
     */
    _pushStateActionManager(activeThreadLocalId) {
        this.actionManager.do_push_state({
            action: this.action.id,
            active_id: activeThreadLocalId,
        });
    },
    /**
     * @private
     */
    _showRainbowMan() {
        this.trigger_up('show_effect', {
            message: _t("Congratulations, your inbox is empty!"),
            type: 'rainbow_man',
        });
    },
    /**
     * @private
     */
    _updateControlPanel() {
        const activeThreadLocalId = this.component.storeProps.activeThreadLocalId;
        const hasMessages = this.component.hasActiveThreadMessages();
        const isMobile = this.component.storeProps.isMobile;
        const activeThread = this.component.storeProps.activeThread;
        const activeMobileNavbarTabId = this.component.storeProps.activeMobileNavbarTabId;
        const checkedMessageLocalIds = this.component.storeProps.checkedMessageLocalIds;
        const uncheckedMessageLocalIds = this.component.storeProps.uncheckedMessageLocalIds;

        // Invite
        if (activeThread && activeThread.channel_type === 'channel') {
            this.$buttons.find('.o_invite').removeClass('o_hidden');
        } else {
            this.$buttons.find('.o_invite').addClass('o_hidden');
        }
        // Mark All Read
        if (activeThreadLocalId === 'mail.box_inbox') {
            this.$buttons.find('.o_widget_Discuss_controlPanelButtonMarkAllRead').removeClass('o_hidden')
                .prop('disabled', !hasMessages);
        }
        if (
            activeThreadLocalId !== 'mail.box_inbox' ||
            activeMobileNavbarTabId !== 'mailbox'
        ) {
            this.$buttons.find('.o_widget_Discuss_controlPanelButtonMarkAllRead').addClass('o_hidden');
        }
        // Unstar All
        if (activeThreadLocalId === 'mail.box_starred') {
            this.$buttons.find('.o_unstar_all').removeClass('o_hidden')
                .prop('disabled', !hasMessages);
        }
        if (
            activeThreadLocalId !== 'mail.box_starred' ||
            activeMobileNavbarTabId !== 'mailbox'
        ) {
            this.$buttons.find('.o_unstar_all').addClass('o_hidden');
        }
        // Mobile: Add channel
        if (isMobile && activeMobileNavbarTabId === 'channel') {
            this.$buttons.find('.o_mobile_new_channel').removeClass('o_hidden');
        } else {
            this.$buttons.find('.o_mobile_new_channel').addClass('o_hidden');
        }
        // Mobile: Add message
        if (isMobile && activeMobileNavbarTabId === 'chat') {
            this.$buttons.find('.o_mobile_new_message').removeClass('o_hidden');
        } else {
            this.$buttons.find('.o_mobile_new_message').addClass('o_hidden');
        }
        if (isMobile) {
            this._setTitle(_t("Discuss"));
        } else {
            let title;
            if (activeThread) {
                const activeThreadName = this.env.store.getters.threadName(activeThreadLocalId);
                const prefix =
                    activeThread.channel_type === 'channel' &&
                    activeThread.public !== 'private'
                    ? '#'
                    : '';
                title = `${prefix}${activeThreadName}`;
            } else {
                title = _t("Discuss");
            }
            this._setTitle(title);
        }
        // Select All & Unselect All
        const $selectAll = this.$buttons.find('.o_widget_Discuss_controlPanelButtonSelectAll');
        const $unselectAll = this.$buttons.find('.o_widget_Discuss_controlPanelButtonUnselectAll');
        if (checkedMessageLocalIds.length > 0 || uncheckedMessageLocalIds.length > 0) {
            $selectAll.removeClass('o_hidden');
            $selectAll.toggleClass('disabled', uncheckedMessageLocalIds.length === 0);
            $unselectAll.removeClass('o_hidden');
            $unselectAll.toggleClass('disabled', checkedMessageLocalIds.length === 0);
        } else {
            $selectAll.addClass('o_hidden');
            $selectAll.addClass('disabled');
            $unselectAll.addClass('o_hidden');
            $unselectAll.addClass('disabled');
        }
        // Moderation Actions
        const $moderationButtons = this.$buttons.find('.o_widget_Discuss_controlPanelButtonModeration');
        const nonModerableMessageLocalIds = checkedMessageLocalIds.filter(messageLocalId =>
            !this.env.store.getters.isMessageModeratedByUser(messageLocalId)
        );
        if (checkedMessageLocalIds.length > 0 && nonModerableMessageLocalIds.length === 0) {
            $moderationButtons.removeClass('o_hidden');
        } else {
            $moderationButtons.addClass('o_hidden');
        }
        this.updateControlPanel({
            cp_content: {
                $buttons: this.$buttons,
            },
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickInvite() {
        new InvitePartnerDialog(this, {
            activeThreadLocalId: this.component.storeProps.activeThreadLocalId,
            messagingEnv: this.env,
        }).open();
    },
    /**
     * @private
     */
    _onClickMarkAllAsRead() {
        this.env.store.dispatch('markAllMessagesAsRead', { domain: this.domain });
    },
    /**
     * @private
     */
    _onClickMobileNewChannel() {
        this.component.doMobileNewChannel();
    },
    /**
     * @private
     */
    _onClickMobileNewMessage() {
        this.component.doMobileNewMessage();
    },
    /**
     * @private
     */
    _onClickModerationAccept() {
        this.env.store.dispatch('moderateMessages',
            this.component.storeProps.checkedMessageLocalIds,
            'accept'
        );
    },
    /**
     * @private
     */
    _onClickModerationDiscard() {
        this.component.state.hasModerationDiscardDialog = true;
    },
    /**
     * @private
     */
    _onClickModerationReject() {
        this.component.state.hasModerationRejectDialog = true;
    },
    /**
     * @private
     */
    _onClickSelectAll() {
        this.env.store.dispatch('setMessagesCheck',
            this.component.storeProps.uncheckedMessageLocalIds,
            this.component.storeProps.activeThread.localId,
            this.component.storeProps.stringifiedDomain,
            {
                checkValue: true,
            },
        );
    },
    /**
     * @private
     */
    _onClickUnselectAll() {
        this.env.store.dispatch('setMessagesCheck',
            this.component.storeProps.checkedMessageLocalIds,
            this.component.storeProps.activeThread.localId,
            this.component.storeProps.stringifiedDomain,
            {
                checkValue: false,
            },
        );
    },
    /**
     * @private
     */
    _onClickUnstarAll() {
        this.env.store.dispatch('unstarAllMessages');
    },
    /**
     * @private
     * @param {OdooEvent} ev
     * @param {Array} ev.data.domain
     */
    _onSearch(ev) {
        ev.stopPropagation();
        this.component.updateDomain(ev.data.domain);
    },
});

action_registry.add('mail.widget.discuss', DiscussWidget);

return DiscussWidget;

});
