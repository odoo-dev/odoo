/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget";
import { _t } from "@web/core/l10n/translation";
import { KeepLast } from "@web/core/utils/concurrency";
import { rpc } from "@web/core/network/rpc";
import { Component } from "@odoo/owl";
import { LocationSelectorDialog } from '@website_sale/js/location_selector/location_selector_dialog/location_selector_dialog';

publicWidget.registry.websiteSaleDelivery = publicWidget.Widget.extend({
    selector: '.oe_website_sale',
    events: {
        'change select[name="shipping_id"]': '_onSetAddress',
        'click .o_delivery_carrier_select': '_onCarrierClick',
        'click [name="o_delivery_location_selector"]': '_onClickSelectLocation',
        'click [name="o_delivery_location_selector_edit"]': '_onClickEditLocation',
        'click .o_payment_option_card': '_onClickPaymentMethod',
    },

    /**
     * @override
     */
    start: async function () {
        this.carriers = Array.from(document.querySelectorAll('input[name="o_delivery_carrier"]'));
        this.keepLast = new KeepLast();
        // Workaround to:
        // - update the amount/error on the label at first rendering
        // - prevent clicking on 'Pay Now' if the shipper rating fails
        if (this.carriers.length > 0) {
            const carrierChecked = this.carriers.filter(e =>e.checked)
            if (carrierChecked.length === 0) {
                this._disablePayButton();
            } else {
                carrierChecked[0].click();
            }
            await this._getCurrentLocation();
        }

        await this.carriers.forEach(async (carrierInput) => {
            this._showLoading((carrierInput));
            await this._getCarrierRateShipment(carrierInput);
        });
        if (this._super && typeof(this._super.apply)==="function") {
          return this._super.apply(this, arguments);
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------
    /**
     * @private
     */
    _getCurrentLocation: async function () {
        const data = await rpc("/shop/access_point/get");
        const carriers = document.querySelectorAll('.o_delivery_carrier_select')
        for (let carrier of carriers) {
            const deliveryType = carrier.querySelector('input[type="radio"]').dataset.deliveryType;
            const deliveryName = carrier.querySelector('label').innerText;
            const showLoc = carrier.querySelector('button[name="o_delivery_location_selector"]');
            if (!showLoc) {
                continue;
            }
            const orderLoc = carrier.querySelector(".o_order_location");
            if (data[deliveryType + '_access_point'] && data.delivery_name == deliveryName) {
                orderLoc.querySelector(".o_order_location_name").innerText = data.name
                orderLoc.nextElementSibling.dataset.locationId = data.id
                orderLoc.nextElementSibling.dataset.zipCode = data.zip
                orderLoc.querySelector(".o_order_location_address").innerText = data[deliveryType + '_access_point']
                orderLoc.parentElement.classList.remove("d-none");
                showLoc.classList.add("d-none");
                break;
            } else {
                orderLoc.parentElement.classList.add("d-none");
                showLoc.classList.remove("d-none");
            }
        }
    },

    /**
     * @private
     * @param {Element} carrierInput
     */
    _showLoading: function (carrierInput) {
        const priceTag = carrierInput.parentNode.querySelector('.o_wsale_delivery_badge_price')
        while (priceTag.firstChild) {
            priceTag.removeChild(priceTag.lastChild);
        }
        const loadingCircle = priceTag.appendChild(document.createElement('span'));
        loadingCircle.classList.add("fa", "fa-circle-o-notch", "fa-spin");
    },

    /**
     * Update the total cost according to the selected shipping method
     *
     * @private
     * @param {float} amount : The new total amount of to be paid
     */
    _updateShippingCost: function(amount) {
        Component.env.bus.trigger('update_shipping_cost', amount);
    },

     /**
     * Get the rate shipment of a carrier
     *
     * @private
     * @params {Object} carrier: The carrier element
     */
    _getCarrierRateShipment: async function(carrierInput) {
        const result = await rpc('/shop/carrier_rate_shipment', {
            'carrier_id': carrierInput.value,
        });
        this._handleCarrierUpdateResultBadge(result);
    },

    /**
     * @private
     * @param {Object} result
     */
    _handleCarrierUpdateResult: async function (carrierInput) {
        const result = await rpc('/shop/update_carrier', {
            'carrier_id': carrierInput.value,
        })
        this.result = result;
        this._handleCarrierUpdateResultBadge(result);
        if (carrierInput.checked) {
            var amountDelivery = document.querySelector('#order_delivery .monetary_field');
            var amountUntaxed = document.querySelector('#order_total_untaxed .monetary_field');
            var amountTax = document.querySelector('#order_total_taxes .monetary_field');
            var amountTotal = document.querySelectorAll('#order_total .monetary_field, #amount_total_summary.monetary_field');

            amountDelivery.innerHTML = result.new_amount_delivery;
            amountUntaxed.innerHTML = result.new_amount_untaxed;
            amountTax.innerHTML = result.new_amount_tax;
            amountTotal.forEach(total => total.innerHTML = result.new_amount_total);
            // we need to check if it's the carrier that is selected
            if (result.new_amount_total_raw !== undefined) {
                this._updateShippingCost(result.new_amount_total_raw);
                // reload page only when amount_total switches between zero and not zero
                const hasPaymentMethod = document.querySelector(
                    "div[name='o_website_sale_free_cart']"
                ) === null;
                const shouldDisplayPaymentMethod = result.new_amount_total_raw !== 0;
                if (hasPaymentMethod !==  shouldDisplayPaymentMethod) {
                    location.reload(false);
                }
            }
            this._updateShippingCost(result.new_amount_delivery);
        }
        this._enableButton(result.status);
    },

    /**
     * @private
     * @param {Object} result
     */
    _handleCarrierUpdateResultBadge: function (result) {
        var $carrierBadge = $('#delivery_carrier input[name="o_delivery_carrier"][value=' + result.carrier_id + '] ~ .o_wsale_delivery_badge_price');

        if (result.status === true) {
             // if free delivery (`free_over` field), show 'Free', not '$0'
             if (result.is_free_delivery) {
                 $carrierBadge.text(_t('Free'));
             } else {
                 $carrierBadge.html(result.new_amount_delivery);
             }
             $carrierBadge.removeClass('o_wsale_delivery_carrier_error');
        } else {
            $carrierBadge.addClass('o_wsale_delivery_carrier_error');
            $carrierBadge.text(result.error_message);
        }
    },

    /**
     * Disable the payment button.
     *
     * @private
     * @return {void}
     */
    _disablePayButton: function (){
        Component.env.bus.trigger('disablePaymentButton');
    },

    _disablePayButtonNoPickupPoint : function (ev){
        const selectedCarrierEl = ev.currentTarget.closest('.o_delivery_carrier_select');
        const locationSelectorButton = selectedCarrierEl.querySelector(
            'button[name="o_delivery_location_selector"]'
        );

        document.querySelectorAll('.error_no_pick_up_point').forEach(el => el.remove());

        // If the location selection button is on page that means that no location is selected.
        if (locationSelectorButton) {
            this._disablePayButton();
            const errorNode = document.createElement("i");
            errorNode.classList.add("small", "error_no_pick_up_point","ms-2");
            errorNode.textContent = _t("Select a pick-up point");
            errorNode.style = "color:red;";
            selectedCarrierEl.insertBefore(
                errorNode, selectedCarrierEl.querySelector("label").nextElementSibling
            );
        }
    },

    _onClickPaymentMethod: async function (ev) {
        const carriers = Array.from(document.querySelectorAll('.o_delivery_carrier_select'))
        if(carriers.length === 0){
            return;
        }
        this._disablePayButton();
        let carrierChecked = null;
        carriers.forEach((carrier) => {
            if (carrier.querySelector('input').checked){
                carrierChecked = carrier;
            }
        })
        if (!carrierChecked) {
            return;
        }
        const carrier_id = carrierChecked?.querySelector('input')?.value;
        const result = await rpc('/shop/update_carrier', {
            'carrier_id': carrier_id,
            'no_reset_access_point_address': true,
        })
        this._enableButton(result.status);
    },

    /**
     * Enable the payment button if the rate_shipment request succeeded.
     *
     * @private
     * @param {boolean} status - The status of the rate_shipment request.
     * @return {void}
     */
    _enableButton(status){
        if (status) {
            Component.env.bus.trigger('enablePaymentButton');
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickEditLocation: async function (ev) {
        const {
            carrierId,
            zipCode,
            locationId,
        } = ev.currentTarget.dataset;
        this._openLocationSelector(
            carrierId,
            zipCode,
            locationId,
        );
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onCarrierClick: async function (ev) {
        const radio = ev.currentTarget.closest('.o_delivery_carrier_select').querySelector(
            'input[type="radio"]'
        );

        this._disablePayButton();
        this._showLoading(radio);
        radio.checked = true;
        await this._handleCarrierUpdateResult(radio);
        this._disablePayButtonNoPickupPoint(ev);
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onClickSelectLocation: async function (ev) {
        const {
            carrierId,
            zipCode,
        } = ev.currentTarget.dataset
        this._openLocationSelector(carrierId, zipCode);
    },

    _openLocationSelector(
        carrierId,
        zipCode,
        selectedLocationId=false
    ) {
        this.call('dialog', 'add', LocationSelectorDialog, {
            carrierId: parseInt(carrierId),
            zipCode: zipCode,
            selectedLocationId: selectedLocationId,
            save: async (carrierId, location) => {
                // Set the access point on the sale order
                await rpc('/shop/access_point/set', {
                    access_point_encoded: location.address_stringified,
                })

                // Update the delivery method on the page
                const carrier = document.querySelector(
                    'input[name="o_delivery_carrier"][value="'+carrierId+'"]'
                ).parentElement;
                const orderLoc = carrier.querySelector('.o_order_location');
                orderLoc.querySelector('.o_order_location_name').innerText = location.pick_up_point_name;
                orderLoc.nextElementSibling.dataset.locationId = location.id;
                orderLoc.nextElementSibling.dataset.zipCode = location.pick_up_point_postal_code;
                orderLoc.querySelector('.o_order_location_address').innerText = location.address;
                orderLoc.parentElement.classList.remove('d-none');
                carrier.querySelector('button[name="o_delivery_location_selector"]').classList.add('d-none');
                document.querySelectorAll('.error_no_pick_up_point').forEach(el => el.remove());

                // Enable the payment button
                const result = await rpc('/shop/update_carrier', {
                    'carrier_id': carrierId,
                    'no_reset_access_point_address': true,
                })
                this._enableButton(result.status);
            },
        });
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onSetAddress: function (ev) {
        var value = $(ev.currentTarget).val();
        var $providerFree = $('select[name="country_id"]:not(.o_provider_restricted), select[name="state_id"]:not(.o_provider_restricted)');
        var $providerRestricted = $('select[name="country_id"].o_provider_restricted, select[name="state_id"].o_provider_restricted');
        if (value === 0) {
            // Ship to the same address : only show shipping countries available for billing
            $providerFree.hide().attr('disabled', true);
            $providerRestricted.show().attr('disabled', false).change();
        } else {
            // Create a new address : show all countries available for billing
            $providerFree.show().attr('disabled', false).change();
            $providerRestricted.hide().attr('disabled', true);
        }
    },
});
