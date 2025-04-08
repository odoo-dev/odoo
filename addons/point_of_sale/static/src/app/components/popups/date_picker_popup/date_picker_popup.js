import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { Component, useState } from "@odoo/owl";
// import { DateTimePickerPopover } from "@web/core/datetime/datetime_picker_popover";
// import { usePopover } from "@web/core/popover/popover_hook";
import { localization } from "@web/core/l10n/localization";
import { DateTimeInput } from "@web/core/datetime/datetime_input";

const { DateTime } = luxon;

export class DatePickerPopup extends Component {
    static template = "point_of_sale.DatePickerPopup";
    static components = { Dialog, DateTimeInput };
    static props = {
        title: { type: String, optional: true },
        confirmLabel: { type: String, optional: true },
        getPayload: Function,
        close: Function,
    };
    static defaultProps = {
        confirmLabel: _t("Confirm"),
        title: _t("DatePicker"),
    };

    setup() {
        super.setup();
        // this.popover = usePopover(DateTimePickerPopover, { position: "top" });
        this.state = useState({ shippingDate: DateTime.now() });
    }
    confirm() {
        this.props.getPayload(this.state.shippingDate);
        this.props.close();
    }

    getFormattedDate() {
        return this.state.shippingDate.toFormat(localization.dateFormat);
    }

    openDatePicker(ev) {
        this.popover.open(ev.currentTarget, {
            pickerProps: {
                onSelect: async (value) => {
                    if (value) {
                        this.state.shippingDate = value;
                        this.popover.close();
                    }
                },
                type: "date",
                minDate: "today",
                value: this.state.shippingDate,
            },
        });
    }
    onShippingDateChange(date) {
        this.state.shippingDate = date;
    }
}
