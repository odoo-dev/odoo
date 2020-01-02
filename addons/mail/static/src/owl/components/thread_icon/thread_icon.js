odoo.define('mail.component.ThreadIcon', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;

class ThreadIcon extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeProps = useStore((state, props) => {
            const thread = state.threads[props.threadLocalId];
            const directPartner = thread
                ? state.partners[thread.directPartnerLocalId]
                : undefined;
            return {
                directPartner,
                thread,
            };
        });
    }
}

ThreadIcon.props = {
    threadLocalId: String,
};

ThreadIcon.template = 'mail.component.ThreadIcon';

return ThreadIcon;

});
