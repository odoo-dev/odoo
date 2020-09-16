/** @odoo-module alias=mail.views.activity.Model **/

import BasicModel from 'web.BasicModel';
import session from 'web.session';

const ActivityModel = BasicModel.extend({

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------
    /**
     * Add the following (activity specific) keys when performing a `get` on the
     * main list datapoint:
     * - activity_types
     * - activity_res_ids
     * - grouped_activities
     *
     * @override
     */
    __get() {
        const result = this._super(...arguments);
        if (
            result &&
            result.model === this.modelName &&
            result.type === 'list'
        ) {
            Object.assign(result, this.additionalData, {
                getKanbanActivityData: this.getKanbanActivityData,
            });
        }
        return result;
    },
    /**
     * @param {Object} activityGroup
     * @param {integer} resId
     * @returns {Object}
     */
    getKanbanActivityData(activityGroup, resId) {
        return {
            data: {
                activity_ids: {
                    model: 'mail.activity',
                    res_ids: activityGroup.ids,
                },
                activity_state: activityGroup.state,
                closest_deadline: activityGroup.o_closest_deadline,
            },
            fields: {
                activity_ids: {},
                activity_state: {
                    selection: [
                        ['overdue', "Overdue"],
                        ['today', "Today"],
                        ['planned', "Planned"],
                    ],
                },
            },
            fieldsInfo: {},
            getContext() {
                return {};
            },
            model: this.model,
            res_id: resId,
            type: 'record',
        };
    },
    /**
     * @override
     * @param {Array[]} params.domain
     */
    async __load(params) {
        this.originalDomain = [...params.domain];
        params.domain.push(['activity_ids', '!=', false]);
        this.domain = params.domain;
        this.modelName = params.modelName;
        params.groupedBy = [];
        const def = this._super(...arguments);
        const result = await Promise.all([def, this._fetchData()]);
        return result[0];
    },
    /**
     * @override
     * @param {Array[]} [params.domain]
     */
    async __reload(handle, params) {
        if (params && 'domain' in params) {
            this.originalDomain = [...params.domain];
            params.domain.push(['activity_ids', '!=', false]);
            this.domain = params.domain;
        }
        if (params && 'groupBy' in params) {
            params.groupBy = [];
        }
        const def = this._super(...arguments);
        const result = await Promise.all([def, this._fetchData()]);
        return result[0];
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Fetch activity data.
     *
     * @private
     * @returns {Promise}
     */
    async _fetchData() {
        const result = await this._rpc({
            model: 'mail.activity',
            method: 'get_activity_data',
            kwargs: {
                context: session.user_context,
                domain: this.domain,
                res_model: this.modelName,
            },
        });
        this.additionalData = result;
    },
});

export default ActivityModel;
