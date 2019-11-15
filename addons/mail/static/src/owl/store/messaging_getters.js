odoo.define('mail.store.getters', function (require) {
'use strict';

const emojis = require('mail.emojis');
const mailUtils = require('mail.utils');

const { filterObject } = require('web.utils');

/**
 * Defines an `execute` method that has to be overriden to define the desired
 * compute behavior. Allows to execute all kind of computes in a standard way.
 */
class AbstractCompute {
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @param {Object} param0.state
     * @param {Object} sourceObject - the source object on which the compute has
     *  to be executed
     * @param {Object} params - arbitraty parameters allowing the caller to
     *  adapt the result to its needs. Typically used to execute sub-computes
     *  on the result without post-processing
     */
    execute({ getters, state }, sourceObject, params) {
        throw new TypeError('AbstractCompute execute must be overriden.');
    }

}

/**
 * Follows a dynamic relation, returning one object.
 */
class RelationOne extends AbstractCompute {
    /**
     * @override
     * @param {string} sourceKey - the key in the source object containing the
     *  localId referencing the target object
     * @param {string} targetStoreKey - the top-level key of the target object
     *  in the store state
     */
    constructor(targetStoreKey, sourceKey) {
        super();
        this.targetStoreKey = targetStoreKey;
        this.sourceKey = sourceKey;
    }
    /**
     * @override
     * @returns {Object}
     */
    execute({ getters, state }, sourceObject, params) {
        return getters.getStoreObject(Object.assign({
            storeKey: this.targetStoreKey,
            localId: sourceObject[this.sourceKey],
        }, params));
    }
}

/**
 * Follows a dynamic relation, returning many objects.
 */
class RelationMany extends RelationOne {
    /**
     * @override
     * @param {string} sourceKey - the key in the source object containing the
     *  localIds referencing the target objects
     */
    constructor(targetStoreKey, sourceKey) {
        super(targetStoreKey, sourceKey);
    }
    /**
     * @override
     * @returns {Object[]}
     */
    execute({ getters, state }, sourceObject, params) {
        return getters.getStoreObjects(Object.assign({
            storeKey: this.targetStoreKey,
            localIds: sourceObject[this.sourceKey],
        }, params));
    }
}

/**
 * Follows a pre-defined sub-key, simply returning a sub-object.
 */
class SubKey extends AbstractCompute {
    /**
     * @override
     * @param {string} targetKey - the target key on the source object
     * @param {Object[]} targetDescription - the computes that are available on the
     *  target object
     */
    constructor(targetKey, targetDescription) {
        super();
        this.targetKey = targetKey;
        this.targetDescription = targetDescription;
    }
    /**
     * @override
     * @returns {Object}
     */
    execute({ getters, state }, sourceObject, params) {
        return getters.processStoreObject(Object.assign({
            storeObject: sourceObject[this.targetKey],
            storeObjectDescription: this.targetDescription,
        }, params));
    }

}

/**
 * Follows a dynamic key, returning a sub-object.
 */
class FollowKey extends AbstractCompute {
    /**
     * @override
     * @param {string} sourceKey - the key in the source object containing the
     *  key referencing the target object
     * @param {string} targetKey - the key in the source object containing the
     *  key to follow on the target object
     * @param {Object[]} targetDescription - the computes that are available on the
     *  target object
     */
    constructor(sourceKey, targetKey, targetDescription) {
        super();
        this.sourceKey = sourceKey;
        this.targetKey = targetKey;
        this.targetDescription = targetDescription;
    }
    /**
     * @override
     * @returns {Object}
     */
    execute({ getters, state }, sourceObject, params) {
        return getters.processStoreObject(Object.assign({
            storeObject: sourceObject[this.sourceKey][this.targetKey],
            storeObjectDescription: this.targetDescription,
        }, params));
    }

}

class ComputeFn extends AbstractCompute {

    constructor(computeFn) {
        super();
        this.computeFn = computeFn;
    }

    execute({ getters, state }, sourceObject, params) {
        return this.computeFn({ getters, state }, sourceObject, params);
    }

}


/**
 * Define the compute methods that are allowed on each of the top-level store
 * objects, and how they should operate.
 *
 * top-level keys: the corresponding top-level objects in the store state
 * 2nd-level keys: the name of the compute, which will be the key on which the
 *  result of the compute will be stored on the resulting objects
 */
const storeObjectDescriptions = {
    'chatWindowManager': {
        computes: {
            'computed': new SubKey('computed', {
                computes: {
                    'hidden': new SubKey('hidden'),
                },
            }),
        },
    },
    'composers': {
        computes: {
            'thread': new RelationOne('threads', 'threadLocalId'),
        },
    },
    'discuss': {
        computes: {
            'activeThread': new RelationOne('threads', 'activeThreadLocalId'),
            'activeThreadCacheLocalId': new ComputeFn((param0, discuss, params) => {
                if (discuss.activeThread) {
                    // TODO SEB cacheLocalIds is probably not available due to filtering
                    // TODO SEB this should probably define activeThread.cacheLocalIds as a dependency
                    return discuss.activeThread.cacheLocalIds[discuss.stringifiedDomain];
                }
            }),
            'activeThreadCache': new RelationOne('threadCaches', 'activeThreadCacheLocalId'),
        },
    },
    'messages': {
        computes: {
            'attachments': new RelationMany('attachments', 'attachmentLocalIds'),
            'author': new RelationOne('partners', 'authorLocalId'),
            'originThread': new RelationOne('threads', 'originThreadLocalId'),
        },
    },
    'threads': {
        computes: {
            'threadCacheLocalId': new ComputeFn((param0, thread, params) => {
                return thread.cacheLocalIds[params.stringifiedDomain];
            }),
            'threadCache': new RelationOne('threadCaches', 'threadCacheLocalId'),
            'directPartner': new RelationOne('partners', 'directPartnerLocalId'),
        },
    },
    'threadCaches': {
        computes: {
            'messages': new RelationMany('messages', 'messageLocalIds'),
        },
    },
};

const getters = {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} attachmentLocalId
     * @return {string}
     */
    attachmentDisplayName({ state }, attachmentLocalId) {
        const attachment = state.attachments[attachmentLocalId];
        return attachment.name || attachment.filename;
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} attachmentLocalId
     * @return {string|undefined}
     */
    attachmentExtension({ state }, attachmentLocalId) {
        const attachment = state.attachments[attachmentLocalId];
        return attachment.filename && attachment.filename.split('.').pop();
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} atttachmentLocalId
     * @param {string|undefined}
     */
    attachmentMediaType({ state }, attachmentLocalId) {
        const attachment = state.attachments[attachmentLocalId];
        return attachment.mimetype && attachment.mimetype.split('/').shift();
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {integer} param1.resId
     * @param {string} param1.resModel
     * @return {mail.store.model.Attachment[]}
     */
    attachments({ state }, { resId, resModel }) {
        return Object
            .values(state.attachments)
            .filter(attachment => attachment.res_id === resId && attachment.res_model === resModel)
            .sort((att1, att2) => att1.id < att2.id ? -1 : 1);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {mail.store.model.Thread[]} ordered list of channels
     */
    channelList({ getters }) {
        const channels = getters.channels();
        return Object
            .values(channels)
            .sort((channel1, channel2) => {
                const channel1Name = getters.threadName(channel1.localId);
                const channel2Name = getters.threadName(channel2.localId);
                channel1Name < channel2Name ? -1 : 1;
            });
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @return {Object} filtered threads that are channels
     */
    channels({ state }) {
        return filterObject(state.threads, thread =>
            thread.channel_type === 'channel'
        );
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @param {string} partnerLocalId
     * @return {mail.store.model.Thread|undefined}
     */
    chatFromPartner({ getters }, partnerLocalId) {
        return getters.chatList().find(chat => chat.directPartnerLocalId === partnerLocalId);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {mail.store.model.Thread[]} ordered list of chats
     */
    chatList({ getters }) {
        const chats = getters.chats();
        return Object
            .values(chats)
            .sort((chat1, chat2) => {
                const chat1Name = getters.threadName(chat1.localId);
                const chat2Name = getters.threadName(chat2.localId);
                chat1Name < chat2Name ? -1 : 1;
            });
    },
    /**
     * @private
     * @param {Object} param0
     * @param {Object} param0.state
     * @return {Object} filtered threads that are chats
     */
    chats({ state }) {
        return filterObject(state.threads, thread =>
            thread.channel_type === 'chat'
        );
    },
    /**
     * @see processStoreObjects, but returning only a single object instead of
     *  an array.
     *
     * @param {string} param1.storeObject - object to process
     *
     * @returns - object or primitive type depending on the given storeObject
     */
    processStoreObject({ getters }, { storeObject, keys, computes, storeObjectDescription }) {
        const storeObjects = [storeObject];
        return getters.processStoreObjects({
            storeObjects, keys, computes, storeObjectDescription,
        })[0];
    },
    /**
     * Processes and returns store objects based on the given parameters.
     *
     * @param {Object} param0
     * @param {Object} param0.getters
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {Object[]} param1.storeObjects - array of objects to process
     * @param {string[]} [param1.keys] - keys to return, all keys are returned
     *  if not provided
     * @param {Object[]} [param1.computes] - computes to execute and return
     * @param {Object} [param1.storeObjectDescription] - description of defaults
     *  and computes available on the storeObjects
     *
     * @returns {Array} array of objects or primitive types depending on the
     *  given storeObjects
     */
    processStoreObjects({ getters, state }, { storeObjects, keys = [], computes = [], storeObjectDescription }) {
        const filterKeys = [...keys];
        // avoid modifying store state, assuming shallow copy is enough
        const resObjects = storeObjects.map(o => o ? Object.assign({}, o) : o);

        storeObjectDescription = Object.assign({
            computes: {}, defaults: {},
        }, storeObjectDescription);

        // TODO SEB for each compute, read its dependencies
        // for each dependency, if it wasn't already computed
        // plan to compute it before the parent compute
        // nested for dependencies of dependencies
        // if the compute was planned but with other fields/sub computes,
        // add them to what has to be done

        // execute computes, in the same order as they are defined
        // a compute can be based on the result of a previous compute
        for (const compute of computes) {
            // keep the result of the compute on the final filter
            filterKeys.push(compute.name);
            for (const resObject of resObjects) {
                // don't process undefined input
                if (!resObject) {
                    continue;
                }
                resObject[compute.name] = storeObjectDescription.computes[compute.name].execute(
                    { getters, state },
                    resObject,
                    compute
                );
            }
        }

        // fill defaults
        for (const defaultIndex in storeObjectDescription.defaults) {
            for (const resObject of resObjects) {
                if (resObject && resObject[defaultIndex] === undefined) {
                    resObject[defaultIndex] = resObject[storeObjectDescription.defaults[defaultIndex]];
                }
            }
        }

        // filter result keys
        return resObjects.map(resObject => {
            let filteredObject = resObject;
            // don't process undefined input, don't filter if no keys given
            if (resObject && keys.length) {
                filteredObject = {};
                for (const key of filterKeys) {
                    // TODO SEB handle deep copy? for example with arrays
                    filteredObject[key] = resObject[key];
                }
            }
            return filteredObject;
        });

        // TODO SEB it would be nice if the result of this method was cached and
        // could be compared with strict equality as long as it does not change
    },
    getTopLevelStoreObject({ getters, state }, { storeKey, keys, computes }) {
        const storeObjectDescription = storeObjectDescriptions[storeKey];

        const storeObject = state[storeKey];

        if (!storeObject) {
            throw new Error(`The requested root object ${storeKey} was not found in the store.`);
        }

        return getters.processStoreObject({
            storeObject, keys, computes, storeObjectDescription,
        });
    },
    /**
     * @see getStoreObjects, but returning only a single element instead of an
     *  array.
     *
     * @param {string} param1.localId - assuming the target element is an
     *  array or an object, returns data based on its `localId` sub-element.
     *
     * @returns - object or primitive type depending on the target store key
     */
    getStoreObject({ getters }, { storeKey, localId, keys, computes }) {
        const localIds = [localId];
        return getters.getStoreObjects({ storeKey, localIds, keys, computes })[0];
    },
    /**
     * Returns store data based on the given parameters.
     *
     * @param {Object} param0
     * @param {Object} param0.getters
     * @param {Object} param0.state
     * @param {Object} param1
     * @param {string} param1.storeKey - returns data based on the `storeKey`
     *  element of `state``
     * @param {string[]} param1.localIds - assuming the target element is an
     *  array or an object, returns an array of data based on each of its
     *  sub-elements in `localIds`.
     * @param {string[]} [param1.keys] - the returned elements will only
     *  contain the keys specified in `keys` (and in `computes`).
     * @param {Object[]} [param1.computes] - if the target elements defines the
     *  given `computes`, they are followed, and their result is returned
     *  together with the `keys`.
     *  Each compute is an object that must contain the `name` of the compute,
     *  and optionally selected `keys` and nested `computes`.
     *
     * @returns {Array} array of objects or primitive types depending on the
     *  target store key
     */
    getStoreObjects({ getters, state }, { storeKey, localIds, keys, computes }) {
        const storeObjectDescription = storeObjectDescriptions[storeKey];

        const rootStoreObject = state[storeKey];

        if (!rootStoreObject) {
            throw new Error(`The requested root object ${storeKey} was not found in the store.`);
        }

        const storeObjects = [];

        for (const localId of localIds) {
            const storeObject = rootStoreObject[localId];
            if (localId && !storeObject) {
                console.error(`The requested object ${storeKey} ${localId} was not found in the store.`);
            }
            storeObjects.push(storeObject);
        }

        return getters.processStoreObjects({
            storeObjects, keys, computes, storeObjectDescription,
        });
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {integer}
     */
    globalThreadUnreadCounter({ getters, state }) {
        const unreadMailChannelCounter = getters.mailChannelList()
            .reduce((acc, mailChannel) => {
                if (mailChannel.message_unread_counter > 0) {
                    acc++;
                }
                return acc;
            }, 0);
        const mailboxInboxCounter = state.threads['mail.box_inbox'].counter;
        return unreadMailChannelCounter + mailboxInboxCounter;
    },
    /**
     * @return {boolean}
     */
    haveVisibleChatWindows({ state }) {
        return state.chatWindowManager.computed.visible.length > 0;
    },
    /**
     * @param {Object} param0
     * @param {Object} param1
     * @return {mail.store.model.Attachment[]} image attachments of the record
     */
    imageAttachments({ getters }, { resId, resModel }) {
        return getters
            .attachments({ resId, resModel })
            .filter(attachment => getters.attachmentMediaType(attachment.localId) === 'image');
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} attachmentLocalId
     * @return {boolean}
     */
    isAttachmentLinkedToComposer({ state }, attachmentLocalId) {
        const attachment = state.attachments[attachmentLocalId];
        return !!attachment.composerId;
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {mail.store.model.Thread[]} ordered list of mailboxes
     */
    mailboxList({ getters }) {
        const mailboxes = getters.mailboxes();
        return Object
            .values(mailboxes)
            .sort((mailbox1, mailbox2) => {
                if (mailbox1.localId === 'mail.box_inbox') {
                    return -1;
                }
                if (mailbox2.localId === 'mail.box_inbox') {
                    return 1;
                }
                if (mailbox1.localId === 'mail.box_starred') {
                    return -1;
                }
                if (mailbox2.localId === 'mail.box_starred') {
                    return 1;
                }
                const mailbox1Name = getters.threadName(mailbox1.localId);
                const mailbox2Name = getters.threadName(mailbox2.localId);
                mailbox1Name < mailbox2Name ? -1 : 1;
            });
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @return {Object} filtered threads that are mailboxes
     */
    mailboxes({ state }) {
        return filterObject(state.threads, thread =>
            thread._model === 'mail.box'
        );
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @return {mail.store.model.Thread[]} filtered threads that are mail.channels
     */
    mailChannelList({ getters }) {
        const mailChannels = getters.mailChannels();
        return Object
            .values(mailChannels)
            .sort((mailChannel1, mailChannel2) => {
                if (
                    mailChannel1.message_unread_counter &&
                    !mailChannel2.message_unread_counter
                ) {
                    return -1;
                }
                if (
                    mailChannel2.message_unread_counter &&
                    !mailChannel1.message_unread_counter
                ) {
                    return 1;
                }
                if (
                    mailChannel1.message_unread_counter &&
                    mailChannel2.message_unread_counter &&
                    mailChannel1.message_unread_counter !== mailChannel2.message_unread_counter
                ) {
                    return mailChannel1.message_unread_counter > mailChannel2.message_unread_counter ? -1 : 1;
                }
                const mailChannel1Name = getters.threadName(mailChannel1.localId);
                const mailChannel2Name = getters.threadName(mailChannel2.localId);
                mailChannel1Name < mailChannel2Name ? -1 : 1;
            });
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @return {Object} filtered threads that are mail.channels
     */
    mailChannels({ state }) {
        return filterObject(state.threads, thread =>
            thread._model === 'mail.channel'
        );
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} messageLocalId
     * @return {string}
     */
    messagePrettyBody({ state }, messageLocalId) {
        const message = state.messages[messageLocalId];
        let prettyBody;
        for (const emoji of emojis) {
            const { unicode } = emoji;
            const regexp = new RegExp(
                `(?:^|\\s|<[a-z]*>)(${unicode})(?=\\s|$|</[a-z]*>)`,
                "g"
            );
            const originalBody = message.body;
            prettyBody = message.body.replace(
                regexp,
                ` <span class="o_mail_emoji">${unicode}</span> `
            );
            // Idiot-proof limit. If the user had the amazing idea of
            // copy-pasting thousands of emojis, the image rendering can lead
            // to memory overflow errors on some browsers (e.g. Chrome). Set an
            // arbitrary limit to 200 from which we simply don't replace them
            // (anyway, they are already replaced by the unicode counterpart).
            if (_.str.count(prettyBody, "o_mail_emoji") > 200) {
                prettyBody = originalBody;
            }
        }
        // add anchor tags to urls
        return mailUtils.parseAndTransform(prettyBody, mailUtils.addLink);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @param {Object} param1
     * @param {integer} param1.resId
     * @param {string} param1.resModel
     * @return {mail.store.model.Attachment[]} non-image attachments of the record
     */
    nonImageAttachments({ getters }, { resId, resModel }) {
        return getters
            .attachments({ resId, resModel })
            .filter(attachment => getters.attachmentMediaType(attachment.localId) !== 'image');
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} partnerLocalId
     * @return {string}
     */
    partnerName({ state }, partnerLocalId) {
        const partner = state.partners[partnerLocalId];
        return partner.name || partner.display_name;
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {mail.store.model.Thread[]} ordered list of pinned channels
     */
    pinnedChannelList({ getters }) {
        return getters.channelList().filter(channel => channel.isPinned);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {Object} filtered channels that are pinned
     */
    pinnedChannels({ getters }) {
        const channels = getters.channels();
        return filterObject(channels, channel =>
            channel.isPinned
        );
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {mail.store.model.Thread[]} ordered list of pinned chats
     */
    pinnedChatList({ getters }) {
        return getters.chatList().filter(chat => chat.isPinned);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {Object} filtered chats that are pinned
     */
    pinnedChats({ getters }) {
        const chats = getters.chats();
        return filterObject(chats, chat =>
            chat.isPinned
        );
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {mail.store.model.Thread[]} ordered list of pinned mailboxes
     */
    pinnedMailboxList({ getters }) {
        return getters.mailboxList().filter(mailbox => mailbox.isPinned);
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.getters
     * @return {Object} filtered mailboxes that are pinned
     */
    pinnedMailboxes({ getters }) {
        const mailboxes = getters.mailboxes();
        return filterObject(mailboxes, mailBox =>
            mailBox.isPinned
        );
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @return {integer}
     */
    pinnedMailChannelAmount({ getters }) {
        const pinnedChannelAmount = getters.pinnedChannelList().length;
        const pinnedChatAmount = getters.pinnedChatList().length;
        return pinnedChannelAmount + pinnedChatAmount;
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @return {Object} filtered threads that are pinned
     */
    pinnedThreads({ state }) {
        return filterObject(state.threads, thread =>
            thread.isPinned
        );
    },
    /**
     * @param {Object} param0
     * @param {Object} param0.state
     * @param {string} threadLocalId
     * @return {string}
     */
    threadName({ state }, threadLocalId) {
        const thread = state.threads[threadLocalId];
        if (thread.channel_type === 'chat' && thread.directPartnerLocalId) {
            const directPartner = state.partners[thread.directPartnerLocalId];
            return thread.custom_channel_name || directPartner.name;
        }
        return thread.name;
    },
};

return getters;

});
