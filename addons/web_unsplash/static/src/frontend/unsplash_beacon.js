import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { rpc } from "@web/core/network/rpc";

export class UnsplashBeacon extends Interaction {
    static selector = "#wrapwrap";

    start() {
        var unsplashImages = Array.from(this.el.querySelector('img[src*="/unsplash/"]')).map((img) => {
            // extract the image id from URL (`http://www.domain.com:1234/unsplash/xYdf5feoI/lion.jpg` -> `xYdf5feoI`)
            return img.src.split('/unsplash/')[1].split('/')[0];
        });
        if (unsplashImages.length) {
            rpc('/web_unsplash/get_app_id').then(function (appID) {
                if (!appID) {
                    return;
                }

                fetch('https://views.unsplash.com/v', {
                    'photo_id': unsplashImages.join(','),
                    'app_id': appID,
                })
            });
        }
    }
}
registry
    .category("public.interactions")
    .add("web_unsplash.unsplash_beacon", UnsplashBeacon);
