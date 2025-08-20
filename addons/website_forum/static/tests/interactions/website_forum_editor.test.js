import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { startInteractions, setupInteractionWhiteList } from "@web/../tests/public/helpers";
import { waitFor } from "@odoo/hoot-dom";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { WebsiteForumWysiwyg } from "../../src/components/website_forum_wysiwyg/website_forum_wysiwyg";

setupInteractionWhiteList(["website_forum.website_forum"]);

const makeHtmlContent = (karma) => `
    <div id="wrapwrap" class="website_forum">
        <form>
            <div class="o_wysiwyg_textarea_wrapper">
                <textarea class="o_wysiwyg_loader" content="abc" data-karma="0"></textarea>
            </div>
            <input type="hidden" id="karma" value="${karma}"></input>
            <button type="submit">Submit</button>
        </form>
    </div>
`;

describe("editor in forum", () => {
    let wysiwyg;
    beforeEach(() =>
        patchWithCleanup(WebsiteForumWysiwyg.prototype, {
            setup() {
                wysiwyg = this;
                super.setup();
            },
        })
    );
    test("Can instantiate the forum wysiwyg in full edit mode", async () => {
        const { core } = await startInteractions(makeHtmlContent(1));
        expect(core.interactions).toHaveLength(1);
        await waitFor(".note-editable");
        expect(".note-editable").toHaveCount(1);
        expect(wysiwyg.props.fullEdit).toBe(true);
    });
    test("Can instantiate the forum wysiwyg without full edit mode", async () => {
        const { core } = await startInteractions(makeHtmlContent(-1));
        expect(core.interactions).toHaveLength(1);
        await waitFor(".note-editable");
        expect(".note-editable").toHaveCount(1);
        expect(wysiwyg.props.fullEdit).toBe(false);
    });
});
