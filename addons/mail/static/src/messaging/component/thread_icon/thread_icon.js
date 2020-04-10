odoo.define('mail.messaging.component.ThreadIcon', function (require) {
'use strict';

const components = {
    ThreadTypingIcon: require('mail.messaging.component.ThreadTypingIcon'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class ThreadIcon extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const thread = this.env.entities.Thread.get(props.threadLocalId);
            const correspondent = thread ? thread.correspondent : undefined;
            return {
                correspondent: correspondent ? correspondent.__state : undefined,
                partnerRoot: this.env.messaging.partnerRoot
                    ? this.env.messaging.partnerRoot.__state
                    : undefined,
                thread: thread ? thread.__state : undefined,
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
        return this.env.entities.Thread.get(this.props.threadLocalId);
    }

}

Object.assign(ThreadIcon, {
    components,
    props: {
        threadLocalId: String,
    },
    template: 'mail.messaging.component.ThreadIcon',
});

return ThreadIcon;

});
