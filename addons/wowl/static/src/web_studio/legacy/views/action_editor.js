odoo.define('web_studio.ActionEditor', function (require) {
"use strict";

var Widget = require('web.Widget');

var ActionEditorSidebar = require('web_studio.ActionEditorSidebar');
var ActionEditorView = require('web_studio.ActionEditorView');

var ActionEditor = Widget.extend({
    template: 'web_studio.ActionEditor',
    custom_events: {
        'parameters_clicked': '_onActionParameters',
    },
    VIEW_TYPES: [
        'form',
        'search',
        'activity',
        'list',
        'kanban',
        'map',
        'graph',
        'pivot',
        'calendar',
        'gantt',
        'dashboard',
        'cohort',
    ],

    /**
     * @constructor
     */
    init: function (parent, action) {
        this._super.apply(this, arguments);

        this.action = action;
        this.active_view_types = this._getActiveViewTypes();
        this.default_view = this.active_view_types[0];
        if (action.initial_view_types) {
            this.active_view_types = action.initial_view_types;
        }
    },
    /**
     * @override
     */
    start: function () {
        var self = this;

        // order view_types: put active ones at the begining
        var ordered_view_types = this.active_view_types.slice();
        _.each(this.VIEW_TYPES, function (el) {
            if (! _.contains(ordered_view_types, el)) {
                ordered_view_types.push(el);
            }
        });

        _.each(ordered_view_types, function (view_type) {
            var is_default_view = (view_type === self.default_view);
            var active = _.contains(self.active_view_types, view_type);
            var view = new ActionEditorView(self, {
                // search is always active
                active: active || view_type === 'search',
                default_view: is_default_view,
                can_default: !_.contains(['form', 'search'], view_type),
                view_type: view_type,
                can_be_disabled: view_type !== 'search',
            });

            var category = self._getViewCategory(view_type);
            if (category) {
                view.appendTo(
                    self.$('.o_web_studio_view_category[name=' + category + ']')
                );
            }
        });

        this.sidebar = new ActionEditorSidebar(this, this.action);
        return Promise.all([
            this._super.apply(this, arguments),
            this.sidebar.prependTo(this.$el)
        ]);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {string[]} the current action active view types
     */
    _getActiveViewTypes: function () {
        return _.map(this.action.views, function (view) {
            return view[1];
        });
    },
    /**
     * Get the view type category.
     *
     * @private
     * @param {string} viewType
     * @returns {string}
     */
    _getViewCategory: function (viewType) {
        var category;
        switch (viewType) {
            case 'form':
                category = 'general';
                break;
            case 'search':
                category = 'general';
                break;
            case 'activity':
                category = 'general';
                break;
            case 'list':
                category = 'multiple';
                break;
            case 'kanban':
                category = 'multiple';
                break;
            case 'map':
                category = 'multiple';
                break;
            case 'graph':
                category = 'reporting';
                break;
            case 'pivot':
                category = 'reporting';
                break;
            case 'dashboard':
                category = 'reporting';
                break;
            case 'calendar':
                category = 'timeline';
                break;
            case 'gantt':
                category = 'timeline';
                break;
            case 'cohort':
                category = 'timeline';
                break;
        }
        return category;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onActionParameters: function () {
        // open action form view
        this.do_action({
            type: 'ir.actions.act_window',
            res_model: 'ir.actions.act_window',
            res_id: this.action.id,
            views: [[false, 'form']],
            target: 'current',
        }, {
            replace_last_action: true,
        });
    },
});

return ActionEditor;

});
