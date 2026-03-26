import { closestElement } from "@html_editor/utils/dom_traversal";
import { getColumnIndex, getRowIndex } from "@html_editor/utils/table";
import { Component, useRef, useExternalListener, onMounted, onWillUnmount } from "@odoo/owl";

const OVERLAY_CLAMP_OFFSET = 5;

export class TableDragDrop extends Component {
    static template = "html_editor.TableDragDrop";
    static props = {
        type: String,
        pointerPos: Object,
        target: { validate: (el) => el.nodeType === Node.ELEMENT_NODE },
        document: { validate: (p) => p.nodeType === Node.DOCUMENT_NODE },
        editable: { validate: (p) => p.nodeType === Node.ELEMENT_NODE },
        close: Function,
        moveRow: Function,
        moveColumn: Function,
    };

    setup() {
        this.overlayRef = useRef("dragOverlay");
        let frameRect = { top: 0, left: 0 };
        let frameElement;
        try {
            frameElement = this.props.document.defaultView.frameElement;
        } catch {
            // We don't access the frameElement if we don't have access to it.
            // (i.e. iframe origin or sandbox restriction)
        }
        if (frameElement) {
            frameRect = frameElement.getBoundingClientRect();
        }
        this.frameRect = frameRect;
        this.pointerPos = { ...this.props.pointerPos };
        this.tableElement = closestElement(this.props.target, "table");
        this.tableRect = this.getFrameRect(this.tableElement, frameRect);
        const targetRect =
            this.props.type === "row"
                ? this.getFrameRect(this.props.target.parentElement, frameRect)
                : this.getFrameRect(this.props.target, frameRect);
        this.overlayRect = {
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: this.props.type === "row" ? targetRect.height : this.tableRect.height,
        };
        // Compute bounding rects of rows or column cells
        this.itemRects =
            this.props.type === "row"
                ? [...this.tableElement.rows].map((r) => this.getFrameRect(r, frameRect))
                : [...this.props.target.parentElement.cells].map((c) =>
                      this.getFrameRect(c, frameRect)
                  );

        useExternalListener(this.props.document, "pointermove", this.onPointerMove);
        useExternalListener(this.props.document, "pointerup", this.onPointerUp);
        if (this.props.document !== document) {
            // Listen outside the iframe.
            useExternalListener(document, "pointermove", this.onPointerMove);
            useExternalListener(document, "pointerup", this.onPointerUp);
        }

        onMounted(() => {
            this.props.editable.classList.add("o-we-table-dragging");
            if (this.overlayRef.el) {
                Object.assign(this.overlayRef.el.style, {
                    top: `${this.overlayRect.top}px`,
                    left: `${this.overlayRect.left}px`,
                    width: `${this.overlayRect.width}px`,
                    height: `${this.overlayRect.height}px`,
                });
            }
        });

        onWillUnmount(() => {
            this.props.editable.classList.remove("o-we-table-dragging");
            this.clearBorderHighlights();
        });
    }

    clearBorderHighlights() {
        // Determine which highlight classes to remove.
        const highlightClasses = [
            "tr-highlight-top",
            "tr-highlight-bottom",
            "td-highlight-left",
            "td-highlight-right",
        ];
        const highlightedElements = this.tableElement.querySelectorAll(
            highlightClasses.map((cls) => `.${cls}`).join(", ")
        );
        // Remove the highlight classes.
        highlightedElements.forEach((el) => el.classList.remove(...highlightClasses));
    }

    getInsertPosition() {
        // Calculate overlay middle(vertical for row, horizontal for column)
        const overlayMiddle =
            this.props.type === "row"
                ? this.overlayRect.top + this.overlayRect.height / 2
                : this.overlayRect.left + this.overlayRect.width / 2;
        // Index of target row/column where overlay is currently positioned
        const targetIndex = this.itemRects.findIndex((rect) =>
            this.props.type === "row"
                ? rect.top <= overlayMiddle && overlayMiddle <= rect.bottom
                : rect.left <= overlayMiddle && overlayMiddle <= rect.right
        );
        // Calculate the middle of the target row/column
        const targetMiddle =
            this.props.type === "row"
                ? this.itemRects[targetIndex].top + this.itemRects[targetIndex].height / 2
                : this.itemRects[targetIndex].left + this.itemRects[targetIndex].width / 2;

        // Determine whether to insert before or after the target
        // Insert before if overlay middle is left, else after
        return { targetIndex, insertBefore: overlayMiddle < targetMiddle };
    }

    onPointerMove(ev) {
        // Calculate min and max positions for overlay to
        // prevent it from going outside the table bounds
        const min =
            this.props.type === "row"
                ? this.tableRect.top - this.overlayRect.height / 2 + OVERLAY_CLAMP_OFFSET
                : this.tableRect.left - this.overlayRect.width / 2 + OVERLAY_CLAMP_OFFSET;
        const max =
            this.props.type === "row"
                ? this.tableRect.bottom - this.overlayRect.height / 2 - OVERLAY_CLAMP_OFFSET
                : this.tableRect.right - this.overlayRect.width / 2 - OVERLAY_CLAMP_OFFSET;
        // Update overlay position on pointer movement, clamped within min/max
        let top;
        const { clientX, clientY } = this.getFramePoint(ev);
        if (this.props.type === "row") {
            top = Math.min(max, Math.max(min, this.overlayRect.top + clientY - this.pointerPos.y));
        } else {
            this.overlayRect.left = Math.min(
                max,
                Math.max(min, this.overlayRect.left + clientX - this.pointerPos.x)
            );
        }
        this.overlayRect.top = top;
        this.clearBorderHighlights();
        const { targetIndex, insertBefore } = this.getInsertPosition();
        // Highlight the target row or column
        if (this.props.type === "row") {
            const targetRow = this.tableElement.rows[targetIndex];
            targetRow.classList.add(insertBefore ? "tr-highlight-top" : "tr-highlight-bottom");
        } else {
            [...this.tableElement.rows].forEach((row) => {
                const targetCell = row.cells[targetIndex];
                targetCell.classList.add(insertBefore ? "td-highlight-left" : "td-highlight-right");
            });
        }
        // Apply updated overlay position to the overlay element
        const overlayStyle = this.overlayRef.el.style;
        overlayStyle.top = `${this.overlayRect.top}px`;
        overlayStyle.left = `${this.overlayRect.left}px`;
        // Update stored pointer position for next move
        this.pointerPos.x = clientX;
        this.pointerPos.y = clientY;
    }

    onPointerUp() {
        this.clearBorderHighlights();

        let { targetIndex, insertBefore } = this.getInsertPosition();
        const draggedIndex =
            this.props.type === "row"
                ? getRowIndex(this.props.target.parentElement)
                : getColumnIndex(this.props.target);
        if (draggedIndex > targetIndex && !insertBefore) {
            // Moving upward or leftward
            targetIndex += 1;
        } else if (draggedIndex < targetIndex && insertBefore) {
            // Moving downward or rightward
            targetIndex -= 1;
        }

        if (this.props.type === "row") {
            this.props.moveRow(targetIndex, this.props.target.parentElement);
        } else {
            this.props.moveColumn(targetIndex, this.props.target);
        }
        // Close overlay after drop
        this.props.close();
    }

    getFrameRect(el, frameRect) {
        let rect = el.getBoundingClientRect();
        rect = {
            ...rect,
            top: rect.top + frameRect.top,
            bottom: rect.bottom + frameRect.top,
            left: rect.left + frameRect.left,
            right: rect.right + frameRect.left,
            height: rect.height,
            width: rect.width,
        };
        return rect;
    }

    getFramePoint(ev) {
        let clientX = ev.clientX;
        let clientY = ev.clientY;
        if (ev.target.ownerDocument === this.props.document) {
            clientX += this.frameRect.left;
            clientY += this.frameRect.top;
        }
        return { clientX, clientY };
    }
}
