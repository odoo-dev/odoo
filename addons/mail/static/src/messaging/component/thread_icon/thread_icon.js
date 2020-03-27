odoo.define('mail.messaging.component.ThreadIcon', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useGetters } = owl.hooks;

class ThreadIcon extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const thread = state.threads[props.threadLocalId];
            const directPartner = thread
                ? state.partners[thread.directPartnerLocalId]
                : undefined;
            return {
                directPartner,
                // used through isPartnerRoot getter
                partnerRootLocalId: state.partnerRootLocalId,
                thread,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Thread}
     */
    get thread() {
        return this.storeProps.thread;
    }

}

Object.assign(ThreadIcon, {
    props: {
        threadLocalId: String,
    },
    template: 'mail.messaging.component.ThreadIcon',
});

return ThreadIcon;

});
