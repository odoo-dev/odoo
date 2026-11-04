import { _t } from "@web/core/l10n/translation";
import { omit } from "@web/core/utils/objects";
import {
    getRecordDomain,
    MY_MEDIA_DOMAIN,
} from "@html_editor/main/media/media_manager/domain_helper";

import { useService } from "@web/core/utils/hooks";
import {
    SelectCreateDialog,
    selectCreateDialogProps,
} from "@web/views/view_dialogs/select_create_dialog";
import { props, t } from "@odoo/owl";

export const mediaManagerDialogProps = {
    ...selectCreateDialogProps,
    resModel: t.string(),
    baseResModel: t.string(),
    baseResId: t.number(),
    filters: t.array().optional(),
    domain: t.array().optional(),
    context: t.object().optional(),
};

export class MediaManagerDialog extends SelectCreateDialog {
    static template = "html_editor.MediaManagerDialog";
    props = props(mediaManagerDialogProps);
    document = document;

    setup() {
        console.groupCollapsed("%c MediaManagerDialog :: setup()", "background: #f9f;");
        console.warn("setup() trace");
        console.log("this : ", this);
        console.log("props : ", this.props);
        console.groupEnd();
        super.setup();
        this.state.records = [];
        this.orm = useService("orm");

        this.onSelectionChanged = (resIds, records) => {
            this.superOnSelectionChanged(resIds);
            this.state.records = records;
            if (resIds.length && !this.props.multiSelect) {
                this.select(resIds);
            }
        };
    }

    get viewProps() {
        const baseProps = super.viewProps;
        this.superOnSelectionChanged = baseProps.onSelectionChanged;
        const props = {
            ...omit(baseProps, "forceGlobalClick", "display", "onSelectionChanged"),
            type: "kanban",
            allowSelectors: true,
            baseResModel: this.props.baseResModel,
            baseResId: this.props.baseResId,
            filters: this.props.filters,
            onSelectionChanged: this.onSelectionChanged,
        };
        console.warn("get viewProps", { ...props });
        return props;
    }

    get isNewRecord() {
        console.error("TODO");
        return this.props.chatterParams?.isNewRecord;
    }

    async select(resIds) {
        console.warn("select", resIds);
        const records = this.state.records.filter((rec) => resIds.includes(rec.id));
        if (this.props.onSelected) {
            this.executeOnceAndClose(() => this.props.onSelected(resIds, records));
        }
    }
}

export function getMediaManagertDialogProps(recordInfo) {
    const lastWeekDate = luxon.DateTime.now().minus({ weeks: 1 }).toFormat("yyyy-MM-dd HH:mm:ss");
    return {
        title: _t("Select a media"),
        resModel: "ir.attachment", // todo we probably don't need this
        // searchViewId: "mediamanager_media_search", // todo doesn't work, need id, how ?
        baseResModel: recordInfo.resModel ?? "ir.attachment",
        baseResId: recordInfo.resId ?? -1,
        filters: [
            // todo link this to the search bar filters somehow
            { label: "uploaded last week", domain: [["create_date", ">", lastWeekDate]] },
            { label: "uploaded by me", domain: MY_MEDIA_DOMAIN },
            { label: "favorites", customKey: "starred" },
        ],
        noCreate: true,
        // todo : BINARY_DOMAIN prevents webp url to be shown, should we change that ?
        domain: getRecordDomain(recordInfo.resModel, recordInfo.resId),
        context: {
            kanban_view_ref: "html_editor.mediamanager_media_kanban",
            search_view_ref: "html_editor.mediamanager_media_search",
        },
    };
}
