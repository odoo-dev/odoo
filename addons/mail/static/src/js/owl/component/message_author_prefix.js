odoo.define('mail.component.MessageAuthorPrefix', function () {
'use strict';

class MessageAuthorPrefix extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.template = 'mail.component.MessageAuthorPrefix';
    }
}

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.messageLocalId
 * @param {string} [ownProps.threadLocalId]
 * @param {Object} getters
 * @return {Object}
 */
MessageAuthorPrefix.mapStoreToProps = function (state, ownProps, getters) {
    const message = state.messages[ownProps.messageLocalId];
    const author = state.partners[message.authorLocalId];
    const thread = ownProps.threadLocalId
        ? state.threads[ownProps.threadLocalId]
        : undefined;
    return {
        author,
        authorName: author
            ? getters.partnerName(author.localId)
            : undefined,
        currentPartnerLocalId: state.currentPartnerLocalId,
        thread,
    };
};

MessageAuthorPrefix.props = {
    messageLocalId: String,
    threadLocalId: {
        type: String,
        optional: true,
    },
};

return MessageAuthorPrefix;

});
