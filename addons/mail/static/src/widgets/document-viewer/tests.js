/** @odoo-module alias=mail.widgets.DocumentViewer.tests **/

import DocumentViewer from 'mail.widgets.DocumentViewer';

import { click } from 'web.test_utils_dom';
import { addMockEnvironment } from 'web.test_utils_mock';
import Widget from 'web.Widget';

/**
 * @param {Object} params
 * @param {Object[]} params.attachments
 * @param {int} params.attachmentID
 * @param {function} [params.mockRPC]
 * @param {boolean} [params.debug]
 * @returns {DocumentViewer}
 */
async function createViewer(params) {
    const parent = new Widget();
    const viewer = new DocumentViewer(
        parent,
        params.attachments,
        params.attachmentID,
    );

    async function customMockRPC(route) {
        if (route === '/web/static/lib/pdfjs/web/viewer.html?file=/web/content/1?model%3Dir.attachment%26filename%3DfilePdf.pdf') {
            return;
        }
        if (route === 'https://www.youtube.com/embed/FYqW0Gdwbzk') {
            return;
        }
        if (route === '/web/content/4?model=ir.attachment') {
            return;
        }
        if (route === '/web/image/6?unique=56789abc&model=ir.attachment') {
            return;
        }
    }

    await addMockEnvironment(parent, {
        async mockRPC() {
            if (params.mockRPC) {
                const _super = this._super;
                this._super = customMockRPC;
                const def = params.mockRPC.apply(this, arguments);
                this._super = _super;
                return def;
            } else {
                return customMockRPC.apply(this, arguments);
            }
        },
        intercepts: params.intercepts || {},
    });
    let $target = $("#qunit-fixture");
    if (params.debug) {
        $target = $('body');
        $target.addClass('debug');
    }

    // actually destroy the parent when the viewer is destroyed
    viewer.destroy = () => {
        delete viewer.destroy;
        parent.destroy();
    };
    await viewer.appendTo($target);
    return viewer;
}

QUnit.module('mail', {}, function () {
QUnit.module('DocumentViewer', {}, function () {
QUnit.module('tests', {
    beforeEach: function () {
        this.attachments = [
            {
                datas: 'R0lGOP////ywAADs=',
                id: 1,
                mimetype: 'application/pdf',
                name: "filePdf.pdf",
                type: 'binary',
            },
            {
                id: 2,
                mimetype: '',
                name: "urlYoutube",
                type: 'url',
                url: 'https://youtu.be/FYqW0Gdwbzk',
            },
            {
                id: 3,
                mimetype: '',
                name: "urlRandom",
                type: 'url',
                url: 'https://www.google.com',
            },
            {
                datas: 'testee',
                id: 4,
                mimetype: 'text/html',
                name: "text.html",
                type: 'binary',
            },
            {
                datas: 'R0lDOP////ywAADs=',
                id: 5,
                mimetype: 'video/mp4',
                name: "video.mp4",
                type: 'binary',
            },
            {
                checksum: '123456789abc',
                datas: 'R0lVOP////ywAADs=',
                id: 6,
                name: "image.jpg",
                type: 'binary',
                mimetype: 'image/jpeg',
            },
        ];
    },
});

QUnit.test('basic rendering', async function (assert) {
    assert.expect(7);

    const viewer = await createViewer({
        attachmentID: 1,
        attachments: this.attachments,
    });
    assert.containsOnce(
        viewer,
        '.o_viewer_content',
        "there should be a preview",
    );
    assert.containsOnce(
        viewer,
        '.o_close_btn',
        "there should be a close button",
    );
    assert.containsOnce(
        viewer,
        '.o_viewer-header',
        "there should be a header",
    );
    assert.containsOnce(
        viewer,
        '.o_image_caption',
        "there should be an image caption",
    );
    assert.containsOnce(
        viewer,
        '.o_viewer_zoomer',
        "there should be a zoomer",
    );
    assert.containsOnce(
        viewer,
        '.fa-chevron-right',
        "there should be a right nav icon",
    );
    assert.containsOnce(
        viewer,
        '.fa-chevron-left',
        "there should be a left nav icon",
    );

    viewer.destroy();
});

QUnit.test('Document Viewer Youtube', async function (assert) {
    assert.expect(3);

    const youtubeURL = 'https://www.youtube.com/embed/FYqW0Gdwbzk';
    const viewer = await createViewer({
        attachmentID: 2,
        attachments: this.attachments,
        async mockRPC(route) {
            if (route === youtubeURL) {
                assert.ok(
                    true,
                    "should have called youtube URL",
                );
            }
            return this._super(...arguments);
        },
    });
    assert.strictEqual(
        viewer.$(".o_image_caption:contains('urlYoutube')").length,
        1,
        "the viewer should be on the right attachment",
    );
    assert.containsOnce(
        viewer,
        `.o_viewer_text[data-src="${youtubeURL}"]`,
        "there should be a video player",
    );

    viewer.destroy();
});

QUnit.test('Document Viewer html/(txt)', async function (assert) {
    assert.expect(2);

    const viewer = await createViewer({
        attachmentID: 4,
        attachments: this.attachments,
    });
    assert.strictEqual(
        viewer.$(".o_image_caption:contains('text.html')").length,
        1,
        "the viewer be on the right attachment",
     );
    assert.containsOnce(
        viewer,
        'iframe[data-src="/web/content/4?model=ir.attachment"]',
        "there should be an iframe with the right src",
    );

    viewer.destroy();
});

QUnit.test('Document Viewer mp4', async function (assert) {
    assert.expect(2);

    const viewer = await createViewer({
        attachmentID: 5,
        attachments: this.attachments,
    });
    assert.strictEqual(
        viewer.$(".o_image_caption:contains('video.mp4')").length,
        1,
        "the viewer be on the right attachment",
    );
    assert.containsOnce(
        viewer,
        '.o_viewer_video',
        "there should be a video player",
    );

    viewer.destroy();
});

QUnit.test('Document Viewer jpg', async function (assert) {
    assert.expect(2);

    const viewer = await createViewer({
        attachmentID: 6,
        attachments: this.attachments,
    });
    assert.strictEqual(
        viewer.$(".o_image_caption:contains('image.jpg')").length,
        1,
        "the viewer be on the right attachment",
    );
    assert.containsOnce(
        viewer,
        'img[data-src="/web/image/6?unique=56789abc&model=ir.attachment"]',
        "there should be a video player",
    );

    viewer.destroy();
});

QUnit.test('is closable by button', async function (assert) {
    assert.expect(3);

    const viewer = await createViewer({
        attachmentID: 6,
        attachments: this.attachments,
    });
    assert.containsOnce(
        viewer,
        '.o_viewer_content',
        "should have a document viewer",
    );
    assert.containsOnce(
        viewer,
        '.o_close_btn',
        "should have a close button",
    );

    await click(viewer.$('.o_close_btn'));
    assert.ok(
        viewer.isDestroyed(),
        "viewer should be destroyed",
    );
});

QUnit.test('is closable by clicking on the wrapper', async function (assert) {
    assert.expect(3);

    const viewer = await createViewer({
        attachmentID: 6,
        attachments: this.attachments,
    });
    assert.containsOnce(
        viewer,
        '.o_viewer_content',
        "should have a document viewer",
    );
    assert.containsOnce(
        viewer,
        '.o_viewer_img_wrapper',
        "should have a wrapper",
    );

    await click(viewer.$('.o_viewer_img_wrapper'));
    assert.ok(
        viewer.isDestroyed(),
        "viewer should be destroyed",
    );
});

QUnit.test('fileType and integrity test', async function (assert) {
    assert.expect(3);

    const viewer = await createViewer({
        attachmentID: 2,
        attachments: this.attachments,
    });
    assert.strictEqual(
        this.attachments[1].type,
        'url',
        "the type should be url",
    );
    assert.strictEqual(
        this.attachments[1].fileType,
        'youtu',
        "there should be a fileType 'youtu'",
    );
    assert.strictEqual(
        this.attachments[1].youtube,
        'FYqW0Gdwbzk',
        "there should be a youtube token",
    );

    viewer.destroy();
});

});
});
