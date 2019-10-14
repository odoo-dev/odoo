odoo.define('mail.component.Chatter', function (require) {
'use strict';

const AttachmentBox = require('mail.component.AttachmentBox');


class Chatter extends owl.store.ConnectedComponent {
    /**
     * @override
     */
    mounted() {
        this.dispatch('createChatter', {
            _model: this.props.resModel,
            id: this.props.resId,
        })
        // TODO [create or reload] OR [delete on unmount]
    }
}

Chatter.components = {
    AttachmentBox,
};

    /**
     * @param {Object} state
     * @param {Array} state.threads
     * @param {Object} ownProps
     * @param {string} ownProps.resId
     * @param {string} ownProps.resModel
     * @returns {{threadLocalId: *}}
     */
Chatter.mapStoreToProps = function(state, ownProps) {
    const threads = Object.values(state.threads).filter(thread =>
            thread._model === ownProps.resModel &&
            thread.id === ownProps.resId);
    const threadLocalId = threads && threads.length > 0 ? threads[0].localId : null;
    return { threadLocalId };
};

Chatter.props = {
    resId: String,
    resModel: String
};

Chatter.template = 'mail.component.Chatter';

return Chatter;

});
