import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";
import { effect, onMounted, onWillDestroy, onWillStart } from "@odoo/owl";

let watchableModels = new Set();

patch(FormController.prototype, {
    setup() {
        super.setup(...arguments);

        this._dismissFormWatchNotification = null;

        const lazySession = useService("lazy_session");
        const busService = useService("bus_service");
        const notificationService = useService("notification");

        onWillStart(async () => {
            await lazySession.getValue("form_watchable_models", (formWatchableModels) => {
                watchableModels = new Set(formWatchableModels);
            });
        });

        let stopEffect = () => {};
        onMounted(() => {
            if (!watchableModels.has(this.model.root.resModel)) {
                return;
            }
            stopEffect = effect(() => {
                const { resModel, resId } = this.model.root;
                if (!resId) {
                    return;
                }

                const channel = `web.form_watch:${resModel}:${resId}`;

                // Debounce addChannel so rapid navigation (next/previous arrows)
                // doesn't send a subscribe event for every intermediate record.
                let channelAdded = false;
                const timer = setTimeout(() => {
                    busService.addChannel(channel);
                    channelAdded = true;
                }, 50);

                const onUpdated = async (payload) => {
                    if (payload.uid === user.userId) {
                        return;
                    }
                    if (payload.resModel !== resModel || payload.resId !== resId) {
                        return;
                    }
                    if (!(await this.model.root.isDirty())) {
                        this.model.load();
                        return;
                    }
                    this._dismissFormWatchNotification?.();
                    this._dismissFormWatchNotification = notificationService.add(
                        _t("This record has been modified by another user."),
                        {
                            type: "warning",
                            sticky: true,
                            buttons: [
                                {
                                    name: _t("Reload"),
                                    primary: true,
                                    onClick: () => {
                                        this._dismissFormWatchNotification?.();
                                        this.model.load();
                                    },
                                },
                            ],
                        }
                    );
                };

                const onDeleted = (payload) => {
                    if (payload.resModel !== resModel || payload.resId !== resId) {
                        return;
                    }
                    this._dismissFormWatchNotification?.();
                    this._dismissFormWatchNotification = notificationService.add(
                        _t("This record has been deleted by another user."),
                        { type: "danger", sticky: true }
                    );
                };

                busService.subscribe("web.form_record_updated", onUpdated);
                busService.subscribe("web.form_record_deleted", onDeleted);

                return () => {
                    clearTimeout(timer);
                    if (channelAdded) {
                        busService.deleteChannel(channel);
                    }
                    this._dismissFormWatchNotification?.();
                    this._dismissFormWatchNotification = null;
                    busService.unsubscribe("web.form_record_updated", onUpdated);
                    busService.unsubscribe("web.form_record_deleted", onDeleted);
                };
            });
        });
        onWillDestroy(() => stopEffect());
    },

    async onRecordSaved(record, changes) {
        this._dismissFormWatchNotification?.();
        this._dismissFormWatchNotification = null;
        return super.onRecordSaved(record, changes);
    },

    async discard() {
        this._dismissFormWatchNotification?.();
        this._dismissFormWatchNotification = null;
        return super.discard(...arguments);
    },
});
