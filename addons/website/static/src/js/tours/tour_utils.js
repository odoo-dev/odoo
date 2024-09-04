odoo.define("website.tour_utils", function (require) {
"use strict";

const {_t} = require("web.core");
const {Markup} = require('web.utils');
var tour = require("web_tour.tour");

function addMedia(position = "right") {
    return {
        trigger: `.modal-content footer .btn-primary`,
        content: Markup(_t("<b>Add</b> the selected image.")),
        position: position,
        run: "click",
    };
}
function assertCssVariable(variableName, variableValue, trigger = 'iframe body') {
    return {
        content: `Check CSS variable ${variableName}=${variableValue}`,
        trigger: trigger,
        auto: true,
        run: function () {
            const styleValue = getComputedStyle(this.$anchor[0]).getPropertyValue(variableName);
            if ((styleValue && styleValue.trim().replace(/["']/g, '')) !== variableValue.trim().replace(/["']/g, '')) {
                throw new Error(`Failed precondition: ${variableName}=${styleValue} (should be ${variableValue})`);
            }
        },
    };
}

function changeBackground(snippet, position = "bottom") {
    return {
        trigger: ".o_we_customize_panel .o_we_bg_success",
        content: Markup(_t("<b>Customize</b> any block through this menu. Try to change the background image of this block.")),
        position: position,
        run: "click",
    };
}

function changeBackgroundColor(position = "bottom") {
    return {
        trigger: ".o_we_customize_panel .o_we_color_preview",
        content: Markup(_t("<b>Customize</b> any block through this menu. Try to change the background color of this block.")),
        position: position,
        run: "click",
    };
}

function selectColorPalette(position = "left") {
    return {
        trigger: ".o_we_customize_panel .o_we_so_color_palette we-selection-items",
        alt_trigger: ".o_we_customize_panel .o_we_color_preview",
        content: Markup(_t(`<b>Select</b> a Color Palette.`)),
        position: position,
        run: 'click',
        location: position === 'left' ? '#oe_snippets' : undefined,
    };
}

function changeColumnSize(position = "right") {
    return {
        trigger: `iframe .oe_overlay.ui-draggable.o_we_overlay_sticky.oe_active .o_handle.e`,
        content: Markup(_t("<b>Slide</b> this button to change the column size.")),
        position: position,
    };
}

function changeIcon(snippet, index = 0, position = "bottom") {
    return {
        trigger: `#wrapwrap .${snippet.id} i:eq(${index})`,
        extra_trigger: "body.editor_enable",
        content: Markup(_t("<b>Double click on an icon</b> to change it with one of your choice.")),
        position: position,
        run: "dblclick",
    };
}

function changeImage(snippet, position = "bottom") {
    return {
        trigger: snippet.id ? `#wrapwrap .${snippet.id} img` : snippet,
        extra_trigger: "body.editor_enable",
        content: Markup(_t("<b>Double click on an image</b> to change it with one of your choice.")),
        position: position,
        run: "dblclick",
    };
}

/**
    wTourUtils.changeOption('HeaderTemplate', '[data-name="header_alignment_opt"]', _t('alignment')),
    By default, prevents the step from being active if a palette is opened.
    Set allowPalette to true to select options within a palette.
*/
function changeOption(optionName, weName = '', optionTooltipLabel = '', position = "bottom", allowPalette = false) {
    const noPalette = allowPalette ? '' : '.o_we_customize_panel:not(:has(.o_we_so_color_palette.o_we_widget_opened))';
    const option_block = `${noPalette} we-customizeblock-option[class='snippet-option-${optionName}']`;
    return {
        trigger: `${option_block} ${weName}, ${option_block} [title='${weName}']`,
        content: Markup(_.str.sprintf(_t("<b>Click</b> on this option to change the %s of the block."), optionTooltipLabel)),
        position: position,
        run: "click",
    };
}

function selectNested(trigger, optionName, alt_trigger = null, optionTooltipLabel = '', position = "top", allowPalette = false) {
    const noPalette = allowPalette ? '' : '.o_we_customize_panel:not(:has(.o_we_so_color_palette.o_we_widget_opened))';
    const option_block = `${noPalette} we-customizeblock-option[class='snippet-option-${optionName}']`;
    return {
        trigger: trigger,
        content: Markup(_.str.sprintf(_t("<b>Select</b> a %s."), optionTooltipLabel)),
        alt_trigger: alt_trigger == null ? undefined : `${option_block} ${alt_trigger}`,
        position: position,
        run: 'click',
        location: position === 'left' ? '#oe_snippets' : undefined,
    };
}

function changePaddingSize(direction) {
    let paddingDirection = "n";
    let position = "top";
    if (direction === "bottom") {
        paddingDirection = "s";
        position = "bottom";
    }
    return {
        trigger: `iframe .oe_overlay.ui-draggable.o_we_overlay_sticky.oe_active .o_handle.${paddingDirection}`,
        content: Markup(_.str.sprintf(_t("<b>Slide</b> this button to change the %s padding"), direction)),
        consumeEvent: 'mousedown',
        position: position,
    };
}

/**
 * Click on the top right edit button
 *
 * @deprecated use `clickOnEditAndWaitEditMode` instead to avoid race condition
 */
function clickOnEdit(position = "bottom") {
    return {
        trigger: ".o_menu_systray .o_edit_website_container a",
        content: Markup(_t("<b>Click Edit</b> to start designing your homepage.")),
        extra_trigger: "body:not(.editor_has_snippets)",
        position: position,
        timeout: 30000,
    };
}

/**
 * Simple click on an element in the page.
 * @param {*} elementName
 * @param {*} selector
 */
function clickOnElement(elementName, selector) {
    return {
        content: `Clicking on the ${elementName}`,
        trigger: selector,
        run: 'click'
    };
}

/**
 * Click on the top right edit button and wait for the edit mode
 *
 * @param {string} position Where the purple arrow will show up
 */
function clickOnEditAndWaitEditMode(position = "bottom") {
    return [{
        content: _t("<b>Click Edit</b> to start designing your homepage."),
        trigger: ".o_menu_systray .o_edit_website_container a",
        position: position,
    }, {
        content: "Check that we are in edit mode",
        trigger: ".o_website_preview.editor_enable.editor_has_snippets",
        run: () => null, // it's a check
    }];
}

/**
 * Simple click on a snippet in the edition area
 * @param {*} snippet
 * @param {*} position
 */
function clickOnSnippet(snippet, position = "bottom") {
    const trigger = snippet.id ? `#wrapwrap .${snippet.id}` : snippet;
    return {
        trigger: `iframe ${trigger}`,
        extra_trigger: "body.editor_has_snippets",
        content: Markup(_t("<b>Click on a snippet</b> to access its options menu.")),
        position: position,
        run: "click",
    };
}

function clickOnSave(position = "bottom") {
    return [{
        trigger: "div:not(.o_loading_dummy) > #oe_snippets button[data-action=\"save\"]:not([disabled])",
        // TODO this should not be needed but for now it better simulates what
        // an human does. By the time this was added, it's technically possible
        // to drag and drop a snippet then immediately click on save and have
        // some problem. Worst case probably is a traceback during the redirect
        // after save though so it's not that big of an issue. The problem will
        // of course be solved (or at least prevented in stable). More details
        // in related commit message.
        extra_trigger: "body:not(:has(.o_dialog)) #oe_snippets:not(:has(.o_we_already_dragging))",
        in_modal: false,
        content: Markup(_t("Good job! It's time to <b>Save</b> your work.")),
        position: position,
    }, {
        trigger: 'iframe body:not(.editor_enable)',
        noPrepend: true,
        auto: true, // Just making sure save is finished in automatic tests
        run: () => null,
    }];
}

/**
 * Click on a snippet's text to modify its content
 * @param {*} snippet
 * @param {*} element Target the element which should be rewrite
 * @param {*} position
 */
function clickOnText(snippet, element, position = "bottom") {
    return {
        trigger: snippet.id ? `iframe #wrapwrap .${snippet.id} ${element}` : snippet,
        extra_trigger: "iframe body.editor_enable",
        content: Markup(_t("<b>Click on a text</b> to start editing it.")),
        position: position,
        run: "text",
        consumeEvent: "click",
    };
}

/**
 * Drag a snippet from the Blocks area and drop it in the Edit area
 * @param {*} snippet contain the id and the name of the targeted snippet
 * @param {*} position Where the purple arrow will show up
 */
function dragNDrop(snippet, position = "bottom") {
    return {
        trigger: `#oe_snippets .oe_snippet[name="${snippet.name}"] .oe_snippet_thumbnail:not(.o_we_already_dragging)`,
        extra_trigger: ".o_website_preview.editor_enable.editor_has_snippets",
        content: Markup(_.str.sprintf(_t("Drag the <b>%s</b> building block and drop it at the bottom of the page."), snippet.name)),
        position: position,
        // Normally no main snippet can be dropped in the default footer but
        // targeting it allows to force "dropping at the end of the page".
        run: "drag_and_drop iframe #wrapwrap > footer",
    };
}

function goBackToBlocks(position = "bottom") {
    return {
        trigger: '.o_we_add_snippet_btn',
        content: _t("Click here to go back to block tab."),
        position: position,
        run: "click",
    };
}

function goToTheme(position = "bottom") {
    return {
        trigger: '.o_we_customize_theme_btn',
        extra_trigger: '#oe_snippets.o_loaded',
        content: _t("Go to the Theme tab"),
        position: position,
        run: "click",
    };
}

function selectHeader(position = "bottom") {
    return {
        trigger: `iframe header#top`,
        content: Markup(_t(`<b>Click</b> on this header to configure it.`)),
        position: position,
        run: "click",
    };
}

function selectSnippetColumn(snippet, index = 0, position = "bottom") {
     return {
        trigger: `iframe #wrapwrap .${snippet.id} .row div[class*="col-lg-"]:eq(${index})`,
        content: Markup(_t("<b>Click</b> on this column to access its options.")),
         position: position,
        run: "click",
     };
}

function prepend_trigger(steps, prepend_text='') {
    for (const step of steps) {
        if (!step.noPrepend && prepend_text) {
            step.trigger = prepend_text + step.trigger;
        }
    }
    return steps;
}

function getClientActionUrl(path, edition) {
    let url = `/web#action=website.website_preview`;
    if (path) {
        url += `&path=${encodeURIComponent(path)}`;
    }
    if (edition) {
        url += '&enable_editor=1';
    }
    return url;
}

function clickOnExtraMenuItem(stepOptions, backend = false) {
    return Object.assign({}, {
        content: "Click on the extra menu dropdown toggle if it is there",
        trigger: `${backend ? "iframe" : ""} #top_menu`,
        run: function () {
            const extraMenuButton = this.$anchor[0].querySelector('.o_extra_menu_items a.nav-link');
            // Don't click on the extra menu button if it's already visible.
            if (extraMenuButton && !extraMenuButton.classList.contains("show")) {
                extraMenuButton.click();
            }
        },
    }, stepOptions);
}

/**
 * Registers a tour that will go in the website client action.
 *
 * @param {string} name The tour's name
 * @param {object} options The tour options
 * @param {string} options.url The page to edit
 * @param {boolean} [options.edition] If the tour starts in edit mode
 * @param {object[]} steps The steps of the tour
 */
function registerWebsitePreviewTour(name, options, steps) {
    const tourSteps = [...steps];
    const url = getClientActionUrl(options.url, !!options.edition);

    // Note: for both non edit mode and edit mode, we set a high timeout for the
    // first step. Indeed loading both the backend and the frontend (in the
    // iframe) and potentially starting the edit mode can take a long time in
    // automatic tests. We'll try and decrease the need for this high timeout
    // of course.
    if (options.edition) {
        tourSteps.unshift({
            content: "Wait for the edit mode to be started",
            trigger: '.o_website_preview.editor_enable.editor_has_snippets',
            timeout: 30000,
            auto: true,
            run: () => {}, // It's a check
        });
    } else {
        tourSteps[0].timeout = 20000;
    }

    return tour.register(name, Object.assign({}, options, { url }), tourSteps);
}

function registerThemeHomepageTour(name, steps) {
    return registerWebsitePreviewTour(name, {
        url: '/',
        edition: true,
        sequence: 1010,
        saveAs: "homepage",
    }, prepend_trigger(
        steps.concat(clickOnSave()),
        ".o_website_preview[data-view-xmlid='website.homepage'] "
    ));
}

function registerBackendAndFrontendTour(name, options, steps) {
    if (window.location.pathname === '/web') {
        const newSteps = [];
        for (const step of steps) {
            const newStep = Object.assign({}, step);
            newStep.trigger = `iframe ${step.trigger}`;
            if (step.extra_trigger) {
                newStep.extra_trigger = `iframe ${step.extra_trigger}`;
            }
            newSteps.push(newStep);
        }
        return registerWebsitePreviewTour(name, options, newSteps);
    }

    return tour.register(name, {
        url: options.url,
    }, steps);
}

/**
 * Selects an element inside a we-select, if the we-select is from a m2o widget, searches for it.
 *
 * @param widgetName {string} The widget's data-name
 * @param elementName {string} the element to search
 * @param searchNeeded {Boolean} if the widget is a m2o widget and a search is needed
 */
function selectElementInWeSelectWidget(
    widgetName,
    elementName,
    searchNeeded = false
) {
    const we_select = `we-select[data-name=${widgetName}]`;
    const steps = [
        {
            content: `Clicking on the ${widgetName} toggler in vue to select ${elementName}`,
            trigger: `${we_select} we-toggler`,
            run: "click",
        },
    ];
    if (searchNeeded) {
        steps.push({
            content: `Inputing ${elementName} in m2o widget search`,
            trigger: `${we_select} div.o_we_m2o_search input`,
            run: `text ${elementName}`,
        });
    }
    steps.push({
        content: `Clicking on the ${elementName} in the ${widgetName} widget`,
        trigger: `${we_select} we-button:contains("${elementName}")`,
        run: "click",
    });
    steps.push({
        content:
        "Check we-select is set and wait a delay before continue the tour",
        trigger: `${we_select}:contains(${elementName})`,
        async run() {
            // fix underterministic error.
            // When we-select is used twice a row too fast, the second we-select may not open.
            // The first toggle is open, we click on it and almost at the same time, we click on the second one.
            // There may be confusion with the active class.
            // Add a delay before continue the tour solves this problem.
            await new Promise((resolve) => setTimeout(resolve, 300));
        },
    });
    return steps;
}

/**
 * Switches to a different website by clicking on the website switcher.
 *
 * @param {number} websiteId - The ID of the website to switch to.
 * @param {string} websiteName - The name of the website to switch to.
 * @returns {Array} - The steps required to perform the website switch.
 */
function switchWebsite(websiteId, websiteName) {
    return [{
        content: `Click on the website switch to switch to website '${websiteName}'`,
        trigger: '.o_website_switcher_container button',
    }, {
        content: `Switch to website '${websiteName}'`,
        extra_trigger: `iframe html:not([data-website-id="${websiteId}"])`,
        trigger: `.o_website_switcher_container .dropdown-item:contains("${websiteName}")`,
    }, {
        content: "Wait for the iframe to be loaded",
        // The page reload generates assets for the new website, it may take
        // some time
        timeout: 20000,
        trigger: `iframe html[data-website-id="${websiteId}"]`,
        isCheck: true,
    }];
}

return {
    addMedia,
    assertCssVariable,
    changeBackground,
    changeBackgroundColor,
    changeColumnSize,
    changeIcon,
    changeImage,
    changeOption,
    changePaddingSize,
    clickOnEdit,
    clickOnEditAndWaitEditMode,
    clickOnElement,
    clickOnExtraMenuItem,
    clickOnSave,
    clickOnSnippet,
    clickOnText,
    dragNDrop,
    getClientActionUrl,
    goBackToBlocks,
    goToTheme,
    registerBackendAndFrontendTour,
    registerThemeHomepageTour,
    registerWebsitePreviewTour,
    selectColorPalette,
    selectElementInWeSelectWidget,
    selectHeader,
    selectNested,
    selectSnippetColumn,
    switchWebsite,
};
});
