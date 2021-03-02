odoo.define('web_studio.KanbanEditor', function (require) {
"use strict";

var BasicModel = require('web.BasicModel');
var KanbanRecordEditor = require('web_studio.KanbanRecordEditor');
var KanbanRenderer = require('web.KanbanRenderer');

var EditorMixin = require('web_studio.EditorMixin');

return KanbanRenderer.extend(EditorMixin, {
    className: KanbanRenderer.prototype.className + ' o_web_studio_kanban_view_editor',
    /**
     * @constructor
     * @param {Object} params
     * @param {boolean} params.show_invisible
     */
    init: function (parent, state, params) {
        this._super.apply(this, arguments);

        this.recordOptions.showInvisible = params.show_invisible;

        // We only want to display one record to ease the edition.
        // If grouped, render the record from only one of the groups that
        // contains records like if it was ungrouped (fallback on the first
        // group if all groups are empty).
        this.isGrouped = !!this.state.groupedBy.length;
        if (this.isGrouped) {
            state = _.find(this.state.data, function (group) {
                return group.count > 0;
            }) || this.state.data[0];
        }
        this.kanbanRecord = state && state.data[0];
    },
    /**
     * @override
     */
    willStart: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            if (!self.kanbanRecord) {
                // add an empty record to be able to edit something
                var model = new BasicModel(self);
                return model.load({
                    fields: self.state.fields,
                    fieldsInfo: self.state.fieldsInfo,
                    modelName: self.state.model,
                    type: 'record',
                    viewType: self.state.viewType,
                }).then(function (record_id){
                    self.kanbanRecord = model.get(record_id);
                });
            }
        });
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    highlightNearestHook: function ($helper, position) {
        if (this.recordEditor) {
            return this.recordEditor.highlightNearestHook($helper, position);
        }
    },
    /**
     * @override
     */
    getLocalState: function () {
        var state = this._super.apply(this, arguments) || {};
        if (this.recordEditor && this.recordEditor.selected_node_id) {
            state.selected_node_id = this.recordEditor.selected_node_id;
        }
        return state;
    },
    /**
     * @override
     */
    setLocalState: function (state) {
        if (this.recordEditor) {
            this.recordEditor.setLocalState(state);
        }
    },
    /**
     * @override
     */
    unselectedElements: function () {
        EditorMixin.unselectedElements.apply(this, arguments);
        if (this.recordEditor) {
            this.recordEditor.selected_node_id = false;
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {Promise}
     */
    _render: function () {
        var self = this;
        var fragment = document.createDocumentFragment();
        this.defs = [];
        this._renderUngrouped(fragment);
        var defs = this.defs;
        delete this.defs;
        return Promise.all(defs).then(function () {
            self.$el.empty();
            self.$el.toggleClass('o_kanban_grouped', self.isGrouped);
            self.$el.toggleClass('o_kanban_ungrouped', !self.isGrouped);

            if (self.isGrouped) {
                var $group = $('<div>', {class: 'o_kanban_group'});
                $group.append(fragment);
                self.$el.append($group);

                // render a second empty column
                var fragment_empty = document.createDocumentFragment();
                self._renderDemoDivs(fragment_empty, 7);
                self._renderGhostDivs(fragment_empty, 6);
                var $group_empty = $('<div>', {class: 'o_kanban_group'});
                $group_empty.append(fragment_empty);
                self.$el.append($group_empty);
            } else {
                self.$el.append(fragment);
            }
        });

    },
    /**
     * Renders empty demo divs in a document fragment.
     *
     * @private
     * @param {DocumentFragment} fragment
     * @param {integer} nbDivs the number of divs to append
     */
    _renderDemoDivs: function (fragment, nbDivs) {
        for (var i = 0, demo_div; i < nbDivs; i++) {
            demo_div = $("<div>").addClass("o_kanban_record o_kanban_demo");
            demo_div.appendTo(fragment);
        }
    },
    /**
     * Override this method to only render one record and to use the
     * KanbanRecordEditor.
     *
     * @private
     * @param {DocumentFragment} fragment
     */
    _renderUngrouped: function (fragment) {
        var self = this;
        var isDashboard = this.$el.hasClass('o_kanban_dashboard');
        this.recordEditor = new KanbanRecordEditor(
            this, this.kanbanRecord, this.recordOptions, this.arch, isDashboard);
        this.widgets.push(this.recordEditor);
        this.defs.push(this.recordEditor.appendTo(fragment));

        Promise.all(this.defs).then(function () {
            // these divs need to be rendered after the kanban record
            self._renderDemoDivs(fragment, 6);
            self._renderGhostDivs(fragment, 6);
        });
    },
});

});
