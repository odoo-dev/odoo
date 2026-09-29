import { Dialog } from "@web/core/dialog/dialog";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { useKEProxy } from "./ke_proxy_hook";
import { Component, t, usePlugin, useProps } from "@odoo/owl";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";


export class KEProxyDialog extends Component {
    static template = "l10n_ke_edi_tremol.KEProxyDialog";
    static components = { Dialog };
    props = useProps({
        invoices: t.object(),
        close: t.function(),
    });

    setup() {
        // prevent the escape key from exiting the dialog
        useHotkey("escape", () => {});
        this.action = usePlugin(ActionPlugin);
        this.sender = useKEProxy({ onAllSent: this.props.close });
        this.state = this.sender.state;
        this.sender.postInvoices(this.props.invoices);
    };
}
