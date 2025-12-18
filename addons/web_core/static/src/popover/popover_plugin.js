import { Component, plugin, Plugin, props, xml } from "@odoo/owl";
import { OverlayPlugin } from "@web_core/overlay/overlay_plugin";
import { Popover } from "@web_core/popover/popover";
import { serviceRegistry } from "@web_core/services";

class DefaultSlotPopover extends Component {
    static template = xml`<t t-call-slot="default"/>`;
    content = props({
        slots: {
            type: Object,
            shape: { default: true },
        },
    });
}

export class PopoverPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    /** @private */
    overlay = plugin(OverlayPlugin);

    /**
     * @param {import("@odoo/owl").ReactiveValue<HTMLElement | null>} target
     * @template {import("@odoo/owl").ComponentConstructor} T
     * @param {{
     *  component?: T;
     *  props?: import("@odoo/owl").GetProps<InstanceType<T>>;
     * }} [options]
     */
    createPopover(target, options = {}) {
        return this.overlay.createOverlay(Popover, {
            props: {
                component: options.component ?? DefaultSlotPopover,
                props: options.props ?? {},
                target,
            },
        });
    }
}
