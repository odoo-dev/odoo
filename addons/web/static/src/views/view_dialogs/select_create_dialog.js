/** @odoo-module **/

import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { View } from "@web/views/view";

const { Component, markup, useState } = owl;

export class SelectCreateDialog extends Component {
    setup() {
        this.viewService = useService("view");
        this.state = useState({ resIds: [] });
        this.baseViewProps = {
            display: { searchPanel: false },
            editable: false, // readonly
            noBreadcrumbs: true,
            noContentHelp: markup(`<p>${this.env._t("No records found!")}</p>`),
            showButtons: false,
            selectRecord: (resId) => this.select([resId]),
            onSelectionChanged: (resIds) => {
                this.state.resIds = resIds;
            },
        };
    }

    get viewProps() {
        let id;
        const viewProps = {
            ...this.baseViewProps,
            context: this.props.context,
            domain: this.props.domain,
            dynamicFilters: this.props.dynamicFilters,
            hasSelectors: this.props.multiSelect,
            resModel: this.props.resModel,
            searchViewId: this.props.searchViewId,
            type: this.env.isSmall ? "kanban" : "list",
        };
        const context = this.props.context || {};
        if (viewProps.type === "kanban") {
            viewProps.forceGlobalClick = true;
            id = context["kanban_view_ref"];
        } else {
            id = context["list_view_ref"] || context["tree_view_ref"];
        }
        return { ...viewProps, viewId: id || false };
    }

    async select(resIds) {
        if (this.props.onSelected) {
            await this.props.onSelected(resIds);
            this.props.close();
        }
    }

    async createEditRecord() {
        if (this.props.onCreateEdit) {
            await this.props.onCreateEdit();
            this.props.close();
        }
    }
}
SelectCreateDialog.components = { Dialog, View };
SelectCreateDialog.template = "web.SelectCreateDialog";

SelectCreateDialog.defaultProps = {
    dynamicFilters: [],
    multiSelect: true,
    searchViewId: false,
    type: "list",
};

/**
 * Props: (to complete)
 *
 * resModel
 * domain
 * context
 * title
 * onSelected
 * type
 */
