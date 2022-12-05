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
import { useBus, useService } from "@web/core/utils/hooks";
import { removeFromArrayWithPredicate } from "./arrays";

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

export function useAttachmentUploader({ threadId, messageId }) {
    const component = useComponent();
    const env = useEnv();
    const { bus, upload } = useService("file_upload");
    const notification = useService("notification");
    const messaging = useService("mail.messaging");
    let abortByUploadId = {};
    const uploadingAttachmentIds = new Set();
    const state = useState({
        attachments: [],
        async upload(file) {
            const thread =
                messaging.state.threads[threadId || messaging.state.messages[messageId].resId];
            const tmpId = messaging.nextId++;
            uploadingAttachmentIds.add(tmpId);
            upload("/mail/attachment/upload", [file], {
                buildFormData(formData) {
                    formData.append("thread_id", thread.resId || thread.id);
                    formData.append("thread_model", thread.resModel || "mail.channel");
                    formData.append("is_pending", Boolean(env.inComposer));
                    formData.append("temporary_id", tmpId);
                },
            }).catch((e) => {
                if (e.name !== "AbortError") {
                    throw e;
                }
            });
        },
        async unlink(attachment) {
            const abort = abortByUploadId[attachment.id];
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
            uploadingAttachmentIds.clear();
            // prevent queuing of a render that will never be resolved.
            if (status(component) !== "destroyed") {
                state.attachments = [];
            }
        },
    });
    useBus(bus, "FILE_UPLOAD_ADDED", ({ detail: { upload } }) => {
        if (!uploadingAttachmentIds.has(parseInt(upload.data.get("temporary_id")))) {
            return;
        }
        const threadId = upload.data.get("thread_id");
        const threadModel = upload.data.get("thread_model");
        const originThread =
            messaging.state.threads[
                threadModel === "mail.channel" ? parseInt(threadId) : `${threadModel},${threadId}`
            ];
        abortByUploadId[upload.id] = upload.xhr.abort.bind(upload.xhr);
        state.attachments.push({
            extension: upload.title.split('.').pop(),
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
        const originThread =
            messaging.state.threads[
                threadModel === "mail.channel" ? parseInt(threadId) : `${threadModel},${threadId}`
            ];
        const attachment = {
            ...response,
            extension: upload.title.split('.').pop(),
            originThread,
        };
        const index = state.attachments.findIndex(({ id }) => id === upload.id);
        if (index >= 0) {
            state.attachments[index] = attachment;
        } else {
            state.attachments.push(attachment);
        }
    });
    useBus(bus, "FILE_UPLOAD_ERROR", ({ detail: { upload } }) => {
        delete abortByUploadId[upload.id];
        uploadingAttachmentIds.delete(parseInt(upload.data.get("temporary_id")));
    });

    return state;
}
