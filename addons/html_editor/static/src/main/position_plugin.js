import { ancestors } from "@html_editor/utils/dom_traversal";
import { Plugin } from "../plugin";
import { throttleForAnimation } from "@web/core/utils/timing";

/**
 * This plugins provides a way to create a "local" overlays so that their
 * visibility is relative to the overflow of their ancestors.
 */
export class PositionPlugin extends Plugin {
    static name = "position";
    /** @type { (p: PositionPlugin) => Record<string, any> } */
    static resources = (p) => ({
        // todo: it is strange that the position plugin is aware of onExternalHistorySteps and historyResetFromSteps.
        onExternalHistorySteps: p.layoutGeomentryChange.bind(p),
        historyResetFromSteps: p.layoutGeomentryChange.bind(p),
    });

    setup() {
        this.layoutGeomentryChange = throttleForAnimation(this.layoutGeomentryChange.bind(this));
        this.resizeObserver = new ResizeObserver(this.layoutGeomentryChange);
        this.resizeObserver.observe(this.document.body);
        this.resizeObserver.observe(this.editable);
        this.addDomListener(window, "resize", this.layoutGeomentryChange);
        if (this.document.defaultView !== window) {
            this.addDomListener(this.document.defaultView, "resize", this.layoutGeomentryChange);
        }

        const scrollableElements = [this.editable, ...ancestors(this.editable)].filter((node) => {
            const style = getComputedStyle(node);
            return style.overflowY === "auto" || style.overflowY === "scroll";
        });
        for (const scrollableElement of scrollableElements) {
            this.addDomListener(scrollableElement, "scroll", () => {
                this.layoutGeomentryChange();
            });
        }
    }

    handleCommand(commandName) {
        switch (commandName) {
            case "ADD_STEP":
                this.layoutGeomentryChange();
                break;
        }
    }
    destroy() {
        this.resizeObserver.disconnect();
        super.destroy();
    }
    layoutGeomentryChange() {
        this.resources.layoutGeomentryChange?.forEach((cb) => cb());
    }
}
