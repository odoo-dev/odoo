/** @odoo-module alias=mail.models.Messaging.actions.isNotificationPermissionDefault **/

import action from 'mail.action.define';

export default action({
    name: 'Messaging/isNotificationPermissionDefault',
    id: 'mail.models.Messaging.actions.isNotificationPermissionDefault',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {boolean}
     */
    func(
        { env },
    ) {
        const windowNotification = env.browser.Notification;
        return windowNotification
            ? windowNotification.permission === 'default'
            : false;
    },
});
