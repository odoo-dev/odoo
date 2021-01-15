odoo.define('crm.crm_kanban', function (require) {
    "use strict";

    /**
     * This Kanban Model make sure we display a rainbowman
     * message when a lead is won after we moved it in the
     * correct column and when it's grouped by stage_id (default).
     * Here we have added recurringRevenueSumField for displaying recurring_revenue
     * in kabanColumnProgressBar next to sumField.
     */

    const KanbanColumn = require('web.KanbanColumn');
    const KanbanColumnProgressBar = require('web.KanbanColumnProgressBar');
    var KanbanModel = require('web.KanbanModel');
    const KanbanRenderer = require('web.KanbanRenderer');
    var KanbanView = require('web.KanbanView');
    const session = require('web.session');
    const utils = require('web.utils');
    var viewRegistry = require('web.view_registry');

    const CrmKanbanColumnProgressBar = KanbanColumnProgressBar.extend({

        /**
         * @constructor
         * @override
         */
        init: function (parent, options, columnState) {
            this._super.apply(this, arguments);
            this.recurringRevenueSumField = columnState.progressBarValues.recurring_revenue_sum_field;

            if (options.columnID && options.progressBarStates[options.columnID]) {
                this.prevTotalRecurringRevenue = options.progressBarStates[options.columnID].totalRecurringRevenue;
            } else {
                this.prevTotalRecurringRevenue = 0;
            }
        },

        /**
         * @override
         */
        willStart: function () {
            const sup = this._super(...arguments);
            const userHasGroup = this.getSession().user_has_group('crm.group_use_recurring_revenues')
                .then((is_use_recurring_revenues) => {
                    this.hasRecurringRevenueGroup = is_use_recurring_revenues;
                });
            return Promise.all([sup, userHasGroup]);
        },

        /**
         * @override
         */
        start: function () {
            this._super.apply(this, arguments);
            this.$recurringRevenueNumber = this.$counter.find('strong');
        },

        /**
         * @override
         */
        computeCounters: function () {
            this._super.apply(this, arguments);
            this.totalRecurringRevenue = this.columnState.aggregateValues[this.recurringRevenueSumField] || 0;
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         * @override
         */
        _render: function () {
            const self = this;
            this._super.apply(this, arguments);
            let startRecurringRevenue = this.prevTotalRecurringRevenue;
            let endRecurringRevenue = this.totalRecurringRevenue;

            function _getCounterHTML(value) {
                return utils.human_number(value, 0, 0);
            }

            if (this.activeFilter.value) {
                if (this.recurringRevenueSumField) {
                    endRecurringRevenue = 0;
                    this.columnState.data.forEach((record) => {
                        const recordData = record.data;
                        if (this.activeFilter.value === recordData[this.fieldName] ||
                            (this.activeFilter.value === '__false' && !recordData[this.fieldName])) {
                            endRecurringRevenue += parseFloat(recordData[this.recurringRevenueSumField]);
                        }
                    });
                } else {
                    endRecurringRevenue = this.subgroupCounts[this.activeFilter.value];
                }
            }

            this.prevTotalRecurringRevenue = endRecurringRevenue;
            const animationClass = startRecurringRevenue > 999 ? 'o_kanban_grow' : 'o_kanban_grow_huge';

            if (startRecurringRevenue !== undefined && (endRecurringRevenue > startRecurringRevenue || this.activeFilter.value) && this.ANIMATE) {
                $({currentValue: startRecurringRevenue}).animate({currentValue: endRecurringRevenue}, {
                    duration: 1000,
                    start: function () {
                        self.$counter.addClass(animationClass);
                    },
                    step: function () {
                        self.$recurringRevenueNumber.html(_getCounterHTML(this.currentValue));
                    },
                    complete: function () {
                        self.$recurringRevenueNumber.html(_getCounterHTML(this.currentValue));
                        self.$counter.removeClass(animationClass);
                    },
                });
            } else {
                this.$recurringRevenueNumber.html(_getCounterHTML(endRecurringRevenue));
            }
        },

        /**
         * @private
         * @override
         */
        _notifyState: function () {
            this._super.apply(this, arguments);
            this.trigger_up('set_progress_bar_state', {
                columnID: this.columnID,
                values: {
                    totalRecurringRevenue: this.totalRecurringRevenue,
                },
            });
        },
    });

    const CrmKanbanColumn = KanbanColumn.extend({
        init: function (parent, data, options, recordOptions) {
            this._super.apply(this, arguments);
            this.progressBar = CrmKanbanColumnProgressBar;
        },
    });

    var CrmKanbanModel = KanbanModel.extend({
        /**
         * Check if the kanban view is grouped by "stage_id" before checking if the lead is won
         * and displaying a possible rainbowman message.
         * @override
         */
        moveRecord: async function (recordID, groupID, parentID) {
            var result = await this._super(...arguments);
            if (this.localData[parentID].groupedBy[0] === this.defaultGroupedBy[0]) {
                const message = await this._rpc({
                    model: 'crm.lead',
                    method : 'get_rainbowman_message',
                    args: [[parseInt(this.localData[recordID].res_id)]],
                });
                if (message) {
                    this.trigger_up('show_effect', {
                        message: message,
                        type: 'rainbow_man',
                    });
                }
            }
            return result;
        },
    });

    const CrmKanbanRenderer = KanbanRenderer.extend({
        config: Object.assign({}, KanbanRenderer.prototype.config, {
            KanbanColumn: CrmKanbanColumn,
        }),
    });

    var CrmKanbanView = KanbanView.extend({
        config: _.extend({}, KanbanView.prototype.config, {
            Model: CrmKanbanModel,
            Renderer: CrmKanbanRenderer,
        }),
    });

    viewRegistry.add('crm_kanban', CrmKanbanView);

    return {
        CrmKanbanColumn: CrmKanbanColumn,
        CrmKanbanColumnProgressBar: CrmKanbanColumnProgressBar,
        CrmKanbanModel: CrmKanbanModel,
        CrmKanbanRenderer: CrmKanbanRenderer,
        CrmKanbanView: CrmKanbanView
    };

});
