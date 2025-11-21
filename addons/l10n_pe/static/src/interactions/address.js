import { patch } from '@web/core/utils/patch';
import { rpc } from '@web/core/network/rpc';
import { CustomerAddress } from '@portal/interactions/address';

patch(CustomerAddress.prototype, {
    setup() {
        super.setup();
        this.isPeruvianCompany = this.countryCode === 'PE';

        if (this.isPeruvianCompany) {
            this.addressFields = this.addressFields.concat(['l10n_pe_district']);
        }
    },

    // TODO VFE see if this isn't already handled in a more generic way directly through the
    // country address format and address fields
    async onChangeCountry() {
        await this.waitFor(super.onChangeCountry(...arguments));
        if (!this.isPeruvianCompany) return;

        if (this._getSelectedCountryCode() === 'PE') {
            this._showInput('l10n_pe_district');
        } else {
            this._hideInput('l10n_pe_district');
            this.addressForm.l10n_pe_district.value = '';
        }
    },

    async onchangeState() {
        const data = await this.waitFor(super.onchangeState(...arguments));

        // reset district choice on state change (city is already handled in super call)
        if (this.isPeruvianCompany && this._getSelectedCountryCode() == 'PE') {
            this._setFieldChoices('l10n_pe_district', []);
        }

        return data;
    },

    async onChangeCity() {
        await this.waitFor(super.onChangeCity(...arguments));

        if (!this.isPeruvianCompany || this._getSelectedCountryCode() !== 'PE') {
            return
        }
        const cityId = parseInt(this.addressForm.city_id.value);
        let data = {};
        if (cityId)  {
            data = await this.waitFor(rpc(`/my/address/city_info/${cityId}`, {}));
        }
        this._setFieldChoices('l10n_pe_district', data.districts || []);
    }

});
