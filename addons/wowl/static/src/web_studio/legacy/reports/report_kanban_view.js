odoo.define('web_studio.studio_report_kanban', function (require) {
"use strict";

var core = require('web.core');
var Dialog = require('web.Dialog');
var KanbanController = require('web.KanbanController');
var KanbanView = require('web.KanbanView');
var session = require('web.session');
var view_registry = require('web.view_registry');

var bus = require('web_studio.bus');

var _t = core._t;

var StudioReportKanbanController = KanbanController.extend({
    /**
     * Warn the Studio submenu that the report is not edited anymore.
     */
    on_reverse_breadcrumb: function () {
        bus.trigger('report_template_closed');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Do not open the form view but open the Report Editor action.
     *
     * @param {Object} data
     * @param {Integer} [data.res_id] The record res ID (if it directly
     *   comes from the server)
     * @param {number} [data.id] The local model ID for the record to be
     *   opened
     * @private
     */
    _openReportRecord: function (data) {
        var self = this;
        var def;
        if (data.res_id && !data.id) {
            var state = this.model.get(this.handle, {raw: true});
            def = this.model.load({
                modelName: this.modelName,
                res_id: data.res_id,
                fields: state.fields,
                fieldNames: ['report_name'],
            });
        }
        Promise.resolve(def).then(function (result) {
            var id = data.id || result;
            var report = self.model.get(id, {raw: true});
            self.do_action('web_studio.action_edit_report', {
                report: report,
                on_reverse_breadcrumb: self.on_reverse_breadcrumb,
            });
        });
    },
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Do not add a record but open the dialog.
     *
     * @private
     * @override
     */
    _onButtonNew: function () {
        var model = this.initialState.context.default_model;
        new NewReportDialog(this, model).open();
    },
    /**
     * Do not open the form view but open the Report Editor action.
     *
     * @param {OdooEvent} ev
     * @param {Integer} [ev.data.res_id] The record res ID (if it directly
     *   comes from the server)
     * @param {number} [ev.data.id] The local model ID for the record to be
     *   opened
     * @private
     * @override
     */
    _onOpenRecord: function (ev) {
        ev.stopPropagation();
        this._openReportRecord(ev.data);
    },
    /**
     * Override to reload the view after the 'copy_report_and_template' action.
     *
     * @private
     * @override
     */
    _reloadAfterButtonClick: function (kanbanRecord, params) {
        this._super.apply(this, arguments);
        if (params.attrs.name === 'copy_report_and_template') {
            this.trigger_up('reload');
        }
    },
});

var StudioReportKanbanView = KanbanView.extend({
    config: _.extend({}, KanbanView.prototype.config, {
        Controller: StudioReportKanbanController,
    }),
});

var NewReportDialog = Dialog.extend({
    template: 'web_studio.NewReportDialog',
    events: {
        'click .o_web_studio_report_layout_item': '_onReportTemplateSelected',
    },
    /**
     * @constructor
     * @param {Widget} parent
     * @param {String} modelName
     */
    init: function (parent, modelName) {
        this.modelName = modelName;
        var options = {
            title: _t("Which type of report do you want to create?"),
            size: 'medium',
            buttons: [],
        };

        this.layouts = [{
            name: 'web.external_layout',
            label: _t("External"),
            description: _t("Business header/footer"),
        }, {
            name: 'web.internal_layout',
            label: _t("Internal"),
            description: _t("Minimal header/footer"),
        }, {
            name: 'web.basic_layout',
            label: _t("Blank"),
            description: _t("No header/footer"),
        }];

        this._super(parent, options);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {String} modelName
     * @param {String} layout
     * @returns {Promise}
     */
    _createNewReport: function (modelName, layout) {
        return this._rpc({
            route: '/web_studio/create_new_report',
            params: {
                model_name: modelName,
                layout: layout,
                context: session.user_context,
            },
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Create a new report.
     *
     * @private
     * @param {ClickEvent} event
     */
    _onReportTemplateSelected: function (event) {
        var self = this;
        var layout = $(event.currentTarget).data('layout');
        this._createNewReport(this.modelName, layout).then(function (result) {
            self.trigger_up('open_record', {res_id: result.id});
            self.close();
        });
    },
});

view_registry.add('studio_report_kanban', StudioReportKanbanView);

return StudioReportKanbanView;

});
