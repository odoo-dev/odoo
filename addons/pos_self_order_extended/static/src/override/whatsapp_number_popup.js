import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { Numpad, buttonsType } from "@point_of_sale/app/components/numpad/numpad";

export class WhatsappNumberPopup extends Component {
    static template = "pos_self_order_extended.WhatsappNumberPopup";
    static components = { Numpad };
    static props = {
        title: { type: String, optional: true },
        buttons: { type: buttonsType, optional: true },
        placeholder: { type: String, optional: true },
        isValid: { type: Function, optional: true },
        confirmButtonLabel: { type: String, optional: true },
        getPayload: Function,
        close: Function,
    };
    static defaultProps = {
        title: _t("Confirm?"),
        isValid: () => true,
    };
    setup() {
        this.numberBuffer = useService("number_buffer");
        this.numberBuffer.use({
            triggerAtEnter: () => this.confirm(),
            triggerAtEscape: () => this.cancel(),
            triggerAtInput: ({ buffer }) => (this.state.buffer = buffer),
        });
        this.state = useState({
            buffer: this.props.startingValue,
        });
    }

    get confirmButtonLabel() {
        return this.props.confirmButtonLabel || _t("Ok");
    }

    confirm() {
        this.props.getPayload(this.state.buffer);
        this.props.close();
    }
}
