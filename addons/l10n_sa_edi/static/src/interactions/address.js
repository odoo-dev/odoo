import { patch } from '@web/core/utils/patch';
import { CustomerAddress } from '@portal/interactions/address';
import { patchDynamicContent } from '@web/public/utils';

patch(CustomerAddress.prototype, {
    setup() {
        super.setup();
        this.isSaCompany = this.countryCode === 'SA';
        patchDynamicContent(this.dynamicContent, {
            'select[name="l10n_sa_edi_additional_identification_scheme"]': { 't-on-change': this._onChangeL10nSaScheme.bind(this) },
        });
        if (this.isSaCompany) {
            this.l10n_sa_edi_building_number = this.addressForm.l10n_sa_edi_building_number;
            this.l10n_sa_edi_plot_identification = this.addressForm.l10n_sa_edi_plot_identification;
            this.l10n_sa_edi_additional_identification_scheme = this.addressForm.l10n_sa_edi_additional_identification_scheme;
            this.l10n_sa_edi_additional_identification_number = this.addressForm.l10n_sa_edi_additional_identification_number;
        }
    },

    async _setReadOnly(name) {
        this.addressForm[name].readOnly = true;
    },

    async _getSelectedL10nSaScheme() {
        return this.addressForm['l10n_sa_edi_additional_identification_scheme'].value
    },

    async _onChangeCountry(init=false) {
        await this.waitFor(super._onChangeCountry(...arguments));
        if (!this.isSaCompany) return;

        if (this._getSelectedCountryCode() === 'SA') {
            this._showInput('l10n_sa_edi_building_number');
            this._showInput('l10n_sa_edi_plot_identification');
            this._showInput('l10n_sa_edi_additional_identification_scheme');
            this._showInput('l10n_sa_edi_additional_identification_number');
        } else {
            this._hideInput('l10n_sa_edi_building_number');
            this._hideInput('l10n_sa_edi_plot_identification');
            this._hideInput('l10n_sa_edi_additional_identification_scheme');
            this._hideInput('l10n_sa_edi_additional_identification_number');
        }
    },

    async _onChangeL10nSaScheme() {
        let scheme = await this._getSelectedL10nSaScheme()
        if (scheme === 'TIN') {
            this._setReadOnly('l10n_sa_edi_additional_identification_number')
        }
    }
});
