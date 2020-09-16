/** @odoo-module alias=mail.models.Record.actions.doAsync **/

import RecordDeletedError from 'mail.classes.RecordDeletedError';
import action from 'mail.action.define';

/**
 * Perform an async function and wait until it is done. If the record
 * is deleted, it raises a RecordDeletedError.
 */
export default action({
    name: 'Record/doAsync',
    id: 'mail.models.Record.actions.doAsync',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Record} record
     * @param {function} func an async function
     * @throws {RecordDeletedError} in case the current record is not alive
     *   at the end of async function call, whether it's resolved or
     *   rejected.
     * @throws {any} forwards any error in case the current record is still
     *   alive at the end of rejected async function call.
     * @returns {any} result of resolved async function.
     */
    async func(
        { env },
        record,
        func,
    ) {
        return new Promise(
            (resolve, reject) => {
                Promise.resolve(func()).then(
                    result => {
                        if (
                            env.services.action.dispatch(
                                'Record/exists',
                                record.localId,
                            )
                        ) {
                            resolve(result);
                        } else {
                            reject(new RecordDeletedError(record.localId));
                        }
                    },
                ).catch(
                    error => {
                        if (
                            env.services.action.dispatch(
                                'Record/exists',
                                record.localId,
                            )
                        ) {
                            reject(error);
                        } else {
                            reject(new RecordDeletedError(record.localId));
                        }
                    },
                );
            },
        );
    },
});
