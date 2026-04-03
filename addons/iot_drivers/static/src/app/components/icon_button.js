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
        <i class="oi" t-att-class="this.props.icon_class" t-att-data-icon="this.props.icon" aria-hidden="true"></i>
    </div>
  `;
}
