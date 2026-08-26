import { loadImage } from "@html_editor/utils/image_processing";

async function getImageDimensions(imgEl) {
    if (!imgEl.hasAttribute("src")) {
        return { naturalHeight: null, naturalWidth: null };
    }

    if (!imgEl.complete) {
        const { naturalHeight, naturalWidth } = await loadImage(imgEl.getAttribute("src"));
        return { naturalHeight, naturalWidth };
    }

    const { naturalHeight, naturalWidth } = imgEl;
    return { naturalHeight, naturalWidth };
}

export async function addDimensionsToImages(elements = []) {
    const imgEls = Object.values(elements)
        .flat()
        .flatMap((el) => [
            ...(el.matches("img.img-fluid") ? [el] : []),
            ...el.querySelectorAll("img.img-fluid"),
        ]);
    return await Promise.all(
        imgEls.map(async (imgEl) => {
            const { naturalHeight, naturalWidth } = await getImageDimensions(imgEl);
            if (naturalHeight && naturalWidth) {
                imgEl.setAttribute("height.translate", naturalHeight);
                imgEl.setAttribute("width.translate", naturalWidth);
                imgEl.classList.add("img-optimized");
            }
        })
    );
}
