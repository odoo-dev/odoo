/** @odoo-module **/

import { registerMessagingComponent } from '@mail/utils/messaging_component';

import Dialog from 'web.OwlDialog';

const { Component, useRef } = owl;

export class DeleteMessageConfirmDialog extends Component {

    /**
     * @override
     */
    setup() {
        super.setup();
        this.title = this.env._t("Confirmation");
    }

    /**
     * @returns {mail.message_action_list}
     */
    get messageActionList() {
        return this.messaging && this.messaging.models['mail.message_action_list'].get(this.props.messageActionListLocalId);
    }
}

Object.assign(DeleteMessageConfirmDialog, {
    components: {
        Dialog,
    },
    props: {
        messageActionListLocalId: String,
    },
    template: 'mail.DeleteMessageConfirmDialog',
});

registerMessagingComponent(DeleteMessageConfirmDialog);
