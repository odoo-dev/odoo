// Links rendered with the QWeb `nocrawl(url)` helper hide their real URL in
// the fragment (`href="#nc=/shop?order=name+asc"`). Crawlers drop fragments,
// so they never discover these URLs. Humans get the real href right before
// the click lands, keeping click, middle click, ctrl+click, "open in new tab"
// and keyboard navigation native.
const PREFIX = "#nc=";

function revealHref(ev) {
    const link = ev.target.closest?.(`a[href^="${PREFIX}"]`);
    if (link) {
        link.setAttribute("href", link.getAttribute("href").slice(PREFIX.length));
    }
}

function redirectFromHash() {
    // A `#nc=` URL was opened directly (copied link, inline `location.href`).
    if (location.hash.startsWith(PREFIX)) {
        location.replace(location.hash.slice(PREFIX.length));
    }
}

// Run before any click handler bound on the link itself.
document.addEventListener("pointerdown", revealHref, true);
document.addEventListener("focusin", revealHref, true);
window.addEventListener("hashchange", redirectFromHash);
redirectFromHash();
