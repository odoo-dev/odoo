odoo.define('crm.crm_forecast_kanban', function (require) {
    "use strict";
    
    var KanbanColumn = require('web.KanbanColumn');
    var KanbanRenderer = require('web.KanbanRenderer');
    var KanbanModel = require('web.KanbanModel');
    var KanbanController = require('web.KanbanController');
    var KanbanView = require('web.KanbanView');
    var viewRegistry = require('web.view_registry');
    var ColumnQuickAdd = require('crm.kanban_column_quick_add');
    const pyUtils = require('web.py_utils');

    var CrmForecastKanbanColumn = KanbanColumn.extend({
        /**
         * @override
         */
        init: function (parent, data) {
            data.customTypes = {
                "date": function () {
                    return moment(pyUtils.context().today).format("YYYY-MM-DD");
                }
            };
            this._super(...arguments);
        }
    });

    var CrmForecastKanbanRenderer = KanbanRenderer.extend({
        config: { // the KanbanRecord and KanbanColumn classes to use (may be overridden)
            KanbanColumn: CrmForecastKanbanColumn,
        },
        /**
         * @override
         */
        init: function (parent, state) {
            state.customTypes = {
                "date": true
            };
            this._super(...arguments);
        },
        /**
         * @override
         * TODO ABD: better fallback if this kanban is not for a forecast
         */
        _renderGrouped: function (fragment) {
            this._super(...arguments);
            if (this.state.groupedBy[0] == "date_deadline") { //TODO use forecast_field instead of raw value
                this.quickAdd = new ColumnQuickAdd(this, {
                    target_field: "date_deadline",
                });
                this.defs.push(this.quickAdd.appendTo(fragment));
            }
        },
    });
        
    var CrmForecastKanbanModel = KanbanModel.extend({
        /**
         * @constructor
         */
        init: function () {
            this._super.apply(this, arguments);
            this.start_forecast_moment = moment(pyUtils.context().today).set('date', 1);
            this.end_forecast_moment = undefined;
            this.displayed_end_forecast_moment = false;
            this.forecast_domain = undefined;
            this.forecast_field = undefined;
            this.min_forecast_period = undefined;
        },
        _applyForecastDomain: function(domain) {
            return ['&', ...domain, '|',
                [this.forecast_field, '=', false], '&',
                [this.forecast_field, '>=', this.start_forecast_moment.format("YYYY-MM-DD")],
                [this.forecast_field, '<', this.end_forecast_moment.format("YYYY-MM-DD")]];
        },
        /**
         * //TODO -> update for compatibility with week/day/year/... ?
         * 
         * Compute the moment for the end of the forecast period.
         * The forecast period is the number of months from start_moment to the end of the year reached after
         * adding [min_period] 
         * i.e. we are in october 2020, [min_period] = 4 => forecast_period = 15 months (until end of december 2021)
         * @param {Moment} start_moment : start of the forecast period
         * @param {Integer} min_period : months of the forecast period
         * @returns {Moment} : end of the forecast period
         */
        _computeEndForecastMoment: function(start_moment, min_period) {
            var forecast_period = (24 - (min_period - 1) % 12 - (start_moment.get('month') + 1)) % 12 + min_period;
            return moment(start_moment).add(forecast_period, 'months');
        },
        /**
         * @override
         */
        __load: async function (params) {
            this.forecast_domain = params.domain;
            this.forecast_field = params.context.forecast_field;
            this.min_forecast_period = params.context.min_forecast_period || 4;
            this.end_forecast_moment = this._computeEndForecastMoment(this.start_forecast_moment, this.min_forecast_period);
            params.domain = this._applyForecastDomain(params.domain);
            var handle = await this._super(...arguments);
            this.updateForecastGroups(handle); //TODO remove if forecast_field is not the first groupby
            return handle;
        },
        /**
         * @override
         */
        __reload: async function (id, options) {
            var reload = await this._super(...arguments);
            this.updateForecastGroups(id); //TODO remove if forecast_field is not the first groupby
            return reload;
        },
        /**
         * can be totally deleted if backend sends all columns right away -> _read_group_fill_temporal update
         */
        updateForecastGroups: function (parentID) {
            //TODO this function should never be called if forecast_field is not the first groupby
            const self = this;
            const parent = this.localData[parentID];
            const groupBy = this.forecast_field;
            const createGroupDataPoint = (model, parent, group_data) => {
                const newGroup = model._makeDataPoint({
                    modelName: parent.model,
                    context: parent.context,
                    domain: ['&', '&', [groupBy, ">=", group_data.start_date], [groupBy, "<", group_data.end_date]].concat(parent.domain),
                    fields: parent.fields,
                    fieldsInfo: parent.fieldsInfo,
                    isOpen: true,
                    limit: parent.limit,
                    parentID: parent.id,
                    openGroupByDefault: true,
                    orderedBy: parent.orderedBy,
                    value: group_data.name,
                    viewType: parent.viewType,
                });
                if (parent.progressBar) {
                    newGroup.progressBarValues = _.extend({
                        counts: {},
                    }, parent.progressBar);
                }
                return newGroup;
            };
            const missingColumns = (current_moment, count_displayed, index) => {
                if (this.displayed_end_forecast_moment) {
                    return moment(current_moment).add(1, 'months').isBefore(this.end_forecast_moment);
                } else {
                    return moment(current_moment).add(1, 'months').isBefore(this.end_forecast_moment) &&
                        (count_displayed < this.min_forecast_period || index < count_displayed);
                }
            };
            var columns_data = this.get(parentID, {raw: true}).data; // .data[x].value (can be false or a date (Month Year))
            var months = new Set(columns_data.map(x => x.value).filter(value => value));
            var newGroupsIds = [];
            var groupBefore = [];
            var current_moment;
            var i = 0;
            do {
                current_moment = moment(this.start_forecast_moment).add(i, 'months');
                var group_data = {
                    name: current_moment.format("MMMM YYYY"),
                    start_date: current_moment.format("YYYY-MM-DD"),
                    end_date: moment(current_moment).add(1, 'months').format("YYYY-MM-DD")
                };
                if (!months.has(group_data.name)) {
                    months.add(group_data.name);
                    var newGroup = createGroupDataPoint(self, parent, group_data);
                    if (i + 1 < months.size) {
                        groupBefore.push(newGroup.id);
                    } else {
                        parent.data.push(newGroup.id);
                    }
                    newGroupsIds.push(newGroup.id);
                }
                else {
                    i = months.size - 1;
                    current_moment = moment(this.start_forecast_moment).add(i, 'months');
                }
            } while (missingColumns(current_moment, months.size, ++i));
            parent.data = groupBefore.concat(parent.data);
            if (!this.displayed_end_forecast_moment) {
                this.displayed_end_forecast_moment = true;
                this.end_forecast_moment = moment(this.start_forecast_moment).add(i, 'months');
            }
            return newGroupsIds;
        },
    });

    var CrmForecastKanbanController = KanbanController.extend({
        custom_events: _.extend({}, KanbanController.prototype.custom_events, {
            forecast_kanban_add_column: '_onAddColumnForecast',
        }),
        _onAddColumnForecast: function (ev) {
            // ev.data.value -> "date_deadline"
            //TODO this event should never be called if forecast_field is not the first groupby
            this.model.end_forecast_moment.add(1, 'months');
            var list = this.model.localData[this.handle];
            list.domain = this.model._applyForecastDomain(this.model.forecast_domain);
            const self = this;
            this.mutex.exec(function () {
                return self.update({}, {reload: true});
            }).then(function () {
                return self.renderer.trigger_up("quick_create_column_created");
            });
        },
    });

    var CrmForecastKanbanView = KanbanView.extend({
        config: _.extend({}, KanbanView.prototype.config, {
            Renderer: CrmForecastKanbanRenderer,
            Model: CrmForecastKanbanModel,
            Controller: CrmForecastKanbanController,
        }),
    });

    viewRegistry.add('crm_forecast_kanban', CrmForecastKanbanView);

    return {
        CrmForecastKanbanRenderer: CrmForecastKanbanRenderer,
        CrmForecastKanbanModel: CrmForecastKanbanModel,
        CrmForecastKanbanController: CrmForecastKanbanController,
        CrmForecastKanbanView: CrmForecastKanbanView,
    };
});
