odoo.define('mail.messaging.component.MessageAuthorPrefix', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class MessageAuthorPrefix extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const message = this.env.entities.Message.get(props.messageLocalId);
            const author = message ? message.author : undefined;
            const thread = props.threadLocalId
                ? this.env.entities.Thread.get(props.threadLocalId)
                : undefined;
            return {
                author: author ? author.__state : undefined,
                currentPartner: this.env.messaging.currentPartner
                    ? this.env.messaging.currentPartner.__state
                    : undefined,
                message: message ? message.__state : undefined,
                thread: thread ? thread.__state : undefined,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Message}
     */
    get message() {
        return this.env.entities.Message.get(this.props.messageLocalId);
    }

    /**
     * @returns {mail.messaging.entity.Thread|undefined}
     */
    get thread() {
        return this.env.entities.Thread.get(this.props.threadLocalId);
    }

}

Object.assign(MessageAuthorPrefix, {
    props: {
        messageLocalId: String,
        threadLocalId: {
            type: String,
            optional: true,
        },
    },
    template: 'mail.messaging.component.MessageAuthorPrefix',
});

return MessageAuthorPrefix;

});
