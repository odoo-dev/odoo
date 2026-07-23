import { beforeEach, getFixture, test } from "@odoo/hoot";
import {
    Component,
    onWillDestroy,
    onWillStart,
    Plugin,
    providePlugins,
    Resource,
    signal,
    t,
    useApp,
    useConfig,
    useEffect,
    usePlugin,
    useProps,
    useScope,
    xml,
} from "@odoo/owl";
import { services } from "@web/core/services";
import { ErrorHandler } from "@web/core/utils/components";
import { getService, makeTestApp } from "../web_test_helpers";

// ============================================================================

class CurrentOverlayPlugin extends Plugin {
    children = useConfig("children", t.instanceOf(Resource));
    layerRef = useConfig("layerRef", t.signal(t.ref()));
    parent = useConfig("parent", t.or([t.instanceOf(CurrentOverlayPlugin), t.literal(null)]));
    remove = useConfig("remove", t.function());

    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    contains(element) {
        return (
            this.layerRef().contains(element) ||
            this.children.items().some((c) => c.contains(element))
        );
    }
}

const Overlay = t.object({
    children: t.instanceOf(Resource),
    component: t.component(),
    id: t.number(),
    layerRef: t.signal(t.ref()),
    parent: t.or([t.instanceOf(CurrentOverlayPlugin), t.literal(null)]),
    props: t.object(),
    remove: t.function(),
    scope: t.any(),
});

class OverlayContainerPlugin extends Plugin {
    /**
     * @param {OverlayContainerPlugin} self
     * @param {any} scope
     * @returns {OverlayContainerPlugin}
     */
    static scoped(self, scope) {
        return Object.assign(Object.create(self), {
            parentOverlay: scope.pluginManager.getPlugin(CurrentOverlayPlugin),
            scope,
        });
    }

    /** @private */
    nextId = 0;
    /** @private */
    scope = useScope();
    /** @private @type {CurrentOverlayPlugin | null} */
    parentOverlay = null;

    overlays = new Resource({ validation: Overlay });

    unscoped = this;

    /**
     * @param {import("@odoo/owl").ComponentConstructor} component
     * @param {{
     *   onRemove?: (params: any) => (void | Promise<void>);
     *   props?: Record<PropertyKey, any>;
     *   sequence?: number;
     * }} [options]
     * @returns {(params: any) => Promise<void>}
     */
    add(component, options = {}) {
        const { promise, resolve } = Promise.withResolvers();

        const remove = async (params) => {
            if (this.overlays.has(overlay)) {
                for (const child of overlay.children.items()) {
                    await child.remove(params);
                }

                await options.onRemove?.(params);
                overlay.parent?.children.delete(overlay);
                this.overlays.delete(overlay);
                resolve(params);
            }
        };

        const overlay = {
            children: new Resource(),
            component,
            id: ++this.unscoped.nextId,
            layerRef: signal.ref(),
            parent: this.parentOverlay,
            props: options.props ?? {},
            remove,
            scope: this.scope,
            modal: null,
        };
        this.overlays.add(overlay, { sequence: options.sequence });
        this.parentOverlay?.children.add(overlay);

        return {
            promise,
            remove,
        };
    }
}
services.add(OverlayContainerPlugin);

class OverlayRendererLayer extends Component {
    static template = xml`
        <ErrorHandler onError="(error) => this.handleError(this.overlay, error)">
            <div class="o_overlay_renderer_layer" t-ref="this.overlay.layerRef">
                <t t-component="this.overlay.component" t-props="this.overlay.props"/>
            </div>
        </ErrorHandler>
    `;
    static components = { ErrorHandler };

    overlay = useProps.static("overlay", Overlay);

    setup() {
        const scope = useScope();
        scope.pluginManager = this.overlay.scope.pluginManager;
        providePlugins([CurrentOverlayPlugin], this.overlay);
    }

    handleError(overlay, error) {
        overlay.remove();
        Promise.resolve().then(() => {
            throw error;
        });
    }
}

class OverlayRenderer extends Component {
    static template = xml`
        <div class="o_overlay_renderer">
            <t t-foreach="this.overlayContainer.overlays.items()" t-as="overlay" t-key="overlay.id">
                <OverlayRendererLayer overlay="overlay"/>
            </t>
        </div>
    `;
    static components = { OverlayRendererLayer };
    overlayContainer = usePlugin(OverlayContainerPlugin);
}

class OverlayRendererPlugin extends Plugin {
    anchor = useConfig("overlayRendererAnchor", t.instanceOf(HTMLElement).optional(document.body));

    setup() {
        const app = useApp();
        const root = app.createRoot(OverlayRenderer);
        onWillStart(root.mount(this.anchor));
        onWillDestroy(() => {
            root.destroy();
        });
    }
}
services.add(OverlayRendererPlugin);

class InertOverlayPlugin extends Plugin {
    container = usePlugin(OverlayContainerPlugin);
    renderer = usePlugin(OverlayRendererPlugin);

    setup() {
        useEffect(() => {
            const items = this.container.overlays.items();
            const modalIndex = items.findLastIndex((item) => item.modal);
            if (modalIndex >= 0) {
                for (const child of this.renderer.anchor.children) {
                    if (child.classList.contains("o_overlay_renderer")) {
                        continue;
                    }
                    child.setAttribute("inert");
                }
                for (const item of items.slice(0, modalIndex)) {
                    item.layerRef().setAttribute("inert");
                }
            }

            return () => {
                for (const child of this.renderer.anchor.children) {
                    child.removeAttribute("inert");
                }
                for (const item of items) {
                    item.layerRef()?.removeAttribute("inert");
                }
            };
        });
    }
}
services.add(InertOverlayPlugin);

// ============================================================================

beforeEach(async () => {
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(`
        .o_overlay_renderer_layer {
            isolation: isolate;
        }
    `);
    document.adoptedStyleSheets.push(styleSheet);

    await makeTestApp({
        config: {
            overlayRendererAnchor: getFixture(),
        },
    });
});

class PopoverFrame extends Component {
    static template = xml`
        <div class="o_popover_frame">
            <t t-call-slot="default"/>
        </div>
    `;
}

// eslint-disable-next-line no-unused-vars
class BottomSheetFrame extends Component {
    static template = xml`
        <div class="o_bottom_sheet_frame">
            <t t-call-slot="default"/>
        </div>
    `;
}

// eslint-disable-next-line no-unused-vars
class DialogFrame extends Component {
    static template = xml`
        <div class="o_dialog_frame">
            <t t-call-slot="default"/>
        </div>
    `;
}

// eslint-disable-next-line no-unused-vars
function usePopover(component, popoverOptions = {}) {
    const overlayContainer = usePlugin(OverlayContainerPlugin);

    return {
        isMounted: false,
        mount(anchorRef, options) {
            overlayContainer.add(PopoverFrame);
        },
        unmount() {},
    };
}

// eslint-disable-next-line no-unused-vars
function useDialog(component, dialogOptions = {}) {
    const overlayContainer = usePlugin(OverlayContainerPlugin);

    return {
        isMounted: false,
        mount(options) {
            overlayContainer.add(DialogFrame);
        },
        unmount() {},
    };
}

test.debug("next overlay architecture", async () => {
    getService(OverlayContainerPlugin).add(PopoverFrame);
    getService(OverlayContainerPlugin).add(PopoverFrame);
});
