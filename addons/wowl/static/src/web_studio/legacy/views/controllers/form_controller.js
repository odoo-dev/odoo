odoo.define('web_studio.FormController', function (require) {
    /**
     * Monkeypatching of the form controller to modify the behaviour
     * of buttons in form views so the that Studio Validation
     * mechanism works with them.
     *
     * Intercept calls to `_callButtonAction` and do a proper validation
     * of approvals before continuing with the action.
     */
    'use strict';

    const core = require('web.core');
    const FormController = require('web.FormController');

    const _t = core._t;

    FormController.include({
        /**
         * Intercept calls for buttons that have the `studio_approval` attrs
         * set; the action (method or action id) is checked server-side for the
         * current record to check if the current user can proceed or not base on
         * approval flows. If not, a notification is displayed detailing the issue;
         * if yes, the action proceeds normally.
         * @override
         * @param {Object} attrs the attrs of the button clicked
         * @param {Object} [record] the current state of the view
         * @returns {Promise}
         */
        async _callButtonAction(attrs, record) {
            const _super = this._super;
            if (attrs.studio_approval && attrs.studio_approval !== 'False') {
                const appSpec = await this._checkApproval(attrs, record);
                if (!appSpec.approved) {
                    // we've just saved the record, refresh the view since this is
                    // normally done in super that won't get called
                    await this.update({}, { reload: true });
                    const missingApprovals = [];
                    const doneApprovals = appSpec.entries.filter((e) => e.approved).map((e) => e.rule_id[0]);
                    appSpec.rules.forEach((r) => {if (!doneApprovals.includes(r.id)) {missingApprovals.push(r);}});
                    let msg = '<ul>';
                    missingApprovals.forEach((r) => (msg += `<li>${r.message || r.group_id[1]}</li>`));
                    msg += '</ul>';
                    this.displayNotification({
                        subtitle: _t('The following approvals are missing:'),
                        message: msg,
                        type: 'warning',
                    });
                    return Promise.reject();
                }
            }
            return _super.apply(this, arguments);
        },

        /**
         * Check server-side the status of approvals for an action for a particular
         * record. An action can be the ID of an ir.actions.actions record (for
         * buttons linked to an action; e.g. wizards, stat buttons, etc.) or
         * the name of a method on a model (for buttons that call a method).
         * @private
         * @param {Object} data: OdooEvent payload
         * @param {Object} record
         * @returns {Object}
         */
        async _checkApproval(attrs, record) {
            const isAction = attrs.type === 'action';
            const args = [
                this.modelName,
                parseInt(record.res_id),
                isAction ? undefined : attrs.name,
                isAction ? parseInt(attrs.name) : undefined,
            ];
            const result = await this._rpc({
                model: 'studio.approval.rule',
                method: 'check_approval',
                args: args,
                context: record.context,
            });
            // trigger a refresh of the relevant validation widget since validation
            // could happen server side
            core.bus.trigger('refresh-approval', { approvalSpec: args });
            return result;
        },
    });
});
