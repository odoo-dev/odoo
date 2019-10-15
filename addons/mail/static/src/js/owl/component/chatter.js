odoo.define('mail.component.Chatter', function (require) {
'use strict';

const AttachmentBox = require('mail.component.AttachmentBox');
const ChatterTopbar = require('mail.component.ChatterTopbar');


class Chatter extends owl.store.ConnectedComponent {
    /**
     * override
     */
    constructor(...args) {
        super(...args);
        this.state = owl.useState({
            isAttachmentBoxShown: false,
        });
    }
    /**
     * @override
     */
    mounted() {
        this.dispatch('createChatter', {
            _model: this.props.resModel,
            id: this.props.resId,
        });
        // TODO [create or reload] OR [delete on unmount]
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onClickAttachments(ev) {
        this.state.isAttachmentBoxShown = !this.state.isAttachmentBoxShown;
    }
}

Chatter.components = {
    AttachmentBox,
    ChatterTopbar
};

/**
 * @param {Object} state
 * @param {Array} state.threads
 * @param {Object} ownProps
 * @param {string} ownProps.resId
 * @param {string} ownProps.resModel
 * @returns {{threadLocalId: *}}
 */
Chatter.mapStoreToProps = function (state, ownProps) {
    const threads = Object.values(state.threads).filter(thread =>
            thread._model === ownProps.resModel &&
            thread.id === ownProps.resId);
    const thread = threads && threads.length > 0 ? threads[0] : null;
    const threadLocalId = thread ? thread.localId : null;
    return { threadLocalId };
};

Chatter.props = {
    resId: String,
    resModel: String
};

Chatter.template = 'mail.component.Chatter';

return Chatter;

});
