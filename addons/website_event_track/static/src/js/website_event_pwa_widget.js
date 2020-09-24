odoo.define("website_event_track.website_event_pwa_widget", function (require) {
    "use strict";

    /*
     * The "deferredPrompt" Promise will resolve only if the "beforeinstallprompt" event
     * has been triggered. It allows to register this listener as soon as possible
     * to avoid missed-events (as the browser can trigger it very early in the page lifecycle).
     */
    var deferredPrompt = new Promise(function (resolve, reject) {
        if (!("serviceWorker" in navigator)) {
            return reject();
        }
        window.addEventListener("beforeinstallprompt", function (ev) {
            ev.preventDefault();
            resolve(ev);
        });
    });

    var config = require("web.config");
    var publicWidget = require("web.public.widget");
    var utils = require("web.utils");

    var PWAInstallBanner = publicWidget.Widget.extend({
        xmlDependencies: ["/website_event_track/static/src/xml/website_event_pwa.xml"],
        template: "pwa_install_banner",
        events: {
            "click .o_btn_install": "_onClickInstall",
            "click .o_btn_close": "_onClickClose",
        },

        /**
         * @private
         */
        _onClickClose: function () {
            this.trigger_up("prompt_close_bar");
        },

        /**
         * @private
         */
        _onClickInstall: function () {
            this.trigger_up("prompt_install");
        },
    });

    publicWidget.registry.WebsiteEventPWAWidget = publicWidget.Widget.extend({
        selector: "#wrapwrap.event",
        custom_events: {
            prompt_install: "_onPromptInstall",
            prompt_close_bar: "_onPromptCloseBar",
        },

        /**
         *
         * @override
         */
        start: function () {
            var self = this;
            return this._super.apply(this, arguments)
                .then(this._registerServiceWorker.bind(this))
                .then(function () {
                    // Don't wait for the prompt's Promise as it may never resolve.
                    deferredPrompt.then(self._showInstallBanner.bind(self)).catch(function () {
                        console.log("ServiceWorker not supported");
                    });
                })
                .then(this._prefetch.bind(this));
        },

        /**
         *
         * @override
         */
        destroy: function () {
            this._super.apply(this, arguments);
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Returns the website's language from the URL
         * 
         * Note: this method performs a matching against both the simple (eg. "en") and complete (eg. "en_US")
         *       language formatting in the url. This is required as the cookie always returns the complete
         *       form but the URL can use both, depending on the language (eg. "en_US" => "en" but "en_UK" => "en_UK").
         * @private
         * @return {String}
         */
        _getLangPrefix: function () {
            var lang = utils.get_cookie("frontend_lang");
            var path = window.location.pathname;
            var matches = path.match(new RegExp("^\/?(" + lang + "|" + lang.slice(0, 2) + ")\/"));
            if (lang && matches && matches[1]) {
                return "/" + matches[1];
            }
            return "";
        },

        /**
         * Returns the PWA's scope
         * @private
         * @returns {String}
         */
        _getScope: function () {
            return this._getLangPrefix() + "/event";
        },

        /**
         * @private
         */
        _hideInstallBanner: function () {
            this.installBanner ? this.installBanner.destroy() : undefined;
            $(".o_livechat_button").css("bottom", "0");
        },

        /**
         * Parse the current page for first-level children pages and ask the ServiceWorker
         * to already fetch them to populate the cache.
         * @private
         */
        _prefetch: function () {
            if (!("serviceWorker" in navigator)) {
                return;
            }
            var assetsUrls = Array.from(document.querySelectorAll('link[rel="stylesheet"], script[src]')).map(function (el) {
                return el.href || el.src;
            });
            navigator.serviceWorker.ready.then(function (registration) {
                registration.active.postMessage({
                    action: "prefetch-assets",
                    urls: assetsUrls,
                });
            });
            var currentPageUrl = window.location.href;
            var childrenPagesUrls = Array.from(document.querySelectorAll('a[href^="' + this._getScope() + '/"]')).map(function (el) {
                return el.href;
            });
            navigator.serviceWorker.ready.then(function (registration) {
                registration.active.postMessage({
                    action: "prefetch-pages",
                    urls: childrenPagesUrls.concat(currentPageUrl),
                });
            });
        },

        /**
         *
         * @private
         */
        _registerServiceWorker: function () {
            if (!("serviceWorker" in navigator)) {
                return;
            }
            var scope = this._getScope();
            return navigator.serviceWorker
                .register(scope + "/service-worker.js", { scope: scope })
                .then(function (registration) {
                    console.info("Registration successful, scope is:", registration.scope);
                })
                .catch(function (error) {
                    console.error("Service worker registration failed, error:", error);
                });
        },

        /**
         * @private
         */
        _showInstallBanner: function () {
            if (!config.device.isMobile) {
                return;
            }
            var self = this;
            this.installBanner = new PWAInstallBanner(this);
            this.installBanner.appendTo(this.$el).then(function () {
                // If Livechat available, It should be placed above the PWA banner.
                var height = self.$(".o_pwa_install_banner").outerHeight(true);
                $(".o_livechat_button").css("bottom", height + "px");
            });
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param ev {Event}
         */
        _onPromptCloseBar: function (ev) {
            ev.stopPropagation();
            this._hideInstallBanner();
        },
        /**
         * @private
         * @param ev {Event}
         */
        _onPromptInstall: function (ev) {
            ev.stopPropagation();
            this._hideInstallBanner();
            deferredPrompt.then(function (prompt) {
                    prompt.prompt();
                    prompt.userChoice.then(function (choiceResult) {
                        if (choiceResult.outcome === "accepted") {
                            console.log("User accepted the install prompt");
                        } else {
                            console.log("User dismissed the install prompt");
                        }
                    });
                })
                .catch(function () {
                    console.log("ServiceWorker not supported");
                });
        },
    });

    return {
        PWAInstallBanner: PWAInstallBanner,
        WebsiteEventPWAWidget: publicWidget.registry.WebsiteEventPWAWidget,
    };
});
