/** @odoo-module **/

import { Dialog } from "@web/core/dialog/dialog";
import { View } from "../view";
import { useService } from "@web/core/utils/hooks";

const { onWillStart, useState } = owl;

export class SelectCreateDialog extends Dialog {
    setup() {
        super.setup();
        this.viewService = useService("view");
        this.state = useState({
            selectedRecords: [],
        });

        this.title = this.props.title;

        this.propsView = {
            resModel: this.props.resModel,
            domain: this.props.domain,
            context: this.props.context,
            type: "list",
            editable: false, // readonly
            showButtons: false,
            hasSelectors: this.props.multiSelect,
            selectRecord: (resId) => {
                if (this.props.onSelected) {
                    this.props.onSelected([resId]);
                    this.close();
                }
            },
            createRecord: () => {},
            onSelectionChanged: (selectedRecords) => {
                this.state.selectedRecords = selectedRecords;
            },
            noBreadcrumbs: true,
            searchViewId: this.props.searchViewId,
            display: { searchPanel: false },
        };

        onWillStart(async () => {
            if (!("searchViewId" in this.props)) {
                const { views } = await this.viewService.loadViews({
                    resModel: this.props.resModel,
                    context: this.props.context || {},
                    views: [[false, "search"]],
                });
                // FIXME AAB: what is this?? #02938023289424083
                this.propsView.searchViewId =
                    views.search.name !== this.props.resModel + " search"
                        ? views.search.name
                        : undefined;
            }
        });
    }

    select() {
        if (this.props.onSelected) {
            this.props.onSelected(this.state.selectedRecords);
            this.close();
        }
    }
    createEditRecord() {}
}
SelectCreateDialog.components = { View };
SelectCreateDialog.bodyTemplate = "web.SelectCreateDialogBody";
SelectCreateDialog.footerTemplate = "web.SelectCreateDialogFooter";

SelectCreateDialog.defaultProps = {
    multiSelect: true,
};
