import { Plugin } from "@html_editor/plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { getElementHoveredEdge } from "@html_editor/utils/perspective_utils";

export class ResizePlugin extends Plugin {
    static id = "resize";
    static dependencies = ["history"];

    setup() {
        // Set up mouse event listeners for resize interactions.
        this.addDomListener(this.editable, "mousemove", this.onMouseMove);
        this.addDomListener(this.editable, "mousedown", this.onMouseDown);

        // Load resize configurations from plugin resources.
        this.resizeConfigs = this.getResource("resize_configs");

        // Build list of hover CSS classes from all resize configurations.
        this.hoverClasses = this.resizeConfigs
            .filter((resizeConfig) => resizeConfig.hoverClass)
            .map((resizeConfig) => resizeConfig.hoverClass);

        // Create CSS selector for all hover classes.
        this.hoverClassSelector = this.hoverClasses.length
            ? this.hoverClasses.map((cls) => "." + cls).join(", ")
            : null;

        // Precompute selectors and store them inside each config.
        for (const resizeConfig of this.resizeConfigs) {
            // Scoped selector for resizable elements.
            resizeConfig._containerScopedSelector = resizeConfig.resizableElementsSelector
                .split(",")
                .map((sel) => resizeConfig.parentContainerSelector + " " + sel.trim())
                .join(", ");

            // Precompute selectors for items without inline width/height.
            const resizableSelectors = resizeConfig.resizableElementsSelector
                .split(",")
                .map((sel) => sel.trim());

            resizeConfig._unsizedItemsSelector = {
                width: resizableSelectors.map((sel) => `${sel}:not([style*="width"])`).join(", "),
                height: resizableSelectors.map((sel) => `${sel}:not([style*="height"])`).join(", "),
            };
        }
    }

    /**
     * Remove hover CSS classes from previously highlighted resizable elements.
     *
     * @param {void}
     * @returns {void}
     */
    removeResizeHoverClasses() {
        if (!this.hoverClassSelector) {
            return;
        }
        this.editable
            .querySelectorAll(this.hoverClassSelector)
            .forEach((el) => el.classList.remove(...this.hoverClasses));
    }

    /**
     * Update the cursor style to indicate resize direction.
     *
     * @param {'col'|'row'|false} direction - resize direction/false to reset
     * @returns {void}
     */
    updateResizeCursor(direction) {
        const classList = this.editable.classList;
        // Remove previous resize cursor classes.
        classList.remove("o_col_resize", "o_row_resize");

        // Apply appropriate cursor based on resize direction.
        if (direction === "col") {
            classList.add("o_col_resize");
        } else if (direction === "row") {
            classList.add("o_row_resize");
        }
    }

    /**
     * Handle mouse down events to initiate resize operations.
     *
     * @param {MouseEvent} ev - The mouse down event
     * @returns {void}
     */
    onMouseDown(ev) {
        // Start resize if hovering a resizable element edge.
        if (!this.activeHover) {
            return;
        }

        const { resizableElement, resizeConfig, resizeEdge, direction } = this.activeHover;
        ev.preventDefault();

        const previousSibling = resizableElement.previousElementSibling;
        const nextSibling = resizableElement.nextElementSibling;

        let target1, target2;

        if (resizeEdge === "left" || resizeEdge === "top") {
            target1 = previousSibling;
            target2 = resizableElement;
        } else if (resizeEdge === "right" || resizeEdge === "bottom") {
            target1 = resizableElement;
            target2 = nextSibling;
        }
        if (direction === "col" && this.config.direction === "rtl") {
            // Swap targets for RTL column resizing.
            [target1, target2] = [target2, target1];
        }

        // Apply target resolver (e.g., first-row cell for table columns).
        if (resizeConfig.targetResolver) {
            target1 = resizeConfig.targetResolver(target1);
            target2 = resizeConfig.targetResolver(target2);
        }

        this.isResizingElement = true;
        const handleResize = (ev) =>
            this.handleResize(ev, direction, resizeConfig, target1, target2);
        const endResizeOperation = (ev) => {
            ev.preventDefault();
            this.isResizingElement = false;
            this.updateResizeCursor(false);
            this.dependencies.history.addStep();
            this.document.removeEventListener("mousemove", handleResize);
            this.document.removeEventListener("mouseup", endResizeOperation);
            this.document.removeEventListener("mouseleave", endResizeOperation);
        };

        // Set up global event listeners for resize operation.
        this.document.addEventListener("mousemove", handleResize);
        this.document.addEventListener("mouseup", endResizeOperation);
        this.document.addEventListener("mouseleave", endResizeOperation);
    }

    /**
     * Handle mouse move events to detect hover over resizable element edges.
     *
     * @param {MouseEvent} ev - The mouse move event
     * @returns {void}
     */
    onMouseMove(ev) {
        // Ignore mouse movements during an active resize or when the mouse
        // is still over the same element.
        if (this.isResizingElement) {
            return;
        }

        // Reset active hover state and clear any existing hover classes.
        this.activeHover = null;
        this.removeResizeHoverClasses();

        for (const resizeConfig of this.resizeConfigs) {
            const resizableElement = closestElement(
                ev.target,
                resizeConfig._containerScopedSelector
            );
            if (!resizableElement) {
                continue;
            }

            // Apply hover visual.
            if (resizeConfig.hoverClass) {
                resizableElement.classList.add(resizeConfig.hoverClass);
            }

            // Determine which edge of the element is being hovered for resizing.
            const resizeEdge = getElementHoveredEdge(ev, resizableElement);
            if (resizeEdge && resizeConfig.allowedEdges.includes(resizeEdge)) {
                // Store active hover information for potential resize operation.
                this.activeHover = {
                    resizableElement,
                    resizeConfig,
                    resizeEdge,
                    direction: resizeEdge === "left" || resizeEdge === "right" ? "col" : "row",
                };
                break;
            }
        }
        // Update cursor to indicate resize based on hover direction.
        this.updateResizeCursor(this.activeHover?.direction || false);
    }

    /**
     * Handle the actual resize operation during mouse movement.
     *
     * @param {MouseEvent} ev - The mouse move event during resize
     * @param {'col'|'row'} direction - The resize direction
     * @param {Object} resizeConfig - The resize configuration object
     * @param {HTMLElement} target1 - The first resize target element
     * @param {HTMLElement} target2 - The second resize target element
     * @returns {void}
     */
    handleResize(ev, direction, resizeConfig, target1, target2) {
        // Determine resize position: first, middle, or last element.
        const position = target1 ? (target2 ? "middle" : "last") : "first";
        let [item, neighbor] = [target1 || target2, target2];

        // Find the container element that holds the resizable items
        const resizeContainer = closestElement(item, resizeConfig.parentContainerSelector);
        const [sizeProp, positionProp, clientPositionProp] =
            direction === "col" ? ["width", "x", "clientX"] : ["height", "y", "clientY"];
        const isRTL = this.config.direction === "rtl";

        // Width operations: preserve container width to maintain layout.
        if (sizeProp === "width") {
            const resizeContainerRect = resizeContainer.getBoundingClientRect();
            resizeContainer.style[sizeProp] = resizeContainerRect[sizeProp] + "px";
        }

        // Find elements without explicit size styling and set their current
        // computed size.
        for (const unsizedItem of resizeContainer.querySelectorAll(
            resizeConfig._unsizedItemsSelector[sizeProp]
        )) {
            unsizedItem.style[sizeProp] = unsizedItem.getBoundingClientRect()[sizeProp] + "px";
        }

        // RTL adjustment: swap elements for consistent resize logic.
        if (direction === "col" && isRTL && position === "middle") {
            [item, neighbor] = [neighbor, item];
        }

        const minSize = resizeConfig.minSize;

        switch (position) {
            case "first": {
                // Resizing the first element (may affect container margins).
                const marginProp =
                    direction === "col" ? (isRTL ? "marginRight" : "marginLeft") : "marginTop";
                const itemRect = item.getBoundingClientRect();
                const parentStyle = getComputedStyle(resizeContainer);
                const currentMargin = parseFloat(parentStyle[marginProp]) || 0;
                let sizeDelta = itemRect[positionProp] - ev[clientPositionProp];
                if (direction === "col" && isRTL) {
                    // RTL adjustment: reverse the delta calculation.
                    sizeDelta =
                        ev[clientPositionProp] - itemRect[positionProp] - itemRect[sizeProp];
                }

                const newMargin = currentMargin - sizeDelta;
                const currentSize = itemRect[sizeProp];
                const newSize = currentSize + sizeDelta;
                if (newMargin >= 0 && newSize > minSize) {
                    const resizeContainerRect = resizeContainer.getBoundingClientRect();
                    // Update container margin and element size.
                    resizeContainer.style.cssText += ` ${marginProp
                        .replace(/([A-Z])/g, "-$1")
                        .toLowerCase()}: ${newMargin}px !important;`;
                    item.style[sizeProp] = newSize + "px";

                    // Adjust container width for column resizing to maintain
                    // total size.
                    if (sizeProp === "width") {
                        resizeContainer.style[sizeProp] =
                            resizeContainerRect[sizeProp] + sizeDelta + "px";
                    }
                }
                break;
            }
            case "middle": {
                // Resizing middle element (affects both item and neighbor).
                const [itemRect, neighborRect] = [
                    item.getBoundingClientRect(),
                    neighbor.getBoundingClientRect(),
                ];

                const currentSize = itemRect[sizeProp];
                const newSize = ev[clientPositionProp] - itemRect[positionProp];

                const editableStyle = getComputedStyle(this.editable);
                const sizeDelta = newSize - currentSize;
                const currentNeighborSize = neighborRect[sizeProp];
                const newNeighborSize = currentNeighborSize - sizeDelta;

                const maxWidth =
                    this.editable.clientWidth -
                    parseFloat(editableStyle.paddingLeft) -
                    parseFloat(editableStyle.paddingRight);
                const resizeContainerRect = resizeContainer.getBoundingClientRect();

                if (
                    newSize > minSize &&
                    // Allow resizing if:
                    // - this is a row resize (rows don't shrink the neighbor),
                    // - OR the neighbor would stay above its minimum size,
                    // - OR the container would fit inside editable area.
                    (direction === "row" ||
                        newNeighborSize > minSize ||
                        resizeContainerRect[sizeProp] + sizeDelta < maxWidth)
                ) {
                    item.style[sizeProp] = newSize + "px";

                    if (direction === "col") {
                        // For columns, adjust neighbor size or maintain
                        // current if below minimum.
                        neighbor.style[sizeProp] =
                            (newNeighborSize > minSize ? newNeighborSize : currentNeighborSize) +
                            "px";
                    }
                }
                break;
            }
            case "last": {
                // Resizing the last element in container.
                const itemRect = item.getBoundingClientRect();
                let sizeDelta =
                    ev[clientPositionProp] - (itemRect[positionProp] + itemRect[sizeProp]);
                if (direction === "col" && isRTL) {
                    // RTL adjustment for last element.
                    sizeDelta = itemRect[positionProp] - ev[clientPositionProp];
                }
                const currentSize = itemRect[sizeProp];
                const newSize = currentSize + sizeDelta;

                if ((newSize >= 0 || direction === "row") && newSize > minSize) {
                    const resizeContainerRect = resizeContainer.getBoundingClientRect();
                    if (sizeProp === "width") {
                        // Adjust container width to adapt element size change.
                        resizeContainer.style[sizeProp] =
                            resizeContainerRect[sizeProp] + sizeDelta + "px";
                    }
                    item.style[sizeProp] = newSize + "px";
                }
                break;
            }
        }
    }
}
