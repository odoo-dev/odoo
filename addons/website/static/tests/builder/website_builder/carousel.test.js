import { expect, test } from "@odoo/hoot";
import {
    defineWebsiteModels,
    setupWebsiteBuilderWithSnippet,
} from "@website/../tests/builder/website_helpers";
import { contains } from "@web/../tests/web_test_helpers";

defineWebsiteModels();

test("Test Carousel Option (s_carousel)", async () => {
    const { getEditableContent } = await setupWebsiteBuilderWithSnippet("s_carousel");
    const carouselEl = getEditableContent().querySelector(".carousel");
    await contains(":iframe .carousel").click();

    // Editing the Transition

    await contains(".hb-row[data-label='Transition'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('None')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "10000");

    await contains(".hb-row[data-label='Transition'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Slide')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "10000");

    await contains(".hb-row[data-label='Transition'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Fade')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "10000");

    // Editing the Autoplay

    await contains(".hb-row[data-label='Autoplay'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Always')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "carousel");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "10000");

    await contains(".hb-row[data-label='Autoplay'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Never')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "false");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "10000");

    await contains(".hb-row[data-label='Autoplay'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('After First Hover')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "10000");

    // Editing the Timespan

    await contains(".hb-row[data-label='Timespan'] input").edit("3");
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "3000");

    await contains(".hb-row[data-label='Timespan'] input").edit("0");
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "1000");

    // Autoplay: Never doesn't remove bs-interval

    await contains(".hb-row[data-label='Autoplay'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Never')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "false");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "1000");
});

test("Test Carousel Option (s_image_gallery)", async () => {
    const { getEditableContent } = await setupWebsiteBuilderWithSnippet("s_image_gallery");
    const carouselEl = getEditableContent().querySelector(".carousel");
    await contains(":iframe .carousel").click();

    // Editing the Transition

    await contains(".hb-row[data-label='Transition'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('None')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "carousel");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "0");

    await contains(".hb-row[data-label='Transition'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Slide')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "carousel");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "0");

    await contains(".hb-row[data-label='Transition'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Fade')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "carousel");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "0");

    // Editing the Autoplay

    await contains(".hb-row[data-label='Autoplay'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Always')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "carousel");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "0");

    await contains(".hb-row[data-label='Autoplay'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Never')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "false");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "0");

    await contains(".hb-row[data-label='Autoplay'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('After First Hover')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "0");

    // Editing the Timespan

    await contains(".hb-row[data-label='Timespan'] input").edit("3");
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "3000");

    await contains(".hb-row[data-label='Timespan'] input").edit("0");
    expect(carouselEl).toHaveAttribute("data-bs-ride", "true");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "1000");

    // Autoplay: Never doesn't remove bs-interval

    await contains(".hb-row[data-label='Autoplay'] button").click();
    await contains(".o-hb-select-dropdown-item:contains('Never')").click();
    expect(carouselEl).toHaveAttribute("data-bs-ride", "false");
    expect(carouselEl).toHaveAttribute("data-bs-interval", "1000");
});

test("Snippet carousel clickable slides", async () => {
    const slideLinkSelector = ":iframe .carousel-item.active a.slide-link";
    const slideUrlInputSelector = "div[data-action-id='setSlideAnchorUrl'] input[title='Your URL']";

    await setupWebsiteBuilderWithSnippet("s_carousel");
    await contains(":iframe .carousel .carousel-item.active").click();

    // Make the Slide clickable
    await contains("[data-action-id='makeSlideClickable'] input").click();
    expect(":iframe .carousel-item.active").toHaveClass("clickable-slide", {
        message: "Check that the 'clickable-slide' class is added to the carousel item",
    });

    // Set URL
    await contains(slideUrlInputSelector).edit("/contactus-thank-you");
    expect(slideLinkSelector).toHaveAttribute("href", "/contactus-thank-you", {
        message: "Check that the anchor tag is added to the carousel item",
    });

    // Enable the option to open the link in a new tab
    await contains("[data-label='Open in New Tab'] [data-attribute-action='target'] input").click();
    expect(slideLinkSelector).toHaveAttribute("href", "/contactus-thank-you");
    expect(slideLinkSelector).toHaveAttribute("target", "_blank");

    // Remove URL
    expect(slideUrlInputSelector).toHaveValue("/contactus-thank-you");
    await contains(slideUrlInputSelector).edit("", { confirm: "enter" });

    expect(":iframe .carousel-item.active").toHaveClass("clickable-slide", {
        message: "Check that the 'clickable-slide' class is still in the carousel item",
    });
    expect(slideLinkSelector).toHaveCount(0, {
        message: "Check that the anchor tag is removed",
    });

    // Check that 'Open in New Tab' is hidden
    expect("[data-label='Open in New Tab']").not.toBeVisible();

    // Re-add URL
    await contains(slideUrlInputSelector).edit("/contactus-thank-you");

    // Disable Clickable
    await contains("[data-action-id='makeSlideClickable'] input").click();
    expect(":iframe .carousel-item.active").not.toHaveClass("clickable-slide");
    expect(slideLinkSelector).toHaveCount(0);

    // Enable Clickable again
    await contains("[data-action-id='makeSlideClickable'] input").click();
    expect(":iframe .carousel-item.active").toHaveClass("clickable-slide");
    expect(slideLinkSelector).toHaveCount(0);
});
