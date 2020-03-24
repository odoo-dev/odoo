odoo.define('mail.component.DiscussMobileMailboxSelection', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useGetters } = owl.hooks;

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
                pinnedMailboxList: this.storeGetters.pinnedMailboxList(),
            };
        }, {
            compareDepth: {
                pinnedMailboxList: 1,
            },
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
