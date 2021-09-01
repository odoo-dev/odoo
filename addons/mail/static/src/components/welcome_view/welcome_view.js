/** @odoo-module **/

import { getMessagingComponent } from '@mail/utils/messaging_component';
import { registerMessagingComponent } from '@mail/utils/messaging_component';
import { useRefToModel } from '@mail/component_hooks/use_ref_to_model/use_ref_to_model';
import { useUpdate } from '@mail/component_hooks/use_update/use_update';

const { useRef } = owl.hooks;

export class WelcomeView extends owl.Component {

    /**
     * @override
     */
    setup() {
        super.setup();

        this._guestNameInputRef = useRef('guestNameInput');

        useRefToModel({ fieldName: 'guestNameInputRef', modelName: 'mail.welcome_view', propNameAsRecordLocalId: 'localId', refName: 'guestNameInput' });
        useUpdate({ func: () => this._update() });
    }

    /**
     * @returns {mail.welcome_view}
     */
    get welcomeView() {
        return this.messaging.models['mail.welcome_view'].get(this.props.localId);
    }

    /**
     * @private
     */
    _focus() {
        if (this.welcomeView.isDoFocusGuestNameInput) {
            this.welcomeView.update({ isDoFocusGuestNameInput: false });
            if (!this._guestNameInputRef.el) return;
            this._guestNameInputRef.el.focus();
        }
    }

    /**
     * @private
     */
    _update() {
        this._focus();
    }

    //----------------------------------------------------------------------
    // Handlers
    //----------------------------------------------------------------------

    /**
     * @private
     */
    _onClickJoinButton() {
        this.welcomeView.onClickJoinButton();
    }

    /**
     * @private
     */
    _onInputGuestNameInput() {
        this.welcomeView.onInputGuestNameInput();
    }

    /**
     * @private
     */
    _onKeydownGuestNameInput({ key } = {}) {
        if (key === 'Enter') this.welcomeView.onClickJoinButton();
    }
}

Object.assign(WelcomeView, {
    props: {
        localId: String,
        mediaPreviewLocalId: String,
    },
    template: 'mail.WelcomeView',
});

registerMessagingComponent(WelcomeView);
