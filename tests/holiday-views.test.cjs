const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
function source(name) {
  const start = html.search(new RegExp(`    (?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `production function ${name} exists`);
  return html.slice(start, html.indexOf("\n    }\n", start) + 7);
}
class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
  }
  set innerHTML(value) {
    this.html = value;
    this.children = [];
    if (value.includes('class="agenda-list"')) this.list = new Element();
  }
  get innerHTML() { return this.html; }
  appendChild(child) { this.children.push(child); }
  querySelector(selector) { return selector === ".agenda-list" ? this.list : null; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener() {}
}
const noop = () => {};
const date = new Date(2026, 9, 13);
const day = { key: "tuesday", weather: "", labelKey: "Tuesday" };
function entry(id, importance, extra = {}) {
  return { id, title: id, importance, child: "__family__", day: day.key, eventType: "activity", start: "09:00", end: "10:00", ...extra };
}
function setup(functions = [], extras = {}) {
  const ctx = vm.createContext({ t: key => key, currentLanguage: "en", document: { createElement: tag => new Element(tag) }, ...extras });
  ["eventImportance", "importanceRank", "compareEventImportance", "isHolidayActivity", "compareCalendarEntries", "minutes", "escapeHtml", "isSameDate", "activityStatus", ...functions].forEach(name => vm.runInContext(source(name), ctx));
  return ctx;
}
function sample() {
  return [entry("Low activity", "low"), entry("High activity", "high", { start: "10:00", end: "11:00" }), entry("Normal activity", "normal"), entry("Low holiday", "low", { eventType: "holiday", allDay: false, start: "15:00", end: "16:00" })];
}
function renderingContext(items, extras = {}, functions = []) {
  return setup(functions, {
    selectedDate: date,
    occurrencesOnDate: () => items.slice(),
    findConflicts: () => new Set(),
    eventColors: () => ({ soft: "white", line: "blue", ink: "black" }),
    occurrenceKey: item => item.id,
    activityTitle: item => item.title,
    activityCompactTitle: item => item.title,
    displayIcon: () => "",
    eventImportanceBadge: () => "",
    eventCardMarkup: item => item.title,
    bindCalendarEventActions: noop,
    formatFullDate: () => "October 13, 2026",
    ...extras
  });
}

test("holiday-first entries retain high/normal/low ordering for every other event", () => {
  const ctx = setup();
  const items = sample();
  const snapshot = JSON.stringify(items);
  assert.deepEqual(items.slice().sort(ctx.compareCalendarEntries).map(item => item.id), ["Low holiday", "High activity", "Normal activity", "Low activity"]);
  assert.equal(JSON.stringify(items), snapshot);
  // The overlap comparator keeps importance alone as its primary rule.
  assert.equal(items.slice().sort(ctx.compareEventImportance)[0].id, "High activity");
});

test("timed and all-day holidays belong to their own first section", () => {
  const ctx = setup(["todaySectionKey"]);
  assert.equal(ctx.todaySectionKey(entry("Timed holiday", "low", { eventType: "holiday", start: "15:00" })), "holidays");
  assert.equal(ctx.todaySectionKey(entry("All-day holiday", "normal", { eventType: "holiday", allDay: true })), "holidays");
  assert.equal(ctx.todaySectionKey(entry("Ordinary all-day", "high", { allDay: true })), "allDay");
  assert.equal(ctx.todaySectionKey(entry("Trip", "high", { eventType: "trip", start: "18:00" })), "evening");
});

test("mobile agenda renders a low-importance holiday before high-importance regular events", () => {
  const mobileAgenda = new Element();
  const ctx = renderingContext(sample(), {
    mobileAgenda,
    visibleActivities: () => sample(),
    visibleWeekDays: () => [day],
    calendarDateForDay: () => date,
    dayLabel: () => "Tuesday",
    formatShortDate: () => "Oct 13",
    eventLogistics: () => ""
  }, ["renderAgenda"]);
  ctx.renderAgenda();
  const cards = mobileAgenda.children[0].list.children;
  assert.deepEqual(cards.map(item => item.dataset.occurrenceKey), ["Low holiday", "High activity", "Normal activity", "Low activity"]);
  assert.equal(cards[0].dataset.endMinute, undefined);
  assert.equal(cards[1].dataset.startMinute, "600");
  assert.equal(cards[1].dataset.endMinute, "660");
});

test("Today renders the holiday section first and preserves priority within the morning section", () => {
  const todayList = new Element();
  const ctx = renderingContext(sample(), { todayList, todayHeading: new Element() }, ["todaySectionKey", "todaySectionTitle", "nextUpActivity", "renderToday"]);
  ctx.renderToday();
  assert.match(todayList.children[0].html, /today.holidays/);
  assert.deepEqual(todayList.children[0].children.map(item => item.dataset.occurrenceKey), ["Low holiday"]);
  assert.equal(todayList.children[0].children[0].dataset.endMinute, undefined);
  assert.match(todayList.children[1].html, /today.morning/);
  assert.deepEqual(todayList.children[1].children.map(item => item.dataset.occurrenceKey), ["High activity", "Normal activity", "Low activity"]);
  assert.equal(todayList.children[1].children[0].dataset.startMinute, "600");
  assert.ok(!todayList.children[0].children[0].className.includes("is-next"));
});

test("Month reserves its first visible event slot for a holiday, then orders by importance", () => {
  const monthGrid = new Element();
  const ctx = renderingContext(sample(), {
    monthGrid,
    monthWeekdays: new Element(),
    days: [day],
    currentMonthStart: new Date(2026, 9, 1),
    timeLabel: value => value,
    dayLabel: () => "Tuesday"
  }, ["addDays", "renderMonth"]);
  ctx.renderMonth();
  assert.equal(monthGrid.children.length, 42);
  const first = monthGrid.children[0];
  assert.deepEqual(first.children.slice(1, 4).map(item => item.dataset.occurrenceKey), ["Low holiday", "High activity", "Normal activity"]);
  assert.equal(first.children[4].className, "month-more");
});
