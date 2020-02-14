odoo.define('mail.component.Chatter', function (require) {
'use strict';

const AttachmentBox = require('mail.component.AttachmentBox');
const ChatterTopbar = require('mail.component.ChatterTopbar');
const Composer = require('mail.component.Composer');
const Thread = require('mail.component.Thread');
const useStore = require('mail.hooks.useStore');

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
            if (thread) {
                const attachments = thread.attachmentLocalIds.map(attachmentLocalId =>
                    state.attachments[attachmentLocalId]
                );
                if (this.props.formRendererBus) {
                    this.props.formRendererBus.trigger('o-chatter-use-store-thread-and-attachments', {
                        attachments,
                        threadLocalId
                    });
                }
            }
            return { chatter, thread };
        });
        this._threadRef = useRef('thread');
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

Chatter.components = { AttachmentBox, ChatterTopbar, Composer, Thread };

Chatter.props = {
    chatterLocalId: String,
    formRendererBus: {
        type: Object,
        optional: true,
    },
};

Chatter.template = 'mail.component.Chatter';

return Chatter;

});
