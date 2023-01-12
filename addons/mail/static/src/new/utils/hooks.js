/* @odoo-module */

import {
    onMounted,
    onPatched,
    onWillPatch,
    onWillUnmount,
    reactive,
    status,
    useComponent,
    useEnv,
    useRef,
    useState,
} from "@odoo/owl";

import { Deferred } from "@web/core/utils/concurrency";
import { useBus, useService } from "@web/core/utils/hooks";
import { removeFromArrayWithPredicate } from "./arrays";
import { createLocalId } from "./misc";

function useExternalListener(target, eventName, handler, eventParams) {
    const boundHandler = handler.bind(useComponent());
    let t;
    onMounted(() => {
        t = target();
        if (!t) {
            return;
        }
        t.addEventListener(eventName, boundHandler, eventParams);
    });
    onPatched(() => {
        const t2 = target();
        if (t !== t2) {
            if (t) {
                t.removeEventListener(eventName, boundHandler, eventParams);
            }
            if (t2) {
                t2.addEventListener(eventName, boundHandler, eventParams);
            }
            t = t2;
        }
    });
    onWillUnmount(() => {
        if (!t) {
            return;
        }
        t.removeEventListener(eventName, boundHandler, eventParams);
    });
}

export function onExternalClick(refName, cb) {
    const ref = useRef(refName);
    function onClick(ev) {
        if (ref.el && !ref.el.contains(ev.target)) {
            cb(ev);
        }
    }
    onMounted(() => {
        document.body.addEventListener("click", onClick, true);
    });
    onWillUnmount(() => {
        document.body.removeEventListener("click", onClick, true);
    });
}

export function useHover(refName, callback = () => {}) {
    const ref = useRef(refName);
    const state = useState({ isHover: false });
    function onHover(hovered) {
        state.isHover = hovered;
        callback(hovered);
    }
    useExternalListener(
        () => ref.el,
        "mouseenter",
        () => onHover(true),
        true
    );
    useExternalListener(
        () => ref.el,
        "mouseleave",
        () => onHover(false),
        true
    );
    return state;
}

export function useAutoScroll(refName, shouldScrollPredicate = () => true) {
    const ref = useRef(refName);
    let el = null;
    let isScrolled = true;
    const observer = new ResizeObserver(applyScroll);

    function onScroll() {
        isScrolled = Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) < 1;
    }
    function applyScroll() {
        if (isScrolled && shouldScrollPredicate()) {
            ref.el.scrollTop = ref.el.scrollHeight;
        }
    }
    onMounted(() => {
        el = ref.el;
        el.scrollTop = el.scrollHeight;
        observer.observe(el);
        el.addEventListener("scroll", onScroll);
    });
    onWillUnmount(() => {
        observer.unobserve(el);
        el.removeEventListener("scroll", onScroll);
    });
    onPatched(applyScroll);
}

export function useVisible(refName, cb) {
    const ref = useRef(refName);
    const state = { isVisible: false };
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const newVal = entry.isIntersecting;
            if (state.isVisible !== newVal) {
                state.isVisible = newVal;
                cb();
            }
        }
    });
    let el;
    onMounted(observe);
    onWillUnmount(() => {
        if (!el) {
            return;
        }
        observer.unobserve(el);
    });
    onPatched(observe);

    function observe() {
        if (ref.el !== el) {
            if (el) {
                observer.unobserve(el);
                state.isVisible = false;
            }
            if (ref.el) {
                observer.observe(ref.el);
            }
        }
        el = ref.el;
    }
    return state;
}

/**
 * This hook eases adjusting scroll position by snapshotting scroll
 * properties of scrollable in onWillPatch / onPatched hooks.
 *
 * @param {string} refName
 * @param {function} param1.onWillPatch
 * @param {function} param1.onPatched
 */
export function useScrollSnapshot(refName, { onWillPatch: p_onWillPatch, onPatched: p_onPatched }) {
    const ref = useRef(refName);
    const snapshot = {
        scrollHeight: null,
        scrollTop: null,
        clientHeight: null,
    };
    onMounted(() => {
        const el = ref.el;
        Object.assign(snapshot, {
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop,
            clientHeight: el.clientHeight,
        });
    });
    onWillPatch(() => {
        const el = ref.el;
        Object.assign(snapshot, {
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop,
            clientHeight: el.clientHeight,
            ...p_onWillPatch(),
        });
    });
    onPatched(() => {
        const el = ref.el;
        Object.assign(snapshot, {
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop,
            clientHeight: el.clientHeight,
            ...p_onPatched(snapshot),
        });
    });
}

export function useMessageHighlight(duration = 2000) {
    let timeout;
    const state = reactive({
        async highlightMessage(msgId) {
            const lastHighlightedMessageId = state.highlightedMessageId;
            clearHighlight();
            if (lastHighlightedMessageId === msgId) {
                // Give some time for the state to update.
                await new Promise(setTimeout);
            }
            state.highlightedMessageId = msgId;
            timeout = setTimeout(clearHighlight, duration);
        },
        highlightedMessageId: null,
    });
    function clearHighlight() {
        clearTimeout(timeout);
        timeout = null;
        state.highlightedMessageId = null;
    }
    return state;
}

function dataUrlToBlob(data, type) {
    const binData = window.atob(data);
    const uiArr = new Uint8Array(binData.length);
    uiArr.forEach((_, index) => (uiArr[index] = binData.charCodeAt(index)));
    return new Blob([uiArr], { type });
}

export function useAttachmentUploader(pThread, message) {
    const component = useComponent();
    const env = useEnv();
    const { bus, upload } = useService("file_upload");
    const notification = useService("notification");
    const messaging = useService("mail.messaging");
    const store = useService("mail.store");
    const threadService = useService("mail.thread");
    let abortByUploadId = {};
    let deferredByUploadId = {};
    const uploadingAttachmentIds = new Set();
    const state = useState({
        attachments: [],
        uploadData({ data, name, type }) {
            const file = new File([dataUrlToBlob(data, type)], name, { type });
            return this.uploadFile(file);
        },
        async uploadFile(file) {
            const thread = pThread ?? message.originThread;
            const tmpId = messaging.nextId++;
            uploadingAttachmentIds.add(tmpId);
            const { id } = await upload("/mail/attachment/upload", [file], {
                buildFormData(formData) {
                    formData.append("thread_id", thread.id);
                    formData.append("thread_model", thread.model);
                    formData.append("is_pending", Boolean(env.inComposer));
                    formData.append("temporary_id", tmpId);
                },
            }).catch((e) => {
                if (e.name !== "AbortError") {
                    throw e;
                }
            });
            const uploadDoneDeferred = new Deferred();
            deferredByUploadId[id] = uploadDoneDeferred;
            return uploadDoneDeferred;
        },
        async unlink(attachment) {
            const abort = abortByUploadId[attachment.id];
            delete abortByUploadId[attachment.id];
            delete deferredByUploadId[attachment.id];
            if (abort) {
                abort();
                return;
            }
            await messaging.unlinkAttachment(attachment);
            removeFromArrayWithPredicate(state.attachments, ({ id }) => id === attachment.id);
        },
        async unlinkAll() {
            const proms = [];
            this.attachments.forEach((attachment) => proms.push(this.unlink(attachment)));
            await Promise.all(proms);
            this.reset();
        },
        reset() {
            abortByUploadId = {};
            deferredByUploadId = {};
            uploadingAttachmentIds.clear();
            // prevent queuing of a render that will never be resolved.
            if (status(component) !== "destroyed") {
                state.attachments = [];
            }
        },
    });
    useBus(bus, "FILE_UPLOAD_ADDED", ({ detail: { upload } }) => {
        if (!uploadingAttachmentIds.has(parseInt(upload.data.get("temporary_id"), 10))) {
            return;
        }
        const threadId = upload.data.get("thread_id");
        const threadModel = upload.data.get("thread_model");
        const originThread = threadService.insert({ model: threadModel, id: threadId });
        abortByUploadId[upload.id] = upload.xhr.abort.bind(upload.xhr);
        state.attachments.push({
            extension: upload.title.split(".").pop(),
            filename: upload.title,
            id: upload.id,
            mimetype: upload.type,
            name: upload.title,
            originThread,
            size: upload.total,
            uploading: true,
        });
    });
    useBus(bus, "FILE_UPLOAD_LOADED", ({ detail: { upload } }) => {
        const tmpId = parseInt(upload.data.get("temporary_id"));
        if (!uploadingAttachmentIds.has(tmpId)) {
            return;
        }
        uploadingAttachmentIds.delete(tmpId);
        delete abortByUploadId[upload.id];
        const response = JSON.parse(upload.xhr.response);
        if (response.error) {
            notification.add(response.error, { type: "danger" });
            return;
        }
        const threadId = upload.data.get("thread_id");
        const threadModel = upload.data.get("thread_model");
        const originThread = store.threads[createLocalId(threadModel, threadId)];
        const attachment = {
            ...response,
            extension: upload.title.split(".").pop(),
            originThread,
        };
        const index = state.attachments.findIndex(({ id }) => id === upload.id);
        if (index >= 0) {
            state.attachments[index] = attachment;
        } else {
            state.attachments.push(attachment);
        }
        deferredByUploadId[upload.id].resolve(attachment);
        delete deferredByUploadId[upload.id];
    });
    useBus(bus, "FILE_UPLOAD_ERROR", ({ detail: { upload } }) => {
        delete abortByUploadId[upload.id];
        delete deferredByUploadId[upload.id];
        uploadingAttachmentIds.delete(parseInt(upload.data.get("temporary_id")));
    });

    return state;
}

export function useSelection({ refName, model, preserveOnClickAwayPredicate = () => false }) {
    const ref = useRef(refName);
    function onSelectionChange() {
        if (document.activeElement && document.activeElement === ref.el) {
            Object.assign(model, {
                start: ref.el.selectionStart,
                end: ref.el.selectionEnd,
                direction: ref.el.selectionDirection,
            });
        }
    }
    function clear() {
        if (!ref.el) {
            return;
        }
        ref.el.selectionStart = ref.el.selectionEnd = ref.el.value.length;
    }
    onExternalClick(refName, async (ev) => {
        if (await preserveOnClickAwayPredicate(ev)) {
            return;
        }
        if (!ref.el) {
            return;
        }
        clear();
        Object.assign(model, {
            start: ref.el.selectionStart,
            end: ref.el.selectionEnd,
            direction: ref.el.selectionDirection,
        });
    });
    onMounted(() => {
        document.addEventListener("selectionchange", onSelectionChange);
    });
    onWillUnmount(() => {
        document.removeEventListener("selectionchange", onSelectionChange);
    });
    return {
        clear,
        restore() {
            ref.el?.setSelectionRange(model.start, model.end, model.direction);
        },
        moveCursor(position) {
            model.start = model.end = position;
            ref.el.selectionStart = ref.el.selectionEnd = position;
        },
    };
}

/**
 * @param {string} refName
 * @param {ScrollPosition} [model] Model to store saved position.
 * @param {'bottom' | 'top'} [clearOn] Whether scroll
 * position should be cleared when reaching bottom or top.
 */
export function useScrollPosition(refName, model, clearOn) {
    const ref = useRef(refName);
    const self = {
        model,
        restore() {
            if (!self.model) {
                return;
            }
            ref.el?.scrollTo({
                left: self.model.left,
                top: self.model.top,
            });
        },
    };
    function isScrolledToBottom() {
        if (!ref.el) {
            return false;
        }
        return Math.abs(ref.el.scrollTop + ref.el.clientHeight - ref.el.scrollHeight) < 1;
    }

    function onScrolled() {
        if (!self.model) {
            return;
        }
        if (
            (clearOn === "bottom" && isScrolledToBottom()) ||
            (clearOn === "top" && ref.el.scrollTop === 0)
        ) {
            return self.model.clear();
        }
        Object.assign(self.model, {
            top: ref.el.scrollTop,
            left: ref.el.scrollLeft,
        });
    }

    onMounted(() => {
        ref.el.addEventListener("scroll", onScrolled);
    });

    onWillUnmount(() => {
        ref.el.removeEventListener("scroll", onScrolled);
    });
    return self;
}

export function useMessageEdition() {
    const state = reactive({
        composerOfThread: null,
        editingMessage: null,
        exitEditMode() {
            state.editingMessage = null;
            if (state.composerOfThread) {
                state.composerOfThread.state.autofocus++;
            }
        },
    });
    return state;
}
