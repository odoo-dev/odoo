import { Dialog } from "@web/core/dialog/dialog";

export class PosDialog extends Dialog {
    static template = "point_of_sale.PosDialog";
    static props = {
        ...Dialog.props,
        hideCloseButton: { type: Boolean, optional: true },
    };
    static defaultProps = {
        ...Dialog.defaultProps,
        hideCloseButton: false,
    };
}
