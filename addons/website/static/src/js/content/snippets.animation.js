/**
 * Provides a way to start JS code for snippets' initialization and animations.
 */

import { _t } from "@web/core/l10n/translation";
import { loadJS } from "@web/core/assets";
import { uniqueId } from "@web/core/utils/functions";
import { escape } from "@web/core/utils/strings";
import { debounce, throttleForAnimation } from "@web/core/utils/timing";
import Class from "@web/legacy/js/core/class";
import publicWidget from "@web/legacy/js/public/public_widget";
import { renderToElement } from "@web/core/utils/render";
import { hasTouch } from "@web/core/browser/feature_detection";
import { SIZES, utils as uiUtils } from "@web/core/ui/ui_service";
import { touching } from "@web/core/utils/ui";
import { ObservingCookieWidgetMixin } from "@website/snippets/observing_cookie_mixin";

// Initialize fallbacks for the use of requestAnimationFrame,
// cancelAnimationFrame and performance.now()
window.requestAnimationFrame = window.requestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.msRequestAnimationFrame
    || window.oRequestAnimationFrame;
window.cancelAnimationFrame = window.cancelAnimationFrame
    || window.webkitCancelAnimationFrame
    || window.mozCancelAnimationFrame
    || window.msCancelAnimationFrame
    || window.oCancelAnimationFrame;
if (!window.performance || !window.performance.now) {
    window.performance = {
        now: function () {
            return Date.now();
        }
    };
}

/**
 * Add the notion of edit mode to public widgets.
 */
publicWidget.Widget.include({
    /**
     * Indicates if the widget should not be instantiated in edit. The default
     * is true, indeed most (all?) defined widgets only want to initialize
     * events and states which should not be active in edit mode (this is
     * especially true for non-website widgets).
     *
     * @type {boolean}
     */
    disabledInEditableMode: true,
    /**
     * Acts as @see Widget.events except that the events are only binded if the
     * Widget instance is instanciated in edit mode. The property is not
     * considered if @see disabledInEditableMode is false.
     */
    edit_events: null,
    /**
     * Acts as @see Widget.events except that the events are only binded if the
     * Widget instance is instanciated in readonly mode. The property only
     * makes sense if @see disabledInEditableMode is false, you should simply
     * use @see Widget.events otherwise.
     */
    read_events: null,

    /**
     * Initializes the events that will need to be binded according to the
     * given mode.
     *
     * @constructor
     * @param {Object} parent
     * @param {Object} [options]
     * @param {boolean} [options.editableMode=false]
     *        true if the page is in edition mode
     */
    init: function (parent, options) {
        this._super.apply(this, arguments);

        this.editableMode = this.options.editableMode || false;
        var extraEvents = this.editableMode ? this.edit_events : this.read_events;
        if (extraEvents) {
            this.events = Object.assign({}, this.events || {}, extraEvents);
        }
    },
});

/**
 * In charge of handling one animation loop using the requestAnimationFrame
 * feature. This is used by the `Animation` class below and should not be called
 * directly by an end developer.
 *
 * This uses a simple API: it can be started, stopped, played and paused.
 */
var AnimationEffect = Class.extend(publicWidget.ParentedMixin, {
    /**
     * @constructor
     * @param {Object} parent
     * @param {function} updateCallback - the animation update callback
     * @param {string} [startEvents=scroll]
     *        space separated list of events which starts the animation loop
     * @param {jQuery|DOMElement} [$startTarget=window]
     *        the element(s) on which the startEvents are listened
     * @param {Object} [options]
     * @param {function} [options.getStateCallback]
     *        a function which returns a value which represents the state of the
     *        animation, i.e. for two same value, no refreshing of the animation
     *        is needed. Can be used for optimization. If the $startTarget is
     *        the window element, this defaults to returning the current
     *        scoll offset of the window or the size of the window for the
     *        scroll and resize events respectively.
     * @param {string} [options.endEvents]
     *        space separated list of events which pause the animation loop. If
     *        not given, the animation is stopped after a while (if no
     *        startEvents is received again)
     * @param {jQuery|DOMElement} [options.$endTarget=$startTarget]
     *        the element(s) on which the endEvents are listened
     * @param {boolean} [options.enableInModal]
     *        when it is true, it means that the 'scroll' event must be
     *        triggered when scrolling a modal.
     */
    init: function (parent, updateCallback, startEvents, $startTarget, options) {
        publicWidget.ParentedMixin.init.call(this);
        this.setParent(parent);

        options = options || {};
        this._minFrameTime = 1000 / (options.maxFPS || 100);

        // Initialize the animation startEvents, startTarget, endEvents, endTarget and callbacks
        this._updateCallback = updateCallback;
        this.startEvents = startEvents || 'scroll';
        const modalEl = options.enableInModal ? parent.target.closest('.modal') : null;
        const mainScrollingElement = modalEl ? modalEl : $().getScrollingElement()[0];
        const mainScrollingTarget = $().getScrollingTarget(mainScrollingElement)[0];
        this.$startTarget = $($startTarget ? $startTarget : this.startEvents === 'scroll' ? mainScrollingTarget : window);
        if (options.getStateCallback) {
            this._getStateCallback = options.getStateCallback;
        } else if (this.startEvents === 'scroll' && this.$startTarget[0] === mainScrollingTarget) {
            const $scrollable = this.$startTarget;
            this._getStateCallback = function () {
                return $scrollable.scrollTop();
            };
        } else if (this.startEvents === 'resize' && this.$startTarget[0] === window) {
            this._getStateCallback = function () {
                return {
                    width: window.innerWidth,
                    height: window.innerHeight,
                };
            };
        } else {
            this._getStateCallback = function () {
                return undefined;
            };
        }
        this.endEvents = options.endEvents || false;
        this.$endTarget = options.$endTarget ? $(options.$endTarget) : this.$startTarget;

        this._updateCallback = this._updateCallback.bind(parent);
        this._getStateCallback = this._getStateCallback.bind(parent);

        // Add a namespace to events using the generated uid
        this._uid = uniqueId("_animationEffect");
        this.startEvents = _processEvents(this.startEvents, this._uid);
        if (this.endEvents) {
            this.endEvents = _processEvents(this.endEvents, this._uid);
        }

        function _processEvents(events, namespace) {
            return events
                .split(" ")
                .map((e) => (e += "." + namespace))
                .join(" ");
        }
    },
    /**
     * @override
     */
    destroy: function () {
        publicWidget.ParentedMixin.destroy.call(this);
        this.stop();
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Initializes when the animation must be played and paused and initializes
     * the animation first frame.
     */
    start: function () {
        // Initialize the animation first frame
        this._paused = false;
        this._rafID = window.requestAnimationFrame((function (t) {
            this._update(t);
            this._paused = true;
        }).bind(this));

        // Initialize the animation play/pause events
        if (this.endEvents) {
            /**
             * If there are endEvents, the animation should begin playing when
             * the startEvents are triggered on the $startTarget and pause when
             * the endEvents are triggered on the $endTarget.
             */
            this.$startTarget.on(this.startEvents, (function (e) {
                if (this._paused) {
                    setTimeout(() => this.play.bind(this, e));
                }
            }).bind(this));
            this.$endTarget.on(this.endEvents, (function () {
                if (!this._paused) {
                    setTimeout(() => this.pause.bind(this));
                }
            }).bind(this));
        } else {
            /**
             * Else, if there is no endEvents, the animation should begin playing
             * when the startEvents are *continuously* triggered on the
             * $startTarget or fully played once. To achieve this, the animation
             * begins playing and is scheduled to pause after 2 seconds. If the
             * startEvents are triggered during that time, this is not paused
             * for another 2 seconds. This allows to describe an "effect"
             * animation (which lasts less than 2 seconds) or an animation which
             * must be playing *during* an event (scroll, mousemove, resize,
             * repeated clicks, ...).
             */
            this.throttleOnStartEvents = throttleForAnimation(
                ((e) => {
                    this.play(e);
                    clearTimeout(pauseTimer);
                    pauseTimer = setTimeout(
                        (() => {
                            this.pause();
                            pauseTimer = null;
                        }).bind(this),
                        2000
                    );
                }).bind(this)
            );
            var pauseTimer = null;
            this.$startTarget.on(this.startEvents, this.throttleOnStartEvents);
        }
    },
    /**
     * Pauses the animation and destroys the attached events which trigger the
     * animation to be played or paused.
     */
    stop: function () {
        this.$startTarget.off(this.startEvents);
        if (this.endEvents) {
            this.$endTarget.off(this.endEvents);
        }
        this.pause();
    },
    /**
     * Forces the requestAnimationFrame loop to start.
     *
     * @param {Event} e - the event which triggered the animation to play
     */
    play: function (e) {
        this._newEvent = e;
        if (!this._paused) {
            return;
        }
        this._paused = false;
        this._rafID = window.requestAnimationFrame(this._update.bind(this));
        this._lastUpdateTimestamp = undefined;
    },
    /**
     * Forces the requestAnimationFrame loop to stop.
     */
    pause: function () {
        if (this._paused) {
            return;
        }
        this._paused = true;
        window.cancelAnimationFrame(this._rafID);
        this._lastUpdateTimestamp = undefined;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Callback which is repeatedly called by the requestAnimationFrame loop.
     * It controls the max fps at which the animation is running and initializes
     * the values that the update callback needs to describe the animation
     * (state, elapsedTime, triggered event).
     *
     * @private
     * @param {DOMHighResTimeStamp} timestamp
     */
    _update: function (timestamp) {
        if (this._paused) {
            return;
        }
        this._rafID = window.requestAnimationFrame(this._update.bind(this));

        // Check the elapsed time since the last update callback call.
        // Consider it 0 if there is no info of last timestamp and leave this
        // _update call if it was called too soon (would overflow the set max FPS).
        var elapsedTime = 0;
        if (this._lastUpdateTimestamp) {
            elapsedTime = timestamp - this._lastUpdateTimestamp;
            if (elapsedTime < this._minFrameTime) {
                return;
            }
        }

        // Check the new animation state thanks to the get state callback and
        // store its new value. If the state is the same as the previous one,
        // leave this _update call, except if there is an event which triggered
        // the "play" method again.
        var animationState = this._getStateCallback(elapsedTime, this._newEvent);
        if (!this._newEvent
         && animationState !== undefined
         && JSON.stringify(animationState) === JSON.stringify(this._animationLastState)) {
            return;
        }
        this._animationLastState = animationState;

        // Call the update callback with frame parameters
        this._updateCallback(this._animationLastState, elapsedTime, this._newEvent);
        this._lastUpdateTimestamp = timestamp; // Save the timestamp at which the update callback was really called
        this._newEvent = undefined; // Forget the event which triggered the last "play" call
    },
});

/**
 * Also register AnimationEffect automatically (@see effects, _prepareEffects).
 */
var Animation = publicWidget.Widget.extend({
    /**
     * The max FPS at which all the automatic animation effects will be
     * running by default.
     */
    maxFPS: 100,
    /**
     * @see this._prepareEffects
     *
     * @type {Object[]}
     * @type {string} startEvents
     *       The names of the events which trigger the effect to begin playing.
     * @type {string} [startTarget]
     *       A selector to find the target where to listen for the start events
     *       (if no selector, the window target will be used). If the whole
     *       element of the animation should be used, use the 'selector' string.
     * @type {string} [endEvents]
     *       The name of the events which trigger the end of the effect (if none
     *       is defined, the animation will stop after a while
     *       @see AnimationEffect.start).
     * @type {string} [endTarget]
     *       A selector to find the target where to listen for the end events
     *       (if no selector, the startTarget will be used). If the whole
     *       element of the animation should be used, use the 'selector' string.
     * @type {string} update
     *       A string which refers to a method which will be used as the update
     *       callback for the effect. It receives 3 arguments: the animation
     *       state, the elapsedTime since last update and the event which
     *       triggered the animation (undefined if just a new update call
     *       without trigger).
     * @type {string} [getState]
     *       The animation state is undefined by default, the scroll offset for
     *       the particular {startEvents: 'scroll'} effect and an object with
     *       width and height for the particular {startEvents: 'resize'} effect.
     *       There is the possibility to define the getState callback of the
     *       animation effect with this key. This allows to improve performance
     *       even further in some cases.
     */
    effects: [],

    /**
     * Initializes the animation. The method should not be called directly as
     * called automatically on animation instantiation and on restart.
     *
     * Also, prepares animation's effects and start them if any.
     *
     * @override
     */
    start: function () {
        this._prepareEffects();
        this._animationEffects.forEach((effect) => {
            effect.start();
        });
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Registers `AnimationEffect` instances.
     *
     * This can be done by extending this method and calling the @see _addEffect
     * method in it or, better, by filling the @see effects property.
     *
     * @private
     */
    _prepareEffects: function () {
        this._animationEffects = [];

        var self = this;
        this.effects.forEach((desc) => {
            self._addEffect(self[desc.update], desc.startEvents, _findTarget(desc.startTarget), {
                getStateCallback: desc.getState && self[desc.getState],
                endEvents: desc.endEvents || undefined,
                $endTarget: _findTarget(desc.endTarget),
                maxFPS: self.maxFPS,
                enableInModal: desc.enableInModal || undefined,
            });

            // Return the DOM element matching the selector in the form
            // described above.
            function _findTarget(selector) {
                if (selector) {
                    if (selector === 'selector') {
                        return self.$el;
                    }
                    return self.$(selector);
                }
                return undefined;
            }
        });
    },
    /**
     * Registers a new `AnimationEffect` according to given parameters.
     *
     * @private
     * @see AnimationEffect.init
     */
    _addEffect: function (updateCallback, startEvents, $startTarget, options) {
        this._animationEffects.push(
            new AnimationEffect(this, updateCallback, startEvents, $startTarget, options)
        );
    },
});

//::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

var registry = publicWidget.registry;

// TODO Let's keep this here for now: will have to move an edit mode related
// location.
// FIXME temporary hack: during edit mode, the carousel crashes sometimes when
// we hover option during a carousel cycle. This patches Bootstrap to prevent
// the crash.
const baseSelectorEngineFind = window.SelectorEngine.find;
window.SelectorEngine.find = function (...args) {
    try {
        return baseSelectorEngineFind.call(this, ...args);
    } catch {
        return [document.createElement('div')];
    }
};

const MobileYoutubeAutoplayMixin = {
    /**
     * Takes care of any necessary setup for autoplaying video. In practice,
     * this method will load the youtube iframe API for mobile environments
     * because mobile environments don't support the youtube autoplay param
     * passed in the url.
     *
     * @private
     * @param {string} src - The source url of the video
     */
    _setupAutoplay: function (src) {
        let promise = Promise.resolve();

        this.isYoutubeVideo = src.indexOf('youtube') >= 0;
        this.isMobileEnv = uiUtils.getSize() <= SIZES.LG && hasTouch();

        if (this.isYoutubeVideo && this.isMobileEnv && !window.YT && !this.el.dataset.needCookiesApproval) {
            const oldOnYoutubeIframeAPIReady = window.onYouTubeIframeAPIReady;
            promise = new Promise(resolve => {
                window.onYouTubeIframeAPIReady = () => {
                    if (oldOnYoutubeIframeAPIReady) {
                        oldOnYoutubeIframeAPIReady();
                    }
                    return resolve();
                };
            });
            loadJS('https://www.youtube.com/iframe_api');
        }

        return promise;
    },
    /**
     * @private
     * @param {DOMElement} iframeEl - the iframe containing the video player
     */
    _triggerAutoplay: function (iframeEl) {
        // YouTube does not allow to auto-play video in mobile devices, so we
        // have to play the video manually.
        if (this.isMobileEnv && this.isYoutubeVideo && !this.el.dataset.needCookiesApproval) {
            new window.YT.Player(iframeEl, {
                events: {
                    onReady: ev => ev.target.playVideo(),
                }
            });
        }
    },
};

registry.mediaVideo = publicWidget.Widget.extend(
    MobileYoutubeAutoplayMixin, ObservingCookieWidgetMixin, {
    selector: '.media_iframe_video',

    /**
     * @override
     */
    start: function () {
        // TODO: this code should be refactored to make more sense and be better
        // integrated with Odoo (this refactoring should be done in master).

        const proms = [this._super.apply(this, arguments)];
        let iframeEl = this.el.querySelector(':scope > iframe');

        // The following code is only there to ensure compatibility with
        // videos added before bug fixes or new Odoo versions where the
        // <iframe/> element is properly saved.
        if (!iframeEl) {
            iframeEl = this._generateIframe();
        }

        if (this.el.dataset.needCookiesApproval) {
            const sizeContainerEl = this.el.querySelector(":scope > .media_iframe_video_size");
            sizeContainerEl.classList.add("d-none");
            this._showSizeContainerEl = () => {
                sizeContainerEl.classList.remove("d-none");
            };
            document.addEventListener(
                "optionalCookiesAccepted", this._showSizeContainerEl, { once: true }
            );
        }

        // We don't want to cause an error that would prevent entering edit mode
        // if there is an iframe that doesn't have a src (this was possible for
        // a while with the media dialog).
        if (!iframeEl || !iframeEl.getAttribute('src')) {
            // Something went wrong: no iframe is present in the DOM and the
            // widget was unable to create one on the fly.
            return Promise.all(proms);
        }

        proms.push(this._setupAutoplay(iframeEl.getAttribute('src')));
        return Promise.all(proms).then(() => {
            this._triggerAutoplay(iframeEl);
        });
    },
    /**
     * @override
     */
    destroy() {
        if (this._showSizeContainerEl) {
            document.removeEventListener("optionalCookiesAccepted", this._showSizeContainerEl);
            this._showSizeContainerEl();
        }
        return this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _generateIframe: function () {
        // Bug fix / compatibility: empty the <div/> element as all information
        // to rebuild the iframe should have been saved on the <div/> element
        this.$el.empty();

        // Add extra content for size / edition
        this.$el.append(
            '<div class="css_editable_mode_display">&nbsp;</div>' +
            '<div class="media_iframe_video_size">&nbsp;</div>'
        );

        // Rebuild the iframe. Depending on version / compatibility / instance,
        // the src is saved in the 'data-src' attribute or the
        // 'data-oe-expression' one (the latter is used as a workaround in 10.0
        // system but should obviously be reviewed in master).
        var src = escape(this.$el.data('oe-expression') || this.$el.data('src'));
        // Validate the src to only accept supported domains we can trust
        var m = src.match(/^(?:https?:)?\/\/([^/?#]+)/);
        if (!m) {
            // Unsupported protocol or wrong URL format, don't inject iframe
            return;
        }
        var domain = m[1].replace(/^www\./, '');
        const supportedDomains = [
            "youtu.be", "youtube.com", "youtube-nocookie.com",
            "instagram.com",
            "player.vimeo.com", "vimeo.com",
            "dailymotion.com",
            "player.youku.com", "youku.com",
        ];
        if (!supportedDomains.includes(domain)) {
            // Unsupported domain, don't inject iframe
            return;
        }

        const iframeEl = $('<iframe/>', {
            frameborder: '0',
            allowfullscreen: 'allowfullscreen',
            "aria-label": _t("Media video"),
        })[0];
        this.$el.append(iframeEl);
        this._manageIframeSrc(this.el, src);
        return iframeEl;
    },
});

registry.backgroundVideo = publicWidget.Widget.extend(MobileYoutubeAutoplayMixin, {
    selector: '.o_background_video',
    disabledInEditableMode: false,

    /**
     * @override
     */
    start: function () {
        var proms = [this._super(...arguments)];

        this.videoSrc = this.el.dataset.bgVideoSrc;
        this.iframeID = uniqueId("o_bg_video_iframe_");
        proms.push(this._setupAutoplay(this.videoSrc));
        if (this.isYoutubeVideo && this.isMobileEnv && !this.videoSrc.includes('enablejsapi=1')) {
            // Compatibility: when choosing an autoplay youtube video via the
            // media manager, the API was not automatically enabled before but
            // only enabled here in the case of background videos.
            // TODO migrate those old cases so this code can be removed?
            this.videoSrc += '&enablejsapi=1';
        }

        this.throttledUpdate = throttleForAnimation(() => this._adjustIframe());

        var $dropdownMenu = this.$el.closest('.dropdown-menu');
        if ($dropdownMenu.length) {
            this.$dropdownParent = $dropdownMenu.parent();
            this.$dropdownParent.on("shown.bs.dropdown.backgroundVideo", this.throttledUpdate);
        }

        $(window).on("resize." + this.iframeID, this.throttledUpdate);

        const $modal = this.$el.closest('.modal');
        if ($modal.length) {
            $modal.on('show.bs.modal', () => {
                const videoContainerEl = this.el.querySelector('.o_bg_video_container');
                videoContainerEl.classList.add('d-none');
            });
            $modal.on('shown.bs.modal', () => {
                this._adjustIframe();
                const videoContainerEl = this.el.querySelector('.o_bg_video_container');
                videoContainerEl.classList.remove('d-none');
            });
        }
        return Promise.all(proms).then(() => this._appendBgVideo());
    },
    /**
     * @override
     */
    destroy: function () {
        this._super.apply(this, arguments);

        if (this.$dropdownParent) {
            this.$dropdownParent.off('.backgroundVideo');
        }

        $(window).off('resize.' + this.iframeID);

        this.throttledUpdate.cancel();

        if (this.$bgVideoContainer) {
            this.$bgVideoContainer.remove();
        }
        document.removeEventListener(
            "optionalCookiesAccepted",
            this.__onEnableVideoPostCookiesAccepted
        );
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Adjusts iframe sizes and position so that it fills the container and so
     * that it is centered in it.
     *
     * @private
     */
    _adjustIframe: function () {
        if (!this.$iframe) {
            return;
        }

        this.$iframe.removeClass('show');

        // Adjust the iframe
        var wrapperWidth = this.$el.innerWidth();
        var wrapperHeight = this.$el.innerHeight();
        var relativeRatio = (wrapperWidth / wrapperHeight) / (16 / 9);
        var style = {};
        if (relativeRatio >= 1.0) {
            style['width'] = '100%';
            style['height'] = (relativeRatio * 100) + '%';
            style['inset-inline-start'] = '0';
            style['inset-block-start'] = (-(relativeRatio - 1.0) / 2 * 100) + '%';
        } else {
            style['width'] = ((1 / relativeRatio) * 100) + '%';
            style['height'] = '100%';
            style['inset-inline-start'] = (-((1 / relativeRatio) - 1.0) / 2 * 100) + '%';
            style['inset-block-start'] = '0';
        }
        this.$iframe.css(style);

        void this.$iframe[0].offsetWidth; // Force style addition
        this.$iframe.addClass('show');
    },
    /**
     * Append background video related elements to the target.
     *
     * @private
     */
    _appendBgVideo: function () {
        const allowedCookies = !this.el.dataset.needCookiesApproval;

        var $oldContainer = this.$bgVideoContainer || this.$('> .o_bg_video_container');
        this.$bgVideoContainer = $(renderToElement('website.background.video', {
            videoSrc: allowedCookies ? this.videoSrc : "about:blank",
            iframeID: this.iframeID,
        }));
        this.$iframe = this.$bgVideoContainer.find('.o_bg_video_iframe');
        this.$iframe.one('load', () => {
            this.$bgVideoContainer.find('.o_bg_video_loading').remove();
            // When there is a "slide in (left or right) animation" element, we
            // need to adjust the iframe size once it has been loaded, otherwise
            // an horizontal scrollbar may appear.
            this._adjustIframe();
        });
        this.$bgVideoContainer.prependTo(this.$el);
        $oldContainer.remove();

        if (!allowedCookies) {
            // We don't add the optional cookies warning for background videos
            // so that the fallback message doesn't appear behind the content.
            this.__onEnableVideoPostCookiesAccepted = () => {
                this.$iframe[0].src = this.videoSrc;
            };
            document.addEventListener(
                "optionalCookiesAccepted",
                this.__onEnableVideoPostCookiesAccepted,
                { once: true }
            );
        }

        this._adjustIframe();
        this._triggerAutoplay(this.$iframe[0]);
    },
});

registry.FullScreenHeight = publicWidget.Widget.extend({
    selector: '.o_full_screen_height',
    disabledInEditableMode: false,

    /**
     * @override
     */
    start() {
        this.inModal = !!this.el.closest('.modal');

        // TODO maybe review the way the public widgets work for non-visible-at-
        // load snippets -> probably better to not do anything for them and
        // start the widgets only once they become visible..?
        if (this.$el.is(':not(:visible)') || this.$el.outerHeight() > this._computeIdealHeight()) {
            // Only initialize if taller than the ideal height as some extra css
            // rules may alter the full-screen-height class behavior in some
            // cases (blog...).
            this._adaptSize();
            $(window).on('resize.FullScreenHeight', debounce(() => this._adaptSize(), 250));
        }
        return this._super(...arguments);
    },
    /**
     * @override
     */
    destroy() {
        this._super(...arguments);
        $(window).off('.FullScreenHeight');
        this.el.style.setProperty('min-height', '');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _adaptSize() {
        const height = this._computeIdealHeight();
        this.el.style.setProperty('min-height', `${height}px`, 'important');
    },
    /**
     * @private
     */
    _computeIdealHeight() {
        const windowHeight = $(window).outerHeight();
        if (this.inModal) {
            return windowHeight;
        }

        // Doing it that way allows to considerer fixed headers, hidden headers,
        // connected users, ...
        const firstContentEl = $('#wrapwrap > main > :first-child')[0]; // first child to consider the padding-top of main
        const mainTopPos = firstContentEl.getBoundingClientRect().top + document.documentElement.scrollTop;
        return (windowHeight - mainTopPos);
    },
});

registry.WebsiteAnimate = publicWidget.Widget.extend({
    selector: '#wrapwrap',
    disabledInEditableMode: false,

    offsetRatio: 0.3, // Dynamic offset ratio: 0.3 = (element's height/3)
    offsetMin: 10, // Minimum offset for small elements (in pixels)

    /**
     * @override
     */
    start() {
        this.lastScroll = 0;
        this.$scrollingElement = $().getScrollingElement();
        this.$scrollingTarget = $().getScrollingTarget(this.$scrollingElement);
        this.$animatedElements = this.$('.o_animate');

        // Fix for "transform: none" not overriding keyframe transforms on
        // some iPhone using Safari. Note that all animated elements are checked
        // (not only one) as the bug is not systematic and may depend on some
        // other conditions (for example: an animated image in a block which is
        // hidden on mobile would not have the issue).
        const couldOverflowBecauseOfSafariBug = [...this.$animatedElements].some(el => {
            return window.getComputedStyle(el).transform !== 'none';
        });
        this.forceOverflowXYHidden = false;
        if (couldOverflowBecauseOfSafariBug) {
            this._toggleOverflowXYHidden(true);
            // Now prevent any call to _toggleOverflowXYHidden to have an effect
            this.forceOverflowXYHidden = true;
        }

        // By default, elements are hidden by the css of o_animate.
        // Render elements and trigger the animation then pause it in state 0.
        this.$animatedElements.toArray().forEach((el) => {
            if (el.closest('.dropdown')) {
                el.classList.add('o_animate_in_dropdown');
                return;
            }
            if (!el.classList.contains('o_animate_on_scroll')) {
                this._resetAnimation($(el));
            }
        });
        // Then we render all the elements, the ones which are invisible
        // in state 0 (like fade_in for example) will stay invisible.
        this.$animatedElements.css("visibility", "visible");

        // We use addEventListener instead of jQuery because we need 'capture'.
        // Setting capture to true allows to take advantage of event bubbling
        // for events that otherwise don’t support it. (e.g. useful when
        // scrolling a modal)
        this.__onScrollWebsiteAnimate = throttleForAnimation(this._onScrollWebsiteAnimate.bind(this));
        this.$scrollingTarget[0].addEventListener('scroll', this.__onScrollWebsiteAnimate, {capture: true});

        $(window).on('resize.o_animate, shown.bs.modal.o_animate, slid.bs.carousel.o_animate, shown.bs.tab.o_animate, shown.bs.collapse.o_animate', () => {
            this.windowsHeight = $(window).height();
            this._scrollWebsiteAnimate(this.$scrollingElement[0]);
        }).trigger("resize");

        return this._super(...arguments);
    },
    /**
     * @override
     */
    destroy() {
        this._super(...arguments);
        this.$('.o_animate')
            .removeClass('o_animating o_animated o_animate_preview o_animate_in_dropdown')
            .css({
                'animation-name': '',
                'animation-play-state': '',
                'visibility': '',
            });
        $(window).off('.o_animate');
        this.__onScrollWebsiteAnimate.cancel();
        this.$scrollingTarget[0].removeEventListener('scroll', this.__onScrollWebsiteAnimate, {capture: true});
        this.$scrollingElement[0].classList.remove('o_wanim_overflow_xy_hidden');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Starts animation and/or update element's state.
     *
     * @private
     * @param {jQuery} $el
     */
    _startAnimation($el) {
        // Forces the browser to redraw using setTimeout.
        setTimeout(() => {
            this._toggleOverflowXYHidden(true);
            $el
            .css({"animation-play-state": "running"})
            .addClass("o_animating")
            .one('webkitAnimationEnd oanimationend msAnimationEnd animationend', () => {
                $el.addClass("o_animated").removeClass("o_animating");
                this._toggleOverflowXYHidden(false);
                $(window).trigger("resize");
            });
        });
    },
    /**
     * @private
     * @param {jQuery} $el
     */
    _resetAnimation($el) {
        const animationName = $el.css("animation-name");
        $el.css({"animation-name": "dummy-none", "animation-play-state": ""})
           .removeClass("o_animated o_animating");

        this._toggleOverflowXYHidden(false);
        // trigger a DOM reflow
        void $el[0].offsetWidth;
        $el.css({'animation-name': animationName , 'animation-play-state': 'paused'});
    },
    /**
     * Shows/hides the horizontal scrollbar and prevents flicker of the page
     * height (on the slideout footer).
     *
     * @private
     * @param {Boolean} add
     */
    _toggleOverflowXYHidden(add) {
        if (this.forceOverflowXYHidden) {
            return;
        }
        if (add) {
            this.$scrollingElement[0].classList.add('o_wanim_overflow_xy_hidden');
        } else if (!this.$scrollingElement.find('.o_animating').length) {
            this.$scrollingElement[0].classList.remove('o_wanim_overflow_xy_hidden');
        }
    },
    /**
     * Gets element top offset by not taking CSS transforms into calculations.
     *
     * @private
     * @param {Element} el
     * @param {HTMLElement} [topEl] if specified, calculates the top distance to
     *     this element.
     */
    _getElementOffsetTop(el, topEl) {
        // Loop through the DOM tree and add its parent's offset to get page offset.
        var top = 0;
        do {
            top += el.offsetTop || 0;
            el = el.offsetParent;
            if (topEl && el === topEl) {
                return top;
            }
        } while (el);
        return top;
    },
    /**
     * @private
     * @param {Element} el
     */
    _scrollWebsiteAnimate(el) {
        this.$('.o_animate:not(.o_animate_in_dropdown)').toArray().forEach((el) => {
            const $el = $(el);
            const elHeight = el.offsetHeight;
            const animateOnScroll = el.classList.contains('o_animate_on_scroll');
            let elOffset = animateOnScroll ? 0 : Math.max((elHeight * this.offsetRatio), this.offsetMin);
            const state = $el.css("animation-play-state");

            // We need to offset for the change in position from some animation.
            // So we get the top value by not taking CSS transforms into calculations.
            // Cookies bar might be opened and considered as a modal but it is
            // not really one when there is no backdrop (eg 'discrete' layout),
            // and should not be used as scrollTop value.
            const closestModal = $el.closest(".modal:visible")[0];
            let scrollTop = this.$scrollingElement[0].scrollTop;
            if (closestModal) {
                scrollTop = closestModal.classList.contains("s_popup_no_backdrop") ?
                    closestModal.querySelector(".modal-content").scrollTop :
                    closestModal.scrollTop;
            }
            const elTop = this._getElementOffsetTop(el) - scrollTop;
            let visible;
            const footerEl = el.closest('.o_footer_slideout');
            const wrapEl = this.el;
            if (footerEl && wrapEl.classList.contains('o_footer_effect_enable')) {
                // Since the footer slideout is always in the viewport but not
                // always displayed, the way to calculate if an element is
                // visible in the footer is different. We decided to handle this
                // case specifically instead of a generic solution using
                // elementFromPoint as it is a rare case and the implementation
                // would have been too complicated for such a small use case.
                const actualScroll = wrapEl.scrollTop + this.windowsHeight;
                const totalScrollHeight = wrapEl.scrollHeight;
                const heightFromFooter = this._getElementOffsetTop(el, footerEl);
                visible = actualScroll >=
                    totalScrollHeight - heightFromFooter - elHeight + elOffset;
            } else {
                visible = this.windowsHeight > (elTop + elOffset) &&
                    0 < (elTop + elHeight - elOffset);
            }
            if (animateOnScroll) {
                if (visible) {
                    const start = 100 / (parseFloat(el.dataset.scrollZoneStart) || 1);
                    const end = 100 / (parseFloat(el.dataset.scrollZoneEnd) || 1);
                    const out = el.classList.contains('o_animate_out');
                    const ratio = (out ? elTop + elHeight : elTop) / (this.windowsHeight - (this.windowsHeight / start));
                    const duration = parseFloat(window.getComputedStyle(el).animationDuration);
                    const delay = (ratio - 1) * (duration * end);
                    el.style.animationDelay = (out ? - duration - delay : delay) + "s";
                    el.classList.add('o_animating');
                    this._toggleOverflowXYHidden(true);
                } else if (el.classList.contains('o_animating')) {
                    el.classList.remove('o_animating');
                    this._toggleOverflowXYHidden(false);
                }
            } else {
                if (visible && state === 'paused') {
                    $el.addClass('o_visible');
                    this._startAnimation($el);
                } else if (!visible && $el.hasClass('o_animate_both_scroll') && state === 'running') {
                    $el.removeClass('o_visible');
                    this._resetAnimation($el);
                }
            }
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onScrollWebsiteAnimate() {
        // Note: Do not rely on ev.currentTarget which might be lost by Chrome.
        this._scrollWebsiteAnimate(this.$scrollingElement[0]);
    },
});

export default {
    Widget: publicWidget.Widget,
    Animation: Animation,
    registry: registry,

    Class: Animation, // Deprecated
};
