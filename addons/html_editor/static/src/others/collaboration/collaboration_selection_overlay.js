import { Component, t, useProps } from "@odoo/owl";

/**
 * Shows the selection and the caret of the other users editing the document.
 */
export class CollaborationSelectionOverlay extends Component {
    static template = "html_editor.CollaborationSelectionOverlay";
    props = useProps({
        peerSelections: t.signal(t.array()),
    });
}
