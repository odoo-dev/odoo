odoo.define('mail.component.ThreadIcon', function () {
'use strict';

class ThreadIcon extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.template = 'mail.component.ThreadIcon';
    }
}

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.threadLocalId
 * @return {Object}
 */
ThreadIcon.mapStoreToProps = function (state, ownProps) {
    const thread = state.threads[ownProps.threadLocalId];
    const directPartner = thread
        ? state.partners[thread.directPartnerLocalId]
        : undefined;
    return {
        directPartner,
        thread,
    };
};

ThreadIcon.props = {
    directPartner: {
        type: Object, // {mail.store.model.Partner}
        optional: true,
    },
    thread: Object, // {mail.store.model.Thread}
    threadLocalId: String,
};

return ThreadIcon;

});
