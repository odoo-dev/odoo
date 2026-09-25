import { CreatePollOptionDialog } from "@mail/core/common/create_poll_option_dialog";

import { Component, computed, proxy, signal, types, useProps } from "@odoo/owl";

import { useDateTimePicker } from "@web/core/datetime/datetime_picker_hook";
import { Dialog } from "@web/core/dialog/dialog";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { formatDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { useAutofocus, useService } from "@web/core/utils/hooks";

export class CreatePollDialog extends Component {
    static template = "mail.CreatePollDialog";
    static components = { Dialog, Dropdown, DropdownItem, CreatePollOptionDialog };

    questionRef = signal.ref();
    durationRef = signal.ref();
    customEndDate = signal(null);
    durationLabel = computed(() =>
        this.state.duration === "custom"
            ? this.customEndDate()
                ? formatDateTime(this.customEndDate(), { showSeconds: false })
                : _t("Custom")
            : this.durationOptions.find(({ value }) => value === this.state.duration).label
    );
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
        });
        this.dateTimePicker = useDateTimePicker({
            target: this.durationRef,
            pickerProps: {
                type: "datetime",
                rounding: 1,
                value: null,
            },
            showSeconds: false,
            showResetButton: false,
            onClose: () => {
                if (this.state.duration === "custom" && this.dateTimePicker.state.value) {
                    this.customEndDate.set(this.dateTimePicker.state.value);
                    this.state.endDateInvalid = false;
                }
            },
        });
    }

    onSelectDuration(value) {
        if (value === "custom" && this.state.duration !== "custom") {
            this.customEndDate.set(null);
            this.dateTimePicker.state.value = null;
        }
        this.state.duration = value;
        this.state.endDateInvalid = false;
        if (value === "custom") {
            // DropdownItem closes the menu after calling onSelected.
            Promise.resolve().then(() => this.dateTimePicker.open(0));
        } else {
            this.dateTimePicker.close();
        }
    }

    onClickAddOption() {
        this.state.options.push({ label: "" });
    }

    onClickDuration(ev) {
        if (this.dateTimePicker.isOpen()) {
            ev.stopPropagation();
            this.dateTimePicker.close();
        }
    }
    onClickRemoveOption(index) {
        this.state.options.splice(index, 1);
    }

    async onClickSubmit() {
        this.state.submitted = true;
        const duration =
            this.state.duration === "custom"
                ? this.customEndDate()?.diff(luxon.DateTime.now(), "minutes").minutes
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
