import { patch } from '@web/core/utils/patch';
import { rpc } from '@web/core/network/rpc';
import { CustomerAddress } from '@portal/interactions/address';

patch(CustomerAddress.prototype, {
    setup() {
        super.setup();
        this.l10nEsIdTypeSelect = this.addressForm.querySelector('#l10n_es_id_type');
        this.l10nEsIdValueInput = this.addressForm.querySelector('#l10n_es_id_value');

        if (this.l10nEsIdTypeSelect) {
            const onTypeChange = () => this._onChangeL10nEsIdType();
            this.l10nEsIdTypeSelect.addEventListener('change', onTypeChange);
            this.registerCleanup(() => this.l10nEsIdTypeSelect.removeEventListener('change', onTypeChange));
        }
    },

    async _onChangeCountry(init = false) {
        const data = await super._onChangeCountry(init);
        await this._refreshL10nEsIdRequired(data);
        return data;
    },

    async onChangeState() {
        await super.onChangeState();
        await this._refreshL10nEsIdRequired();
    },

    /**
     * Re-derive whether the ID-type value is mandatory: any non-EU country, or the
     * Canary Islands/Ceuta/Melilla within Spain (excluded from the mainland+Balearic
     * VAT territory). `baseData`, when available, already carries the country-only
     * verdict from the country_info call the base flow just made; a state is only
     * ever known once picked, so it's fetched separately when relevant.
     */
    async _refreshL10nEsIdRequired(baseData) {
        if (!this.l10nEsIdValueInput) return;

        const countryId = parseInt(this.addressForm.country_id.value);
        if (!countryId) return;

        const stateId = this.addressForm.state_id.value;
        let required = baseData?.l10n_es_id_required;
        if (stateId || !baseData) {
            const data = await this.waitFor(rpc(
                `/my/address/country_info/${countryId}`,
                { address_type: this.addressType, state_id: stateId },
            ));
            required = data.l10n_es_id_required;
        }

        this.l10nEsIdValueInput.required = !!required;
        const label = this.el.querySelector(`label[for="${this.l10nEsIdValueInput.id}"]`);
        label?.classList.toggle('label-optional', !required);
    },

    _onChangeL10nEsIdType() {
        this.l10nEsIdValueInput.name = this.l10nEsIdTypeSelect.value;
    },
});
