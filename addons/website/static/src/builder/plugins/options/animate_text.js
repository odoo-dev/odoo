import { Component, useRef, useState } from "@odoo/owl";
import { toolbarButtonProps } from "@html_editor/main/toolbar/toolbar";
import { closestElement, findFurthest } from "@html_editor/utils/dom_traversal";
import { AnimateOption } from "./animate_option";
import { usePopover } from "@web/core/popover/popover_hook";
import { DependencyManager } from "@html_builder/core/dependency_manager";
import { _t } from "@web/core/l10n/translation";
import { childNodeIndex, DIRECTIONS, nodeSize } from "@html_editor/utils/position";
import { BaseOptionComponent } from "@html_builder/core/utils";

class AnimateTextPopover extends BaseOptionComponent {
    static template = "website_builder.AnimateTextPopover";
    static props = {
        animateOptionProps: Object,
        onReset: Function,

        // Popover service
        close: { type: Function, optional: true },
    };
    static components = { AnimateOption };
}

export class AnimateText extends Component {
    static template = "website_builder.AnimateText";
    static props = {
        ...toolbarButtonProps,
        editor: Object,
        editorBus: Object,
        animateOptionProps: AnimateOption.props,
    };

    setup() {
        super.setup();
        this.state = useState({});
        this.updateState = () => {
            this.state.isActive = !!this.getActiveAnimatedText();
            this.state.isDisabled = this.isDisabled();
        };
        this.updateState();

        this.root = useRef("root");
        this.popover = usePopover(AnimateTextPopover, {
            env: {
                ...this.env,
                dependencyManager: new DependencyManager(),
                getEditingElement: () => this.activeElement,
                getEditingElements: () => (this.activeElement ? [this.activeElement] : []),
                weContext: {},
                editor: this.props.editor,
                editorBus: this.props.editorBus,
                services: this.props.editor.services,
            },
            onClose: () => {
                if (!this.props.editor.isDestroyed) {
                    this.updateState();
                }
            },
        });
    }

    showPopover() {
        if (this.popover.isOpen) {
            return;
        }
        const ancestor = closestElement(
            this.props.getSelection().editableSelection.commonAncestorContainer,
            ".o_animated_text"
        );
        this.activeElement = undefined;
        let savePoint = this.props.editor.shared.history.makeSavePoint();
        if (ancestor && this.props.editor.shared.selection.isNodeContentsFullySelected(ancestor)) {
            this.activeElement = ancestor;
            savePoint = undefined;
        } else {
            const selection = this.props.editor.shared.split.splitSelection();
            const { anchorNode, focusNode, commonAncestorContainer } = selection;
            let commonAncestor = commonAncestorContainer;
            for (let [node, forward] of [
                [anchorNode, true],
                [focusNode, false],
            ]) {
                let needToMeetCommonAncestor =
                    node !== commonAncestor && node.parentNode !== commonAncestor;
                let needToMeetAnimatedTextAncestor = !!closestElement(node, ".o_animated_text");
                let updatedCommonAncestor = needToMeetCommonAncestor ? undefined : commonAncestor;

                while (needToMeetCommonAncestor || needToMeetAnimatedTextAncestor) {
                    if (
                        needToMeetAnimatedTextAncestor &&
                        node.parentNode.classList.contains("o_animated_text")
                    ) {
                        needToMeetAnimatedTextAncestor = false;
                    }
                    const updatingCommonAncestor = commonAncestor === node.parentNode;
                    const splitIndex = childNodeIndex(node);
                    if (
                        forward
                            ? splitIndex > 0
                            : splitIndex < node.parentNode.childNodes.length - 1
                    ) {
                        if (
                            this.props.editor.shared.split.isUnsplittable(node.parentNode) &&
                            !node.parentNode.classList.contains("o_animated_text")
                        ) {
                            savePoint();
                            this.props.editor.services.notification.add(
                                _t(
                                    "Cannot apply this option on current text selection. Try clearing the format and try again."
                                ),
                                { type: "danger", sticky: true }
                            );
                            return;
                        }
                        node = this.props.editor.shared.split.splitElement(
                            node.parentNode,
                            splitIndex + (forward ? 0 : 1)
                        )[forward ? 1 : 0];
                    } else {
                        node = node.parentNode;
                    }
                    if (node.classList.contains("o_animated_text") && !forward) {
                        const childNodes = node.childNodes;
                        const newNode = childNodes[forward ? 0 : childNodes.length - 1];
                        node.replaceWith(...childNodes);
                        node = newNode;
                        savePoint = undefined;
                    }
                    if (updatingCommonAncestor) {
                        updatedCommonAncestor = node.parentNode;
                    }
                    if (needToMeetCommonAncestor && node.parentNode === commonAncestor) {
                        needToMeetCommonAncestor = false;
                    }
                }
                commonAncestor = updatedCommonAncestor ?? commonAncestor;
            }

            const { startContainer, endContainer, direction } = selection;

            const range = new Range();
            range.setStartBefore(
                findFurthest(startContainer, commonAncestor, () => true) ?? startContainer
            );
            range.setEndAfter(
                findFurthest(endContainer, commonAncestor, () => true) ?? endContainer
            );
            const span = this.props.editor.document.createElement("span");
            range.surroundContents(span);
            for (const node of span.querySelectorAll(".o_animated_text")) {
                node.replaceWith(...node.childNodes);
                savePoint = undefined;
            }
            span.classList.add("o_animated_text", "o_animate_preview");
            span.classList.add("o_animate", "o_anim_fade_in"); // default animation
            this.activeElement = span;
            this.props.editor.shared.selection.setSelection(
                direction === DIRECTIONS.RIGHT
                    ? {
                          anchorNode: span,
                          anchorOffset: 0,
                          focusNode: span,
                          focusOffset: nodeSize(span),
                      }
                    : {
                          anchorNode: span,
                          anchorOffset: nodeSize(span),
                          focusNode: span,
                          focusOffset: 0,
                      }
            );
            this.props.editor.shared.history.addStep();
        }
        this.updateState();
        this.popover.open(this.root.el, {
            animateOptionProps: this.props.animateOptionProps,
            onReset: this.onReset.bind(this, savePoint),
        });
    }

    onReset(resetSavePoint) {
        if (resetSavePoint) {
            resetSavePoint();
        } else {
            const cursors = this.props.editor.shared.selection.preserveSelection();
            this.activeElement.replaceWith(...this.activeElement.childNodes);
            cursors.restore();
            this.props.editor.shared.history.addStep();
        }
        this.popover.close();
    }

    isDisabled() {
        return 2 <= this.props.editor.shared.selection.getTraversedBlocks().size;
    }
    getActiveAnimatedText() {
        const ancestor = closestElement(
            this.props.getSelection().editableSelection.commonAncestorContainer,
            ".o_animated_text"
        );
        return ancestor && this.props.editor.shared.selection.isNodeContentsFullySelected(ancestor)
            ? ancestor
            : undefined;
    }
}
