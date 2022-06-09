odoo.define('web.select_create_controllers_registry', function (require) {
"use strict";

return {};

});

odoo.define('web._select_create_controllers_registry', function (require) {
"use strict";

var KanbanController = require('web.KanbanController');
var ListController = require('web.ListController');
var select_create_controllers_registry = require('web.select_create_controllers_registry');

var SelectCreateKanbanController = KanbanController.extend({
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Override to select the clicked record instead of opening it
     *
     * @override
     * @private
     */
    _onOpenRecord: function (ev) {
        const { data } = this.model.get(ev.data.id);
        this.trigger_up('select_record', data);
    },
});

var SelectCreateListController = ListController.extend({
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Override to select the clicked record instead of opening it
     *
     * @override
     * @private
     */
    _onOpenRecord: function (ev) {
        const { data } = this.model.get(ev.data.id);
        this.trigger_up('select_record', data);
    },
});

_.extend(select_create_controllers_registry, {
    SelectCreateListController: SelectCreateListController,
    SelectCreateKanbanController: SelectCreateKanbanController,
});

});
