import { ListRenderer } from "@web/views/list/list_renderer";

export class StockLocationListRenderer extends ListRenderer {
    static groupRowTemplate = "stock.StockLocationListRenderer.GroupRow";
    static recordRowTemplate = "stock.StockLocationListRenderer.RecordRow";

    isLocationGroup(group) {
        return Boolean(group?.config.isLocationGroup);
    }

    /**
     * @param {Object} group
     * @returns {boolean} true if the group is a location without sub-location
     */
    isLeafLocationGroup(group) {
        return this.isLocationGroup(group) && group.count === 0;
    }

    /**
     * @returns the columns displaying the values of the location of a location
     *  group: all the columns but the first one, which holds the group name
     */
    getLocationGroupColumns() {
        return this.columns.slice(1);
    }

    /**
     * @override
     * The group list of a location group is grouped by location as well, so the
     * level can't be deduced from the `groupBy` lengths: count the parent groups.
     */
    getGroupLevel(group) {
        let level = 0;
        let parentGroup = group._parent.group;
        while (parentGroup) {
            level++;
            parentGroup = parentGroup._parent.group;
        }
        return level;
    }

    /**
     * @override
     * The selector of a location group has its own cell, and its name only
     * spans the first column: the other ones display the location values.
     */
    getGroupNameCellColSpan(group) {
        if (this.isLocationGroup(group)) {
            return 1;
        }
        return super.getGroupNameCellColSpan(group);
    }

    /**
     * @override
     * The values of the location are displayed instead of the aggregates.
     */
    getAggregateColumns(group) {
        return this.isLocationGroup(group) ? [] : super.getAggregateColumns(group);
    }

    /**
     * @override
     */
    getGroupPagerCellColspan(group) {
        return this.isLocationGroup(group) ? 0 : super.getGroupPagerCellColspan(group);
    }

    get canCreateGroup() {
        if (this.props.list.groupByField.relation === "stock.warehouse") {
            // We don't want to be able to create new warehouse from this view.
            return false;
        }
        return super.canCreateGroup;
    }
}
