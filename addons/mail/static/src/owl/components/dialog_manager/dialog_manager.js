odoo.define('mail.component.DialogManager', function (require) {
'use strict';

const Dialog = require('mail.component.Dialog');

const { Component } = owl;
const { useGetters, useStore } = owl.hooks;

class DialogManager extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.IS_DEV = true;
        this.storeGetters = useGetters();
        this.storeProps = useStore(() =>
            this.storeGetters.getTopLevelStoreObject({
                storeKey: 'dialogManager',
                keys: ['dialogs'],
            })
        );
        if (this.IS_DEV) {
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
        if (this.storeProps.dialogs.length > 0) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    }
}

DialogManager.components = { Dialog };

DialogManager.template = 'mail.component.DialogManager';

return DialogManager;

});
