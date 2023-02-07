/** @odoo-module **/

import {assets} from "@web/core/assets";

const loadXML = assets.loadXML;
assets.loadXML = function (xml, app) {
    loadXML(xml, app);

    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const qwebTemplates = document.createElement("templates");
    for (const element of doc.querySelectorAll("templates > [t-name]:not([owl]), templates > [t-extend]:not([owl])")) {
        qwebTemplates.appendChild(element);
    }

    // don't use require to apply the patch before the first template loading.
    odoo.ready('@web/legacy/js/services/core').then(function () {
        const { qweb } = odoo.loader.modules.get("@web/legacy/js/services/core");
        qweb.add_template(qwebTemplates);
    });
}
