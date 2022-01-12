/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "./standard_field_props";
import { PercentageViewer } from "./percentage";

const { Component } = owl;

export class PercentPieField extends Component {
    get transform() {
        const rotateDeg = (360 * this.props.value) / 100;
        return {
            left: rotateDeg < 180 ? 180 : rotateDeg,
            right: rotateDeg < 180 ? rotateDeg : 0,
            value: rotateDeg,
        };
    }
}

Object.assign(PercentPieField, {
    components: {
        PercentageViewer,
    },
    template: "web.PercentPieField",
    props: {
        ...standardFieldProps,
        string: { type: String, optional: true },
    },

    displayName: _lt("PercentPie"),
    supportedTypes: ["integer", "float"],

    convertAttrsToProps(attrs) {
        return {
            string: attrs.string,
        };
    },
});

registry.category("fields").add("percentpie", PercentPieField);
