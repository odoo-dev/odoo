import { Plugin } from "@html_editor/plugin";
import { EMBEDDED_COMPONENT_PLUGINS } from "@html_editor/plugin_sets";
import { _t } from "@web/core/l10n/translation";
import { VideoSelectorDialog } from "./video_selector_dialog/video_selector_dialog";
import { renderToElement } from "@web/core/utils/render";

class VideoPlugin extends Plugin {
    static dependencies = ["dom", "selection"];
    static resources = (p) => ({
        powerboxItems: [
            {
                category: "structure",
                name: _t("Video"),
                priority: 70,
                description: _t("Insert a Video"),
                fontawesome: "fa-play",
                action: () => {
                    p.openVideoSelectorDialog((media) => {
                        p.insertVideo(media);
                    });
                },
            },
        ],
    });

    /**
     * Inserts a video in the editor
     * @param {Object} media
     */
    insertVideo(media) {
        const videoBlock = renderToElement("html_editor.EmbeddedVideoBlueprint", {
            behaviorProps: JSON.stringify({
                videoId: media.videoId,
                platform: media.platform,
                params: media.params || {},
            }),
        });
        this.shared.domInsert(videoBlock);
        this.dispatch("ADD_STEP");
    }

    /**
     * Inserts a dialog allowing the user to insert a video
     * @param {function} save
     */
    openVideoSelectorDialog(save) {
        const selection = this.shared.getEditableSelection();
        let restoreSelection = () => {
            this.shared.setSelection(selection);
        };
        this.services.dialog.add(
            VideoSelectorDialog,
            {
                save: (media) => {
                    save(media);
                    restoreSelection = () => {};
                },
            },
            {
                onClose: () => {
                    restoreSelection();
                },
            }
        );
    }
}

EMBEDDED_COMPONENT_PLUGINS.push(VideoPlugin);
