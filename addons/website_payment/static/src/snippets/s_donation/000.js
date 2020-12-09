odoo.define('website.s_donation', function (require) {
'use strict';

const publicWidget = require('web.public.widget');

const Donation = publicWidget.Widget.extend({
    selector: '.s_donation',
    disabledInEditableMode: false,
    events: {
        'click .s_donation_btn': '_onClickPrefilledButton',
        'focus #s_donation_amount_input': '_onFocusOwnAmountInput',
        'input #s_donation_range_slider': '_onInputRangeSlider',
    },

    /**
     * @override
     */
    start: function () {
        this.layout = this.$target.find('.s_donation_input_container')[0].dataset.donationLayout;
        if (this.layout === 'slider') {
            this.$rangeSlider = this.$target.find('#s_donation_range_slider');
            this.$rangeSlider.val(this.$rangeSlider[0].dataset.defaultValue);
            this._setBubble(this.$rangeSlider);
        } else if (this.layout === 'freeAmount') {
            this.$amountInput = this.$target.find('#s_donation_amount_input');
            this.$target.find('.s_donation_minimum_value').text(this.$amountInput[0].min);
        }
        return this._super(...arguments);
    },
    /**
     * @override
     */
    destroy: function () {
        this._deselectPrefilledButtons();
        this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    cleanForSave: function () {
        this._deselectPrefilledButtons();
        this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _deselectPrefilledButtons: function () {
        const $prefilledButtons = this.$target.find('.s_donation_btn');
        $prefilledButtons.removeClass('active');
    },
    /**
     * @private
     * @param {jQuery} $range
     */
    _setBubble: function ($range) {
        const $bubble = this.$target.find('.s_range_bubble');
        const val = $range.val();
        const min = $range[0].min || 0;
        const max = $range[0].max || 100;
        const newVal = Number(((val - min) * 100) / (max - min));
        const tipOffsetLow = 8 - (newVal * 0.16); // the range thumb size is 16px*16px. The '8' and the '0.16' are related to that 16px (50% and 1% of 16px)
        $bubble[0].textContent = val;

        // Sorta magic numbers based on size of the native UI thumb (source: https://css-tricks.com/value-bubbles-for-range-inputs/)
        $bubble[0].style.left = `calc(${newVal}% + (${tipOffsetLow}px))`;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickPrefilledButton: function (ev) {
        const $button = $(ev.target);
        const isActive = $button.is('.active');
        this._deselectPrefilledButtons();
        $button.toggleClass('active', !isActive);
        this.$target.find('#s_donation_amount_input').val('');
        if (this.layout === 'slider') {
            this.$rangeSlider.val($button[0].dataset.donationValue);
            this._setBubble(this.$rangeSlider);
        } else if (this.layout === 'freeAmount') {
            this.$amountInput.val($button[0].dataset.donationValue);
        }
    },
    /**
     * @private
     */
    _onFocusOwnAmountInput: function (ev) {
        this._deselectPrefilledButtons();
    },
    /**
     * @private
     */
    _onInputRangeSlider: function (ev) {
        this._deselectPrefilledButtons();
        this._setBubble($(ev.target));
    },
});

publicWidget.registry.donationSnippet = Donation;

return Donation;
});
