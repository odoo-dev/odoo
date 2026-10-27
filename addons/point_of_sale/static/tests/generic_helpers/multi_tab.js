const CONTAINER_ID = "o_pos_multi_tab";

function tabSelector(name) {
    return `#${CSS.escape(`${CONTAINER_ID}_${name}`)}`;
}

function scopeSelector(name, selector) {
    // Scope every selector group, preserving commas in attributes and pseudo-classes.
    const groups = [];
    let start = 0;
    let depth = 0;
    let quote;
    for (let index = 0; index < selector.length; index++) {
        const char = selector[index];
        if (char === "\\") {
            index++;
        } else if (quote) {
            if (char === quote) {
                quote = undefined;
            }
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === "(" || char === "[") {
            depth++;
        } else if (char === ")" || char === "]") {
            depth--;
        } else if (char === "," && depth === 0) {
            groups.push(selector.slice(start, index));
            start = index + 1;
        }
    }
    groups.push(selector.slice(start));
    return groups.map((group) => `${tabSelector(name)}:iframe ${group.trim()}`).join(", ");
}

/** Return an interface's iframe, including its contentWindow and contentDocument. */
export function getTab(name) {
    const frame = document.querySelector(tabSelector(name));
    if (!frame) {
        throw new Error(`Unknown POS tour tab: ${name}`);
    }
    return frame;
}

/** Open an additional interface, for example once a customer display URL is known. */
export function openTab(name, url) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) {
        throw new Error("Initialize the interfaces with start_pos_multi_tab_tour first");
    }
    if (!name || document.querySelector(tabSelector(name))) {
        throw new Error(`Invalid or duplicate POS tour tab: ${name}`);
    }
    const target = new URL(url, location.href);
    if (target.origin !== location.origin) {
        throw new Error(`POS tour tabs must use the same origin: ${url}`);
    }
    const frame = document.createElement("iframe");
    frame.id = `${CONTAINER_ID}_${name}`;
    frame.name = name;
    frame.title = name;
    Object.assign(frame.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        border: "0",
        display: container.children.length ? "none" : "block",
    });
    frame.src = target.href;
    container.appendChild(frame);
    return frame;
}

/** Initialize the HTTP tour's interfaces without replacing the tour runner's document. */
export function openTabs(urls) {
    if (!Object.keys(urls).length || document.getElementById(CONTAINER_ID)) {
        throw new Error("POS tour tabs must be initialized once with at least one interface");
    }
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
        position: "fixed",
        inset: "0",
        zIndex: "10000",
        background: "white",
    });
    document.body.appendChild(container);
    for (const [name, url] of Object.entries(urls)) {
        openTab(name, url);
    }
}

/** Keep every interface running, giving the selected one the full browser viewport. */
export function switchTab(name) {
    return {
        content: `Switch to ${name}`,
        trigger: "body",
        run() {
            const frame = getTab(name);
            for (const sibling of frame.parentElement.children) {
                sibling.style.display = sibling === frame ? "block" : "none";
            }
        },
    };
}

/**
 * Scope DOM tour steps to an interface. Custom run callbacks still execute in
 * the runner: use this.anchor.ownerDocument.defaultView for the interface's
 * globals, or getTab(name).contentWindow. Steps must not unload the runner.
 */
export function inTab(name, steps) {
    const scope = (selector) => scopeSelector(name, selector);
    const keywords = ["enterprise", "community", "mobile", "desktop", "auto", "manual", "robot"];
    return [
        switchTab(name),
        ...[steps].flat(Infinity).map((step) => ({
            ...step,
            content: `[${name}] ${step.content || step.trigger || "Run"}`,
            trigger: scope(step.trigger || "body"),
            isActive: step.isActive?.map((condition) =>
                keywords.includes(condition) ? condition : scope(condition)
            ),
        })),
    ];
}
