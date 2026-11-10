import { DynamicGroupList } from "@web/model/relational_model/dynamic_group_list";

export class StockLocationDynamicGroupList extends DynamicGroupList {
    setup(config, data, options = {}) {
        this.group = options.group;
        super.setup(...arguments);
    }

    /**
     * @override
     */
    get records() {
        return this.groups.flatMap((group) => {
            const records = group.isFolded ? [] : group.records;
            return group.config.isLocationGroup ? [group.record, ...records] : records;
        });
    }

    /**
     * @override
     */
    _selectDomain(value) {
        if (value) {
            for (const group of this.groups) {
                if (group.config.isLocationGroup) {
                    group.record.selected = true;
                }
            }
        }
        super._selectDomain(value);
    }
}
