odoo.define('mail.component.DialogManager', function (require) {
'use strict';

const Dialog = require('mail.component.Dialog');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;

class DialogManager extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeProps = useStore(state => {
            // TODO SEB transform into storeProps.dialogManager...
            return Object.assign({}, state.dialogManager);
        });
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

Object.assign(DialogManager, {
    components: { Dialog },
    template: 'mail.component.DialogManager',
});

return DialogManager;

});
