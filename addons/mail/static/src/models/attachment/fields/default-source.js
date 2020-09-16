/** @odoo-module alias=mail.models.Attachment.fields.defaultSource **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'defaultSource',
    id: 'mail.models.Attachment.fields.defaultSource',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Attachment} param0.record
     * @returns {string|undefined}
     */
    compute({ ctx, env, record }) {
        if (record.fileType(ctx) === 'image') {
            return `/web/image/${
                record.id(ctx)
            }?unique=1&amp;signature=${
                record.checkSum(ctx)
            }&amp;model=ir.attachment`;
        }
        if (record.fileType(ctx) === 'application/pdf') {
            return `/web/static/lib/pdfjs/web/viewer.html?file=/web/content/${
                record.id(ctx)
            }?model%3Dir.attachment`;
        }
        if (record.fileType(ctx) && record.fileType(ctx).includes('text')) {
            return `/web/content/${
                record.id(ctx)
            }?model%3Dir.attachment`;
        }
        if (record.fileType(ctx) === 'youtu') {
            const urlArr = record.url(ctx).split('/');
            let token = urlArr[urlArr.length - 1];
            if (token.includes('watch')) {
                token = token.split('v=')[1];
                const amp = token.indexOf('&');
                if (amp !== -1) {
                    token = token.substring(0, amp);
                }
            }
            return `https://www.youtube.com/embed/${token}`;
        }
        if (record.fileType(ctx) === 'video') {
            return `/web/image/${record.id(ctx)}?model=ir.attachment`;
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/clear',
        );
    },
});
