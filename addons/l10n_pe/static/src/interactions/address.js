import { patch } from '@web/core/utils/patch';
import { rpc } from '@web/core/network/rpc';
import { CustomerAddress } from '@portal/interactions/address';

patch(CustomerAddress.prototype, {
    setup() {
        super.setup();
        this.isPeruvianCompany = this.countryCode === 'PE';

        if (this.isPeruvianCompany) {
            this.elementDistricts = this.addressForm.l10n_pe_district;
        }
    },

    async onChangeCity() {
        await super.onChangeCity();
        if (!this.isPeruvianCompany || this._getSelectedCountryCode() !== 'PE') return;

        const cityId = this.elementCities.value;
        let choices = [];
        if (cityId) {
            const data = await this.waitFor(rpc(`/portal/city_infos/${cityId}`, {}));
            choices = data.districts;
        }
        this._changeOption(this.elementDistricts, choices);
    },

    async _onChangeCountry(init=false) {
        await this.waitFor(super._onChangeCountry(...arguments));
            this.addressFields = this.addressFields.concat(['l10n_pe_district']);
        }
    },

    async onChangeCountry() {
        await this.waitFor(super.onChangeCountry(...arguments));
        if (!this.isPeruvianCompany) return;

        if (this._getSelectedCountryCode() !== 'PE') {
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
