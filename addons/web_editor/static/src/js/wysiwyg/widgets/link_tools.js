odoo.define('wysiwyg.widgets.LinkTools', function (require) {
'use strict';

const core = require('web.core');
const OdooEditorLib = require('web_editor.odoo-editor');
const Widget = require('web.Widget');

const getCurrentLink = OdooEditorLib.getCurrentLink;

const _t = core._t;

/**
 * Allows to customize link content and style.
 */
const LinkTools = Widget.extend({
    template: 'wysiwyg.widgets.linkTools',
    xmlDependencies: ['/web_editor/static/src/xml/wysiwyg.xml'],
    events: {
        'input': '_onAnyChange',
        'change': '_onAnyChange',
        'input input[name="url"]': '_onURLInput',
        'click we-select we-button': '_onPickSelectOption',
        'click we-checkbox': '_onClickCheckbox',
    },

    /**
     * @constructor
     */
    init: function (parent, options, editable, $button) {
        this.options = options || {};
        this._super(parent, _.extend({
            title: _t("Link to"),
        }, this.options));

        this.$button = $button;
        this.colorsData = [
            {type: '', label: _t("Link"), btnPreview: 'link'},
            {type: 'primary', label: _t("Primary"), btnPreview: 'primary'},
            {type: 'secondary', label: _t("Secondary"), btnPreview: 'secondary'},
            // Note: by compatibility the dialog should be able to remove old
            // colors that were suggested like the BS status colors or the
            // alpha -> epsilon classes. This is currently done by removing
            // all btn-* classes anyway.
        ];

        this.editable = editable;
        this.$editable = $(editable);
        this.data = {};

        this.data.className = "";
        this.data.iniClassName = "";

        this.data.range = editable.ownerDocument.getSelection().getRangeAt(0);

        this.$link = this._getOrCreateLink();
        this.data.iniClassName = this.$link.attr("class") || "";
        this.colorCombinationClass = '';

        const allBtnClassSuffixes = /(^|\s+)btn(-[a-z0-9_-]*)?/gi;
        this.data.className = this.data.iniClassName.replace(allBtnClassSuffixes, ' ');
        this.data.text = this.$link.text().replace(/[ \t\r\n]+/g, ' ');
        this.data.url = this.$link.attr('href');
        this.data.isNewWindow = this.$link.attr('target') === '_blank';

        var allBtnShapes = /\s*(rounded-circle|flat)\s*/gi;
        this.data.className = this.data.iniClassName
            .replace(allBtnClassSuffixes, ' ')
            .replace(allBtnShapes, ' ');
    },
    /**
     * @override
     */
    start: function () {
        this.$button.addClass('active');

        if (this.data.iniClassName) {
            const options = [
                'we-selection-items[name="link_style_color"] > we-button',
                'we-selection-items[name="link_style_size"] > we-button',
                'we-selection[name="link_style_shape"] > we-button',
            ]
            for (const option of this.$(options.join(','))) {
                const $option = $(option);
                const value = $option.data('value');
                let active = false;
                if (value) {
                    const classPrefix = new RegExp('(^|btn-| |btn-outline-)' + value);
                    active = classPrefix.test(this.data.iniClassName);
                } else {
                    active = !this.data.iniClassName.includes('btn-');
                }
                this._setSelectOption($option, active)
            };
        }
        if (this.data.url) {
            var match = /mailto:(.+)/.exec(this.data.url);
            this.$('input[name="url"]').val(match ? match[1] : this.data.url);
            this._onURLInput();
        }
        if (this.data.isNewWindow) {
            this.$('we-button.o_we_checkbox_wrapper').toggleClass('active', true);
        }

        this._updateOptionsUI();
        this._adaptPreview();

        this.$('input:visible:first').focus();

        return this._super.apply(this, arguments);
    },
    destroy: function () {
        this.$link.removeClass('oe_edited_link');
        if (!this.$link.attr('href') && !this.colorCombinationClass) {
            this.$link.contents().unwrap();
        }
        this.$button.removeClass('active');
        this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Adapt the link to changes.
     *
     * @private
     */
    _adaptLink: function () {
        var data = this._getData();
        if (data === null) {
            return;
        }
        const attrs = {
            target: data.isNewWindow ? '_blank' : '',
            href: data.url,
            class: `${data.classes}`,
        };
        this.$link.attr(attrs).html((data.label && data.label.length) ? data.label : data.url);
    },
    /**
     * Get the link's data (url, label and styles).
     *
     * @private
     * @returns {Object} {label: String, url: String, classes: String, isNewWindow: Boolean}
     */
    _getData: function () {
        var $url = this.$('input[name="url"]');
        var url = $url.val();
        var label = this.$('input[name="label"]').val() || url;

        if (label && this.data.images) {
            for (var i = 0; i < this.data.images.length; i++) {
                label = label.replace('<', "&lt;").replace('>', "&gt;").replace(/\[IMG\]/, this.data.images[i].outerHTML);
            }
        }

        if ($url.prop('required') && (!url || !$url[0].checkValidity())) {
            return null;
        }

        const type = this.$('we-selection-items[name="link_style_color"] we-button.active').data('value') || '';
        const size = this.$('we-selection-items[name="link_style_size"] we-button.active').data('value') || '';
        const shape = this.$('select[name="link_style_shape"]').val() || '';
        const shapes = shape ? shape.split(',') : [];
        const style = ['outline', 'fill'].includes(shapes[0]) ? `${shapes[0]}-` : '';
        const shapeClasses = shapes.slice(style ? 1 : 0).join(' ');
        const classes = (this.data.className || '') +
            (type ? (` btn btn-${style}${type}`) : '') +
            (shapeClasses ? (` ${shapeClasses}`) : '') +
            (size ? (' btn-' + size) : '');
        var isNewWindow = this.$('we-checkbox[name="is_new_window"]').closest('we-button.o_we_checkbox_wrapper').hasClass('active');
        var doStripDomain = this.$('we-checkbox[name="do_strip_domain"]').closest('we-button.o_we_checkbox_wrapper').hasClass('active');
        if (url.indexOf('@') >= 0 && url.indexOf('mailto:') < 0 && !url.match(/^http[s]?/i)) {
            url = ('mailto:' + url);
        } else if (url.indexOf(location.origin) === 0 && doStripDomain) {
            url = url.slice(location.origin.length);
        }
        var allWhitespace = /\s+/gi;
        var allStartAndEndSpace = /^\s+|\s+$/gi;
        return {
            label: label,
            url: url,
            classes: classes.replace(allWhitespace, ' ').replace(allStartAndEndSpace, ''),
            isNewWindow: isNewWindow,
            doStripDomain: doStripDomain,
        };
    },
    _getOrCreateLink: function () {
        const range = this.editable.ownerDocument.getSelection().getRangeAt(0);
        this.needLabel = false;
        let link = getCurrentLink(this.editable.ownerDocument);
        if (link) {
            const $link = $(link);
            $link.after($link.contents());
            range.surroundContents(link);
        } else {
            link = document.createElement('a');
            if (range.collapsed) {
                range.insertNode(link);
                this.needLabel = true;
            } else {
                range.surroundContents(link);
            }
        }
        link.classList.add('oe_edited_link');
        return $(link);
    },
    _setSelectOption: function ($option, active) {
        $option.toggleClass('active', active);
        if (active) {
            $option.closest('we-select').find('we-toggler').text($option.text());
        }
    },
    /**
     * @private
     */
    _updateOptionsUI: function () {
        const el = this.el.querySelector('[name="link_style_color"] we-button.active');
        if (el) {
            this.colorCombinationClass = el.dataset.value;
            // Hide the size and shape options if the link is an unstyled anchor.
            this.$('.link-size-row, .link-shape-row').toggleClass('d-none', !this.colorCombinationClass);
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onAnyChange: function () {
        this._adaptPreview();
    },
    _onClickCheckbox: function (ev) {
        const $target = $(ev.target);
        $target.closest('we-button.o_we_checkbox_wrapper').toggleClass('active');
        this._adaptPreview();
    },
    _onPickSelectOption: function (ev) {
        const $target = $(ev.target);
        const $select = $target.closest('we-select');
        $select.find('we-selection-items we-button').toggleClass('active', false);
        this._setSelectOption($target, true);
        this._updateOptionsUI();
        this._adaptPreview();
    },
    /**
     * @private
     */
    _onURLInput: function () {
        var $linkUrlInput = this.$('#o_link_dialog_url_input');
        let value = $linkUrlInput.val();
        let isLink = value.indexOf('@') < 0;
        this.$('input[name="is_new_window"]').closest('.form-group').toggleClass('d-none', !isLink);
        this.$('.o_strip_domain').toggleClass('d-none', value.indexOf(window.location.origin) !== 0);
    },
});

return LinkTools;
});
