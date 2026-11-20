import { _t } from "@web/core/l10n/translation";
import { Dialog } from "@web/core/dialog/dialog";
import { Component, proxy, t, useProps } from "@odoo/owl";
import { Switch } from "@html_editor/components/switch/switch";
import {
    convertSecondsToTimestamp,
    convertTimestampToSeconds,
} from "@html_editor/main/media/video/utils";
import { matchPlatformUrl } from "@html_editor/main/media/video/video_providers";

/**
 * The options the user can set, displayed if the platform supports them (see
 * `optionsConfig` of the providers).
 */
const OPTIONS = {
    autoplay: {
        label: _t("Autoplay"),
        description: _t("Videos are muted when autoplay is enabled"),
    },
    loop: { label: _t("Loop") },
    hideControls: { label: _t("Hide player controls") },
    hideFullscreen: {
        label: _t("Hide fullscreen button"),
        isVisible: (options) => !options.hideControls,
    },
    isVertical: { label: _t("Vertical") },
    startFrom: { label: _t("Start at"), isTime: true },
};

/**
 * Set the options of a platform's video, with a preview, before inserting it
 * or to edit it.
 */
export class VideoOptionsDialog extends Component {
    static template = "html_editor.VideoOptionsDialog";
    static components = { Dialog, Switch };

    props = useProps({
        /** the url of a platform's video (see `matchPlatformUrl`) */
        url: t.string(),
        /** the current options of the video, when editing it */
        options: t.object().optional(() => ({})),
        confirmLabel: t.string().optional(() => _t("Insert")),
        /** called with the video data (see `getVideoUrlData` of the providers) */
        confirm: t.function(),
        close: t.function(),
    });

    setup() {
        const { provider, urlMatch } = matchPlatformUrl(this.props.url);
        this.provider = provider;
        this.urlMatch = urlMatch;
        // the options of the url, overridden by the current ones
        const { options } = provider.getVideoUrlData(urlMatch, this.props.options);
        this.state = proxy({
            options,
            // the time options whose input is displayed, even at 0:00
            activeTimes: {},
        });
    }

    get visibleOptions() {
        const options = this.state.options;
        return Object.entries(OPTIONS)
            .filter(
                ([id, config]) =>
                    this.provider.optionsConfig?.[id] && (config.isVisible?.(options) ?? true)
            )
            .map(([id, config]) => ({
                id,
                ...config,
                isActive: config.isTime
                    ? !!(this.state.activeTimes[id] || options[id])
                    : !!options[id],
                timestamp: config.isTime && convertSecondsToTimestamp(options[id]),
            }));
    }

    /** @returns {Object} see `getVideoUrlData` of the providers */
    get videoData() {
        const options = { ...this.state.options };
        // the videos are muted to autoplay, the user cannot change it
        options.muted = !!options.autoplay;
        return {
            ...this.provider.getVideoUrlData(this.urlMatch, options),
            baseUrl: this.props.url,
        };
    }

    get previewSizeClass() {
        return this.state.options.isVertical
            ? "media_iframe_video_size_for_vertical"
            : "media_iframe_video_size";
    }

    /**
     * @param {Object} option see `visibleOptions`
     * @param {boolean} isActive
     */
    toggleOption(option, isActive) {
        if (option.isTime) {
            // the time is set by its input, displayed when the option is active
            this.state.activeTimes[option.id] = isActive;
            if (!isActive) {
                this.state.options[option.id] = 0;
            }
        } else {
            this.state.options[option.id] = isActive;
        }
    }

    /**
     * @param {Object} option see `visibleOptions`
     * @param {string} timestamp
     */
    setTime(option, timestamp) {
        this.state.options[option.id] = convertTimestampToSeconds(timestamp);
    }

    confirm() {
        this.props.confirm(this.videoData);
        this.props.close();
    }
}
