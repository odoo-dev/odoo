import { Component, t, usePlugin, useProps } from "@odoo/owl";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { SaleActionHelperDialog } from "./sale_action_helper_dialog";

export class SaleActionHelper extends Component {
    static template = "sale.SaleActionHelper";
    props = useProps({
        noContentHelp: t.string(),
    });

    setup() {
        this.dialogService = usePlugin(DialogPlugin);
    }

    openVideoPreview() {
        this.dialogService.add(SaleActionHelperDialog, {
            url: "https://www.youtube.com/embed/N4zw-2t6spk?autoplay=1",
        })
    }
};
