/** @odoo-module alias=website_slides.components.Activity **/

import Activity from 'mail.components.Activity';

import { patch } from 'web.utils';

patch(
    Activity.prototype,
    'website_slides.components.Activity',
    {

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        async _onGrantAccess(ev) {
            await this.env.services.rpc({
                model: 'slide.channel',
                method: 'action_grant_access',
                args: [[this.activity.$$$thread(this).$$$id(this)]],
                kwargs: {
                    partner_id: this.activity.$$$requestingPartner(this).$$$id(this),
                },
            });
            this.trigger('reload');
        },
        /**
         * @private
         */
        async _onRefuseAccess(ev) {
            await this.env.services.rpc({
                model: 'slide.channel',
                method: 'action_refuse_access',
                args: [[this.activity.$$$thread(this).$$$id(this)]],
                kwargs: {
                    partner_id: this.activity.$$$requestingPartner(this).$$$id(this),
                },
            });
            this.trigger('reload');
        },
    }
);
