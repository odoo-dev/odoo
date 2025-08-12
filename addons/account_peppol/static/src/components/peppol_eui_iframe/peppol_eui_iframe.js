/** @odoo-module **/
import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import {_t} from "@web/core/l10n/translation";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";


class PeppolEUIiFrame extends Component {
    static props = { ...standardActionServiceProps };
    static template = "account_peppol.PeppolEUIiFrame";

    setup() {
        super.setup();
        this.actionService = useService("action");
        this.EUIiFrameURL = buildPDFViewerURL(this.props.attachmentLocation, this.env.isSmall);
    }

}

registry.category("actions").add("account_peppol.peppol_eui_iframe", PeppolEUIiFrame);
