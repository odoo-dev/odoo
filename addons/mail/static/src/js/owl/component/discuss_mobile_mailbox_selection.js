odoo.define('mail.component.DiscussMobileMailboxSelection', function () {
'use strict';

class MobileMailboxSelection extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.template = 'mail.component.DiscussMobileMailboxSelection';
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        this.trigger('o-select-thread', {
            threadLocalId: ev.currentTarget.dataset.mailboxLocalId,
        });
    }
}

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {Object} getters
 * @return {Object}
 */
MobileMailboxSelection.mapStoreToProps = function (state, ownProps, getters) {
    return {
        pinnedMailboxList: getters.pinnedMailboxList(),
    };
};

MobileMailboxSelection.props = {
    activeThreadLocalId: {
        type: String,
        optional: true,
    },
    pinnedMailboxList: {
        type: Array,
        element: Object, // {mail.store.model.Thread}
    },
};

return MobileMailboxSelection;

});
