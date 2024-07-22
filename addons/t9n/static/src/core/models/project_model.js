import { Record } from "@mail/core/common/record";

import { formatList } from "@web/core/l10n/utils";

export class Project extends Record {
    static name = "t9n.project";
    static id = "id";

    /** @type {string} */
    name;
    src_lang_id = Record.one("t9n.language");
    resource_ids = Record.many("t9n.resource");
    target_lang_ids = Record.many("t9n.language");

    /** @type {string} */
    targetLanguages = Record.attr("", {
        compute() {
            return formatList(this.target_lang_ids.map(({ name }) => name));
        },
    });
    /** @type {number} */
    resourceCount = Record.attr(0, {
        compute() {
            return this.resource_ids.length;
        },
    });
}

Project.register();
