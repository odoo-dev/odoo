import { xml, Component, reactive, useState } from "@odoo/owl";

export function useStackingComponentState() {
    const stack = reactive([]);
    let counter = 0;
    const push = (component, props, title) => {
        stack.push({ id: counter++, component, props, title });
    };
    const pop = () => stack.pop();

    return { push, pop, stack };
}

export class StackingComponent extends Component {
    static template = xml`

        <t t-foreach="this.stack" t-as="componentSpec" t-key="componentSpec.id">
            <div t-attf-class="{{componentSpec_last ? '': 'd-none' }} overflow-auto" style="width: 262px; height: 275px; ">
                <div t-if="this.stack.length > 1 || componentSpec.title" class="d-flex align-items-center">
                    <button t-if="this.stack.length > 1" class="fa fa-angle-left btn btn-secondary bg-transparent border-0" t-on-click="this.props.stackState.pop"></button>
                    <span t-out="componentSpec.title" class="lead mb-0"/>
                </div>
                <t t-component="componentSpec.component" t-props="componentSpec.props" />
            </div>
        </t>
    `;
    static props = {
        stackState: { type: Object },
    };

    setup() {
        this.stack = useState(this.props.stackState.stack);
    }
}
