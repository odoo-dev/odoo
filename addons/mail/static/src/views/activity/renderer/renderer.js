/** @odoo-module alias=mail.views.activity.Renderer **/

import ActivityCell from 'mail.views.activity.Cell';
import ActivityRecord from 'mail.views.activity.Record';

import AbstractRendererOwl from 'web.AbstractRendererOwl';
import { _t } from 'web.core';
import KanbanColumnProgressBar from 'web.KanbanColumnProgressBar';
import { ComponentAdapter } from 'web.OwlCompatibility';
import QWeb from 'web.QWeb';
import session from 'web.session';
import { json_node_to_xml } from 'web.utils';

const { useState } = owl.hooks;

/**
 * Owl Component Adapter for ActivityRecord which is KanbanRecord (Odoo Widget)
 * TODO: Remove this adapter when ActivityRecord is a Component
 */
class ActivityRecordAdapter extends ComponentAdapter {
    renderWidget() {
        _.invoke(_.pluck(this.widget.subWidgets, '$el'), 'detach');
        this.widget._render();
    }

    updateWidget(nextProps) {
        const state = nextProps.widgetArgs[0];
        this.widget._setState(state);
    }
}

/**
 * Owl Component Adapter for ActivityCell which is BasicActivity (AbstractField)
 * TODO: Remove this adapter when ActivityCell is a Component
 */
class ActivityCellAdapter extends ComponentAdapter {
    renderWidget() {
        this.widget._render();
    }

    updateWidget(nextProps) {
        const record = nextProps.widgetArgs[1];
        this.widget._reset(record);
    }
}

/**
 * Owl Component Adapter for KanbanColumnProgressBar (Odoo Widget)
 * TODO: Remove this adapter when KanbanColumnProgressBar is a Component
 */
class KanbanColumnProgressBarAdapter extends ComponentAdapter {
    renderWidget() {
        this.widget._render();
    }

    updateWidget(nextProps) {
        const options = nextProps.widgetArgs[0];
        const columnState = nextProps.widgetArgs[1];
        const columnId = options.columnID;
        const nextActiveFilter = options.progressBarStates[columnId].activeFilter;
        this.widget.activeFilter = nextActiveFilter
            ? this.widget.activeFilter
            : false;
        this.widget.columnState = columnState;
        this.widget.computeCounters();
    }

    _trigger_up(ev) {
        // KanbanColumnProgressBar triggers 3 events before being mounted
        // but we don't need to listen to them in our case.
        if (this.el) {
            super._trigger_up(ev);
        }
    }
}

export default class ActivityRenderer extends AbstractRendererOwl {
    constructor(parent, props) {
        super(...arguments);
        this.qweb = new QWeb(this.env.isDebug(), {_s: session.origin});
        this.qweb.add_template(json_node_to_xml(props.templates));
        this.activeFilter = useState({
            activityTypeId: null,
            resIds: [],
            state: null,
        });
        this.widgetComponents = {
            ActivityCell,
            ActivityRecord,
            KanbanColumnProgressBar,
        };
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Gets all activity resIds in the view.
     *
     * @returns filtered resIds first then the rest.
     */
    get activityResIds() {
        const copiedActivityResIds = Array.from(this.props.activity_res_ids);
        return copiedActivityResIds.sort(
            (a, b) => this.activeFilter.resIds.includes(a) ? -1 : 0,
        );
    }

    /**
     * Gets all existing activity type ids.
     */
    get activityTypeIds() {
        const activities = Object.values(this.props.grouped_activities);
        const activityIds = activities.flatMap(Object.keys);
        const uniqueIds = Array.from(new Set(activityIds));
        return uniqueIds.map(Number);
    }

    getProgressBarOptions(typeId) {
        return {
            columnID: typeId,
            progressBarStates: {
                [typeId]: {
                    activeFilter: this.activeFilter.activityTypeId === typeId,
                },
            },
        };
    }

    getProgressBarColumnState(typeId) {
        const counts = { planned: 0, today: 0, overdue: 0 };
        for (let activities of Object.values(this.props.grouped_activities)) {
            if (typeId in activities) {
                counts[activities[typeId].state] += 1;
            }
        }
        return {
            count: Object.values(counts).reduce((x, y) => x + y),
            fields: {
                activity_state: {
                    selection: [
                        ['overdue', _t("Overdue")],
                        ['planned', _t("Planned")],
                        ['today', _t("Today")],
                    ],
                    type: 'selection',
                },
            },
            progressBarValues: {
                colors: {
                    overdue: 'danger',
                    planned: 'success',
                    today: 'warning',
                },
                counts: counts,
                field: 'activity_state',
            },
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onEmptyCellClicked(ev) {
        this.trigger('empty_cell_clicked', {
            resId: parseInt(
                ev.currentTarget.dataset.resId,
                10,
            ),
            activityTypeId: parseInt(
                ev.currentTarget.dataset.activityTypeId,
                10,
            ),
        });
    }
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onSendMailTemplateClicked(ev) {
        this.trigger('send_mail_template', {
            activityTypeID: parseInt(
                ev.currentTarget.dataset.activityTypeId,
                10,
            ),
            templateID: parseInt(
                ev.currentTarget.dataset.templateId,
                10,
            ),
        });
    }
    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onSetProgressBarState(ev) {
        if (ev.detail.values.activeFilter) {
            this.activeFilter.state = ev.detail.values.activeFilter;
            this.activeFilter.activityTypeId = ev.detail.columnID;
            this.activeFilter.resIds = Object.entries(this.props.grouped_activities)
                .filter(
                    ([, resIds]) => (
                        ev.detail.columnID in resIds &&
                        resIds[ev.detail.columnID].state === ev.detail.values.activeFilter
                    )
                )
                .map(([key]) => parseInt(key));
        } else {
            this.activeFilter.state = null;
            this.activeFilter.activityTypeId = null;
            this.activeFilter.resIds = [];
        }
    }
}

ActivityRenderer.components = {
    ActivityRecordAdapter,
    ActivityCellAdapter,
    KanbanColumnProgressBarAdapter,
};
ActivityRenderer.template = 'mail.views.activity.Renderer';
