/** @odoo-module alias=mail.widgets.ActivityMenu **/

import { qweb } from 'web.core';
import session from 'web.session';
import SystrayMenu from 'web.SystrayMenu';
import Widget from 'web.Widget';

const { Component } = owl;

/**
 * Menu item appended in the systray part of the navbar, redirects to the next
 * activities of all app
 */
const ActivityMenu = Widget.extend({
    name: 'activity_menu',
    template: 'mail.widgets.ActivityMenu',
    events: {
        'click .o_mail_activity_action': '_onActivityActionClick',
        'click .o_mail_preview': '_onActivityFilterClick',
        'hide.bs.dropdown': '_onActivityMenuHide',
        'show.bs.dropdown': '_onActivityMenuShow',
    },
    start() {
        this._$activitiesPreview = this.$('.o_mail_systray_dropdown_items');
        Component.env.bus.on('activity_updated', this, this._updateCounter);
        this._updateCounter();
        this._updateActivityPreview();
        return this._super();
    },

    //--------------------------------------------------
    // Private
    //--------------------------------------------------

    /**
     * Make RPC and get current user's activity details
     *
     * @private
     */
    async _getActivityData() {
        const data = await this._rpc({
            model: 'res.users',
            method: 'systray_get_activities',
            args: [],
            kwargs: {context: session.user_context},
        });
        this._activities = data;
        this.activityCounter = _.reduce(
            data,
            (total_count, p_data) => total_count + p_data.total_count || 0,
            0,
        );
        this.$('.o_notification_counter').text(this.activityCounter);
        this.$el.toggleClass('o_no_notification', !this.activityCounter);
    },
    /**
     * Get particular model view to redirect on click of activity scheduled on that model.
     *
     * @private
     * @param {string} model
     */
    _getActivityModelViewID(model) {
        return this._rpc({
            model: model,
            method: 'get_activity_view_id'
        });
    },
    /**
     * Return views to display when coming from systray depending on the model.
     *
     * @private
     * @param {string} model
     * @returns {Array[]} output the list of views to display.
     */
    _getViewsList(model) {
        return [[false, 'kanban'], [false, 'list'], [false, 'form']];
    },
    /**
     * Update(render) activity system tray view on activity updation.
     *
     * @private
     */
    _updateActivityPreview() {
        this._getActivityData().then(
            () => this._$activitiesPreview.html(
                qweb.render(
                    'mail.widgets.ActivityMenu.Previews',
                    { widget: this },
                ),
            ),
        );
    },
    /**
     * Update counter based on activity status(created or Done)
     *
     * @private
     * @param {Object} [data] key, value to decide activity created or deleted
     * @param {String} [data.type] notification type
     * @param {Boolean} [data.activity_deleted] when activity deleted
     * @param {Boolean} [data.activity_created] when activity created
     */
    _updateCounter(data) {
        if (data) {
            if (data.activity_created) {
                this.activityCounter++;
            }
            if (data.activity_deleted && this.activityCounter > 0) {
                this.activityCounter--;
            }
            this.$('.o_notification_counter').text(this.activityCounter);
            this.$el.toggleClass('o_no_notification', !this.activityCounter);
        }
    },

    //------------------------------------------------------------
    // Handlers
    //------------------------------------------------------------

    /**
     * Redirect to specific action given its xml id or to the activity
     * view of the current model if no xml id is provided
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onActivityActionClick(ev) {
        ev.stopPropagation();
        this.$('.dropdown-toggle').dropdown('toggle');
        const targetAction = $(ev.currentTarget);
        const actionXmlid = targetAction.data('action_xmlid');
        if (actionXmlid) {
            this.do_action(actionXmlid);
        } else {
            let domain = [['activity_ids.user_id', '=', session.uid]];
            if (targetAction.data('domain')) {
                domain = domain.concat(targetAction.data('domain'));
            }
            this.do_action(
                {
                    domain,
                    name: targetAction.data('model_name'),
                    res_model: targetAction.data('res_model'),
                    type: 'ir.actions.act_window',
                    view_mode: 'activity',
                    views: [
                        [false, 'activity'],
                        [false, 'kanban'],
                        [false, 'list'],
                        [false, 'form'],
                    ],
                },
                { clear_breadcrumbs: true },
            );
        }
    },

    /**
     * Redirect to particular model view
     * @private
     * @param {MouseEvent} ev
     */
    _onActivityFilterClick(ev) {
        // fetch the data from the button otherwise fetch the ones from the parent (.o_mail_preview).
        const data = {
            ...$(ev.currentTarget).data(),
            ...$(ev.target).data(),
        };
        const context = {};
        if (data.filter === 'my') {
            context['search_default_activities_overdue'] = 1;
            context['search_default_activities_today'] = 1;
        } else {
            context['search_default_activities_' + data.filter] = 1;
        }
        // Necessary because activity_ids of mail.activity.mixin has auto_join
        // So, duplicates are faking the count and "Load more" doesn't show up
        context['force_search_count'] = 1;
        let domain = [['activity_ids.user_id', '=', session.uid]];
        if (data.domain) {
            domain = domain.concat(data.domain);
        }
        this.do_action(
            {
                context,
                domain,
                name: data.model_name,
                res_model:  data.res_model,
                search_view_id: [false],
                type: 'ir.actions.act_window',
                views: this._getViewsList(data.res_model),
            },
            { clear_breadcrumbs: true },
        );
    },
    /**
     * @private
     */
    _onActivityMenuShow() {
        document.body.classList.add('modal-open');
         this._updateActivityPreview();
    },
    /**
     * @private
     */
    _onActivityMenuHide() {
        document.body.classList.remove('modal-open');
    },
});

SystrayMenu.Items.push(ActivityMenu);

export default ActivityMenu;
