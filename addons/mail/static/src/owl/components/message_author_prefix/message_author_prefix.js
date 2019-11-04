odoo.define('mail.component.MessageAuthorPrefix', function () {
'use strict';

const { Component } = owl;
const { useGetters, useStore } = owl.hooks;

class MessageAuthorPrefix extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            return {
                currentPartnerLocalId: state.currentPartnerLocalId,
                message: this.storeGetters.getStoreObject({
                    storeKey: 'messages',
                    localId: props.messageLocalId,
                    computes: [{
                        name: 'author',
                        keys: ['localId'],
                        computes: [{
                            name: 'name',
                        }],
                    }],
                }),
                thread: this.storeGetters.getStoreObject({
                    storeKey: 'threads',
                    localId: props.threadLocalId,
                    keys: ['channel_type'],
                }),
            };
        });
    }
}

MessageAuthorPrefix.props = {
    messageLocalId: String,
    threadLocalId: {
        type: String,
        optional: true,
    },
};

MessageAuthorPrefix.template = 'mail.component.MessageAuthorPrefix';

return MessageAuthorPrefix;

});
