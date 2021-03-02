odoo.define('web_studio.SearchEditor', function (require) {
"use strict";

var config = require('web.config');
const core = require('web.core');
var Domain = require('web.Domain');
var DomainSelectorDialog = require("web.DomainSelectorDialog");

var EditorMixin = require('web_studio.EditorMixin');
var FormEditorHook = require('web_studio.FormEditorHook');
var SearchRenderer = require('web_studio.SearchRenderer');
var utils = require('web_studio.utils');

const _t = core._t;

var SearchEditor = SearchRenderer.extend(EditorMixin, {
    nearest_hook_tolerance: 50,
    className: SearchRenderer.prototype.className + ' o_web_studio_search_view_editor',
    custom_events: _.extend({}, SearchRenderer.prototype.custom_events, {
        'on_hook_selected': function () {
            this.selected_node_id = false;
        },
    }),
    /**
     * @constructor
     */
    init: function (parent, state, params) {
        this._super.apply(this, arguments);
        this.hook_nodes = {};
        this.node_id = 1;
        this.show_invisible = params.show_invisible;
        this.FILTER_TYPES = ['date', 'datetime'];
        this.GROUPABLE_TYPES = ['many2one', 'char', 'boolean', 'selection', 'date', 'datetime'];
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    getLocalState: function () {
        var state = this._super.apply(this, arguments) || {};
        if (this.selected_node_id) {
            state.selected_node_id = this.selected_node_id;
        }
        return state;
    },
    /**
     * @override
     */
    highlightNearestHook: function ($helper, position) {
        EditorMixin.highlightNearestHook.apply(this, arguments);

        var $nearest_form_hook = this.$('.o_web_studio_hook')
            .touching({
                    x: position.pageX - this.nearest_hook_tolerance,
                    y: position.pageY - this.nearest_hook_tolerance,
                    w: this.nearest_hook_tolerance*2,
                    h: this.nearest_hook_tolerance*2
                },{
                    container: document.body
                }
            ).nearest({x: position.pageX, y: position.pageY}, {container: document.body}).eq(0);
        if ($nearest_form_hook.length) {
            // We check what is being dropped and in which table
            // since in the autocompletion fields we can drop fields
            // in group_by tables we can drop groupabble fields and separator
            // and in the filter table we can only drop filter and separator and
            // date/datetime components.
            const hookClasses = $helper.attr("class");
            const tableType = $nearest_form_hook.closest('table').data('type');
            const isField = hookClasses.indexOf("o_web_studio_field") > -1;
            const isFilter = hookClasses.indexOf("o_web_studio_filter") > -1;
            const isSeparator = hookClasses.indexOf("o_web_studio_filter_separator") > -1;
            const newAttrs = $helper.data('new_attrs') || {};
            const type = newAttrs.type;
            const store = newAttrs.store;
            let addHook = false;
            if (tableType === 'group_by' && (isField && _.contains(this.GROUPABLE_TYPES, type) && store === 'true')) {
                addHook = true;
            } else if (tableType === 'filters' && (isField && _.contains(this.FILTER_TYPES, type) && store === 'true' || isSeparator || isFilter)) {
                addHook = true;
            } else if (tableType === 'autocompletion_fields' && isField) {
                addHook = true;
            }
            if (addHook) {
                $nearest_form_hook.addClass('o_web_studio_nearest_hook');
                return true;
            }
        }
        return false;
    },
    /**
     * @override
     */
    setLocalState: function (state) {
        if (state.selected_node_id) {
            var $selected_node = this.$('[data-node-id="' + state.selected_node_id + '"]');
            if ($selected_node) {
                $selected_node.click();
            }
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Add hook inside the $parent given
     * whith the tag corresponding to the type.
     *
     * @private
     * @param {JQuery} $parent
     * @param {String} type
     */
    _addFirstHook: function ($parent, type) {
        var node = {
            tag: 'search'
        };
        if (type === "group_by") {
            node = {
                tag: 'group',
            };
        }
        var formEditorHook = this._renderHook(node, 'inside', 'tr', type);
        this.defs.push(formEditorHook.appendTo($parent));
    },
    /**
     * Add hook before the first child of a table.
     *
     * @private
     * @param {JQuery} $result
     * @param {Object} first_child
     * @param {String} type
     */
    _addHookBeforeFirstChild: function ($result, first_child, type) {
        var formEditorHook = this._renderHook(first_child, 'before', 'tr', type);
        this.defs.push(formEditorHook.insertBefore($result));
    },
    /**
     * Check for each table if it is empty.
     * If so, add one hook inside the table.
     *
     * @private
     */
    _addHookEmptyTable: function () {
        var $tbody = this.$('.o_web_studio_search_autocompletion_fields tbody');
        if (!$tbody.children().length) {
            this._addFirstHook($tbody, 'field');
        }
        $tbody = this.$('.o_web_studio_search_filters tbody');
        if (!$tbody.children().length) {
            this._addFirstHook($tbody, 'filter');
        }
        $tbody = this.$('.o_web_studio_search_group_by tbody');
        if (!$tbody.children().length) {
            this._addFirstHook($tbody, 'group_by');
        }
    },
    /**
     * if show_invisible is True then returns all nodes
     * visible + invisible else do super call
     *
     * @override
     */
    _getNodesToTreat() {
        if (this.show_invisible) {
            return this.arch.children.slice();
        }
        return this._super(...arguments);
    },
    /**
     * @private
     * @param {String} model
     * @param {String} value
     * @param {Object} option
     *
     * @returns {Dialog}
     */
    _openDomainDialog: function (model, value, option) {
        return new DomainSelectorDialog(this, model, value, option).open();
    },
    /**
     * Append a node for the type given to the param $result
     * and add 'click' event handler.
     *
     * @private
     * @param {Object} node
     * @param {JQuery} $result
     * @param {String} type
     */
    _prepareEditableSearchNode: function (node, $result, type) {
        var self = this;
        $result.attr('data-node-id', this.node_id++);
        this.setSelectable($result);
        $result.click(function () {
            self.selected_node_id = $result.data('node-id');
            self.trigger_up('node_clicked', {node: node});
        });
        // Add hook after this field
        var formEditorHook = this._renderHook(node, 'after', 'tr', type);
        this.defs.push(formEditorHook.insertAfter($result));
        this._renderHookBeforeFirstChild($result, type);
    },
    /**
     * @override
     * @private
     */
    _render: function () {
        var prom = this._super.apply(this, arguments);

        var self = this;
        this.$('.ui-droppable').droppable({
            accept: ".o_web_studio_component",
            drop: function (event, ui) {
                var $hook = self.$('.o_web_studio_nearest_hook');
                if ($hook.length) {
                    var hook_id = $hook.data('hook_id');
                    var hook = self.hook_nodes[hook_id];
                    var new_attrs = ui.draggable.data('new_attrs') || {};
                    var structure = ui.draggable.data('structure');
                    // Check if a filter component has been dropped
                    if (structure === "filter") {
                        // Create the input for the string here
                        // in order to be able to get the value
                        // easily in the event trigger below
                        var $domain_div = $("<div><label>Label:</label></div>");
                        self.$domain_label_input = $("<input type='text' id='domain_label' class='o_input mb8'/>");
                        $domain_div.append(self.$domain_label_input);
                        var domain_dialog = self._openDomainDialog(
                            self.model,
                            [["id","=",1]],
                            {
                                title: _t("New Filter"),
                                size: 'medium',
                                readonly: false,
                                debugMode: config.isDebug(),
                                $content: $domain_div,
                            }
                        );
                        domain_dialog.opened().then(() => self.$domain_label_input.focus());
                        // Add the node when clicking on the dialog 'save' button
                        domain_dialog.on('domain_selected', self, function (event) {
                            new_attrs = {
                                domain: Domain.prototype.arrayToString(event.data.domain),
                                string: self.$domain_label_input.val(),
                                name: 'studio_' + structure + '_' + utils.randomString(5),
                            };
                            var values = {
                                type: 'add',
                                structure: structure,
                                node: hook.node,
                                new_attrs: new_attrs,
                                position: hook.position,
                            };
                            this.trigger_up('view_change', values);
                        });
                        $hook.removeClass('o_web_studio_nearest_hook');
                        ui.helper.removeClass('ui-draggable-helper-ready');
                        self.trigger_up('on_hook_selected');
                        return;
                    }
                    if (hook.type === "filter" && structure === "field" && _.contains(self.FILTER_TYPES, new_attrs.type)) {
                        structure = "filter";
                        new_attrs.string = new_attrs.label;
                        new_attrs.date = new_attrs.name;
                        new_attrs.name = 'studio_filter_by_' + utils.randomString(5);
                    }
                    // Since the group_by are defined by filter tag inside a group
                    // but the droppable object is a field structure,
                    // the structure is overridden
                    if (hook.type === "group_by" && structure === "field") {
                        structure = "filter";
                        // There is no element 'group' in the view that can be target
                        // to add a group_by filter so we add one before the insertion
                        // of the group_by filter
                        if (!self.first_group_by) {
                            new_attrs.create_group = true;
                        }
                        new_attrs.string = new_attrs.label;
                        new_attrs.context = "{'group_by': '" + new_attrs.name + "'}";
                        new_attrs.name = 'studio_group_by_' + utils.randomString(5);
                    }
                    var values = {
                        type: 'add',
                        structure: structure,
                        field_description: ui.draggable.data('field_description'),
                        node: hook.node,
                        new_attrs: new_attrs,
                        position: hook.position,
                    };
                    ui.helper.removeClass('ui-draggable-helper-ready');
                    self.trigger_up('on_hook_selected');
                    self.trigger_up('view_change', values);
                }
            },
        });
        // Visually indicate the 'undroppable' portion
        this.$el.droppable({
            accept: ".o_web_studio_component",
            tolerance: "touch",
            over: function (ev, ui) {
                var $autocompletionFields = self.$('.o_web_studio_search_autocompletion_fields');
                var $filters = self.$('.o_web_studio_search_filters');
                var $grouBy = self.$('.o_web_studio_search_group_by');
                switch (ui.draggable.data('structure')) {
                    case 'field':
                        var type = ui.draggable.data('new_attrs').type;
                        var store = ui.draggable.data('new_attrs').store;
                        if (!(_.contains(self.FILTER_TYPES, type) && store === 'true')) {
                            $filters.addClass('text-muted');
                        }
                        if (!(_.contains(self.GROUPABLE_TYPES, type) && store === 'true')) {
                            $grouBy.addClass('text-muted');
                        }
                        break;
                    case 'filter':
                    case 'separator':
                        $grouBy.addClass('text-muted');
                        $autocompletionFields.addClass('text-muted');
                        break;
                }
            },
            deactivate: function (ev, ui) {
                self.$('.ui-droppable').removeClass('text-muted');
            },
        });
        this._addHookEmptyTable();

        return prom;
    },
    /**
     * @override
     * @private
     * @param {Object} node
     */
    _renderField: function (node) {
        var $result = this._super.apply(this, arguments);
        this._prepareEditableSearchNode(node, $result, 'field');
        return $result;
    },
    /**
     * @override
     * @private
     * @param {Object} node
     */
    _renderFilter: function (node) {
        var $result = this._super.apply(this, arguments);
        node.attrs.domain = Domain.prototype.arrayToString(node.attrs.domain);
        this._prepareEditableSearchNode(node, $result, 'filter');
        return $result;
    },
    /**
     * @override
     * @private
     * @param {Object} node
     */
    _renderGroupBy: function (node) {
        node.tag = "filter";
        // attribute used in the template to know
        // if we are clicking on a group_by or a filter
        // since the nodes have the same tag "filter"
        node.attrs.is_group_by = true;
        var $result = this._super.apply(this, arguments);
        this._prepareEditableSearchNode(node, $result, 'group_by');
        return $result;
    },
    /**
     * @private
     * @param {Object} node
     * @param {String} position
     * @param {String} tag_name
     * @param {String} type
     *
     * @returns {Widget}
     */
    _renderHook: function (node, position, tag_name, type) {
        var hook_id = _.uniqueId();
        this.hook_nodes[hook_id] = {
            node: node,
            position: position,
            type: type,
        };
        return new FormEditorHook(this, position, hook_id, tag_name);
    },
    /**
     * Render hook before the first child of a table.
     *
     * @private
     * @param {JQuery} $result
     * @param {String} type
     */
    _renderHookBeforeFirstChild: function ($result, type) {
        if (type === 'field' && this.first_field && this.first_field !== 'done') {
            this._addHookBeforeFirstChild($result, this.first_field, 'field');
            this.first_field = 'done';
        } else if (type === 'filter' && this.first_filter && this.first_filter !== 'done') {
            this._addHookBeforeFirstChild($result, this.first_filter, 'filter');
            this.first_filter = 'done';
        } else if (type ==='group_by' && this.first_group_by && this.first_group_by !== 'done') {
            this._addHookBeforeFirstChild($result, this.first_group_by, 'group_by');
            this.first_group_by = 'done';
        }
    },
    /**
     * @override
     * @private
     * @param {Object} node
     */
    _renderSeparator: function (node) {
        var $result = this._super.apply(this, arguments);
        this._prepareEditableSearchNode(node, $result, 'filter');
        return $result;
    },
});

return SearchEditor;

});
