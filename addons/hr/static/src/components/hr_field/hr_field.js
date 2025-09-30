import { Field } from "@web/views/fields/field";
import { useService } from "@web/core/utils/hooks";
import { Component, onWillRender, useState } from "@odoo/owl";
import { usePopover } from "@web/core/popover/popover_hook";
import { formatPercentage } from "@web/views/fields/formatters";

export class HrFieldDifferences extends Component {
    static props = {
        close: { optional: true, type: Function },
        fieldDifferences: { type: Object },
        currentVersionId: { type: Number },
        currentVersionDate: { type: String },
        fieldName: { type: String },
        fieldType: { type: String },
    };
    static template = "hr.HrFieldDifferences";
}

export class HrField extends Field {
    static template = "hr.HrField";

    setup() {
        super.setup();
        this.fieldDifferencesService = useService("fieldDifferenceBetweenVersions");
        this.state = useState({ fieldDifferences: {} });
        this.popover = usePopover(HrFieldDifferences, {
            position: "top-start",
        });
        onWillRender(async () => {
            if (this.props.fieldInfo.type !== "properties") {
                const fieldDifferences = await this.fieldDifferencesService.getEmployeeFieldChanged(
                    this.env.model.config.resId,
                    this.props.name
                );
                if (this.props.fieldInfo.widget === "percentage") {
                    for (const date in fieldDifferences) {
                        fieldDifferences[date].formatted_value = formatPercentage(
                            fieldDifferences[date].value
                        );
                    }
                }
                this.state.fieldDifferences = fieldDifferences;
                this.state.currentVersionDate = this.env.model.getCurrentVersionDate;
            }
        });
    }

    get isFieldDifferent() {
        return Object.values(this.state.fieldDifferences ?? {}).filter(
            (r, index) => r.version_id === this.props.record.data.version_id.id && index !== 0
        ).length;
    }

    get isFieldHistory() {
        return Object.keys(this.state.fieldDifferences ?? {}).length;
    }

    onClickHistory(ev) {
        if (this.popover.isOpen) {
            this.popover.close();
        } else {
            this.popover.open(ev.currentTarget, {
                fieldDifferences: this.state.fieldDifferences,
                currentVersionId: this.props.record.data.version_id.id,
                fieldName: this.props.fieldInfo.string,
                fieldType: this.props.fieldInfo.type,
            });
        }
    }
}
