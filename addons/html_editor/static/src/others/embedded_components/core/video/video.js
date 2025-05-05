import {
    getEmbeddedProps,
    StateChangeManager,
    useEmbeddedState,
} from "@html_editor/others/embedded_component_utils";
import { getVideoUrl } from "@html_editor/utils/url";
import { Component, onMounted, onWillUnmount, useExternalListener, useRef } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

export class EmbeddedVideoIframe extends Component {
    static template = "html_editor.EmbeddedVideoIframe";
    static props = {
        src: { type: String },
    };
}

export class EmbeddedVideoComponent extends Component {
    static template = "html_editor.EmbeddedVideo";
    static props = {
        platform: { type: String },
        videoId: { type: String },
        params: { type: Object, optional: true },
        host: { type: Object, optional: true },
        createOverlay: { type: Function, optional: true },
        focusEditable: { type: Function, optional: true },
        addStep: { type: Function, optional: true },
        openVideoSelectorDialog: { type: Function, optional: true },
    };
    static components = { VideoIframe: EmbeddedVideoIframe };

    setup() {
        super.setup();
        this.videoBlock = this.props.host;
        this.state = useEmbeddedState(this.videoBlock);

        this.videoSettingsOverlay = this.props.createOverlay(VideoSettings, {
            positionOptions: {
                position: "right-start",
            },
            className: "video-overlay",
            closeOnPointerdown: false,
        });

        useExternalListener(this.videoBlock, "mouseenter", () => {
            if (!this.videoBlock.isConnected) {
                return;
            }

            const iframe = this.videoBlock.querySelector("iframe[title='Video player']");
            this.videoSettingsOverlay.open({
                target: this.videoBlock,
                props: {
                    close: () => this.videoSettingsOverlay.close(),
                    replaceVideo: () => {
                        this.props.openVideoSelectorDialog((media) => {
                            this.replaceVideo(media);
                        }, iframe);
                    },
                    removeVideo: () => {
                        this.videoBlock?.remove();
                        this.videoSettingsOverlay.close();
                        this.props.addStep();
                        // After video removal, delay focus to ensure it's inside
                        // the editable when the hint updates, avoiding incorrect
                        // placeholder hints.
                        setTimeout(() => this.props.focusEditable());
                    },
                },
            });
        });

        useExternalListener(this.videoBlock, "mouseleave", (e) => {
            if (e.relatedTarget?.closest(".video-overlay")) {
                return;
            }
            this.videoSettingsOverlay.close();
        });

        onWillUnmount(() => {
            this.videoSettingsOverlay?.close();
        });
    }

    get url() {
        return getVideoUrl(this.state.platform, this.state.videoId, this.state.params).toString();
    }

    /**
     * Replace a video in the editor
     * @param {Object} media
     */
    replaceVideo(media) {
        this.state.videoId = media.videoId;
        this.state.platform = media.platform;
        this.state.params = media.params;
        this.props.addStep();
        this.props.focusEditable();
    }
}

export const videoEmbedding = {
    name: "video",
    Component: EmbeddedVideoComponent,
    getProps: (host) => ({ host, ...getEmbeddedProps(host) }),
    getStateChangeManager: (config) => new StateChangeManager(config),
};

export class VideoSettings extends Component {
    static template = "html_editor.VideoSettings";
    static components = { Dropdown, DropdownItem };
    static props = {
        close: { type: Function },
        replaceVideo: { type: Function },
        removeVideo: { type: Function },
    };

    setup() {
        this.menuRef = useRef("menuRef");
        this.dropdownState = useDropdownState();

        onMounted(() => {
            this.menuRef.el?.addEventListener("mouseleave", () => {
                if (!this.dropdownState.isOpen) {
                    this.props.close();
                }
            });
        });

        useExternalListener(document, "pointerdown", (ev) => {
            if (ev.target.closest(".o-dropdown-item")) {
                return;
            }
            this.props.close();
        });

        onWillUnmount(() => {
            this.props.close();
        });
    }
}
