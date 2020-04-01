odoo.define('mail.messaging.component.ChatterContainer', function (require) {
'use strict';

const components = {
    Chatter: require('mail.messaging.component.Chatter'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class ChatterContainer extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.chatter = undefined;
        this._wasMessagingInitialized = false;
        useStore(props => {
            const isMessagingInitialized = this.env.isMessagingInitialized();
            if (!this._wasMessagingInitialized && isMessagingInitialized) {
                this._wasMessagingInitialized = true;
                this.chatter = this.env.entities.Chatter.create(props);
            }
            return { isMessagingInitialized };
        });
    }

    mounted() {
        this._update();
    }

    patched() {
        this._update();
    }

    destroy() {
        super.destroy();
        if (this.chatter) {
            this.chatter.delete();
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _update() {
        if (this.chatter) {
            this.chatter.update(this.props);
        }
    }

}

Object.assign(ChatterContainer, {
    components,
    defaultProps: {
        hasActivities: true,
        hasFollowers: true,
        hasThread: true,
    },
    props: {
        activityIds: {
            type: Array,
            element: Number,
            optional: true,
        },
        context: {
            type: Object,
            optional: true,
        },
        followerIds: {
            type: Array,
            element: Number,
            optional: true,
        },
        hasActivities: Boolean,
        hasFollowers: Boolean,
        hasThread: Boolean,
        messageIds: {
            type: Array,
            element: Number,
            optional: true,
        },
        threadAttachmentCount: Number,
        threadId: {
            type: Number,
            optional: true,
        },
        threadModel: String,
    },
    template: 'mail.messaging.component.ChatterContainer',
});


return ChatterContainer;

});
