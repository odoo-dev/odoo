import { Plugin } from "@html_editor/plugin";
import { withSequence } from "@html_editor/utils/resource";
import { Component, xml, useRef } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";
import { registry } from "@web/core/registry";
import { HighlightConfigurator } from "./highlight_configurator";
import { StackingComponent, useStackingComponentState } from "./stacking_component";
import { formatsSpecs } from "@html_editor/utils/formatting";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { switchTextHighlight } from "@html_builder/utils/highlight_utils";
import { removeStyle } from "@html_editor/utils/dom";

export class HighlightPlugin extends Plugin {
    static id = "highlight";
    static dependencies = ["history", "selection", "split", "format"];
    resources = {
        toolbar_groups: [
            withSequence(50, { id: "websiteDecoration" }),
            withSequence(1, { id: "high" }),
        ],
        user_commands: [
            {
                id: "circle",
                icon: "fa-circle",
                run: () => this._applyHighlight("circle_1"),
            },
            {
                id: "square",
                icon: "fa-square",
                run: () => this._applyHighlight("diagonal"),
            },
            {
                id: "wavy",
                icon: "fa-square",
                run: () => this._applyHighlight("wavy"),
            },
        ],
        toolbar_items: [
            {
                id: "highlight",
                groupId: "websiteDecoration",
                description: _t("Apply highlight"),
                Component: HighlightToolbarButton,
                props: {
                    applyHighlight: this.applyHighlight.bind(this),
                    previewHighlight: this.previewHighlight.bind(this),
                    applyHighlightResetPreview: this.resetHighlightPreview.bind(this),
                },
            },
            {
                id: "highlight2",
                namespaces: ["compact", "expanded"],
                groupId: "high",
                commandId: "circle",
            },
            {
                id: "highlight3",
                namespaces: ["compact", "expanded"],
                groupId: "high",
                commandId: "square",
            },
            {
                id: "highlight4",
                namespaces: ["compact", "expanded"],
                groupId: "high",
                commandId: "wavy",
            },
        ],
        clean_for_save_handlers: ({ root }) => {
            for (const svg of root.querySelectorAll(".o_text_highlight_svg")) {
                svg.remove();
            }
        },
        /**
         * @param {MutationRecord} mutationRecord
         */
        savable_mutation_record_predicates: (mutationRecord) =>
            ![...mutationRecord.addedNodes, ...mutationRecord.removedNodes].some((node) => {
                const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
                return element && element.closest(".o_text_highlight_svg");
            }),
        normalize_handlers: (root) => {
            // Remove highlight SVGs when the text is removed.
            for (const svg of root.querySelectorAll(".o_text_highlight_svg")) {
                if (!svg.closest("[data-highlight-text]")) {
                    svg.remove();
                }
            }
        },
    };

    setup() {
        this.previewableApplyHighlight = this.dependencies.history.makePreviewableOperation(
            this._applyHighlight.bind(this)
        );
    }

    _applyHighlight(highlightId) {
        const highlightedNodes = new Set(
            this.dependencies.selection
                .getSelectedNodes()
                .map((n) => {
                    const el = n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement;
                    return el.closest("[data-highlight-text]");
                })
                .filter(Boolean)
        );
        for (const node of highlightedNodes) {
            for (const svg of node.querySelectorAll(".o_text_highlight_svg")) {
                svg.remove();
            }
        }
        this.dependencies.format.formatSelection("highlight", {
            formatProps: { highlightId },
            applyStyle: true,
        });
    }
    applyHighlight(highlightId) {
        this.previewableApplyHighlight.commit(highlightId);
    }
    previewHighlight(highlightId) {
        this.previewableApplyHighlight.preview(highlightId);
    }
    resetHighlightPreview() {
        this.previewableApplyColor.revert();
    }
}
registry.category("website-plugins").add(HighlightPlugin.id, HighlightPlugin);

// Todo: formatsSpecs should allow to be register new formats through resources.
formatsSpecs.highlight = {
    isFormatted: (node) => {
        const ret = !!closestElement(node)?.getAttribute("data-highlight-text");
        console.info(`isFormatted: ` + ret);
        return ret;
    },
    hasStyle: (node) => {
        const ret = closestElement(node)?.getAttribute("data-highlight-text");
        return ret;
    },
    addStyle: (node, { highlightId }) => {
        console.info(`addStyle: ${highlightId}`);
        node.dispatchEvent(new Event("text_highlight_added", { bubbles: true }));
        node.setAttribute("data-highlight-text", highlightId);
    },
    removeStyle: (node) => {
        node.removeAttribute("data-highlight-text");
        removeStyle(node, "--text-highlight-width");
    },
};

class HighlightToolbarButton extends Component {
    static template = xml`
        <button t-ref="root" class="btn btn-light" t-on-click="openHighlightConfigurator">
            <i class="fa oi oi-text-effect oi-fw py-1"/>
        </button>
    `;

    setup() {
        this.root = useRef("root");
        this.componentStack = useStackingComponentState();
        this.componentStack.push(HighlightConfigurator, {
            componentStack: this.componentStack,
            ...this.props,
        });
        this.configuratorPopover = usePopover(StackingComponent, {
            onClose: () => {
                while (this.componentStack.stack.length > 1) {
                    this.componentStack.pop();
                }
            },
        });
    }
    openHighlightConfigurator() {
        this.configuratorPopover.open(this.root.el, {
            stackState: this.componentStack,
        });
    }
}
