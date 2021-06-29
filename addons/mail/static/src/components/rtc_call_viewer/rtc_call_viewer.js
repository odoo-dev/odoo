/** @odoo-module **/

import { useUpdate } from '@mail/component_hooks/use_update/use_update';
import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';

import { isEventHandled, markEventHandled } from '@mail/utils/utils';

import { RtcCallParticipantCard } from '@mail/components/rtc_call_participant_card/rtc_call_participant_card';
import { RtcController } from '@mail/components/rtc_controller/rtc_controller';
import { RtcLayoutMenu } from '@mail/components/rtc_layout_menu/rtc_layout_menu';
import { RtcConfigurationMenu } from '@mail/components/rtc_configuration_menu/rtc_configuration_menu';

import Dialog from 'web.OwlDialog';

const { Component, useState } = owl;
const { useRef } = owl.hooks;

const components = {
    Dialog,
    RtcCallParticipantCard,
    RtcController,
    RtcLayoutMenu,
    RtcConfigurationMenu,
};

// TODO a nice-to-have would be a resize handle under the videos.

export class RtcCallViewer extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
        useShouldUpdateBasedOnProps();
        this.state = useState({
            tileWidth: 0,
            tileHeight: 0,
            columnCount: 0,
        });
        this.tileContainerRef = useRef('tileContainer');
        useUpdate({ func: () => this._update() });
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread}
     */
    get thread() {
        return this.rtcCallViewer && this.rtcCallViewer.threadView.thread;
    }

    /**
     * @returns {mail.rtc_call_viewer}
     */
    get rtcCallViewer() {
        return this.env.models['mail.rtc_call_viewer'].get(this.props.localId);
    }

    /**
     * @returns {mail.user_setting}
     */
    get userSetting() {
        return this.env.messaging && this.env.messaging.userSetting;
    }

    /**
     * Used to make the component depend on the window size and trigger an
     * update when the window size changes.
     *
     * @returns {Object|undefined}
     */
    get windowSize() {
        const device = this.env.messaging && this.env.messaging.device;
        return device && {
            innerHeight: device.globalWindowInnerHeight,
            innerWidth: device.globalWindowInnerWidth,
        };
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _computeOptimalLayout({ containerWidth, containerHeight }) {
        let optimalLayout = {
            area: 0,
            cols: 0,
            width: 0,
            height: 0,
        };

        // finding out how many tiles are part of the dynamic grid.
        const tileCount = this.rtcCallViewer.filterVideoGrid
            ? this.thread.videoCount
            : this.thread.rtcSessions.length;

        for (let columnCount = 1; columnCount <= tileCount; columnCount++) {
            const rowCount = Math.ceil(tileCount / columnCount);
            const tileHeight = containerWidth / (columnCount * this.rtcCallViewer.aspectRatio);
            const tileWidth = containerHeight / rowCount;
            let width;
            let height;
            if (tileHeight > tileWidth) {
                height = Math.floor(containerHeight / rowCount);
                width = Math.floor(height * this.rtcCallViewer.aspectRatio);
            } else {
                width = Math.floor(containerWidth / columnCount);
                height = Math.floor(width / this.rtcCallViewer.aspectRatio);
            }
            const area = height * width;
            if (area <= optimalLayout.area) {
                continue;
            }
            optimalLayout = {
                area,
                width,
                height,
                columnCount
            };
        }
        return optimalLayout;
    }

    /**
     * @private
     */
    _setTileLayout() {
        if (!this.thread) {
            return;
        }
        if (!this.el) {
            return;
        }
        if (!this.tileContainerRef.el) {
            return;
        }
        const roomRect = this.tileContainerRef.el.getBoundingClientRect();

        const { width, height, columnCount } = this._computeOptimalLayout({
            containerWidth: roomRect.width,
            containerHeight: roomRect.height,
        });

        this.state.tileWidth = width;
        this.state.tileHeight = height;
        this.state.columnCount = columnCount;
    }

    /**
     * @private
     */
    _update() {
        this._setTileLayout();
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClick() {
        this.rtcCallViewer && this.rtcCallViewer.onClick();
    }

    /**
     * @private
     */
    _onRtcSettingsDialogClosed() {
        this.env.messaging.userSetting.rtcConfigurationMenu.toggle();
    }

    /**
     * @private
     */
    _onLayoutSettingsDialogClosed() {
        this.env.messaging.userSetting.toggleLayoutSettingsWindow();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onMouseMove(ev) {
        if (isEventHandled(ev, 'RtcCallViewer.MouseMoveOverlay')) {
            return;
        }
        this.rtcCallViewer && this.rtcCallViewer.onMouseMove();
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onMouseMoveOverlay(ev) {
        markEventHandled(ev, 'RtcCallViewer.MouseMoveOverlay');
        this.rtcCallViewer && this.rtcCallViewer.onMouseMoveOverlay();
    }

}

Object.assign(RtcCallViewer, {
    components,
    props: {
        localId: String,
    },
    template: 'mail.RtcCallViewer',
});
