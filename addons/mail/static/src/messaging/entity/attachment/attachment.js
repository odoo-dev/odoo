odoo.define('mail.messaging.entity.Attachment', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2many, many2one } = require('mail.messaging.EntityField');

function AttachmentFactory({ Entity }) {

    let nextTemporaryId = -1;
    function getAttachmentNextTemporaryId() {
        const id = nextTemporaryId;
        nextTemporaryId -= 1;
        return id;
    }
    class Attachment extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @static
         * @param {Object} data
         * @return {Object}
         */
        static convertData(data) {
            const data2 = {};
            if ('filename' in data) {
                data2.filename = data.filename;
            }
            if ('id' in data) {
                data2.id = data.id;
            }
            if ('mimetype' in data) {
                data2.mimetype = data.mimetype;
            }
            if ('name' in data) {
                data2.name = data.name;
            }

            // relation
            if ('res_id' in data && 'res_model' in data) {
                data2.originThread = [['insert', {
                    id: data.res_id,
                    model: data.res_model,
                }]];
            }

            return data2;
        }

        /**
         * View provided attachment(s), with given attachment initially. Prompts
         * the attachment viewer.
         *
         * @param {Object} param0
         * @param {mail.messaging.entity.Attachment} [param0.attachment]
         * @param {mail.messaging.entity.Attachment>[]} param0.attachments
         * @returns {string|undefined} unique id of open dialog, if open
         */
        static view({ attachment, attachments }) {
            if (!attachments || attachments.length === 0) {
                return;
            }
            if (!attachment) {
                attachment = attachments[0];
            }
            if (!attachments.includes(attachment)) {
                return;
            }
            this.env.messaging.dialogManager.open('AttachmentViewer', {
                attachment: [['replace', attachment]],
                attachments: [['replace', attachments]],
            });
        }

        /**
         * Remove this attachment globally.
         */
        async remove() {
            await this.async(() => this.env.rpc({
                model: 'ir.attachment',
                method: 'unlink',
                args: [this.id],
            }, { shadow: true }));
            this.delete();
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @returns {mail.messaging.entity.Composer[]}
         */
        _computeComposers() {
            if (this.isTemporary) {
                return [];
            }
            const relatedTemporaryAttachment = Attachment.find(attachment =>
                attachment.filename === this.filename &&
                attachment.isTemporary
            );
            if (relatedTemporaryAttachment) {
                const composers = relatedTemporaryAttachment.composers;
                relatedTemporaryAttachment.delete();
                return [['replace', composers]];
            }
            return [];
        }

        /**
         * @private
         * @returns {string}
         */
        _computeDefaultSource() {
            if (this.fileType === 'image') {
                return `/web/image/${this.id}?unique=1&amp;signature=${this.checksum}&amp;model=ir.attachment`;
            }
            if (this.fileType === 'application/pdf') {
                return `/web/static/lib/pdfjs/web/viewer.html?file=/web/content/${this.id}?model%3Dir.attachment`;
            }
            if (this.fileType && this.fileType.includes('text')) {
                return `/web/content/${this.id}?model%3Dir.attachment`;
            }
            if (this.fileType === 'youtu') {
                const urlArr = this.url.split('/');
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
            if (this.fileType === 'video') {
                return `/web/image/${this.id}?model=ir.attachment`;
            }
            return undefined;
        }

        /**
         * @private
         * @returns {string}
         */
        _computeDisplayName() {
            return this.name || this.filename;
        }

        /**
         * @private
         * @returns {string|undefined}
         */
        _computeExtension() {
            return this.filename && this.filename.split('.').pop();
        }

        /**
         * @private
         * @returns {string|undefined}
         */
        _computeFileType() {
            if (this.type === 'url' && !this.url) {
                return undefined;
            } else if (!this.mimetype) {
                return undefined;
            }
            const match = this.type === 'url'
                ? this.url.match('(youtu|.png|.jpg|.gif)')
                : this.mimetype.match('(image|video|application/pdf|text)');
            if (!match) {
                return undefined;
            }
            if (match[1].match('(.png|.jpg|.gif)')) {
                return 'image';
            }
            return match[1];
        }

        /**
         * @private
         * @returns {integer}
         */
        _computeId() {
            if (this.isTemporary && (this.id === undefined || this.id > 0)) {
                return getAttachmentNextTemporaryId();
            }
            return this.id;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsLinkedToComposer() {
            return this.composers.length > 0;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsTextFile() {
            if (!this.fileType) {
                return false;
            }
            return this.fileType.includes('text');
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsViewable() {
            return (
                this.mediaType === 'image' ||
                this.mediaType === 'video' ||
                this.mimetype === 'application/pdf' ||
                this.isTextFile
            );
        }

        /**
         * @private
         * @returns {string}
         */
        _computeMediaType() {
            return this.mimetype && this.mimetype.split('/').shift();
        }

        /**
         * @override
         */
        _createInstanceLocalId(data) {
            const { id, isTemporary = false } = data;
            if (isTemporary) {
                return `${this.constructor.entityName}_${nextTemporaryId}`;
            }
            return `${this.constructor.entityName}_${id}`;
        }

    }

    Attachment.entityName = 'Attachment';

    Attachment.fields = {
        activities: many2many('Activity', {
            inverse: 'attachments',
        }),
        attachmentViewer: many2many('AttachmentViewer', {
            inverse: 'attachments',
        }),
        checkSum: attr(),
        composers: many2many('Composer', {
            compute: '_computeComposers',
            inverse: 'attachments',
        }),
        defaultSource: attr({
            compute: '_computeDefaultSource',
            dependencies: [
                'checkSum',
                'fileType',
                'id',
                'url',
            ],
        }),
        displayName: attr({
            compute: '_computeDisplayName',
            dependencies: [
                'filename',
                'name',
            ],
        }),
        extension: attr({
            compute: '_computeExtension',
            dependencies: ['filename'],
        }),
        filename: attr(),
        fileType: attr({
            compute: '_computeFileType',
            dependencies: [
                'mimetype',
                'type',
                'url',
            ],
        }),
        id: attr({
            compute: '_computeId',
            dependencies: ['isTemporary'],
        }),
        isLinkedToComposer: attr({
            compute: '_computeIsLinkedToComposer',
            dependencies: ['composers'],
        }),
        isTemporary: attr({
            default: false,
        }),
        isTextFile: attr({
            compute: '_computeIsTextFile',
            dependencies: ['fileType'],
        }),
        isViewable: attr({
            compute: '_computeIsViewable',
            dependencies: [
                'mediaType',
                'isTextFile',
                'mimetype',
            ],
        }),
        mediaType: attr({
            compute: '_computeMediaType',
            dependencies: ['mimetype'],
        }),
        messages: many2many('Message', {
            inverse: 'attachments',
        }),
        mimetype: attr({
            default: '',
        }),
        name: attr(),
        originThread: many2one('Thread', {
            inverse: 'originThreadAttachments',
        }),
        size: attr(),
        threads: many2many('Thread', {
            inverse: 'attachments',
        }),
        type: attr(),
        url: attr(),
    };

    return Attachment;
}

registerNewEntity('Attachment', AttachmentFactory);

});
