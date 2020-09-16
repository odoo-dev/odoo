/** @odoo-module alias=mail.models.MessagingMenu **/

import model from 'mail.model.define';

export default model({
    name: 'MessagingMenu',
    id: 'mail.models.MessagingMenu',
    global: true,
    actions: [
        'mail.models.MessagingMenu.actions.close',
        'mail.models.MessagingMenu.actions.toggleMobileNewMessage',
        'mail.models.MessagingMenu.actions.toggleOpen',
    ],
    fields: [
        'mail.models.MessagingMenu.fields.activeTabId',
        'mail.models.MessagingMenu.fields.counter',
        'mail.models.MessagingMenu.fields.inboxMessagesAutoloader',
        'mail.models.MessagingMenu.fields.isMobileNewMessageToggled',
        'mail.models.MessagingMenu.fields.isOpen',
        'mail.models.MessagingMenu.fields.messaging',
    ],
});

// function factory(dependencies) {

//     class MessagingMenu extends dependencies['mail.model'] {

//         /**
//          * @private
//          * @returns {integer}
//          */
//         _updateCounter() {
//             if (!this.env.services.model.messaging) {
//                 return 0;
//             }
//             const inboxMailbox = this.env.services.model.messaging.inbox(this);
//             const unreadChannels = this.env.services.action.dispatch(
//                 'Thread/all',
//                 thread => (
//                     thread.localMessageUnreadCounter(this) > 0 &&
//                     thread.model(this) === 'mail.channel' &&
//                     thread.isPinned(this)
//                 ),
//             );
//             let counter = unreadChannels.length;
//             if (inboxMailbox) {
//                 counter += inboxMailbox.counter(this);
//             }
//             if (this.messaging(this).notificationGroupManager(this)) {
//                 counter += this.messaging(this).notificationGroupManager(this).groups(this).reduce(
//                     (total, group) => total + group.notifications(this).length,
//                     0
//                 );
//             }
//             if (this.env.services.action.dispatch('Messaging/isNotificationPermissionDefault') {
//                 counter++;
//             }
//             return counter;
//         }

//         /**
//          * @override
//          */
//         _updateAfter(previous) {
//             // AKU TODO
//             // const counter = this._updateCounter();
//             // if (this.counter(this) !== counter) {
//             //     this.update({
//             //         counter,
//             //     });
//             // }
//         }

//     }
// }
