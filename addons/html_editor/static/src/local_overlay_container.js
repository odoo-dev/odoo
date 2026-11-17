import { Component, Resource, signal, t, useProps } from "@odoo/owl";
import { ErrorHandler } from "@web/core/utils/components";

/**
 * Renders the components of the `localOverlays` resource, each in its own
 * local overlay.
 */
export class LocalOverlayContainer extends Component {
    static template = "html_editor.LocalOverlayContainer";
    static components = { ErrorHandler };
    props = useProps({
        localOverlays: t.instanceOf(Resource),
    });

    // Ref on the local overlay element, either owned by the parent
    // (`localOverlayRef` prop) or local.
    localOverlayRef = useProps.static(
        "localOverlayRef",
        t.signal(t.ref()).optional(() => signal.ref())
    );

    handleComponentError(error, localOverlay) {
        // remove the faulty component and rerender without it
        this.props.localOverlays.delete(localOverlay);
        /**
         * we rethrow the error to notify the user something bad happened.
         * We do it after a tick to make sure owl can properly finish its
         * rendering
         */
        Promise.resolve().then(() => {
            throw error;
        });
    }
}
