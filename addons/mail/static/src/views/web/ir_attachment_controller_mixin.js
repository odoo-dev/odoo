import { _t } from "@web/core/l10n/translation";
import { download } from "@web/core/network/download";
import { serializeDate } from "@web/core/l10n/dates";

const { DateTime } = luxon;

export const IrAttachmentControllerMixin = (component) =>
    class extends component {
        async onDownload() {
            const attachments = this.model.root.selection;
            const data = {};
            var url = "/web/content";
            if (!attachments.length) {
                return
            } else if (attachments.length === 1) {
                data['id'] = attachments[0].resId;
            } else {
                data['file_ids'] = attachments.map((r) => r.resId);
                data['zip_name'] = `attachments-${serializeDate(DateTime.now())}.zip`;
                url = "/mail/attachment/zip";
            }
            await download({data: data, url: url});
        }
        /**
         * @override
         */
        getStaticActionMenuItems() {
            return {
                ...super.getStaticActionMenuItems(),
                downloadAttachments: {
                    sequence: 15,
                    icon: "fa fa-download",
                    description: _t("Download"),
                    callback: () => this.onDownload(),
                },
            };
        }
    };
