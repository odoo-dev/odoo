odoo.define("website.survey.tour", function (require) {
"use strict";
        
const wTourUtils = require("website.tour_utils");
const core = require("web.core");
const _t = core._t;
const snippets = require('tour_survey.snippets');
        
const steps = [
    wTourUtils.clickOnText(snippets.title.snippet, snippets.title.element),
    wTourUtils.clickOnSnippet(snippets.background),
    wTourUtils.changeBackgroundColor(),
    wTourUtils.changeImage(snippets.image),
    wTourUtils.clickOnSnippet(snippets.padded ? snippets.padded : snippets.title.snippet),
    wTourUtils.changePaddingSize('bottom'),
];
        
if (snippets.shape) {
    steps.push(wTourUtils.clickOnSnippet(snippets.shape));
    steps.push(wTourUtils.changeOption('BackgroundShape', 'we-toggler', _t('Background Shape')));
    steps.push(wTourUtils.selectNested('we-select-page', 'BackgroundShape', ':not(.o_we_pager_controls)', _t('Background Shape')));
}

steps.push(wTourUtils.clickOnSave());
wTourUtils.registerThemeHomepageTour('survey_tour', steps);    

});    
