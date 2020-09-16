/** @odoo-module alias=mail.components.MessageList **/

import useRefs from 'mail.componentHooks.useRefs';
import useRenderedValues from 'mail.componentHooks.useRenderedValues';
import useUpdate from 'mail.componentHooks.useUpdate';
import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;
const { useRef } = owl.hooks;

class MessageList extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this._getRefs = useRefs();
        /**
         * States whether there was at least one programmatic scroll since the
         * last scroll event was handled (which is particularly async due to
         * throttled behavior).
         * Useful to avoid loading more messages or to incorrectly disabling the
         * auto-scroll feature when the scroll was not made by the user.
         */
        this._isLastScrollProgrammatic = false;
        /**
         * Reference of the "load more" item. Useful to trigger load more
         * on scroll when it becomes visible.
         */
        this._loadMoreRef = useRef('loadMore');
        /**
         * Snapshot computed during willPatch, which is used by patched.
         */
        this._willPatchSnapshot = undefined;
        this._onScrollThrottled = _.throttle(this._onScrollThrottled.bind(this), 100);
        /**
         * State used by the component at the time of the render. Useful to
         * properly handle async code.
         */
        this._lastRenderedValues = useRenderedValues(
            () => {
                const threadView = this.threadView;
                const thread = threadView?.$$$thread(this);
                const threadCache = threadView?.$$$threadCache(this);
                return {
                    componentHintList: threadView ? [...threadView.$$$componentHintList(this)] : [],
                    hasAutoScrollOnMessageReceived: threadView?.$$$hasAutoScrollOnMessageReceived(this),
                    hasScrollAdjust: this.hasScrollAdjust,
                    mainCache: thread?.$$$mainCache(this),
                    order: this.order,
                    orderedMessages: threadCache ? [...threadCache.$$$orderedMessages(this)] : [],
                    thread,
                    threadCache,
                    threadCacheInitialScrollHeight: threadView?.$$$threadCacheInitialScrollHeight(this),
                    threadCacheInitialScrollPosition: threadView?.$$$threadCacheInitialScrollPosition(this),
                    threadView,
                    threadViewer: threadView?.$$$threadViewer(this),
                };
            },
        );
        // useUpdate must be defined after useRenderedValues to guarantee proper
        // call order
        useUpdate({ func: () => this._update() });
    }

    willPatch() {
        const lastMessageRef = this.lastMessageRef;
        this._willPatchSnapshot = {
            isLastMessageVisible:
                lastMessageRef &&
                lastMessageRef.isBottomVisible({ offset: 10 }),
            scrollHeight: this.el.scrollHeight,
            scrollTop: this.el.scrollTop,
        };
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Update the scroll position of the message list.
     * This is not done in patched/mounted hooks because scroll position is
     * dependent on UI globally. To illustrate, imagine following UI:
     *
     * +----------+ < viewport top = scrollable top
     * | message  |
     * |   list   |
     * |          |
     * +----------+ < scrolltop = viewport bottom = scrollable bottom
     *
     * Now if a composer is mounted just below the message list, it is shrinked
     * and scrolltop is altered as a result:
     *
     * +----------+ < viewport top = scrollable top
     * | message  |
     * |   list   | < scrolltop = viewport bottom  <-+
     * |          |                                  |-- dist = composer height
     * +----------+ < scrollable bottom            <-+
     * +----------+
     * | composer |
     * +----------+
     *
     * Because of this, the scroll position must be changed when whole UI
     * is rendered. To make this simpler, this is done when <ThreadView/>
     * component is patched. This is acceptable when <ThreadView/> has a
     * fixed height, which is the case for the moment. task-2358066
     */
    adjustFromComponentHints() {
        const { componentHintList, threadView } = this._lastRenderedValues();
        for (const hint of componentHintList) {
            switch (hint.type) {
                case 'change-of-thread-cache':
                case 'home-menu-hidden':
                case 'home-menu-shown':
                    // thread just became visible, the goal is to restore its
                    // saved position if it exists or scroll to the end
                    this._adjustScrollFromModel();
                    break;
                case 'message-received':
                case 'messages-loaded':
                case 'new-messages-loaded':
                    // messages have been added at the end, either scroll to the
                    // end or keep the current position
                    this._adjustScrollForExtraMessagesAtTheEnd();
                    break;
                case 'more-messages-loaded':
                    this._adjustFromMoreMessagesLoaded(hint);
                    break;
            }
            this.env.services.action.dispatch('ThreadView/markComponentHintProcessed', threadView, hint);
        }
        this._willPatchSnapshot = undefined;
    }

    /**
     * @param {Message} message
     * @returns {string}
     */
    getDateDay(message) {
        const date = message.$$$date(this).format('YYYY-MM-DD');
        if (date === moment().format('YYYY-MM-DD')) {
            return this.env._t("Today");
        } else if (
            date === moment()
                .subtract(1, 'days')
                .format('YYYY-MM-DD')
        ) {
            return this.env._t("Yesterday");
        }
        return message.$$$date(this).format('LL');
    }

    /**
     * @returns {integer}
     */
    getScrollHeight() {
        return this.el.scrollHeight;
    }

    /**
     * @returns {integer}
     */
    getScrollTop() {
        return this.el.scrollTop;
    }

    /**
     * @returns {mail.components.Message|undefined}
     */
    get mostRecentMessageRef() {
        const { order } = this._lastRenderedValues();
        if (order === 'desc') {
            return this.messageRefs[0];
        }
        const {
            length: l,
            [l - 1]: mostRecentMessageRef,
        } = this.messageRefs;
        return mostRecentMessageRef;
    }

    /**
     * @param {integer} messageId
     * @returns {mail.components.Message|undefined}
     */
    messageRefFromId(messageId) {
        return this.messageRefs.find(
            ref => ref.message.$$$id(this) === messageId,
        );
    }

    /**
     * Get list of sub-components Message, ordered based on prop `order`
     * (ASC/DESC).
     *
     * The asynchronous nature of OWL rendering pipeline may reveal disparity
     * between knowledgeable state of store between components. Use this getter
     * with extreme caution!
     *
     * Let's illustrate the disparity with a small example:
     *
     * - Suppose this component is aware of ordered (record) messages with
     *   following IDs: [1, 2, 3, 4, 5], and each (sub-component) messages map
     * each of these records.
     * - Now let's assume a change in store that translate to ordered (record)
     *   messages with following IDs: [2, 3, 4, 5, 6].
     * - Because store changes trigger component re-rendering by their "depth"
     *   (i.e. from parents to children), this component may be aware of
     *   [2, 3, 4, 5, 6] but not yet sub-components, so that some (component)
     *   messages should be destroyed but aren't yet (the ref with message ID 1)
     *   and some do not exist yet (no ref with message ID 6).
     *
     * @returns {mail.components.Message[]}
     */
    get messageRefs() {
        const { order } = this._lastRenderedValues();
        const refs = this._getRefs();
        const ascOrderedMessageRefs = Object.entries(refs)
            .filter(
                ([refId, ref]) => (
                    // Message refs have message local id as ref id, and message
                    // local ids contain name of model 'Message'.
                    refId.includes('Message') &&
                    // Component that should be destroyed but haven't just yet.
                    ref.message
                ),
            )
            .map(
                ([refId, ref]) => ref,
            )
            .sort(
                (ref1, ref2) => (
                    ref1.message.$$$id(this) < ref2.message.$$$id(this)
                    ? -1
                    : 1
                ),
            );
        if (order === 'desc') {
            return ascOrderedMessageRefs.reverse();
        }
        return ascOrderedMessageRefs;
    }

    /**
     * @returns {Message[]}
     */
    get orderedMessages() {
        const threadCache = this.threadView.$$$threadCache(this);
        if (this.order === 'desc') {
            return [...threadCache.$$$orderedMessages(this)].reverse();
        }
        return threadCache.$$$orderedMessages(this);
    }

    /**
     * @param {integer} value
     */
    setScrollTop(value) {
        if (this.el.scrollTop === value) {
            return;
        }
        this._isLastScrollProgrammatic = true;
        this.el.scrollTop = value;
    }

    /**
     * @param {Message} prevMessage
     * @param {Message} message
     * @returns {boolean}
     */
    shouldMessageBeSquashed(prevMessage, message) {
        if (!this.hasSquashCloseMessages) {
            return false;
        }
        if (Math.abs(message.$$$date(this).diff(prevMessage.$$$date(this))) > 60000) {
            // more than 1 min. elasped
            return false;
        }
        if (
            prevMessage.$$$type(this) !== 'comment' ||
            message.$$$type(this) !== 'comment'
        ) {
            return false;
        }
        if (prevMessage.$$$author(this) !== message.$$$author(this)) {
            // from a different author
            return false;
        }
        if (prevMessage.$$$originThread(this) !== message.$$$originThread(this)) {
            return false;
        }
        if (
            prevMessage.$$$moderationStatus(this) === 'pending_moderation' ||
            message.$$$moderationStatus(this) === 'pending_moderation'
        ) {
            return false;
        }
        if (
            prevMessage.$$$notifications(this).length > 0 ||
            message.$$$notifications(this).length > 0
        ) {
            // visual about notifications is restricted to non-squashed messages
            return false;
        }
        const prevOriginThread = prevMessage.$$$originThread(this);
        const originThread = message.$$$originThread(this);
        if (
            prevOriginThread &&
            originThread &&
            prevOriginThread.$$$model(this) === originThread.$$$model(this) &&
            originThread.$$$model(this) !== 'mail.channel' &&
            prevOriginThread.$$$id(this) !== originThread.$$$id(this)
        ) {
            // messages linked to different document thread
            return false;
        }
        return true;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _adjustScrollForExtraMessagesAtTheEnd() {
        const {
            hasAutoScrollOnMessageReceived,
            hasScrollAdjust,
            order,
        } = this._lastRenderedValues();
        if (!this.el || !hasScrollAdjust) {
            return;
        }
        if (!hasAutoScrollOnMessageReceived) {
            if (order === 'desc' && this._willPatchSnapshot) {
                const { scrollHeight, scrollTop } = this._willPatchSnapshot;
                this.setScrollTop(this.el.scrollHeight - scrollHeight + scrollTop);
            }
            return;
        }
        this._scrollToEnd();
    }

    /**
     * @private
     */
    _adjustScrollForExtraMessagesAtTheStart() {
        const {
            hasScrollAdjust,
            order,
        } = this._lastRenderedValues();
        if (
            !this.el ||
            !hasScrollAdjust ||
            !this._willPatchSnapshot ||
            order === 'desc'
        ) {
            return;
        }
        const { scrollHeight, scrollTop } = this._willPatchSnapshot;
        this.setScrollTop(this.el.scrollHeight - scrollHeight + scrollTop);
    }

    /**
     * @private
     */
    _adjustScrollFromModel() {
        const {
            hasScrollAdjust,
            threadCacheInitialScrollHeight,
            threadCacheInitialScrollPosition,
        } = this._lastRenderedValues();
        if (!this.el || !hasScrollAdjust) {
            return;
        }
        if (
            threadCacheInitialScrollPosition !== undefined &&
            this.el.scrollHeight === threadCacheInitialScrollHeight
        ) {
            this.setScrollTop(threadCacheInitialScrollPosition);
            return;
        }
        this._scrollToEnd();
    }

    /**
     * @private
     */
    _checkMostRecentMessageIsVisible() {
        const {
            mainCache,
            threadCache,
            threadView,
        } = this._lastRenderedValues();
        const lastMessageIsVisible =
            threadCache &&
            this.mostRecentMessageRef &&
            threadCache === mainCache &&
            this.mostRecentMessageRef.isPartiallyVisible();
        if (lastMessageIsVisible) {
            this.env.services.action.dispatch('ThreadView/handleVisibleMessage',
                threadView,
                this.mostRecentMessageRef.message,
            );
        }
    }

    /**
     * @private
     * @returns {boolean}
     */
    _isLoadMoreVisible() {
        const loadMore = this._loadMoreRef.el;
        if (!loadMore) {
            return false;
        }
        const loadMoreRect = loadMore.getBoundingClientRect();
        const elRect = this.el.getBoundingClientRect();
        const isInvisible = loadMoreRect.top > elRect.bottom || loadMoreRect.bottom < elRect.top;
        return !isInvisible;
    }

    /**
     * @private
     */
    _loadMore() {
        const { threadCache } = this._lastRenderedValues();
        if (!threadCache) {
            return;
        }
        this.env.services.action.dispatch('ThreadCache/loadMoreMessages',
            threadCache,
        );
    }

    /**
     * Scrolls to the end of the list.
     *
     * @private
     */
    _scrollToEnd() {
        const { order } = this._lastRenderedValues();
        this.setScrollTop(order === 'asc' ? this.el.scrollHeight - this.el.clientHeight : 0);
    }

    /**
     * @private
     */
    _update() {
        this._checkMostRecentMessageIsVisible();
        this.adjustFromComponentHints();
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickLoadMore(ev) {
        ev.preventDefault();
        this._loadMore();
    }

    /**
     * @private
     */
    _onClickRetryLoadMoreMessages() {
        if (!this.threadView) {
            return;
        }
        if (!this.threadView.$$$threadCache(this)) {
            return;
        }
        this.env.services.action.dispatch('Record/update',
            this.threadView.$$$threadCache(this),
            { $$$hasLoadingFailed: false },
        );
        this._loadMore();
    }

    /**
     * @private
     * @param {ScrollEvent} ev
     */
    onScroll(ev) {
        this._onScrollThrottled(ev);
    }

    /**
     * @private
     * @param {ScrollEvent} ev
     */
    _onScrollThrottled(ev) {
        const {
            order,
            orderedMessages,
            thread,
            threadCache,
            threadView,
            threadViewer,
        } = this._lastRenderedValues();
        if (!this.el) {
            // could be unmounted in the meantime (due to throttled behavior)
            return;
        }
        const scrollTop = this.el.scrollTop;
        this.env.services.model.messagingBus.trigger('o-component-message-list-scrolled', {
            orderedMessages,
            scrollTop,
            thread,
            threadViewer,
        });
        if (this._isLastScrollProgrammatic && threadView) {
            // Margin to compensate for inaccurate scrolling to bottom and height
            // flicker due height change of composer area.
            const margin = 30;
            // Automatically scroll to new received messages only when the list is
            // currently fully scrolled.
            const hasAutoScrollOnMessageReceived = (order === 'asc')
                ? scrollTop >= this.el.scrollHeight - this.el.clientHeight - margin
                : scrollTop <= margin;
            this.env.services.action.dispatch('Record/update', threadView, {
                $$$hasAutoScrollOnMessageReceived: hasAutoScrollOnMessageReceived,
            });
        }
        if (threadView) {
            this.env.services.action.dispatch('ThreadViewer/saveThreadCacheScrollHeightAsInitial',
                threadViewer,
                this.el.scrollHeight,
                threadCache,
            );
            this.env.services.action.dispatch('ThreadViewer/saveThreadCacheScrollPositionsAsInitial',
                threadViewer,
                scrollTop,
                threadCache,
            );
        }
        if (!this._isLastScrollProgrammatic && this._isLoadMoreVisible()) {
            this._loadMore();
        }
        this._checkMostRecentMessageIsVisible();
        this._isLastScrollProgrammatic = false;
    }

}

Object.assign(MessageList, {
    defaultProps: {
        hasMessageCheckbox: false,
        hasScrollAdjust: true,
        hasSquashCloseMessages: false,
        haveMessagesMarkAsReadIcon: false,
        haveMessagesReplyIcon: false,
        order: 'asc',
    },
    props: {
        hasMessageCheckbox: Boolean,
        hasSquashCloseMessages: Boolean,
        haveMessagesMarkAsReadIcon: Boolean,
        haveMessagesReplyIcon: Boolean,
        hasScrollAdjust: Boolean,
        order: {
            type: String,
            validate: prop => ['asc', 'desc'].includes(prop),
        },
        selectedMessage: {
            type: Object,
            optional: true,
            validate(p) {
                if (!p.constructor.modelName !== 'Message') {
                    return false;
                }
                return true;
            },
        },
        threadView: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'ThreadView') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.MessageList',
});

QWeb.registerComponent('MessageList', MessageList);

export default MessageList;
