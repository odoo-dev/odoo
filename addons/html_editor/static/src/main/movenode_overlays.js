import { Component, t, useProps } from "@odoo/owl";

/**
 * Invisible zones next to the movable blocks: hovering one shows the move
 * widget of its block.
 */
export class MoveNodeHooksOverlay extends Component {
    static template = "html_editor.MoveNodeHooksOverlay";
    props = useProps({
        hooks: t.array(),
        onMouseEnter: t.function(),
    });
}

/**
 * The move widget of the hovered block. Its container is the drag area of the
 * widget.
 */
export class MoveNodeWidgetOverlay extends Component {
    static template = "html_editor.MoveNodeWidgetOverlay";
    props = useProps({
        moveWidget: t.signal(),
    });
    widgetContainerRef = useProps.static("widgetContainerRef", t.signal(t.ref()));
}

/**
 * Holds the preview of the dragged blocks.
 */
export class MoveNodeHelperOverlay extends Component {
    static template = "html_editor.MoveNodeHelperOverlay";
    dragHelperContainerRef = useProps.static("dragHelperContainerRef", t.signal(t.ref()));
}

/**
 * Invisible zones that choose where the dragged blocks are dropped.
 */
export class MoveNodeDropzonesOverlay extends Component {
    static template = "html_editor.MoveNodeDropzonesOverlay";
    props = useProps({
        dropzones: t.signal(t.array()),
        onDropzoneEnter: t.function(),
        removeDropHint: t.function(),
    });
}

/**
 * Shows where the dragged blocks will be dropped.
 */
export class MoveNodeDropzoneHintsOverlay extends Component {
    static template = "html_editor.MoveNodeDropzoneHintsOverlay";
    props = useProps({
        dropHint: t.signal(),
    });
    dropHintStyles = {
        north: "top: -2px; width: 100%; height: 4px;",
        south: "bottom: -2px; width: 100%; height: 4px;",
    };
}
