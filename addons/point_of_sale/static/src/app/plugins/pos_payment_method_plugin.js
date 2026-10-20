import { proxy, usePlugin, Plugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { PosDataPlugin } from "./pos_data_plugin";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { SelectDefaultPaymentMethodPopup } from "@point_of_sale/app/components/popups/select_default_payment_method_popup/select_default_payment_method_popup";

export class PosPaymentMethodPlugin extends Plugin {
    // After PosDataPlugin (20)
    static sequence = 30;

    data = usePlugin(PosDataPlugin);
    dialog = usePlugin(DialogPlugin);

    setup() {
        this.defaultGroups = {};
        this.defaultKeys = proxy({});
    }

    get config() {
        return this.data.models["pos.config"].get(odoo.pos_config_id);
    }

    // Called once the data is loaded, the payment interfaces need the pos store
    init(pos) {
        this.initPaymentInterfaces(pos);
        this.initDefaults();
    }

    initPaymentInterfaces(pos) {
        for (const pm of this.config.payment_method_ids) {
            const PaymentInterface = registry
                .category("pos_payment_providers")
                .get(pm.payment_provider, null);
            pm.payment_interface = PaymentInterface ? new PaymentInterface(pos, pm) : null;
        }
    }

    initDefaults() {
        this.defaultGroups = this.computeDefaultGroups();
        for (const provider of Object.keys(this.defaultGroups)) {
            const key = this.getDefaultStorageKey(provider);
            this.defaultKeys[provider] = localStorage.getItem(key) || false;
        }
    }

    computeDefaultGroups() {
        const groups = {};
        for (const pm of this.config.paymentMethods) {
            if (pm.payment_interface) {
                (groups[pm.payment_provider] ||= []).push(...this.getSelectableTerminals(pm));
            }
        }
        return Object.fromEntries(
            Object.entries(groups).filter(([, terminals]) => terminals.length > 1)
        );
    }

    // The terminals of a payment method that can be selected as default
    getSelectableTerminals(paymentMethod) {
        const terminals = paymentMethod.terminal_ids;
        if (terminals.length > 1) {
            return terminals.map((terminal) => ({
                key: `${paymentMethod.id}-${terminal.id}`,
                name: `${paymentMethod.name} - ${terminal.name}`,
                paymentMethod,
                terminal,
            }));
        }
        return [
            {
                key: `${paymentMethod.id}`,
                name: paymentMethod.name,
                paymentMethod,
                terminal: terminals[0],
            },
        ];
    }

    getDefaultStorageKey(provider) {
        return `pos_default_payment_method_id_${provider}_${this.config.id}_${odoo.info?.db}`;
    }

    getDefaultTerminal(provider) {
        const key = this.defaultKeys[provider];
        return this.defaultGroups[provider]?.find((terminal) => terminal.key === key);
    }

    getDefault(provider) {
        return this.getDefaultTerminal(provider)?.paymentMethod;
    }

    /**
     * The terminal used by this device for the payment method: the default
     * one of its provider, or its first terminal.
     */
    getTerminal(paymentMethod) {
        const defaultTerminal = this.getDefaultTerminal(paymentMethod.payment_provider);
        if (defaultTerminal?.paymentMethod === paymentMethod) {
            return defaultTerminal.terminal;
        }
        return paymentMethod.terminal_ids[0];
    }

    setDefault(provider, terminalKey) {
        const key = this.getDefaultStorageKey(provider);
        if (terminalKey) {
            localStorage.setItem(key, terminalKey);
        } else {
            localStorage.removeItem(key);
        }
        this.defaultKeys[provider] = terminalKey ? String(terminalKey) : false;
    }

    async selectDefaults(providers = Object.keys(this.defaultGroups)) {
        const selection = await makeAwaitable(this.dialog, SelectDefaultPaymentMethodPopup, {
            groups: providers.map((provider) => ({
                provider,
                name: this.defaultGroups[provider][0].paymentMethod._payment_provider_name,
                terminals: this.defaultGroups[provider].map(({ key, name }) => ({ key, name })),
                selectedKey: this.getDefaultTerminal(provider)?.key || false,
            })),
        });
        if (!selection) {
            return false;
        }
        for (const [provider, terminalKey] of Object.entries(selection)) {
            this.setDefault(provider, terminalKey);
        }
        return true;
    }
}
