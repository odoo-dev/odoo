odoo.define('mail.component.ChatterTopbar', function (require) {
'use strict';


class ChatterTopbar extends owl.store.ConnectedComponent {
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onClickAttachments(ev) {
        this.trigger('o-attachments-clicked');
    }
}

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.threadLocalId
 * @return {Object}
 */
ChatterTopbar.mapStoreToProps = function (state, ownProps) {
    const thread = state.threads && state.threads[ownProps.threadLocalId];
    let attachmentsAmount = 0;
    let followersAmount = 0; // TODO Compute me
    if (thread && thread.attachmentLocalIds) {
        attachmentsAmount = thread.attachmentLocalIds.length; // TODO Check if it's ok ?
    }
    return { attachmentsAmount, followersAmount };
};

ChatterTopbar.props = {
    threadLocalId: String,
};

ChatterTopbar.template = 'mail.component.ChatterTopbar';

return ChatterTopbar;

});
