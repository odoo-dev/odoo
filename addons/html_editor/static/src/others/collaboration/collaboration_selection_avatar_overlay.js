import { Component, t, useProps } from "@odoo/owl";

/**
 * Shows the avatars of the other users next to the block they are editing,
 * with a counter where several avatars overlap.
 */
export class CollaborationSelectionAvatarOverlay extends Component {
    static template = "html_editor.CollaborationSelectionAvatarOverlay";
    props = useProps({
        avatars: t.array(),
        avatarCounters: t.signal(t.array()),
    });
}
