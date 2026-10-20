import { Component, proxy, useProps, t } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

export class SelectDefaultPaymentMethodPopup extends Component {
    static template = "point_of_sale.SelectDefaultPaymentMethodPopup";
    static components = { Dialog };
    props = useProps({
        groups: t.array(
            t.object({
                provider: t.string(),
                name: t.string(),
                terminals: t.array(t.object({ key: t.string(), name: t.string() })),
                selectedKey: t.or([t.string(), t.literal(false)]),
            })
        ),
        close: t.function(),
        getPayload: t.function(),
    });

    setup() {
        this.state = proxy({
            // Without default yet, the first terminal is selected
            selection: Object.fromEntries(
                this.props.groups.map((group) => [
                    group.provider,
                    group.selectedKey || group.terminals[0].key,
                ])
            ),
        });
    }

    select(provider, terminalKey) {
        this.state.selection[provider] = terminalKey;
    }

    confirmSelection() {
        this.props.getPayload({ ...this.state.selection });
        this.props.close();
    }

    cancel() {
        this.props.close();
    }
}
