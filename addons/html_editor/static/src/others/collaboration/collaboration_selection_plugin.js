import { Plugin } from "@html_editor/plugin";
import {
    getDeepestPosition,
    isProtected,
    isProtecting,
    isUnprotecting,
} from "@html_editor/utils/dom_info";
import { childNodes } from "@html_editor/utils/dom_traversal";
import { DIRECTIONS } from "@html_editor/utils/position";
import { getCursorDirection } from "@html_editor/utils/selection";
import { _t } from "@web/core/l10n/translation";
import { signal } from "@odoo/owl";
import { CollaborationSelectionOverlay } from "./collaboration_selection_overlay";

export class CollaborationSelectionPlugin extends Plugin {
    static id = "collaborationSelection";
    static dependencies = ["domReferenceMap", "collaborationOdoo", "position", "localOverlay"];
    /** @type {import("plugins").EditorResources} */
    resources = {
        /** Handlers */
        on_collaboration_notification_handlers: this.handleCollaborationNotification.bind(this),
        on_layout_geometry_change_handlers: this.refreshSelection.bind(this),
        on_collaborative_selection_updated_handlers: this.updateSelection.bind(this),

        collaboration_peer_metadata_providers: () => ({ selectionColor: this.selectionColor }),
    };
    selectionInfos = new Map();

    setup() {
        this.peerSelections = signal([]);
        this.collaborationSelectionOverlay = this.dependencies.localOverlay.addLocalOverlay(
            "oe-selections-container",
            CollaborationSelectionOverlay,
            { peerSelections: this.peerSelections }
        );
        this.selectionColor = `hsl(${(Math.random() * 360).toFixed(0)}, 75%, 50%)`;
    }
    handleCollaborationNotification({ notificationName, notificationPayload }) {
        switch (notificationName) {
            case "ptp_remove":
                this.multiselectionRemove(notificationPayload);
                this.selectionInfos.delete(notificationPayload);
                break;
        }
    }
    /**
     * @param {import("./collaboration_odoo_plugin").CollaborationSelection} selection
     */
    updateSelection(selection) {
        this.selectionInfos.set(selection.peerId, selection);
        this.drawPeerSelection(selection);
    }
    /**
     * @param {import("./collaboration_odoo_plugin").CollaborationSelection} selection
     */
    drawPeerSelection({ selection, peerId }) {
        const peerMetadata = this.dependencies.collaborationOdoo.getPeerMetadata(peerId);
        if (!peerMetadata) {
            return;
        }
        const { selectionColor, peerName = _t("Anonymous") } = peerMetadata;
        this.multiselectionRemove(peerId);
        let clientRects;

        let anchorNode = this.dependencies.domReferenceMap.getNodeById(selection.anchorNodeId);
        let focusNode = this.dependencies.domReferenceMap.getNodeById(selection.focusNodeId);
        let anchorOffset = selection.anchorOffset;
        let focusOffset = selection.focusOffset;
        if (!anchorNode || !focusNode) {
            anchorNode = this.editable.children[0];
            focusNode = this.editable.children[0];
            anchorOffset = 0;
            focusOffset = 0;
        }
        const anchorTarget = childNodes(anchorNode).at(anchorOffset);
        const focusTarget = childNodes(focusNode).at(focusOffset);
        const protectionCheck = (node) =>
            isProtecting(node) || (isProtected(node) && !isUnprotecting(node));
        if (protectionCheck(anchorTarget) || protectionCheck(focusTarget)) {
            // TODO @phoenix, TODO ABD: better handle collaborative selection
            // on protected elements.
            return;
        }
        if (anchorNode.isConnected && focusNode.isConnected) {
            [anchorNode, anchorOffset] = getDeepestPosition(anchorNode, anchorOffset);
            [focusNode, focusOffset] = getDeepestPosition(focusNode, focusOffset);
        } else {
            // todo: We should not be able to get here, this fixes multiples
            // issues where we temporarily try to draw a an impossible
            // selection. We should investigate the root cause of this issue.
            anchorNode = this.editable.children[0];
            focusNode = this.editable.children[0];
            anchorOffset = 0;
            focusOffset = 0;
        }

        const direction = getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset);
        const range = new Range();
        try {
            if (direction === DIRECTIONS.RIGHT) {
                range.setStart(anchorNode, anchorOffset);
                range.setEnd(focusNode, focusOffset);
            } else {
                range.setStart(focusNode, focusOffset);
                range.setEnd(anchorNode, anchorOffset);
            }

            clientRects = Array.from(range.getClientRects());
        } catch {
            // Changes in the dom might prevent the range to be instantiated
            // (because of a removed node for example), in which case we ignore
            // the range.
            clientRects = [];
        }
        if (!clientRects.length) {
            return;
        }

        // Draw rects (in case the selection is not collapsed).
        const localOverlayContainerRect =
            this.collaborationSelectionOverlay.getLocalOverlayContainerRect();
        const selectionRects = clientRects.map(({ x, y, width, height }) => ({
            top: y - localOverlayContainerRect.y,
            left: x - localOverlayContainerRect.x,
            width,
            height,
        }));

        // Draw carret.
        let caretRect;
        if (direction === DIRECTIONS.LEFT) {
            const firstClientRect = clientRects[0];
            caretRect = {
                height: firstClientRect.height * 1.2,
                top: firstClientRect.y - localOverlayContainerRect.y,
                left: firstClientRect.x - localOverlayContainerRect.x,
            };
        } else {
            const lastClientRect = clientRects.at(-1);
            caretRect = {
                height: lastClientRect.height * 1.2,
                top: lastClientRect.y - localOverlayContainerRect.y,
                left: lastClientRect.right - localOverlayContainerRect.x,
            };
        }
        this.peerSelections.set([
            ...this.peerSelections(),
            { peerId, peerName, selectionColor, selectionRects, caretRect },
        ]);
    }

    multiselectionRemove(peerId) {
        this.peerSelections.set(
            this.peerSelections().filter((peerSelection) => peerSelection.peerId !== peerId)
        );
    }
    refreshSelection() {
        this.peerSelections.set([]);
        for (const selection of this.selectionInfos.values()) {
            this.drawPeerSelection(selection);
        }
    }
}
