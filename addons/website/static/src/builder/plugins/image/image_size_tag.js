import { Component, useState } from "@odoo/owl";
import { useDomState } from "@html_builder/core/utils";
import { loadImageDataURL, getImageSizeFromCache } from "@html_editor/utils/image_processing";
import { KeepLast } from "@web/core/utils/concurrency";

export class ImageSizeTag extends Component {
    static template = "website.ImageSizeTag";
    setup() {
        this.keepLast = new KeepLast();
        this.state = useState({ size: 0 });
        useDomState((imageEl) => this.updateImageSize(imageEl));
        this.updateImageSize(this.env.getEditingElement());
    }

    async updateImageSize(imageEl) {
        const src = imageEl.src;
        await this.keepLast.add(loadImageDataURL(src));
        this.state.size = Math.round((getImageSizeFromCache(src) / 1024) * 10) / 10;
    }
}
