/** @odoo-module **/

import { useUpdate } from "@mail/component_hooks/use_update";
import { CallActionList } from "@mail/new/rtc/call_action_list";
import { CallParticipantCard } from "@mail/new/rtc/call_participant_card";

const { Component, useState, useRef, onMounted, onWillUnmount } = owl;

export class CallMain extends Component {
    static components = { CallActionList, CallParticipantCard };
    static props = ["thread"];
    static template = "mail.call_main";

    setup() {
        super.setup();
        this.state = useState({
            tileWidth: 0,
            tileHeight: 0,
            columnCount: 0,
            rtcSessions: this.props.thread.rtcSessions,
        });
        this.tileContainerRef = useRef("tileContainer");
        useUpdate({ func: () => this._update() });
        onMounted(() => {
            this.resizeObserver = new ResizeObserver(() => this._setTileLayout());
            this.resizeObserver.observe(this.tileContainerRef.el);
        });
        onWillUnmount(() => this.resizeObserver.disconnect());
    }
    get rtcSessionArray() {
        // t-foreach needs an array, not any iterable.
        return [...this.state.rtcSessions.values()];
    }
    get hasSidebarButton() {
        return false;
    }
    get isSidebarOpen() {
        return false; // maybe prop as it comes from callView
    }
    get showOverlay() {
        return true; // TODO based on timer, mouseMove/leave, etc.
    }
    get isControllerFloating() {
        return false;
    }
    onMouseleave() {
        return;
    }
    onClick() {
        return;
    }
    onMouseMove() {
        return;
    }
    onClickHideSidebar() {
        return;
    }
    onClickShowSidebar() {
        return;
    }
    onMouseMoveOverlay() {
        return;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Finds a tile layout and dimensions that respects param0.aspectRatio while maximizing
     * the total area covered by the tiles within the specified container dimensions.
     *
     * @private
     * @param {Object} param0
     * @param {number} [param0.aspectRatio]
     * @param {number} param0.containerHeight
     * @param {number} param0.containerWidth
     * @param {number} param0.tileCount
     */
    _computeTessellation({ aspectRatio = 1, containerHeight, containerWidth, tileCount }) {
        let optimalLayout = {
            area: 0,
            cols: 0,
            tileHeight: 0,
            tileWidth: 0,
        };

        for (let columnCount = 1; columnCount <= tileCount; columnCount++) {
            const rowCount = Math.ceil(tileCount / columnCount);
            const potentialHeight = containerWidth / (columnCount * aspectRatio);
            const potentialWidth = containerHeight / rowCount;
            let tileHeight;
            let tileWidth;
            if (potentialHeight > potentialWidth) {
                tileHeight = Math.floor(potentialWidth);
                tileWidth = Math.floor(tileHeight * aspectRatio);
            } else {
                tileWidth = Math.floor(containerWidth / columnCount);
                tileHeight = Math.floor(tileWidth / aspectRatio);
            }
            const area = tileHeight * tileWidth;
            if (area <= optimalLayout.area) {
                continue;
            }
            optimalLayout = {
                area,
                columnCount,
                tileHeight,
                tileWidth,
            };
        }
        return optimalLayout;
    }

    /**
     * @private
     */
    _setTileLayout() {
        if (!this.tileContainerRef.el) {
            return;
        }
        const { width, height } = this.tileContainerRef.el.getBoundingClientRect();

        const { tileWidth, tileHeight, columnCount } = this._computeTessellation({
            aspectRatio: 16 / 9,
            containerHeight: height,
            containerWidth: width,
            tileCount: this.tileContainerRef.el.children.length,
        });

        this.state.tileWidth = tileWidth;
        this.state.tileHeight = tileHeight;
        this.state.columnCount = columnCount;
    }

    /**
     * @private
     */
    _update() {
        this._setTileLayout();
    }
}
