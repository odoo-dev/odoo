odoo.define('mail.messaging.component.Chatter', function (require) {
'use strict';

const components = {
    ActivityBox: require('mail.messaging.component.ActivityBox'),
    AttachmentBox: require('mail.messaging.component.AttachmentBox'),
    ChatterTopbar: require('mail.messaging.component.ChatterTopbar'),
    Composer: require('mail.messaging.component.Composer'),
    ThreadViewer: require('mail.messaging.component.ThreadViewer'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useDispatch, useGetters, useRef } = owl.hooks;

class Chatter extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const chatter = state.chatters[props.chatterLocalId];
            const threadLocalId = chatter.threadLocalId;
            const thread = threadLocalId ? state.threads[threadLocalId] : undefined;
            let attachments = [];
            if (thread) {
                attachments = thread.attachmentLocalIds.map(attachmentLocalId =>
                    state.attachments[attachmentLocalId]
                );
            }
            return { attachments, chatter, thread };
        }, {
            compareDepth: {
                attachments: 1,
            },
        });
        this._threadRef = useRef('thread');
    }

    mounted() {
        if (this.props.formRendererBus && this.storeProps.thread) {
            this._notifyRendered();
        }
    }

    patched() {
        if (this.props.formRendererBus && this.storeProps.thread) {
            this._notifyRendered();
        }
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Chatter}
     */
    get chatter() {
        return this.storeProps.chatter;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _notifyRendered() {
        this.props.formRendererBus.trigger('o-chatter-rendered', {
            attachments: this.storeProps.attachments,
            threadLocalId: this.storeProps.thread.localId,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onComposerMessagePosted() {
        this.storeDispatch('hideChatterComposer', this.props.chatterLocalId);
    }
}

Object.assign(Chatter, {
    components,
    props: {
        chatterLocalId: String,
        formRendererBus: {
            type: Object,
            optional: true,
        },
    },
    template: 'mail.messaging.component.Chatter',
});

return Chatter;

});
