/** @odoo-module **/

import rpc from 'web.rpc';
import utils from 'web.utils';
import weUtils from 'web_editor.utils';
import core from "web.core";

const _t = core._t;
const {Component, Store, mount, QWeb} = owl;
const {useDispatch, useStore, useGetters, useRef} = owl.hooks;
const {Router, RouteComponent} = owl.router;
const {whenReady} = owl.utils;

const MAX_PALETTES = 16;

const WEBSITE_TYPES = {
    1: {id: 1, label: _t('a business website'), name: 'business'},
    2: {id: 2, label: _t('an online store'), name: 'online_store'},
    3: {id: 3, label: _t('a blog'), name: 'blog'},
    4: {id: 4, label: _t('an event website'), name: 'event'},
    5: {id: 5, label: _t('an elearning platform'), name: 'elearning'}
};

const WEBSITE_PURPOSES = {
    1: {id: 1, label: _t('get leads'), name: 'get_leads'},
    2: {id: 2, label: _t('develop the brand'), name: 'develop_brand'},
    3: {id: 3, label: _t('sell more'), name: 'sell_more'},
    4: {id: 4, label: _t('inform customers'), name: 'inform_customers'}
};

const hex2lab = (hex) => {
    let r = parseInt(hex.substring(1, 3), 16) / 255, g = parseInt(hex.substring(3, 5), 16) / 255, b = parseInt(hex.substring(5, 7), 16) / 255, x, y, z;
    [r, g, b] = [r, g, b].map((x) => (x > 0.04045) ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92);
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    [x, y, z] = [x, y, z].map((x) => (x > 0.008856) ? Math.pow(x, 1 / 3) : (7.787 * x) + 16 / 116);
    return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
};

const deltaE = (hexA, hexB) => {
    let labA = hex2lab(hexA), labB = hex2lab(hexB);
    let deltaL = labA[0] - labB[0], deltaA = labA[1] - labB[1], deltaB = labA[2] - labB[2];
    let c1 = Math.sqrt(labA[1] * labA[1] + labA[2] * labA[2]), c2 = Math.sqrt(labB[1] * labB[1] + labB[2] * labB[2]);
    let deltaC = c1 - c2;
    let deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC;
    deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH);
    let sc = 1.0 + 0.045 * c1, sh = 1.0 + 0.015 * c1;
    let deltaLKlsl = deltaL / (1.0), deltaCkcsc = deltaC / (sc), deltaHkhsh = deltaH / (sh);
    let i = deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;
    return i < 0 ? 0 : Math.sqrt(i);
};

class SkipButton extends Component {
    static template = 'website.Survey.SkipButton';

    async skip() {
        const route = await rpc.query({
            model: 'website',
            method: 'skip_survey',
            args: [[parseInt(this.env.router.currentParams.wid)]]
        });
        window.location = route;
    }
}

class WelcomeScreen extends Component {
    static template = 'website.Survey.WelcomeScreen'
    static components = {SkipButton};
    dispatch = useDispatch();

    goToDescription() {
        this.env.router.navigate({to: 'SURVEY_DESCRIPTION_SCREEN', params: this.env.router.currentParams});
    }
}

class DescriptionScreen extends Component {
    static template = 'website.Survey.DescriptionScreen';
    static components = {SkipButton};

    constructor() {
        super(...arguments);
        this.industrySelection = useRef('industrySelection');
        this.state = useStore((state) => state);
        this.labelToName = {};
        this.getters = useGetters();
        this.dispatch = useDispatch();
    }


    mounted() {
        this.dispatch('selectIndustry', undefined);
        $('.industry_selection').autocomplete({
            appendTo: ".o_survey_industry_wrapper",
            delay: 400,
            minLength: 1,
            source: this.autocompleteSearch.bind(this),
            select: this.selectIndustry.bind(this),
            classes: {
                'ui-autocomplete': 'custom-ui-autocomplete shadow-lg border-0 o_survey_show_fast',
            }
        });
    }

    autocompleteSearch(request, response) {
        const lcTerm = request.term.toLowerCase();
        const limit = 15;
        const matches = this.state.industries.filter((val) => {
            return val.label.startsWith(lcTerm);
        });
        let results = matches.slice(0, limit);
        this.labelToName = {};
        let labels = results.map((val) => val.label);
        if (labels.length < limit) {
            let relaxedMatches = this.state.industries.filter((val) => {
                return val.label.includes(lcTerm) && !labels.includes(val.label);
            });
            relaxedMatches = relaxedMatches.slice(0, limit - labels.length);
            results = results.concat(relaxedMatches);
            labels = results.map((val) => val.label);
        }
        results.forEach((r) => {
            this.labelToName[r.label] = r.name;
        });
        response(labels);
    }

    selectIndustry(_, ui) {
        this.dispatch('selectIndustry', this.labelToName[ui.item.label]);
        this.checkDescriptionCompletion();
    }

    blurIndustrySelection(ev) {
        const label = this.labelToName[ev.target.outerText];
        this.dispatch('selectIndustry', label);
        if (label === undefined) {
            this.industrySelection.el.textContent = '';
        } else {
            this.checkDescriptionCompletion();
        }
    }

    inputIndustrySelection(ev) {
        this.dispatch('selectIndustry', this.labelToName[ev.target.outerText]);
    }

    selectWebsiteType(ev) {
        const id = $(ev.target).data('id');
        this.dispatch('selectWebsiteType', id);
        setTimeout(() => {
            this.industrySelection.el.focus();
        });
        this.checkDescriptionCompletion();
    }

    selectWebsitePurpose(ev) {
        const id = $(ev.target).data('id');
        this.dispatch('selectWebsitePurpose', id);
        this.checkDescriptionCompletion();
    }

    checkDescriptionCompletion() {
        const {selectedType, selectedPurpose, selectedIndustry} = this.state;
        if (selectedType && selectedPurpose && selectedIndustry) {
            this.env.router.navigate({to: 'SURVEY_PALETTE_SELECTION_SCREEN', params: this.env.router.currentParams});
        }
    }
}

class PaletteSelectionScreen extends Component {
    static template = 'website.Survey.PaletteSelectionScreen';
    static components = {SkipButton};

    constructor() {
        super(...arguments);
        this.state = useStore((state) => state);
        this.getters = useGetters();
        this.dispatch = useDispatch();
        this.logoInputRef = useRef('logoSelectionInput');
    }

    mounted() {
        if (this.state.logo) {
            this.updatePalettes();
        }
    }

    uploadLogo() {
        this.logoInputRef.el.click();
    }

    async changeLogo() {
        const logoSelectInput = this.logoInputRef.el;
        if (logoSelectInput.files.length === 1) {
            const file = logoSelectInput.files[0];
            const data = await utils.getDataURLFromFile(file);
            this.dispatch('changeLogo', data);
            this.updatePalettes();
        }
    }

    async updatePalettes() {
        let color1 = false, color2 = false;
        let img = this.state.logo.split(',', 2)[1];
        const colors = await rpc.query({
            model: 'base.document.layout',
            method: 'extract_image_primary_secondary_colors',
            args: [img]
        });
        [color1, color2] = colors;
        this.dispatch('setRecommendedPalette', color1, color2);
    }

    selectPalette(paletteId) {
        this.dispatch('selectPalette', paletteId);
        this.env.router.navigate({to: 'SURVEY_FEATURES_SELECTION_SCREEN', params: this.env.router.currentParams});
    }
}

class FeaturesSelectionScreen extends Component {
    static template = 'website.Survey.FeatureSelection';
    static components = {SkipButton};

    constructor() {
        super(...arguments);
        this.state = useStore((state) => state);
        this.getters = useGetters();
        this.dispatch = useDispatch();
    }

    async buildWebsite() {
        const industryName = this.state.selectedIndustry;
        if (!industryName) {
            this.env.router.navigate({to: 'SURVEY_DESCRIPTION_SCREEN', params: this.env.router.currentParams});
            return;
        }
        const params = {
            industryName: industryName,
            palette: this.state.selectedPalette
        };
        const themes = await rpc.query({
            model: 'website',
            method: 'get_recommended_themes',
            args: [[parseInt(this.env.router.currentParams.wid)], params],
        });

        if (themes.length !== 3) {
            const route = await rpc.query({
                model: 'website',
                method: 'skip_survey',
                args: [[parseInt(this.env.router.currentParams.wid)]]
            });
            window.location = route;
        } else {
            this.dispatch('updateRecommendedThemes', themes);
            this.env.router.navigate({to: 'SURVEY_THEME_SELECTION_SCREEN', params: this.env.router.currentParams});
        }
    }
}

class ThemeSelectionScreen extends Component {
    static template = 'website.Survey.ThemeSelectionScreen';

    constructor() {
        super(...arguments);
        this.state = useStore((state) => state);
        this.loader = $(this.env.qweb.renderToString('website.ThemePreview.Loader'))[0];
    }

    mounted() {
        this.state.themes.forEach((theme, idx) => {
            $(`.preview_theme_svg_${idx + 1}`).append(theme.svg);
        });
    }

    async chooseTheme(themeId) {
        if (!this.state.selectedIndustry) {
            this.env.router.navigate({to: 'SURVEY_DESCRIPTION_SCREEN', params: this.env.router.currentParams});
            return;
        }
        if (!this.state.selectedPalette) {
            this.env.router.navigate({to: 'SURVEY_PALETTE_SELECTION_SCREEN', params: this.env.router.currentParams});
            return;
        }
        if (themeId !== undefined) {
            this.addLoader();
            const selectedFeatures = Object.values(this.state.features).filter((feature) => feature.selected).map((feature) => feature.id);
            const data = {
                selected_feautures: selectedFeatures,
                logo: this.state.logo,
                industry: this.state.selectedIndustry,
                selected_palette: this.state.selectedPalette.id,
            };
            const resp = await rpc.query({
                model: 'ir.module.module',
                method: 'button_choose_theme',
                args: [[themeId], data],
            });
            window.location = resp.url;
        }
    }

    addLoader() {
        $('body').append(this.loader);
    }
}

class App extends Component {
    static template = 'website.Survey.App';
    static components ={RouteComponent};
}

const ROUTES = [
    {name: "SURVEY_WELCOME_SCREEN", path: "/website/survey/1/{{wid}}", component: WelcomeScreen},
    {name: "SURVEY_DESCRIPTION_SCREEN", path: "/website/survey/2/{{wid}}", component: DescriptionScreen},
    {name: "SURVEY_PALETTE_SELECTION_SCREEN", path: "/website/survey/3/{{wid}}", component: PaletteSelectionScreen},
    {name: "SURVEY_FEATURES_SELECTION_SCREEN", path: "/website/survey/4/{{wid}}", component: FeaturesSelectionScreen},
    {name: "SURVEY_THEME_SELECTION_SCREEN", path: "/website/survey/5/{{wid}}", component: ThemeSelectionScreen},
    {name: "SURVEY_WELCOME_SCREEN_LANG", path: "/{{lang}}/website/survey/1/{{wid}}", component: WelcomeScreen},
];

const actions = {
    selectWebsiteType({state}, id) {
        Object.values(state.features).forEach((feature) => {
            feature.selected = feature.website_types_preselection.includes(WEBSITE_TYPES[id].name);
        });
        state.selectedType = id;
    },
    selectWebsitePurpose({state}, id) {
        state.selectedPurpose = id;
    },
    selectIndustry({state}, code) {
        state.selectedIndustry = code;
    },
    changeLogo({state}, data) {
        state.logo = data;
    },
    selectPalette({state}, paletteId) {
        state.selectedPalette = state.allPalettes[paletteId];
    },
    toggleFeature({state}, featureId) {
        const isSelected = state.features[featureId].selected;
        const isSelectedType = WEBSITE_TYPES[state.selectedType] && state.features[featureId].website_types_preselection.includes(WEBSITE_TYPES[state.selectedType].name);
        if (!isSelected || !isSelectedType) {
            state.features[featureId].selected = !isSelected;
        }        
    },
    setRecommendedPalette({state}, color1, color2) {
        let palettes = [];
        if (color1 && color2) {
            for (let paletteName in state.allPalettes) {
                const paletteColor1 = state.allPalettes[paletteName]['color1'];
                const paletteColor2 = state.allPalettes[paletteName]['color2'];
                const delta1 = deltaE(color1, paletteColor1);
                const delta2 = deltaE(color2, paletteColor2);
                state.allPalettes[paletteName]['score'] = (delta1 + delta2) / 2;
            }
            palettes = Object.values(state.allPalettes).sort((a, b) => a['score'] - b['score']);
            state.recommendedPalette = palettes[0];
        } else {
            palettes = Object.values(state.allPalettes);
        }
        const selectedPalettes = {};
        palettes.slice(1, MAX_PALETTES + 1).forEach((palette) => {
            selectedPalettes[palette.id] = palette;
        });
        state.palettes = selectedPalettes;
    },
    updateRecommendedThemes({state}, themes) {
        state.themes = themes.slice(0, 3).map(({name, id, svg}) => {
            return {name, id, svg};
        });
    }
};

const getters = {
    getWebsiteTypes() {
        return Object.values(WEBSITE_TYPES);
    },

    getSelectedType(_, id) {
        return id ? WEBSITE_TYPES[id] : undefined;
    },

    getWebsitePurpose() {
        return Object.values(WEBSITE_PURPOSES);
    },

    getSelectedPurpose(_, id) {
        return id ? WEBSITE_PURPOSES[id] : undefined;
    },

    getFeatures({state}) {
        return Object.values(state.features);
    },

    getPalettes({state}) {
        return Object.values(state.palettes);
    },
};

async function getInitialState(wid) {

    const features = rpc.query({
        model: 'website.survey.feature',
        method: 'search_read',
        fields: ['title', 'description', 'type', 'icon', 'website_types_preselection'],
    }).then(function (results) {
        const features = {};
        results.forEach(result => {
            features[result.id] = Object.assign({}, result, {selected: false});
            const wtp = features[result.id].website_types_preselection;
            features[result.id].website_types_preselection = wtp ? wtp.split(',') : [];
        });
        return features;
    });

    const logo = rpc.query({
        model: 'website',
        method: 'get_survey_logo',
        args: [[parseInt(wid)]],
    });

    const industries = rpc.query({
        model: 'website',
        method: 'get_survey_industries',
    });

    const allPalettes = {}, palettes = {};
    const style = window.getComputedStyle(document.documentElement);
    const themeNames = weUtils.getCSSVariableValue('theme-names', style).split(' ');
    themeNames.forEach((rawName) => {
        const name = rawName.replace(/'/g, "");
        const count = weUtils.getCSSVariableValue(`o-count-${name}`, style);
        for (let i = 1; i <= count; i++) {
            const paletteName = `${name}-${i}`;
            const palette = {};
            palette['id'] = paletteName;
            for (let j = 1; j <= 5; j += 1) {
                const color = weUtils.getCSSVariableValue(`o-palette-${name}-${i}-o-color-${j}`, style);
                palette[`color${j}`] = color;
            }
            let duplicate = false;
            for (const validatedPalette of Object.values(allPalettes)) {
                if (validatedPalette.color1.toLowerCase() === palette.color1.toLowerCase() && validatedPalette.color2.toLowerCase() === palette.color2.toLowerCase()) {
                    duplicate = true;
                }
            }
            if (!duplicate) {
                allPalettes[paletteName] = palette;
                if (Object.keys(palettes).length < MAX_PALETTES) {
                    palettes[paletteName] = allPalettes[paletteName];
                }
            }
        }
    });

    const vals = await Promise.all([features, logo, industries]);

    return {
        selectedType: undefined,
        selectedPurpose: undefined,
        selectedIndustry: undefined,
        industries: vals[2],
        logo: vals[1],
        selectedPalette: undefined,
        recommendedPalette: undefined,
        palettes: palettes,
        allPalettes: allPalettes,
        features: vals[0],
        themes: Array(3).fill({
            name: undefined,
            id: undefined,
            svg: undefined,
        }),
    };
}

async function makeStore(wid) {
    const state = await getInitialState(wid);
    const store = new Store({state, actions, getters});
    return store;
}

async function makeEnvironment() {
    const env = {};
    env.router = new Router(env, ROUTES);
    await env.router.start();
    env.store = await makeStore(env.router.currentParams.wid);
    const qweb = new QWeb({translateFn: _t});
    const loaderTemplate = await owl.utils.loadFile("/website/static/src/xml/theme_preview.xml");
    const surveyTemplates = await owl.utils.loadFile("/website/static/src/js/components/survey/survey.xml");
    qweb.addTemplates(loaderTemplate);
    qweb.addTemplates(surveyTemplates);
    env.qweb = qweb;
    return env;
}

async function setup() {
    const env = await makeEnvironment();
    $('body').removeClass('o_connected_user');
    mount(App, {target: document.body, env});
}

whenReady(setup);
