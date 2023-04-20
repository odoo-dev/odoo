/** @odoo-module **/

import { Component, onWillUpdateProps } from "@odoo/owl";
import { AnimatedNumber } from "./animated_number";

export class ColumnProgress extends Component {
    static components = {
        AnimatedNumber,
    };
    static template = "web.ColumnProgress";
    static props = {
        aggregate: { type: Object },
        group: { type: Object },
        onBarClicked: { type: Function, optional: true },
        progressBar: { type: Object },
    };
    static defaultProps = {
        onBarClicked: () => {},
    };

    setup() {
        let i = 0;
        onWillUpdateProps((nextProps) => {
            console.log(++i);
            console.log(nextProps.progressBar);
            console.log(nextProps.aggregate);
        });
    }

    async onBarClick(progressBar) {
        await this.props.onBarClicked(progressBar);
    }
}
