/** @odoo-module alias=website.s_dynamic_snippet **/

import * as core from "@web/legacy/js/services/core";
import * as config from "@web/legacy/js/services/config";
import publicWidget from "web.public.widget";
import {Markup} from "web.utils";
const DEFAULT_NUMBER_OF_ELEMENTS = 4;
const DEFAULT_NUMBER_OF_ELEMENTS_SM = 1;

const DynamicSnippet = publicWidget.Widget.extend({
    selector: '.s_dynamic_snippet',
    read_events: {
        'click [data-url]': '_onCallToAction',
    },
    disabledInEditableMode: false,

    /**
     *
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        /**
         * The dynamic filter data source data formatted with the chosen template.
         * Can be accessed when overriding the _render_content() function in order to generate
         * a new renderedContent from the original data.
         *
         * @type {*|jQuery.fn.init|jQuery|HTMLElement}
         */
        this.data = [];
        this.renderedContent = '';
        this.isDesplayedAsMobile = config.device.isMobile;
        this.uniqueId = _.uniqueId('s_dynamic_snippet_');
        this.template_key = 'website.s_dynamic_snippet.grid';
    },
    /**
     *
     * @override
     */
    willStart: function () {
        return this._super.apply(this, arguments).then(
            () => Promise.all([
                this._fetchData(),
            ])
        );
    },
    /**
     *
     * @override
     */
    start: function () {
        return this._super.apply(this, arguments)
            .then(() => {
                this._setupSizeChangedManagement(true);
                this.options.wysiwyg && this.options.wysiwyg.odooEditor.observerUnactive();
                this._render();
                this.options.wysiwyg && this.options.wysiwyg.odooEditor.observerActive();
            });
    },
    /**
     *
     * @override
     */
    destroy: function () {
        this.options.wysiwyg && this.options.wysiwyg.odooEditor.observerUnactive();
        this._toggleVisibility(false);
        this._setupSizeChangedManagement(false);
        this._clearContent();
        this.options.wysiwyg && this.options.wysiwyg.odooEditor.observerActive();
        this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _clearContent: function () {
        const $templateArea = this.$el.find('.dynamic_snippet_template');
        this.trigger_up('widgets_stop_request', {
            $target: $templateArea,
        });
        $templateArea.html('');
    },
    /**
     * Method to be overridden in child components if additional configuration elements
     * are required in order to fetch data.
     * @private
     */
    _isConfigComplete: function () {
        return this.$el.get(0).dataset.filterId !== undefined && this.$el.get(0).dataset.templateKey !== undefined;
    },
    /**
     * Method to be overridden in child components in order to provide a search
     * domain if needed.
     * @private
     */
    _getSearchDomain: function () {
        return [];
    },
    /**
     * Method to be overridden in child components in order to add custom parameters if needed.
     * @private
     */
    _getRpcParameters: function () {
        return {};
    },
    /**
     * Fetches the data.
     * @private
     */
    async _fetchData() {
        if (this._isConfigComplete()) {
            const nodeData = this.el.dataset;
            const filterFragments = await this._rpc({
                'route': '/website/snippet/filters',
                'params': Object.assign({
                    'filter_id': parseInt(nodeData.filterId),
                    'template_key': nodeData.templateKey,
                    'limit': parseInt(nodeData.numberOfRecords),
                    'search_domain': this._getSearchDomain(),
                    'with_sample': this.editableMode,
                }, this._getRpcParameters()),
            });
            this.data = filterFragments.map(Markup);
        } else {
            this.data = [];
        }
    },
    /**
     * Method to be overridden in child components in order to prepare content
     * before rendering.
     * @private
     */
    _prepareContent: function () {
        this.renderedContent = core.qweb.render(
            this.template_key,
            this._getQWebRenderOptions()
        );
    },
    /**
     * Method to be overridden in child components in order to prepare QWeb
     * options.
     * @private
     */
     _getQWebRenderOptions: function () {
        const dataset = this.el.dataset;
        const numberOfRecords = parseInt(dataset.numberOfRecords);
        let numberOfElements;
        if (config.device.isMobile) {
            numberOfElements = parseInt(dataset.numberOfElementsSmallDevices) || DEFAULT_NUMBER_OF_ELEMENTS_SM;
        } else {
            numberOfElements = parseInt(dataset.numberOfElements) || DEFAULT_NUMBER_OF_ELEMENTS;
        }
        const chunkSize = numberOfRecords < numberOfElements ? numberOfRecords : numberOfElements;
        return {
            chunkSize: chunkSize,
            data: this.data,
            uniqueId: this.uniqueId,
            extraClasses: dataset.extraClasses || '',
        };
    },
    /**
     *
     * @private
     */
    _render: function () {
        if (this.data.length > 0 || this.editableMode) {
            this.$el.removeClass('o_dynamic_empty');
            this._prepareContent();
        } else {
            this.$el.addClass('o_dynamic_empty');
            this.renderedContent = '';
        }
        this._renderContent();
        this.trigger_up('widgets_start_request', {$target: this.$el.children(), options: {parent: this}});
    },
    /**
     * @private
     */
    _renderContent: function () {
        const $templateArea = this.$el.find('.dynamic_snippet_template');
        this.trigger_up('widgets_stop_request', {
            $target: $templateArea,
        });
        $templateArea.html(this.renderedContent);
        // TODO this is probably not the only public widget which creates DOM
        // which should be attached to another public widget. Maybe a generic
        // method could be added to properly do this operation of DOM addition.
        this.trigger_up('widgets_start_request', {
            $target: $templateArea,
            editableMode: this.editableMode,
        });
    },
    /**
     *
     * @param {Boolean} enable
     * @private
     */
    _setupSizeChangedManagement: function (enable) {
        if (enable === true) {
            config.device.bus.on('size_changed', this, this._onSizeChanged);
        } else {
            config.device.bus.off('size_changed', this, this._onSizeChanged);
        }
    },
    /**
     *
     * @param visible
     * @private
     */
    _toggleVisibility: function (visible) {
        this.$el.toggleClass('o_dynamic_empty', !visible);
    },

    //------------------------------------- -------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Navigates to the call to action url.
     * @private
     */
    _onCallToAction: function (ev) {
        window.location = $(ev.currentTarget).attr('data-url');
    },
    /**
     * Called when the size has reached a new bootstrap breakpoint.
     *
     * @private
     * @param {number} size as Integer @see device.SIZES in @web/legacy/js/services/config
     */
    _onSizeChanged: function (size) {
        if (this.isDesplayedAsMobile !== config.device.isMobile) {
            this.isDesplayedAsMobile = config.device.isMobile;
            this._render();
        }
    },
});

publicWidget.registry.dynamic_snippet = DynamicSnippet;

export default DynamicSnippet;
