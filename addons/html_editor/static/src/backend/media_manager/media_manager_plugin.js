import { MediaPlugin } from "@html_editor/main/media/media_plugin";
import { getRecordDomain } from "@html_editor/main/media/media_manager/domain_helper";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { loadImage } from "@html_editor/utils/image_processing";
import { getMediaManagertDialogProps, MediaManagerDialog } from "./media_manager_dialog";

/**
 * Opens the media manager instead of the media dialog. The media manager relies
 * on backend views (SelectCreateDialog, kanban view), so this plugin is only
 * part of the backend assets: the editors of the frontend keep the MediaPlugin.
 */
export class MediaManagerPlugin extends MediaPlugin {
    /**
     * Domain of the media to display in the media manager. Override it to
     * adapt the media to the context the editor is used in (see
     * domain_helper.js).
     *
     * @param {Object} recordInfo the edited record ({ resModel, resId, ... })
     * @param {Object} params the params given to `openMediaDialog`
     * @returns {Array}
     */
    getDomain(recordInfo, params) {
        return getRecordDomain(recordInfo.resModel, recordInfo.resId);
    }

    /**
     * @override
     */
    openMediaDialog(params = {}, editableEl = null) {
        if (params.useOldMediaDialog) {
            return super.openMediaDialog(params, editableEl);
        }
        const recordInfo = this.getRecordInfo(editableEl);
        let imageToReplace = params.node || null;
        return this.dependencies.dialog.addDialog(MediaManagerDialog, {
            ...getMediaManagertDialogProps(recordInfo),
            domain: this.getDomain(recordInfo, params),
            onSelected: async (resIds, records) => {
                if (!records.length) {
                    return;
                }
                const elements = [];
                for (const record of records) {
                    const imageEl = await loadImage(record.local_url);
                    imageEl.alt = record.display_name ?? "";
                    elements.push(imageEl);
                }
                const promises = [];
                for (const el of elements) {
                    promises.push(this.onSaveMediaDialog(el, imageToReplace));
                    imageToReplace = null;
                }
                await Promise.all(promises);
            },
            multiSelect: !imageToReplace,
        });
    }
}

const mediaPluginIndex = MAIN_PLUGINS.indexOf(MediaPlugin);
if (mediaPluginIndex !== -1) {
    MAIN_PLUGINS.splice(mediaPluginIndex, 1, MediaManagerPlugin);
}
