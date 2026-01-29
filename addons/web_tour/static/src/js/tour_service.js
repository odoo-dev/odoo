import { Component, markup, whenReady, validate } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { loadBundle } from "@web/core/assets";
import { pointerState } from "@web_tour/js/tour_pointer/tour_pointer";
import { tourState } from "@web_tour/js/tour_state";
import {
    tourRecorderState,
    TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY,
} from "@web_tour/js/tour_recorder/tour_recorder_state";
import { redirect } from "@web/core/utils/urls";
import { _t } from "@web/core/l10n/translation";

const whitelistTours = {
    account_reports_sections: false,
    ai_livechat_snippet_tour: false,
    passkeys_tour_registration: true,
    totp_tour_setup: true,
    totp_login_disabled: true,
    "mail/static/tests/tours/mail_html_composer_test_tour.js": true,
    databases_tour: true,
    version_timeline_auto_save_tour: false,
    hr_contract_salary_employee_flow_tour: true,
    hr_holidays_tour: true,
    knowledge_article_commands_tour: true,
    test_add_money_button_with_different_decimal_separator: false,
    test_cash_in_out: false,
    PaymentScreenTour: false,
    test_pos_large_amount_confirmation_dialog: false,
    test_pricelists_in_pos: false,
    PaymentScreenTotalDueWithOverPayment: false,
    test_tracking_number_closing_session: false,
    LotTour: false,
    refund_multiple_products_amounts_compliance: false,
    test_reuse_empty_floating_order: false,
    test_integration_dynamic_always_variant_price: false,
    test_point_of_sale_custom_tax_with_extra_product_field: true,
    PosOrderCreationTourPdis: false,
    PosHrTour: true,
    CashierCannotClose: true,
    PosLoyaltyLoyaltyProgram1: true,
    MultipleGiftWalletProgramsTour: true,
    pos_restaurant_sync: false,
    test_preset_delivery_restaurant: true,
    test_open_register_with_preset_takeaway: true,
    test_preset_timing_restaurant: true,
    test_order_preparation_preparation_printer: true,
    project_task_templates_tour: false,
    test_product_replenishment: false,
    test_barcode_batch_scan_lots: false,
    hr_contract_salary_tour: false,
    mail_activity_view: true,
    test_custom_snippet: false,
    test_image_upload_progress: false,
    test_image_upload_progress_unsplash: false,
    test_image_link: false,
    test_website_page_manager: true,
    snippet_background_video: false,
    translation_single_language_en_user_fr_site: false,
    translation_single_language_fr_user_fr_site: false,
    translation_single_language_fr_user_en_site: false,
    "web_studio.test_report_edition_binary_field": false,
    website_replace_grid_image: true,
    scroll_to_new_grid_item: false,
    snippet_empty_parent_autoremove: false,
    default_shape_gets_palette_colors: false,
    snippet_countdown: false,
    snippet_popup_add_remove: true,
    snippet_image_gallery_remove: false,
    test_parallax: false,
    snippet_images_wall: false,
    custom_popup_snippet: true,
    snippet_image_gallery_thumbnail_update: false,
    snippet_tabs: false,
    translate_text_options: false,
    homepage: false,
    conditional_visibility_1: false,
    conditional_visibility_2: false,
    conditional_visibility_3: false,
    conditional_visibility_4: false,
    snippet_background_edition: false,
    carousel_content_removal: false,
    snippet_editor_panel_options: false,
    website_media_dialog_icons: true,
    website_click_tour: false,
    website_text_edition: false,
    text_animations: false,
    website_background_colorpicker: false,
    anchor_behaviour_on_accordion_same_tab: false,
    anchor_behaviour_on_accordion_new_tab: false,
    drop_404_ir_attachment_url: false,
    website_popup_visibility_option: false,
    website_powerbox_snippet: false,
    website_powerbox_keyword: false,
    snippet_carousel: false,
    snippet_visibility_option: false,
    website_update_column_count: false,
    edit_megamenu_visibility: true,
    website_media_dialog_insert_media: false,
    website_no_dirty_lazy_image: false,
    website_text_font_size: false,
    text_highlights: false,
    website_form_duplicate_field_ids: false,
    website_form_editable_content: false,
    website_crm_tour: false,
    website_livechat_chatbot_flow_tour: false,
    add_and_remove_main_product_image_no_variant: true,
    "website_sale.snippet_products": false,
    "website_sale.products_snippet_recently_viewed": false,
    "website_sale.category_page_and_products_snippet_edition": false,
    course_publisher_standard: true,
    "l10n_mx_edi_pos.test_mx_pos_invoice_order_and_refund": true,
    account_tour: true,
};

class OnboardingItem extends Component {
    static components = { DropdownItem };
    static template = "web_tour.OnboardingItem";
    static props = {
        toursEnabled: { type: Boolean },
        toggleItem: { type: Function },
    };
    setup() {}
}

const stepSchema = {
    id: { type: [String], optional: true },
    content: { type: [String, Object], optional: true }, //allow object(_t && markup)
    debugHelp: { type: String, optional: true },
    isActive: { type: Array, element: String, optional: true },
    run: { type: [String, Function, Boolean], optional: true },
    timeout: {
        optional: true,
        validate(value) {
            return value >= 0 && value <= 60000;
        },
    },
    tooltipPosition: {
        optional: true,
        validate(value) {
            return ["top", "bottom", "left", "right"].includes(value);
        },
    },
    trigger: { type: String },
    expectUnloadPage: { type: Boolean, optional: true },
};

const stepSchemaDebug = {
    ...stepSchema,
    pause: { type: Boolean, optional: true },
    break: { type: Boolean, optional: true },
    observe: { type: Boolean, optional: true },
};

const tourSchema = {
    name: { type: String, optional: true },
    steps: Function,
    url: { type: String, optional: true },
    wait_for: { type: [Function, Object], optional: true },
    undeterministicTour_doNotCopy: { type: Boolean, optional: true },
};

const tourRegistry = registry.category("web_tour.tours");
tourRegistry.addValidation(tourSchema);

export class TourService {
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {import("services").ServiceFactories} services
     */
    constructor(env, services) {
        this.env = env;
        this.orm = services["orm"];
        this.effect = services["effect"];
        this.overlay = services["overlay"];
        this.toursEnabled = session?.tour_enabled;
        this.removePointer = () => {};
        this.removeTourRecorder = () => {};
        this.addOnboardingItemInDebugMenu();

        if (window.frameElement) {
            return;
        }

        const paramsTourName = new URLSearchParams(browser.location.search).get("tour");
        if (paramsTourName) {
            this.startTour(paramsTourName, { mode: "manual", fromDB: true });
        }

        if (tourState.getCurrentTour()) {
            if (tourState.getCurrentConfig().mode === "auto" || this.toursEnabled) {
                this.resumeTour();
            } else {
                tourState.clear();
            }
        } else if (session.current_tour) {
            this.startTour(session.current_tour.name, {
                mode: "manual",
                redirect: false,
                rainbowManMessage: session.current_tour.rainbowManMessage,
            });
        }

        if (
            browser.localStorage.getItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY) &&
            !session.is_public
        ) {
            this.addTourRecorderToOverlay();
        }
    }

    addOnboardingItemInDebugMenu() {
        const debugMenuRegistry = registry.category("debug").category("default");
        debugMenuRegistry.add("onboardingItem", () => ({
            type: "component",
            Component: OnboardingItem,
            props: {
                toursEnabled: this.toursEnabled || false,
                toggleItem: async () => {
                    tourState.clear();
                    this.toursEnabled = await this.orm.call("res.users", "switch_tour_enabled", [
                        !this.toursEnabled,
                    ]);
                    browser.location.reload();
                },
            },
            sequence: 500,
            section: "testing",
        }));
    }

    /**
     * Add tour recorder component in overlay container.
     */
    async addTourRecorderToOverlay() {
        if (!odoo.loader.modules.get("@web_tour/js/tour_recorder/tour_recorder")) {
            await loadBundle("web_tour.recorder");
        }
        const { TourRecorder } = odoo.loader.modules.get(
            "@web_tour/js/tour_recorder/tour_recorder"
        );
        const remove = this.overlay.add(
            TourRecorder,
            {
                onClose: () => {
                    remove();
                    browser.localStorage.removeItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY);
                    tourRecorderState.clear();
                },
            },
            { sequence: 99999 }
        );

        this.removeTourRecorder = () => {
            remove();
            browser.localStorage.removeItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY);
            tourRecorderState.clear();
        };
    }

    /**
     * @param {string} name The name of the tour
     */
    async getTour(name, options) {
        let tour = tourRegistry.get(name, null);
        if (options.mode === "manual" && options.fromDB) {
            tour = await this.orm.call("web_tour.tour", "get_tour_json_by_name", [name]);
            if (!tour) {
                throw new Error(`Tour '${name}' is not found in the database.`);
            }

            if (!tour.steps.length && tourRegistry.contains(tour.name)) {
                tour.steps = tourRegistry.get(tour.name).steps;
            }
        }
        if (!tour) {
            return undefined;
        }
        const url = options.fromDB ? options.url : tour.url;
        return {
            ...tour,
            name,
            url,
            steps:
                typeof tour.steps === "function"
                    ? tour.steps()
                    : Array.isArray(tour.steps)
                    ? tour.steps
                    : [],
            waitFor: tour.wait_for || Promise.resolve(),
        };
    }

    /**
     * Wait the tour is ready (only for automatic tour)
     * @param {string} name The name of the tour
     */
    async isTourReady(name) {
        if (!tourRegistry.contains(name)) {
            return false;
        }
        const tour = tourRegistry.get(name);
        await (tour.wait_for || Promise.resolve());
        return true;
    }

    async resumeTour() {
        const tourName = tourState.getCurrentTour();
        const tourConfig = tourState.getCurrentConfig();
        const tour = await this.getTour(tourName, tourConfig);
        if (!tour) {
            return;
        }

        tour.steps.forEach((step) => this.validateStep(step));

        if (tourConfig.mode === "auto") {
            if (!odoo.loader.modules.get("@web_tour/js/tour_automatic/tour_automatic")) {
                await loadBundle("web_tour.automatic", { css: false });
            }
            const { TourAutomatic } = odoo.loader.modules.get(
                "@web_tour/js/tour_automatic/tour_automatic"
            );
            new TourAutomatic(tour).start();
        } else {
            await loadBundle("web_tour.interactive");
            const { TourPointer } = odoo.loader.modules.get(
                "@web_tour/js/tour_pointer/tour_pointer"
            );
            this.removePointer = this.overlay.add(
                TourPointer,
                {
                    pointerState,
                    bounce: !(tourConfig.mode === "auto" && tourConfig.keepWatchBrowser),
                },
                {
                    sequence: 1100, // sequence based on bootstrap z-index values.
                }
            );
            const { TourInteractive } = odoo.loader.modules.get(
                "@web_tour/js/tour_interactive/tour_interactive"
            );
            new TourInteractive(tour).start(this.env, async () => {
                this.removePointer();
                tourState.clear();
                browser.console.log("tour succeeded");
                let message = tourConfig.rainbowManMessage || tour.rainbowManMessage;
                if (message) {
                    message = window.DOMPurify.sanitize(tourConfig.rainbowManMessage);
                    this.effect.add({
                        type: "rainbow_man",
                        message: markup(message),
                    });
                }

                const nextTour = await this.orm.call("web_tour.tour", "consume", [tour.name]);
                if (nextTour) {
                    this.startTour(nextTour.name, {
                        mode: "manual",
                        redirect: false,
                        rainbowManMessage: nextTour.rainbowManMessage,
                    });
                }
            });
        }
    }

    /**
     * Starts manual or automatic tour.
     * This retrieves a tour from the internal registry or from the database
     * if `options.fromDB` is set.
     *
     * @param {string} name - The name of the tour to start.
     * @param {Object} [options={}] - Options to customize the tour start.
     * @param {boolean} [options.fromDB=false] - Whether the tour should be loaded from the database.
     * @param {string} [options.url] - URL to start the tour.
     * @param {"auto"|"manual"} [options.mode="auto"] - Tour start mode ("auto" or "manual").
     * @param {number} [options.observeDelay=3000] - Delay to check for indeterminisms in steps.
     * @param {number} [options.stepDelay=0] - Delay between each tour step.
     * @param {boolean} [options.keepWatchBrowser=false] - Whether to keep watching the browser continuously.
     * @param {number} [options.showPointerDuration=0] - Duration to show the pointer on each step.
     * @param {boolean} [options.debug=false] - Enables debug mode for the tour.
     * @param {boolean} [options.redirect=true] - Whether to redirect to `tour.url` if necessary.
     */
    async startTour(name, options = {}) {
        this.removePointer();
        this.removeTourRecorder();
        const tour = await this.getTour(name, options);
        if (!tour) {
            return;
        }
        if (!session.is_public && !this.toursEnabled && options.mode === "manual") {
            this.toursEnabled = await this.orm.call("res.users", "switch_tour_enabled", [
                !this.toursEnabled,
            ]);
        }

        let allowDelayToRemove = false;
        if (tour.undeterministicTour_doNotCopy && !whitelistTours[name]) {
            allowDelayToRemove = true;
        }

        const tourConfig = {
            stepDelay: 0,
            keepWatchBrowser: false,
            mode: "auto",
            showPointerDuration: 0,
            debug: false,
            redirect: true,
            observeDelay: 3000,
            allowDelayToRemove,
            ...options,
        };

        tourState.setCurrentConfig(tourConfig);
        tourState.setCurrentTour(name);
        tourState.setCurrentIndex(0);

        if (tour.url && tourConfig.startUrl != tour.url && tourConfig.redirect) {
            redirect(tour.url);
        } else {
            await this.resumeTour();
        }
    }

    async startTourRecorder() {
        if (!browser.localStorage.getItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY)) {
            await this.addTourRecorderToOverlay();
        }
        browser.localStorage.setItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY, "1");
    }

    /**
     * Validate a step according to {@link stepSchema}.
     * @param {Object} step - The step object to validate.
     */
    validateStep(step) {
        const tourConfig = tourState.getCurrentConfig();
        try {
            validate(step, tourConfig.debug ? stepSchemaDebug : stepSchema);
        } catch (error) {
            console.error(
                `Error in schema for TourStep ${JSON.stringify(step, null, 4)}\n${error.message}`
            );
        }
    }
}

registry.category("services").add("tour_service", {
    // localization dependency to make sure translations used by tours are loaded
    dependencies: ["orm", "effect", "overlay", "localization"],
    async start(env, services) {
        await whenReady();
        const service = new TourService(env, services);
        odoo.startTour = service.startTour.bind(service);
        odoo.isTourReady = service.isTourReady.bind(service);
        return service;
    },
});

registry.category("command_provider").add("tour_recorder", {
    provide: (env, options) => {
        const result = [];
        if (options.searchValue.toLowerCase() === "record") {
            result.push({
                action() {
                    env.services["tour_service"].startTourRecorder();
                },
                name: _t("Enable the tour recorder"),
            });
        }
        return result;
    },
});
