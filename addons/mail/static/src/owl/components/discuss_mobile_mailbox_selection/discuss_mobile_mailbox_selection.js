odoo.define('mail.component.DiscussMobileMailboxSelection', function () {
'use strict';

const { Component } = owl;
const { useGetters, useStore } = owl.hooks;

class MobileMailboxSelection extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeGetters = useGetters();
        this.storeProps = useStore(() => {
            return {
                // TODO SEB use getStoreObject, make it recordset, and allow filter/sort
                pinnedMailboxList: this.storeGetters.pinnedMailboxList(),
            };
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when clicking on a mailbox selection item.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        this.trigger('o-select-thread', {
            threadLocalId: ev.currentTarget.dataset.mailboxLocalId,
        });
    }
}

MobileMailboxSelection.props = {
    activeThreadLocalId: {
        type: String,
        optional: true,
    },
};

MobileMailboxSelection.template = 'mail.component.DiscussMobileMailboxSelection';

return MobileMailboxSelection;

});
