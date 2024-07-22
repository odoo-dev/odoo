import { Record } from "@mail/core/common/record";

export class Translation extends Record {
    static name = "t9n.translation";
    static id = "id";

    body;
    source_id = Record.one("t9n.message", {
        inverse: "translation_ids",
    });
    lang_id = Record.one("t9n.language");
}

Translation.register();
