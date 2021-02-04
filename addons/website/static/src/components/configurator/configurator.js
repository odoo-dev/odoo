/** @odoo-module **/

import rpc from 'web.rpc';
import utils from 'web.utils';
import weUtils from 'web_editor.utils';
import {_t} from 'web.core';

const {Component, Store, mount, QWeb} = owl;
const {useDispatch, useStore, useGetters, useRef} = owl.hooks;
const {Router, RouteComponent} = owl.router;
const {whenReady} = owl.utils;

const MAX_PALETTES = 16;

const WEBSITE_TYPES = {
    1: {id: 1, label: _t("a business website"), name: 'business'},
    2: {id: 2, label: _t("an online store"), name: 'online_store'},
    3: {id: 3, label: _t("a blog"), name: 'blog'},
    4: {id: 4, label: _t("an event website"), name: 'event'},
    5: {id: 5, label: _t("an elearning platform"), name: 'elearning'}
};

const WEBSITE_PURPOSES = {
    1: {id: 1, label: _t("get leads"), name: 'get_leads'},
    2: {id: 2, label: _t("develop the brand"), name: 'develop_brand'},
    3: {id: 3, label: _t("sell more"), name: 'sell_more'},
    4: {id: 4, label: _t("inform customers"), name: 'inform_customers'}
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

const skipConfigurator = async (websiteId) => {
    const route = await rpc.query({
        model: 'website',
        method: 'skip_configurator',
        args: [[websiteId]]
    });
    window.location = route;
};

const installTheme = async (self, themeName) => {
    if (!self.state.selectedIndustry) {
        self.env.router.navigate({to: 'CONFIGURATOR_DESCRIPTION_SCREEN'});
        return;
    }
    if (!self.state.selectedPalette) {
        self.env.router.navigate({to: 'CONFIGURATOR_PALETTE_SELECTION_SCREEN'});
        return;
    }
    if (themeName !== undefined) {
        $('body').append(self.env.loader);
        const selectedFeatures = Object.values(self.state.features).filter((feature) => feature.selected).map((feature) => feature.id);
        const data = {
            selected_feautures: selectedFeatures,
            logo: self.state.logo,
            industry: self.state.selectedIndustry,
            selected_palette: self.state.selectedPalette.id,
        };
        const themeId = await rpc.query({
            model: 'ir.module.module',
            method: 'search_read',
            domain: [['name', '=', themeName]],
            fields: ['id'],
        });
        const resp = await rpc.query({
            model: 'ir.module.module',
            method: 'button_choose_theme',
            args: [[themeId[0].id], data],
        });
        window.location = resp.url;
    }
};

class SkipButton extends Component {
    async skip() {
        await skipConfigurator(parseInt(this.env.websiteId));
    }
}

SkipButton.template = 'website.Configurator.SkipButton';

class WelcomeScreen extends Component {
    constructor() {
        super(...arguments);
        this.dispatch = useDispatch();
    }

    goToDescription() {
        this.env.router.navigate({to: 'CONFIGURATOR_DESCRIPTION_SCREEN'});
    }
}

Object.assign(WelcomeScreen, {
    components: {SkipButton},
    template: 'website.Configurator.WelcomeScreen',
});

class DescriptionScreen extends Component {
    constructor() {
        super(...arguments);
        this.industrySelection = useRef('industrySelection');
        this.state = useStore((state) => state);
        this.labelToName = {};
        this.getters = useGetters();
        this.dispatch = useDispatch();
    }

    mounted() {
        this.dispatch('selectWebsitePurpose', undefined);
        this.dispatch('selectIndustry', undefined);
        $(this.industrySelection.el).autocomplete({
            appendTo: '.o_configurator_industry_wrapper',
            delay: 400,
            minLength: 1,
            source: this.autocompleteSearch.bind(this),
            select: this.selectIndustry.bind(this),
            classes: {
                'ui-autocomplete': 'custom-ui-autocomplete shadow-lg border-0 o_configurator_show_fast',
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
        const name = this.labelToName[ev.target.outerText];
        this.dispatch('selectIndustry', name);
        if (name === undefined) {
            this.industrySelection.el.textContent = '';
        } else {
            this.checkDescriptionCompletion();
        }
    }

    inputIndustrySelection(ev) {
        this.dispatch('selectIndustry', this.labelToName[ev.target.outerText]);
    }

    selectWebsiteType(ev) {
        const {id} = ev.target.dataset;
        this.dispatch('selectWebsiteType', id);
        setTimeout(() => {
            this.industrySelection.el.focus();
        });
        this.checkDescriptionCompletion();
    }

    selectWebsitePurpose(ev) {
        const {id} = ev.target.dataset;
        this.dispatch('selectWebsitePurpose', id);
        this.checkDescriptionCompletion();
    }

    checkDescriptionCompletion() {
        const {selectedType, selectedPurpose, selectedIndustry} = this.state;
        if (selectedType && selectedPurpose && selectedIndustry) {
            this.env.router.navigate({to: 'CONFIGURATOR_PALETTE_SELECTION_SCREEN'});
        }
    }
}

Object.assign(DescriptionScreen, {
    components: {SkipButton},
    template: 'website.Configurator.DescriptionScreen',
});

class PaletteSelectionScreen extends Component {
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
        let img = this.state.logo.split(',', 2)[1];
        const [color1, color2] = await rpc.query({
            model: 'base.document.layout',
            method: 'extract_image_primary_secondary_colors',
            args: [img]
        });
        this.dispatch('setRecommendedPalette', color1, color2);
    }

    selectPalette(paletteId) {
        this.dispatch('selectPalette', paletteId);
        this.env.router.navigate({to: 'CONFIGURATOR_FEATURES_SELECTION_SCREEN'});
    }
}

Object.assign(PaletteSelectionScreen, {
    components: {SkipButton},
    template: 'website.Configurator.PaletteSelectionScreen',
});

class FeaturesSelectionScreen extends Component {
    constructor() {
        super(...arguments);
        this.state = useStore((state) => state);
        this.getters = useGetters();
        this.dispatch = useDispatch();
    }

    async buildWebsite() {
        const industryName = this.state.selectedIndustry;
        if (!industryName) {
            this.env.router.navigate({to: 'CONFIGURATOR_DESCRIPTION_SCREEN'});
            return;
        }
        const params = {
            industryName: industryName,
            palette: this.state.selectedPalette
        };
        const themes = await rpc.query({
            model: 'website',
            method: 'get_recommended_themes',
            args: [params],
        });

        if (!themes.length) {
            await installTheme(this, 'theme_default');
        } else {
            this.dispatch('updateRecommendedThemes', themes);
            this.env.router.navigate({to: 'CONFIGURATOR_THEME_SELECTION_SCREEN'});
        }
    }
}

Object.assign(FeaturesSelectionScreen, {
    components: {SkipButton},
    template: 'website.Configurator.FeatureSelection',
});

class ThemeSelectionScreen extends Component {
    constructor() {
        super(...arguments);
        this.state = useStore((state) => state);
        this.getters = useGetters();
        this.themeSVGPreviews = [useRef('ThemePreview1'), useRef('ThemePreview2'), useRef('ThemePreview3')];
    }

    mounted() {
        this.state.themes.forEach((theme, idx) => {
            $(this.themeSVGPreviews[idx].el).append(theme.svg);
        });
    }

    async chooseTheme(themeName) {
        await installTheme(this, themeName);
    }
}

ThemeSelectionScreen.template = 'website.Configurator.ThemeSelectionScreen';

class App extends Component {}

Object.assign(App, {
    components: {RouteComponent},
    template: 'website.Configurator.App',
});

const ROUTES = [
    {name: 'CONFIGURATOR_WELCOME_SCREEN', path: '/website/configurator/1', component: WelcomeScreen},
    {name: 'CONFIGURATOR_DESCRIPTION_SCREEN', path: '/website/configurator/2', component: DescriptionScreen},
    {name: 'CONFIGURATOR_PALETTE_SELECTION_SCREEN', path: '/website/configurator/3', component: PaletteSelectionScreen},
    {name: 'CONFIGURATOR_FEATURES_SELECTION_SCREEN', path: '/website/configurator/4', component: FeaturesSelectionScreen},
    {name: 'CONFIGURATOR_THEME_SELECTION_SCREEN', path: '/website/configurator/5', component: ThemeSelectionScreen},
    {name: 'CONFIGURATOR_WELCOME_SCREEN_LANG', path: '/{{lang}}/website/configurator/1', component: WelcomeScreen},
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
    selectIndustry({state}, name) {
        state.selectedIndustry = name;
    },
    changeLogo({state}, data) {
        state.logo = data;
    },
    selectPalette({state}, paletteId) {
        state.selectedPalette = state.allPalettes[paletteId];
    },
    toggleFeature({state}, featureId) {
        const feature = state.features[featureId];
        const websiteType = WEBSITE_TYPES[state.selectedType];
        const forceFeatureActive = websiteType && feature.website_types_preselection.includes(websiteType.name);
        feature.selected = !feature.selected || forceFeatureActive;
    },
    setRecommendedPalette({state}, color1, color2) {
        let palettes = [];
        if (color1 && color2) {
            Object.values(state.allPalettes).forEach(palette => {
                const delta1 = deltaE(color1, palette.color1);
                const delta2 = deltaE(color2, palette.color2);
                palette.score = (delta1 + delta2) / 2;
            });
            palettes = Object.values(state.allPalettes).sort((a, b) => a.score - b.score);
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
        state.themes = themes.slice(0, 3);
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

    getThemeName({state}, idx) {
        return state.themes.length > idx ? state.themes[idx].name : undefined;
    }
};

async function getInitialState(websiteId) {

    const features = rpc.query({
        model: 'website.configurator.feature',
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

    const logoContent = rpc.query({
        model: 'website',
        method: 'get_configurator_logo',
        args: [[parseInt(websiteId)]],
    });

    const industries = rpc.query({
        model: 'website',
        method: 'get_configurator_industries',
    }).catch((_) => false);

    const allPalettes = {}, palettes = {};
    const style = window.getComputedStyle(document.documentElement);
    const allPaletteNames = weUtils.getCSSVariableValue('palette-names', style).split(' ').map((name) => {
        return name.replace(/'/g, "");
    });
    allPaletteNames.forEach((paletteName) => {
        const palette = {
            id: paletteName
        };
        for (let j = 1; j <= 5; j += 1) {
            const color = weUtils.getCSSVariableValue(`o-palette-${paletteName}-o-color-${j}`, style);
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
    });

    const vals = await Promise.all([features, logoContent, industries]);
    const logo = vals[1] ? 'data:image/png;base64,' + vals[1] : false;
    return {
        selectedType: undefined,
        selectedPurpose: undefined,
        selectedIndustry: undefined,
        industries: vals[2],
        logo: logo,
        selectedPalette: undefined,
        recommendedPalette: undefined,
        palettes: palettes,
        allPalettes: allPalettes,
        features: vals[0],
        themes: [],
    };
}

async function makeStore(websiteId) {
    const state = await getInitialState(websiteId);
    return new Store({state, actions, getters});
}

async function makeEnvironment() {
    const env = {
        websiteId: odoo.session_info.website_id
    };
    const router = new Router(env, ROUTES);
    await router.start();
    const store = await makeStore(env.websiteId);
    const qweb = new QWeb({translateFn: _t});
    const loaderTemplate = await owl.utils.loadFile('/website/static/src/xml/theme_preview.xml');
    const configuratorTemplates = await owl.utils.loadFile('/website/static/src/components/configurator/configurator.xml');
    qweb.addTemplates(loaderTemplate);
    qweb.addTemplates(configuratorTemplates);
    env.loader = qweb.renderToString('website.ThemePreview.Loader', {
        showTips: true
    });
    return Object.assign(env, {router, store, qweb});
}

async function setup() {
    const env = await makeEnvironment();
    if (!env.store.state.industries) {
        await skipConfigurator(parseInt(env.websiteId));
    } else {
        mount(App, {target: document.body, env});
    }
}

whenReady(setup);
