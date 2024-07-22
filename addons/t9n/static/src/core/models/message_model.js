import { Record } from "@mail/core/common/record";

export class Message extends Record {
    static name = "t9n.message";
    static id = "id";

    body;
    context;
    translator_comments;
    extracted_comments;
    references;
    resource_id = Record.one("t9n.resource");
    translation_ids = Record.many("t9n.translation", {
        inverse: "source_id",
    });
    translationsInCurrentLanguage = Record.many("t9n.translation", {
        compute() {
            const { activeLanguage } = this.store.t9n;
            return this.translation_ids.filter(({ lang_id }) => lang_id.eq(activeLanguage));
        },
    });
}

Message.register();
