/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerAuthor **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerAuthor',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerAuthor',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} data
     * @param {Object} data.message
     */
    func(
        { env },
        notificationHandler,
        data,
    ) {
        env.services.action.dispatch(
            'Message/insert',
            env.services.action.dispatch(
                'Message/convertData',
                data.message,
            ),
        );
    },
});
