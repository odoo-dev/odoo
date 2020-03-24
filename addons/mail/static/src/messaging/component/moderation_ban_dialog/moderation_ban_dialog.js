odoo.define('mail.component.ModerationBanDialog', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const Dialog = require('web.OwlDialog');

const { Component } = owl;
const { useDispatch, useRef } = owl.hooks;

class ModerationBanDialog extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
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
    _onClickBan() {
        this._dialogRef.comp._close();
        this.storeDispatch('moderateMessages',
            this.storeProps.messages.map(message => message.localId),
            'ban'
        );
    }
    /**
     * @private
     */
    _onClickCancel() {
        this._dialogRef.comp._close();
    }
}

Object.assign(ModerationBanDialog, {
    components: { Dialog },
    props: {
        messageLocalIds: {
            type: Array,
            element: String,
        },
    },
    template: 'mail.component.ModerationBanDialog',
});

return ModerationBanDialog;

});
