import { Component, proxy, useProps, signal, t } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { Dialog } from "@web/core/dialog/dialog";
import { SelectMenu } from "@web/core/select_menu/select_menu";
import { useAutofocus, useService } from "@web/core/utils/hooks";
import { isValidPhone } from "@point_of_sale/utils";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { PillsSelectionPopup } from "@pos_self_order/app/components/pills_selection_popup/pills_selection_popup";
import { _t } from "@web/core/l10n/translation";

class NoPrefillSelectMenu extends SelectMenu {
    updateInputValue(value = null) {
        for (const ref of Object.values(this.inputRefs)) {
            const el = ref();
            if (el) {
                el.value = value || this.pendingValue || "";
            }
        }
    }
}

const { DateTime } = luxon;
export class PresetInfoPopup extends Component {
    static template = "pos_self_order.PresetInfoPopup";
    static components = {
        Dialog,
        SelectMenu: NoPrefillSelectMenu,
    };
    props = useProps({
        close: t.function(),
        getPayload: t.function(),
    });

    autofocusRef = signal.ref();

    setup() {
        this.selfOrder = useService("self_order");
        useAutofocus({ ref: this.autofocusRef, mobile: true });
        this.dialog = useService("dialog");

        const partner = this.selfOrder.currentOrder.partner_id;
        const companyStateId = this.selfOrder.config.company_id.country_id.state_ids[0]?.id;
        const companyCountryId = this.selfOrder.config.company_id.country_id.id;

        this.state = proxy({
            name: partner?.name || "",
            email: partner?.email || "",
            phoneCountryId: partner?.country_id?.id || companyCountryId || null,
            phoneLocal: "",
            phoneError: "",
            street: partner?.street || "",
            countryId: partner?.country_id?.id || companyCountryId || null,
            stateId: partner?.state_id?.id || companyStateId || null,
            city: partner?.city || "",
            zip: partner?.zip || "",
            validationError: null,
            isSubmitting: false,
        });
    }

    async setInformations() {
        if (this.state.isSubmitting || !this.checkPhoneFormat()) {
            return;
        }
        this.state.isSubmitting = true;
        this.state.validationError = null;
        try {
            if (this.preset.needsPartner || this.state.phoneLocal) {
                const partnerValues = {
                    name: this.state.name,
                    email: this.state.email,
                    phone: this.getFullPhone(),
                    street: this.state.street,
                    city: this.state.city,
                    country_id: this.state.countryId,
                    state_id: this.state.stateId,
                    zip: this.state.zip,
                };
                const result = await rpc(`/pos-self-order/validate-partner`, {
                    access_token: this.selfOrder.access_token,
                    preset_id: this.preset?.id,
                    ...partnerValues,
                });
                if (this.handleValidationErrors(result)) {
                    return;
                }
                result["res.partner"][0] = { ...result["res.partner"][0], ...partnerValues };
                const connectedData = this.selfOrder.models.connectNewData(result);
                this.selfOrder.data.synchronizeServerDataInIndexedDB(result);
                this.setPartnerAndOrderName(connectedData["res.partner"][0]);
                this.selfOrder.currentOrder.partner_id = connectedData["res.partner"][0];
            } else {
                this.selfOrder.currentOrder.floating_order_name = this.state.name;
            }

            this.props.getPayload({ ...this.state, phone: this.getFullPhone() });
            this.props.close();
        } finally {
            this.state.isSubmitting = false;
        }
    }

    handleValidationErrors(result) {
        if (result?.error) {
            this.state.validationError = result.error;
            return true;
        }
        return false;
    }

    setPartnerAndOrderName(partner) {
        if (this.preset.needsPartner) {
            this.selfOrder.currentOrder.floating_order_name = `${this.preset.name} - ${this.state.name}`;
        } else {
            this.selfOrder.currentOrder.floating_order_name = this.state.name;
        }
        this.selfOrder.currentOrder.partner_id = partner;
    }

    get otherPresets() {
        const currentPresetId = this.selfOrder.currentOrder?.preset_id?.id;
        return this.selfOrder.models["pos.preset"].filter((p) => p.id !== currentPresetId);
    }

    async selectPreset(preset) {
        const currentPreset = this.selfOrder.currentOrder?.preset_id;
        // Remove delivery lines when switching away from delivery
        if (currentPreset?.service_at === "delivery") {
            const deliveryProduct = currentPreset.delivery_product_id;
            if (deliveryProduct) {
                const toDelete = this.selfOrder.currentOrder.lines.filter(
                    (l) => l.product_id?.id === deliveryProduct.id
                );
                for (const line of toDelete) {
                    this.selfOrder.removeLine(line);
                }
            }
        }
        this.selfOrder.currentOrder.setPreset(preset);
        this.state.selectedSlot = null;
        this.state.validationError = null;
        await this.selfOrder.syncPresetSlotAvaibility(preset);
        if (preset.needsSlot) {
            const timingOptions = this.selfOrder.getTimingOptions(preset);
            const result = await makeAwaitable(this.dialog, PillsSelectionPopup, {
                options: timingOptions,
                title: _t("Select a hour"),
                subtitle: _t("Please choose a time slot for your order."),
                selectionType: "time",
            });
            if (result) {
                this.selfOrder.currentOrder.preset_time = DateTime.fromSQL(result);
                this.state.selectedSlot = result;
            }
        }
    }

    close() {
        this.props.close();
    }

    get preset() {
        return this.selfOrder.currentOrder.preset_id;
    }

    get slots() {
        return Object.entries(this.preset.uiState.availabilities).filter(
            (s) => Object.keys(s[1]).length > 0
        );
    }

    get countries() {
        return this.selfOrder.models["res.country"].getAll();
    }

    get states() {
        const country = this.selfOrder.models["res.country"].get(this.state.countryId);
        return country?.state_ids || [];
    }

    get selectedCountry() {
        return this.selfOrder.models["res.country"].get(this.state.phoneCountryId);
    }

    get phoneCode() {
        return this.selectedCountry?.phone_code || "";
    }

    get phoneCountryChoices() {
        return this.countries.map((country) => ({
            value: country.id,
            label: `+${country.phone_code} ${country.name}`,
            country,
        }));
    }

    setPhoneCountry(countryId) {
        this.state.phoneCountryId = countryId;
    }

    flagEmoji(code) {
        return [...code.toUpperCase()]
            .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
            .join("");
    }

    getFullPhone() {
        const trimmedPhoneLocal = this.state.phoneLocal.trim();
        if (trimmedPhoneLocal.startsWith(`+${this.phoneCode}`)) {
            return trimmedPhoneLocal;
        }
        return trimmedPhoneLocal && this.phoneCode ? `+${this.phoneCode}${trimmedPhoneLocal}` : "";
    }

    get validSelection() {
        return this.selfOrder.isValidSelection(this.selfOrder.currentOrder.raw.preset_time, {
            id: parseInt(this.state.selectedPartnerId),
            name: this.state.name,
            email: this.state.email,
            phone: this.getFullPhone(),
            street: this.state.street,
            city: this.state.city,
            country_id: this.state.countryId,
            state_id: this.state.stateId,
            zip: this.state.zip,
        });
    }

    formatDate(date) {
        const dateObj = DateTime.fromFormat(date, "yyyy-MM-dd");
        return this.preset.formatDate(dateObj);
    }

    checkPhoneFormat() {
        return !this.state.phoneLocal || isValidPhone(this.getFullPhone());
    }

    onPhoneInput(event) {
        const phone = event.target.value;
        this.state.phoneLocal = phone;

        if (!phone.trim().startsWith("+")) {
            return;
        }

        let possibleCountryCode = phone
            .trim()
            .slice(1)
            .split(/[\s()-]/, 1)[0]
            .replace(/\D/g, "")
            .slice(0, 4);

        while (possibleCountryCode) {
            const country = this.countries.find(
                (country) => String(country.phone_code) === possibleCountryCode
            );

            if (country) {
                this.state.phoneCountryId = country.id;
                return;
            }

            possibleCountryCode = possibleCountryCode.slice(0, -1);
        }
    }
}
