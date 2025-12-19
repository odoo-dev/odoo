import { Component, Plugin, signal, xml } from "@odoo/owl";
import { serviceRegistry } from "@web_core/services";

class EmptyAction extends Component {
    static template = xml``;
}

export class DisplayedActionPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    /**
     * @private
     * @type {import("@odoo/owl").Signal<{ component: import("@odoo/owl").ComponentConstructor; description: Record<string, any> }>}
     */
    _displayInfo = signal({
        component: EmptyAction,
        description: {},
    });

    get component() {
        return this._displayInfo().component;
    }

    get description() {
        return this._displayInfo().description;
    }

    /**
     * @param {import("@odoo/owl").ComponentConstructor} component
     * @param {Record<string, any>} description
     */
    setDisplay(component, description) {
        this._displayInfo.set({ component, description });
    }
}
