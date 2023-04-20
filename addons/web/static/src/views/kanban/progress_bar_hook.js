/** @odoo-module **/

import { onWillStart, onWillUpdateProps, useComponent } from "@odoo/owl";
import { Domain } from "@web/core/domain";
import { _t } from "@web/core/l10n/translation";

const FALSE = Symbol("False");

class ProgressBarState {
    constructor(progressAttributes, model, getPBCounts) {
        this.fieldName = progressAttributes.fieldName;
        this.sumField = progressAttributes.sumField;
        this.colors = progressAttributes.colors;
        this.help = progressAttributes.help;
        this.model = model;
        this._groupsInfo = {};
        this.getPBCounts = getPBCounts;
    }

    get pbCounts() {
        return this.getPBCounts();
    }

    getGroupInfo(groupId) {
        const group = this.model.root.groups.find((group) => group.id === groupId);
        if (!this._groupsInfo[groupId] || group.count !== this._groupsInfo[groupId].groupCount) {
            let groupValue = group.value;
            if (groupValue === true) {
                groupValue = "True";
            } else if (groupValue === false) {
                groupValue = "False";
            }
            const pbCount = this.pbCounts[groupValue];
            const { selection: fieldSelection } = this.model.root.fields[this.fieldName];
            const selection = fieldSelection && Object.fromEntries(fieldSelection);
            const bars = Object.entries(this.colors).map(([value, color]) => {
                let string;
                if (selection) {
                    string = selection[value];
                } else {
                    string = String(value);
                }
                return { count: (pbCount && pbCount[value]) || 0, value, string, color };
            });
            bars.push({
                count: group.count - bars.map((r) => r.count).reduce((a, b) => a + b),
                value: FALSE,
                string: _t("Other"),
                color: "200",
            });

            const fieldName = this.sumField && this.sumField.name;
            const title = this.sumField ? this.sumField.string : _t("Count");
            const aggregateValue = fieldName ? group.aggregates[fieldName] || 0 : group.count;
            const aggregateTitle = title;
            const groupCount = group.count; // This is used to control the update of the group (new eleemnt, removed element)

            const progressBar = {
                groupCount,
                activeBar: null,
                bars,
                aggregateValue,
                aggregateTitle,
            };

            this._groupsInfo[groupId] = progressBar;
        }
        return this._groupsInfo[groupId];
    }

    async selectBar(groupId, bar) {
        const group = this.model.root.groups.find((group) => group.id === groupId);
        const progressBar = this._groupsInfo[groupId];
        const nextActiveBar = bar.value;
        const { bars } = progressBar;
        const domains = [group.list.domain];
        if (nextActiveBar) {
            if (nextActiveBar === FALSE) {
                const keys = bars.filter((x) => x.value !== FALSE).map((x) => x.value);
                domains.push(["!", [this.fieldName, "in", keys]]);
            } else {
                domains.push([[this.fieldName, "=", nextActiveBar]]);
            }
        }
        const domain = Domain.and(domains).toList();
        let nextAggregateValue;
        const proms = [];
        proms.push(
            group.list.load({ domain }).then(() => {
                if (!this.sumField) {
                    nextAggregateValue = group.list.count;
                }
            })
        );
        if (this.sumField) {
            const kwargs = { context: group.context };
            const groupBy = [group.groupByField.name];
            const fields = [this.sumField.name];
            proms.push(
                this.model.orm
                    .webReadGroup(group.resModel, domain, fields, groupBy, kwargs)
                    .then(({ groups }) => {
                        // FIXME: I think there could be several groups
                        nextAggregateValue = groups[0][this.sumField.name];
                    })
            );
        }
        await Promise.all(proms);
        progressBar.activeBar = nextActiveBar;
        progressBar.aggregateValue = nextAggregateValue;
    }

    emptyGroupInfo() {
        this._groupsInfo = {};
    }
}

export function useProgressBar(progressAttributes, model) {
    let pbCounts;
    const component = useComponent();

    function readProgressBar() {
        if (
            progressAttributes &&
            (component.props.groupBy.length || component.props.defaultGroupBy)
        ) {
            const { colors, fieldName, help } = progressAttributes;
            pbCounts = model.orm
                .call(component.props.resModel, "read_progress_bar", [], {
                    domain: component.props.domain,
                    group_by: component.props?.groupBy[0] || component.props.defaultGroupBy,
                    progress_bar: { colors, field: fieldName, help },
                    context: component.props.context,
                })
                .then((res) => {
                    pbCounts = res;
                    progressBarState.emptyGroupInfo();
                });
        }
    }

    const progressBarState = new ProgressBarState(progressAttributes, model, () => pbCounts);

    // FIXME: do this in readGroup directly?
    onWillStart(readProgressBar);
    onWillUpdateProps(readProgressBar);

    return progressBarState;
}
