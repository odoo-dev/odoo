/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { CalendarYearRenderer } from "@web/views/calendar/calendar_year/calendar_year_renderer";
import { getFixture, patchWithCleanup } from "../../helpers/utils";
import { clickDate, mountComponent, selectDateRange, makeEnv, makeFakeModel } from "./helpers";

let target;

async function start(params = {}) {
    const { services, props, model: modelParams } = params;
    const env = await makeEnv(services);
    const model = makeFakeModel(modelParams);
    return await mountComponent(CalendarYearRenderer, env, {
        model,
        createRecord() {},
        deleteRecord() {},
        editRecord() {},
        ...props,
    });
}

QUnit.module("CalendarView - YearRenderer", ({ beforeEach }) => {
    beforeEach(() => {
        target = getFixture();
    });

    QUnit.test("mount a CalendarYearRenderer", async (assert) => {
        await start({});

        assert.containsN(target, ".fc-month-container", 12);
        const monthHeaders = target.querySelectorAll(".fc-header-toolbar .fc-center");

        // check "title format"
        assert.strictEqual(monthHeaders.length, 12);
        const monthTitles = [
            "Jan 2021",
            "Feb 2021",
            "Mar 2021",
            "Apr 2021",
            "May 2021",
            "Jun 2021",
            "Jul 2021",
            "Aug 2021",
            "Sep 2021",
            "Oct 2021",
            "Nov 2021",
            "Dec 2021",
        ];
        for (let i = 0; i < 12; i++) {
            assert.strictEqual(monthHeaders[i].textContent, monthTitles[i]);
        }
        const dayHeaders = target
            .querySelector(".fc-month-container")
            .querySelectorAll(".fc-day-header");

        // check day header format
        assert.strictEqual(dayHeaders.length, 7);
        const dayTitles = ["S", "M", "T", "W", "T", "F", "S"];
        for (let i = 0; i < 7; i++) {
            assert.strictEqual(dayHeaders[i].textContent, dayTitles[i]);
        }

        // check showNonCurrentDates
        assert.containsN(target, ".fc-day-number", 365);
    });

    QUnit.test("display events", async (assert) => {
        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
            clearTimeout: () => {},
        });

        await start({
            props: {
                createRecord(record) {
                    assert.step(`${record.start.toISODate()} allDay:${record.isAllDay} no event`);
                },
            },
            services: {
                popover: {
                    start: () => ({
                        add: (target, _, props) => {
                            assert.step(`${props.date.toISODate()} ${props.records[0].title}`);
                            return () => {};
                        },
                    }),
                },
            },
        });

        await clickDate(target, "2021-07-15");
        assert.verifySteps(["2021-07-15 allDay:true no event"]);
        await clickDate(target, "2021-07-16");
        assert.verifySteps(["2021-07-16 1 day, all day in July"]);
        await clickDate(target, "2021-07-17");
        assert.verifySteps(["2021-07-17 allDay:true no event"]);

        await clickDate(target, "2021-07-18");
        assert.verifySteps(["2021-07-18 3 days, all day in July"]);
        await clickDate(target, "2021-07-19");
        assert.verifySteps(["2021-07-19 3 days, all day in July"]);
        await clickDate(target, "2021-07-20");
        assert.verifySteps(["2021-07-20 3 days, all day in July"]);
        await clickDate(target, "2021-07-21");
        assert.verifySteps(["2021-07-21 allDay:true no event"]);

        await clickDate(target, "2021-06-28");
        assert.verifySteps(["2021-06-28 allDay:true no event"]);
        await clickDate(target, "2021-06-29");
        assert.verifySteps(["2021-06-29 Over June and July"]);
        await clickDate(target, "2021-06-30");
        assert.verifySteps(["2021-06-30 Over June and July"]);
        await clickDate(target, "2021-07-01");
        assert.verifySteps(["2021-07-01 Over June and July"]);
        await clickDate(target, "2021-07-02");
        assert.verifySteps(["2021-07-02 Over June and July"]);
        await clickDate(target, "2021-07-03");
        assert.verifySteps(["2021-07-03 Over June and July"]);
        await clickDate(target, "2021-07-04");
        assert.verifySteps(["2021-07-04 allDay:true no event"]);
    });

    QUnit.test("select a range of date", async (assert) => {
        assert.expect(3);

        await start({
            props: {
                createRecord(record) {
                    assert.ok(record.isAllDay);
                    assert.ok(record.start.equals(luxon.DateTime.local(2021, 7, 2, 0, 0, 0, 0)));
                    assert.ok(record.end.equals(luxon.DateTime.local(2021, 7, 5, 0, 0, 0, 0)));
                },
            },
        });

        await selectDateRange(target, "2021-07-02", "2021-07-05");
    });
});
