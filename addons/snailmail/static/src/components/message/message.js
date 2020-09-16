/** @odoo-module alias=snailmail.components.Message **/

import Message from 'mail.components.Message';

import { patch } from 'web.utils';

const { useState } = owl;

patch(
    Message.prototype,
    'snailmail.components.Message',
    {
        /**
         * @override
         */
        _constructor() {
            this._super(...arguments);
            this.snailmailState = useState({
                // Determine if the error dialog is displayed.
                hasDialog: false,
            });
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        _onClickNotificationIconFailure() {
            if (this.message.$$$type(this) === 'snailmail') {
                /**
                 * Messages from snailmail are considered to have at most one
                 * notification. The failure type of the whole message is considered
                 * to be the same as the one from that first notification, and the
                 * click action will depend on it.
                 */
                switch (this.message.$$$notifications(this)[0].$$$failureType(this)) {
                    case 'sn_credit':
                        // URL only used in this component, not received at init
                        this.env.services.action.dispatch(
                            'Messaging/fetchSnailmailCreditsUrl',
                        );
                        this.snailmailState.hasDialog = true;
                        break;
                    case 'sn_error':
                        this.snailmailState.hasDialog = true;
                        break;
                    case 'sn_fields':
                        this.env.services.action.dispatch(
                            'Message/openMissingFieldsLetterAction',
                            this.message,
                        );
                        break;
                    case 'sn_format':
                        this.env.services.action.dispatch(
                            'Message/openFormatLetterAction',
                            this.message,
                        );
                        break;
                    case 'sn_price':
                        this.snailmailState.hasDialog = true;
                        break;
                    case 'sn_trial':
                        // URL only used in this component, not received at init
                        this.env.services.action.dispatch(
                            'Messaging/fetchSnailmailCreditsUrlTrial',
                        );
                        this.snailmailState.hasDialog = true;
                        break;
                }
            } else {
                this._super(...arguments);
            }
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _onDialogClosedSnailmailError() {
            this.snailmailState.hasDialog = false;
        },
    }
);
