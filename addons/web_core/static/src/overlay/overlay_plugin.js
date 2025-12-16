import { computed, Plugin, signal } from "@odoo/owl";
import { registry } from "@web_core/registry";
import "@web_core/services";

export class Overlay {
    component;
    /** @private */
    _container;
    /** @private */
    _currentZindex;
    /** @private @type {PromiseWithResolvers<any> | null} */
    _displayDeferred = null;
    /** @private */
    _globalZindex;
    id;
    props;
    section;

    get isDisplayed() {
        return !!this._displayDeferred;
    }

    get zindex() {
        return this._currentZindex();
    }

    /**
     * @param {{
     *  component: import("@odoo/owl").ComponentConstructor;
     *  container: import("@odoo/owl").Signal<{ [K: number]: Overlay }>;
     *  id: number;
     *  props: object;
     *  section: number;
     *  zindex: import("@odoo/owl").Signal<number>;
     * }} params
     */
    constructor(params) {
        this.component = params.component;
        this._container = params.container;
        this._currentZindex = signal(params.zindex());
        this._globalZindex = params.zindex;
        this.id = params.id;
        this.props = params.props;
        this.section = params.section;
    }

    bringToFront() {
        this._globalZindex.update((v) => v + 1);
        this._currentZindex.set(this._globalZindex());
    }

    /**
     * @template T
     * @param {T} [result]
     */
    pop(result) {
        if (!this._displayDeferred) {
            return;
        }
        delete this._container()[this.id];
        this._container.update();
        this._displayDeferred.resolve(result);
        this._displayDeferred = null;
    }

    /**
     * @template T
     * @returns {Promise<T>}
     */
    push() {
        if (this._displayDeferred) {
            return this._displayDeferred.promise;
        }
        this._container()[this.id] = this;
        this._container.update();
        this._displayDeferred = Promise.withResolvers();
        return this._displayDeferred.promise;
    }
}

export class OverlayPlugin extends Plugin {
    static id = this.name;
    static {
        registry.get("services").addById(this);
    }

    static sectionSequence = ["default", "notifications"];

    /** @private */
    _nextId = 0;

    /** @private */
    _zindex = signal(0);

    /** @private @type {import("@odoo/owl").Signal<{ [K: number]: Overlay }>} */
    _overlayMap = signal({});

    overlays = computed(() =>
        Object.values(this._overlayMap()).sort(
            (a, b) => a.section - b.section || a.zindex - b.zindex
        )
    );

    /**
     * @template {import("@odoo/owl").ComponentConstructor} T
     * @param {T} component
     * @param {{
     *  props?: import("@odoo/owl").GetProps<InstanceType<T>>;
     *  section?: string;
     * }} [options]
     */
    createOverlay(component, options = {}) {
        return new Overlay({
            component,
            container: this._overlayMap,
            id: ++this._nextId,
            props: options.props ?? {},
            section: OverlayPlugin.sectionSequence.indexOf(options.section ?? "default"),
            zindex: this._zindex,
        });
    }
}
