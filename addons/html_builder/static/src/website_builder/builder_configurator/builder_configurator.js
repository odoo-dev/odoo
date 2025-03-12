import { Builder } from "@html_builder/builder";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { CORE_PLUGINS } from "@html_builder/core/core_plugins";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { EDITOR_COLOR_CSS_VARIABLES, getCSSVariableValue } from "@html_builder/utils/utils_css";
import { registry } from "@web/core/registry";
import { useChildRef } from "@web/core/utils/hooks";
import { InvisibleElementsPanel } from "@html_builder/sidebar/invisible_elements_panel";
import { BlockTab } from "@html_builder/sidebar/block_tab";
import { CustomizeTab } from "@html_builder/sidebar/customize_tab";
import { ThemeTab } from "@html_builder/sidebar/theme_tab";
import {
    Component,
    EventBus,
    onMounted,
    onWillStart,
    onWillUpdateProps,
    useState,
} from "@odoo/owl";
import { useSnippetEditor } from "@html_builder/utils/utils";

function removePlugins(plugins, pluginsToRemove) {
    return plugins.filter((p) => !pluginsToRemove.includes(p.name));
}

export class WebsiteBuilderConfigurator extends Component {
    static template = "html_builder.WebsiteBuilderConfigurator";
    static components = {
        BlockTab,
        Builder,
        CustomizeTab,
        InvisibleElementsPanel,
        ThemeTab,
    };
    static props = {
        closeEditor: { type: Function },
        iframeLoaded: { type: Object },
        isMobile: { type: Boolean },
        isTranslation: { type: Boolean },
        overlayRef: { type: Function },
        Plugins: { type: Array, optional: true },
        snippetsName: { type: String },
        toggleMobile: { type: Function },
    };

    setup() {
        // const actionService = useService("action");
        this.builder_sidebarRef = useChildRef();
        const editorBus = new EventBus();
        this.noSelectionTab = "blocks";

        this.state = useState({
            canUndo: false,
            canRedo: false,
            activeTab: this.props.isTranslation ? "customize" : "blocks",
            currentOptionsContainers: undefined,
            invisibleEls: [],
        });

        const mainPlugins = removePlugins([...MAIN_PLUGINS], ["PowerButtonsPlugin"]);
        const Plugins = [...mainPlugins, ...CORE_PLUGINS, ...(this.props.Plugins || [])];
        // TODO: maybe do a different config for the translate mode and the
        // "regular" mode.
        const { editor, snippetModel, snippetModelPromise } = useSnippetEditor({
            editorBus,
            localOverlayContainerKey: this.env.localOverlayContainerKey,
            overlayRef: this.props.overlayRef,
            Plugins,
            getRecordInfo: (editableEl) => {
                if (!editableEl) {
                    editableEl = closestElement(
                        this.editor.shared.selection.getEditableSelection().anchorNode
                    );
                }
                return {
                    resModel: editableEl.dataset["oeModel"],
                    resId: editableEl.dataset["oeId"],
                    field: editableEl.dataset["oeField"],
                    type: editableEl.dataset["oeType"],
                };
            },
            onChange: () => this.updateInvisibleEls(),
            onCurrentOptionsContainersChange: (currentOptionsContainers) => {
                this.state.currentOptionsContainers = currentOptionsContainers;
                if (!currentOptionsContainers.length) {
                    // There is no options, fallback on the blocks tab
                    this.setTab(this.noSelectionTab);
                    return;
                }
                this.setTab("customize");
            },
            resources: {
                update_invisible_panel: (el) => {
                    this.updateInvisibleEls();
                    this.editor.shared["builder-options"].updateContainers(el);
                },
                unsplittable_node_predicates: (/** @type {Node} */ node) =>
                    node.querySelector?.("[data-oe-translation-source-sha]"),
            },
            setHistoryState: ({ canRedo, canUndo }) => {
                this.state.canRedo = canRedo;
                this.state.canUndo = canUndo;
            },
        });
        this.editor = editor;
        this.snippetModel = snippetModel;

        onWillStart(async () => {
            await snippetModelPromise;
            // Ensure that the iframe is loaded and the editor is created before
            // instantiating the sub components that potentially need the
            // editor.
            const iframeEl = await this.props.iframeLoaded;
            this.editor.attachTo(iframeEl.contentDocument.body.querySelector("#wrapwrap"));
        });
        // onMounted(() => {
        //      // TODO: onload editor
        //     // actionService.setActionMode("fullscreen");
        // });
        onMounted(() => {
            this.updateInvisibleEls();
            this.setCSSVariables();
        });
        onWillUpdateProps((nextProps) => {
            if (nextProps.isMobile !== this.props.isMobile) {
                this.updateInvisibleEls(nextProps.isMobile);
            }
        });
        // onWillDestroy(() => {
        //     actionService.setActionMode("current");
        // });
    }

    getBuilderProps() {
        return {
            builder_sidebar: this.builder_sidebarRef,
            canRedo: this.state.canRedo,
            canUndo: this.state.canUndo,
            closeEditor: () => this.props.closeEditor(),
            discard: () => this.props.closeEditor(),
            redo: () => this.editor.shared.history.redo(),
            save: () => this.editor.shared.savePlugin.save(this.props.isTranslation),
            undo: () => this.editor.shared.history.undo(),
        };
    }

    getInvisibleSelector(isMobile = this.props.isMobile) {
        return `.o_snippet_invisible, ${
            isMobile ? ".o_snippet_mobile_invisible" : ".o_snippet_desktop_invisible"
        }`;
    }

    onMobilePreviewClick() {
        this.props.toggleMobile();
        this.editor.resources["on_mobile_preview_clicked"].forEach((handler) => handler());
    }

    setCSSVariables() {
        const el = this.builder_sidebarRef.el;
        for (const style of EDITOR_COLOR_CSS_VARIABLES) {
            let value = getCSSVariableValue(style);
            if (value.startsWith("'") && value.endsWith("'")) {
                // Gradient values are recovered within a string.
                value = value.substring(1, value.length - 1);
            }
            el.style.setProperty(`--we-cp-${style}`, value);
        }
    }

    setTab(tab) {
        this.state.activeTab = tab;
        this.noSelectionTab = tab === "theme" ? "theme" : "blocks";
    }

    updateInvisibleEls(isMobile = this.props.isMobile) {
        this.state.invisibleEls = [
            ...this.editor.editable.querySelectorAll(this.getInvisibleSelector(isMobile)),
        ];
    }
}

registry.category("lazy_components").add("website.BuilderConfigurator", WebsiteBuilderConfigurator);
