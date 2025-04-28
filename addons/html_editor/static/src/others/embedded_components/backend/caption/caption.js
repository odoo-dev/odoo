import {
    applyObjectPropertyDifference,
    getEmbeddedProps,
    StateChangeManager,
} from "@html_editor/others/embedded_component_utils";
import { Component, useState, useRef, onMounted } from "@odoo/owl";

export class EmbeddedCaptionComponent extends Component {
    static template = "html_editor.EmbeddedCaption";

    static props = {
        id: { type: String },
        editable: { type: Element },
        addHistoryStep: { type: Function },
        undo: { type: Function },
        redo: { type: Function },
        focusInput: { type: Boolean },
        host: { type: Object },
    };

    setup() {
        super.setup();
        this.image = this.props.editable.querySelector(`img[data-caption-id="${this.props.id}"]`);
        this.state = useState({
            caption: "",
            host: this.props.host,
        });
        this.captionInput = useRef("captionInput");
        if (this.props.focusInput) {
            onMounted(() => {
                this.captionInput.el.focus();
            });
        }
        // Ensure the state, the attribute and the placeholder are in sync.
        // We update without adding a history step because it will be added by
        // the plugin.
        this.updateCaption(this.image.getAttribute("data-caption"), false);
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "attributes" && mutation.attributeName === "data-caption") {
                    this.updateCaption(this.image.getAttribute("data-caption"));
                }
            }
        });
        this.observer.observe(this.image, { attributes: true });
    }

    destroy() {
        this.observer.disconnect();
    }

    updateCaption(caption = "", addHistoryStep = true) {
        if (caption !== this.state.caption) {
            this.state.caption = caption;
            const figcaption = this.image.parentElement.querySelector("figcaption");
            if (figcaption && figcaption.getAttribute("placeholder") !== caption) {
                // Adapt the figcaption element's placeholder to the new caption
                // for screen reader users.
                figcaption.setAttribute("placeholder", caption);
            }
            if (caption !== this.image.getAttribute("data-caption")) {
                this.image.setAttribute("data-caption", caption);
            }
            if (addHistoryStep) {
                this.props.addHistoryStep();
            }
        }
    }

    onInputBlur() {
        // This is triggered before the selection changes. Wait before updating
        // so when the history step triggers a normalization, it restores that
        // new selection and not the old one.
        setTimeout(() => this.updateCaption(this.captionInput.el.value));
    }

    onInputKeyup(ev) {
        if (ev.key === "z" && ev.ctrlKey && !this._appliedNativeHistory) {
            if (ev.shiftKey) {
                this.props.redo();
            } else {
                this.props.undo();
            }
        }
        this._appliedNativeHistory = false;
    }

    onInputBeforeInput(ev) {
        this._appliedNativeHistory = false;
        if (ev.inputType === "historyUndo" || ev.inputType === "historyRedo") {
            // Input elements handle their own history, but this event is not
            // triggered if no changes were made to the input. So we handle the
            // editor history on keyup in those cases, but let the browser do
            // its thing otherwise.
            this._appliedNativeHistory = true;
        }
    }
}

export const captionEmbedding = {
    name: "caption",
    Component: EmbeddedCaptionComponent,
    getProps: (host) => ({ host, ...getEmbeddedProps(host) }),
    getStateChangeManager: (config) =>
        new StateChangeManager(
            Object.assign(config, {
                propertyUpdater: {
                    caption: (state, previous, next) => {
                        applyObjectPropertyDifference(
                            state,
                            "caption",
                            previous.caption,
                            next.caption
                        );
                    },
                },
            })
        ),
};
