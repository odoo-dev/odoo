/** @odoo-module **/

import { CallActionList } from "@mail/new/rtc/call_action_list";
import { CallParticipantCard } from "@mail/new/rtc/call_participant_card";

const { Component, useState, useRef, onMounted, onPatched, onWillUnmount } = owl;

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
        });
        this.grid = useRef("grid");
        onMounted(() => {
            this.resizeObserver = new ResizeObserver(() => this.arrangeTiles());
            this.resizeObserver.observe(this.grid.el);
            this.arrangeTiles();
        });
        onPatched(() => this.arrangeTiles());
        onWillUnmount(() => this.resizeObserver.disconnect());
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

    arrangeTiles() {
        if (!this.grid.el) {
            return;
        }
        const { width, height } = this.grid.el.getBoundingClientRect();
        const aspectRatio = 16 / 9;
        const tileCount = this.grid.el.children.length;
        let optimal = {
            area: 0,
            columnCount: 0,
            tileHeight: 0,
            tileWidth: 0,
        };
        for (let columnCount = 1; columnCount <= tileCount; columnCount++) {
            const rowCount = Math.ceil(tileCount / columnCount);
            const potentialHeight = width / (columnCount * aspectRatio);
            const potentialWidth = height / rowCount;
            let tileHeight;
            let tileWidth;
            if (potentialHeight > potentialWidth) {
                tileHeight = Math.floor(potentialWidth);
                tileWidth = Math.floor(tileHeight * aspectRatio);
            } else {
                tileWidth = Math.floor(width / columnCount);
                tileHeight = Math.floor(tileWidth / aspectRatio);
            }
            const area = tileHeight * tileWidth;
            if (area <= optimal.area) {
                continue;
            }
            optimal = {
                area,
                columnCount,
                tileHeight,
                tileWidth,
            };
        }
        Object.assign(this.state, {
            tileWidth: optimal.tileWidth,
            tileHeight: optimal.tileHeight,
            columnCount: optimal.columnCount,
        });
    }
}
