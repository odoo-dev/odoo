odoo.define('web_studio.ApprovalComponent', function (require) {
    'use strict';

    const { Component, useState } = owl;
    const Dialog = require('web.OwlDialog');

    class ApprovalComponent extends Component {
        //--------------------------------------------------------------------------
        // Lifecycle
        //--------------------------------------------------------------------------

        constructor() {
            super(...arguments);
            this.state = useState({
                entries: null,
                rules: null,
                showInfo: false,
                syncing: false,
                init: true,
            });
        }

        mounted() {
            this.env.bus.on('refresh-approval', this, this._onRefresh);
            return super.mounted(...arguments);
        }

        willUnmount() {
            this.env.bus.off('refresh-approval', this, this._onRefresh);
            return super.willUnmount(...arguments);
        }

        async willStart() {
            return Promise.all([this._fetchApprovalData(), super.willStart(...arguments)]);
        }

        async willUpdateProps() {
            return Promise.all([this._fetchApprovalData(), super.willUpdateProps(...arguments)]);
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * @param {Number} ruleId: id of the rule for which the entry is requested.
         * @returns {Object}
         */
        getEntry(ruleId) {
            return this.state.entries.find((e) => e.rule_id[0] === ruleId);
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Delete an approval entry for a given rule server-side.
         * @private
         * @param {Number} ruleId
         */
        _cancelApproval(ruleId) {
            this._setSyncing(true);
            this.rpc({
                model: 'studio.approval.rule',
                method: 'delete_approval',
                args: [[ruleId]],
                kwargs: {
                    res_id: this.props.resId,
                },
                context: this.env.session.user_context,
            }).then(async () => {
                this._notifyChange();
                await this._fetchApprovalData()
                this._setSyncing(false);
            }).guardedCatch(async () => {
                this._notifyChange();
                await this._fetchApprovalData()
                this._setSyncing(false);
            });
        }

        /**
         * @private
         */
        async _fetchApprovalData() {
            const spec = await this.rpc(
                {
                    model: 'studio.approval.rule',
                    method: 'get_approval_spec',
                    args: [this.props.model, this.props.method, this.props.action],
                    kwargs: {
                        res_id: !this.props.inStudio && this.props.resId,
                    },
                    context: this.env.session.user_context,
                },
                { shadow: true }
            );
            // reformat the dates
            spec.entries.forEach((entry) => {
                entry.long_date = moment.utc(entry.write_date).local().format('LLL');
                entry.short_date = moment.utc(entry.write_date).local().format('LL');
            });
            Object.assign(this.state, spec);
            this.state.init = false;
        }

        /**
         * Notifies other widgets that an approval change has occured server-side,
         * this is useful if more than one button with the same action is in the view
         * to avoid displaying conflicting approval data.
         * @private
         */
        _notifyChange() {
            this.env.bus.trigger('refresh-approval', {
                approvalSpec: [this.props.model, this.props.resId, this.props.method, this.props.action],
            });
        }

        /**
         * Create or update an approval entry for a specified rule server-side.
         * @private
         * @param {Number} ruleId
         * @param {Boolean} approved
         */
        _setApproval(ruleId, approved) {
            this._setSyncing(true);
            this.rpc({
                model: 'studio.approval.rule',
                method: 'set_approval',
                args: [[ruleId]],
                kwargs: {
                    res_id: this.props.resId,
                    approved: approved,
                },
                context: this.env.session.user_context,
            }).then(async () => {
                this._notifyChange();
                await this._fetchApprovalData();
                this._setSyncing(false);
            }).guardedCatch(async () => {
                this._notifyChange();
                await this._fetchApprovalData();
                this._setSyncing(false);
            });
        }

        /**
         * Mark the widget as syncing; this is used to disable buttons while
         * an action is being processed server-side.
         * @param {Boolean} value: true to mark the widget as syncing, false otherwise.
         */
        _setSyncing(value) {
            this.state.syncing = value;
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * Handle notification dispatched by the bus; if another action has modifed
         * approval data server-side for an approval spec that matches this widget,
         * it will update itself.
         * @param {Object} ev
         */
        _onRefresh(ev) {
            if (
                ev.approvalSpec[0] === this.props.model &&
                ev.approvalSpec[1] === this.props.resId &&
                ev.approvalSpec[2] === this.props.method &&
                ev.approvalSpec[3] === this.props.action
            ) {
                // someone clicked on this widget's button, which
                // might trigger approvals server-side
                // refresh the widget
                this._fetchApprovalData();
            }
        }

        /**
         * Display or hide more information through a popover (desktop) or
         * dialog (mobile).
         * @param {DOMEvent} ev
         */
        _toggleInfo(ev) {
            if (!this.props.inStudio) {
                ev.stopPropagation();
            }
            this.state.showInfo = !this.state.showInfo;
        }
    }

    ApprovalComponent.template = 'Studio.ApprovalComponent';
    ApprovalComponent.components = { Dialog };
    ApprovalComponent.props = {
        action: [Number, Boolean],
        actionName: { type: String, optional: true },
        inStudio: Boolean,
        method: [String, Boolean],
        model: String,
        resId: { type: Number, optional: true },
    };

    return ApprovalComponent;
});
