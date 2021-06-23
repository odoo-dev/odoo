/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr, many2many, many2one, one2one } from '@mail/model/model_field';
import { link } from '@mail/model/model_field_command';

function factory(dependencies) {
    class DiscussSidebarCategoryItem extends dependencies['mail.model'] {

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @override
         */
         static _createRecordLocalId(data) {
            return `${this.modelName}_${data.channelId}`;
        }

        /**
         * @private
         * @returns {string}
         */
        _computeAvatarUrl() {
            switch (this.channelType) {
                case 'channel':
                case 'group':
                    return `/web/image/mail.channel/${this.channelId}/image_128`;
                case 'chat':
                    return this.correspondentAvatarUrl;
            }
        }

        /**
         * @private
         * @returns {mail.thread}
         */
        _computeChannel() {
            return link(this.env.models['mail.thread'].findFromIdentifyingData({
                id: this.channelId,
                model: 'mail.channel',
            }));
        }

        /**
         * @private
         * @returns {integer}
         */
        _computeCounter() {
            switch (this.channelType) {
                case 'channel':
                    return this.channelMessageNeedactionCounter;
                case 'chat':
                    return this.channelLocalMessageUnreadCounter;
            }
        }

        /**
         * @private
         * @returns {mail.discuss}
         */
        _computeDiscuss() {
            return link(this.env.messaging.discuss);
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasLeaveCommand() {
            return this.channelType === 'channel' &&
                !this.channelMessageNeedactionCounter &&
                !this.channelGroupBasedSubscription
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasRenameCommand() {
            return this.channelType === 'chat';
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasSettingsCommand() {
            return this.channelType === 'channel';
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasUnpinCommand() {
            return this.channelType === 'chat' && !this.channelLocalMessageUnreadCounter;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsActive() {
            return this.channel === this.env.messaging.discuss.thread;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsRenaming() {
            return this.hasRenameCommand && this.discussRenamingThreads.includes(this.channel);
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsUnread() {
            return this.channelLocalMessageUnreadCounter > 0;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasThreadIcon() {
            switch (this.channelType) {
                case 'channel':
                case 'group':
                    return !this.channelIsDefaultAvatar;
                case 'chat':
                    return true;
            }
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * Redirects to channel form page when `settings` command is clicked.
         *
         * @private
         */
        _onClickSettingsCommand() {
            return this.env.bus.trigger('do-action', {
                action: {
                    type: 'ir.actions.act_window',
                    res_model: this.channel.model,
                    res_id: this.channel.id,
                    views: [[false, 'form']],
                    target: 'current'
                },
            });
        }

    }

    DiscussSidebarCategoryItem.fields = {
        /**
         * Image URL for the related channel thread.
         */
        avatarUrl: attr({
            compute: '_computeAvatarUrl',
            dependencies: [
                'channelType',
                'correspondentAvatarUrl',
                'channelId',
            ],
        }),
        /**
         * Correspondent of the related thread.
         * Serves as compute dependency.
         */
        correspondent: many2one('mail.partner', {
            related: 'channel.correspondent',
        }),
        /**
         * Serves as compute dependency.
         */
        correspondentAvatarUrl: attr({
            related: 'correspondent.avatarUrl',
        }),
        /**
         * Amount of unread/action-needed messages
         */
        counter: attr({
            compute: '_computeCounter',
            dependencies: [
                'channelType',
                'channelLocalMessageUnreadCounter',
                'channelMessageNeedactionCounter',
            ],
        }),
        /**
         * Display name of the related channel thread.
         */
        displayName: attr({
            related: 'channel.displayName',
        }),
        /**
         * Serves as compute dependency.
         */
        discuss: many2one('mail.discuss', {
            compute: '_computeDiscuss',
        }),
        /**
         * Serves as compute dependency.
         */
        discussRenamingThreads: many2many('mail.thread', {
            related: 'discuss.renamingThreads',
        }),
        /**
         * Serves as compute dependency.
         */
        discussThread: many2one('mail.thread', {
            related: 'discuss.thread',
        }),
        /**
         * Boolean determines whether the item has a "leave" command
         */
        hasLeaveCommand: attr({
            compute: '_computeHasLeaveCommand',
            dependencies: [
                'channelType',
                'channelGroupBasedSubscription',
                'channelMessageNeedactionCounter',
            ],
        }),
        /**
         * Boolean determines whether the item has a "rename" command.
         */
        hasRenameCommand: attr({
            compute: '_computeHasRenameCommand',
            dependencies: ['channelType'],
        }),
        /**
         * Boolean determines whether the item has a "settings" command.
         */
        hasSettingsCommand: attr({
            compute: '_computeHasSettingsCommand',
            dependencies: ['channelType'],
        }),
        /**
         * Boolean determines whether ThreadIcon will be displayed in UI.
         */
        hasThreadIcon: attr({
            compute: '_computeHasThreadIcon',
            dependencies: [
                'channelType',
                'channelIsDefaultAvatar',
            ],
        }),
        /**
         * Boolean determines whether the item has a "unpin" command.
         */
        hasUnpinCommand: attr({
            compute: '_computeHasUnpinCommand',
            dependencies: [
                'channelType',
                'channelLocalMessageUnreadCounter',
            ],
        }),
        /**
         * Boolean determines whether the item is currently active in discuss.
         */
        isActive: attr({
            compute: '_computeIsActive',
            dependencies: [
                'discussThread',
                'channel',
            ],
        }),
        /**
         * Boolean determines whether the item is currently being renamed.
         */
        isRenaming: attr({
            compute: '_computeIsRenaming',
            dependencies: [
                'discussRenamingThreads',
                'hasRenameCommand',
                'channel',
            ],
        }),
        /**
         * Boolean determines whether the item has any unread messages.
         */
        isUnread: attr({
            compute: '_computeIsUnread',
            dependencies: ['channelLocalMessageUnreadCounter'],
        }),
        /**
         * The related channel thread.
         */
        channel: one2one('mail.thread', {
            compute: '_computeChannel',
            dependencies: ['channelId'],
        }),
        /**
         * Serves as compute dependency.
         */
        channelGroupBasedSubscription: attr({
            related: 'channel.group_based_subscription',
        }),
        /**
         * Id of the related channel thread.
         */
        channelId: attr({
            required: true,
        }),
        /**
         * Serves as compute dependency.
         */
        channelIsDefaultAvatar: attr({
            related: 'channel.isDefaultAvatar',
        }),
        /**
         * Serves as compute dependency.
         */
        channelLocalMessageUnreadCounter: attr({
            related: 'channel.localMessageUnreadCounter',
        }),
        /**
         * Boolean determines whether messages in the channel thread will be sent by email.
         */
        channelMassMailing: attr({
            related: 'channel.mass_mailing',
        }),
        /**
         * Serves as compute dependency.
         */
        channelMessageNeedactionCounter: attr({
            related: 'channel.message_needaction_counter',
        }),
        /**
         * Name of the related channel thread.
         */
        channelName: attr({
            related: 'channel.name',
        }),
        /**
         * Type of the related channel thread.
         */
        channelType: attr({
            related: 'channel.channel_type',
        })
    };

    DiscussSidebarCategoryItem.modelName = 'mail.discuss_sidebar_category_item';

    return DiscussSidebarCategoryItem;
}

registerNewModel('mail.discuss_sidebar_category_item', factory);
