/** @odoo-module alias=mail.models.Attachment.fields.fileType **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'fileType',
    id: 'mail.models.Attachment.fields.fileType',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Attachment} param0.record
     * @returns {string|undefined}
     */
     compute({ ctx, env, record }) {
        if (record.type(ctx) === 'url' && !record.url(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        } else if (!record.mimetype(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        const match = record.type(ctx) === 'url'
            ? record.url(ctx).match('(youtu|.png|.jpg|.gif)')
            : record.mimetype(ctx).match('(image|video|application/pdf|text)');
        if (!match) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        if (match[1].match('(.png|.jpg|.gif)')) {
            return 'image';
        }
        return match[1];
    },
});
