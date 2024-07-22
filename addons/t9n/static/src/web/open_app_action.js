import { Component, xml, useState} from "@odoo/owl";

import { App } from "@t9n/core/app";

import { registry } from "@web/core/registry";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { useService } from "@web/core/utils/hooks";

/**
 * Wraps the application root, allowing us to open the application as a result
 * of a call to the "t9n.open_app" client action.
 */
export class OpenApp extends Component {
    static components = { App };
    static props = { ...standardActionServiceProps };
    static template = xml`<App/>`;

    setup() {
        this.store = useState(useService("mail.store"));
        this.store.t9n.activeView = 'ProjectList';
        this.store.t9n.activeLanguage = null;
        this.store.t9n.activeResource = null;
        this.store.t9n.activeMessage = null;
    }
}

registry.category("actions").add("t9n.open_app", OpenApp);
