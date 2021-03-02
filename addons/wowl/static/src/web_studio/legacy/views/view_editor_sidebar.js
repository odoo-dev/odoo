odoo.define('web_studio.ViewEditorSidebar', function (require) {
"use strict";

var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var DomainSelectorDialog = require("web.DomainSelectorDialog");
var Domain = require("web.Domain");
var field_registry = require('web.field_registry');
var fieldRegistryOwl = require('web.field_registry_owl');
var pyUtils = require('web.py_utils');
var relational_fields = require('web.relational_fields');
var session = require("web.session");
var StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');
var utils = require('web.utils');
var view_components = require('web_studio.view_components');
var Widget = require('web.Widget');

var form_component_widget_registry = view_components.registry;
var _lt = core._lt;
var _t = core._t;
var Many2ManyTags = relational_fields.FieldMany2ManyTags;
const Many2One = relational_fields.FieldMany2One;


/**
 * This object is used to define all the options editable through the Studio
 * sidebar, by field widget.
 *
 * An object value must be an array of Object (one object by option).
 * An option object must have as attributes a `name`, a `string` and a `type`
 * (currently among `boolean` and `selection`):
 *
 * * `selection` option must have an attribute `selection` (array of tuple).
 * * `boolean` option can have an attribute `leaveEmpty` (`checked` or
 *     `unchecked`).
 *
 * @type {Object}
 */
var OPTIONS_BY_WIDGET = {
    image: [
        {name: 'size', type: 'selection', string: _lt("Size"), selection: [
            [[0, 90], _lt("Small")], [[0, 180], _lt("Medium")], [[0, 270], _lt("Large")],
        ]},
    ],
    many2one: [
        {name: 'no_create', type: 'boolean', string: _lt("Disable creation"), leaveEmpty: 'unchecked'},
        {name: 'no_open', type: 'boolean', string: _lt("Disable opening"), leaveEmpty: 'unchecked'},
    ],
    many2many_tags: [
        { name: 'no_create', type: 'boolean', string: _lt("Disable creation"), leaveEmpty: 'unchecked' },
        {name: 'color_field', type: 'boolean', string: _lt("Use colors"), leaveEmpty: 'unchecked'},
    ],
    radio: [
        {name: 'horizontal', type: 'boolean', string: _lt("Display horizontally")},
    ],
    signature: [
        {name: 'full_name', type: 'selection', string: _lt('Auto-complete with'), selection: [[]]},
        // 'selection' will be computed later on for the attribute to be dynamic (based on model fields)
    ],
    daterange: [
        {name: 'related_start_date', type: 'selection', string: _lt("Related Start Date"), selection: [[]]},
        {name: 'related_end_date', type: 'selection', string: _lt("Related End Date"), selection: [[]]},
    ],
    phone: [
        {name: 'enable_sms', type: 'boolean', string: _lt("Enable SMS")},
    ],
};

return Widget.extend(StandaloneFieldManagerMixin, {
    template: 'web_studio.ViewEditorSidebar',
    events: {
        'click .o_web_studio_new:not(.inactive)':            '_onTab',
        'click .o_web_studio_view':                          '_onTab',
        'click .o_web_studio_xml_editor':                    '_onXMLEditor',
        'click .o_display_view .o_web_studio_parameters':    '_onViewParameters',
        'click .o_display_field .o_web_studio_parameters':   '_onFieldParameters',
        'click .o_display_view .o_web_studio_defaults':      '_onDefaultValues',
        'change #show_invisible':                            '_onShowInvisibleToggled',
        'click .o_web_studio_remove':                        '_onElementRemoved',
        'click .o_web_studio_restore':                       '_onRestoreDefaultView',
        'change .o_display_view input':                      '_onViewChanged',
        'change .o_display_view select':                     '_onViewChanged',
        'click .o_web_studio_edit_selection_values':         '_onSelectionValues',
        'change .o_display_field [data-type="attributes"]':  '_onElementChanged',
        'change .o_display_field [data-type="options"]':     '_onOptionsChanged',
        'change .o_display_div input[name="set_cover"]':     '_onSetCover',
        'change .o_display_field input[data-type="field_name"]': '_onFieldNameChanged',
        'focus .o_display_field input[data-type="attributes"][name="domain"]': '_onDomainEditor',
        'change .o_display_field [data-type="default_value"]': '_onDefaultValueChanged',
        'change .o_display_page input':                      '_onElementChanged',
        'change .o_display_label input':                     '_onElementChanged',
        'change .o_display_group input':                     '_onElementChanged',
        'change .o_display_button input':                    '_onElementChanged',
        'change .o_display_button select':                   '_onElementChanged',
        'click .o_web_studio_sidebar_approval .o_approval_archive':  '_onApprovalArchive',
        'change .o_web_studio_sidebar_approval':                     '_onApprovalChange',
        'click .o_web_studio_sidebar_approval .o_approval_domain':   '_onApprovalDomain',
        'click .o_web_studio_sidebar_approval .o_approval_new':      '_onApprovalNewRule',
        'click .o_display_button .o_img_upload':             '_onUploadRainbowImage',
        'click .o_display_button .o_img_reset':              '_onRainbowImageReset',
        'change .o_display_filter input':                    '_onElementChanged',
        'change .o_display_chatter input[data-type="email_alias"]': '_onEmailAliasChanged',
        'click .o_web_studio_attrs':                         '_onDomainAttrs',
        'focus .o_display_filter input#domain':              '_onDomainEditor',
        'keyup .o_web_studio_sidebar_search_input':          '_onSearchInputChange',
    },
    /**
     * @constructor
     * @param {Widget} parent
     * @param {Object} params
     * @param {Object} params.state
     * @param {Object} params.view_type
     * @param {Object} params.model_name
     * @param {Object} params.fields
     * @param {Object} params.fields_in_view
     * @param {Object} params.fields_not_in_view
     * @param {boolean} params.isEditingX2m
     * @param {Array} params.renamingAllowedFields
     */
    init: function (parent, params) {
        this._super.apply(this, arguments);
        StandaloneFieldManagerMixin.init.call(this);
        var self = this;
        this.accepted_file_extensions = 'image/*';
        this.debug = config.isDebug();

        this.view_type = params.view_type;
        this.model_name = params.model_name;
        this.isEditingX2m = params.isEditingX2m;
        this.editorData = params.editorData;
        this.renamingAllowedFields = params.renamingAllowedFields;

        this.fields = params.fields;
        this.fieldsInfo = params.fieldsInfo;
        if (params.defaultOrder) {
            if (params.defaultOrder.includes(',')) {
                params.defaultOrder = params.defaultOrder.split(',')[0];
            }
            this.defaultOrder = params.defaultOrder.split(' ');
        }
        this.orderered_fields = _.sortBy(this.fields, function (field) {
            return field.string.toLowerCase();
        });
        this.fields_in_view = params.fields_in_view;
        this.fields_not_in_view = params.fields_not_in_view;

        this.GROUPABLE_TYPES = ['many2one', 'char', 'boolean', 'selection', 'date', 'datetime'];
        // FIXME: At the moment, it's not possible to set default value for these types
        this.NON_DEFAULT_TYPES = ['many2one', 'many2many', 'one2many', 'binary'];
        this.MODIFIERS_IN_NODE_AND_ATTRS = ['readonly', 'invisible', 'required'];

        this.state = params.state || {};

        this._searchValue = '';
        this._isSearchValueActive = false;

        const Widget = this.state.attrs.Widget;
        this.widgetKey = this._getWidgetKey(Widget);

        const allowedModifiersNode = ['group', 'page', 'field', 'filter'];
        if (this.state.node && allowedModifiersNode.includes(this.state.node.tag)) {
            this.state.modifiers = this.state.attrs.modifiers || {};
        }

        if (this.state.node && (this.state.node.tag === 'field' || this.state.node.tag === 'filter')) {
            // deep copy of field because the object is modified
            // in this widget and this shouldn't impact it
            var field = jQuery.extend(true, {}, this.fields[this.state.attrs.name]);

            // fieldRegistryMap contains all widgets and components but we want to filter
            // these widgets based on field types (and description for non debug mode)
            const fieldRegistryMap = Object.assign({}, field_registry.map, fieldRegistryOwl.map);
            field.field_widgets = _.chain(fieldRegistryMap)
                .pairs()
                .filter(function (arr) {
                    const supportedFieldTypes = utils.isComponent(arr[1]) ?
                        arr[1].supportedFieldTypes :
                        arr[1].prototype.supportedFieldTypes;
                    const description = self.getFieldInfo(arr[1], 'description');
                    const isWidgetKeyDescription = arr[0] === self.widgetKey && !description;
                    var isSupported = _.contains(supportedFieldTypes, field.type)
                        && arr[0].indexOf('.') < 0;
                    return config.isDebug() ? isSupported : isSupported && description || isWidgetKeyDescription;
                })
                .sortBy(function (arr) {
                    const description = self.getFieldInfo(arr[1], 'description');
                    return description || arr[0];
                })
                .value();

            this.state.field = field;

            // only for list & tree view
            this._computeFieldAttrs();

            // Get dynamic selection for 'full_name' node option of signature widget
            if (this.widgetKey === 'signature') {
                var selection = [[]]; // By default, selection should be empty
                var signFields = _.chain(_.sortBy(_.values(this.fields_in_view), 'string'))
                    .filter(function (field) {
                        return _.contains(['char', 'many2one'], field.type);
                    })
                    .map(function (val, key) {
                        return [val.name, config.isDebug() ? _.str.sprintf('%s (%s)', val.string, val.name) : val.string];
                    })
                    .value();
                _.findWhere(OPTIONS_BY_WIDGET[this.widgetKey], {name: 'full_name'}).selection = selection.concat(signFields);
            }
            // Get dynamic selection for 'related_start_date' and 'related_end_date' node option of daterange widget
            if (this.widgetKey === 'daterange') {
                var selection = [[]];
                var dateFields = _.chain(_.sortBy(_.values(this.fields_in_view), 'string'))
                    .filter(function (field) {
                        return _.contains([self.state.field.type], field.type);
                    })
                    .map(function (val, key) {
                        return [val.name, config.isDebug() ? _.str.sprintf('%s (%s)', val.string, val.name) : val.string];
                    })
                    .value();
                selection = selection.concat(dateFields);
                _.each(OPTIONS_BY_WIDGET[this.widgetKey], function (option) {
                    if (_.contains(['related_start_date', 'related_end_date'], option.name)) {
                        option.selection = selection;
                    }
                });
            }
            this.OPTIONS_BY_WIDGET = OPTIONS_BY_WIDGET;

            this.has_placeholder = Widget && Widget.prototype.has_placeholder || false;

            // aggregate makes no sense with some widgets
            this.hasAggregate = _.contains(['integer', 'float', 'monetary'], field.type) &&
                !_.contains(['progressbar', 'handle'], this.state.attrs.widget);

            if (this.view_type === 'kanban') {
                this.showDisplay = this.state.$node && !this.state.$node
                    .parentsUntil('.o_kanban_record')
                    .filter(function () {
                        // if any parent is display flex, display options (float
                        // right, etc.) won't work
                        return $(this).css('display') === 'flex';
                    }).length;
            }
        }
        // Upload image related stuff
        if (this.state.node && this.state.node.tag === 'button') {
            const isStatBtn = this.state.node.attrs.class === 'oe_stat_button';
            const isMethodBtn = this.state.node.attrs.type == 'object';
            this.showRainbowMan = !isStatBtn && isMethodBtn
            if (this.showRainbowMan) {
                this.state.node.widget = "image";
                this.user_id = session.uid;
                this.fileupload_id = _.uniqueId('o_fileupload');
                $(window).on(this.fileupload_id, this._onUploadRainbowImageDone.bind(this));
            }
        }
        if (this.state.mode === 'view' && this.view_type === 'gantt') {
            // precision attribute in gantt is complicated to write so we split it
            // {'day': 'hour:half', 'week': 'day:half', 'month': 'day', 'year': 'month:quarter'}
            this.state.attrs.ganttPrecision = this.state.attrs.precision ? pyUtils.py_eval(this.state.attrs.precision) : {};

        }
    },
    /**
     * @override
     */
    start: function () {
        return this._super.apply(this, arguments).then(this._render.bind(this));
    },
    /**
     * Called each time the view editor sidebar is attached into the DOM.
    */
    on_attach_callback: function () {
        // focus only works on the elements attached on DOM, so we focus
        // and select the label once the sidebar is attached to DOM
        if (this.state.mode === 'properties') {
            this.$('input[name=string]').focus().select();
        }
    },
    /**
     * @override
     */
    destroy: function () {
        $(window).off(this.fileupload_id);
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Transform an array domain into its string representation.
     *
     * @param {Array} domain
     * @returns {String}
     */
    domainToStr: function (domain) {
        return Domain.prototype.arrayToString(domain);
    },
    /**
     * Returns class property's value.
     *
     * @param {any} fieldType
     * @param {string} propName
     */
    getFieldInfo(fieldType, propName) {
        return utils.isComponent(fieldType) ?
            (fieldType.hasOwnProperty(propName) && fieldType[propName]) :
            (fieldType.prototype.hasOwnProperty(propName) && fieldType.prototype[propName]);
    },
    /**
     * @param {string} fieldName
     * @returns {boolean} if the field can be renamed
     */
    isRenamingAllowed: function (fieldName) {
        return _.contains(this.renamingAllowedFields, fieldName);
    },
    /**
     * @param {String} value
     * @returns {Boolean}
     */
    isTrue: function (value) {
        return value !== 'false' && value !== 'False';
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Called by _onFieldChanged when the field changed is the M2O of an approval
     * rule for its res.groups field. Update the according rule server-side.
     * @private
     */
    _changeApprovalGroup: function (approvalField) {
        const record = this.model.get(this.approvalHandle);
        const groupId = record.data[approvalField].res_id;
        const ruleId = parseInt(/rule_group_(\d+)/.exec(approvalField)[1]);
        this.trigger_up('approval_group_change', {
            ruleId,
            groupId,
        });
    },
    /**
     * @private
     */
    _changeFieldGroup: function () {
        var record = this.model.get(this.groupsHandle);
        var new_attrs = {};
        new_attrs.groups = record.data.groups.res_ids;
        this.trigger_up('view_change', {
            type: 'attributes',
            structure: 'edit_attributes',
            node: this.state.node,
            new_attrs: new_attrs,
        });
    },
    /**
     * @private
     * @param {OdooEvent} ev
     * @param {Object} oldMapPopupField
     */
    _changeMapPopupFields: function (ev, oldMapPopupField) {
        const options = {structure: 'map_popup'};
        if (ev.data.changes.map_popup.operation === 'ADD_M2M') {
            const ids = ev.data.changes.map_popup.ids;
            options.type = 'add';
            options.field_ids = Array.isArray(ids) ? ids.map(i => i.id) : [ids.id];
        } else {
            options.type = 'remove';
            options.field_ids = [oldMapPopupField.data.find(i => i.id === ev.data.changes.map_popup.ids[0]).res_id];
        }
        this.trigger_up('view_change', options);
    },
    /**
     * @private
     */
    _computeFieldAttrs: function () {
        /* Compute field attributes.
         * These attributes are either taken from modifiers or attrs
         * so attrs store their combinaison.
         */
        this.state.attrs.invisible = this.state.modifiers.invisible || this.state.modifiers.column_invisible;
        this.state.attrs.readonly = this.state.modifiers.readonly;
        this.state.attrs.string = this.state.attrs.string || this.state.field.string;
        this.state.attrs.help = this.state.attrs.help || this.state.field.help;
        this.state.attrs.placeholder = this.state.attrs.placeholder || this.state.field.placeholder;
        this.state.attrs.required = this.state.field.required || this.state.modifiers.required;
        this.state.attrs.domain = this.state.attrs.domain || this.state.field.domain;
        this.state.attrs.context = this.state.attrs.context || this.state.field.context;
        this.state.attrs.related = this.state.field.related ? this.state.field.related.join('.'): false;
    },
    /**
     * @private
     * @param {Object} modifiers
     * @returns {Object}
     */
    _getNewAttrsFromModifiers: function (modifiers) {
        var self = this;
        var newAttributes = {};
        var attrs = [];
        var originNodeAttr = this.state.modifiers;
        var originSubAttrs =  pyUtils.py_eval(this.state.attrs.attrs || '{}', this.editorData);
        _.each(modifiers, function (value, key) {
                var keyInNodeAndAttrs = _.contains(self.MODIFIERS_IN_NODE_AND_ATTRS, key);
                var keyFromView = key in originSubAttrs;
                var trueValue = value === true || _.isEqual(value, []);
                var isOriginNodeAttr = key in originNodeAttr;

                if (keyInNodeAndAttrs && !isOriginNodeAttr && trueValue) { // modifier always applied, use modifier attribute
                    newAttributes[key] = "1";
                } else if (keyFromView || !trueValue) { // modifier not applied or under certain condition, remove modifier attribute and use attrs if any
                    newAttributes[key] = "";
                    if (value !== false) {
                        attrs.push(_.str.sprintf("\"%s\": %s", key, Domain.prototype.arrayToString(value)));
                    }
                }
        });
        newAttributes.attrs = _.str.sprintf("{%s}", attrs.join(", "));
        return newAttributes;
    },
    /**
     * @private
     * @param {Class} Widget
     * @returns {string} the field key
     */
    _getWidgetKey: function (Widget) {
        var widgetKey = this.state.attrs.widget;
        if (!widgetKey) {
            const fieldRegistryMap = Object.assign({}, field_registry.map, fieldRegistryOwl.map);
            _.each(fieldRegistryMap, function (val, key) {
                if (val === Widget) {
                    widgetKey = key;
                }
            });
            // widget key can be prefixed by a view type (like form.many2many_tags)
            if (_.str.include(widgetKey, '.')) {
                widgetKey = widgetKey.split('.')[1];
            }
        }
        return widgetKey;
    },
    /**
     * Render additional sections according to the sidebar mode
     * i.e. the new & existing field if 'new', etc.
     *
     * @private
     * @returns {Promise}
     */
    _render: function () {
        this.defs = [];
        if (this.state.mode === 'new') {
            if (!this._isSearchValueActive) {
                if (_.contains(['form', 'search'], this.view_type)) {
                    this._renderComponentsSection();
                }
                if (_.contains(['list', 'form'], this.view_type)) {
                    this._renderNewFieldsSection();
                }
            }
            this._renderExistingFieldsSection();
            return Promise.all(this.defs).then(() => {
                delete(this.defs);
                this.$('.o_web_studio_component').on("drag", _.throttle((event, ui) => {
                    this.trigger_up('drag_component', {position: {pageX: event.pageX, pageY: event.pageY}, $helper: ui.helper});
                }, 200));
            });
        } else if (this.state.mode === 'properties') {
            if (this.$('.o_groups').length) {
                this.defs.push(this._renderWidgetsM2MGroups());
            }
            if (this.el.querySelectorAll('.o_studio_sidebar_approval_rule').length) {
                this.defs.push(this._renderWidgetsApprovalRules());
            }
            return Promise.all(this.defs).then(() => delete(this.defs));
        }
        if (this.view_type === 'map' && this.$('.o_map_popup_fields').length) {
            delete(this.defs);
            return this._renderWidgetsMapPopupFields();
        }
    },
    /**
     * @private
     */
    _renderComponentsSection: function () {
        const widgetClasses = form_component_widget_registry.get(this.view_type + '_components');
        const formWidgets = widgetClasses.map(FormComponent => new FormComponent(this));
        const $sectionTitle = $('<h3>', {
            html: _t('Components'),
        });
        const $section = this._renderSection(formWidgets);
        $section.addClass('o_web_studio_new_components');
        const $sidebarContent = this.$('.o_web_studio_sidebar_content');
        $sidebarContent.append($sectionTitle, $section);
    },
    /**
     * @private
     */
    _renderExistingFieldsSection: function () {
        const $existingFields = this.$('.o_web_studio_existing_fields');
        if ($existingFields.length) {
            $existingFields.remove();  // clean up before re-rendering
        }

        let formWidgets;
        const formComponent = form_component_widget_registry.get('existing_field');
        if (this.view_type === 'search') {
            formWidgets = Object.values(this.fields).map(field =>
                new formComponent(this, field.name, field.string, field.type, field.store));
        } else {
            const fields = _.sortBy(this.fields_not_in_view, function (field) {
                return field.string.toLowerCase();
            });
            formWidgets = fields.map(field => new formComponent(this, field.name, field.string, field.type));
        }

        if (this._searchValue) {
            formWidgets = formWidgets.filter(result => {
                const searchValue = this._searchValue.toLowerCase();
                if (this.debug) {
                    return result.label.toLowerCase().includes(searchValue) ||
                        result.description.toLowerCase().includes(searchValue);
                }
                return result.label.toLowerCase().includes(searchValue);
            });
        }

        const $sidebarContent = this.$('.o_web_studio_sidebar_content');
        const $section = this._renderSection(formWidgets);
        $section.addClass('o_web_studio_existing_fields');
        if ($existingFields.length) {
            $sidebarContent.append($section);
        } else {
            const $sectionTitle = $('<h3>', {
                html: _t('Existing Fields'),
            });
            const $sectionSearchDiv = core.qweb.render('web_studio.ExistingFieldsInputSearch');
            $sidebarContent.append($sectionTitle, $sectionSearchDiv, $section);
        }
    },
    /**
     * @private
     */
    _renderNewFieldsSection: function () {
        const widgetClasses = form_component_widget_registry.get('new_field');
        const formWidgets = widgetClasses.map(FormComponent => new FormComponent(this));
        const $sectionTitle = $('<h3>', {
            html: _t('New Fields'),
        });
        const $section = this._renderSection(formWidgets);
        $section.addClass('o_web_studio_new_fields');

        const $sidebarContent = this.$('.o_web_studio_sidebar_content');
        $sidebarContent.append($sectionTitle, $section);
    },
    /**
     * @private
     * @param {Object} form_widgets
     * @returns {JQuery}
     */
    _renderSection: function (form_widgets) {
        var self = this;
        var $components_container = $('<div>').addClass('o_web_studio_field_type_container');
        form_widgets.forEach(function (form_component) {
            self.defs.push(form_component.appendTo($components_container));
        });
        return $components_container;
    },
    /**
     * Render and attach group widget for each approval rule.
     * @private
     * @returns {Promise}
     */
    _renderWidgetsApprovalRules: async function () {
        const groupTargets = this.el.querySelectorAll('.o_approval_group');
        const fields = [];
        groupTargets.forEach((node) => {
            fields.push({
                name: 'rule_group_' + node.dataset.ruleId,
                fields: [{
                    name: 'id',
                    type: 'integer',
                }, {
                    name: 'display_name',
                    type: 'char',
                }],
                relation: 'res.groups',
                type: 'many2one',
                value: parseInt(node.dataset.groupId),
            })
        });
        this.approvalHandle  = await this.model.makeRecord('ir.model.fields', fields);
        const record = this.model.get(this.approvalHandle);
        const defs = [];
        groupTargets.forEach((node, index) => {
            const options = {
                idForLabel: 'group',
                mode: 'edit',
                noOpen: true,
            };
            const fieldName = fields[index].name;
            const many2one = new Many2One(this, fieldName, record, options);
            this._registerWidget(this.approvalHandle, 'group', many2one);
            defs.push(many2one.prependTo($(node)));
        });
        return Promise.all(defs);
    },
    /**
     * @private
     * @returns {Promise}
     */
    _renderWidgetsM2MGroups: function () {
        var self = this;
        var studio_groups = this.state.attrs.studio_groups && JSON.parse(this.state.attrs.studio_groups);
        return this.model.makeRecord('ir.model.fields', [{
            name: 'groups',
            fields: [{
                name: 'id',
                type: 'integer',
            }, {
                name: 'display_name',
                type: 'char',
            }],
            relation: 'res.groups',
            type: 'many2many',
            value: studio_groups,
        }]).then(function (recordID) {
            self.groupsHandle = recordID;
            var record = self.model.get(self.groupsHandle);
            var options = {
                idForLabel: 'groups',
                mode: 'edit',
                no_quick_create: true,
            };
            var many2many = new Many2ManyTags(self, 'groups', record, options);
            self._registerWidget(self.groupsHandle, 'groups', many2many);
            return many2many.appendTo(self.$('.o_groups'));
        });
    },
    /**
     * @private
     * @returns {Promise}
     */
    _renderWidgetsMapPopupFields: function () {
        const fieldIDs = JSON.parse(this.state.attrs.studio_map_field_ids || '[]');
        return this.model.makeRecord('ir.model', [{
            name: 'map_popup',
            fields: [{
                name: 'id',
                type: 'integer',
            }, {
                name: 'display_name',
                type: 'char',
            }],
            domain: [
                ['model', '=', this.model_name],
                ['ttype', 'not in', ['many2many', 'one2many', 'binary']]
            ],
            relation: 'ir.model.fields',
            type: 'many2many',
            value: fieldIDs,
        }], {
            map_popup: {
                can_create: false
            },
        }).then(recordID => {
            this.mapPopupFieldHandle = recordID;
            const record = this.model.get(this.mapPopupFieldHandle);
            const many2many = new Many2ManyTags(this, 'map_popup', record, {mode: 'edit'});
            this._registerWidget(this.mapPopupFieldHandle, 'map_popup', many2many);
            return many2many.appendTo(this.$('.o_map_popup_fields'));
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Handle a click on 'remove rule' for approvals; dispatch to view editor
     * manager.
     * @private
     * @param {DOMEvent} ev
     */
    _onApprovalArchive: function (ev) {
        const ruleId = parseInt(ev.currentTarget.dataset.ruleId);
        this.trigger_up('approval_archive', {
            ruleId,
        });
    },
    /**
     * Handle a click on 'add approval rule'; dispatch to view editor
     * manager.
     * @private
     * @param {DOMEvent} ev
     */
    _onApprovalNewRule: function (ev) {
        const model = this.model_name;
        const isMethod = this.state.node.attrs.type === 'object';
        const method = isMethod?this.state.node.attrs.name:false
        const action = isMethod?false:this.state.node.attrs.name;
        this.trigger_up('approval_new_rule', {
            model,
            method,
            action,
        });
    },
    /**
     * Handler for the 'set condition' button of approval rules; instanciate
     * a domain selector dialog that will dispatch an event to the view editor
     * manager upon submission.
     * @private
     * @param {DOMEvent} ev
     */
    _onApprovalDomain: function(ev) {
        const ruleId = parseInt(ev.currentTarget.dataset.ruleId);
        const rule = this.state.approvalData.rules.find(r => r.id === ruleId);
        const dialog = new DomainSelectorDialog(this, this.model_name, rule.domain||[], {
            title: _('Condition'),
            readonly: false,
            fields: this.fields,
            size: 'medium',
            operators: ["=", "!=", "<", ">", "<=", ">=", "in", "not in", "set", "not set"],
            followRelations: true,
            debugMode: config.isDebug(),
            $content: $(
                _t("<div><p>The approval rule is only applied to records matching the following condition:</p></div>")
            ),
        }).open();
        dialog.on("domain_selected", this, function (e) {
            this.trigger_up('approval_condition', {
                ruleId: ruleId,
                domain: e.data.domain,
            });
        });
    },
    /**
     * Generic handlers for other operations on approvals; dispatch the correct event
     * to the view editor manager.
     * @private
     * @param {DOMEvent} ev
     */
    _onApprovalChange: function(ev) {
        let type, payload;
        // input name for approval rules are formatted as `input`_`rule_id`
        const inputName = ev.target.name;
        const parsedInput = /([a-zA-Z_]*)_(\d+)/.exec(inputName);
        let input, ruleId;
        if (parsedInput) {
            input = parsedInput[1];
            ruleId = parseInt(parsedInput[2]);
        } else {
            input = inputName;
        }
        switch (input) {
            case 'studio_approval':
                // special case: this is the one that actually edits the view
                return this.trigger_up('view_change', {
                    structure: 'enable_approval',
                    node: this.state.node,
                    enable: ev.target.checked,
                });
            case 'approval_message':
                type = 'operation_approval_message';
                payload = ev.target.value;
                break;
            case 'exclusive_user':
                type = 'operation_different_users';
                payload = ev.target.checked;
                break;
            default:
                console.debug('unsupported operation for approval modification', ev.target.name);
                return false;
        }
        this.trigger_up('approval_change', {
            type: type,
            payload: payload,
            ruleId: parseInt(ruleId),
            node: this.state.node,
        });
    },
    /**
     * @private
     */
    _onDefaultValues: function () {
        this.trigger_up('open_defaults');
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onDefaultValueChanged: function (ev) {
        var self = this;
        var $input = $(ev.currentTarget);
        var value = $input.val();
        if (value !== this.state.default_value) {
            this.trigger_up('default_value_change', {
                field_name: this.state.attrs.name,
                value: value,
                on_fail: function () {
                    $input.val(self.default_value);
                }
            });
        }
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onDomainAttrs: function (ev) {
        ev.preventDefault();
        var modifier = ev.currentTarget.dataset.type;

        // Add id to the list of usable fields
        var fields = this.fields_in_view;
        if (!fields.id) {
            fields = _.extend({
                id: {
                    searchable: true,
                    string: "ID",
                    type: "integer",
                },
            }, fields);
        }

        var dialog = new DomainSelectorDialog(this, this.model_name, _.isArray(this.state.modifiers[modifier]) ? this.state.modifiers[modifier] : [], {
            readonly: false,
            fields: fields,
            size: 'medium',
            operators: ["=", "!=", "<", ">", "<=", ">=", "in", "not in", "set", "not set"],
            followRelations: false,
            debugMode: config.isDebug(),
            $content: $(_.str.sprintf(
                _t("<div><p>The <strong>%s</strong> property is only applied to records matching this filter.</p></div>"),
                modifier
            )),
        }).open();
        dialog.on("domain_selected", this, function (e) {
            var newModifiers = _.extend({}, this.state.modifiers);
            newModifiers[modifier] = e.data.domain;
            var new_attrs = this._getNewAttrsFromModifiers(newModifiers);
            this.trigger_up('view_change', {
                type: 'attributes',
                structure: 'edit_attributes',
                node: this.state.node,
                new_attrs: new_attrs,
            });
        });
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onDomainEditor: function (ev) {
        ev.preventDefault();
        var $input = $(ev.currentTarget);

        // If we want to edit a filter domain, we don't have a specific
        // field to work on but we want a domain on the current model.
        var model = this.state.node.tag === 'filter' ? this.model_name : this.state.field.relation;
        var dialog = new DomainSelectorDialog(this, model, $input.val(), {
            readonly: false,
            debugMode: config.isDebug(),
        }).open();
        dialog.on("domain_selected", this, function (e) {
            $input.val(Domain.prototype.arrayToString(e.data.domain)).change();
        });
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onElementChanged: function (ev) {
        var $input = $(ev.currentTarget);
        var attribute = $input.attr('name');
        if (attribute && $input.attr('type') !== 'file') {
            var new_attrs = {};
            // rainbow attribute on button needs JSON value, so on change of any rainbow related
            // attributes, re-form rainbow attribute in required format, excluding falsy/empty
            // values
            if (attribute.match('^rainbow')) {
                if (this.$('input#rainbow').is(':checked')) {
                    new_attrs.effect = JSON.stringify(_.pick({
                            message: this.$('input#rainbow_message').val(),
                            img_url: this.$('input#rainbow_img_url').val(),
                            fadeout: this.$('select#rainbow_fadeout').val(),
                        }, _.identity)
                    );
                } else {
                    new_attrs.effect = 'False';
                }
            } else if (attribute === 'widget') {
                // reset widget options
                var widget = $input.val();
                new_attrs = {
                    widget: widget,
                    options: '',
                };
                if (widget === 'image') {
                    // add small as a default size for image widget
                    new_attrs.options = JSON.stringify({size: [0, 90]});
                }
            } else if ($input.attr('type') === 'checkbox') {
                if (!_.contains(this.MODIFIERS_IN_NODE_AND_ATTRS, attribute)) {
                    if ($input.is(':checked')) {
                        new_attrs[attribute] = $input.data('leave-empty') === 'checked' ? '': 'True';
                    } else {
                        new_attrs[attribute] = $input.data('leave-empty') === 'unchecked' ? '': 'False';
                    }
                } else {
                    var newModifiers = _.extend({}, this.state.modifiers);
                    newModifiers[attribute] = $input.is(':checked');
                    new_attrs = this._getNewAttrsFromModifiers(newModifiers);
                    if (attribute === 'readonly' && $input.is(':checked')) {
                        new_attrs.force_save = 'True';
                    }
                }
            } else if (attribute === 'aggregate') {
                var aggregate = $input.find('option:selected').attr('name');
                // only one of them can be set at the same time
                new_attrs = {
                    avg: aggregate === 'avg' ? 'Average of ' + this.state.attrs.string : '',
                    sum: aggregate === 'sum' ? 'Sum of ' +  this.state.attrs.string : '',
                };
            } else {
                new_attrs[attribute] = $input.val();
            }

            this.trigger_up('view_change', {
                type: 'attributes',
                structure: 'edit_attributes',
                node: this.state.node,
                new_attrs: new_attrs,
            });
        }
    },
    /**
     * @private
     */
    _onElementRemoved: function () {
        var self = this;
        var elementName = this.state.node.tag;
        if (elementName === 'div' && this.state.node.attrs.class === 'oe_chatter') {
            elementName = 'chatter';
        }
        var message = _.str.sprintf(_t('Are you sure you want to remove this %s from the view?'), elementName);

        Dialog.confirm(this, message, {
            confirm_callback: function () {
                self.trigger_up('view_change', {
                    type: 'remove',
                    structure: 'remove',
                    node: self.state.node,
                });
            }
        });
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onEmailAliasChanged: function (ev) {
        var $input = $(ev.currentTarget);
        var value = $input.val();
        if (value !== this.state.email_alias) {
            this.trigger_up('email_alias_change', {
                value: value,
            });
        }
    },
    /**
     * @override
     * @private
     */
    _onFieldChanged: async function (ev) {
        const approvalChanges = Object.keys(ev.data.changes).filter(f => f.startsWith('rule_group_'));
        const isApprovalChange = approvalChanges.length;
        const isMapChange = Object.keys(ev.data.changes).filter(f => f === 'map_popup').length;
        const approvalField = isApprovalChange && approvalChanges[0];
        const oldMapPopupField = this.mapPopupFieldHandle && this.model.get(this.mapPopupFieldHandle).data.map_popup;
        const result = await StandaloneFieldManagerMixin._onFieldChanged.apply(this, arguments);
        if (isMapChange) {
            this._changeMapPopupFields(ev, oldMapPopupField);
        } else if (isApprovalChange) {
            this._changeApprovalGroup(approvalField);
        } else {
            this._changeFieldGroup();
        }
        return result;
    },
    /**
     * Renames the field after confirmation from user.
     *
     * @private
     * @param {Event} ev
     */
    _onFieldNameChanged: function (ev) {
        var $input = $(ev.currentTarget);
        var attribute = $input.attr('name');
        if (!attribute) {
            return;
        }
        var newName = 'x_studio_' + $input.val();
        var message;
        if (newName.match(/[^a-z0-9_]/g) || newName.length >= 54) {
            message = _.str.sprintf(_t('The new name can contain only a to z lower letters, numbers and _, with ' +
                'a maximum of 53 characters.'));
            Dialog.alert(this, message);
            return;
        }
        if (newName in this.fields) {
            message = _.str.sprintf(_t('A field with the same name already exists.'));
            Dialog.alert(this, message);
            return;
        }
        this.trigger_up('field_renamed', {
            oldName: this.state.node.attrs.name,
            newName: newName,
        });
    },
    /**
     * @private
     */
    _onFieldParameters: function () {
        this.trigger_up('open_field_form', {field_name: this.state.attrs.name});
    },
    /**
     * @private
     * @param {jQueryEvent} ev
     */
    _onOptionsChanged: function (ev) {
        var $input = $(ev.currentTarget);

        // We use the original `options` attribute on the node here and evaluate
        // it (same processing as in basic_view) ; we cannot directly take the
        // options dict because it usually has been modified in place in field
        // widgets (see Many2One @init for example).
        var nodeOptions = this.state.node.attrs.options;
        var newOptions = nodeOptions ? pyUtils.py_eval(nodeOptions) : {};
        var optionName = $input.attr('name');

        var optionValue;
        if ($input.attr('type') === 'checkbox') {
            optionValue = $input.is(':checked');

            if ((optionValue && $input.data('leave-empty') !== 'checked') ||
                (!optionValue && $input.data('leave-empty') !== 'unchecked')) {
                newOptions[optionName] = optionValue;
            } else {
                delete newOptions[optionName];
            }
        } else {
            optionValue = $input.val();
            try {
                // the value might have been stringified
                optionValue = JSON.parse(optionValue);
            } catch (e) {}

            newOptions[optionName] = optionValue;
        }

        this.trigger_up('view_change', {
            type: 'attributes',
            structure: 'edit_attributes',
            node: this.state.node,
            new_attrs: {
                options: JSON.stringify(newOptions),
            },
        });
    },
    /**
     * @private
     */
    _onRainbowImageReset: function () {
        this.$('input#rainbow_img_url').val('');
        this.$('input#rainbow_img_url').trigger('change');
    },
    /**
     * Called when the search input value is changed -> adapts the fields list
     *
     * @private
     */
    _onSearchInputChange: function () {
        this._searchValue = this.$('.o_web_studio_sidebar_search_input').val();
        this._isSearchValueActive = true;
        this._render();
    },
    /**
     * @private
     */
    _onRestoreDefaultView: function () {
        var self = this;
        var message = _t('Are you sure you want to restore the default view?\r\nAll customization done with Studio on this view will be lost.');

        Dialog.confirm(this, message, {
            confirm_callback: function () {
                self.trigger_up('view_change', {
                    structure: 'restore',
                });
            },
            dialogClass: 'o_web_studio_preserve_space'
        });
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onSelectionValues: function (ev) {
        ev.preventDefault();
        this.trigger_up('field_edition', {
            node: this.state.node,
        });
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onSetCover: function (ev) {
        var $input = $(ev.currentTarget);
        this.trigger_up('view_change', {
            node: this.state.node,
            structure: 'kanban_cover',
            type: $input.is(':checked') ? 'kanban_set_cover' : 'remove',
        });
        // If user closes the field selector pop up, check-box should remain unchecked.
        // Updated sidebar property will set this box to checked if the cover image
        // is enabled successfully.
        $input.prop("checked", false);
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onShowInvisibleToggled: function (ev) {
        this.state.show_invisible = !!$(ev.currentTarget).is(":checked");
        this.trigger_up('toggle_form_invisible', {show_invisible : this.state.show_invisible});
    },
    /**
     * @private
     */
    _onTab: function (ev) {
        var mode = $(ev.currentTarget).attr('name');
        this.trigger_up('sidebar_tab_changed', {
            mode: mode,
        });
    },
    /**
     * @private
     */
    _onUploadRainbowImage: function () {
        var self = this;
        this.$('input.o_input_file').on('change', function () {
            self.$('form.o_form_binary_form').submit();
        });
        this.$('input.o_input_file').click();
    },
    /**
     * @private
     * @param {Event} event
     * @param {Object} result
     */
    _onUploadRainbowImageDone: function (event, result) {
        this.$('input#rainbow_img_url').val(_.str.sprintf('/web/content/%s', result.id));
        this.$('input#rainbow_img_url').trigger('change');
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onViewChanged: function (ev) {
        var $input = $(ev.currentTarget);
        var attribute = $input.attr('name');
        if (this.view_type === 'gantt' && _.str.include(attribute, 'precision_')) {
            // precision attribute in gantt is complicated to write so we split it
            var newPrecision = this.state.attrs.ganttPrecision;
            newPrecision[attribute.split('precision_')[1]] = $input.val();

            this.trigger_up('view_change', {
                type: 'attributes',
                structure: 'view_attribute',
                new_attrs: {
                    precision: JSON.stringify(newPrecision),
                },
            });
        } else if (this.view_type === 'list' && ['sort_field', 'sort_order'].includes(attribute)) {
            const new_attrs = {};
            if (attribute === 'sort_field' && !$input.val()) {
                this.$('#sort_order_div').addClass('d-none');
                if (!this.defaultOrder) return;
                new_attrs['default_order'] = '';
            } else {
                new_attrs ['default_order'] = this.$("#sort_field").val() + ' ' + this.$("#sort_order").val();
            }
            this.trigger_up('view_change', {
                type: 'attributes',
                structure: 'view_attribute',
                new_attrs: new_attrs,
            });
        } else if (this.view_type === 'map' && attribute === 'routing') {
            // Remove Sort By(default_order) value when routing is disabled
            const newAttrs = {};
            if ($input.is(':checked')) {
                newAttrs[attribute] = $input.data('leave-empty') === 'checked' ? '' : 'true';
            } else {
                newAttrs[attribute] = $input.data('leave-empty') === 'unchecked' ? '' : 'false';
                newAttrs['default_order'] = '';
            }
            this.trigger_up('view_change', {
                type: 'attributes',
                structure: 'view_attribute',
                new_attrs: newAttrs,
            });
        } else if (attribute) {
            var new_attrs = {};
            if ($input.attr('type') === 'checkbox') {
                if (($input.is(':checked') && !$input.data('inverse')) || (!$input.is(':checked') && $input.data('inverse'))) {
                    new_attrs[attribute] = $input.data('leave-empty') === 'checked' ? '': 'true';
                } else {
                    new_attrs[attribute] = $input.data('leave-empty') === 'unchecked' ? '': 'false';
                }
            } else {
                new_attrs[attribute] = $input.val();
            }
            this.trigger_up('view_change', {
                type: 'attributes',
                structure: 'view_attribute',
                new_attrs: new_attrs,
            });
        }
    },
    /**
     * @private
     */
    _onViewParameters: function () {
        this.trigger_up('open_record_form_view');
    },
    /**
     * @private
     */
    _onXMLEditor: function () {
        this.trigger_up('open_xml_editor');
    },
});

});
