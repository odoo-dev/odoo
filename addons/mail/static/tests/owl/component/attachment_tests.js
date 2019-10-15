odoo.define('mail.component.AttachmentTests', function (require) {
"use strict";

const Attachment = require('mail.component.Attachment');
const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    pause,
    start: utilsStart,
} = require('mail.owl.testUtils');

QUnit.module('mail.owl', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('Attachment', {
    beforeEach() {
        utilsBeforeEach(this);
        this.createAttachment = async (attachmentLocalId, otherProps) => {
            const env = await this.widget.call('env', 'get');
            this.attachment = new Attachment(env, {
                attachmentLocalId,
                ...otherProps
            });
            await this.attachment.mount(this.widget.$el[0]);
        };
        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            let { store, widget } = await utilsStart({
                ...params,
                data: this.data,
            });
            this.store = store;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.attachment) {
            this.attachment.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        this.store = undefined;
    }
});

QUnit.test('simplest layout', async function (assert) {
    assert.expect(8);
    await this.start({});
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'none',
        isDownloadable: false,
        isEditable: false,
        showExtensionInDetails: false,
        showFilenameInDetails: false
    });
    assert.strictEqual(
        document.querySelectorAll('.o_Attachment').length,
        1,
        "should have attachment component in DOM");
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment.dataset.attachmentLocalId,
        'ir.attachment_750',
        "attachment component should be linked to attachment store model");
    assert.strictEqual(
        attachment.title,
        "test.txt",
        "attachment should have filename as title attribute");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image`)
            .length,
        1,
        "attachment should have an image part");
    assert.ok(
        attachment
            .querySelector(`
                :scope
                .o_Attachment_image`)
            .classList
            .contains('o_image'),
        "attachment should have o_image classname (required for mimetype.scss style)");
    assert.strictEqual(
        attachment
            .querySelector(`
                :scope
                .o_Attachment_image`)
            .dataset
            .mimetype,
        'text/plain',
        "attachment should have data-mimetype set (required for mimetype.scss style)");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details`)
            .length,
        0,
        "attachment should not have a details part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside`)
            .length,
        0,
        "attachment should not have an aside part");
});

QUnit.test('simplest layout + deletable', async function (assert) {
    assert.expect(6);
    await this.start();
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'none',
        isDownloadable: false,
        isEditable: true,
        showExtensionInDetails: false,
        showFilenameInDetails: false
    });
    assert.strictEqual(
        document.querySelectorAll('.o_Attachment').length,
        1,
        "should have attachment component in DOM");
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image`)
            .length,
        1,
        "attachment should have an image part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details`)
            .length,
        0,
        "attachment should not have a details part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside`)
            .length,
        1,
        "attachment should have an aside part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside
                .o_Attachment_asideItem`)
            .length,
        1,
        "attachment should have only one aside item");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside
                .o_Attachment_asideItemUnlink`)
            .length,
        1,
        "attachment should have a delete button");
});

QUnit.test('simplest layout + downloadable', async function (assert) {
    assert.expect(6);
    await this.start();
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'none',
        isDownloadable: true,
        isEditable: false,
        showExtensionInDetails: false,
        showFilenameInDetails: false
    });
    assert.strictEqual(
        document.querySelectorAll('.o_Attachment').length,
        1,
        "should have attachment component in DOM");
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image`)
            .length,
        1,
        "attachment should have an image part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details`)
            .length,
        0,
        "attachment should not have a details part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside`)
            .length,
        1,
        "attachment should have an aside part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside
                .o_Attachment_asideItem`)
            .length,
        1,
        "attachment should have only one aside item");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside
                .o_Attachment_asideItemDownload`)
            .length,
        1,
        "attachment should have a download button");
});

QUnit.test('simplest layout + deletable + downloadable', async function (assert) {
    assert.expect(8);
    await this.start();
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'none',
        isDownloadable: true,
        isEditable: true,
        showExtensionInDetails: false,
        showFilenameInDetails: false
    });
    assert.strictEqual(
        document.querySelectorAll('.o_Attachment').length,
        1,
        "should have attachment component in DOM");
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image`)
            .length,
        1,
        "attachment should have an image part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details`)
            .length,
        0,
        "attachment should not have a details part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside`)
            .length,
        1,
        "attachment should have an aside part");
    assert.ok(
        attachment
            .querySelector(`
                :scope
                .o_Attachment_aside`)
            .classList
            .contains('o-has-multiple-action'),
        "attachment aside should have o-has-multiple-action classname");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside
                .o_Attachment_asideItem`)
            .length,
        2,
        "attachment should have only two aside items");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside
                .o_Attachment_asideItemDownload`)
            .length,
        1,
        "attachment should have a download button");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside
                .o_Attachment_asideItemUnlink`)
            .length,
        1,
        "attachment should have a delete button");
});

QUnit.test('layout with card details', async function (assert) {
    assert.expect(3);
    await this.start();
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'card',
        isDownloadable: false,
        isEditable: false,
        showExtensionInDetails: false,
        showFilenameInDetails: false
    });
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image`)
            .length,
        1,
        "attachment should have an image part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details`)
            .length,
        0,
        "attachment should not have a details part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_aside`)
            .length,
        0,
        "attachment should not have an aside part");
});

QUnit.test('layout with card details and filename', async function (assert) {
    assert.expect(3);
    await this.start();
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'card',
        isDownloadable: false,
        isEditable: false,
        showExtensionInDetails: false,
        showFilenameInDetails: true
    });
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details`)
            .length,
        1,
        "attachment should have a details part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details
                .o_Attachment_filename`)
            .length,
        1,
        "attachment should not have its filename shown");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details
                .o_Attachment_extension`)
            .length,
        0,
        "attachment should have its extension shown");
});

QUnit.test('layout with card details and extension', async function (assert) {
    assert.expect(3);
    await this.start();
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'card',
        isDownloadable: false,
        isEditable: false,
        showExtensionInDetails: true,
        showFilenameInDetails: false
    });
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details`)
            .length,
        1,
        "attachment should have a details part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details
                .o_Attachment_filename`)
            .length,
        0,
        "attachment should not have its filename shown");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details
                .o_Attachment_extension`)
            .length,
        1,
        "attachment should have its extension shown");
});

QUnit.test('layout with card details and filename and extension', async function (assert) {
    assert.expect(3);
    await this.start();
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'card',
        isDownloadable: false,
        isEditable: false,
        showExtensionInDetails: true,
        showFilenameInDetails: true
    });
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details`)
            .length,
        1,
        "attachment should have a details part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details
                .o_Attachment_filename`)
            .length,
        1,
        "attachment should have its filename shown");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_details
                .o_Attachment_extension`)
            .length,
        1,
        "attachment should have its extension shown");
});

QUnit.test('simplest layout with hover details and filename and extension', async function (assert) {
    assert.expect(8);
    await this.start();
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'hover',
        isDownloadable: true,
        isEditable: true,
        showExtensionInDetails: true,
        showFilenameInDetails: true
    });
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                > .o_Attachment_details`)
            .length,
        0,
        "attachment should not have a details part directly");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_overlay
                .o_Attachment_details`)
            .length,
        1,
        "attachment should have a details part in the overlay");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image`)
            .length,
        1,
        "attachment should have an image part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image
                .o_Attachment_overlay`)
            .length,
        1,
        "attachment should have an image overlay part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image
                .o_Attachment_overlay
                .o_Attachment_filename`)
            .length,
        1,
        "attachment should have its filename shown");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image
                .o_Attachment_overlay
                .o_Attachment_extension`)
            .length,
        1,
        "attachment should have its extension shown");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image
                .o_Attachment_overlay
                .o_Attachment_actions`)
            .length,
        1,
        "attachment should have an actions part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                o_Attachment_aside`)
            .length,
        0,
        "attachment should not have an aside element");
});

QUnit.test('auto layout with image', async function (assert) {
    assert.expect(7);
    await this.start({
        async mockRPC(route, args) {
            if (route.includes('web/image/750')) {
                return;
            }
            return this._super(...arguments);
        },
    });
    const attachmentLocalId = this.store.dispatch('createAttachment', {
        filename: "test.png",
        id: 750,
        mimetype: 'image/png',
        name: "test.png",
    });

    await this.createAttachment(attachmentLocalId, {
        allowPreview: false,
        detailsMode: 'auto',
        isDownloadable: false,
        isEditable: false,
        showExtensionInDetails: true,
        showFilenameInDetails: true
    });
    const attachment = document.querySelector('.o_Attachment');
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                > .o_Attachment_details`)
            .length,
        0,
        "attachment should not have a details part directly");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_overlay
                .o_Attachment_details`)
            .length,
        1,
        "attachment should have a details part in the overlay");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image`)
            .length,
        1,
        "attachment should have an image part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image
                .o_Attachment_overlay`)
            .length,
        1,
        "attachment should have an image overlay part");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image
                .o_Attachment_overlay
                .o_Attachment_filename`)
            .length,
        1,
        "attachment should have its filename shown");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                .o_Attachment_image
                .o_Attachment_overlay
                .o_Attachment_extension`)
            .length,
        1,
        "attachment should have its extension shown");
    assert.strictEqual(
        attachment
            .querySelectorAll(`
                :scope
                o_Attachment_aside`)
            .length,
        0,
        "attachment should not have an aside element");
});

});
});
});
