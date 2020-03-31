odoo.define('mail.messaging.entity.Attachment', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entity.core');

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
         * @param {string} filename
         * @returns {mail.messaging.entity.Attachment[]}
         */
        static AllFromFilename(filename) {
            const allAttachments = this.all;
            return allAttachments.filter(attachment => attachment.filename === filename);
        }

        /**
         * @param {string} filename
         * @returns {mail.messaging.entity.Attachment|undefined}
         */
        static temporaryFromFilename(filename) {
            const attachments = this.AllFromFilename(filename);
            return attachments.find(attachment => attachment.isTemporary);
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
            if (!attachments) {
                return;
            }
            if (!attachment) {
                attachment = attachments[0];
            }
            if (!attachments.includes(attachment)) {
                return;
            }
            this.env.entities.Dialog.open('AttachmentViewer', { attachment, attachments });
        }

        /**
         * @returns {string}
         */
        get defaultSource() {
            const fileType = this.fileType;
            if (fileType === 'image') {
                return `/web/image/${this.id}?unique=1&amp;signature=${this.checksum}&amp;model=ir.attachment`;
            }
            if (fileType === 'application/pdf') {
                return `/web/static/lib/pdfjs/web/viewer.html?file=/web/content/${this.id}?model%3Dir.attachment`;
            }
            if (fileType && fileType.indexOf('text') !== -1) {
                return `/web/content/${this.id}?model%3Dir.attachment`;
            }
            if (fileType === 'youtu') {
                if (fileType !== 'youtu') {
                    return undefined;
                }
                const urlArr = this.url.split('/');
                let token = urlArr[urlArr.length - 1];
                if (token.indexOf('watch') !== -1) {
                    token = token.split('v=')[1];
                    const amp = token.indexOf('&');
                    if (amp !== -1) {
                        token = token.substring(0, amp);
                    }
                }
                return `https://www.youtube.com/embed/${token}`;
            }
            if (fileType === 'video') {
                return `/web/image/${this.id}?model=ir.attachment`;
            }
            return undefined;
        }

        /**
         * @returns {string}
         */
        get displayName() {
            return this.name || this.filename;
        }

        /**
         * @returns {string}
         */
        get extension() {
            return this.filename && this.filename.split('.').pop();
        }

        /**
         * @returns {string}
         */
        get fileType() {
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
         * @returns {boolean}
         */
        get isLinkedToComposer() {
            return this.composers.length > 0;
        }

        /**
         * @returns {boolean}
         */
        get isTextFile() {
            const fileType = this.fileType;
            return (fileType && fileType.indexOf('text') !== -1) || false;
        }

        /**
         * @returns {boolean}
         */
        get isViewable() {
            const mediaType = this.mediaType;
            return (
                mediaType === 'image' ||
                mediaType === 'video' ||
                this.mimetype === 'application/pdf' ||
                this.isTextFile
            );
        }

        /**
         * @returns {string}
         */
        get mediaType() {
            return this.mimetype && this.mimetype.split('/').shift();
        }

        /**
         * Unlink the provided attachment.
         */
        async remove() {
            await this.env.rpc({
                model: 'ir.attachment',
                method: 'unlink',
                args: [this.id],
            }, { shadow: true });
            this.delete();
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @override
         */
        _createInstanceLocalId(data) {
            const { id, isTemporary = false } = data;
            if (isTemporary) {
                return `${this.constructor.localId}_${nextTemporaryId}`;
            }
            return `${this.constructor.localId}_${id}`;
        }

        /**
         * @override
         */
        _update(data) {
            let {
                composers,
                filename,
                id = getAttachmentNextTemporaryId(),
                isTemporary = false,
                mimetype = '',
                name,
                res_id,
                res_model,
                size,
            } = data;

            this._write({
                filename,
                id,
                isTemporary,
                mimetype,
                name,
                size,
            });

            // composers
            if (composers) {
                if (composers === null) {
                    this.unlink({ composers: null });
                } else {
                    const prevComposers = this.composers;
                    const prevOldComposers = prevComposers.filter(composer => !composers.includes(composer));
                    const newComposers = composers.filter(composer => !prevComposers.includes(composer));
                    this.unlink({ composers: prevOldComposers });
                    this.link({ composers: newComposers });
                }
            }
            // originThread
            if (res_id && res_model) {
                let newOriginThread = this.env.entities.Thread.fromModelAndId({
                    id: res_id,
                    model: res_model,
                });
                if (!newOriginThread) {
                    newOriginThread = this.env.entities.Thread.create({
                        id: res_id,
                        model: res_model,
                    });
                }
                const prevOriginThread = this.originThread;
                if (newOriginThread !== prevOriginThread) {
                    this.link({ originThread: newOriginThread });
                }
            }
            // non-temporary attachment related to a temporary attachment
            if (!isTemporary) {
                const relatedTemporaryAttachment = Attachment.temporaryFromFilename(filename);
                if (relatedTemporaryAttachment) {
                    const composers = relatedTemporaryAttachment.composers;
                    // AKU TODO: link to appropriate position
                    this.link({ composers });
                    relatedTemporaryAttachment.delete();
                }
            }
        }

    }

    Object.assign(Attachment, {
        relations: Object.assign({}, Entity.relations, {
            activeInAttachmentViewer: {
                inverse: 'attachment',
                to: 'AttachmentViewer',
                type: 'one2many',
            },
            activities: {
                inverse: 'attachments',
                to: 'Activity',
                type: 'many2many',
            },
            attachmentViewer: {
                inverse: 'attachments',
                to: 'AttachmentViewer',
                type: 'many2many',
            },
            composers: {
                inverse: 'attachments',
                to: 'Composer',
                type: 'many2many',
            },
            messages: {
                inverse: 'attachments',
                to: 'Message',
                type: 'many2many',
            },
            originThread: {
                inverse: 'originThreadAttachments',
                to: 'Thread',
                type: 'many2one',
            },
            threads: {
                inverse: 'attachments',
                to: 'Thread',
                type: 'many2many',
            },
        }),
    });

    return Attachment;
}

registerNewEntity('Attachment', AttachmentFactory, ['Entity']);

});
