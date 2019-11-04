odoo.define('mail.component.Chatter', function (require) {
'use strict';

const AttachmentBox = require('mail.component.AttachmentBox');
const ChatterTopbar = require('mail.component.ChatterTopbar');
const Thread = require('mail.component.Thread');

const { Component, useState } = owl;
const { useDispatch, useGetters, useRef, useStore } = owl.hooks;

class Chatter extends Component {
    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({ isAttachmentBoxVisible: false });
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const res = {
                thread: this.storeGetters.getStoreObject({
                    storeKey: 'threads',
                    localId: `${props.model}_${props.id}`,
                    keys: ['localId'],
                }),
            };
            return res;
        });
        this._threadRef = useRef('thread');
    }

        // TODO {xdu}
        // Need to say to the underlying Thread that there is no long polling
        // So when doing message_post, you need to do a read on the record and
        // then verify in the message_ids if there are missing messages or not
        // and then make a message_format call for each message (including the
        // one posted)

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onTopbarSelectAttachment(ev) {
        this.state.isAttachmentBoxVisible = !this.state.isAttachmentBoxVisible;
    }
}

Chatter.components = { AttachmentBox, ChatterTopbar, Thread };

Chatter.props = {
    id: Number,
    model: String
};

Chatter.template = 'mail.component.Chatter';

return Chatter;

});
