odoo.define('mail.component.ModerationRejectDialog', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const Dialog = require('web.OwlDialog');

const { Component, useState } = owl;
const { useDispatch, useRef } = owl.hooks;

class ModerationRejectDialog extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        const { _t } = this.env;
        this.state = useState({
            title: _t("Message Rejected"),
            comment: _t("Your message was rejected by moderator."),
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
            this.storeProps.messages.map(message => message.localId),
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
    template: 'mail.component.ModerationRejectDialog',
});

return ModerationRejectDialog;

});
