(function () {

  const {whenReady} = owl.utils;

  async function setup() {

    odoo.define('website.website_survey', async function (require) {

      const {Component, Store, mount, QWeb} = owl;
      const {xml} = owl.tags;
      const {useDispatch, useStore, useGetters} = owl.hooks;
      const {Router, RouteComponent} = owl.router;

      var rpc = require('web.rpc');
      var utils = require('web.utils');
      const templates = await owl.utils.loadFile("/website/static/src/xml/theme_preview.xml");
      const qweb = new QWeb({templates});

      const SkipButtonTemplate = xml`
        <div class="container-fluid py-2 pb-md-3 text-right pr-lg-5">
          <button class="btn btn-link" t-on-click="skip()">Skip wizard <span class="o_survey_skip_desc">and start from scratch</span></button>
        </div>
        `;

      class SkipButton extends Component {
        static template = SkipButtonTemplate

        skip() {
          rpc.query({
            model: 'website',
            method: 'skip_survey',
            args: [[parseInt(this.env.router.currentParams.wid)]]
          }).then((route) => {
            window.location = route;
          });
        }
      }

      const WelcomeScreenTemplate = xml`
        <div class="o_survey_screen h-100 d-flex flex-column o_welcome_screen">
          <div class="container-fluid pt-3 pb-2">
            <img class="ml-lg-5" style="height: 31px; width: 99px;" src="/website/static/src/img/odoo_logo.svg" title="Odoo Logo"/>
          </div>
          <div class="o_survey_screen_content d-flex h-100">
              <div class="container align-self-center o_survey_show">
                  <div class="display-4 mb-2">Ready to build the<br class="d-none d-lg-inline"/> <b>perfect website?</b></div>
                  <div class="lead font-weight-normal mb-4 text-600">We'll set you up and running in <b>4 steps</b></div>
                  <button class="o_survey_show btn btn-primary btn-lg px-4 py-2" t-on-click="goToDescription()">Let's do it</button>
              </div>
          </div>
          <SkipButton/>
        </div>`;

        class WelcomeScreen extends Component {
          static template = WelcomeScreenTemplate
          static components ={SkipButton};
          dispatch = useDispatch();

          goToDescription() {
            this.env.router.navigate({to: 'SURVEY_DESCRIPTION_SCREEN', params: this.env.router.currentParams});
          }
        }

        const DescriptionScreenTemplate = xml`
        <div class="o_survey_screen h-100 d-flex flex-column o_description_screen">
          <div class="container-fluid pt-3 pb-2">
            <img class="ml-lg-5" style="height: 31px; width: 99px;" src="/website/static/src/img/odoo_logo.svg" title="Odoo Logo"/>
          </div>
          <div class="o_survey_screen_content d-flex h-100 flex-grow-1">
              <div class="container align-self-center">
                  <div class="o_survey_typing_text d-inline d-md-block mb-md-2 mb-lg-4 o_survey_show">
                      <span>I want </span>
                      <div t-attf-class="dropdown o_survey_type_dd d-inline-block {{description.selectedType ? 'o_step_completed' : 'o_step_todo show'}}">
                          <div class="w-100 px-2" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            <a class="d-flex align-items-center">
                              <i class="text-primary" t-if="description.selectedType"><t t-esc="getters.getSelectedType(description.selectedType).label" /></i>
                              <i class="fa fa-angle-down text-black-50 ml-auto pl-2" title="dropdown_angle_down" role="img"/>
                            </a>
                          </div>
                          <div t-attf-class="dropdown-menu w-100 border-0 shadow-lg {{description.selectedType ? 'o_step_completed' : 'o_step_todo show'}}" role="menu">
                            <t t-foreach="getters.getWebsiteTypes()" t-as="type" t-key="type.name">
                                <a t-att-title="type.name"
                                    t-att-data-id="type.id"
                                    t-on-click="selectWebsiteType"
                                    class="dropdown-item o_change_website_type">
                                    <t t-esc="type.label"/>
                                </a>
                            </t>
                          </div>
                      </div>
                      <span t-att-class="!description.selectedType ? 'o_survey_hide' : 'o_survey_show'"> for my</span>
                  </div>
                  <div t-attf-class="o_survey_typing_text d-inline d-md-block o_survey_industry mb-md-2 mb-lg-4 {{!description.selectedType ? 'o_survey_hide' : 'o_survey_show'}}">
                      <div class="o_survey_industry_wrapper position-relative d-inline">
                        <i t-attf-class="industry_selection d-inline d-md-inline-block rounded bg-100 px-2 px-md-3 mx-2 mx-md-0 {{description.selectedIndustry ? 'o_step_completed' : 'o_step_todo show'}}"
                           contenteditable="True" t-on-blur="blurIndustrySelection"
                           t-on-input="inputIndustrySelection"/>
                      </div>
                      <span> business</span>
                      <span t-att-class="!description.selectedIndustry ? 'o_survey_hide' : 'o_survey_show'">,</span>
                  </div>
                  <div t-attf-class="o_survey_typing_text d-inline d-md-block mb-md-2 mb-lg-4 {{!description.selectedIndustry ? 'o_survey_hide' : 'o_survey_show'}}">
                      <span>with the main objective to </span>
                      <div t-attf-class="dropdown d-inline-block o_survey_purpose_dd {{description.selectedPurpose ? 'o_step_completed' : 'o_step_todo'}}">
                          <div class="w-100 px-2" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            <a class="d-flex align-items-center">
                              <t t-if="description.selectedPurpose"><t t-esc="getters.getSelectedPurpose(description.selectedPurpose).label" /></t>
                              <i class="fa fa-angle-down text-black-50 ml-auto pl-2" title="dropdown_angle_down" role="img"/>
                            </a>
                          </div>
                          <div class="dropdown-menu w-100 border-0 shadow-lg" role="menu">
                            <t t-foreach="getters.getWebsitePurpose()" t-as="type" t-key="type.name">
                                <a t-att-title="type.name"
                                    t-att-data-id="type.id"
                                    t-on-click="selectWebsitePurpose"
                                    class="dropdown-item o_change_website_purpose">
                                    <t t-esc="type.label"/>
                                </a>
                            </t>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
          <SkipButton/>
        </div>`;

        class DescriptionScreen extends Component {
          static template = DescriptionScreenTemplate;
          static components ={SkipButton};
          description = useStore((state) => state.description);
          logoValidation = useStore((state) => state.logoValidation);
          labelToCode = {}
          getters = useGetters();
          dispatch = useDispatch();

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
            let matches = this.description.descriptionData.industries.filter((val) => {
              return val.label.startsWith(lcTerm);
            });
            let results = matches.slice(0, limit);
            this.labelToCode = {};
            let labels = results.map((val) => val.label);
            if (labels.length < limit) {
              let relaxedMatches = this.description.descriptionData.industries.filter((val) => {
                return val.label.includes(lcTerm) && !labels.includes(val.label);
              });
              relaxedMatches = relaxedMatches.slice(0, limit - labels.length);
              results = results.concat(relaxedMatches);
              labels = results.map((val) => val.label);
            }
            results.forEach((r) => {
              this.labelToCode[r.label] = r.code;
            });
            response(labels);
          }

          selectIndustry(_, ui) {
            this.dispatch('selectIndustry', this.labelToCode[ui.item.label]);
            this.checkDescriptionCompletion();
          }

          blurIndustrySelection(ev) {
            const label = this.labelToCode[ev.target.outerText];
            this.dispatch('selectIndustry', label);
            if (label === undefined) {
              $('.industry_selection').text('');
            } else {
              this.checkDescriptionCompletion();
            }
          }

          inputIndustrySelection(ev) {
            this.dispatch('selectIndustry', this.labelToCode[ev.target.outerText]);
          }

          selectWebsiteType(ev) {
            const id = $(ev.target).data('id');
            this.dispatch('selectWebsiteType', id);
            setTimeout(function() {
              $('.industry_selection').get(0).focus();
            });
            this.checkDescriptionCompletion();
          }

          selectWebsitePurpose(ev) {
            const id = $(ev.target).data('id');
            this.dispatch('selectWebsitePurpose', id);
            this.checkDescriptionCompletion();
          }

          checkDescriptionCompletion() {
            if (this.description.selectedType && this.description.selectedPurpose && this.description.selectedIndustry) {
              if (this.logoValidation.logo !== false) {
                this.env.router.navigate({to: 'SURVEY_LOGO_VALIDATION_SCREEN', params: this.env.router.currentParams});
              } else {
                this.env.router.navigate({to: 'SURVEY_PALETTE_SELECTION_SCREEN', params: this.env.router.currentParams});
              }
            }
          }
        }

        const LogoValidationScreenTemplate = xml`
        <div class="o_survey_screen h-100 d-flex flex-column o_logo_validation_screen">
          <div class="container-fluid pt-3 pb-2">
            <img class="ml-lg-5" style="height: 31px; width: 99px;" src="/website/static/src/img/odoo_logo.svg" title="Odoo Logo"/>
          </div>
          <div class="o_survey_screen_content d-flex flex-grow-1 h-100">
            <div class="container d-flex flex-column align-items-center justify-content-center">
              <div class="o_survey_typing_text text-center mb-3">Is this your logo?</div>
              <div class="d-flex flex-column justify-content-center mx-auto">
                <div class="o_survey_logo_wrapper border rounded d-flex">
                  <img class="website_logo " t-attf-src="{{logoValidation.logo}}"/>
                </div>
                <div class="border-top mt-4 pt-3">
                    <button class="btn btn-lg btn-success px-5 mr-3" t-on-click="validateLogo(true)">Yes</button>
                    <button class="btn btn-lg btn-light" t-on-click="validateLogo(false)">No</button>
                </div>
              </div>
            </div>
          </div>
          <SkipButton/>
        </div>
        `;

        class LogoValidationScreen extends Component {
          static template = LogoValidationScreenTemplate;
          static components ={SkipButton};
          logoValidation = useStore((state) => state.logoValidation);
          dispatch = useDispatch();

          mounted() {
            if (this.logoValidation.logo === false) {
              this.env.router.navigate({to: 'SURVEY_PALETTE_SELECTION_SCREEN', params: this.env.router.currentParams});
            }
          }

          async validateLogo(isValid) {
            this.dispatch('validateLogo', isValid);
            let color1 = false;
            let color2 = false;
            if (isValid) {
              let img = this.logoValidation.logo.split(',', 2)[1];
              const colors = await rpc.query({
                model: 'base.document.layout',
                method: 'extract_image_primary_secondary_colors',
                args: [img]
              });
              color1 = colors[0];
              color2 = colors[1];
            }
            this.dispatch('setRecommendedPalette', color1, color2);
            this.env.router.navigate({to: 'SURVEY_PALETTE_SELECTION_SCREEN', params: this.env.router.currentParams});
          }
        }

        const PaletteSelectionScreenTemplate = xml`
        <div class="o_survey_screen h-100 d-flex flex-column o_palette_selection_screen">
          <div class="container-fluid pt-3 pb-2">
            <img class="ml-lg-5" style="height: 31px; width: 99px;" src="/website/static/src/img/odoo_logo.svg" title="Odoo Logo"/>
          </div>
          <div class="o_survey_screen_content container palette_selection d-flex flex-grow-1 h-100">
            <div class="d-flex flex-column flex-lg-row w-100 h-100 h-lg-auto align-self-md-center o_survey_show">
              <div class="w-100 w-lg-25 order-lg-3 my-4 my-md-0 d-flex flex-column">
                <div class="h4 text-center"><b>Detect</b> from Logo</div>
                <a href="#" t-on-click="uploadLogo" class="o_survey_logo_upload btn-link rounded bg-100 py-3 d-flex flex-grow-1 justify-content-center align-items-center text-decoration-none">
                  <input type="file" class="logo_selection_input" t-on-change="changeLogo" style="display:none" name="logo_selection" accept="image/*"/>
                  <div>
                    <i class="fa fa-cloud-upload fa-6x"></i>
                    <div class="text-center">Upload</div>
                  </div>
                </a>
              </div>
              <div class="position-relative d-flex justify-content-center order-lg-2 w-100 w-lg-0 py-3 py-lg-0 px-lg-5 mb-4 mb-lg-0">
                <div class="border-top w-100"></div>
                <b class="palette_selection_or bg-white text-muted w-lg-100 text-center px-3 py-lg-3">OR</b>
                <div class="border-left d-none d-lg-inline h-100 mx-auto w-0"></div>
              </div>
              <div class="w-100 w-lg-auto flex-grow-1 o_survey_show_fast">
                <div class="h4 text-center"><b>Choose</b> Your Brand Color</div>
                <div class="d-flex flex-wrap align-items-end">
                  <t t-foreach="getters.getPalettes()" t-as="row" t-key="row_index">
                    <t t-foreach="row" t-as="palette" t-key="palette_index">
                      <div t-if="palette.type != 'empty'" class="w-50 w-md-25 px-2 pt-3">
                        <h6 t-if="palette.type == 'recommended'" class="text-center text-success d-block badge mb-0 mt-n2">Recommended</h6>
                        <div t-attf-class="palette_card rounded-pill overflow-hidden d-flex" t-on-click="selectPalette(palette.id)" t-attf-style="background-color: {{palette.color3}}">
                          <div class="color_sample w-100 first" t-attf-style="background-color: {{palette.color1}}"/>
                          <div class="color_sample w-100 second" t-attf-style="background-color: {{palette.color2}}"/>
                          <div class="color_sample w-100 third" t-attf-style="background-color: {{palette.color3}}"/>
                        </div>
                      </div>
                    </t>
                  </t>
                </div>
              </div>
            </div>
          </div>
          <SkipButton/>
        </div>
        `;

        class PaletteSelectionScreen extends Component {
          static template = PaletteSelectionScreenTemplate;
          static components ={SkipButton};
          getters = useGetters();
          dispatch = useDispatch();

          uploadLogo() {
            $('.logo_selection_input').click();
          }

          changeLogo() {
            const logoSelectInput = $('.logo_selection_input');
            const self = this;
            if (logoSelectInput[0].files.length === 1) {
                const file = logoSelectInput[0].files[0];
                utils.getDataURLFromFile(file).then(function (data) {
                    self.dispatch('changeLogo', data);
                    self.env.router.navigate({to: 'SURVEY_LOGO_VALIDATION_SCREEN', params: self.env.router.currentParams});
                });
            }
          }

          selectPalette(paletteId) {
            this.dispatch('selectPalette', paletteId);
            this.env.router.navigate({to: 'SURVEY_FEATURES_SELECTION_SCREEN', params: this.env.router.currentParams});
          }
        }

        const FeatureSelectionScreenTemplate = xml`
        <div class="o_survey_screen h-100 d-flex flex-column o_feature_selection_screen">
          <div class="container-fluid pt-3 pb-2">
            <img class="ml-lg-5" style="height: 31px; width: 99px;" src="/website/static/src/img/odoo_logo.svg" title="Odoo Logo"/>
          </div>
          <div class="o_survey_screen_content container d-flex h-100 align-items-lg-center">
            <div class="my-4">
              <div class="o_survey_typing_text o_survey_show_fast p-2">Add <b class="text-info">Pages</b> &amp; <b class="text-warning">Features</b></div>
              <h6 class="px-2">You can always change this later ( -- temporary copy --)</h6>
              <div class="page_feature_selection o_survey_show">
                <div class="w-100 page_feature_selection container d-flex flex-wrap py2 py-lg-3">
                  <t t-foreach="getters.getFeatures()" t-as="row" t-key="row_index">
                    <t t-foreach="row" t-as="feature" t-key="feature_index">
                      <div class="p-2 w-100 w-md-50 w-lg-25" t-if="feature.type != 'empty'">
                        <div t-attf-class="card h-100 {{feature.selected ? 'border-success' : ''}}" t-on-click="dispatch('toggleFeature', feature.id)">
                          <div class="card-body py-2">
                            <i t-attf-class="o_survey_feature_status fa {{feature.selected ? 'fa-check-circle text-success' : 'fa-circle-o text-300'}}" />
                            <h5 class="card-title d-flex align-items-center">
                              <i t-attf-class="mr-2 small fa {{feature.icon}} {{feature.type == 'page' ? 'text-info' : 'text-warning' }}"/>
                              <t t-esc="feature.title"/>
                            </h5>
                            <p class="card-text small text-muted" t-esc="feature.description"/>
                          </div>
                        </div>
                      </div>
                    </t>
                  </t>
                </div>
              </div>
              <div class="text-right">
                <button class="btn btn-primary btn-lg ml-3" t-on-click="buildWebsite()">Build my website</button>
              </div>

            </div>
          </div>
          <SkipButton/>
        </div>
        `;


        class FeaturesSelectionScreen extends Component {
          static template = FeatureSelectionScreenTemplate;
          static components ={SkipButton};
          featureSelection = useStore((state) => state.featureSelection);
          description = useStore((state) => state.description);
          getters = useGetters();
          dispatch = useDispatch();

          async buildWebsite() {
            const industryCode = this.description.selectedIndustry;
            if (!industryCode) {
              this.env.router.navigate({to: 'SURVEY_DESCRIPTION_SCREEN', params: this.env.router.currentParams});
              return;
            }
            const params = {
              description: {
                industryCode: industryCode
              }
            };
            const res = await rpc.query({
              model: 'website',
              method: 'get_recommended_themes',
              args: [[parseInt(this.env.router.currentParams.wid)], params],
            });
            this.dispatch('updateRecommendedThemes', res.themes);
            this.env.router.navigate({to: 'SURVEY_THEME_SELECTION_SCREEN', params: this.env.router.currentParams});
          }
        }

        const ThemeSelectionScreenTemplate = xml`
        <div class="o_survey_screen h-100 d-flex flex-column o_theme_selection_screen">
          <div class="container-fluid pt-3 pb-2">
            <img class="ml-lg-5" style="height: 31px; width: 99px;" src="/website/static/src/img/odoo_logo.svg" title="Odoo Logo"/>
          </div>

          <div class="o_survey_screen_content d-flex flex-column justify-content-lg-around h-100">
            <div class="o_survey_typing_text text-center mt-4">Choose your favorite <b>Style</b></div>
            <div class="container">
              <div class="row py-4">
                <div class="col-12 col-lg-4 d-flex align-items-end mb-4 mb-lg-0">
                  <div class="theme_preview bg-600 rounded position-relative w-100 small">
                    <div class="theme_screenshot rounded theme_recommendation_2" t-attf-style="background-image: url('{{themeSelection.secondTheme.url || 'https://source.unsplash.com/random/400x800'  }}');"/>
                    <div class="button_area rounded d-flex align-items-center justify-content-center">
                      <button class="btn btn-primary px-5" href="#" t-on-click="chooseTheme(themeSelection.secondTheme.id)">Use this theme</button>
                    </div>
                  </div>
                </div>
                <div class="col-12 col-lg-4 d-flex align-items-end mb-4 mb-lg-0">
                  <div class="theme_preview bg-600 rounded position-relative w-100">
                    <div class="theme_screenshot rounded theme_recommendation_1" t-attf-style="background-image: url('{{themeSelection.firstTheme.url || 'https://source.unsplash.com/random/400x800'  }}');"/>
                    <div class="button_area rounded d-flex align-items-center justify-content-center">
                      <button class="btn btn-primary px-5" href="#" t-on-click="chooseTheme(themeSelection.firstTheme.id)">Use this theme</button>
                    </div>
                  </div>
                </div>
                <div class="col-12 col-lg-4 d-flex align-items-end">
                  <div class="theme_preview bg-600 rounded position-relative w-100 small">
                    <div class="theme_screenshot rounded theme_recommendation_3" t-attf-style="background-image: url('{{themeSelection.thirdTheme.url || 'https://source.unsplash.com/random/400x800'  }}');"/>
                    <div class="button_area rounded d-flex align-items-center justify-content-center">
                      <button class="btn btn-primary px-5" href="#" t-on-click="chooseTheme(themeSelection.thirdTheme.id)">Use this theme</button>
                    </div>
                  </div>
                </div>
              </div>
            </div> 
          </div>
        </div>
        `;


        class ThemeSelectionScreen extends Component {
          static template = ThemeSelectionScreenTemplate;
          logoValidation = useStore((state) => state.logoValidation);
          themeSelection = useStore((state) => state.themeSelection);
          featureSelection = useStore((state) => state.featureSelection);
          description = useStore((state) => state.description);
          loader = $(qweb.renderToString('website.ThemePreview.Loader'))[0];

          chooseTheme(themeId) {
            if (themeId !== undefined) {
              this.addLoader();
              const selectedFeatures = Object.values(this.featureSelection.features).filter((feature) => feature.selected).map((feature) => feature.id);
              const logo = this.logoValidation.isLogoValid ? this.logoValidation.logo : false;
              const data = {
                selected_feautures: selectedFeatures,
                logo: logo,
                industry: this.description.selectedIndustry,
              };
              rpc.query({
                model: 'ir.module.module',
                method: 'button_choose_theme',
                args: [[themeId], data],
              }).then((resp) => {
                window.location = resp.url;
                this.removeLoader();
              });
            }
          }

          addLoader() {
            $('body').append(this.loader);
          }

          removeLoader() {
              this.loader.remove();
          }
        }

        const AppTemplate = xml/* xml */`
          <div class="o_survey_container">
            <RouteComponent />
          </div>
        `;

        class App extends Component {
          static template = AppTemplate;
          static components ={RouteComponent};
        }

        const ROUTES = [
          {name: "SURVEY_WELCOME_SCREEN", path: "/website/survey/1/{{wid}}", component: WelcomeScreen},
          {name: "SURVEY_DESCRIPTION_SCREEN", path: "/website/survey/2/{{wid}}", component: DescriptionScreen},
          {name: "SURVEY_LOGO_VALIDATION_SCREEN", path: "/website/survey/3/{{wid}}", component: LogoValidationScreen},
          {name: "SURVEY_PALETTE_SELECTION_SCREEN", path: "/website/survey/4/{{wid}}", component: PaletteSelectionScreen},
          {name: "SURVEY_FEATURES_SELECTION_SCREEN", path: "/website/survey/5/{{wid}}", component: FeaturesSelectionScreen},
          {name: "SURVEY_THEME_SELECTION_SCREEN", path: "/website/survey/6/{{wid}}", component: ThemeSelectionScreen},
        ];

        const actions = {
          selectWebsiteType({state}, id) {
            Object.values(state.featureSelection.features).forEach((feature) => {
              if (feature.websiteType === state.description.descriptionData.websiteTypes[id].name) {
                feature.selected = true;
              } else {
                feature.selected = false;
              }
            });
            state.description.selectedType = id;
          },
          selectWebsitePurpose({state}, id) {
            state.description.selectedPurpose = id;
          },
          selectIndustry({state}, code) {
            state.description.selectedIndustry = code;
          },
          validateLogo({state}, isValid) {
            state.logoValidation.isLogoValid = isValid;
          },
          changeLogo({state}, data) {
            state.logoValidation.logo = data;
          },
          selectPalette({state}, paletteId) {
            if (paletteId === 0) {
              state.paletteSelection.selectedPalette = state.paletteSelection.recommendedPalette;
            } else {
              state.paletteSelection.selectedPalette = state.paletteSelection.paletteData.palettes[paletteId];
            }
          },
          toggleFeature({state}, featureId) {
            const isSelected = state.featureSelection.features[featureId].selected;
            state.featureSelection.features[featureId].selected = !isSelected;
          },
          setRecommendedPalette({state}, color1, color2) {
            let palette = undefined;
            if (color1 && color2) {
              palette = {id: 0, color1: color1, color2: color2, color3: '#FFFFFF', type: 'recommended'};
            } 
            state.paletteSelection.recommendedPalette = palette;
          },
          updateRecommendedThemes({state}, themes) {
            if (themes[0]) {
              state.themeSelection.firstTheme.name = themes[0].name;
              state.themeSelection.firstTheme.url = themes[0].url;
              state.themeSelection.firstTheme.id = themes[0].id;
            }
            if (themes[1]) {
              state.themeSelection.secondTheme.name = themes[1].name;
              state.themeSelection.secondTheme.url = themes[1].url;
              state.themeSelection.secondTheme.id = themes[1].id;
            }
            if (themes[2]) {
              state.themeSelection.thirdTheme.name = themes[2].name;
              state.themeSelection.thirdTheme.url = themes[2].url;
              state.themeSelection.thirdTheme.id = themes[2].id;
            }
          }
        };

        const getters = {
          getWebsiteTypes({state}) {
            return Object.values(state.description.descriptionData.websiteTypes).map(x => x);
          },

          getSelectedType({state}, id) {
            return id ? state.description.descriptionData.websiteTypes[id] : undefined;
          },

          getWebsitePurpose({state}) {
            return Object.values(state.description.descriptionData.websitePurposes).map(x => x);
          },

          getSelectedPurpose({state}, id) {
            return id ? state.description.descriptionData.websitePurposes[id] : undefined;
          },

          getFeatures({state}) {
            const columnNumber = 3;
            const featureRows = [];

            const features = Object.values(state.featureSelection.features);
            let currentRow = [];
            for (let i = 0; i < features.length; i += 1) {
              currentRow.push(features[i]);
              if (currentRow.length === columnNumber) {
                featureRows.push(currentRow);
                currentRow = [];
              }
            }
            if (currentRow.length > 0) {
              const rowLength = currentRow.length;
              for (let i = 0; i < (columnNumber - rowLength); i += 1) {
                currentRow.push({
                  type: 'empty'
                });
              }
              featureRows.push(currentRow);
            }
            return featureRows;
          },

          getPalettes({state}) {
            const columnNumber = 4;
            const paletteRows = [];
            const recommendedPalette = state.paletteSelection.recommendedPalette;
            let palettes = recommendedPalette ? [recommendedPalette] : [];
            palettes = palettes.concat(Object.values(state.paletteSelection.paletteData.palettes));
            let currentRow = [];
            for (let i = 0; i < palettes.length; i += 1) {
              currentRow.push(palettes[i]);
              if (currentRow.length === columnNumber) {
                paletteRows.push(currentRow);
                currentRow = [];
              }
            }
            if (currentRow.length > 0) {
              const rowLength = currentRow.length;
              for (let i = 0; i < (columnNumber - rowLength); i += 1) {
                currentRow.push({
                  type: 'empty'
                });
              }
              paletteRows.push(currentRow);
            }
            return paletteRows;
          },
        };

        async function getInitialState(wid) {
          return {
            description: {
              selectedType: undefined,
              selectedPurpose: undefined,
              selectedIndustry: undefined,
              descriptionData: descriptionData
            },
            logoValidation: {
              logo: await rpc.query({
                model: 'website',
                method: 'get_survey_logo',
                args: [[parseInt(wid)]],
              }),
              isLogoValid: false,
            },
            paletteSelection: {
              selectedPalette: undefined,
              recommendedPalette: undefined,
              paletteData: paletteData
            },
            featureSelection: {
              features: await rpc.query({
                model: 'website.survey.feature',
                method: 'search_read',
                fields: ['title', 'description', 'type', 'website_type', 'icon'],
              }).then(function (results) {
                const features = {};
                for (let i = 0; i < results.length; i += 1) {
                  features[results[i].id] = {
                    id: results[i].id,
                    title: results[i].title,
                    description: results[i].description,
                    type: results[i].type,
                    websiteType: results[i].website_type,
                    icon: results[i].icon,
                    selected: false
                  };
                }
                return features;
              }).catch(function (_) {
                  return {};
              }),
            },
            themeSelection: {
              firstTheme: {
                name: undefined,
                url: undefined,
                id: undefined,
              },
              secondTheme: {
                name: undefined,
                url: undefined,
                id: undefined,
              },
              thirdTheme: {
                name: undefined,
                url: undefined,
                id: undefined,
              }
            }
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
          return env;
        }

        const env = await makeEnvironment();
        mount(App, {target: document.body, env});
    });
  }

  whenReady(setup);

})();
