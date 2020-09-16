/** @odoo-module alias=mail.widgets.DiscussPartnerInviteDialog **/

import { _lt, qweb } from 'web.core';
import Dialog from 'web.Dialog';

/**
 * Widget : Invite People to Channel Dialog
 *
 * Popup containing a 'many2many_tags' custom input to select multiple partners.
 * Searches user according to the input, and triggers event when selection is
 * validated.
 */
const PartnerInviteDialog = Dialog.extend({
    dialog_title: _lt("Invite people"),
    template: 'mail.widgets.DiscussInvitePartnerDialog',
    /**
     * @override {web.Dialog}
     * @param {mail.widgets.Discuss} parent
     * @param {Object} param1
     * @param {Thread} param1.activeThread
     * @param {Object} param1.messagingEnv
     * @param {Object} param1.messagingEnv.store
     */
    init(parent, { activeThread, messagingEnv }) {
        const env = messagingEnv;
        this.channelId = activeThread.$$$id();
        this.env = env;
        this._super(parent, {
            title: _.str.sprintf(
                this.env._t("Invite people to #%s"),
                owl.utils.escape(activeThread.$$$displayName()),
            ),
            size: 'medium',
            buttons: [{
                text: this.env._t("Invite"),
                close: true,
                classes: 'btn-primary',
                click: ev => this._invite(ev),
            }],
        });
    },
    /**
     * @override {web.Dialog}
     * @returns {Promise}
     */
    start() {
        this.$input = this.$('.o_input');
        this.$input.select2({
            width: '100%',
            allowClear: true,
            multiple: true,
            formatResult: item => {
                let status;
                // TODO FIXME fix this, why do we even have an old widget here
                if (item.id === 'odoobot') {
                    status = 'bot';
                } else {
                    const partner = this.env.services.action.dispatch(
                        'Partner/findById',
                        { $$$id: item.id },
                    );
                    status = partner.$$$im_status();
                }
                const $status = qweb.render(
                    'mail.widgets.UserStatus',
                    { status },
                );
                return $('<span>').text(item.text).prepend($status);
            },
            query: query => {
                this.env.services.action.dispatch(
                    'Partner/imSearch',
                    {
                        callback: partners => {
                            let results = partners.map(partner => {
                                return {
                                    id: partner.$$$id(),
                                    label: partner.$$$nameOrDisplayName(),
                                    text: partner.$$$nameOrDisplayName(),
                                    value: partner.$$$nameOrDisplayName(),
                                };
                            });
                            results = _.sortBy(results, 'label');
                            query.callback({ results });
                        },
                        keyword: query.term,
                        limit: 20,
                    },
                );
            },
        });
        return this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    async _invite() {
        const data = this.$input.select2('data');
        if (data.length === 0) {
            return;
        }
        await this._rpc({
            model: 'mail.channel',
            method: 'channel_invite',
            args: [this.channelId],
            kwargs: {
                partner_ids: _.pluck(data, 'id'),
            },
        });
        const names = _.escape(_.pluck(data, 'text').join(', '));
        const notification = _.str.sprintf(
            this.env._t("You added <b>%s</b> to the conversation."),
            names,
        );
        this.env.services['notification'].notify({
            message: notification,
            type: 'info',
        });
    },
});

export default PartnerInviteDialog;
