/** @odoo-module alias=mail.MockModels **/

/**
 * Allows to generate mocked models that will be used by the mocked server.
 * This is defined as a class to allow patches by dependent modules and a new
 * data object is generated every time to ensure any test can modify it without
 * impacting other tests.
 */
export default class MockModels {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Returns a new data set of mocked models.
     *
     * @static
     * @returns {Object}
     */
    static generateData() {
        return {
            'ir.attachment': {
                fields: {
                    create_date: {
                        type: 'date',
                    },
                    create_uid: {
                        relation: 'res.users',
                        string: "Created By",
                        type: 'many2one',
                    },
                    datas: {
                        string: "File Content (base64)",
                        type: 'binary',
                    },
                    mimetype: {
                        string: "mimetype",
                        type: 'char',
                    },
                    name: {
                        required: true,
                        string: "attachment name",
                        type: 'char',
                    },
                    res_id: {
                        string: "res id",
                        type: 'integer',
                    },
                    res_model: {
                        string: "res model",
                        type: 'char',
                    },
                    type: {
                        selection: [['url', "URL"], ['binary', "BINARY"]],
                        type: 'selection',
                    },
                    url: {
                        string: "url",
                        type: 'char',
                    },
                },
                records: [],
            },
            'mail.activity': {
                fields: {
                    activity_category: {
                        selection: [['default', 'Other'], ['upload_file', 'Upload File']],
                        string: "Category",
                        type: 'selection',
                    },
                    activity_type_id: {
                        relation: 'mail.activity.type',
                        string: "Activity type",
                        type: 'many2one',
                    },
                    can_write: {
                        string: "Can write",
                        type: 'boolean',
                    },
                    chaining_type: {
                        default: 'suggest',
                        selection: [
                            ['suggest', "Suggest Next Activity"],
                            ['trigger', "Trigger Next Activity"],
                        ],
                        string: "Chaining Type",
                        type: 'selection',
                    },
                    create_uid: {
                        relation: 'res.users',
                        string: "Created By",
                        type: 'many2one',
                    },
                    display_name: {
                        string: "Display name",
                        type: 'char',
                    },
                    date_deadline: {
                        string: "Due Date",
                        type: 'date',
                        default() {
                            return moment().format('YYYY-MM-DD');
                        },
                    },
                    icon: { type: 'char' },
                    note: {
                        string: "Note",
                        type: 'html',
                    },
                    res_id: { type: 'integer' },
                    res_model: { type: 'char' },
                    state: {
                        selection: [
                            ['overdue', 'Overdue'],
                            ['today', 'Today'],
                            ['planned', 'Planned'],
                        ],
                        string: "State",
                        type: 'selection',
                    },
                    user_id: {
                        relation: 'res.users',
                        string: "Assigned to",
                        type: 'many2one',
                    },
                },
                records: [],
            },
            'mail.activity.type': {
                fields: {
                    category: {
                        selection: [
                            ['default', 'Other'],
                            ['upload_file', 'Upload File'],
                        ],
                        string: "Category",
                        type: 'selection',
                    },
                    chaining_type: {
                        default: 'suggest',
                        selection: [
                            ['suggest', "Suggest Next Activity"],
                            ['trigger', "Trigger Next Activity"],
                        ],
                        string: "Chaining Type",
                        type: 'selection',
                    },
                    decoration_type: {
                        selection: [['warning', 'Alert'], ['danger', 'Error']],
                        string: "Decoration Type",
                        type: 'selection',
                    },
                    icon: {
                        string: "icon",
                        type: 'char',
                    },
                    name: {
                        string: "Name",
                        type: 'char',
                    },
                },
                records: [
                    {
                        icon: 'fa-envelope',
                        id: 1,
                        name: "Email",
                    },
                ],
            },
            'mail.channel': {
                fields: {
                    // Equivalent to members but required due to some RPC giving this field in domain.
                    channel_partner_ids: {
                        relation: 'res.partner',
                        string: "Channel Partner Ids",
                        type: 'many2many',
                    },
                    channel_type: {
                        default: 'channel',
                        string: "Channel Type",
                        type: 'selection',
                    },
                    // In python this belongs to mail.channel.partner. Here for simplicity.
                    custom_channel_name: {
                        string: "Custom channel name",
                        type: 'char',
                    },
                    fetched_message_id: {
                        relation: 'mail.message',
                        string: "Last Fetched",
                        type: 'many2one',
                    },
                    group_based_subscription: {
                        default: false,
                        string: "Group based subscription",
                        type: 'boolean',
                    },
                    id: {
                        string: "Id",
                        type: 'integer',
                    },
                    // In python this belongs to mail.channel.partner. Here for simplicity.
                    is_minimized: {
                        default: false,
                        string: "isMinimized",
                        type: 'boolean',
                    },
                    // In python it is moderator_ids. Here for simplicity.
                    is_moderator: {
                        default: false,
                        string: "Is current partner moderator?",
                        type: 'boolean',
                    },
                    // In python this belongs to mail.channel.partner. Here for simplicity.
                    is_pinned: {
                        default: true,
                        string: "isPinned",
                        type: 'boolean',
                    },
                    // In python: email_send.
                    mass_mailing: {
                        default: false,
                        string: "Send messages by email",
                        type: 'boolean',
                    },
                    members: {
                        default() {
                            return [this.currentPartnerId];
                        },
                        relation: 'res.partner',
                        string: "Members",
                        type: 'many2many',
                    },
                    message_unread_counter: {
                        string: "# unread messages",
                        type: 'integer',
                    },
                    moderation: {
                        default: false,
                        string: "Moderation",
                        type: 'boolean',
                    },
                    name: {
                        required: true,
                        string: "Name",
                        type: 'char',
                    },
                    public: {
                        default: 'groups',
                        string: "Public",
                        type: 'boolean',
                    },
                    seen_message_id: {
                        relation: 'mail.message',
                        string: "Last Seen",
                        type: 'many2one',
                    },
                    // In python this belongs to mail.channel.partner. Here for simplicity.
                    state: {
                        default: 'open',
                        string: "FoldState",
                        type: 'char',
                    },
                    // naive and non RFC-compliant UUID, good enough for the
                    // string comparison that are done with it during tests
                    uuid: {
                        string: "UUID",
                        type: 'char',
                        required: true,
                        default() {
                            return _.uniqueId('mail.channel_uuid-');
                        },
                    },
                },
                records: [],
            },
            // Fake model to simulate "hardcoded" commands from python
            'mail.channel_command': {
                fields: {
                    channel_types: { type: 'binary' }, // array is expected
                    help: { type: 'char' },
                    name: { type: 'char' },
                },
                records: [],
            },
            'mail.followers': {
                fields: {
                    channel_id: { type: 'integer' },
                    email: { type: 'char' },
                    id: { type: 'integer' },
                    is_active: { type: 'boolean' },
                    is_editable: { type: 'boolean' },
                    name: { type: 'char' },
                    partner_id: { type: 'integer' },
                    res_id: { type: 'many2one_reference' },
                    res_model: { type: 'char' },
                    subtype_ids: {
                        relation: 'mail.message.subtype',
                        type: 'many2many',
                    }
                },
                records: [],
            },
            'mail.message': {
                fields: {
                    attachment_ids: {
                        default: [],
                        relation: 'ir.attachment',
                        string: "Attachments",
                        type: 'many2many',
                    },
                    author_id: {
                        default() {
                            return this.currentPartnerId;
                        },
                        relation: 'res.partner',
                        string: "Author",
                        type: 'many2one',
                    },
                    body: {
                        default: "<p></p>",
                        string: "Contents",
                        type: 'html',
                    },
                    channel_ids: {
                        string: "Channels",
                        type: 'many2many',
                        relation: 'mail.channel',
                    },
                    date: {
                        string: "Date",
                        type: 'datetime',
                    },
                    email_from: {
                        string: "From",
                        type: 'char',
                    },
                    history_partner_ids: {
                        relation: 'res.partner',
                        string: "Partners with History",
                        type: 'many2many',
                    },
                    id: {
                        string: "Id",
                        type: 'integer',
                    },
                    is_discussion: {
                        string: "Discussion",
                        type: 'boolean',
                    },
                    is_note: {
                        string: "Note",
                        type: 'boolean',
                    },
                    is_notification: {
                        string: "Notification",
                        type: 'boolean',
                    },
                    message_type: {
                        default: 'email',
                        string: "Type",
                        type: 'selection',
                    },
                    model: {
                        string: "Related Document model",
                        type: 'char',
                    },
                    needaction: {
                        string: "Need Action",
                        type: 'boolean',
                    },
                    needaction_partner_ids: {
                        relation: 'res.partner',
                        string: "Partners with Need Action",
                        type: 'many2many',
                    },
                    moderation_status: {
                        default: false,
                        selection: [
                            ['pending_moderation', "Pending Moderation"],
                            ['accepted', "Accepted"],
                            ['rejected', "Rejected"],
                        ],
                        string: "Moderation status",
                        type: 'selection',
                    },
                    notification_ids: {
                        relation: 'mail.notification',
                        string: "Notifications",
                        type: 'one2many',
                    },
                    partner_ids: {
                        relation: 'res.partner',
                        string: "Recipients",
                        type: 'many2many',
                    },
                    record_name: {
                        string: "Name",
                        type: 'char',
                    },
                    res_id: {
                        string: "Related Document ID",
                        type: 'integer',
                    },
                    // In python, result of a formatter. Here for simplicity.
                    res_model_name: {
                        string: "Res Model Name",
                        type: 'char',
                    },
                    starred_partner_ids: {
                        relation: 'res.partner',
                        string: "Favorited By",
                        type: 'many2many',
                    },
                    subject: {
                        string: "Subject",
                        type: 'char',
                    },
                    subtype_id: {
                        relation: 'mail.message.subtype',
                        string: "Subtype id",
                        type: 'many2one',
                    },
                    tracking_value_ids: {
                        relation: 'mail.tracking.value',
                        string: "Tracking values",
                        type: 'one2many',
                    },
                },
                records: [],
            },
            'mail.message.subtype': {
                fields: {
                    default: {
                        default: true,
                        type: 'boolean',
                    },
                    description: { type: 'text' },
                    hidden: { type: 'boolean' },
                    internal: { type: 'boolean' },
                    name: { type: 'char' },
                    parent_id: {
                        relation: 'mail.message.subtype',
                        type: 'many2one',
                    },
                    relation_field: { type: 'char' },
                    res_model: { type: 'char' },
                    sequence: {
                        default: 1,
                        type: 'integer',
                    },
                    // not a field in Python but xml id of data
                    subtype_xmlid: { type: 'char' },
                },
                records: [
                    {
                        name: "Discussions",
                        sequence: 0,
                        subtype_xmlid: 'mail.mt_comment',
                    },
                    {
                        default: false,
                        internal: true,
                        name: "Note",
                        sequence: 100,
                        subtype_xmlid: 'mail.mt_note',
                    },
                    {
                        default: false,
                        internal: true,
                        name: "Activities",
                        sequence: 90,
                        subtype_xmlid: 'mail.mt_activities',
                    },
                ],
            },
            'mail.notification': {
                fields: {
                    failure_type: {
                        selection: [
                            ["SMTP", "Connection failed (outgoing mail server problem)"],
                            ["RECIPIENT", "Invalid email address"],
                            ["BOUNCE", "Email address rejected by destination"],
                            ["UNKNOWN", "Unknown error"],
                        ],
                        string: "Failure Type",
                        type: 'selection',
                    },
                    is_read: {
                        default: false,
                        string: "Is Read",
                        type: 'boolean',
                    },
                    mail_message_id: {
                        relation: 'mail.message',
                        string: "Message",
                        type: 'many2one',
                    },
                    notification_status: {
                        default: 'ready',
                        selection: [
                            ['ready', 'Ready to Send'],
                            ['sent', 'Sent'],
                            ['bounce', 'Bounced'],
                            ['exception', 'Exception'],
                            ['canceled', 'Canceled'],
                        ],
                        string: "Notification Status",
                        type: 'selection',
                    },
                    notification_type: {
                        default: 'email',
                        selection: [
                            ['email', 'Handle by Emails'],
                            ['inbox', 'Handle in Odoo'],
                        ],
                        string: "Notification Type",
                        type: 'selection',
                    },
                    res_partner_id: {
                        relation: 'res.partner',
                        string: "Needaction Recipient",
                        type: 'many2one',
                    },
                },
                records: [],
            },
            'mail.shortcode': {
                fields: {
                    source: { type: 'char' },
                    substitution: { type: 'char' },
                },
                records: [],
            },
            'mail.tracking.value': {
                fields: {
                    changed_field: {
                        string: "Changed field",
                        type: 'char',
                    },
                    field_type: {
                        string: "Field type",
                        type: 'char',
                    },
                    new_value: {
                        string: "New value",
                        type: 'char',
                    },
                    old_value: {
                        string: "Old value",
                        type: 'char',
                    },
                },
                records: [],
            },
            'res.country': {
                fields: {
                    code: {
                        string: "Code",
                        type: 'char',
                    },
                    name: {
                        string: "Name",
                        type: 'char',
                    },
                },
                records: [],
            },
            'res.partner': {
                fields: {
                    active: {
                        default: true,
                        string: "Active",
                        type: 'boolean',
                    },
                    activity_ids: {
                        relation: 'mail.activity',
                        string: "Activities",
                        type: 'one2many',
                    },
                    contact_address_complete: {
                        string: "Address",
                        type: 'char',
                    },
                    country_id: {
                        relation: 'res.country',
                        string: "Country",
                        type: 'many2one',
                    },
                    description: {
                        string: 'description',
                        type: 'text',
                    },
                    display_name: {
                        string: "Displayed name",
                        type: 'char',
                    },
                    email: { type: 'char' },
                    image_128: {
                        string: "Image 128",
                        type: 'image',
                    },
                    im_status: {
                        string: "IM Status",
                        type: 'char',
                    },
                    message_attachment_count: {
                        string: 'Attachment count',
                        type: 'integer',
                    },
                    message_follower_ids: {
                        relation: 'mail.followers',
                        string: "Followers",
                        type: 'one2many',
                    },
                    message_ids: {
                        relation: 'mail.message',
                        string: "Messages",
                        type: 'one2many',
                    },
                    name: {
                        string: "Name",
                        type: 'char',
                    },
                    partner_latitude: {
                        string: "Latitude",
                        type: 'float',
                    },
                    partner_longitude: {
                        string: "Longitude",
                        type: 'float',
                    },
                },
                records: [],
            },
            'res.users': {
                fields: {
                    active: {
                        default: true,
                        string: "Active",
                        type: 'boolean',
                    },
                    display_name: {
                        string: "Display name",
                        type: 'char',
                    },
                    im_status: {
                        string: "IM Status",
                        type: 'char',
                    },
                    name: {
                        string: "Name",
                        type: 'char',
                    },
                    partner_id: {
                        string: "Related partners",
                        type: 'many2one',
                        relation: 'res.partner',
                    },
                },
                records: [],
            },
            'res.fake': {
                fields: {
                    activity_ids: {
                        relation: 'mail.activity',
                        string: "Activities",
                        type: 'one2many',
                    },
                    email_cc: { type: 'char' },
                    partner_ids: {
                        relation: 'res.partner',
                        string: "Related partners",
                        type: 'many2one',
                    },
                },
                records: [],
            },
        };
    }

}
