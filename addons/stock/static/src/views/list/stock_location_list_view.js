import { registry } from "@web/core/registry";
import { ListRenderer } from "@web/views/list/list_renderer";
import { listView } from "@web/views/list/list_view";

export class StockLocationHierarchyListRenderer extends ListRenderer {
    getCellClass(column, record) {
        let classNames = super.getCellClass(column, record);
        // Adds indentation to child locations based on hierarchy depth in list view.
        if (this.mustBeIndented(column, record) ) {
            const depth = Math.min(record.data.parent_path.split("/").length - 2, 10);
            if (depth) {
                classNames = `${classNames} o_list_indent_${depth}`;
                record.data.complete_name = record.data.name;
            }
        }
        return classNames;
    }

    mustBeIndented(column, record) {
        return column.name === "complete_name" &&
            record.data.parent_path &&
            this.props.list.orderBy.length === 0 && // avoid indentation in case of ordering
            this.isGroupByIndentationCompatible(this.props.list.groupBy) &&
            this.isDomainIndentationCompatible(this.props.list.domain);
    }

    isDomainIndentationCompatible(domain) {
        if (domain.length > 0) {
            const compatibleFields = ['usage'];
            for (const leaf of domain) {
                if (Array.isArray(leaf) && leaf.length === 3) {
                    if (!compatibleFields.includes(leaf[0])) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    isGroupByIndentationCompatible(groupBy) {
        if (this.props.list.groupBy.length > 0) {
            const compatibleFields = ['warehouse_id'];
            for (const field of groupBy) {
                if (!compatibleFields.includes(field)) {
                    return false;
                }
            }
        }
        return true;
    }
}

export const StockLocationHierarchyListView = {
    ...listView,
    Renderer: StockLocationHierarchyListRenderer,
};

registry.category("views").add("stock_location_hierarchy_list", StockLocationHierarchyListView);
