import { Record } from "@mail/core/common/record";

export class Language extends Record {
    static name = "t9n.language";
    static id = "id";

    name;
    code;
    native_name;
    direction;
}

Language.register();
