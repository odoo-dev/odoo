/** @odoo-module **/

import { useUpdateToModel } from '@mail/component_hooks/use_update_to_model';
import { registerModel } from '@mail/model/model_core';
import { many } from '@mail/model/model_field';

registerModel({
    name: 'DialogManager',
    template: 'mail.DialogManager',
    componentSetup() {
        useUpdateToModel({ methodName: 'onComponentUpdate' });
    },
    recordMethods: {
        onComponentUpdate() {
            if (this.dialogs.length > 0) {
                document.body.classList.add('modal-open');
            } else {
                document.body.classList.remove('modal-open');
            }
        },
    },
    fields: {
        // FIXME: dependent on implementation that uses insert order in relations!!
        dialogs: many('Dialog', { inverse: 'manager', isCausal: true }),
    },
});
