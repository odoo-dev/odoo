/* @odoo-module */

/**
 * @typedef Data
 * @property {string} activity_category
 * @property {[number, string]} activity_type_id
 * @property {string|false} activity_decoration
 * @property {boolean} can_write
 * @property {'suggest'|'trigger'} chaining_type
 * @property {string} create_date
 * @property {[number, string]} create_uid
 * @property {string} date_deadline
 * @property {string} display_name
 * @property {boolean} has_recommended_activities
 * @property {string} icon
 * @property {number} id
 * @property {Object[]} mail_template_ids
 * @property {string} note
 * @property {number|false} previous_activity_type_id
 * @property {number|false} recommended_activity_type_id
 * @property {string} res_model
 * @property {[number, string]} res_model_id
 * @property {number} res_id
 * @property {string} res_name
 * @property {number|false} request_partner_id
 * @property {'overdue'|'planned'|'today'} state
 * @property {string} summary
 * @property {[number, string]} user_id
 * @property {string} write_date
 * @property {[number, string]} write_uid
 */

export class Activity {
    /** @type {string} */
    activity_category;
    /** @type {[number, string]} */
    activity_type_id;
    /** @type {string|false} */
    activity_decoration;
    /** @type {boolean} */
    can_write;
    /** @type {'suggest'|'trigger'} */
    chaining_type;
    /** @type {string} */
    create_date;
    /** @type {[number, string]} */
    create_uid;
    /** @type {string} */
    date_deadline;
    /** @type {string} */
    display_name;
    /** @type {boolean} */
    has_recommended_activities;
    /** @type {string} */
    feedback;
    /** @type {string} */
    icon;
    /** @type {number} */
    id;
    /** @type {Object[]} */
    mail_template_ids;
    /** @type {string} */
    note;
    /** @type {number|false} */
    previous_activity_type_id;
    /** @type {number|false} */
    recommended_activity_type_id;
    /** @type {string} */
    res_model;
    /** @type {[number, string]} */
    res_model_id;
    /** @type {number} */
    res_id;
    /** @type {string} */
    res_name;
    /** @type {number|false} */
    request_partner_id;
    /** @type {'overdue'|'planned'|'today'} */
    state;
    /** @type {string} */
    summary;
    /** @type {[number, string]} */
    user_id;
    /** @type {string} */
    write_date;
    /** @type {[number, string]} */
    write_uid;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {import("@mail/new/core/activity_model").Data} data
     * @returns {import("@mail/new/core/activity_model").Activity}
     */
    static insert(store, data) {
        const activity = store.activities[data.id] ?? new Activity(store, data);
        activity.update(data);
        return activity;
    }

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {import("@mail/new/core/activity_model").Data} data
     * @returns {import("@mail/new/core/activity_model").Activity}
     */
    constructor(store, data) {
        Object.assign(this, {
            id: data.id,
            _store: store,
        });
        store.activities[data.id] = this;
        return store.activities[data.id];
    }

    /**
     * @param {import("@mail/new/core/activity_model").Data} data
     */
    update(data) {
        const {
            activity_category = this.activity_category,
            activity_type_id = this.activity_type_id,
            activity_decoration = this.activity_decoration,
            can_write = this.can_write,
            chaining_type = this.chaining_type,
            create_date = this.create_date,
            create_uid = this.create_uid,
            date_deadline = this.date_deadline,
            display_name = this.display_name,
            has_recommended_activities = this.has_recommended_activities,
            icon = this.icon,
            mail_template_ids = this.mail_template_ids,
            note = this.note,
            previous_activity_type_id = this.previous_activity_type_id,
            recommended_activity_type_id = this.recommended_activity_type_id,
            res_model = this.res_model,
            res_model_id = this.res_model_id,
            res_id = this.res_id,
            res_name = this.res_name,
            request_partner_id = this.request_partner_id,
            state = this.state,
            summary = this.summary,
            user_id = this.user_id,
            write_date = this.write_date,
            write_uid = this.write_uid,
        } = data;
        Object.assign(this, {
            activity_category,
            activity_type_id,
            activity_decoration,
            can_write,
            chaining_type,
            create_date,
            create_uid,
            date_deadline,
            display_name,
            has_recommended_activities,
            icon,
            mail_template_ids,
            note,
            previous_activity_type_id,
            recommended_activity_type_id,
            res_model,
            res_model_id,
            res_id,
            res_name,
            request_partner_id,
            state,
            summary,
            user_id,
            write_date,
            write_uid,
        });
    }

    delete() {
        delete this._store.activities[this.id];
    }
}
