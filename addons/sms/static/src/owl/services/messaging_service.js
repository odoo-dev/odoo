odoo.define('sms.service.Messaging', function (require) {
'use strict';

const MessagingService = require('mail.service.Messaging');

MessagingService.include({
    /**
     * @override
     */
    _getStoreActions: function () {
        const actions = this._super(...arguments);
        const _handleNotificationPartner = actions._handleNotificationPartner;

        /**
         * @override
         */
        actions._handleNotificationPartner = function ({ dispatch }, data) {
            if (data.type === 'sms_update') {
                return dispatch('_handleNotificationPartnerSMSUpdate', data);
            } else {
                return _handleNotificationPartner(...arguments);
            }
        };

        /**
         * Updates message in thread when there's an update in a SMS letter.
         *
         * @private
         * @param {Object} data
         * @param {Object[]} data.elements list of SMS failure data
         * @param {string} data.elements[].message_id ID of related message that
         *   has a sms failure.
         */
        actions._handleNotificationPartnerSMSUpdate = function ({ dispatch }, data) {
            var self = this;
            _.each(data.elements, function (data) {
                var isNewFailure = data.sms_status === 'error';
                var matchedFailure = _.find(self._mailFailures, function (failure) {
                    return failure.getMessageID() === data.message_id;
                });

                if (matchedFailure) {
                    var index = _.findIndex(self._mailFailures, matchedFailure);
                    if (isNewFailure) {
                        self._mailFailures[index] = new MailFailure(self, data);
                    } else {
                        self._mailFailures.splice(index, 1);
                    }
                } else if (isNewFailure) {
                    self._mailFailures.push(new MailFailure(self, data));
                }
                var message = _.find(self._messages, function (msg) {
                    return msg.getID() === data.message_id;
                });
                if (message) {
                    message.setSmsStatus(data.sms_id, data.sms_status);
                    self._mailBus.trigger('update_message', message);
                }
            });
            this._mailBus.trigger('update_needaction', this.needactionCounter);
        };

        return actions;
    },

});

});
