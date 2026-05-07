/* global owl */

import useStore from "../hooks/store_hook.js";

const { Component, xml } = owl;

export class IconButton extends Component {
    static props = {
        onClick: Function,
        icon: String,
        icon_class: String,
    };

    setup() {
        this.store = useStore();
    }

    static template = xml`
    <div class="d-flex align-items-center justify-content-center icon-button btn btn-primary" t-translation="off" t-on-click="this.props.onClick">
        <i class="oi" t-att-class="this.props.icon_class" aria-hidden="true"><t t-out="this.props.icon"/></i>
    </div>
  `;
}
