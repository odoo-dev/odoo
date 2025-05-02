import { Component, useEffect, useRef, useState } from "@odoo/owl";
import {
    useVisibilityObserver,
    useApplyVisibility,
    basicContainerBuilderComponentProps,
    useBuilderComponent,
} from "../utils";
import { BuilderComponent } from "./builder_component";
import { uniqueId } from "@web/core/utils/functions";

export class BuilderRow extends Component {
    get el() {
        return this.__owl__.refs?.root || null;
    }
    static template = "html_builder.BuilderRow";
    static components = { BuilderComponent };
    static props = {
        ...basicContainerBuilderComponentProps,
        label: { type: String, optional: true },
        tooltip: { type: String, optional: true },
        slots: { type: Object, optional: true },
        level: { type: Number, optional: true },
        expand: { type: Boolean, optional: true },
    };
    static defaultProps = { expand: false };

    setup() {
        useBuilderComponent();
        useVisibilityObserver("content", useApplyVisibility("root"));

        this.state = useState({
            expanded: this.props.expand,
            tooltip: this.props.tooltip,
            hasCollapseContent: false
        });

        if (this.props.slots.collapse) {
            useVisibilityObserver("collapse-content", useApplyVisibility("collapse"));

            this.collapseContentId = uniqueId("builder_collapse_content_");

            // Listen for events from other BuilderRow components
            this.env.editorBus.addEventListener("COLLAPSE_CONTENT_SHOWN", (ev) => {
                // Skip if this is the component that triggered the event
                if (ev.detail.id === this.collapseContentId) {
                    return;
                }

                // Don't close if this is a parent of the component that triggered the event
                const isParentOfTriggered = ev.detail.parentIds &&
                                           ev.detail.parentIds.includes(this.collapseContentId);

                // Close this only if it's not a parent of the triggered component
                if (this.state.expanded && !isParentOfTriggered) {
                    this.hideCollapseContent();
                }
            });
        }

        this.labelRef = useRef("label");
        this.collapseContentRef = useRef("collapse-content");

        useEffect(
            (labelEl) => {
                if (!this.state.tooltip && labelEl && labelEl.clientWidth < labelEl.scrollWidth) {
                    this.state.tooltip = this.props.label;
                }
            },
            () => [this.labelRef.el]
        );

        // Check if collapse content is empty (ignoring the close button and hidden elements)
        useEffect(
            (collapseContentEl) => {
                if (collapseContentEl && this.props.slots.collapse) {
                    // Get all direct children that are elements (not text nodes)
                    const children = Array.from(collapseContentEl.children);

                    // Filter out the close button and any elements with d-none class
                    const visibleChildren = children.filter(node => {
                        // Skip the close button
                        if (node.classList && node.classList.contains('btn-close')) {
                            return false;
                        }

                        // Skip hidden elements
                        if (node.classList && node.classList.contains('d-none')) {
                            return false;
                        }

                        return true;
                    });

                    this.state.hasCollapseContent = visibleChildren.length > 0;
                }
            },
            () => [this.collapseContentRef.el]
        );
    }

    getLevelClass() {
        return this.props.level ? `o_we_sublevel_${this.props.level}` : "";
    }

    // Handle field focus inside the row
    handleFieldFocus() {
        if (this.props.slots.collapse && !this.state.expanded && this.state.hasCollapseContent) {
            this.showCollapseContent();
        }
    }

    // Find all parent collapse IDs
    getParentCollapseIds() {
        const parents = [];
        // Find parent collapse containers
        let element = this.el;
        while (element) {
            // Look for parent collapse content
            const parentCollapseContent = element.closest('.hb-row-collapse-content');
            if (!parentCollapseContent) break;

            // Get the ID of the parent collapse
            const parentId = parentCollapseContent.id;
            if (parentId) {
                parents.push(parentId);
            }

            // Continue searching up the DOM
            element = parentCollapseContent.parentElement;
        }
        return parents;
    }

    // Show collapse content and notify other components
    showCollapseContent() {
        if (!this.state.expanded && this.state.hasCollapseContent) {
            this.state.expanded = true;

            // Get parent collapse IDs
            const parentIds = this.getParentCollapseIds();

            // Notify other BuilderRow instances with parent hierarchy info
            this.env.editorBus.trigger("COLLAPSE_CONTENT_SHOWN", {
                id: this.collapseContentId,
                parentIds: parentIds
            });
        }
    }

    // Hide collapse content
    hideCollapseContent() {
        if (this.state.expanded) {
            this.state.expanded = false;
        }
    }

    // Toggle collapse content (used for clicking on label or toggle button)
    toggleCollapseContent() {
        if (!this.state.hasCollapseContent) {
            return; // Do nothing if there's no content
        }

        if (this.state.expanded) {
            this.hideCollapseContent();
        } else {
            this.showCollapseContent();
        }
    }
}
