odoo.define('mail.messaging.component.ThreadIcon', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class ThreadIcon extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const thread = this.env.entities.Thread.get(props.thread);
            const directPartner = thread ? thread.directPartner : undefined;
            return {
                directPartner,
                partnerRoot: this.env.entities.Partner.root,
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
        return this.env.entities.Thread.get(this.props.thread);
    }

}

Object.assign(ThreadIcon, {
    props: {
        thread: String,
    },
    template: 'mail.messaging.component.ThreadIcon',
});

return ThreadIcon;

});
