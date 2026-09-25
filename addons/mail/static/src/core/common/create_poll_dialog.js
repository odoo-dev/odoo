import { CreatePollOptionDialog } from "@mail/core/common/create_poll_option_dialog";

import { Component, proxy, signal, types, useProps } from "@odoo/owl";

import { useDateTimePicker } from "@web/core/datetime/datetime_picker_hook";
import { Dialog } from "@web/core/dialog/dialog";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { EmojiPicker } from "@web/core/emoji_picker/emoji_picker";
import { formatDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { useAutofocus, useService } from "@web/core/utils/hooks";

export class CreatePollDialog extends Component {
    static template = "mail.CreatePollDialog";
    static components = { Dialog, Dropdown, DropdownItem, EmojiPicker, CreatePollOptionDialog };

    questionRef = signal.ref();
    durationRef = signal.ref();
    durationOptions = [
        { value: "10", label: _t("10 minutes") },
        { value: "60", label: _t("1 hour") },
        { value: "240", label: _t("4 hours") },
        { value: "480", label: _t("8 hours") },
        { value: "1440", label: _t("24 hours") },
        { value: "4320", label: _t("3 days") },
        { value: "10080", label: _t("1 week") },
        { value: "20160", label: _t("2 weeks") },
    ];

    setup() {
        super.setup(...arguments);
        this.store = useService("mail.store");
        this.props = useProps({
            close: types.function([types.instanceOf(MouseEvent)]),
            thread: types.instanceOf(this.store["mail.thread"]),
        });
        useAutofocus({ ref: this.questionRef });
        this.state = proxy({
            allowMultipleOptions: false,
            duration: "10",
            options: [{ label: "" }, { label: "" }],
            question: "",
            submitted: false,
            endDateInvalid: false,
            customDateSelected: false,
        });
        this.dateTimePickerProps = proxy({
            type: "datetime",
            rounding: 1,
            value: luxon.DateTime.now().plus({ minutes: 10 }).startOf("minute"),
        });
        this.dateTimePicker = useDateTimePicker({
            target: this.durationRef,
            pickerProps: this.dateTimePickerProps,
            showSeconds: false,
            showResetButton: false,
            onClose: () => {
                if (this.state.duration !== "custom") {
                    return;
                }
                // Apply also closes the picker when its initial value is unchanged.
                const { value } = this.dateTimePicker.state;
                this.dateTimePickerProps.value = value;
                this.state.customDateSelected = true;
                this.state.endDateInvalid = false;
            },
        });
    }

    durationLabel(value) {
        if (value === "custom") {
            return this.state.customDateSelected
                ? formatDateTime(this.dateTimePickerProps.value, { showSeconds: false })
                : _t("Custom");
        }
        return this.durationOptions.find((option) => option.value === value).label;
    }

    onSelectDuration(value) {
        this.state.duration = value;
        this.state.endDateInvalid = false;
        if (value === "custom") {
            // DropdownItem closes the menu after calling onSelected.
            Promise.resolve().then(() => this.dateTimePicker.open(0));
        } else {
            this.dateTimePicker.close();
        }
    }

    onClickDuration(ev) {
        if (this.dateTimePicker.isOpen()) {
            ev.stopImmediatePropagation();
            this.dateTimePicker.close();
        }
    }

    onClickAddOption() {
        this.state.options.push({ label: "" });
    }

    onClickRemoveOption(index) {
        this.state.options.splice(index, 1);
    }

    async onClickSubmit() {
        this.state.submitted = true;
        const duration =
            this.state.duration === "custom"
                ? this.dateTimePickerProps.value &&
                  this.dateTimePickerProps.value.diff(luxon.DateTime.now(), "minutes").minutes
                : parseInt(this.state.duration);
        this.state.endDateInvalid = !Number.isFinite(duration) || duration <= 0;
        if (this.optionsMissing || this.questionMissing || this.state.endDateInvalid) {
            return;
        }
        await rpc("/mail/poll/create", {
            allow_multiple_options: this.state.allowMultipleOptions,
            options: this.state.options
                .map(({ emoji, label }) => ({ emoji, label: label.trim() }))
                .filter(({ label }) => label),
            duration,
            question: this.state.question,
            thread_id: this.props.thread.id,
            thread_model: this.props.thread.model,
        });
        this.props.close();
    }

    get optionsMissing() {
        return (
            this.state.submitted &&
            this.state.options.filter(({ label }) => Boolean(label.trim())).length < 2
        );
    }

    get questionMissing() {
        return this.state.submitted && !this.state.question?.trim();
    }
}
