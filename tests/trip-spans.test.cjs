const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

function source(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert.notEqual(start, -1, `production function ${name} exists`);
  return html.slice(start, html.indexOf("\n    }\n", start) + 7);
}

function setup() {
  const context = vm.createContext({
    days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(key => ({ key })),
    currentLanguage: "en",
    t: (key, replacements = {}) => ({ "trip.oneDay": "1 day", "trip.dayCount": "{count} days" }[key] || key)
      .replace(/\{(\w+)\}/g, (_, name) => replacements[name])
  });
  ["addDays", "dateKey", "parseDateKey", "dateSerial", "inclusiveDateCount", "formatTripDateRange", "tripDurationText", "activitySpanDays", "activityStartsOn", "activityOccursOn", "activitySpanPosition"]
    .forEach(name => vm.runInContext(source(name), context));
  return context;
}

test("a trip appears on exactly every date in its inclusive range", () => {
  const context = setup();
  const trip = { startDate: "2026-10-13", endDate: "2026-10-15", recurrence: "none" };
  const occurs = value => context.activityOccursOn(trip, context.parseDateKey(value));
  assert.equal(occurs("2026-10-12"), false);
  assert.equal(occurs("2026-10-13"), true);
  assert.equal(occurs("2026-10-14"), true);
  assert.equal(occurs("2026-10-15"), true);
  assert.equal(occurs("2026-10-16"), false);
});

test("trip segments identify their connected start, middle, and end cards", () => {
  const context = setup();
  const trip = { startDate: "2026-10-13", endDate: "2026-10-15", recurrence: "none" };
  assert.equal(context.activitySpanPosition(trip, context.parseDateKey("2026-10-13")), "start");
  assert.equal(context.activitySpanPosition(trip, context.parseDateKey("2026-10-14")), "middle");
  assert.equal(context.activitySpanPosition(trip, context.parseDateKey("2026-10-15")), "end");
  assert.equal(context.activitySpanPosition(trip, context.parseDateKey("2026-10-16")), "");
});

test("ordinary and single-day events keep their existing one-day behavior", () => {
  const context = setup();
  const activity = { startDate: "2026-10-13", recurrence: "none" };
  const oneDayTrip = { startDate: "2026-10-13", endDate: "2026-10-13", recurrence: "none" };
  for (const event of [activity, oneDayTrip]) {
    assert.equal(context.activityOccursOn(event, context.parseDateKey("2026-10-13")), true);
    assert.equal(context.activityOccursOn(event, context.parseDateKey("2026-10-14")), false);
    assert.equal(context.activitySpanPosition(event, context.parseDateKey("2026-10-13")), "");
  }
});

test("trip summaries use an inclusive day count and retain years across boundaries", () => {
  const context = setup();
  assert.equal(context.inclusiveDateCount("2026-10-13", "2026-10-15"), 3);
  assert.equal(context.tripDurationText({ startDate: "2026-10-13", endDate: "2026-10-15" }), "3 days");
  assert.equal(context.tripDurationText({ startDate: "2026-10-13", endDate: "2026-10-13" }), "1 day");
  assert.match(context.formatTripDateRange("2026-12-30", "2027-01-02"), /2026.*2027/);
});

test("family trip conflict checks include every day and ignore cancelled or outside events", () => {
  const context = setup();
  Object.assign(context, {
    FAMILY_CHILD: "__family__",
    fields: {
      eventType: { value: "trip" }, date: { value: "2026-10-13" }, endDate: { value: "2026-10-15" },
      id: { value: "new-trip" }, child: { value: "__family__" }
    },
    state: { activities: [
      { id: "soccer", title: "Soccer", child: "Andrew", startDate: "2026-10-14", recurrence: "none", status: "confirmed" },
      { id: "piano", title: "Piano", child: "Mark", startDate: "2026-10-15", recurrence: "none", status: "confirmed" },
      { id: "cancelled", child: "Andrew", startDate: "2026-10-13", recurrence: "none", status: "cancelled" },
      { id: "later", child: "Andrew", startDate: "2026-10-16", recurrence: "none", status: "confirmed" }
    ] }
  });
  vm.runInContext(source("activityStatus"), context);
  vm.runInContext(source("conflictingTripEvents"), context);
  assert.deepEqual(Array.from(context.conflictingTripEvents(), activity => activity.id), ["soccer", "piano"]);
});

test("dragging any segment moves the whole trip without changing its length", () => {
  const context = setup();
  const trip = { id: "trip", title: "Trip", startDate: "2026-10-13", endDate: "2026-10-15", recurrence: "none", allDay: true };
  Object.assign(context, {
    state: { activities: [trip] },
    draggedOccurrence: { id: "trip", occurrenceDate: "2026-10-14", allDay: true },
    rememberCurrentSchedule() {}, saveActivities() {}, auditActivity() {}, renderAll() {}, scheduleSmartCalendarFocus() {},
    t: key => key, suppressEventClickUntil: 0, scheduleStartMinutes: 0, scheduleEndMinutes: 1440,
    minutes: () => 0, timeInputValue: () => "00:00"
  });
  vm.runInContext(source("recurrenceValue"), context);
  vm.runInContext(source("rescheduleDraggedEvent"), context);
  context.rescheduleDraggedEvent(context.parseDateKey("2026-10-16"), null, true);
  assert.equal(trip.startDate, "2026-10-15");
  assert.equal(trip.endDate, "2026-10-17");
  assert.equal(context.inclusiveDateCount(trip.startDate, trip.endDate), 3);
});
