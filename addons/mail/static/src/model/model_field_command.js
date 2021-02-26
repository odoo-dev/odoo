odoo.define('mail/static/src/model/model_field_command.js', function (require) {
'use strict';

/**
 * Allows field update to detect if the value it received is a command to
 * execute (in which was it will be an instance of this class) or an actual
 * value to set (in all other cases).
 */
class FieldCommand {
    /**
     * @constructor
     * @param {Object} commandInfo information to build a command.
     * @param {string} commandInfo.name command name.
     * @param {Object|Object[]} [commandInfo.data]
     * data object or data objects array used for the command.
     * @param {function} [commandInfo.func] If set, it will be called to execute the command,
     * instead of a function generated from `commandInfo.name` and `commandInfo.data`.
     * The function should ALWAYS return a boolean value
     * to indicate whether the value changed.
     */
    constructor(commandInfo) {
        const {
            name = "",
            data = {},
            func = undefined,
        } = commandInfo;
        this._name = name;
        this._data = data;

        if (func) {
            this._func = func;
        } else {
            this._func = (field, record, options) =>
                field.set(record, [[this.name, this.data]], options)
        }
    }

    /**
     * @returns {string}
     */
    get name() {
        return this._name;
    }

    /**
     * @returns {Object|Object[]}
     */
    get data() {
        return this._data;
    }

    /**
     * @param {ModelField} field
     * @param {mail.model} record
     * @param {options} [options]
     * @returns {boolean} whether the value changed for the current field
     */
    execute(field, record, options) {
        return this._func(field, record, options);
    }
}

//--------------------------------------------------------------------------
// Attribute and relation type field commands
//--------------------------------------------------------------------------

/**
 * Returns a clear command to give to the model manager at create/update.
 */
function clear() {
    return new FieldCommand({
        name: 'clear',
        func: (field, record, options) => field.clear(record, options)
    });
}

/**
 * Retunr a noop command to give to the model manager at create/update.
 */
function noop() {
    return new FieldCommand({
        name: 'noop',
        func: () => false
    });
}

//--------------------------------------------------------------------------
// Attribute type field commands
//--------------------------------------------------------------------------

/**
 * Returns a decrement command to give to the model manager at create/update.
 *
 * @param {number} [amount=1]
 */
function decrement(amount = 1) {
    return new FieldCommand({
        name: 'decrement',
        data: amount,
        func: (field, record, options) => {
            const oldValue = field.get(record);
            return field.set(record, oldValue - amount, options);
        }
    });
}

/**
 * Returns a increment command to give to the model manager at create/update.
 *
 * @param {number} [amount=1]
 */
function increment(amount = 1) {
    return new FieldCommand({
        name: 'increment',
        data: amount,
        func: (field, record, options) => {
            const oldValue = field.get(record);
            return field.set(record, oldValue + amount, options);
        }
    });
}

//--------------------------------------------------------------------------
// Relation type field commands
//--------------------------------------------------------------------------

/**
 * Return a create command to give to the model manager at create/update.
 *
 * @param {Object|Object[]} data - data object or data objects array to create record(s)
 */
function create(data) {
    return new FieldCommand({
        name: 'create',
        data,
    });
}

/**
 * Return a insert command to give to the model manager at create/update.
 *
 * @param {Object|Object[]} data  - data object or data objects array to insert record(s)
 */
function insert(data) {
    return new FieldCommand({
        name: 'insert',
        data,
    });
}

/**
 * Return a insert-and-replace command to give to the model manager at create/update.
 *
 * @param {Object|Object[]} data - data object or data objects array to insert and replace record(s)
 */
function insertAndReplace(data) {
    return new FieldCommand({
        name: 'insert-and-replace',
        data,
    });
}

/**
 * Return a link command to give to the model manager at create/update.
 *
 * @param {mail.model|mail.model[]} data  - record or records array to be linked
 */
function link(data) {
    return new FieldCommand({
        name: 'link',
        data,
    });
}

/**
 * Return a replace command to give to the model manager at create/update.
 *
 * @param {mail.model|mail.model[]} data - record or records array to be replaced
 */
function replace(data) {
    return new FieldCommand({
        name: 'replace',
        data,
    });
}

/**
 * Return a unlink command to give to the model manager at create/update.
 *
 * @param {mail.model|mail.model[]} [data] - record or records array to be unlinked.
 *  Not used for x2one field
 */
function unlink(data) {
    return new FieldCommand({
        name: 'unlink',
        data,
    });
}

/**
 * Return a unlink-all command to give to the model manager at create/update.
 */
function unlinkAll() {
    return new FieldCommand({
        name: 'unlink-all',
    });
}

return {
    // class
    FieldCommand,
    // shortcuts
    clear,
    noop,
    decrement,
    increment,
    create,
    insert,
    insertAndReplace,
    link,
    replace,
    unlink,
    unlinkAll,
};

});
