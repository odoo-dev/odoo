import { Plugin } from "@html_editor/plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";

export const MIN_WIDTH_PX = 200; // Minimum allowed width for a column.
const OVERLAY_WIDTH = 6; // Width of the visual resize handle.
const SCROLL_ZONE = 25; // Distance from container edge to start auto-scroll.
const SCROLL_SPEED = 15; // Pixels to scroll per frame when near edge.

export class ColumnResizePlugin extends Plugin {
    static id = "columnResize";
    static dependencies = ["history", "localOverlay"];

    setup() {
        // References to current active column & resize state.
        this.activeColumn = null;
        this.resizingData = null;
        this.rafId = null;

        // Create a local overlay to show the resize handle.
        this.columnResizeOverlay = this.dependencies.localOverlay.makeLocalOverlay(
            "oe-column-resize-overlay"
        );
        this.columnResizeHandle = this.document.createElement("div");
        this.columnResizeHandle.className = `o_we_column_resize_handle d-none`;
        this.columnResizeOverlay.append(this.columnResizeHandle);

        this.addDomListener(this.columnResizeHandle, "pointerdown", this.onPointerDown);
        this.addDomListener(this.document, "pointermove", this.onPointerMove);
        this.addDomListener(this.document, "pointerup", this.onPointerUp);
    }

    /**
     * Position the visible resize handle right to the active column.
     */
    positionColumnResizeHandle(column) {
        const rect = column.getBoundingClientRect();
        const style = this.columnResizeHandle.style;
        style.top = `${rect.top}px`;
        style.left = `${rect.right - OVERLAY_WIDTH}px`;
        style.height = `${rect.height}px`;
        style.width = `${OVERLAY_WIDTH}px`;
        this.columnResizeHandle.classList.remove("d-none");
    }

    /**
     * Hide the resize handle when not hovering a resizable column.
     */
    hideColumnResizeHandle() {
        this.columnResizeHandle.classList.add("d-none");
        this.activeColumn = null;
    }

    /**
     * Triggered when user presses down on the resize handle.
     * Captures the initial sizes and references for the resize operation.
     */
    onPointerDown(ev) {
        if (!this.activeColumn) {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();

        const column = this.activeColumn;
        const row = closestElement(column, ".row");

        // Store initial state for width calculation during drag.
        this.resizingData = {
            startX: ev.clientX,
            row,
            column,
            neighborColumn: column.nextElementSibling,
            initialColumnWidth: column.offsetWidth,
            initialNeighborColumnWidth: column.nextElementSibling?.offsetWidth || 0,
            initialRowWidth: row.offsetWidth,
            scrollContainer: row.parentElement,
        };
    }

    /**
     * Handles showing the resize handle on hover
     * and continuous resize updates when dragging.
     */
    onPointerMove(ev) {
        // If resizing is active, update column
        // widths via RAF for smooth animation.
        if (this.resizingData) {
            this.lastClientX = ev.clientX;
            if (!this.rafId) {
                this.rafId = requestAnimationFrame(() => {
                    this.resizeColumn(this.lastClientX);
                    this.rafId = null;
                });
            }
            return;
        }

        // Prevent triggering handle reposition when hovering on it.
        if (this.activeColumn && ev.target.closest?.(".o_we_column_resize_handle")) {
            return;
        }

        const column = closestElement(ev.target, "div[class^='col-']");
        if (column && column !== this.activeColumn && this.editable.contains(column)) {
            this.activeColumn = column;
            this.positionColumnResizeHandle(column);
        } else if (!column && this.activeColumn) {
            this.hideColumnResizeHandle();
        }
    }

    /**
     * Cleanup after resizing is finished.
     * Adds a history step.
     */
    onPointerUp() {
        if (!this.resizingData) {
            return; // Skip if no resize was happening.
        }
        this.resizingData = null;
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.dependencies.history.addStep();
        this.hideColumnResizeHandle();
    }

    /**
     * Adjusts widths of current column and neighbor (or row if last column).
     */
    resizeColumn(clientX) {
        const resizingData = this.resizingData;
        if (!resizingData) {
            return;
        }

        const {
            startX,
            row,
            column,
            neighborColumn,
            initialRowWidth,
            initialColumnWidth,
            initialNeighborColumnWidth,
            scrollContainer,
        } = resizingData;
        let deltaX = clientX - startX;

        // Horizontal auto-scroll when dragging near container edge.
        this.handleAutoScroll(clientX, scrollContainer);

        if (!row.style.width) {
            row.style.width = `${initialRowWidth}px`;
            [...row.children].forEach((col) => {
                col.style.width = `${initialColumnWidth}px`;
            });
        }

        // Calculate new widths based on pointer movement.
        let newColumnWidth = initialColumnWidth + deltaX;
        // Enforce minimum column width.
        if (newColumnWidth < MIN_WIDTH_PX) {
            newColumnWidth = MIN_WIDTH_PX;
            deltaX = newColumnWidth - initialColumnWidth;
        }

        if (neighborColumn) {
            // Adjust neighbor column width to maintain total row width.
            let newNeighborColumnWidth = initialNeighborColumnWidth - deltaX;
            // Ensure neighboring column also maintains minimum width.
            if (newNeighborColumnWidth < MIN_WIDTH_PX) {
                newNeighborColumnWidth = MIN_WIDTH_PX;
                deltaX = initialNeighborColumnWidth - MIN_WIDTH_PX;
                newColumnWidth = initialColumnWidth + deltaX;
            }
            neighborColumn.style.width = `${newNeighborColumnWidth}px`;
        } else {
            // If last column then expand/shrink row width directly.
            row.style.width = `${initialRowWidth + deltaX}px`;
        }
        column.style.width = `${newColumnWidth}px`;
        this.positionColumnResizeHandle(column);
    }

    /**
     * Automatically scroll the container when resizing near its edges.
     */
    handleAutoScroll(pointerX, container) {
        const rect = container.getBoundingClientRect();
        if (pointerX > rect.right - SCROLL_ZONE) {
            container.scrollLeft += SCROLL_SPEED;
        }
    }
}
