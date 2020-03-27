odoo.define('mail.messaging.component.ModerationRejectDialog', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const Dialog = require('web.OwlDialog');

const { Component, useState } = owl;
const { useDispatch, useRef } = owl.hooks;

class ModerationRejectDialog extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            title: this.env._t("Message Rejected"),
            comment: this.env._t("Your message was rejected by moderator."),
        });
        this.storeDispatch = useDispatch();
        this.storeProps = useStore((state, props) => {
            return {
                messages: props.messageLocalIds.map(localId => state.messages[localId]),
            };
        }, {
            compareDepth: {
                messages: 1,
            },
        });
        // to manually trigger the dialog close event
        this._dialogRef = useRef('dialog');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Message[]}
     */
    get messages() {
        return this.storeProps.messages;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickCancel() {
        this._dialogRef.comp._close();
    }
    /**
     * @private
     */
    _onClickReject() {
        this._dialogRef.comp._close();
        const kwargs = {
            title: this.state.title,
            comment: this.state.comment,
        };
        this.storeDispatch('moderateMessages',
            this.messages.map(message => message.localId),
            'reject',
            kwargs
        );
    }
}

Object.assign(ModerationRejectDialog, {
    components: { Dialog },
    props: {
        messageLocalIds: {
            type: Array,
            element: String,
        },
    },
    template: 'mail.messaging.component.ModerationRejectDialog',
});

return ModerationRejectDialog;

});
