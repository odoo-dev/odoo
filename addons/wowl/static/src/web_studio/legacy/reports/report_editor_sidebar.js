odoo.define('web_studio.ReportEditorSidebar', function (require) {
"use strict";

var config = require('web.config');
var core = require('web.core');
var relational_fields = require('web.relational_fields');
var StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');
var utils = require('web.utils');
var Widget = require('web.Widget');

var editComponentsRegistry = require('web_studio.reportEditComponentsRegistry');
var newComponentsRegistry = require('web_studio.reportNewComponentsRegistry');
var studioUtils = require('web_studio.utils');

var Many2ManyTags = relational_fields.FieldMany2ManyTags;
var Many2One = relational_fields.FieldMany2One;

var qweb = core.qweb;
var _t = core._t;

var ReportEditorSidebar = Widget.extend(StandaloneFieldManagerMixin, {
    template: 'web_studio.ReportEditorSidebar',
    events: {
        'change input': '_onChangeReport',
        'click .o_web_studio_sidebar_header > div:not(.inactive)': '_onTab',
        'click .o_web_studio_xml_editor': '_onXMLEditor',
        'click .o_web_studio_parameters': '_onParameters',
        'click .o_web_studio_remove': '_onRemove',
    },
    /**
     * @constructor
     * @param {Widget} parent
     * @param {Object} params
     * @param {Object} [params.models]
     * @param {Object} [params.paperFormat]
     * @param {Object} [params.previousState]
     * @param {Object} [params.report] only mandatory if state.mode = 'report'
     * @param {Object} [params.state]
     * @param {Object} [params.widgetsOptions]
     */
    init: function (parent, params) {
        this._super.apply(this, arguments);
        StandaloneFieldManagerMixin.init.call(this);

        this.debug = config.isDebug();
        this.report = params.report;
        this.state = params.state || {};
        this.paperFormat = params.paperFormat || {};
        this.previousState = params.previousState || {};
        this.models = params.models;
        this.widgetsOptions = params.widgetsOptions;
    },
    /**
     * @override
     */
    willStart: function () {
        var self = this;
        var defs = [this._super.apply(this, arguments)];

        if (this.state.mode === 'report') {
            // make record for the many2many groups
            var defReport = this.model.makeRecord('ir.model.fields', [{
                name: 'groups_id',
                fields: [{
                    name: 'id',
                    type: 'integer',
                }, {
                    name: 'display_name',
                    type: 'char',
                }],
                relation: 'res.groups',
                type: 'many2many',
                value: this.report.groups_id,
            }]).then(function (recordID) {
                self.groupsHandle = recordID;
            });
            // load record for the many2one paperformat
            var defPaperFormat = this.model.makeRecord('ir.model.fields', [{
                name: 'paperformat_id',
                relation: 'report.paperformat',
                type: 'many2one',
                value: this.report.paperformat_id,
            }]).then(function (recordID) {
                self.paperformatHandle = recordID;
            });
            defs.push(defReport);
            defs.push(defPaperFormat);
        }
        return Promise.all(defs);
    },
    /**
     * @override
     */
    start: function () {
        var def;
        switch (this.state.mode) {
            case 'report':
                def = this._startModeReport();
                break;
            case 'new':
                def = this._startModeNew();
                break;
            case 'properties':
                def = this._startModeProperties();
                break;
        }
        return Promise.all([this._super.apply(this, arguments), def]);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Gets the state of all the widgets of all the node hierarchy of the
     * sidebar.
     *
     * @returns {Object}
     */
    getLocalState: function () {
        var self = this;
        var state = {};

        _.each(this.nodes, function (node) {
            var nodeName = self._computeUniqueNodeName(node.node);
            state[nodeName] = {};
            _.each(node.widgets, function (comp) {
                state[nodeName][comp.name] = comp.getLocalState();
            });
        });
        return state;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Given a node, computes a unique name that will be the same between
     * refresh of the preview.
     *
     * @param {Object} node
     * @returns {string}
     */
    _computeUniqueNodeName: function (node) {
        return node.attrs["data-oe-id"] + node.attrs["data-oe-xpath"].replace(/\[\]\//g, "_");
    },
    /**
     * Utility function that will create a fake jQuery node.
     *
     * Note that the 'real' DOM node cannot be used as it may not not exist
     * (e.g. a <t> node which is defined in the arch but has no corresponding
     * DOM node).
     *
     * TODO: if it's too slow, maybe instatiate the parse only once in init.
     *
     * @private
     * @param {Object} node
     * @returns {jQuery}
     */
    _getAssociatedDOMNode: function (node) {
        var parser = new DOMParser();
        var xml = utils.json_node_to_xml(node);
        var xmlDoc = parser.parseFromString(xml, "text/xml");
        var xmlNode = xmlDoc.getElementsByTagName(node.tag)[0];
        return $(xmlNode);
    },
    /**
     * @private
     * @param {Object} components
     * @returns {Object}
     */
    _getComponentsObject: function (components) {
        return _.map(components, function (componentName) {
            var Component = _.find(editComponentsRegistry.map, function (Component) {
                return Component.prototype.name === componentName;
            });
            return Component;
        });
    },
    /**
     * @private
     * @param {Object} components
     * @returns {string}
     */
    _getComponentsBlacklist: function (components) {
        var blacklist = '';
        _.each(this._getComponentsObject(components), function (Component) {
            if (Component.prototype.blacklist) {
                if (blacklist.length) {
                    blacklist += ',';
                }
                blacklist += Component.prototype.blacklist;
            }
        });
        return blacklist;
    },
    /**
     * @private
     * @param {Object} node
     * @returns {string} a attempt of meaningful name for the given node
     */
    _getNodeDisplayName: function (node) {
        var displayName = { name: node.tag, attr: '', icon: '' };

        if (node.attrs) {
            if (node.attrs.name) {
                displayName.attr += '(' + node.attrs.name + ')';
            }
            if (node.attrs['t-field'] || node.attrs['t-esc']) {
                displayName.attr += '[' + (node.attrs['t-field'] || node.attrs['t-esc']) + ']';
            }
            if (node.attrs['t-call']) {
                displayName.attr += '[t-call="' + node.attrs['t-call'] + '"]';
            }
            if (node.attrs['t-foreach']) {
                displayName.attr += '[foreach="' + node.attrs['t-foreach'] + '"]';
            }
        }

        if (node.key) {
            displayName.attr += ' - ' + node.key;
        }

        if (displayName.name === 'div' && node.attrs.class) {
            displayName.attr += ' ' + node.attrs.class;
        }

        switch (displayName.name) {
            case 't':
                displayName.icon = 'fa-cog';
                break;

            case 'html':
            case 'body':
            case 'main':
                displayName.icon = 'fa-file';
                break;

            case 'table':
                displayName.icon = 'fa-table';
                break;

            case 'thead':
            case 'tr':
            case 'tfoot':
                displayName.icon = 'fa-ellipsis-h';

                if (node.attrs.hasOwnProperty('t-foreach')) {
                    displayName.icon = 'fa-retweet text-primary';
                }

                break;

            case 'tbody':
                displayName.icon = 'fa-th';
                break;

            case 'th':
            case 'td':
                displayName.icon = 'fa-square-o';
                break;

            case 'img':
                displayName.icon = 'fa-picture-o';
                break;

            case 'div':
                displayName.icon = 'fa-folder';

                if (!node.attrs.hasOwnProperty('class')) {
                    break;
                }

                if (node.attrs.class.indexOf('col-') !== -1) {
                    displayName.icon = 'fa-columns';
                } else if (node.attrs.class.indexOf('row') !== -1) {
                    displayName.icon = 'fa-ellipsis-h';
                }
                break;

            case 'address':
                displayName.icon = 'fa-address-book-o';
                break;

            case 'h1':
            case 'h2':
            case 'h3':
            case 'h4':
            case 'h5':
            case 'h6':
            case 'p':
            case 'b':
            case 'i':
            case 'span':
            case 'strong':
                displayName.icon = 'fa-i-cursor';
                break;
        }

        return displayName;
    },
    /**
     * Given a specific node selected (clicked) on the report, get a list of all
     * the components that are applicable to edit this node.
     *
     * This function uses the selector defined on the editable components
     * themselves to check wether it applies to a node or not
     *
     * @private
     * @param {Object} node
     * @returns {string[]}
     */
    _getNodeEditableComponents: function (node) {
        var self = this;
        var components = [];

        var $node = this._getAssociatedDOMNode(node);
        _.each(editComponentsRegistry.map, function (Component) {
            var selector = Component.prototype.selector;
            if (self.debug) {
                selector = Component.prototype.debugSelector || selector;
            }
            if ($node.is(selector)) { // use last because DOM eject t tag in table tag
                components.push(Component.prototype.name);
            }
        });

        _.each(['layout', 'tif', 'groups'], function (componentName) {
            if (!_.contains(components, componentName)) {
                components.push(componentName);
            }
        });
        return components;
    },
    /**
     * @private
     * @returns {Promise}
     */
    _startModeNew: function () {
        var self = this;
        var defs = [];
        var $sidebarContent = this.$('.o_web_studio_sidebar_content');

        _.each(newComponentsRegistry.map, function (components, title) {
            $sidebarContent.append($('<h3>', {
                html: title,
            }));
            var $componentsContainer = $('<div>', {
                class: 'o_web_studio_field_type_container',
            });
            _.each(components, function (Component) {
                defs.push(new Component(self, { models: self.models }).appendTo($componentsContainer));
            });
            $sidebarContent.append($componentsContainer);
        });

        return Promise.all(defs);
    },
    /**
     * A node has been clicked on the report, build the content of the sidebar so this node can be edited
     *
     * @private
     * @returns {Promise}
     */
    _startModeProperties: function () {
        var self = this;
        var componentsAppendedPromise;
        var $accordion = this.$('.o_web_studio_sidebar_content .o_web_studio_accordion');

        var blacklists = [];
        this.nodes = [];

        if (!this.debug) {
            // hide all nodes after .page, they are too technical
            var pageNodeIndex = _.findIndex(this.state.nodes, function (node) {
                return node.node.tag === 'div' && _.str.include(node.node.attrs.class, 'page');
            });
            if (pageNodeIndex !== -1) {
                this.state.nodes.splice(pageNodeIndex + 1, this.state.nodes.length - (pageNodeIndex + 1));
            }
        }

        for (var index = this.state.nodes.length - 1; index >= 0; index--) {
            // copy to not modifying in place the node
            var node = _.extend({}, this.state.nodes[index]);
            if (!this.debug && blacklists.length) {
                if (this._getAssociatedDOMNode(node.node).is(blacklists.join(','))) {
                    continue;
                }
            }
            var components = this._getNodeEditableComponents(node.node);
            node.components = components;
            var blacklist = this._getComponentsBlacklist(components);
            if (blacklist.length) {
                blacklists.push(blacklist);
            }
            node.widgets = [];
            this.nodes.unshift(node);
        }
        // TODO: do not reverse but put nodes in correct order directly
        this.nodes.reverse();

        this.nodes.forEach(function (node) {
            var $accordionSection = $(qweb.render('web_studio.AccordionSection', {
                id: 'id_' + studioUtils.randomString(6),
                header: 'header_' + studioUtils.randomString(6),
                nodeName: self._getNodeDisplayName(node.node).name,
                nodeAttr: self._getNodeDisplayName(node.node).attr,
                nodeIcon: self._getNodeDisplayName(node.node).icon,
                node: node.node,
            }));
            var renderingProms = self._getComponentsObject(node.components).map(function (Component) {
                if (!Component) {
                    self.do_warn("Missing component", self.state.directive);
                    return;
                }
                var previousWidgetState = self.previousState[self._computeUniqueNodeName(node.node)] &&
                    self.previousState[self._computeUniqueNodeName(node.node)][Component.prototype.name];
                var directiveWidget = new Component(self, {
                    widgetsOptions: self.widgetsOptions,
                    node: node.node,
                    context: node.context,
                    state: previousWidgetState,
                    models: self.models,
                    componentsList: node.components,
                });
                node.widgets.push(directiveWidget);
                var fragment = document.createDocumentFragment();
                return directiveWidget.appendTo(fragment);
            });
            componentsAppendedPromise = Promise.all(renderingProms).then(function () {
                for (var i = 0; i < node.widgets.length; i++) {
                    var widget = node.widgets[i];
                    var selector = '.collapse' + (i > 0 ? '>div:last()' : '');
                    widget.$el.appendTo($accordionSection.find(selector));
                }
                var $removeButton = $(qweb.render('web_studio.Sidebar.Remove'));
                $removeButton.data('node', node.node); // see @_onRemove
                $accordionSection.find('.collapse')
                    .append($('<hr>'))
                    .append($removeButton);
            });
            $accordionSection.appendTo($accordion);
            $accordionSection
                .on('mouseenter', function () {
                    self.trigger_up('hover_editor', {
                        node: node.node,
                    });
                })
                .on('click', function () {
                    self.trigger_up('node_expanded', {
                        node: node.node,
                    });
                })
                .on('mouseleave', function () {
                    self.trigger_up('hover_editor', {
                        node: undefined,
                    });
                })
                .find('.collapse').on('show.bs.collapse hide.bs.collapse', function (ev) {
                    $(this).parent('.card').toggleClass('o_web_studio_active', ev.type === 'show');
                });
        });

        // open the last section
        // NB: this is the only way with BS4 to open the tab synchronously
        var $lastCard = $accordion.find('.card:last');
        $lastCard.addClass('o_web_studio_active');
        $lastCard.find('.collapse').addClass('show');

        return componentsAppendedPromise;
    },
    /**
     * @private
     * @returns {Promise}
     */
    _startModeReport: function () {
        var defs = [];
        var paperFormatRecord = this.model.get(this.paperformatHandle);
        var many2one = new Many2One(this, 'paperformat_id', paperFormatRecord, {
            attrs: {
                placeholder: _t('By default: ') + this.paperFormat.display_name,
            },
            mode: 'edit',
        });
        this._registerWidget(this.paperformatHandle, 'paperformat_id', many2one);
        defs.push(many2one.appendTo(this.$('.o_web_studio_paperformat_id')));
        this.paperformatMany2one = many2one;

        // append many2many for groups_id
        var groupsRecord = this.model.get(this.groupsHandle);
        var many2many = new Many2ManyTags(this, 'groups_id', groupsRecord, {
            mode: 'edit',
        });
        this._registerWidget(this.groupsHandle, 'groups_id', many2many);
        defs.push(many2many.appendTo(this.$('.o_groups')));
        return Promise.all(defs);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {JQueryEvent} ev
     */
    _onChangeReport: function (ev) {
        var $input = $(ev.currentTarget);
        var attribute = $input.attr('name');
        if (attribute) {
            var newAttrs = {};
            if ($input.attr('type') === 'checkbox') {
                newAttrs[attribute] = $input.is(':checked') ? 'True' : '';
            } else {
                newAttrs[attribute] = $input.val();
            }
            this.trigger_up('studio_edit_report', newAttrs);
        }
    },
    /**
     * @private
     * @override
     * @param {OdooEvent} ev
     */
    _onFieldChanged: function (ev) {
        var self = this;
        StandaloneFieldManagerMixin._onFieldChanged.apply(this, arguments).then(function () {
            if (self.state.mode !== 'report') {
                return;
            }
            var newAttrs = {};
            var fieldName = ev.target.name;
            var record;
            if (fieldName === 'groups_id') {
                record = self.model.get(self.groupsHandle);
                newAttrs[fieldName] = record.data.groups_id.res_ids;
            } else if (fieldName === 'paperformat_id') {
                record = self.model.get(self.paperformatHandle);
                newAttrs[fieldName] = record.data.paperformat_id && record.data.paperformat_id.res_id;
            }
            self.trigger_up('studio_edit_report', newAttrs);
        });
    },
    /**
     * @private
     */
    _onParameters: function () {
        this.trigger_up('open_record_form_view');
    },
    /**
     * @private
     * @param {ClickEvent} ev
     */
    _onRemove: function (ev) {
        var node = $(ev.currentTarget).data('node');
        this.trigger_up('element_removed', {
            node: node,
        });
    },
    /**
     * @private
     * @param {ClickEvent} ev
     */
    _onTab: function (ev) {
        var mode = $(ev.currentTarget).attr('name');
        if (mode === 'options') {
            // one cannot manually select options
            return;
        }
        this.trigger_up('sidebar_tab_changed', {
            mode: mode,
        });
    },
    /**
     * @private
     */
    _onXMLEditor: function () {
        this.trigger_up('open_xml_editor');
    },
});

return ReportEditorSidebar;

});
