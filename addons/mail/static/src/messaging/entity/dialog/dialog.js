odoo.define('mail.messaging.entity.Dialog', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { many2one, one2one } = require('mail.messaging.EntityField');

function DialogFactory({ Entity }) {

    class Dialog extends Entity {

        /**
         * @override
         */
        delete() {
            if (this.manager) {
                this.manager.unregister(this);
            }
            super.delete();
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        close() {
            this.delete();
        }

    }

    Dialog.entityName = 'Dialog';

    Dialog.fields = {
        /**
         * Content of dialog that is directly linked to an entity that models
         * a UI component, such as AttachmentViewer. These entities must be
         * created from @see `mail.messaging.entity.DialogManager.open()`.
         */
        entity: one2one('Entity', {
            isCausal: true,
        }),
        manager: many2one('DialogManager', {
            inverse: 'dialogs',
        }),
    };

    return Dialog;
}

registerNewEntity('Dialog', DialogFactory);

});
