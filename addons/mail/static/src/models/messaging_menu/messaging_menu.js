odoo.define('mail/static/src/models/messaging_menu/messaging_menu.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr, one2one } = require('mail/static/src/model/model_field.js');

function factory(dependencies) {

    class MessagingMenu extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * Close the messaging menu. Should reset its internal state.
         */
        close() {
            this.update({
                activeTabId: 'all',
                isMobileNewMessageToggled: false,
                isOpen: false,
            });
        }

        /**
         * Toggle the visibility of the messaging menu "new message" input in
         * mobile.
         */
        toggleMobileNewMessage() {
            this.update({ isMobileNewMessageToggled: !this.isMobileNewMessageToggled });
        }

        /**
         * Toggle whether the messaging menu is open or not.
         */
        toggleOpen() {
            this.update({ isOpen: !this.isOpen });
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @returns {integer}
         */
        _updateCounter() {
            const inboxMailbox = this.env.models['mail.thread'].find(thread =>
                thread.id === 'inbox' &&
                thread.model === 'mail.box'
            );
            const unreadChannels = this.env.models['mail.thread'].all(thread =>
                thread.message_unread_counter > 0 &&
                thread.model === 'mail.channel'
            );
            let counter = unreadChannels.length;
            if (inboxMailbox) {
                counter += inboxMailbox.counter;
            }
            if (!this.messaging) {
                // compute after delete
                return counter;
            }
            if (this.messaging.notificationGroupManager) {
                counter += this.messaging.notificationGroupManager.groups.reduce(
                    (total, group) => total + group.notifications.length,
                    0
                );
            }
            return counter;
        }

        /**
         * @override
         */
        _updateAfter(previous) {
            const counter = this._updateCounter();
            if (this.counter !== counter) {
                this.update({ counter });
            }
        }

    }

    MessagingMenu.fields = {
        /**
         * Tab selected in the messaging menu.
         * Either 'all', 'chat' or 'channel'.
         */
        activeTabId: attr({
            default: 'all',
        }),
        counter: attr({
            default: 0,
        }),
        /**
         * Determine whether the mobile new message input is visible or not.
         */
        isMobileNewMessageToggled: attr({
            default: false,
        }),
        /**
         * Determine whether the messaging menu dropdown is open or not.
         */
        isOpen: attr({
            default: false,
        }),
        messaging: one2one('mail.messaging', {
            inverse: 'messagingMenu',
        }),
    };

    MessagingMenu.modelName = 'mail.messaging_menu';

    return MessagingMenu;
}

registerNewModel('mail.messaging_menu', factory);

});
