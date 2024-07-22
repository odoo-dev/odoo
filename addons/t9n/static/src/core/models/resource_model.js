import { Record } from "@mail/core/common/record";

export class Resource extends Record {
    static name = "t9n.resource";
    static id = "id";

    file_name;
    message_ids = Record.many("t9n.message");
    project_id = Record.one("t9n.project");
}

Resource.register();
