import { Component, t, usePlugin, useProps } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";

export class AddTablePopup extends Component {
    static template = "pos_restaurant.floor_editor.add_table_popup";
    static components = { Dialog };

    props = useProps({
        addTable: t.function(),
        close: t.function(),
    });

    setup() {
        this.dialog = usePlugin(DialogPlugin);
    }

    addTable(shape) {
        this.props.addTable(shape);
        this.props.close();
    }
}
