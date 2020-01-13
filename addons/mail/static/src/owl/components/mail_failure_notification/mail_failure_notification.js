odoo.define('mail.component.MailFailureNotification', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class MailFailureNotification extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            return {
                isMobile: state.isMobile,
            };
        });
    }

    /**
     * Handles clicking on the notification.
     */
    _onClickFailureNotification() {
        if (this.props.isSameDocument) {
            if (this.props.failure.documentModel === 'mail.channel') {
                this.storeDispatch('openThread', this.props.failure.threadLocalId);
            } else {
                this.storeDispatch('openDocument', {
                    model: this.props.failure.documentModel,
                    id: this.props.failure.documentId,
                });
            }
        } else if (this.props.failure.documentModel !== 'mail.channel') {
            // preview of mail failures grouped to different document of same model
            this.env.do_action({
                name: "Mail failures",
                type: 'ir.actions.act_window',
                view_mode: 'kanban,list,form',
                views: [[false, 'kanban'], [false, 'list'], [false, 'form']],
                target: 'current',
                res_model: this.props.failure.documentModel,
                domain: [['message_has_error', '=', true]],
            });
        }
    }

    /**
     * Handles clicking on the discard button.
     */
    _onClickFailureDiscard() {
        this.env.do_action('mail.mail_resend_cancel_action', {
            additional_context: {
                default_model: this.props.failure.documentModel,
                unread_counter: this.props.unreadCounter,
            }
        });
    }
}

MailFailureNotification.props = {
    failure: Object,
    unreadCounter: Number,
    isSameDocument: Boolean,
};

MailFailureNotification.template = 'mail.component.MailFailureNotification';

return MailFailureNotification;

});
