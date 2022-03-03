/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from '@web/core/utils/hooks';

const { Component, useState } = owl;

class EditWebsiteSystray extends Component {
    setup(options = {}) {
        this.websiteService = useService('website');
        this.websiteContext = useState(this.websiteService.context);
    }

    startEdit() {
        this.websiteContext.edition = true;
    }
}
EditWebsiteSystray.template = "website.EditWebsiteSystray";

export const systrayItem = {
    Component: EditWebsiteSystray,
};

registry.category("website_systray").add("EditWebsite", systrayItem, { sequence: 9 });
