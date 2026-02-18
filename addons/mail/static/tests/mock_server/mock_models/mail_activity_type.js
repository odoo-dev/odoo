import { fields, models } from "@web/../tests/web_test_helpers";

export class MailActivityType extends models.ServerModel {
    _name = "mail.activity.type";

    chaining_type = fields.Generic({ default: "suggest" });
    _records = [
        {
            id: 1,
            icon: "mail",
            name: "Email",
            active: true,
        },
        {
            id: 2,
            category: "phonecall",
            icon: "phone",
            name: "Call",
            active: true,
        },
        {
            id: 28,
            icon: "upload",
            name: "Upload Document",
            active: true,
        },
    ];
}
