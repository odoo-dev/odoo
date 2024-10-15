import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { PosDialog } from "@point_of_sale/app/generic_components/pos_dialog/pos_dialog";

export class PosConfirmationDialog extends ConfirmationDialog {
    static template = "point_of_sale.PosConfirmationDialog";
    static components = {
        ...ConfirmationDialog.components,
        PosDialog,
    };
    static props = {
        ...ConfirmationDialog.props,
        hideCloseButton: { type: Boolean, optional: true },
    };
    static defaultProps = {
        ...ConfirmationDialog.defaultProps,
        hideCloseButton: false,
    };
}
