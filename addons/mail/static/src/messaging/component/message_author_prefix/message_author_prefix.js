odoo.define('mail.messaging.component.MessageAuthorPrefix', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useGetters } = owl.hooks;

class MessageAuthorPrefix extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const message = state.messages[props.messageLocalId];
            const author = state.partners[message.authorLocalId];
            const thread = props.threadLocalId
                ? state.threads[props.threadLocalId]
                : undefined;
            return {
                author,
                authorName: author
                    ? this.storeGetters.partnerName(author.localId)
                    : undefined,
                currentPartnerLocalId: state.currentPartnerLocalId,
                thread,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Thread|undefined}
     */
    get thread() {
        return this.storeProps.thread;
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
