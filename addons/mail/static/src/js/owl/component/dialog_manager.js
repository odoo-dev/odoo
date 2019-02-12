odoo.define('mail.component.DialogManager', function (require) {
"use strict";

const Dialog = require('mail.component.Dialog');

class DialogManager extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.DEBUG = true;
        // owl
        this.components = { Dialog };
        this.template = 'mail.component.DialogManager';
        if (this.DEBUG) {
            window.dialog_manager = this;
        }
    }

    mounted() {
        this._checkDialogOpen();
    }

    patched() {
        this._checkDialogOpen();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _checkDialogOpen() {
        if (this.props.dialogs.length > 0) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.id
     */
    _onCloseDialog(ev) {
        this.env.store.commit('closeDialog', ev.detail.id);
    }
}

/**
 * @param {Object} state
 * @return {Object}
 */
DialogManager.mapStoreToProps = function (state) {
    return {
        ...state.dialogManager,
    };
};

DialogManager.props = {
    dialogs: {
        type: Array,
        element: {
            type: Object,
            shape: {
                Component: Object,
                id: String,
                info: Object,
            },
        },
    },
};

return DialogManager;

});
