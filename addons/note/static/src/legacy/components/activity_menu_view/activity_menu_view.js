/** @odoo-module **/

import { useRefToModel } from '@mail/legacy/component_hooks/use_ref_to_model';
import { useUpdateToModel } from '@mail/legacy/component_hooks/use_update_to_model';
import '@mail/legacy/components/activity_menu_view/activity_menu_view'; // ensure components are registered beforehand.
import { getMessagingComponent } from "@mail/legacy/utils/messaging_component";

import { DatePicker } from '@web/core/datepicker/datepicker';
import { patch } from 'web.utils';

const ActivityMenuView = getMessagingComponent('ActivityMenuView');

patch(ActivityMenuView.prototype, 'note', {
    /**
     * @override
     */
    setup() {
        this._super();
        useRefToModel({ fieldName: 'noteInputRef', refName: 'noteInput', });
        useUpdateToModel({ methodName: 'onComponentUpdate' });
    },
});

Object.assign(ActivityMenuView.components, {
    DatePicker,
});
