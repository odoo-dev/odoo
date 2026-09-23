import { t, useEffect, useProps } from "@odoo/owl";
import { CodeEditor } from "@web/core/code_editor/code_editor";
import { _t } from "@web/core/l10n/translation";

const T_BANNER = t.object({
    row: t.number(),
    lines: t.array(
        t.object({
            key: t.or([t.number(), t.string()]),
            text: t.string(),
        })
    ),
});
const T_MARKER = t.object({
    row: t.number(),
    // The number displayed in the marker, if any.
    count: t.number().optional(0),
    // Whether the row can be followed to another place (displayed as an
    // arrow when there is no count).
    target: t.boolean().optional(false),
});
const T_REVEAL_ROW = t.object({
    sessionId: t.or([t.number(), t.string()]),
    row: t.number(),
    // Distinguishes successive requests to reveal the same row.
    id: t.number(),
});
const MARKER_CLASS = "o_resource_editor_marker";
// Counts above it are displayed as "<MAX_MARKER_COUNT>+".
const MAX_MARKER_COUNT = 9;
const REVEALED_ROW_CLASS = "o_resource_editor_revealed_row";
const REVEALED_ROW_DURATION = 1500;

/**
 * Code editor displaying banners below some rows, as Ace line widgets, and
 * markers with a count in the gutter of some rows, as Ace gutter decorations:
 * they are not part of the edited value, so they cannot be selected, copied,
 * searched or saved, and they do not shift line numbers.
 */
export class ResourceCodeEditor extends CodeEditor {
    resourceProps = useProps({
        // At most one banner per row. `null` keeps the current banners, which
        // Ace moves along with their row when lines are added or removed
        // above them (e.g. while the value cannot be analyzed).
        banners: t.or([t.array(T_BANNER), t.literal(null)]).optional(),
        // Called with the `key` of the clicked banner line.
        onBannerClick: t.function().optional(),
        // At most one marker per row. `null` keeps the current markers.
        markers: t.or([t.array(T_MARKER), t.literal(null)]).optional(),
        // Called with the row of the clicked marker and its gutter cell.
        onMarkerClick: t.function().optional(),
        // A row to scroll to, move the cursor to and highlight briefly, once
        // the session is displayed.
        revealRow: t.or([T_REVEAL_ROW, t.literal(null)]).optional(),
    });
    /** @type {WeakMap<Object, Object[]>} Ace session -> its banner widgets */
    bannerWidgets = new WeakMap();
    /** @type {WeakMap<Object, Set<number>>} Ace session -> its marked rows */
    markedRows = new WeakMap();
    lastRevealId = null;

    setup() {
        super.setup();

        useEffect(() => {
            const aceEditor = this.aceEditor;
            const value = this.props.value;
            const banners = this.resourceProps.banners;
            const markers = this.resourceProps.markers;
            const revealRow = this.resourceProps.revealRow;
            const sessionId = this.props.sessionId;
            if (!aceEditor) {
                return;
            }
            // The effects of the parent class switch the Ace session when the
            // resource changes, and effects run in no guaranteed order: wait
            // for them to be done.
            let cancelled = false;
            queueMicrotask(() => {
                if (!cancelled) {
                    this.updateBanners(aceEditor.getSession(), value, banners);
                    this.updateMarkers(aceEditor.getSession(), value, markers);
                    if (
                        revealRow &&
                        revealRow.id !== this.lastRevealId &&
                        revealRow.sessionId === sessionId
                    ) {
                        this.lastRevealId = revealRow.id;
                        this.revealRow(aceEditor, revealRow.row);
                    }
                }
            });
            return () => {
                cancelled = true;
            };
        });

        useEffect(() => {
            const aceEditor = this.aceEditor;
            if (!aceEditor) {
                return;
            }
            const onGutterMouseDown = (ev) => {
                const cellEl = ev.domEvent.target.closest(".ace_gutter-cell");
                if (!cellEl || ev.domEvent.target.closest(".ace_fold-widget")) {
                    return;
                }
                const row = ev.getDocumentPosition().row;
                if (this.markedRows.get(aceEditor.getSession())?.has(row)) {
                    // Do not select the row.
                    ev.stop();
                    this.resourceProps.onMarkerClick?.(row, cellEl);
                }
            };
            aceEditor.on("guttermousedown", onGutterMouseDown);
            return () => aceEditor.off("guttermousedown", onGutterMouseDown);
        });
    }

    /**
     * @param {Object} session the Ace session to display the banners in
     * @param {string} value the value the banners were computed for
     * @param {typeof T_BANNER[]|null|undefined} banners
     */
    updateBanners(session, value, banners) {
        if (banners === null || session.getValue() !== value) {
            return;
        }
        banners = (banners || []).filter(({ row }) => row < session.getLength());
        const widgetManager = session.widgetManager;
        // Ace removes the widgets of removed rows by itself.
        const widgets = (this.bannerWidgets.get(session) || []).filter(
            (widget) => widget.session === session
        );
        const toKey = (list) => JSON.stringify(list.map(({ row, lines }) => [row, lines]));
        if (toKey(widgets) === toKey(banners)) {
            return;
        }
        for (const widget of widgets) {
            widgetManager.removeLineWidget(widget);
        }
        const newWidgets = banners.map(({ row, lines }) =>
            widgetManager.addLineWidget({
                row,
                lines,
                el: this.renderBanner(lines),
                fixedWidth: true,
            })
        );
        this.bannerWidgets.set(session, newWidgets);
    }

    /**
     * @param {Object} session the Ace session to display the markers in
     * @param {string} value the value the markers were computed for
     * @param {typeof T_MARKER[]|null|undefined} markers
     */
    updateMarkers(session, value, markers) {
        if (markers === null || session.getValue() !== value) {
            return;
        }
        // Ace does not move decorations along with their row when lines are
        // added or removed: clear them from every row.
        const classNames = [MARKER_CLASS, `${MARKER_CLASS}_target`];
        for (let count = 1; count <= MAX_MARKER_COUNT + 1; count++) {
            classNames.push(`${MARKER_CLASS}_${count}`);
        }
        session.$decorations.forEach((decoration, row) => {
            if (decoration?.includes(MARKER_CLASS)) {
                for (const className of classNames) {
                    session.removeGutterDecoration(row, className);
                }
            }
        });
        const rows = new Set();
        for (const { row, count, target } of markers || []) {
            if (row >= session.getLength() || (!count && !target)) {
                continue;
            }
            session.addGutterDecoration(row, MARKER_CLASS);
            session.addGutterDecoration(
                row,
                count
                    ? `${MARKER_CLASS}_${Math.min(count, MAX_MARKER_COUNT + 1)}`
                    : `${MARKER_CLASS}_target`
            );
            rows.add(row);
        }
        this.markedRows.set(session, rows);
    }

    /**
     * @param {Object} aceEditor
     * @param {number} row
     */
    revealRow(aceEditor, row) {
        const session = aceEditor.getSession();
        if (row >= session.getLength()) {
            return;
        }
        this.setCursorPosition({ row, column: 0 });
        const markerId = session.addMarker(
            new window.ace.Range(row, 0, row, Infinity),
            REVEALED_ROW_CLASS,
            "fullLine"
        );
        setTimeout(() => session.removeMarker(markerId), REVEALED_ROW_DURATION);
    }

    /**
     * @param {{key: number|string, text: string}[]} lines
     * @returns {HTMLElement}
     */
    renderBanner(lines) {
        const bannerEl = document.createElement("div");
        bannerEl.className = "o_resource_editor_banner";
        for (const { key, text } of lines) {
            const lineEl = document.createElement("div");
            lineEl.className = "o_resource_editor_banner_line";
            const textEl = document.createElement("span");
            textEl.className = "text-truncate";
            textEl.textContent = text;
            const buttonEl = document.createElement("button");
            buttonEl.type = "button";
            buttonEl.className = "btn btn-link";
            buttonEl.textContent = _t("Open");
            buttonEl.addEventListener("click", () => this.resourceProps.onBannerClick?.(key));
            lineEl.append(textEl, buttonEl);
            bannerEl.append(lineEl);
        }
        return bannerEl;
    }
}
