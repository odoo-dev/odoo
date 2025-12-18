import { Plugin } from "@html_editor/plugin";
import { getActiveHotkey } from "@web/core/hotkeys/hotkey_service";
import { getDeepestPosition } from "@html_editor/utils/dom_info";
import { DIRECTIONS, nodeSize } from "@html_editor/utils/position";
import { closestElement } from "@html_editor/utils/dom_traversal";

export class BuilderSelectionRestrictionPlugin extends Plugin {
    static id = "builderSelectionRestriction";
    static dependencies = ["selection", "operation", "builderOptions"];

    resources = {
        // uncrossable_element_selector: CSS selectors of elements that should not be
        // crossed by the selection.
        uncrossable_element_selector: ["blockquote", "form", "div", "section", ".alert", ".row"],
        // restricted_to_paragraph_blocks_selector: CSS selectors of elements that
        // the selection should be restricted to paragraph blocks.
        restricted_to_paragraph_blocks_selector: ["BLOCKQUOTE"],
    };

    setup() {
        this.uncrossableSelectors = [
            ...new Set(this.getResource("uncrossable_element_selector")),
        ].join(", ");
        this.restrictedToPSelectors = [
            ...new Set(this.getResource("restricted_to_paragraph_blocks_selector")),
        ].join(", ");

        // Check if the selection has been corrected to avoid multiple
        // corrections.
        this.isSelectionCorrected = false;

        this.addDomListener(this.editable, "keydown", (ev) => {
            if (getActiveHotkey(ev) !== "control+a") {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            this.onCtrlAKeydown();
        });
        this.addDomListener(this.document, "mouseup", this.restrictSelectionInClosestDiv);
        this.addDomListener(this.document, "touchend", this.restrictSelectionInClosestDiv);

        // doing this manually instead of using addDomListener. This is because
        // addDomListener will ignore all events from protected targets. But in
        // our case, we still want to update the containers.
        this.onClick = this.onClick.bind(this);
        this.editable.addEventListener("click", this.onClick, { capture: true });
    }

    destroy() {
        this.editable.removeEventListener("click", this.onClick, { capture: true });
    }

    /**
     * Activates the options of the clicked element.
     * Note: if the selection was corrected, the click is ignored, as the
     * selection already managed it.
     */
    onClick(ev) {
        this.dependencies.operation.next(() => {
            if (this.isSelectionCorrected) {
                this.isSelectionCorrected = false;
                return;
            }
            this.dependencies.builderOptions.updateContainers(ev.target);
        });
    }

    /**
     * Manages the selection made with the "Control + A" key.
     */
    onCtrlAKeydown() {
        const { editableSelection, currentSelectionIsInEditable } =
            this.dependencies.selection.getSelectionData();
        const { anchorNode, commonAncestorContainer } = editableSelection;
        if (
            !currentSelectionIsInEditable ||
            // If we clicked on an image inside a <figure> element, keep the
            // selection on the image only, to not select the whole <figure>.
            commonAncestorContainer.nodeName === "FIGURE" ||
            // When main body is empty, and click the footer outer blue
            // container then ctrl+a, the selection is collapsed in editable but
            // to the main body div, which causes options updating.
            (anchorNode.isContentEditable === false && editableSelection.isCollapsed)
        ) {
            return;
        }
        const closestSpecialBlock = closestElement(anchorNode, this.restrictedToPSelectors);
        const closestDiv = closestElement(anchorNode, "div");

        // If the closest special block doesn't contains the closest div block,
        // we select the paragraph, otherwise we select the whole closest div
        // block.
        if (closestSpecialBlock && !closestSpecialBlock.contains(closestDiv)) {
            this.selectAllInElement(closestElement(anchorNode, "p"));
        } else {
            this.selectAllInElement(closestDiv);
        }
    }

    // We extend the selection to the whole element step by step to properly
    // handle uncrossable elements (like row, blockquote...).
    selectAllInElement(element) {
        let selection = this.dependencies.selection.getEditableSelection();
        let { anchorNode, anchorOffset, focusNode, focusOffset, direction } = selection;

        const [newAnchorNode, newAnchorOffset] = getDeepestPosition(element, 0);
        const [newFocusNode, newFocusOffset] = getDeepestPosition(element, nodeSize(element));
        if (direction === DIRECTIONS.RIGHT) {
            this.dependencies.selection.setSelection({
                anchorNode: focusNode,
                anchorOffset: focusOffset,
                focusNode: newAnchorNode,
                focusOffset: newAnchorOffset,
            });
        } else {
            this.dependencies.selection.setSelection({
                anchorNode: anchorNode,
                anchorOffset: anchorOffset,
                focusNode: newAnchorNode,
                focusOffset: newAnchorOffset,
            });
        }
        this.correctSelectionOnUncrossable();
        selection = this.dependencies.selection.getEditableSelection();
        ({ focusNode, focusOffset } = selection);
        this.dependencies.selection.setSelection({
            anchorNode: focusNode,
            anchorOffset: focusOffset,
            focusNode: newFocusNode,
            focusOffset: newFocusOffset,
        });
        this.correctSelectionOnUncrossable();
    }

    restrictSelectionInElement(selection, block) {
        const { anchorNode, anchorOffset, focusNode, direction } = selection;
        const isFocusInBlock = block.contains(focusNode);

        if (!isFocusInBlock) {
            let focusNode, focusOffset;
            if (direction === DIRECTIONS.RIGHT) {
                [focusNode, focusOffset] = getDeepestPosition(block, nodeSize(block));
            } else {
                [focusNode, focusOffset] = getDeepestPosition(block, 0);
            }
            this.dependencies.selection.setSelection({
                anchorNode,
                anchorOffset,
                focusNode,
                focusOffset,
            });
        }
        this.correctSelectionOnUncrossable();
    }

    restrictSelectionInClosestDiv(ev) {
        const { editableSelection, currentSelectionIsInEditable } =
            this.dependencies.selection.getSelectionData();
        const { anchorNode } = editableSelection;
        if (!currentSelectionIsInEditable) {
            return;
        }
        if (editableSelection.isCollapsed) {
            return;
        }

        const closestSpecialBlock = closestElement(anchorNode, this.restrictedToPSelectors);
        const closestDiv = closestElement(anchorNode, "div");

        if (closestSpecialBlock && !closestSpecialBlock.contains(closestDiv)) {
            const closestParagraph = closestElement(anchorNode, "p");
            this.restrictSelectionInElement(editableSelection, closestParagraph);
        } else {
            this.restrictSelectionInElement(editableSelection, closestDiv);
        }
    }

    isNodeSelectionUncrossable(node, selectedNodes) {
        return (
            node.matches(this.uncrossableSelectors) ||
            selectedNodes.includes(closestElement(node, this.uncrossableSelectors))
        );
    }

    correctSelectionOnUncrossable() {
        const selection = this.dependencies.selection.getEditableSelection();
        const { anchorNode, anchorOffset, focusNode, direction } = selection;
        const selectedNodes = this.dependencies.selection
            .getTargetedNodes(selection)
            .filter((node) => node.nodeType === Node.ELEMENT_NODE);
        const selectedNodesLooping =
            direction === DIRECTIONS.RIGHT ? selectedNodes : selectedNodes.reverse();

        // Do not do selection correction if
        // 1. the only selected node is an image cause we force the selection to
        // be around the image when clicking on it, correction would break the
        // option container for images
        // 2. icon elements (i.fa, span.fa...).
        if (
            selectedNodesLooping.length === 1 &&
            (selectedNodesLooping[0].tagName === "IMG" ||
                selectedNodesLooping[0].classList?.contains("fa"))
        ) {
            return;
        }

        let temperaryFocusNode;
        for (const node of selectedNodesLooping) {
            if (this.isNodeSelectionUncrossable(node, selectedNodesLooping)) {
                if (node.contains(anchorNode) && node.contains(focusNode)) {
                    break;
                } else if (!node.contains(anchorNode)) {
                    let focusNode, focusOffset;
                    if (direction === DIRECTIONS.RIGHT) {
                        temperaryFocusNode = node.previousElementSibling
                            ? node.previousElementSibling
                            : temperaryFocusNode;
                        [focusNode, focusOffset] = getDeepestPosition(
                            temperaryFocusNode,
                            nodeSize(temperaryFocusNode)
                        );
                    } else {
                        temperaryFocusNode = node.nextElementSibling
                            ? node.nextElementSibling
                            : temperaryFocusNode;
                        [focusNode, focusOffset] = getDeepestPosition(temperaryFocusNode, 0);
                    }

                    const currentSelection = this.dependencies.selection.setSelection({
                        anchorNode,
                        anchorOffset,
                        focusNode,
                        focusOffset,
                    });
                    this.dependencies.builderOptions.updateContainers(
                        closestElement(currentSelection.commonAncestorContainer)
                    );
                    this.isSelectionCorrected = true;
                    break;
                } else {
                    break;
                }
            } else {
                temperaryFocusNode = node;
            }
        }
        this.dependencies.builderOptions.updateContainers(
            closestElement(selection.commonAncestorContainer)
        );
        this.isSelectionCorrected = true;
    }
}
