import { Plugin } from "@html_editor/plugin";
import { closestBlock, isBlock } from "@html_editor/utils/blocks";
import { isProtecting } from "@html_editor/utils/dom_info";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { location } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { proxy, signal } from "@odoo/owl";
import { CollaborationSelectionAvatarOverlay } from "./collaboration_selection_avatar_overlay";

/**
 * @typedef {Object} SelectionInfo
 * @property {import("@html_editor/core/selection_plugin").SerializedSelection} selection
 * @property {string} color
 * @property {string} peerId
 * @property {string} peerName
 * @property {string} avatarPositionKey
 * @property {{ avatarUrl: string, top: number, left: number, isLoaded: boolean, isHidden: boolean }} avatar
 * @property {HTMLElement} avatarTargetElement
 */

export const AVATAR_SIZE = 25;

export class CollaborationSelectionAvatarPlugin extends Plugin {
    static id = "collaborationSelectionAvatar";
    static dependencies = ["domReferenceMap", "position", "localOverlay", "collaborationOdoo"];
    /** @type {import("plugins").EditorResources} */
    resources = {
        /** Handlers */
        on_collaboration_notification_handlers: this.handleCollaborationNotification.bind(this),
        on_remote_history_commits_applied_handlers: this.refreshSelection.bind(this),
        on_layout_geometry_change_handlers: this.refreshSelection.bind(this),
        on_movable_element_set_handlers: this.disableAvatarForElement.bind(this),
        on_will_unset_movable_element_handlers: this.enableAvatars.bind(this),
        on_collaborative_selection_updated_handlers: this.updateSelection.bind(this),

        collaboration_peer_metadata_providers: () => ({ avatarUrl: this.avatarUrl }),
    };

    /** @type {Map<string, SelectionInfo>} */
    selectionInfos = new Map();

    setup() {
        this.avatars = proxy([]);
        this.avatarCounters = signal([]);
        this.collaborationSelectionAvatarOverlay = this.dependencies.localOverlay.addLocalOverlay(
            "oe-avatars-overlay",
            CollaborationSelectionAvatarOverlay,
            { avatars: this.avatars, avatarCounters: this.avatarCounters }
        );
        this.avatarUrl = `${
            location.origin
        }/web/image?model=res.users&field=avatar_128&id=${encodeURIComponent(user.userId)}`;
    }
    handleCollaborationNotification({ notificationName, notificationPayload }) {
        switch (notificationName) {
            case "ptp_remove":
                this.selectionInfos.delete(notificationPayload);
                this.refreshSelection();
        }
    }

    /**
     * @param {import("./collaboration_odoo_plugin").CollaborationSelection} selection
     */
    updateSelection(selection) {
        /** @type {SelectionInfo} */
        const savedSelection = this.selectionInfos.get(selection.peerId) || {};
        const newSelection = Object.assign(savedSelection, selection);
        this.selectionInfos.set(selection.peerId, newSelection);
        this.drawPeerAvatar(newSelection);
        this.updateAvatarCounters();
    }
    /**
     * @param {SelectionInfo} selectionInfo
     */
    drawPeerAvatar(selectionInfo) {
        const { selection, peerId } = selectionInfo;
        const peerMetadata = this.dependencies.collaborationOdoo.getPeerMetadata(peerId);
        if (!peerMetadata) {
            return;
        }
        const { avatarUrl, peerName = _t("Anonymous") } = peerMetadata;
        const anchorNode = this.dependencies.domReferenceMap.getNodeById(selection.anchorNodeId);
        const focusNode = this.dependencies.domReferenceMap.getNodeById(selection.focusNodeId);
        if (!anchorNode || !focusNode || !anchorNode.isConnected || !focusNode.isConnected) {
            return;
        }
        let anchorBlock = closestBlock(anchorNode);
        if (!anchorBlock) {
            return;
        }
        if (isProtecting(anchorBlock)) {
            const rootAnchorBlock = closestElement(
                anchorNode,
                (el) => isBlock(el) && el.parentElement === this.editable
            );
            if (rootAnchorBlock) {
                anchorBlock = rootAnchorBlock;
            }
        }

        const localOverlayContainerRect =
            this.collaborationSelectionAvatarOverlay.getLocalOverlayContainerRect();

        // Draw user avatar.
        let avatar = selectionInfo.avatar;
        if (!avatar) {
            this.avatars.push({ avatarUrl, isLoaded: false, isHidden: false });
            // Keep the reactive item, so that updating it re-renders the avatar.
            avatar = this.avatars.at(-1);
        }
        // Make sure data is up to date.
        selectionInfo.avatar = avatar;
        selectionInfo.peerName = peerName;
        selectionInfo.avatarTargetElement = anchorBlock;
        this.selectionInfos.set(peerId, selectionInfo);

        const anchorBlockRect = anchorBlock.getBoundingClientRect();
        const top = anchorBlockRect.y - localOverlayContainerRect.y;
        avatar.top = top;
        const closestList = closestElement(anchorNode, "ul, ol"); // Prevent overlap bullets.
        const anchorX = closestList ? closestList.getBoundingClientRect().x : anchorBlockRect.x;
        const left = anchorX - localOverlayContainerRect.x - AVATAR_SIZE;
        avatar.left = left;
        selectionInfo.avatarPositionKey = `${left}|${top}`;
    }
    updateAvatarCounters() {
        const avatarsOverlaps = {};
        for (const info of this.selectionInfos.values()) {
            const key = info.avatarPositionKey;
            avatarsOverlaps[key] = avatarsOverlaps[key] || new Set();
            avatarsOverlaps[key].add(info);
        }

        // Render avatars overlap.
        const avatarCounters = [];
        for (const [overlapKey, infos] of Object.entries(avatarsOverlaps)) {
            const size = infos.size;
            if (size > 1) {
                const [left, top] = overlapKey.split("|").map((n) => parseInt(n, 10));
                avatarCounters.push({ left: left + 10, top: top + 10, size });
            }
        }
        this.avatarCounters.set(avatarCounters);
    }
    refreshSelection() {
        if (!this.selectionInfos.size) {
            this.avatars.splice(0);
        }
        for (const selection of this.selectionInfos.values()) {
            this.drawPeerAvatar(selection);
        }
        this.updateAvatarCounters();
    }

    disableAvatarForElement(element) {
        this.enableAvatars();
        for (const info of this.selectionInfos.values()) {
            if (info.avatarTargetElement === element) {
                info.avatar.isHidden = true;
            }
        }
    }
    enableAvatars() {
        for (const avatar of this.avatars) {
            avatar.isHidden = false;
        }
    }
}
