import { Component, xml, useState } from "@odoo/owl";

export class Counter extends Component {
    static template = xml`
        <span t-on-click.stop="increment" class="badge text-bg-secondary p-2">
            Counter: <t t-esc="state.value"/>
        </span>`;

    state = useState({ value: parseInt(this.props.elem.dataset.count) });

    increment() {
        this.state.value++;
        this.props.elem.dataset.count = this.state.value;
    }
}

export const counter = {
    name: "counter",
    Component: Counter,
    getProps: (elem) => ({ elem }),
};