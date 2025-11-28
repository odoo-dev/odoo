import { Dialog } from "@web/core/dialog/dialog";
import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { SyncPopup } from "@point_of_sale/app/components/popups/sync_popup/sync_popup";

export class ReloadErrorPopup extends Component {
    static template = "point_of_sale.ReloadErrorPopup";
    static components = { Dialog };
    static props = {
        close: Function,
        title: { type: String, optional: true },
        body: { type: String, optional: true },
        confirm: { type: Function, optional: true },
    };
    static defaultProps = {
        title: _t("Error"),
    };

    async _confirm() {
        await this.props.confirm?.();
        this.props.close();
    }

    async _reload() {
        this.props.close();
        this.env.services.dialog.add(SyncPopup, {
            title: _t("Reload Data"),
            confirm: (fullReload) => this.env.services.pos.reloadData?.(fullReload),
        });
    }
}
