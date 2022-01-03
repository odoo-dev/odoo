/** @odoo-module **/

import { NewContentModal, MODULE_STATUS } from '@website/systray_items/new_content';
import { patch } from 'web.utils';

patch(NewContentModal.prototype, 'website_event_new_content', {
    setup() {
        this._super();

        const newEventElement = this.state.newContentElements.find(element => element.moduleXmlId === 'base.module_website_event');
        newEventElement.createNewContent = () => this.createNewEvent();
        newEventElement.status = MODULE_STATUS.INSTALLED;
    },

    createNewEvent() {}
});
