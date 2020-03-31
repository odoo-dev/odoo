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
            const message = this.env.entities.Message.get(props.message);
            const author = message ? message.author : undefined;
            const thread = props.thread
                ? this.env.entities.Thread.get(props.thread)
                : undefined;
            return {
                author,
                authorName: author ? author.nameOrDisplayName : undefined,
                currentPartner: this.env.entities.Partner.current,
                message,
                thread,
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
        return this.env.entities.Message.get(this.props.message);
    }

    /**
     * @returns {mail.messaging.entity.Thread|undefined}
     */
    get thread() {
        return this.env.entities.Thread.get(this.props.thread);
    }

}

Object.assign(MessageAuthorPrefix, {
    props: {
        message: String,
        thread: {
            type: String,
            optional: true,
        },
    },
    template: 'mail.messaging.component.MessageAuthorPrefix',
});

return MessageAuthorPrefix;

});
