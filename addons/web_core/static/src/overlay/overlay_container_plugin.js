import { computed, Plugin, signal } from "@odoo/owl";
import { registry } from "@web_core/registry";
import "@web_core/services";

/**
@typedef {{
    alivePromise: Promise<void>;
    bringToFront(): void;
    component: import("@odoo/owl").ComponentConstructor;
    id: number;
    isAlive: boolean;
    pop<T = void>(result?: T): void;
    props: any;
    section: number;
    zindex: number;
}} OverlayContainerPluginItem
*/

export class OverlayContainerPlugin extends Plugin {
    static id = this.name;
    static {
        registry.get("services").addById(this);
    }

    static sectionSequence = ["default", "notifications"];

    /** @private */
    nextId = 0;

    /** @private */
    zindex = 0;

    /** @private @type {import("@odoo/owl").Signal<{ [K: number]: OverlayContainerPluginItem }>} */
    overlayMap = signal({});

    overlays = computed(() => Object.values(this.overlayMap()).sort((a, b) => (a.section - b.section) || (a.zindex - b.zindex)));

    /**
     * @template {import("@odoo/owl").ComponentConstructor} T
     * @param {T} component
     * @param {{
     *  props?: import("@odoo/owl").GetProps<InstanceType<T>>;
     *  section?: string;
     * }} [options]
     */
    push(component, options = {}) {
        const id = ++this.nextId;
        const zindex = signal(this.zindex);
        const { promise, resolve } = Promise.withResolvers();
        let isAlive = true;

        /** @type {OverlayContainerPluginItem} */
        const overlay = {
            alivePromise: promise,
            bringToFront: () => {
                zindex.set(++this.zindex);
            },
            component,
            id,
            get isAlive() {
                return isAlive;
            },
            pop: (result) => {
                if (!isAlive) {
                    return;
                }
                delete this.overlayMap()[id];
                this.overlayMap.update();
                isAlive = false;
                resolve(result);
            },
            props: options.props ?? {},
            section: OverlayContainerPlugin.sectionSequence.indexOf(options.section ?? "default"),
            get zindex() {
                return zindex();
            },
        };

        this.overlayMap()[id] = overlay;
        this.overlayMap.update();

        return overlay;
    }
}
