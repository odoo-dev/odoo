import { expect, test } from "@odoo/hoot";
import { startInteractions, setupInteractionWhiteList } from "../core/helpers";
import { onceAllImagesLoaded } from "@website/interactions/utils";
import {
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { ImagesLazyLoading } from "@website/interactions/images_lazy_loading";

setupInteractionWhiteList("website.images_lazy_loading");

test("images lazy loading removes height then restores it", async () => {
    patchWithCleanup(ImagesLazyLoading.prototype, {
        updateImgMinHeight(imgEl, reset) {
            expect.step({
                when: `before ${reset ? "reset" : "load"}`,
                backup: imgEl.dataset.lazyLoadingInitialMinHeight,
                style: imgEl.style.minHeight,
            });
            super.updateImgMinHeight(imgEl, reset);
            expect.step({
                when: `after ${reset ? "reset" : "load"}`,
                backup: imgEl.dataset.lazyLoadingInitialMinHeight,
                style: imgEl.style.minHeight,
            });
        },
    });
    const { core, el } = await startInteractions(`
        <div>Fake surrounding
            <div id="wrapwrap">
                <img src="/web/image/website.library_image_08" loading="lazy" style="min-height: 100px;"/>
            </div>
        </div>
    `);
    expect(core.interactions.length).toBe(1);
    await onceAllImagesLoaded(el);
    expect.verifySteps([{
        when: "before load",
        backup: undefined,
        style: "100px",
    }, {
        when: "after load",
        backup: "100px",
        style: "1px",
    }, {
        when: "before reset",
        backup: "100px",
        style: "1px",
    }, {
        when: "after reset",
        backup: undefined,
        style: "100px",
    }]);
    // Check final state.
    const imgEl = el.querySelector("img");
    expect(imgEl.dataset.lazyLoadingInitialMinHeight).toBe(undefined);
    expect(imgEl.style.minHeight).toBe("100px");
});
