/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr, many2many, many2one, one2many, one2one } from '@mail/model/model_field';
import { clear, insertAndReplace, link, replace } from '@mail/model/model_field_command';


function factory(dependencies) {
    class DiscussSidebarCategory extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * Performs the `set_mail_user_settings` RPC on `mail.user.settings`.
         *
         * @static
         * @param {Object.<string, boolean>} mailUserSettings
         */
         static async performRpcSetMailUserSettings(mailUserSettings) {
            return this.env.services.rpc(
                {
                    model: 'mail.user.settings',
                    method: 'set_mail_user_settings',
                    args: [[this.env.messaging.mailUserSettingsId]],
                    kwargs: {
                        new_settings: mailUserSettings,
                    },
                },
                { shadow: true },
            );
        }

        /**
         * Closes the category and notity server to change the state
         */
        async close() {
            this.update({ isPendingOpen: false });
            await this.env.models['mail.discuss_sidebar_category'].performRpcSetMailUserSettings({
                [this.serverStateKey]: false,
            });
        }

        /**
         * Opens the category and notity server to change the state
         */
        async open() {
            this.update({ isPendingOpen: true });
            await this.env.models['mail.discuss_sidebar_category'].performRpcSetMailUserSettings({
                [this.serverStateKey]: true,
            });
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         * @returns {mail.discuss_sidebar_category_item | undefined}
         */
        _computeActiveItem() {
            const thread = this.env.messaging.discuss.thread;
            if (thread && thread.channel_type === this.supportedChannelType ){
                return insertAndReplace({ channelId: thread.id });
            }
            return clear();
        }

        /**
         * @private
         * @returns {mail.discuss_sidebar_category_item[]}
         */
        _computeCategoryItems(){
            let channels = this.selectedSortedChannels;
            const searchValue = this.env.messaging.discuss.sidebarQuickSearchValue;
            if (searchValue) {
                const qsVal = searchValue.toLowerCase();
                channels = channels.filter(t => {
                    const nameVal = t.displayName.toLowerCase();
                    return nameVal.includes(qsVal);
                });
            }
            return insertAndReplace(channels.map(c => ({ channelId: c.id })));
        }

        /**
         * @private
         * @returns {string}
         */
        _computeCommandAddTitleText() {
            switch(this.supportedChannelType) {
                case 'channel':
                    return this.env._t("Add or join a channel");
                case 'chat':
                    return this.env._t("Start a conversation");
            }
        }

        /**
         * @private
         * @returns {integer}
         */
        _computeCounter() {
            switch (this.supportedChannelType) {
                case 'channel':
                    return this.selectedChannels.filter(thread => thread.message_needaction_counter > 0).length;
                case 'chat':
                    return this.selectedChannels.filter(thread => thread.localMessageUnreadCounter > 0).length;
            }
        }

        /**
         * @private
         * @returns {string}
         */
        _computeDisplayName() {
            switch (this.supportedChannelType) {
                case 'channel':
                    return this.env._t('Channels');
                case 'chat':
                    return this.env._t('Direct Messages');
            }
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasAddCommand() {
            return this.isOpen && (this.supportedChannelType === 'chat' || this.supportedChannelType === 'channel');
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasViewCommand() {
            return this.supportedChannelType === 'channel';
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsOpen() {
            return this.isPendingOpen !== undefined ? this.isPendingOpen : this.isServerOpen;
        }

        /**
         * @private
         * @returns {mail.messaging}
         */
        _computeMessaging() {
            return link(this.env.messaging);
        }

        /**
         * @private
         * @returns {string}
         */
        _computeNewItemPlaceholderText() {
            switch(this.supportedChannelType) {
                case 'channel':
                    return this.env._t('Find or create a channel...');
                case 'chat':
                    return this.env._t('Find or start a conversation...');
            }
        }

        /**
         * @private
         * @returns {mail.thread[]}
         */
        _computeSelectedChannels() {
            return replace(this.allPinnedChannels.filter(thread => thread.channel_type === this.supportedChannelType));
        }

         /**
         *
         * @private
         * @returns {mail.thread[]}
         */
          _computeSelectedSortedChannels() {
            switch (this.supportedChannelType) {
                case 'channel':
                    return replace(this._sortByDisplayName());
                case 'chat':
                    return replace(this._sortByLastMeaningfulActionTime());
            }
        }

        /**
         * Returns the key used in server side for the category states.
         *
         * @private
         * @returns {string}
         */
        _computeServerStateKey() {
            switch (this.supportedChannelType) {
                case 'channel':
                    return 'is_discuss_sidebar_category_channel_open';
                case 'chat':
                    return 'is_discuss_sidebar_category_chat_open';
            }
        }

        /**
         * Sorts `selectedChannels` by `displayName` in
         * case-insensitive alphabetical order.
         *
         * @private
         * @returns {mail.thread[]}
         */
        _sortByDisplayName() {
            return this.selectedChannels.sort((t1, t2) => {
                if (t1.displayName && !t2.displayName) {
                    return -1;
                } else if (!t1.displayName && t2.displayName) {
                    return 1;
                } else if (t1.displayName && t2.displayName && t1.displayName !== t2.displayName) {
                    return t1.displayName.toLowerCase() < t2.displayName.toLowerCase() ? -1 : 1;
                } else {
                    return t1.id - t2.id;
                }
            });
        }

        /**
         * Sorts `selectedChannels` by `lastMeaningfulActionTime`.
         * The most recent one will come first.
         *
         * @private
         * @returns {mail.thread[]}
         */
        _sortByLastMeaningfulActionTime() {
            return this.selectedChannels.sort((t1, t2) => {
                if(t1.lastMeaningfulActionTime && !t2.lastMeaningfulActionTime) {
                    return -1;
                } else if(!t1.lastMeaningfulActionTime && t2.lastMeaningfulActionTime) {
                    return 1;
                } else if(t1.lastMeaningfulActionTime && t2.lastMeaningfulActionTime && t1.lastMeaningfulActionTime !== t2.lastMeaningfulActionTime) {
                    return t2.lastMeaningfulActionTime - t1.lastMeaningfulActionTime;
                } else {
                    return t2.id - t1.id;
                }
            });
        }

        /**
         * Validates if `supportedChannelType` is legit
         *
         * @private
         * @returns {undefined}
         * @throws {Error}
         */
        _validateSupportedChannelType() {
            if (this.supportedChannelType === 'channel' ||
                this.supportedChannelType === 'chat') {
                    return;
            }
            throw Error(`Unsupported channel type in mail.discuss_sidebar_category: ${this.supportedChannelType}`);
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * Changes the category open states when clicked.
         *
         * @private
         */
        async _onClick() {
            if(this.isOpen) {
                await this.close();
            } else {
                await this.open();
            }
        }

        /**
         * @private
         * @param {Event} ev
         * @param {Object} ui
         * @param {Object} ui.item
         * @param {integer} ui.item.id
         */
        _onAddItemAutocompleteSelect(ev, ui) {
            switch (this.supportedChannelType) {
                case 'channel':
                    this.discuss.handleAddChannelAutocompleteSelect(ev, ui);
                    break;
                case 'chat':
                    this.discuss.handleAddChatAutocompleteSelect(ev, ui);
                    break;
            }
        }

        /**
         * @private
         * @param {Object} req
         * @param {string} req.term
         * @param {function} res
         */
        _onAddItemAutocompleteSource(req, res) {
            switch (this.supportedChannelType) {
                case 'channel':
                    this.discuss.handleAddChannelAutocompleteSource(req, res);
                    break;
                case 'chat':
                    this.discuss.handleAddChatAutocompleteSource(req, res);
                    break;
            }
        }

        /**
         * Redirects to the public channels window when view command is clicked.
         *
         * @private
         */
        _onClickViewCommand() {
            return this.env.bus.trigger('do-action', {
                action: {
                    name: this.env._t("Public Channels"),
                    type: 'ir.actions.act_window',
                    res_model: 'mail.channel',
                    views: [[false, 'kanban'], [false, 'form']],
                    domain: [['public', '!=', 'private']]
                },
            });
        }

        /**
         * Handles change of open state coming from the server. Useful to
         * clear pending state once server acknowledged the change.
         *
         * @private
         */
        _onIsServerOpenChanged() {
            if (this.isServerOpen === this.isPendingOpen) {
                this.update({ isPendingOpen: clear() });
            }
        }
    }

    DiscussSidebarCategory.fields = {
        /**
         * The category item which is active and belongs
         * to the category.
         */
        activeItem: one2one('mail.discuss_sidebar_category_item', {
            compute: '_computeActiveItem',
            dependencies: [
                'supportedChannelType',
                'discussThread',
            ],
        }),
        /**
         * The title text in UI for command `add`
         */
        commandAddTitleText: attr({
            compute: '_computeCommandAddTitleText',
            dependencies: ['supportedChannelType'],
        }),
        /**
         * The thread which is active in discuss.
         * Serves as compute dependency.
         */
        discussThread: one2one('mail.thread', {
            related: 'discuss.thread'
        }),
        /**
         * Serves as compute dependency.
         */
        allPinnedChannels: many2many('mail.thread', {
            related: 'messaging.allPinnedChannels'
        }),
        /**
         * The sorted category items which belong to the category.
         * These items are also filtered by `sidebarSearchValue`.
         */
        categoryItems: one2many('mail.discuss_sidebar_category_item', {
            compute: '_computeCategoryItems',
            dependencies: [
                'selectedSortedChannels',
                'sidebarSearchValue',
            ],
        }),
        /**
         * The total amount unread/action-needed threads in the category.
         */
        counter: attr({
            compute: '_computeCounter',
            dependencies: [
                'selectedChannels',
                'selectedChannelsLocalMessageUnreadCounter',
                'selectedChannelsMessageNeedactionCounter',
                'supportedChannelType',
            ],
        }),
        /**
         * Serves as compute dependency.
         */
        discuss: many2one('mail.discuss', {
            related: 'messaging.discuss',
        }),
        /**
         * Display name of the category.
         */
        displayName: attr({
            compute: '_computeDisplayName',
            dependencies: ['supportedChannelType'],
        }),
        /**
         * Boolean that determines whether this category has a 'add' command.
         */
        hasAddCommand: attr({
            compute: '_computeHasAddCommand',
            dependencies: [
                'supportedChannelType',
                'isOpen'
            ],
        }),
        /**
         * Boolean that determines whether this category has a 'view' command.
         */
        hasViewCommand: attr({
            compute: '_computeHasViewCommand',
            dependencies: ['supportedChannelType'],
        }),
        /**
         * Boolean that determines whether discuss is adding a new category item.
         */
        isAddingItem: attr({
            default: false,
        }),
        /**
         * Boolean that determines whether this category is open.
         */
        isOpen: attr({
            compute: '_computeIsOpen',
            dependencies: [
                'isPendingOpen',
                'isServerOpen',
            ],
        }),
        /**
         * Boolean that determines if there is a pending open state change,
         * which is requested by the client but not yet confirmed by the server.
         *
         * This field can be updated to immediately change the open state on the
         * interface and to notify the server of the new state.
         */
        isPendingOpen: attr(),
        /**
         * Boolean that determines the last open state known by the server.
         */
        isServerOpen: attr(),
        messaging: many2one('mail.messaging', {
            compute: '_computeMessaging',
        }),
        /**
         * The placeholder text used when a new item is being added in UI.
         */
        newItemPlaceholderText: attr({
            compute: '_computeNewItemPlaceholderText',
            dependencies: ['supportedChannelType'],
        }),
        /**
         * Not a real field, used to trigger `_onIsServerOpenChanged`.
         */
        onIsServerOpenChanged: attr({
            compute: '_onIsServerOpenChanged',
            dependencies: ['isServerOpen'],
            isOnChange: true,
        }),
        /**
         * Channels which belong to the category,
         */
        selectedChannels: one2many('mail.thread', {
            compute: '_computeSelectedChannels',
            dependencies: [
                'allPinnedChannels',
                'supportedChannelType',
            ]
        }),
        /**
         * Serves as compute dependency.
         */
        selectedChannelsDisplayName: attr({
            related: 'selectedChannels.displayName',
        }),
        /**
         * Serves as compute dependency.
         */
        selectedChannelsLastMeaningfulActionTime: attr({
            related: 'selectedChannels.lastMeaningfulActionTime',
        }),
        /**
         * Serves as compute dependency.
         */
        selectedChannelsLocalMessageUnreadCounter: attr({
            related: 'selectedChannels.localMessageUnreadCounter',
        }),
        /**
         * Serves as compute dependency.
         */
        selectedChannelsMessageNeedactionCounter: attr({
            related: 'selectedChannels.message_needaction_counter',
        }),
        /**
         * Channels which belongs to the category,
         * and sorted based on the `supported_channel_type`.
         */
        selectedSortedChannels: one2many('mail.thread', {
            compute: '_computeSelectedSortedChannels',
            dependencies: [
                'selectedChannels',
                'selectedChannelsDisplayName',
                'selectedChannelsLastMeaningfulActionTime',
                'supportedChannelType',
            ],
        }),
        /**
         * The key used in the server side for the category state
         */
        serverStateKey: attr({
            compute: '_computeServerStateKey',
            dependencies: ['supportedChannelType'],
        }),
        /**
         * The value of discuss sidebar quick search input.
         * Serves as compute dependency.
         */
        sidebarSearchValue: attr({
            related: 'discuss.sidebarQuickSearchValue',
        }),
        /**
         * Channel type which is supported by the category.
         */
        supportedChannelType: attr({
            required: true,
            readonly: true,
            compute: '_validateSupportedChannelType',
        }),
    };

    DiscussSidebarCategory.modelName = 'mail.discuss_sidebar_category';

    return DiscussSidebarCategory;
}

registerNewModel('mail.discuss_sidebar_category', factory);
