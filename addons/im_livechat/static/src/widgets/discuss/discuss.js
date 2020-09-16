/** @odoo-module alias=im_livechat.widgets.Discuss **/

import Discuss from 'mail.widgets.Discuss';

Discuss.include({
    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     */
    _shouldHaveInviteButton() {
        if (
            this.discuss.thread() &&
            this.discuss.thread().channelType() === 'livechat'
        ) {
            return true;
        }
        return this._super();
    },
});
