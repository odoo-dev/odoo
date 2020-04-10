odoo.define('mail.messaging.component.ThreadTextualTypingStatus', function (require) {
'use strict';

const components = {
    ThreadTypingIcon: require('mail.messaging.component.ThreadTypingIcon'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class ThreadTextualTypingStatus extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const thread = this.env.entities.Thread.get(props.threadLocalId);
            return {
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

Object.assign(ThreadTextualTypingStatus, {
    components,
    props: {
        threadLocalId: String,
    },
    template: 'mail.messaging.component.ThreadTextualTypingStatus',
});

return ThreadTextualTypingStatus;

});
