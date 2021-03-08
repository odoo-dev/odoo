odoo.define('web_studio.reportEditComponents', function (require) {
"use strict";

var {ColorpickerDialog} = require('web.Colorpicker');
var config = require('web.config');
var core = require('web.core');
var utils = require('web.utils');
var fieldRegistry = require('web.field_registry');
var fieldRegistryOwl = require('web.field_registry_owl');
const FieldWrapper = require('web.FieldWrapper');
var ModelFieldSelector = require('web.ModelFieldSelector');
var StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');
const { WidgetAdapterMixin } = require('web.OwlCompatibility');

var Wysiwyg = require('web_editor.wysiwyg');
var SummernoteManager = require('web_editor.rte.summernote');

var Abstract = require('web_studio.AbstractReportComponent');
var DomainSelectorDialog = require('web.DomainSelectorDialog');
var Domain = require("web.Domain");

var py = window.py; // look py.js
var qweb = core.qweb;

var AbstractEditComponent = Abstract.extend(WidgetAdapterMixin, StandaloneFieldManagerMixin, {
    events: {
        'change input': function (e) {
            e.stopPropagation();
        },
    },
    custom_events: _.extend({}, Abstract.prototype.custom_events, {
        field_changed: '_onDirectiveChange',
        field_chain_changed: '_onDirectiveChange',
    }),
    /**
     * @override
     * @param {Object} params
     * @param {Object} params.context
     * @param {Object} params.node
     * @param {Object} [params.state]
     * @param {string[]} [params.componentsList] the list of components for the
     *                                           node
     */
    init: function (parent, params) {
        this._super.apply(this, arguments);
        StandaloneFieldManagerMixin.init.call(this);
        this.state = params.state || {};
        this.node = params.node;
        this.context = params.context;
        this.componentsList = params.componentsList;
        // TODO: check if using a real model with widgets is reasonnable or if
        // we should use actual html components in QWEB
        this.directiveFields = {};

        // will be set in the willStart defDirective callback
        this.directiveRecordId = '';

        // add in init: directive => field selector
        this.fieldSelector = {};

    },
    /**
     * @override
     */
    willStart: function () {
        var self = this;

        var directiveModel = [];
        _.each(this.directiveFields, function (options, directiveKey) {
            var value = options.value;
            if (!value) {
                value = self.node.attrs[options.attributeName || directiveKey];
            }

            if (options.type === 'related') {
                directiveModel.push({
                    name: directiveKey,
                    type: 'char',
                    value: options.freecode ? value : self._splitRelatedValue(value).chain.join('.'),
                });
            } else {
                directiveModel.push(_.extend({}, {
                    name: directiveKey,
                    value: value,
                }, options));
            }
        });

        var defDirective = this.model.makeRecord('ir.model.fields', directiveModel)
            .then(function (recordId) {
                self.directiveRecordId = recordId;

                _.each(self.directiveFields, function (options, directiveKey) {
                    if (options.type === 'related') {
                        self.createFieldSelector(directiveKey, options);
                    } else {
                        self.createField(directiveKey, options);
                    }
                });
            });
        var defParent = this._super.apply(this, arguments);
        return Promise.all([defDirective, defParent]);
    },
    /**
     * @override
     */
    destroy: function () {
        this._super.apply(this, arguments);
        WidgetAdapterMixin.destroy.call(this);
    },
    /**
     * Called each time the widget is attached into the DOM.
     */
    on_attach_callback: function () {
        WidgetAdapterMixin.on_attach_callback.call(this);
    },
    /**
     * Called each time the widget is detached from the DOM.
     */
    on_detach_callback: function () {
        WidgetAdapterMixin.on_detach_callback.call(this);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Creates a new field (for basic fields, as field registry).
     *
     * @param {String} directiveKey unique key
     * @param {Object} options
     */
    createField: function (directiveKey, options) {
        var directiveRecord = this.model.get(this.directiveRecordId);

        options = _.extend({mode: 'edit', attrs: _.extend({
            quick_create: false, can_create: false}, options)}, options);

        var field = directiveRecord.fields[directiveKey];
        var FieldClass = fieldRegistryOwl.getAny([options.Widget, field.type]);
        if (FieldClass) {
            this.fieldSelector[directiveKey] = new FieldWrapper(this, FieldClass, {
                fieldName: directiveKey,
                record: directiveRecord,
                options,
            });
        } else {
            FieldClass = fieldRegistry.getAny([options.Widget, field.type]);
            this.fieldSelector[directiveKey] = new FieldClass(
                this, directiveKey, directiveRecord, options);
        }
    },
    /**
     * Creates a new field selector (for related fields).
     *
     * @param {String} directiveKey unique key
     * @param {Object} options
     */
    createFieldSelector: function (directiveKey, options) {
        var directiveRecord = this.model.get(this.directiveRecordId);

        var split = this._splitRelatedValue(directiveRecord.data[directiveKey]);

        if (this.context[split.chain[0]] === 'undefined') {
            // if we don't know what the variable is, we won't be able to follow
            // the relations (and fetch the fields) with the FieldSelector
            console.warn("We don't know what " + split.chain[0] + " is ...");
            return this.createField(directiveKey);
        }

        if (options.freecode && split.rest) {
            var InputField = fieldRegistry.get('input');
            this.fieldSelector[directiveKey] = new InputField(
                this, directiveKey,
                directiveRecord,
                _.extend({mode: 'edit', attrs: options}, options));
            return;
        }

        var availableKeys = this._getContextKeys(this.node);
        if (options.loop) {
            availableKeys = _.filter(availableKeys, function (relation) {
                return relation.type === 'one2many' || relation.type === 'many2one';
            });
        }

        this.fieldSelector[directiveKey] = new ModelFieldSelector(this, 'record_fake_model', split.chain,
            _.extend({
                readonly: options.mode === 'readonly',
                searchable: false,
                fields: availableKeys,
                filters: {searchable: false},
                filter: options.filter || function () {
                    return true;
                },
                followRelations: options.followRelations || function (field) {
                    return field.type === 'many2one';
                },
            }, options));
    },
    /**
     * To be overriden.
     */
    getLocalState: function() {
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {any} value
     * @returns {Object}
     */
    _splitRelatedValue: function (value) {
        var chain = [];
        var rest = value || '';
        if (typeof value === "string") {
            try {
                value = py.extract(value);
            } catch (e) {
                return {
                    chain: [],
                    rest: value,
                };
            }
        }
        if (value) {
            if (value.isOperator) {
                if (value.params.values[0].isField) {
                    chain = value.params.values[0].expr.split('.');
                    rest = value.expr.slice(chain.length);
                } else {
                    rest = value.expr;
                }
            }
            if (value.isCall) {
                rest = (value.params.object.length ? '.' : '') + value.params.method + '(' + value.params.args.join(', ') + ')';
                chain = value.params.object;
            }
            if (value.isField) {
                rest = '';
                chain = value.expr.split('.');
            }
        }
        return {
            chain: chain,
            rest: rest,
        };
    },
    /**
     * @private
     * @param {Object} newAttrs
     */
    _tSetAttributes: function (newAttrs) {
        var self = this;
        var node = this.node;
        var op = [];
        _.each(newAttrs, function (tvalue, tset) {
            if (tvalue === self.directiveFields[tset].value) {
                return;
            }
            op.push({
                content: '<attribute name="t-value">' + tvalue + '</attribute>',
                position: "attributes",
                view_id: +node.attrs['data-oe-id'],
                xpath: node.attrs['data-oe-xpath'] + "//t[@t-set='" + tset + "']"
            });
        });
        if (!op.length) {
            return;
        }
        this.trigger_up('view_change', {
            node: node,
            operation: {
                inheritance: op,
            },
        });
    },
    /**
     * @private
     * @param {String} attributeName
     * @param {String} toAdd
     * @param {String} toRemove
     */
    _editDomAttribute: function (attributeName, toAdd, toRemove) {
        var attribute = '<attribute name="' + attributeName + '" separator="' + (attributeName === 'class' ? ' ' : ';') + '"';
        if (toAdd) {
            attribute += ' add="' + toAdd + '"';
        }
        if (toRemove) {
            attribute += ' remove="' + toRemove + '"';
        }
        attribute += '/>';

        this.trigger_up('view_change', {
            node: this.node,
            operation: {
                inheritance: [{
                    content: attribute,
                    position: "attributes",
                    view_id: +this.node.attrs['data-oe-id'],
                    xpath: this.node.attrs['data-oe-xpath']
                }],
            },
        });
    },
    /**
     * Triggered by a field modification (see @createField and
     * @createFieldSelector).
     * To be overriden if the attributes need to be preprocessed.
     *
     * @private
     * @param {Object} newAttrs
     */
    _triggerViewChange: function (newAttrs) {
        this.trigger_up('view_change', {
            node: this.node,
            operation: {
                type: 'attributes',
                new_attrs: newAttrs,
            },
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------
    /**
     * @private
     * @param {OdooEvent} e
     */
    _onDirectiveChange: function (e) {
        var self = this;
        e.stopPropagation();  // TODO: is it really useful on an OdooEvent

        e.data.dataPointID = this.directiveRecordId;

        var always = function () {
            for (var directiveKey in self.fieldSelector) {
                if (self.fieldSelector[directiveKey] === e.target) {
                    break;
                }
            }

            var newAttrs = {};
            _.each(self.fieldSelector, function (fieldType, directiveKey) {
                if (!e.data.forceChange && e.target !== self.fieldSelector[directiveKey]) {
                    return;
                }
                var data = self.model.get(self.directiveRecordId).data;
                var fieldValue = data[directiveKey];
                // TODO: for relation field, maybe set id (or ids) in fieldValue to
                // avoid overwritting _triggerViewChange in every directive
                if (e.data.chain) {
                    fieldValue = e.data.chain.join('.');
                }
                if (fieldValue.res_ids) {
                    fieldValue = fieldValue.res_ids.slice();
                }
                newAttrs[directiveKey] = fieldValue;
            });

            if (e.data.chain) {
                e.data.dataPointID = self.directiveRecordId;
                e.data.changes = newAttrs;
            }

            self._triggerViewChange(newAttrs);
        };

        StandaloneFieldManagerMixin._onFieldChanged.call(this, e).then(always, always);
    },
});

var loadColors;
var LayoutEditable = AbstractEditComponent.extend({
    name: 'layout',
    template : 'web_studio.ReportLayoutEditable',
    events : _.extend({}, AbstractEditComponent.prototype.events, {
        "change .o_web_studio_margin>input": "_onMarginInputChange",
        "change .o_web_studio_width>input": "_onWidthInputChange",
        "click .o_web_studio_font_size .dropdown-item-text": "_onFontSizeChange",
        "change .o_web_studio_table_style > select": "_onTableStyleInputChange",
        "click .o_web_studio_text_decoration button": "_onTextDecorationChange",
        "click .o_web_studio_text_alignment button": "_onTextAlignmentChange",
        "change .o_web_studio_classes>input": "_onClassesChange",
        "click .o_web_studio_colors .o_web_studio_reset_color": "_onResetColor",
        "click .o_web_studio_colors .o_web_studio_custom_color": "_onCustomColor",
    }),
    /**
     * @override
     */
    init: function (parent, params) {
        this._super.apply(this, arguments);

        this.debug = config.isDebug();
        this.isTable = params.node.tag === 'table';
        this.isNodeText = _.contains(this.componentsList, 'text');
        this.allClasses = params.node.attrs.class || "";
        this.classesArray =(params.node.attrs.class || "").split(' ');
        this.stylesArray =(params.node.attrs.style || "").split(';');

        var fontSizeRegExp= new RegExp(/^\s*(h[123456]{1})|(small)|(display-[1234]{1})\s*$/gim);
        var backgroundColorRegExp= new RegExp(/^\s*background\-color\s*:/gi);
        var colorRegExp= new RegExp(/^\s*color\s*:/gi);
        var widthRegExp= new RegExp(/^\s*width\s*:/gi);
        const colClassRegex = /\bcol((-(sm|md|lg|xl))?-(\d{1,2}|auto))?\b/;

        this["margin-top"] = this._findMarginValue('margin-top');
        this["margin-bottom"] = this._findMarginValue('margin-bottom');
        this["margin-left"] = this._findMarginValue('margin-left');
        this["margin-right"] = this._findMarginValue('margin-right');

        this["background-color-class"] = _.find(this.classesArray, function(item) {
            return !item.indexOf('bg-');
        });
        this["font-color-class"] = _.find(this.classesArray, function(item) {
            return !item.indexOf('text-');
        });
        this.tableStyle = _.find(this.classesArray, function(item) {
            return !item.indexOf('table-');
        });
        this["background-color"] = _.find(this.stylesArray, function(item) {
            return backgroundColorRegExp.test(item);
        });
        this.color = _.find(this.stylesArray, function(item) {
            return colorRegExp.test(item);
        });
        // the width on div.col is set with col-. instead of width style
        this.displayWidth = !(params.node.tag === 'div' && _.find(this.classesArray, function(item) {
            return colClassRegex.test(item);
        }));
        this.originalWidth =  _.find(this.stylesArray, function(item) {
            return widthRegExp.test(item);
        });
        if (this.originalWidth) {
            this.width = this.originalWidth.replace(/\D+/g,''); //replaces all non-digits with nothing
        }

        this.fontSize = _.find(this.classesArray, function(item) {
            return fontSizeRegExp.test(item);
        });

        this.italic = _.contains(this.classesArray, 'o_italic');
        this.bold =_.contains(this.classesArray, 'o_bold');
        this.underline = _.contains(this.classesArray, 'o_underline');

        this.alignment = _.intersection(this.classesArray, ['text-left', 'text-center', 'text-right'])[0];
        this.displayAlignment = !_.contains(['inline', 'float'], this.node.$nodes.css('display'));

        this.allClasses = params.node.attrs.class || "";

        new SummernoteManager(this);
    },
    /**
     * @override
     */
    willStart: async function () {
        await this._super();
        this._groupColors = await this._getColors();
    },
    /**
     * Override to re-render the color picker on each component rendering.
     *
     * @override
     */
    renderElement: function() {
        var self = this;
        this._super.apply(this, arguments);
        this.$('.o_web_studio_background_colorpicker .o_web_studio_color_palette').append(this._createPalette());
        this.$('.o_web_studio_background_colorpicker').on("mousedown", 'button[data-color]', function (e) {
            self._onColorChange($(e.currentTarget).data('value').replace('text-', 'bg-'), "background");
        });
        this.$('.o_web_studio_font_colorpicker .o_web_studio_color_palette').append(this._createPalette());
        this.$('.o_web_studio_font_colorpicker').on("mousedown", 'button[data-color]', function (e) {
            self._onColorChange($(e.currentTarget).data('value'), "font");
        });
     },



    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {JQuery Node}
     */
    _createPalette: function () {
        var self = this;
        var $fontPlugin = $('<div/>');
        this._groupColors.forEach(function (color) {
            var $row;
            if (typeof color === 'string') {
                $row = $('<h6/>').text(color);
            } else {
                $row = $('<div class="o_web_studio_color_row"/>');
                color.forEach(function (color) {
                    var $button = $('<button/>').appendTo($row);
                    $button.attr('data-color', color);
                    if (color.startsWith('#')) {
                        $button.css('background-color', color);
                        $button.attr('data-value', color);
                    } else {
                        $button.addClass('bg-' + color);
                        $button.attr('data-value', 'text-' + color);
                    }
                    $row.append($button);
                });
            }
            $fontPlugin.append($row);
        });
        return $fontPlugin;
    },
    /**
     * @private
     * @param {String} marginName the short name of the margin property (mt for
     * margin top, etc.)
     * @returns {Integer|undefined}
     */
    _findMarginValue: function(marginName) {
        if (this.node.attrs.style) {
            var margin = this.node.attrs.style
                .split(';')
                .map(function(item) {return item.trim();})
                .filter(function(item){return !item.indexOf(marginName);});
            if (margin.length) {
                var marginValue = margin[0].split(':')[1].trim().replace('px','');
                return parseInt(marginValue, 10);
            }
        }
    },
    /**
     * @private
     * @returns {Array}
     */
    _getColors: async function () {
        if (!('web_editor.colorpicker' in qweb.templates)) {
            await this._rpc({
                model: 'ir.ui.view',
                method: 'read_template',
                args: ['web_editor.colorpicker'],
            }).then(function (template) {
                return qweb.add_template('<templates>' + template + '</templates>');
            });
        }

        var groupColors = [];
        var $clpicker = $(qweb.render('web_editor.colorpicker'));
        $clpicker.children('.o_colorpicker_section').each(function () {
            if (this.dataset.display) {
                groupColors.push(this.dataset.display);
            }
            var colors = [];
            $(this).children('button').each(function () {
                var $el = $(this);
                if (!$el.hasClass('d-none')) {
                    colors.push($el.attr('data-color') || '');
                }
            });
            if (colors.length) {
                groupColors.push(colors);
            }
            if (this.dataset.name === 'common') {
                groupColors = groupColors.concat([
                    ['#FF0000', '#FF9C00', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#9C00FF', '#FF00FF'],
                    ['#F7C6CE', '#FFE7CE', '#FFEFC6', '#D6EFD6', '#CEDEE7', '#CEE7F7', '#D6D6E7', '#E7D6DE'],
                    ['#E79C9C', '#FFC69C', '#FFE79C', '#B5D6A5', '#A5C6CE', '#9CC6EF', '#B5A5D6', '#D6A5BD'],
                    ['#E76363', '#F7AD6B', '#FFD663', '#94BD7B', '#73A5AD', '#6BADDE', '#8C7BC6', '#C67BA5'],
                    ['#CE0000', '#E79439', '#EFC631', '#6BA54A', '#4A7B8C', '#3984C6', '#634AA5', '#A54A7B'],
                    ['#9C0000', '#B56308', '#BD9400', '#397B21', '#104A5A', '#085294', '#311873', '#731842'],
                    ['#630000', '#7B3900', '#846300', '#295218', '#083139', '#003163', '#21104A', '#4A1031']
                ]);
            }
        });
        return groupColors;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {JQelement} $elem
     * @param {String} type either font or background
     */
    _onColorChange: function (value, type) {
        var isClass = /^(text|bg)-/ .test(value);
        if (isClass) {
            this._editDomAttribute("class", value, type === "background" ? this["background-color-class"] : this["font-color-class"]);
        } else {
            var attributeName = type === "background" ? 'background-color' : 'color';
            this._editDomAttribute("style", attributeName + ':' + value, this[attributeName]);
        }
    },
    /**
     * @private
     * @param {JQEvent} e
     */
    _onClassesChange: function (e) {
        e.preventDefault();
        var newAttrs = {class : e.target.value};
        this.trigger_up('view_change', {
            node: this.node,
            operation: {
                type: 'attributes',
                new_attrs: newAttrs,
            },
        });
    },
    /**
     * @private
     * @param {JQEvent} e
     */
    _onCustomColor: function (e) {
        e.preventDefault();
        const colorpicker = new ColorpickerDialog(this, {
            defaultColor: 'rgb(255, 0, 0)',
        });
        colorpicker.on('colorpicker:saved', this, (ev) => {
            var color = ev.data.cssColor;
            var $button = $('<button/>');
            $button.attr('data-color', color);
            $button.attr('data-value', color);
            $button.css('background-color', color);
            $(e.target).closest('.dropdown-item').find('.o_web_studio_custom_colors').append($button);
            $button.mousedown();
        });
        colorpicker.open();
    },
    /**
     * @private
     * @param {JQEvent} e
     */
    _onFontSizeChange: function (e) {
        e.preventDefault();
        this._editDomAttribute('class', $(e.currentTarget).data('value'), this.fontSize);
    },
    /**
     * @private
     * @param {JQEvent} e
     */
    _onTableStyleInputChange: function (e) {
        e.preventDefault();
        this._editDomAttribute("class", e.target.value, this.tableStyle);
    },
    _onMarginInputChange: function (e) {
        e.preventDefault();
        var toRemove, toAdd;
        if (e.target.value !== "") {
            toAdd = e.target.dataset.margin + ':' + e.target.value + 'px';
        }
        if (this[e.target.dataset.margin]) {
            toRemove = e.target.dataset.margin + ':' + this[e.target.dataset.margin] + 'px';
        }
        this._editDomAttribute("style", toAdd, toRemove);
    },
    /**
     * @private
     * @param {JQEvent} e
     */
    _onResetColor: function (e) {
        e.preventDefault();
        if (e.currentTarget.dataset.target === "background") {
            if (this["background-color-class"]) {
                this._editDomAttribute("class", null, this["background-color-class"]);
            } else if (this["background-color"]) {
                this._editDomAttribute("style", null, this["background-color"]);
            }
        } else {
            if (this["font-color-class"]) {
                this._editDomAttribute("class", null, this["font-color-class"]);
            } else if (this.color) {
                this._editDomAttribute("style", null, this.color);
            }
        }
    },
    /**
     * @private
     * @param {JQEvent} e
     */
    _onTextAlignmentChange : function(e) {
        e.preventDefault();
        var data = $(e.currentTarget).data();
        var toAdd = this.alignment !== data.property ? data.property : null;
        this._editDomAttribute("class", toAdd, this.alignment);
    },
    /**
     * @private
     * @param {JQEvent} e
     */
    _onTextDecorationChange : function(e) {
        e.preventDefault();
        var data = $(e.target).closest("button").data();
        this._editDomAttribute("class",
            !this[data.property] && ("o_" + data.property),
            this[data.property] && ("o_" + data.property));
    },
    /**
     * @private
     * @param {JQEvent} e
     */
    _onWidthInputChange: function(e) {
        e.preventDefault();
        var addDisplayInlineBlock = "";
        var hasDisplay = _.any((this.node.attrs.style || '').split(';'), function (item) {
            return _.str.startsWith(item, 'display');
        });
        if (this.node.tag.toLowerCase() === 'span' && !hasDisplay) {
            addDisplayInlineBlock = ";display:inline-block";
        }
        this._editDomAttribute("style", e.target.value && ("width:" + e.target.value + "px" + addDisplayInlineBlock), this.originalWidth);
    }
});

var TField = AbstractEditComponent.extend({
    name: 'tfield',
    template : 'web_studio.ReportDirectiveTField',
    selector: '[t-field]',
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.directiveFields['t-field'] = {
            type: 'related',
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            var $expr = self.$('.o_web_studio_tfield_fieldexpression');
            return self.fieldSelector['t-field'].appendTo($expr);
        });
    },
});

var TIf = AbstractEditComponent.extend({
    name: 'tif',
    template : 'web_studio.ReportDirectiveTIf',
    selector: '',
    events: _.extend({}, AbstractEditComponent.prototype.events, {
        "click .o_field_domain_dialog_button": "_onDialogEditButtonClick",
    }),
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.directiveFields['t-if'] = {
            type: 'char',
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        try {
            Domain.prototype.conditionToDomain(this.node.attrs['t-if'] || '');
        } catch (e) {
            console.warn("Can't convert the condition in an Odoo domain", this.node.attrs['t-if'], e);
            this.$('.o_field_domain_dialog_button').hide();
        }
        return this._super.apply(this, arguments).then(function () {
            return self.fieldSelector['t-if'].appendTo(self.$('.o_web_studio_tif_ifexpression'));
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when the "Edit domain" button is clicked (when using the in_dialog
     * option) -> Open a DomainSelectorDialog to edit the value
     *
     * @param {Event} e
     */
    _onDialogEditButtonClick: function (e) {
        e.preventDefault();
        var self = this;
        var availableKeys = this._getContextKeys(this.node);
        // set a default document on the domain selector
        var defaultDoc = _.findWhere(availableKeys, {relation: this.context.docs, type: 'many2one'});
        defaultDoc = defaultDoc && defaultDoc.name || _.first(availableKeys).name;
        var value = Domain.prototype.conditionToDomain(this.node.attrs['t-if'] || '');
        var dialog = new DomainSelectorDialog(this, 'record_fake_model', value, {
            readonly: this.mode === "readonly",
            debugMode: config.isDebug(),
            fields: availableKeys,
            default: [[defaultDoc, '!=', false]],
            operators: ["=", "!=", ">", "<", ">=", "<=", "in", "not in", "set", "not set"],
        }).open();
        dialog.on("domain_selected", this, function (e) {
            var condition = Domain.prototype.domainToCondition(e.data.domain);
            self.$('input').val(condition === 'True' ? '' : condition).trigger('change');
        });
    },

    /**
    * @override
    */
    _onDirectiveChange: function (e) {
        if (e.target.name === "t-if") {
            return this._super.apply(this, arguments);
        }
        e.stopPropagation();
    }
});

var TElse = AbstractEditComponent.extend({
    name: 'telse',
    template : 'web_studio.ReportDirectiveTElse',
    selector: '[t-else]',
    insertAsLastChildOfPrevious: true,
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.tIf = this.node.parent.children[this.node.parent.children.indexOf(this.node) - 1].attrs['t-if'];
        this.directiveFields['t-else'] = {
            type: 'boolean',
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return self.fieldSelector['t-else'].appendTo(self.$('.o_web_studio_telse_elseexpression'));
        });
    },
    /**
     * @override
     */
    _triggerViewChange: function (newAttrs) {
        this.trigger_up('view_change', {
            node: this.node,
            operation: {
                type: 'attributes',
                new_attrs: {
                    't-else': newAttrs['t-else'] ? 'else' : null,
                },
            },
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------
});

var TEsc = AbstractEditComponent.extend({
    name: 'tesc',
    template : 'web_studio.ReportDirectiveTEsc',
    selector: '[t-esc]',
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.directiveFields['t-esc'] = {
            type: 'related',
            freecode: true,
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return self.fieldSelector['t-esc'].appendTo(self.$('.o_web_studio_tesc_escexpression'));
        });
    },
});

var TSet = AbstractEditComponent.extend({
    name: 'tset',
    template : 'web_studio.ReportDirectiveTSet',
    selector: '[t-set]',
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);

        this.directiveFields['t-set'] = {
            type: 'char',
        };
        this.directiveFields['t-value'] = {
            type: 'related',
            freecode: true,
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.all([
                self.fieldSelector['t-set'].appendTo(self.$('.o_web_studio_tset_setexpression')),
                self.fieldSelector['t-value'].appendTo(self.$('.o_web_studio_tset_valueexpression'))
            ]);
        });
    },
});

var TForeach = AbstractEditComponent.extend({
    name: 'tforeach',
    template : 'web_studio.ReportDirectiveTForeach',
    debugSelector: '[t-foreach]',
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.directiveFields['t-foreach'] = {
            type: 'related',
            freecode: true,
            loop: true,
        };
        this.directiveFields['t-as'] = {
            type: 'char',
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.all([
                self.fieldSelector['t-as'].appendTo(self.$('.o_web_studio_tas_asexpression')),
                self.fieldSelector['t-foreach'].appendTo(self.$('.o_web_studio_tforeach_foreachexpression'))
            ]);
        });
    },
});

var BlockTotal = AbstractEditComponent.extend({
    name: 'blockTotal',
    template : 'web_studio.BlockTotal',
    selector: '.o_report_block_total',
    blacklist: 't, tr, td, th, small, span',
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.directiveFields.total_amount_untaxed = {
            type: 'related',
            value: this.node.children[2].attrs['t-value'],
            filter: function (field) {
                return _.contains(['many2one', 'float', 'monetary'], field.type);
            },
            followRelations: function (field) {
                return field.type === 'many2one';
            },
        };
        this.directiveFields.total_currency_id = {
            type: 'related',
            value: this.node.children[0].attrs['t-value'],
            filter: function (field) {
                return field.type === 'many2one';
            },
            followRelations: function (field) {
                return field.type === 'many2one' && field.relation !== 'res.currency';
            },
        };
        this.directiveFields.total_amount_total = {
            type: 'related',
            value: this.node.children[1].attrs['t-value'],
            filter: function (field) {
                return _.contains(['many2one', 'float', 'monetary'], field.type);
            },
            followRelations: function (field) {
                return field.type === 'many2one';
            },
        };
        this.directiveFields.total_amount_by_groups = {
            type: 'related',
            value: this.node.children[3].attrs['t-value'],
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.all([
                self.fieldSelector.total_currency_id.appendTo(self.$('.o_web_studio_report_currency_id')),
                self.fieldSelector.total_amount_untaxed.appendTo(self.$('.o_web_studio_report_amount_untaxed')),
                self.fieldSelector.total_amount_total.appendTo(self.$('.o_web_studio_report_amount_total')),
                self.fieldSelector.total_amount_by_groups.appendTo(self.$('.o_web_studio_report_amount_by_groups'))
            ]);
        });
    },
    /**
     * @override
     */
    _triggerViewChange: function (newAttrs) {
        this._tSetAttributes(newAttrs);
    },
});

var Column = AbstractEditComponent.extend({
    name: 'column',
    template : 'web_studio.ReportColumn',
    selector: 'div[class*=col-]',
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);

        this.classes = (this.node.attrs.class || "").split(' ');
        // TODO: deal with multiple classes (ex: col-6 col-md-3)
        this.sizeClass = _.find(this.classes, function (item) {
            return item.indexOf('col-') !== -1;
        }) || '';
        this.offsetClass = _.find(this.classes, function (item) {
            return item.indexOf('offset-') !== -1;
        }) || '';
        this.size = +this.sizeClass.split('col-')[1];
        this.offset = +this.offsetClass.split('offset-')[1];
        this.directiveFields.size = {
            type: 'integer',
            value: this.size,
        };
        this.directiveFields.offset = {
            type: 'integer',
            value: this.offset,
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.all([
                self.fieldSelector.size.prependTo(self.$('.o_web_studio_size')),
                self.fieldSelector.offset.prependTo(self.$('.o_web_studio_offset'))
            ]);
        });
    },
    /**
     * @override
     */
    _triggerViewChange: function (newAttrs) {
        if ('size' in newAttrs && newAttrs.size >= 0) {
            this._editDomAttribute("class", 'col-' + newAttrs.size, this.sizeClass);
        } else if ('offset' in newAttrs && newAttrs.offset >= 0) {
            this._editDomAttribute("class", 'offset-' + newAttrs.offset, this.offsetClass);
        }
    },
});

var Table = AbstractEditComponent.extend({
    selector: 'table.o_report_block_table',
    blacklist: 'thead, tbody, tfoot, tr, td[colspan="99"]',
});

var TextSelectorTags = 'span, p, h1, h2, h3, h4, h5, h6, blockquote, pre, small, u, i, b, font, strong, ul, li, dl, dt, ol, th, td';
var filter = ':not([t-field]):not(:has(t, [t-' + QWeb2.ACTIONS_PRECEDENCE.join('], [t-field], [t-') + ']))';
var Text = AbstractEditComponent.extend({
    name: 'text',
    template : 'web_studio.ReportText',
    selector: TextSelectorTags.split(',').join(filter + ',') + filter,
    blacklist: TextSelectorTags,
    custom_events: {
        wysiwyg_blur: '_onBlurWysiwygEditor',
    },
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.$node = $(utils.json_node_to_xml(this.node));
        this.$node.find('*').add(this.$node).each(function () {
                var node = this;
                _.each(Array.prototype.slice.call(node.attributes), function (attr) {
                    if (!attr.name.indexOf('data-oe-')) {
                        node.removeAttribute(attr.name);
                    }
                });
            });
        this.directiveFields.text = {
            type: 'text',
            value: utils.xml_to_str(this.$node[0]).split('>').slice(1).join('>').split('</').slice(0, -1).join('</'),
        };
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments)
            .then(function () {
                return self.fieldSelector.text.appendTo(self.$('.o_web_studio_text'));
            }).then(function () {
                return self._startWysiwygEditor();
            });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _onBlurWysiwygEditor: function () {
        var self = this;
        return this.wysiwyg.save().then(function (result) {
            if (result.isDirty) {
                self._triggerViewChange({text: result.html});
            }
        });
    },
    _startWysiwygEditor: function () {
        var self = this;
        this.wysiwyg = new Wysiwyg(this, {
            focus: false,
            height: 180,
            toolbar: [
                // ['style', ['style']],
                ['font', ['bold', 'italic', 'underline']],
                ['fontsize', ['fontsize']],
                ['color', ['color']],
                ['clear', ['clear']],
            ],
            prettifyHtml: false,
            styleWithSpan: false,
            lang: "odoo",
            disableDragAndDrop: true,
            recordInfo: {
                context: this.context,
            },
        });
        this.$textarea = this.$('textarea:first').val(this.directiveFields.text.value);

        this.$textarea.off().on('input', function (e) { // to test simple
            e.preventDefault();
            e.stopImmediatePropagation();
            self.wysiwyg.setValue($(this).val());
            self.wysiwyg.trigger_up('wysiwyg_blur');
        });

        return this.wysiwyg.attachTo(this.$textarea);
    },
    /**
     * @override
     */
    _triggerViewChange: function (newAttrs) {
        var node = this.node;
        var $node = this.$node.clone().html(newAttrs.text);
        var xml = utils.xml_to_str($node[0]).replace(/ xmlns="[^"]+"/, "");
        this.trigger_up('view_change', {
            node: node,
            operation: {
                inheritance: [{
                    content: xml,
                    position: "replace",
                    view_id: +node.attrs['data-oe-id'],
                    xpath: node.attrs['data-oe-xpath']
                }],
            },
        });
    },
});

var Image = LayoutEditable.extend({
    name: 'image',
    template: 'web_studio.ReportImage',
    selector: 'img',
    /**
     * @override
     */
    init: function() {
        this._super.apply(this, arguments);
        this.directiveFields.src = {
            type: 'text', value: this.node.attrs.src
        };
    },
    /**
     * @override
     */
    start: function() {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return self.fieldSelector.src.appendTo(self.$('.o_web_studio_source'));
        });
    },
});

var Groups = AbstractEditComponent.extend({
    name: 'groups',
    template: 'web_studio.ReportGroups',
    insertAsLastChildOfPrevious: true,
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);

        var groups = this.node.attrs.studio_groups && JSON.parse(this.node.attrs.studio_groups);
        this.directiveFields.groups = {
            name: 'groups',
            fields: [{
                name: 'id',
                type: 'integer',
            }, {
                name: 'display_name',
                type: 'char',
            }],
            value: groups,
            relation: 'res.groups',
            type: 'many2many',
            Widget: 'many2many_tags',
        };
    },
    /**
     * @override
     */
    start: function() {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return self.fieldSelector.groups.appendTo(self.$('.o_web_studio_groups'));
        });
    },
});

var TOptions = AbstractEditComponent.extend( {
    name: 'toptions',
    template : 'web_studio.ReportDirectiveTOptions',
    selector: '[t-field], [t-esc]',
    insertAsLastChildOfPrevious: true,
    events: _.extend({}, AbstractEditComponent.prototype.events, {
        'change select:first': '_onChangeWidget',
    }),
    /**
     * @override
     * @param {Object} [params.widgetsOptions]
     */
    init: function (parent, params) {
        this._super.apply(this, arguments);

        this.changes = {};
        this.widgetsOptions = params.widgetsOptions;

        // for contact widget, we don't want to display all options
        if (this.widgetsOptions && this.widgetsOptions.contact) {
            this.widgetsOptions.contact = _.pick(this.widgetsOptions.contact, [
                'fields',
                'separator',
                'no_marker',
            ]);
        }

        this.widget = null;  // the selected widget
        this.values = {};  // dict containing the t-options values

        this._extractTOptions();
    },
    /**
     * @override
     */
    willStart: function () {
        var self = this;

        // create fields for each widget options
        var directiveFields = this.directiveFields;
        this.widgets = _.map(this.widgetsOptions, function (widgetConf, widgetKey) {
            var values = self.values.widget === widgetKey ? self.values : {};

            var options = _.map(widgetConf, function (option, optionKey) {
                option.key = optionKey;
                if (option.default_value) {
                    option.default_value = option.default_value;
                }
                var required = typeof option.required === 'string' ?
                        option.required === 'value_to_html' && !('t-field' in self.node.attrs) :
                        option.required;
                var params = {
                    key: option.key,
                    string: option.string,
                    required: required,
                    attributeName: 't-options-' + optionKey,
                    value: values[optionKey],
                };
                switch (option.type) {
                    case 'model':
                        params.type = 'related';
                        //filter => m2o > model name
                        break;
                    case 'boolean':
                        params.type = 'boolean';
                        break;
                    case 'select':
                        params.type = 'selection';
                        params.selection = option.params;
                        break;
                    case 'float':
                        params.type = 'float';
                        break;
                    case 'integer':
                        params.type = 'integer';
                        break;
                    case 'date':
                    case 'datetime':
                        params.type = 'related';
                        params.filter = function (field) {
                            return field.type === 'many2one' || field.type === 'datetime';
                        };
                        params.followRelations = function (field) {
                            return field.type === 'many2one';
                        };
                        // free object date / datetime
                        params.freecode = true;
                        break;
                    case 'array':
                        if (option.params && option.params.type === 'selection') {
                            params.type = 'many2many';
                            params.Widget = 'many2many_select';
                            params.value = params.value && params.value.length ? params.value : option.default_value || [];
                            params.selection = option.params.params;
                        } else {
                            params.type = 'char';
                            params.value = JSON.stringify(params.value);
                        }
                        break;
                    case 'selection':
                        if (option.params && option.params.type === 'selection' && option.params.selection) {
                            params.type = option.params.type;
                            params.value = params.value ? params.value : option.default_value || false;
                            params.placeholder = option.params.placeholder || '';
                            params.selection = option.params.selection || [];
                        } else {
                            params.type = 'char';
                        }
                        break;
                    default:
                        params.type = 'char';
                }

                directiveFields[widgetKey + ':' + optionKey] = params;

                return params;
            });
            options.sort(function (a, b) {
                return (a.type === 'boolean' && b.type === 'boolean' ?
                        a.string.localeCompare(b.string) :
                        a.type === 'boolean' && a.key !== 'no_marker' ? -1 : 1);
            });

            return {
                key: widgetKey,
                string: widgetKey,
                options: options,
            };
        });
        this.widgets.sort(function (a, b) {
            return a.string.localeCompare(b.string);
        });

        // selected widget
        this.widget = _.findWhere(this.widgets, {key: this.values.widget && this.values.widget});

        return this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    start: function () {
        var defs = [this._super.apply(this, arguments)];
        if (this.widget) {
            this.$('.o_web_studio_toption_widget select').val(this.widget.key);
            defs.push(this._updateWidgetOptions());
        }
        return Promise.all(defs);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Extracts t-options widget and options for this node.
     *
     * @private
     */
    _extractTOptions: function () {
        this.values = py.extract(this.node.attrs['t-options'] || '{}');
        for (var k in this.node.attrs) {
            if (k.slice(0, 10) === 't-options-') {
                this.values[k.slice(10)] = py.extract(this.node.attrs[k]);
            }
        }
    },
    /**
     * @private
     * @returns {Promise}
     */
    _updateWidgetOptions: function () {
        var self = this;
        this.$('button').toggleClass('hidden', !this.widget || !this.widget.options.length);
        this.$('.o_web_studio_toption_options').remove();
        if (!this.widget || !this.widget.options.length) {
            return;
        }
        var $options = $(qweb.render('web_studio.ReportDirectiveTOptions.options', this));
        var defs = _.map(this.widget.options, function (option) {
            var $option = $options.find('.o_web_studio_toption_option_' + self.widget.key + '_' + option.key);
            var field = self.fieldSelector[self.widget.key + ':' + option.key];
            if (field instanceof owl.Component) {
                if (option.type === "boolean") {
                    return field.mount($option.find('label')[0], {position: 'first-child'});
                } else {
                    return field.mount($option[0]);
                }
            } else {
                if (option.type === "boolean") {
                    return field.prependTo($option.find('label'));
                } else {
                    return field.appendTo($option);
                }
            }

        });
        return Promise.all(defs).then (function () {
            self.$el.find('.o_studio_report_options_container').append($options);
        });
    },
    /**
     * @private
     * @override
     */
    _triggerViewChange: function (newAttrs) {
        var self = this;
        var changes = {};

        // this.widget is the recently set `widget` key
        if (this.widget) {
            var options = _.findWhere(this.widgets, {key: this.widget.key}).options;

            if (this.values.widget !== this.widget.key) {
                changes['t-options-widget'] = '"' + this.widget.key + '"';
            }
            _.each(newAttrs, function (val, key) {
                var field = key.split(':');
                if (self.widget.key === field[0]) {
                    var option = _.findWhere(options, {key: field[1]});
                    var value = val;
                    if (value) {
                        if (option.type === 'char' || option.type === 'selection') {
                            value = '"' + val.replace(/"/g, '\\"') + '"';
                        }
                    }

                    if (option.format) {
                        value = option.format(value);
                    }

                    if ((self.widget.key !== self.values.widget || value !== self.values[key])) {
                        changes['t-options-' + field[1]] = value;
                    }
                }
            });
        } else {
            changes['t-options-widget'] = '""';
            // TODO: remove all other set t-options-..
            // t-options='"{}"' doesn't work because t-options-.. has precedence
        }
        this.trigger_up('view_change', {
            node: this.node,
            operation: {
                type: 'attributes',
                new_attrs: changes,
            },
        });
    },
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onChangeWidget: function (ev) {
        var widget = _.findWhere(this.widgets, {key: $(ev.target).val()});
        if (widget !== this.widget) {
            this.widget = widget;
            this._triggerViewChange({});
        }
        this._updateWidgetOptions();
    },
    /**
     * @override
     */
    _onDirectiveChange: function (e) {
        if (e.target.name === 'contact:fields') {
            // this field uses a special FieldWidget (many2many_select) which is
            // not a real FieldWidget so the changes are not formatted as
            // expected
            e.stopPropagation();
            var changes = _.clone(e.data.changes);
            var key = _.keys(changes)[0];
            changes[key] = changes[key].ids;
            this._triggerViewChange(changes);
        } else {
            this._super.apply(this, arguments);
        }
    },
});

return {
    BlockTotal: BlockTotal,
    Column: Column,
    Groups: Groups,
    Image: Image,
    LayoutEditable: LayoutEditable,
    Table: Table,
    Text: Text,
    TField: TField,
    TForeach: TForeach,
    TElse: TElse,
    TEsc: TEsc,
    TIf: TIf,
    TOptions: TOptions,
    TSet: TSet,
};

});
