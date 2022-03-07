/** @odoo-module **/

import { NewContentModal, MODULE_STATUS } from '@website/systray_items/new_content';
import { patch } from 'web.utils';

patch(NewContentModal.prototype, 'website_livechat_new_content', {
    setup() {
        this._super();
        this.state.newContentElements = this.state.newContentElements.map(element => {
            if (element.moduleXmlId === 'base.module_website_livechat') {
                element.createNewContent = () => this.createNewChannel();
                element.status = MODULE_STATUS.INSTALLED;
            }
            return element;
        });
    },

    createNewChannel() {
        this.action.doAction('website_livechat.im_livechat_channel_action_add', {
            onClose: (data) => {
                if (data) {
                    this.website.goToWebsite({ path: data.path });
                }
            },
        });
    }
});
