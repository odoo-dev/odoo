import { beforeEach, describe, expect, mockFetch, test } from "@odoo/hoot";
import { printJobs } from "@printer/print_action_handler";
import {
    allowTranslations,
    makeTestApp,
    mockService,
    runTestScope,
} from "@web/../tests/web_test_helpers";
import { registry } from "@web/core/registry";

describe.current.tags("headless");

const notificationsReceived = [];

beforeEach(() => {
    notificationsReceived.length = 0;
});

const mockReportId = 42;

const makeEposPrinter = (overrides = {}) => ({
    type: "epos",
    ip_address: "1.2.3.4",
    ...overrides,
});

const makeZplPrinter = (overrides = {}) => ({
    type: "zpl",
    ip_address: "5.6.7.8",
    ...overrides,
});

const makeEposJob = (overrides = {}) => ({
    type: "epos",
    report: btoa("hello printer"),
    ...overrides,
});

const makeZplJob = (overrides = {}) => ({
    type: "zpl",
    report: btoa("^XA^XZ"),
    ...overrides,
});

const makeMockServices = () => ({
    notification: {
        add: (title, opts) => {
            notificationsReceived.push({ title, opts });
            return () => {};
        },
    },
});

const getHandler = () =>
    registry.category("ir.actions.report handlers").get("print_action_handler");

// Building the test app (used by `runTestScope`) also starts the MockServer, which
// installs its own `mockFetch` handler for RPC routes. It must exist *before* a test
// installs its own `mockFetch` mock for the raw printer HTTP calls, otherwise the
// MockServer's handler is registered afterwards and silently overrides the test's one.
const mockPrinterServices = async (printerSettings = null) => {
    await makeTestApp();
    mockService("report_printers_cache", () => ({
        getPrinterSettingsForReport: async () => printerSettings,
    }));
    mockService("notification", () => makeMockServices().notification);
};

describe("printJobs", () => {
    test("sends an epos job to the correct endpoint and resolves", async () => {
        const fetchCalls = [];
        mockFetch((input, init) => {
            fetchCalls.push({ url: input, params: init });
            return `<response success="true" code=""/>`;
        });

        const printer = makeEposPrinter();
        const services = makeMockServices();
        await printJobs(printer, [makeEposJob()], services);

        expect(fetchCalls).toHaveLength(1);
        expect(fetchCalls[0].url).toMatch(/epos\/service\.cgi/);
        expect(notificationsReceived).toHaveLength(0);
    });

    test("sends a zpl job to /pstprnt in no-cors mode", async () => {
        const fetchCalls = [];
        mockFetch((input, init) => {
            fetchCalls.push({ url: input, params: init });
            return null;
        });

        const printer = makeZplPrinter();
        const services = makeMockServices();
        await printJobs(printer, [makeZplJob()], services);

        expect(fetchCalls).toHaveLength(1);
        expect(fetchCalls[0].url).toBe(`http://${printer.ip_address}/pstprnt`);
        expect(fetchCalls[0].params.mode).toBe("no-cors");
        expect(notificationsReceived).toHaveLength(0);
    });

    test("skips jobs whose type does not match the printer", async () => {
        const fetchCalls = [];
        mockFetch((input) => {
            fetchCalls.push(input);
            return null;
        });

        const printer = makeZplPrinter();
        const services = makeMockServices();
        await printJobs(printer, [makeEposJob()], services);

        expect(fetchCalls).toHaveLength(0);
        expect(notificationsReceived).toHaveLength(0);
    });

    test("shows a danger notification when epos returns a non-success response", async () => {
        allowTranslations();
        mockFetch(() => `<response success="false" code="ERROR_GENERAL"/>`);

        const printer = makeEposPrinter();
        const services = makeMockServices();
        await printJobs(printer, [makeEposJob()], services);

        expect(notificationsReceived).toHaveLength(1);
        expect(notificationsReceived[0].opts.type).toBe("danger");
    });

    test("shows a danger notification when fetch throws", async () => {
        allowTranslations();
        mockFetch(() => {
            throw new Error("network error");
        });

        const printer = makeEposPrinter();
        const services = makeMockServices();
        await printJobs(printer, [makeEposJob()], services);

        expect(notificationsReceived).toHaveLength(1);
        expect(notificationsReceived[0].opts.type).toBe("danger");
    });

    test("retries on ERROR_WAIT_EJECT before succeeding", async () => {
        let callCount = 0;
        mockFetch(() => {
            callCount++;
            const success = callCount > 1;
            const code = success ? "" : "ERROR_WAIT_EJECT";
            return `<response success="${success}" code="${code}"/>`;
        });

        const printer = makeEposPrinter();
        const services = makeMockServices();
        await printJobs(printer, [makeEposJob()], services);

        expect(callCount).toBeGreaterThan(1);
        expect(notificationsReceived).toHaveLength(0);
    });

    test("processes multiple jobs of matching type in sequence", async () => {
        const fetchCalls = [];
        mockFetch((input) => {
            fetchCalls.push(input);
            return `<response success="true" code=""/>`;
        });

        const printer = makeEposPrinter();
        const services = makeMockServices();
        await printJobs(printer, [makeEposJob(), makeEposJob()], services);

        expect(fetchCalls).toHaveLength(2);
        expect(notificationsReceived).toHaveLength(0);
    });
});

describe("printActionHandler", () => {
    const makeAction = (overrides = {}) => ({
        id: mockReportId,
        context: {
            report_id: mockReportId,
            jobs: [makeEposJob()],
            active_ids: [1, 2, 3],
        },
        data: {},
        ...overrides,
    });

    test("returns false when there are no jobs", async () => {
        await mockPrinterServices();
        const action = makeAction({ context: { report_id: mockReportId, jobs: [] } });
        const result = await runTestScope(() => getHandler()(action, {}));

        expect(result).not.toBe(true);
    });

    test("returns false when jobs is undefined", async () => {
        await mockPrinterServices();
        const action = makeAction({ context: { report_id: mockReportId } });
        const result = await runTestScope(() => getHandler()(action, {}));

        expect(result).not.toBe(true);
    });

    test("returns false when getPrinterSettingsForReport returns no selectedPrinters", async () => {
        await mockPrinterServices({ skipDialog: true }); // selectedPrinters absent
        const result = await runTestScope(() => getHandler()(makeAction(), {}));

        expect(result).not.toBe(true);
    });

    test("returns false when getPrinterSettingsForReport returns null", async () => {
        await mockPrinterServices(null);
        const result = await runTestScope(() => getHandler()(makeAction(), {}));

        expect(result).not.toBe(true);
    });

    test("returns true and calls onClose after a successful print", async () => {
        await mockPrinterServices({
            selectedPrinters: [makeEposPrinter()],
        });
        mockFetch(() => `<response success="true" code=""/>`);
        const closed = [];

        const result = await runTestScope(() =>
            getHandler()(makeAction(), { onClose: () => closed.push(true) })
        );

        expect(result).toBe(true);
        expect(closed).toHaveLength(1);
    });

    test("prints to every selected printer", async () => {
        await mockPrinterServices({
            selectedPrinters: [
                makeEposPrinter({ ip_address: "1.1.1.1" }),
                makeEposPrinter({ ip_address: "2.2.2.2" }),
            ],
        });
        const fetchCalls = [];
        mockFetch((input) => {
            fetchCalls.push(input);
            return `<response success="true" code=""/>`;
        });

        await runTestScope(() => getHandler()(makeAction(), {}));

        const hosts = fetchCalls.map((u) => new URL(u).hostname);
        expect(hosts).toInclude("1.1.1.1");
        expect(hosts).toInclude("2.2.2.2");
    });
});
