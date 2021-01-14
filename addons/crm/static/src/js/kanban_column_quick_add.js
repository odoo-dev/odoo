odoo.define('crm.kanban_column_quick_add', function (require) {
    "use strict";
    
    /**
     * //TODO rename kanban_column_forecast_quick_create
     * This file defines the ColumnQuickAdd widget for Kanban. It allows to
     * create kanban columns directly from the Kanban view with a dedicated
     * column creation logic coming from the view
     */
    
    var Widget = require('web.Widget');
    
    var ColumnQuickAdd = Widget.extend({
        template: 'KanbanView.ColumnQuickAdd',
        events: {
            'click .o_quick_create_folded': '_onAddClicked',
        },
    
        /**
         * @override
         * @param {Object} [options]
         */
        init: function (parent, options) {
            this._super.apply(this, arguments);
            this.target_field = options.target_field;
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------
    
        /**
         * Notify the environment to add a column
         *
         * @private
         */
        _add: function () {
            this.trigger_up('forecast_kanban_add_column', {value: this.target_field});
        },
    
        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------
    
        /**
         * @private
         * @param {MouseEvent} event
         */
        _onAddClicked: function (event) {
            event.stopPropagation();
            this._add();
        },
    });
    
    return ColumnQuickAdd;
    
    });
