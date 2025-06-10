import { _t } from "@web/core/l10n/translation";
import { download } from "@web/core/network/download";

/**
 * Generates the report url given a report action.
 *
 * @param {Object} action the report action
 * @param {"text"|"qweb"|"html"} type the type of the report
 * @param {Object} userContext the user context
 * @returns {string}
 */
export function getReportUrl(action, type, userContext) {
    let url = `/report/${type}/${action.report_name}`;
    const actionContext = action.context || {};
    if (action.data && JSON.stringify(action.data) !== "{}") {
        // build a query string with `action.data` (it's the place where reports
        // using a wizard to customize the output traditionally put their options)
        const options = encodeURIComponent(JSON.stringify(action.data));
        const context = encodeURIComponent(JSON.stringify(actionContext));
        url += `?options=${options}&context=${context}`;
    } else {
        if (actionContext.active_ids) {
            url += `/${actionContext.active_ids.join(",")}`;
        }
        if (type === "html") {
            const context = encodeURIComponent(JSON.stringify(userContext));
            url += `?context=${context}`;
        }
    }
    return url;
}

/**
 * Launches download action of the report
 *
 * @param {Function} rpc a function to perform RPCs
 * @param {Object} action the report action
 * @param {"pdf"|"text"} type the type of the report to download
 * @param {Object} userContext the user context
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function downloadReport(rpc, action, type, userContext) {
    let message;
    if (type.startsWith("pdf")) {
        // Cache the wkhtml status on the function. In prod this means is only
        // checked once, but we can reset it between tests to test multiple statuses.
        const report_name = action.report_name;
        if (
            !downloadReport.pdfEngineStatusProm
            || !downloadReport.pdfEngine
            || !downloadReport.pdfEngineStatusMessage
        ) {
            [
                downloadReport.pdfEngine,
                downloadReport.pdfEngineStatusProm,
                downloadReport.pdfEngineStatusMessage,
            ] = await rpc(
                "/report/get_pdf_engine_state/",
                {
                    report_name,
                }
            );
        }
        const status = await downloadReport.pdfEngineStatusProm;
        message = downloadReport.pdfEngineStatusMessage;
        if (!["upgrade", "ok"].includes(status)) {
            return { success: false, message };
        }
    }
    const url = getReportUrl(action, type);
    await download({
        url: "/report/download",
        data: {
            data: JSON.stringify([url, action.report_type]),
            context: JSON.stringify(userContext),
        },
    });
    return { success: true, message };
}
