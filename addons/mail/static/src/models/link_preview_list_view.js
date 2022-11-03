/** @odoo-module **/

import { registerModel } from '@mail/model/model_core';
import { many, one } from '@mail/model/model_field';

registerModel({
    name: 'LinkPreviewListView',
    template: 'mail.LinkPreviewListView',
    fields: {
        /**
         * Determines if we are in the ChatWindow view AND if the message is left aligned
         */
        linkPreviewAsCardViews: many('LinkPreviewCardView', { inverse: 'linkPreviewListViewOwner',
            compute() {
                return this.messageViewOwner.message.linkPreviews.filter(linkPreview => linkPreview.isCard).map(linkPreview => ({ linkPreview }));
            },
        }),
        linkPreviewAsImageViews: many('LinkPreviewImageView', { inverse: 'linkPreviewListViewOwner',
            compute() {
                return this.messageViewOwner.message.linkPreviews.filter(linkPreview => linkPreview.isImage).map(linkPreview => ({ linkPreview }));
            },
        }),
        linkPreviewAsVideoViews: many('LinkPreviewVideoView', { inverse: 'linkPreviewListViewOwner',
            compute() {
                return this.messageViewOwner.message.linkPreviews.filter(linkPreview => linkPreview.isVideo).map(linkPreview => ({ linkPreview }));
            },
        }),
        messageViewOwner: one('MessageView', { identifying: true, inverse: 'linkPreviewListView' }),
    },
});
