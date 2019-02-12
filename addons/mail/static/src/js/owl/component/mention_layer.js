odoo.define('mail.component.MentionLayer', function () {
'use strict';

/**
 * ComposerInput relies on a minimal HTML editor in order to support mentions.
 */
class MentionLayer extends owl.Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.template = 'mail.component.MentionLayer';
    }
}

MentionLayer.props = {
    mentions: {
        type: Array,
        element: {
            type: Object,
            shape: {},
        },
    },
};

return MentionLayer;

});
