import { onRpc } from "@web/../tests/web_test_helpers";

onRpc("hierarchy_read", function hierarchyRead({ model, args, kwargs }) {
    const [domain, specification, parentFieldName, childFieldName, order] = args;
    const { limit, offset = 0 } = kwargs;
    kwargs.order = order;
    if (!(parentFieldName in specification)) {
        specification[parentFieldName] = { fields: { display_name: {} } };
    }
    // Search ids first (cheap), mirroring the real hierarchy_read, so the total count and the
    // paginated slice can be computed before reading full field data.
    const allIds = this.env[model].search(domain, { order });
    if (!allIds.length) {
        return { records: [], length: 0 };
    }
    let recordIds = allIds;
    let focusedRecordId = false;
    let fetchChildIdsForAllRecords = false;
    if (allIds.length === 1) {
        const [record] = this.env[model].web_read(allIds, specification);
        let siblingsDomain = [
            [parentFieldName, "=", record.id],
            ["id", "!=", record.id],
        ];
        if (record[parentFieldName]) {
            focusedRecordId = record.id;
            const parentResId = record[parentFieldName].id;
            recordIds = [...allIds, parentResId];
            siblingsDomain = [
                ["id", "not in", recordIds],
                [parentFieldName, "in", recordIds],
            ];
        }
        recordIds = [...recordIds, ...this.env[model].search(siblingsDomain, { order })];
    } else {
        fetchChildIdsForAllRecords = true;
    }
    const totalCount = recordIds.length;
    const records = this.env[model].web_read(recordIds, specification);
    const childrenIdsPerRecordId = {};
    if (!childFieldName) {
        const parentResIds = [];
        for (const rec of records) {
            if (rec[parentFieldName]) {
                parentResIds.push(rec[parentFieldName].id);
            }
        }
        const groups = this.env[model].formatted_read_group({
            context: kwargs.context,
            domain: [
                [
                    parentFieldName,
                    "in",
                    fetchChildIdsForAllRecords
                        ? (limit != null ? recordIds.slice(offset, offset + limit) : recordIds)
                        : recordIds.filter((id) => !parentResIds.includes(id)),
                ],
            ],
            groupby: [parentFieldName],
            aggregates: ["id:array_agg"],
        });
        for (const group of groups) {
            childrenIdsPerRecordId[group[parentFieldName][0]] = group["id:array_agg"];
        }
    }
    let pagedRecords = records;
    if (limit != null && fetchChildIdsForAllRecords) {
        pagedRecords = records.slice(offset, offset + limit);
    }
    if (focusedRecordId || Object.keys(childrenIdsPerRecordId).length) {
        for (const record of pagedRecords) {
            if (record.id in childrenIdsPerRecordId) {
                record.__child_ids__ = childrenIdsPerRecordId[record.id];
            }
            if (record.id === focusedRecordId) {
                record.__focus__ = true;
            }
        }
    }
    return { records: pagedRecords, length: totalCount };
});
