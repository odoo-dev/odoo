odoo.define("website.survey.tour", function (require) {
"use strict";

const wTourUtils = require("website.tour_utils");
const core = require("web.core");
const _t = core._t;
const snippets = require('tour_survey.snippets');

const imageStep = snippets.title.snippet.id === 's_text_image' ?
    wTourUtils.changeImage(snippets.title.snippet) : wTourUtils.changeBackground();

const backgroundColorStep = [wTourUtils.changeBackgroundColor()];
if (snippets.background)
    backgroundColorStep.unshift(wTourUtils.clickOnSnippet(snippets.background));

const shapeStep = [];
if (snippets.shape) {
    const previousID = snippets.background ? snippets.background.id : snippets.title.snippet.id;
    if (snippets.shape.id !== previousID)
       shapeStep.push(wTourUtils.clickOnSnippet(snippets.shape));
    shapeStep.push(wTourUtils.changeOption('BackgroundShape', 'we-toggler', _t('Background Shape')));
    shapeStep.push(wTourUtils.selectNested('we-select-page', 'BackgroundShape', ':not(.o_we_pager_controls', _t('Background Shape'))); 
}

const steps = [
    wTourUtils.clickOnText(snippets.title.snippet, snippets.title.element),
    imageStep,
    ...backgroundColorStep,
    ...shapeStep,
    wTourUtils.changePaddingSize('top'),
    wTourUtils.clickOnSave(),
];

wTourUtils.registerThemeHomepageTour('survey_tour', steps);

});
