import { Record } from "@mail/model/export";

export class WebsitePage extends Record {
    static _name = "website.page";

    /** @type {string} */
    name;
    /** @type {string} */
    website_absolute_url;
}

WebsitePage.register();
