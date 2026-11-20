import { describe, expect, test } from "@odoo/hoot";
import { Domain } from "@web/core/domain";
import { user } from "@web/core/user";
import {
    getMailComposerDomain,
    getRecordDomain,
    IMAGES_DOMAIN,
    MEDIA_MANAGER_BASE_DOMAIN,
    WEBSITE_DOMAIN,
} from "@html_editor/main/media/media_manager/domain_helper";

describe.current.tags("headless");

/**
 * Whether the domain matches an ir.attachment, by default a public binary png
 * not linked to any record.
 */
function matches(domain, values = {}) {
    return new Domain(domain).contains({
        name: "image.png",
        mimetype: "image/png",
        type: "binary",
        url: false,
        public: true,
        res_model: false,
        res_id: 0,
        original_id: false,
        key: false,
        create_uid: 999,
        ...values,
    });
}

describe("in every context", () => {
    test("only images are listed, uploaded or added by url", () => {
        expect(matches(MEDIA_MANAGER_BASE_DOMAIN)).toBe(true);
        expect(matches(MEDIA_MANAGER_BASE_DOMAIN, { public: false })).toBe(true);
        expect(matches(MEDIA_MANAGER_BASE_DOMAIN, { mimetype: "application/pdf" })).toBe(false);
        expect(matches(MEDIA_MANAGER_BASE_DOMAIN, { type: "url" })).toBe(true);
    });

    test("and the videos of the platforms, added by url", () => {
        const video = {
            name: "YouTube - dQw4w9WgXcQ",
            type: "url",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        };
        expect(matches(MEDIA_MANAGER_BASE_DOMAIN, { ...video, mimetype: "video/x-youtube" })).toBe(
            true
        );
        expect(matches(MEDIA_MANAGER_BASE_DOMAIN, { ...video, mimetype: "video/x-unknown" })).toBe(
            false
        );
        expect(
            matches(MEDIA_MANAGER_BASE_DOMAIN, { mimetype: "video/x-youtube", type: "binary" })
        ).toBe(false, { message: "a platform video is an url" });
        expect(
            matches(Domain.and([MEDIA_MANAGER_BASE_DOMAIN, IMAGES_DOMAIN]).toList(), {
                ...video,
                mimetype: "video/x-youtube",
            })
        ).toBe(false, { message: "restricted to the images (e.g. replacing an image)" });
    });

    test("technical attachments are hidden", () => {
        for (const [values, reason] of [
            [{ name: "image.png.crop" }, "cropped copy"],
            [{ original_id: 12 }, "optimized copy"],
            [{ url: "/web/static/img/logo.png" }, "module asset"],
            [{ url: "/html_editor/shape/brushes/01.svg" }, "editor shape"],
            [{ url: "/web_editor/shape/brushes/01.svg" }, "legacy editor shape"],
        ]) {
            expect(matches(MEDIA_MANAGER_BASE_DOMAIN, values)).toBe(false, { message: reason });
        }
        expect(matches(MEDIA_MANAGER_BASE_DOMAIN, { url: "/web/image/12" })).toBe(true);
    });
});

describe("record documentation", () => {
    test("public images and the images of the edited record", () => {
        const domain = getRecordDomain("res.partner", 4);
        expect(matches(domain, { public: true })).toBe(true);
        expect(matches(domain, { public: false, res_model: "res.partner", res_id: 4 })).toBe(true);
        expect(matches(domain, { public: false, res_model: "res.partner", res_id: 5 })).toBe(false);
        expect(matches(domain, { public: false })).toBe(false);
    });

    test("only the public images when there is no saved record", () => {
        for (const [resModel, resId] of [
            ["res.partner", undefined],
            [undefined, undefined],
        ]) {
            const domain = getRecordDomain(resModel, resId);
            expect(matches(domain, { public: true })).toBe(true);
            expect(matches(domain, { public: false })).toBe(false, {
                message: "the images not linked to any record are private",
            });
        }
    });
});

describe("email writing", () => {
    test("like the record documentation, plus my images uploaded in the composer", () => {
        const domain = getMailComposerDomain("res.partner", 4);
        const myComposerImage = {
            public: false,
            res_model: "mail.compose.message",
            res_id: 0,
            create_uid: user.userId,
        };
        expect(matches(domain, { public: true })).toBe(true);
        expect(matches(domain, { public: false, res_model: "res.partner", res_id: 4 })).toBe(true);
        expect(matches(domain, myComposerImage)).toBe(true);
        expect(matches(domain, { ...myComposerImage, create_uid: user.userId + 1 })).toBe(false, {
            message: "images uploaded by other users",
        });
        expect(matches(domain, { ...myComposerImage, res_id: 3 })).toBe(false, {
            message: "images of sent emails",
        });
    });
});

describe("website designing", () => {
    test("the public media library, without the website and theme images", () => {
        expect(matches(WEBSITE_DOMAIN)).toBe(true);
        expect(
            matches(WEBSITE_DOMAIN, { public: false, res_model: "website.page", res_id: 1 })
        ).toBe(false);
        expect(matches(WEBSITE_DOMAIN, { key: "theme_x.image_1" })).toBe(false, {
            message: "theme image",
        });
        expect(matches(WEBSITE_DOMAIN, { url: "/web/image/website.1/logo" })).toBe(false, {
            message: "image generated by the website",
        });
    });
});
