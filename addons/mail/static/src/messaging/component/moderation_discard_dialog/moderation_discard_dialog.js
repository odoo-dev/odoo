odoo.define('mail.messaging.component.ModerationDiscardDialog', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const Dialog = require('web.OwlDialog');

const { Component } = owl;
const { useDispatch, useRef } = owl.hooks;

class ModerationDiscardDialog extends Component {

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
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {string}
     */
    getText() {
        if (this.messages.length === 1) {
            return this.env._t("You are going to discard 1 message.");
        }
        return _.str.sprintf(
            this.env._t("You are going to discard %s messages."),
            this.messages.length
        );
    }

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
    _onClickDiscard() {
        this._dialogRef.comp._close();
        this.storeDispatch('moderateMessages',
            this.messages.map(message => message.localId),
            'discard'
        );
    }

}

Object.assign(ModerationDiscardDialog, {
    components: { Dialog },
    props: {
        messageLocalIds: {
            type: Array,
            element: String,
        },
    },
    template: 'mail.messaging.component.ModerationDiscardDialog',
});

return ModerationDiscardDialog;

});
