odoo.define('website_payment.s_donation_options', function (require) {
'use strict';

const core = require('web.core');
const snippetOptions = require('web_editor.snippets.options');
const options = require('web_editor.snippets.options');
const qweb = core.qweb;
const _t = core._t;

snippetOptions.registry.Donation = snippetOptions.SnippetOptionWidget.extend({
    xmlDependencies: ['/website_payment/static/src/snippets/s_donation/000.xml'],
    events: _.extend({}, options.Class.prototype.events || {}, {
        'input .o_we_prefilled_options_list input[type="text"]': '_onInputPrefilledOptionsText',
        'input .o_we_prefilled_options_list input[type="number"]': '_onInputPrefilledOptionsValue',
        'click we-button.o_we_remove_prefilled_option': '_onClickRemoveButton',
    }),

    /**
     * @override
     */
    start: function () {
        this.layout = this.$target.find('.s_donation_input_container')[0].dataset.donationLayout;
        this.description = this.$target.find('.s_donation_description').length > 0;
        this._buildPrefilledOptionsList();
        return this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    cleanForSave: function () {
        if (this.layout === 'slider') {
            this.$rangeSlider = this.$target.find('#s_donation_range_slider');
            this.$rangeSlider[0].dataset.defaultValue = this.$rangeSlider.val();
        }
        const $prefilledButtons = this.$target.find('.s_donation_prefilled_buttons');
        if ($prefilledButtons.hasClass('d-none')) {
            $prefilledButtons.removeClass('d-none')
            $prefilledButtons.empty();
        };
    },

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Show/hide prefilled buttons.
     *
     * @see this.selectClass for parameters
     */
    togglePrefilledOptions: function (previewMode, widgetValue, params) {
        const $prefilledButtons = this.$target.find('.s_donation_prefilled_buttons');
        if (widgetValue) {
            if ($prefilledButtons.hasClass('d-none')) {
                $prefilledButtons.removeClass('d-none');
            } else {
                $prefilledButtons.append($(qweb.render(`website_payment.donation.prefilledButtons`)));
                this._buildPrefilledOptionsList();
            }
        } else {
            $prefilledButtons.addClass('d-none')
        }
        this.$el.find('.o_we_prefilled_options_list').toggleClass('d-none', !widgetValue);
    },
    /**
     * Show/hide description of prefilled buttons.
     *
     * @see this.selectClass for parameters
     */
    toggleOptionDescription: function (previewMode, widgetValue, params) {
        const $prefilledButtonsContainer = this.$target.find('.s_donation_prefilled_buttons');
        $prefilledButtonsContainer.toggleClass('my-4', widgetValue);
        this.description = widgetValue;
        this._saveDescriptions();
        this._renderPrefilledButtons();
    },
    /**
     * Add a new prefilled button.
     *
     * @see this.selectClass for parameters
     */
    addPrefilledOption: function (previewMode, widgetValue, params) {
        const $prefilledOptionsTable = this.$el.find('.o_we_prefilled_options_list .oe_we_table_wraper > table');
        this._buildPrefilledOptionsItem('$50', 50, $prefilledOptionsTable[0]);
        this._saveDescriptions();
        this._renderPrefilledButtons();
    },
    /**
     * Select an amount input
     *
     * @see this.selectClass for parameters
     */
    selectAmountInput: function (previewMode, widgetValue, params) {
        const $inputContainer = this.$target.find('.s_donation_input_container');
        if (previewMode === 'reset') {
            $inputContainer.empty().append(this.prevTemplate);
            $inputContainer[0].dataset.donationLayout = this.prevLayout;
        } else {
            if (previewMode === true) {
                this.prevTemplate = $inputContainer.html();
                this.prevLayout = $inputContainer[0].dataset.donationLayout;
            }
            $inputContainer.empty();
            $inputContainer[0].dataset.donationLayout = widgetValue;
            if (widgetValue) {
                $inputContainer.append($(qweb.render(`website_payment.donation.${widgetValue}`)));
            }
            if (previewMode === false) {
                this.prevTemplate = $inputContainer.html();
                this.prevLayout = $inputContainer[0].dataset.donationLayout;
                this.layout = widgetValue;
            }
        }
    },
    /**
     * Choose the minimum possible value of a donation
     *
     * @see this.selectClass for parameters
     */
    minimumDonation: function (previewMode, widgetValue, params) {
        if (this.layout === 'slider') {
            const $rangeSlider = this.$target.find('#s_donation_range_slider');
            $rangeSlider[0].min = parseInt(widgetValue);
        } else if (this.layout === 'freeAmount') {
            const $amountInput = this.$target.find('#s_donation_amount_input');
            $amountInput[0].min = parseInt(widgetValue);
        }
    },
    /**
     * Choose the maximum value of the slider
     *
     * @see this.selectClass for parameters
     */
    maximumDonation: function (previewMode, widgetValue, params) {
        const $rangeSlider = this.$target.find('#s_donation_range_slider');
        $rangeSlider[0].max = parseInt(widgetValue);
    },
    /**
     * Choose the step value of the slider
     *
     * @see this.selectClass for parameters
     */
    sliderStep: function (previewMode, widgetValue, params) {
        const $rangeSlider = this.$target.find('#s_donation_range_slider');
        $rangeSlider[0].step = parseInt(widgetValue);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _computeWidgetState: function (methodName, params) {
        switch (methodName) {
            case 'togglePrefilledOptions': {
                return this.$target.find('.s_donation_btn').length > 0 && !this.$target.find('.s_donation_prefilled_buttons').hasClass('d-none');
            }
            case 'toggleOptionDescription': {
                return this.description;
            }
            case 'selectAmountInput': {
                return this.layout;
            }
            case 'minimumDonation': {
                if (this.layout === "slider") {
                    return this.$target.find('#s_donation_range_slider')[0].min;
                } else if (this.layout === "freeAmount") {
                    return this.$target.find('#s_donation_amount_input')[0].min;
                }
            }
            case 'maximumDonation': {
                return this.layout === "slider" ? this.$target.find('#s_donation_range_slider')[0].max : '';
            }
            case 'sliderStep': {
                return this.layout === "slider" ? this.$target.find('#s_donation_range_slider')[0].step : '';
            }
        }
        return this._super(...arguments);
    },
    /**
     * Build the prefilled options list in the editor panel
     *
     * @private
     */
    _buildPrefilledOptionsList: function () {
        const $prefilledOptionsTable = this.$el.find('.o_we_prefilled_options_list .oe_we_table_wraper > table');
        const $prefilledButtons = this.$target.find('.s_donation_btn');
        // empty the table before rebuilding it
        $prefilledOptionsTable.empty();
        // build an item in the options list of each prefilled button present in the DOM
        _.each($prefilledButtons, el => {
            this._buildPrefilledOptionsItem(el.textContent, el.dataset.donationValue, $prefilledOptionsTable[0]);
        });
        this._makeListItemsSortable();
    },
    /**
     * Build an item in the the prefilled options list
     *
     * @private
     * @param {string} btnText the text content of the button
     * @param {number} donationValue the donation value
     * @param {HTMLElement} tableEl the table that contains the prefilled options list
     */
    _buildPrefilledOptionsItem: function (btnText, donationValue, tableEl) {
        // build the <tr>
        const trEl = document.createElement('tr');
        // build the <td> with the drag button
        const draggableEl = document.createElement('we-button');
        draggableEl.classList.add('o_we_drag_handle', 'o_we_link', 'fa', 'fa-fw', 'fa-arrows');
        draggableEl.dataset.noPreview = 'true';
        const draggableTdEl = document.createElement('td');
        draggableTdEl.appendChild(draggableEl);
        trEl.appendChild(draggableTdEl);
        // build the <th> with the text input
        const inputTextEl = document.createElement('input');
        inputTextEl.type = "text";
        inputTextEl.value = btnText;
        const inputTextThEl = document.createElement('th');
        inputTextThEl.appendChild(inputTextEl);
        trEl.appendChild(inputTextThEl);
        // build the <td> with the 'value:' label
        const valueLabelTdEl = document.createElement('td');
        valueLabelTdEl.classList.add('text-right', 'pr-1', 'overflow-hidden');
        valueLabelTdEl.textContent = _t('Value: ');
        trEl.appendChild(valueLabelTdEl);
        // build the <td> with the value
        const inputValueEl = document.createElement('input');
        inputValueEl.type = "number";
        inputValueEl.placeholder = "0";
        inputValueEl.value = donationValue;
        const inputValueTdEl = document.createElement('td');
        inputValueTdEl.classList.add('pr-2');
        inputValueTdEl.appendChild(inputValueEl);
        trEl.appendChild(inputValueTdEl);
        // build an hidden <td> for desciptions
        const descriptionTdEl = document.createElement('td');
        descriptionTdEl.textContent =  _t('Add here a description of what the donation will be used for.');
        descriptionTdEl.classList.add('o_we_prefilled_option_description', 'd-none');
        trEl.appendChild(descriptionTdEl);
        // build the <td> with the remove button
        const removeButtonEl = document.createElement('we-button');
        removeButtonEl.classList.add('o_we_remove_prefilled_option', 'o_we_text_danger', 'o_we_link', 'fa', 'fa-fw', 'fa-minus');
        removeButtonEl.dataset.noPreview = 'true';
        const removeButtonTdEl = document.createElement('td');
        removeButtonTdEl.appendChild(removeButtonEl);
        trEl.appendChild(removeButtonTdEl);
        // Add the <tr> to the table
        tableEl.appendChild(trEl);
    },

    /**
     * Rebuild the buttons in the DOM
     *
     * @private
     */
    _renderPrefilledButtons: function () {
        const $prefilledButtonsContainer = this.$target.find('.s_donation_prefilled_buttons');
        const $prefilledOptionsListItems = this.$el.find('.o_we_prefilled_options_list .oe_we_table_wraper > table > tr');
        $prefilledButtonsContainer.empty();
        _.each($prefilledOptionsListItems, el => {
            const divEl = document.createElement('div');
            const prefilledButtonEl = document.createElement('button');
            prefilledButtonEl.classList.add('s_donation_btn', 'btn', 'btn-outline-primary', 'btn-lg', 'o_not_editable');
            prefilledButtonEl.textContent = el.querySelector('input[type="text"]').value;
            prefilledButtonEl.dataset.donationValue = el.querySelector('input[type="number"]').value;
            prefilledButtonEl.setAttribute('contenteditable', false);
            if (this.description) {
                prefilledButtonEl.classList.add('mr-3');
                divEl.classList.add('d-sm-flex', 'align-items-center', 'my-3');
                divEl.appendChild(prefilledButtonEl);
                const pEl = document.createElement('p');
                pEl.classList.add('s_donation_description', 'mt-2', 'my-sm-auto', 'text-muted');
                const iEl = document.createElement('i');
                iEl.textContent = el.querySelector('.o_we_prefilled_option_description').textContent;
                pEl.appendChild(iEl);
                divEl.appendChild(pEl);
                $prefilledButtonsContainer[0].appendChild(divEl);
            } else {
                prefilledButtonEl.classList.add('mb-2', 'mr-1');
                $prefilledButtonsContainer[0].appendChild(prefilledButtonEl);
                // We need the following line to keep the same space between buttons as in the default template
                $prefilledButtonsContainer[0].appendChild(document.createTextNode(' '));
            }
        });
    },
    /**
     * @private
     */
    _saveDescriptions: function () {
        const $prefilledOptionsListDescriptions = this.$el.find('.o_we_prefilled_option_description');
        const $prefilledButtonsDescriptions = this.$target.find('.s_donation_description');
        let i = 0;
        _.each($prefilledButtonsDescriptions, el => {
            if ($prefilledOptionsListDescriptions[i]) {
                $prefilledOptionsListDescriptions[i].textContent = el.textContent;
            }
            i++;
        });
    },
    /**
     * @private
     */
    _makeListItemsSortable: function () {
        const $prefilledOptionsTable = this.$el.find('.o_we_prefilled_options_list .oe_we_table_wraper > table');
        $prefilledOptionsTable.sortable({
            axis: 'y',
            handle: '.o_we_drag_handle',
            items: 'tr',
            cursor: 'move',
            opacity: 0.6,
            start: (event, ui) => {
                this._saveDescriptions();
            },
            stop: (event, ui) => {
                this._renderPrefilledButtons();
            },
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onInputPrefilledOptionsText: function (ev) {
        this._saveDescriptions();
        this._renderPrefilledButtons();
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onInputPrefilledOptionsValue: function (ev) {
        this._saveDescriptions();
        this._renderPrefilledButtons();
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onClickRemoveButton: function (ev) {
        ev.target.closest('tr').remove();
        this._renderPrefilledButtons();
    },
});

snippetOptions.registry.DonationColumn = snippetOptions.SnippetOptionWidget.extend({
    forceNoDeleteButton: true,

    /**
     * @override
     */
    start: function () {
        const leftPanelEl = this.$overlay.data('$optionsSection')[0];
        leftPanelEl.querySelector('.oe_snippet_clone').classList.add('d-none'); // TODO improve the way to do that
        return this._super.apply(this, arguments);
    },
});
});
