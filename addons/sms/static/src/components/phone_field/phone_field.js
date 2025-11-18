import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { PhoneField, phoneField, FormPhoneField, formPhoneField } from "@web/views/fields/phone/phone_field";
import { SendSMSButton } from '@sms/components/sms_button/sms_button';

patch(PhoneField, {
    components: {
        ...PhoneField.components,
        SendSMSButton
    },
    defaultProps: {
        ...PhoneField.defaultProps,
        enableButton: true,
    },
    props: {
        ...PhoneField.props,
        enableButton: { type: Boolean, optional: true },
    },
});

const patchDescr = () => ({
    extractProps({ options }) {
        const props = super.extractProps(...arguments);
        props.enableButton = options.enable_sms;
        return props;
    },
    supportedOptions: [{
        label: _t("Enable SMS"),
        name: "enable_sms",
        type: "boolean",
        default: true,
    }],
});

patch(phoneField, patchDescr());
patch(formPhoneField, patchDescr());

patch(FormPhoneField.prototype, {
    get inputLinks() {
        if (!this.props.enableButton) {
            return super.inputLinks;
        }
        return [
            ...super.inputLinks,
            {
                icon: "fa-mobile",
                href: "sms:" + this.props.record.data[this.props.name].replace(/\s+/g, ""),
                name: _t("SMS"),
            },
        ];
    },
});
