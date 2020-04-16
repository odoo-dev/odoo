odoo.define('mail.messaging.entity.MessagingMenu', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr } = require('mail.messaging.EntityField');

function MessagingMenuFactory({ Entity }) {

    class MessagingMenu extends Entity {

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
            const inboxMailbox = this.env.entities.Thread.find(thread =>
                thread.id === 'inbox' &&
                thread.model === 'mail.box'
            );
            const unreadChannels = this.env.entities.Thread.all(thread =>
                thread.message_unread_counter > 0 &&
                thread.model === 'mail.channel'
            );
            return (
                unreadChannels.length + (inboxMailbox ? inboxMailbox.counter : 0));
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

    MessagingMenu.entityName = 'MessagingMenu';

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
    };

    return MessagingMenu;
}

registerNewEntity('MessagingMenu', MessagingMenuFactory);

});
