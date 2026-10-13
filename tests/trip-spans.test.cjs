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
    days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(key => ({ key }))
  });
  ["addDays", "dateKey", "parseDateKey", "dateSerial", "activitySpanDays", "activityStartsOn", "activityOccursOn", "activitySpanPosition"]
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
