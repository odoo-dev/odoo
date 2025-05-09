// If an image is wrapped inside an <a> tag, we need to remove the anchor tag
// when replacing the image with a video or document. Keeping the anchor can
// interfere with file downloads or is unnecessary for video playback.
export function removeAnchorForNonImageMedia(element) {
    const parentEl = element?.parentElement;
    if (parentEl?.tagName === "A" && parentEl?.children.length === 1) {
        // If an image is wrapped in an <a> tag, we remove the link when
        // replacing it with a video or document.
        parentEl.replaceWith(parentEl.firstElementChild);
    }
}
