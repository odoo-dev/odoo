odoo.define('web_studio.ListEditor', function (require) {
"use strict";

var ListRenderer = require('web.ListRenderer');
var EditorMixin = require('web_studio.EditorMixin');

return ListRenderer.extend(EditorMixin, {
    nearest_hook_tolerance: 200,
    className: ListRenderer.prototype.className + ' o_web_studio_list_view_editor',
    events: _.extend({}, ListRenderer.prototype.events, {
        'click th:not(.o_web_studio_hook), td:not(.o_web_studio_hook)': '_onExistingColumn',
    }),
    custom_events: _.extend({}, ListRenderer.prototype.custom_events, {
        'on_hook_selected': '_onSelectedHook',
    }),
    /**
     * @constructor
     */
    init: function (parent, state, params) {
        this._super.apply(this, arguments);
        this.show_invisible = params.show_invisible;
        this.node_id = 1;
    },
    /**
     * Columns visibility is computed in the willStart of the list renderer.
     * Here, we override the result of this computation to force the visibility
     * of otherwise invisible columns so that they can be properly edited.
     *
     * @override
     */
    willStart: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            if (self.show_invisible) {
                var validChildren = _.filter(self.arch.children, function (child) {
                    // Editing controls is not supported in studio
                    return child.tag !== 'control' && child.tag !== 'header';
                });
                self.invisible_columns = _.difference(validChildren, self.columns);
                self.columns = validChildren;
            } else {
                self.invisible_columns = [];
            }
        });
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    getLocalState: function() {
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

        var $nearest_list_hook = this.$('.o_web_studio_hook')
            .touching({
                    x: position.pageX - this.nearest_hook_tolerance,
                    y: position.pageY - this.nearest_hook_tolerance,
                    w: this.nearest_hook_tolerance*2,
                    h: this.nearest_hook_tolerance*2
                },{
                    container: document.body
                }
            ).nearest({x: position.pageX, y: position.pageY}, {container: document.body}).eq(0);
        if ($nearest_list_hook.length) {
            var $elements = this._getColumnElements($nearest_list_hook);
            $elements.addClass('o_web_studio_nearest_hook');
            return true;
        }
        return false;
    },
    /**
     * @override
     */
    setLocalState: function(state) {
        if (state.selected_node_id) {
            var $selected_node = this.$('th[data-node-id="' + state.selected_node_id + '"]');
            if ($selected_node) {
                $selected_node.click();
            }
        }
    },
    /**
     * In the list editor, we want to select the whole column, not only a single
     * cell.
     *
     * @override
     */
    setSelectable: function ($el) {
        EditorMixin.setSelectable.apply(this, arguments);

        var self = this;
        $el.click(function (ev) {
            var $target = $(ev.currentTarget);
            self.$('.o_web_studio_clicked').removeClass('o_web_studio_clicked');
            var $elements = self._getColumnElements($target);
            $elements.addClass('o_web_studio_clicked');
        })
        .mouseover(function (ev) {
            if (self.$('.ui-draggable-dragging').length) {
                return;
            }
            var $target = $(ev.currentTarget);
            var $elements = self._getColumnElements($target);
            $elements.addClass('o_web_studio_hovered');
        })
        .mouseout(function () {
            self.$('.o_web_studio_hovered').removeClass('o_web_studio_hovered');
        });
    },
    /**
     * Selects the field on view
     *
     * @param {string} fieldName
     */
    selectField: function (fieldName) {
        this.$('th[data-name=' + fieldName + ']').click();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     * @param {Object} ui
     */
    _handleDrop: function (ev, ui) {
        var $hook = this.$('.o_web_studio_nearest_hook');
        if ($hook.length) {
            var position = $hook.closest('table').find('th').eq($hook.index()).data('position') || 'after';
            var hookedFieldIndex = position === 'before' && $hook.index() + 1 || $hook.index() - 1;
            var fieldName = $hook.closest('table').find('th').eq(hookedFieldIndex).data('name');
            var node = _.find(this.columns, function (column) {
                return column.attrs.name === fieldName;
            });
            // When there is no column in the list view, the only possible hook is inside <tree>
            if (!this.columns.length) {
                node = {
                   tag: 'tree',
               };
               position = 'inside';
            }
            // draggable is only set on `droppable` elements, not `draggable`
            var $drag = ui.draggable || $(ev.target);
            this.handleDrop($drag, node, position);
            ui.helper.removeClass('ui-draggable-helper-ready');
            $hook.removeClass('o_web_studio_nearest_hook');
        }
    },
    /**
     * Get all elements associated to a table column.
     *
     * @private
     * @param {jQuery} $target
     * @returns {jQuery}
     */
    _getColumnElements: function ($target) {
        return $target.closest('table')
            .find('tr')
            .children(':nth-child(' + ($target.index() + 1) + ')');
    },
    /**
     * Add totalWidth of columns + hook cells going to add
     *
     * @override
     * @private
     * @return {integer}
     */
    _getColumnsTotalWidth() {
        const thElementsLength = this.el.querySelectorAll('thead th').length + 1;
        return this._super(...arguments) + thElementsLength;
    },
    /**
     * @override
     * @private
     */
    _render: function () {
        var self = this;
        var prom = this._super.apply(this, arguments);
        prom.then(function () {
            self.$el.droppable({
                accept: ".o_web_studio_component",
                drop: self._handleDrop.bind(self),
            });

            self.setSelectable(self.$('th, td').not('.o_web_studio_hook'));
            // Apply 'text-muted' class on optional field dropdown
            self.$('i.o_optional_columns_dropdown_toggle')
                .addClass('text-muted')
        });
        return prom;
    },
    /**
     * @override
     * @private
     */
    _renderBody: function () {
        // we don't want to be able to resequence in the editor
        this.hasHandle = false;
        return this._super();
    },
    /**
     * @override
     * @private
     * @param {Object} record
     * @param {Object} node
     * @param {...any} args
     * @return {jQueryElement}
     */
    _renderBodyCell(record, node, ...args) {
        const $td = this._super(record, node, ...args);
        const invisibleTechnicalNames = this.invisible_columns.map(column => column.attrs.name);
        if (invisibleTechnicalNames.includes(node.attrs.name)) {
            $td.addClass('o_web_studio_show_invisible');
        }
        return $td;
    },
    /**
     * @override
     * @private
     */
    _renderHeader: function () {
        var $header = this._super.apply(this, arguments);
        var self = this;
        // Insert a hook after each th
        _.each($header.find('th'), function (th) {
            var $new_th = $('<th>')
                .addClass('o_web_studio_hook')
                .append(
                    $('<i>').addClass('fa fa-plus')
            );
            $new_th.insertAfter($(th));
            $(th).attr('data-node-id', self.node_id++);

            self._setDraggable($(th));
        });

        // Insert a hook before the first column
        var $new_th_before = $('<th>')
            .addClass('o_web_studio_hook')
            .data('position', 'before')
            .append(
                $('<i>').addClass('fa fa-plus')
        );
        $new_th_before.prependTo($header.find('tr'));
        return $header;
    },
    /**
     * @override
     * @private
     */
    _renderHeaderCell: function (node) {
        var $th = this._super.apply(this, arguments);
        if (_.contains(this.invisible_columns, node)) {
            $th.addClass('o_web_studio_show_invisible');
        }
        return $th;
    },
    /**
     * @override
     * @private
     */
    _renderEmptyRow: function () {
        // render an empty row
        var $tds = [];
         _.each(this.columns, function () {
            $tds.push($('<td>&nbsp;</td>'));
        });
        if (this.has_selectors) {
            $tds.push($('<td>&nbsp;</td>'));
        }
        var $row = $('<tr>').append($tds);

        this._addStudioHooksOnBodyRow($row);

        return $row;
    },
    /**
     * Adds studio hooks for a row in a list right after their rendering
     * Since rows of thead and tfoot have special behaviors and classes
     * this function should only be used for rows in the body of the table
     * @param {JQuery} $row
     */
    _addStudioHooksOnBodyRow: function ($row) {
        // Insert a hook after each cell
        _.each($row.find('td, th'), function (cell) {
            $('<td>')
                .addClass('o_web_studio_hook')
                .insertAfter($(cell));
        });

        // Insert a hook before the first column
        $('<td>')
            .addClass('o_web_studio_hook')
            .prependTo($row);
    },
    /**
     * @override
     * @private
     */
    _renderRow: function () {
        var $row = this._super.apply(this, arguments);
        this._addStudioHooksOnBodyRow($row);

        return $row;
    },
    /**
     * @override
     * @private
     */
    _renderFooter: function () {
        var $footer = this._super.apply(this, arguments);

        // Insert a hook after each td
        _.each($footer.find('td'), function (td) {
            $('<td>')
                .addClass('o_web_studio_hook')
                .insertAfter($(td));
        });

        // Insert a hook before the first column
        $('<td>')
            .addClass('o_web_studio_hook')
            .prependTo($footer.find('tr'));

        return $footer;
    },
    /**
     * Set a jQuery element as draggable.
     * Note that we only set fields as draggable for now.
     *
     * @param {jQuery} $el
     */
    _setDraggable: function ($el) {
        var self = this;

        $el.draggable({
            axis: 'x',
            scroll: false,
            revertDuration: 200,
            refreshPositions: true,
            start: function (e, ui) {
                self.$('.o_web_studio_hovered').removeClass('o_web_studio_hovered');
                self.$('.o_web_studio_clicked').removeClass('o_web_studio_clicked');
                ui.helper.addClass('ui-draggable-helper');
            },
            stop: this._handleDrop.bind(this),
            revert: function () {
                // a field cannot be dropped on the same place
                var $hook = self.$('.o_web_studio_nearest_hook');
                if ($hook.length) {
                    var position = $hook.closest('table').find('th').eq($hook.index()).data('position') || 'after';
                    var hookedFieldIndex = position === 'before' && $hook.index() + 1 || $hook.index() - 1;
                    var fieldName = $hook.closest('table').find('th').eq(hookedFieldIndex).data('name');
                    if (fieldName !== self.$('.ui-draggable-helper').data('name')) {
                        return false;
                    }
                }
                self.$('.ui-draggable-helper').removeClass('ui-draggable-helper');
                self.$('.ui-draggable-helper-ready').removeClass('ui-draggable-helper-ready');
                return true;
            },
        });

        // display nearest hook (handled by the ViewEditorManager)
        $el.on('drag', _.throttle(function (event, ui) {
            self.trigger_up('drag_component', {
                position: {pageX: event.pageX, pageY: event.pageY},
                $helper: ui.helper,
            });
        }, 200));
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onExistingColumn: function (ev) {
        var $el = $(ev.currentTarget);
        var $selected_column = $el.closest('table').find('th').eq($el.index());

        var field_name = $selected_column.data('name');
        var node = _.find(this.columns, function (column) {
            return column.attrs.name === field_name;
        });
        this.selected_node_id = $selected_column.data('node-id');
        this.trigger_up('node_clicked', {node: node});
    },
    /**
     * @private
     */
    _onSelectedHook: function () {
        this.selected_node_id = false;
    },
});

});
