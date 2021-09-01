/** @odoo-module **/

import { attr } from '@mail/model/model_field';
import { registerNewModel } from '@mail/model/model_core';

function factory(dependencies) {
    class WelcomeView extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Static
        //----------------------------------------------------------------------

        static sanitizeGuestName(guestName = "") {
            return guestName.trim();
        }

        static async updateGuestNameServerSide(guestName) {
            await this.env.services.rpc({
                route: '/mail/guest/update_name',
                params: {
                    guest_name: WelcomeView.sanitizeGuestName(guestName),
                },
            });
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        async joinChannel() {
            if (this.guestNameInputRef.el && !this.isGuestNameValid) return;
            if (this.messaging.currentGuest) {
                await WelcomeView.updateGuestNameServerSide(this.guestName);
            }
            window.location = `/discuss/channel/${this.channelId}`;
        }

        onClickJoinButton() { this.joinChannel(); }
        onInputGuestNameInput() { this._updateGuestNameWithInputValue(); }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         */
        _updateGuestNameWithInputValue() {
            if (!(this.guestNameInputRef && this.guestNameInputRef.el)) return;
            this.update({ guestName: this.guestNameInputRef.el.value });
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsGuestNameValid() {
            return WelcomeView.sanitizeGuestName(this.guestName) !== "";
        }
    }

    WelcomeView.fields = {
        channelId: attr({ required: true }),
        guestName: attr(),
        guestNameInputRef: attr(),
        isDoFocusGuestNameInput: attr(),
        isGuestNameValid: attr({ compute: '_computeIsGuestNameValid' }),
    };

    WelcomeView.modelName = 'mail.welcome_view';

    return WelcomeView;
}

registerNewModel('mail.welcome_view', factory);
