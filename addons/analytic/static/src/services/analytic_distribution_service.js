/** @odoo-module **/

import { registry } from "@web/core/registry";
import { groupBy } from "@web/core/utils/arrays";
import { x2ManyCommands } from "@web/core/orm_service";

export const analyticDistributionService = {
    start(env) {
        // Keep the stale widgets in a service so all AnalyticDistribution
        // instances share the same queue and can be flushed together.
        const pendingStaleWidgets = new Set();
        let flushScheduled = false;

        function schedule(widget) {
            pendingStaleWidgets.add(widget);

            if (!flushScheduled) {
                flushScheduled = true;
                queueMicrotask(() => waitUntilStable(pendingStaleWidgets.size));
            }
        }

        function waitUntilStable(previousSize) {
            const currentSize = pendingStaleWidgets.size;

            if (currentSize !== previousSize) {
                queueMicrotask(() => waitUntilStable(currentSize));
                return;
            }

            flushScheduled = false;
            flush();
        }

        async function flush() {
            const groupedWidgets = groupBy(
                Array.from(pendingStaleWidgets).filter(
                    (widget) => !widget.isDestroyed?.()
                ),
                (widget) => {
                    const root = widget.props.record.model.root;
                    return `${root.resModel}:${root.resId}`;
                },
            );

            pendingStaleWidgets.clear();

            for (const rootWidgets of Object.values(groupedWidgets)) {
                const root = rootWidgets[0].props.record.model.root;
                
                // DynamicRecordList has no root.data, so x2many commands cannot be batched.
                // record.update() only updates the frontend state and does not persist the
                // cleanup in multi-edit mode, therefore use orm.write() directly.
                if (!root.data) {
                    const orm = rootWidgets[0].env.services.orm;

                    await Promise.all(
                        rootWidgets.map((widget) =>
                            orm.write(
                                widget.props.record.resModel,
                                [widget.props.record.resId],
                                {
                                    [widget.props.name]: widget.dataToJson(),
                                },
                            )
                        )
                    );
                    continue;
                }

                const parentField = Object.keys(root.data).find(
                    (field) =>
                        root.data[field]?.records?.includes(
                            rootWidgets[0].props.record
                        )
                );

                const commands = rootWidgets.map((widget) =>
                    x2ManyCommands.update(widget.props.record.resId, {
                        [widget.props.name]: widget.dataToJson(),
                    })
                );

                await root.update({
                    [parentField]: commands,
                });
            }
        }

        return {
            schedule,
        };
    },
};

registry
    .category("services")
    .add("analytic_distribution", analyticDistributionService);
