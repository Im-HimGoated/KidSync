const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const noop = () => {};
function source(name) {
  const start = html.search(new RegExp(`    (?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `production function ${name} exists`);
  return html.slice(start, html.indexOf("\n    }\n", start) + 7);
}
function context(overrides = {}, functions = []) {
  const ctx = vm.createContext({ t: key => ({ "importance.high": "High importance", "importance.normal": "Normal importance", "importance.low": "Low importance", "importance.highShort": "High", "importance.lowShort": "Low" }[key] || key), ...overrides });
  ["eventImportance", "importanceRank", "compareEventImportance", "eventImportanceLabel", "eventImportanceBadge", "escapeHtml", "isHolidayActivity", ...functions].forEach(name => vm.runInContext(source(name), ctx));
  return ctx;
}
function event(id, importance, start = "09:00", extra = {}) {
  return { id, title: id, importance, start, end: "10:00", eventType: "activity", allDay: false, status: "confirmed", ...extra };
}
function element(value = "") {
  return { value, checked: false, hidden: false, dataset: {}, style: {}, options: [], focus: noop, select: noop, setCustomValidity: noop, reportValidity: noop, setAttribute(name, value) { this[name] = value; }, addEventListener: noop, classList: { add: noop, remove: noop } };
}

test("old and invalid events retain normal importance without migration", () => {
  const ctx = context();
  [undefined, null, {}, { importance: "urgent" }, { importance: 2 }, { importance: "HIGH" }].forEach(value => assert.equal(ctx.eventImportance(value), "normal"));
  ["low", "normal", "high"].forEach((level, rank) => {
    assert.equal(ctx.eventImportance({ importance: level }), level);
    assert.equal(ctx.importanceRank({ importance: level }), rank);
  });
});

test("importance ranks ahead of time with deterministic ties and unchanged event times", () => {
  const ctx = context();
  const items = [event("early low", "low", "07:00"), event("normal", undefined), event("high z", "high", "16:00"), event("high a", "high", "16:00"), event("early high", "high", "08:00")];
  const original = JSON.stringify(items);
  assert.deepEqual(items.slice().sort(ctx.compareEventImportance).map(item => item.id), ["early high", "high a", "high z", "normal", "early low"]);
  assert.equal(JSON.stringify(items), original);
});

test("Important filter keeps special dates and also includes high priority activities", () => {
  const state = { eventFilter: "important" };
  const ctx = context({ state }, ["activityMatchesEventFilter"]);
  assert.equal(ctx.activityMatchesEventFilter(event("high", "high")), true);
  assert.equal(ctx.activityMatchesEventFilter(event("normal", "normal")), false);
  ["birthday", "deadline", "holiday"].forEach(eventType => assert.equal(ctx.activityMatchesEventFilter({ eventType, importance: "low" }), true));
  assert.equal(ctx.activityMatchesEventFilter({ eventType: "trip", importance: "normal" }), false);
  state.eventFilter = "trip";
  assert.equal(ctx.activityMatchesEventFilter({ eventType: "trip", importance: "normal" }), true);
  assert.equal(ctx.activityMatchesEventFilter({ eventType: "activity", importance: "high" }), false);
  state.eventFilter = "holidays";
  assert.equal(ctx.activityMatchesEventFilter({ eventType: "holiday", importance: "normal" }), true);
  assert.equal(ctx.activityMatchesEventFilter({ eventType: "trip", importance: "normal" }), true);
  assert.equal(ctx.activityMatchesEventFilter({ eventType: "activity", importance: "high" }), false);
  state.eventFilter = "activity";
  assert.equal(ctx.activityMatchesEventFilter({ eventType: "birthday", importance: "high" }), false);
  state.eventFilter = "all";
  assert.equal(ctx.activityMatchesEventFilter({}), true);
});

test("next-up stays chronological even when a later important event leads the list", () => {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [2026, 9, 13, 8, 45])); } }
  const ctx = context({ Date: FixedDate, selectedDate: new Date(2026, 9, 13) }, ["minutes", "isSameDate", "activityStatus", "isHolidayActivity", "nextUpActivity"]);
  const items = [event("later high", "high", "16:00"), event("next low", "low", "09:00"), event("cancelled", "high", "08:50", { status: "cancelled" }), event("pinned timed holiday", "high", "08:50", { eventType: "holiday" })];
  assert.equal(ctx.nextUpActivity(items).id, "next low");
  assert.equal(items[0].id, "later high");
  ctx.selectedDate = new Date(2026, 9, 14);
  assert.equal(ctx.nextUpActivity(items).id, "next low");
});

test("badges are textual, escaped, and absent from normal events", () => {
  const ctx = context();
  assert.equal(ctx.eventImportanceBadge({}), "");
  assert.match(ctx.eventImportanceBadge({ importance: "high" }), /event-importance-badge event-importance is-high/);
  assert.match(ctx.eventImportanceBadge({ importance: "low" }), /Low importance/);
  ctx.t = () => "<unsafe>";
  assert.match(ctx.eventImportanceBadge({ importance: "high" }), /&lt;unsafe&gt;/);
});

test("calendar event accessible labels retain importance, actual time and status", () => {
  const target = element();
  const ctx = context({ activityTitle: item => item.title, eventTimeText: () => "4:00 – 5:00 PM", displayChild: () => "Family", activityStatusLabel: () => "Confirmed", scheduleEventPeekHide: noop }, ["bindCalendarEventActions"]);
  ctx.bindCalendarEventActions(target, event("School pickup", "high", "16:00"));
  assert.equal(target.dataset.importance, "high");
  assert.match(target["aria-label"], /School pickup · 4:00 – 5:00 PM · Family · High importance · Confirmed/);
});

test("ICS priority supports RFC 5545 ranges and undefined priority", () => {
  const ctx = context({}, ["importanceFromIcsPriority"]);
  [1, 2, 3, 4].forEach(value => assert.equal(ctx.importanceFromIcsPriority(String(value)), "high"));
  [6, 7, 8, 9].forEach(value => assert.equal(ctx.importanceFromIcsPriority(String(value)), "low"));
  ["", "0", "5", "invalid", "-1", "10", "1.2"].forEach(value => assert.equal(ctx.importanceFromIcsPriority(value), "normal"));
});

test("ICS export and import preserve importance, event type, date ranges, and recurring event rules", () => {
  const state = { activities: [event("high", "high", "09:00", { startDate: "2026-10-13", recurrence: "weekly", repeatDays: [2, 4], repeatInterval: 2 }), event("normal", undefined, "10:00", { startDate: "2026-10-13", endDate: "2026-10-15", eventType: "trip", allDay: true }), event("low", "low", "11:00", { startDate: "2026-10-13" })] };
  let sequence = 0;
  const ctx = context({ state, calendars: [], currentCalendarId: "default", currentWeekStart: new Date(2026, 9, 12), FAMILY_CHILD: "__family__", MISC_ICON: "✨", makeId: () => `imported-${++sequence}`, displayChild: () => "Family" }, ["activityStatus", "recurrenceValue", "dateKey", "parseDateKey", "addDays", "compactIcsDate", "icsEscape", "buildIcsCalendar", "parseIcsDate", "icsUnescape", "importanceFromIcsPriority", "importIcsEvents"]);
  const ics = ctx.buildIcsCalendar();
  const single = ctx.buildIcsCalendar([state.activities[1]]);
  assert.equal((single.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(single, /X-KIDSYNC-EVENT-TYPE:trip/);
  assert.doesNotMatch(single, /SUMMARY:high|SUMMARY:low/);
  ["PRIORITY:1", "PRIORITY:5", "PRIORITY:9"].forEach(priority => assert.match(ics, new RegExp(priority)));
  assert.match(ics, /DTEND;VALUE=DATE:20261016/);
  const imported = Array.from(ctx.importIcsEvents(ics));
  assert.deepEqual(imported.map(item => item.importance), ["high", "normal", "low"]);
  assert.deepEqual(imported.map(item => item.eventType), ["activity", "trip", "activity"]);
  assert.equal(imported[0].recurrence, "weekly");
  assert.deepEqual(Array.from(imported[0].repeatDays), [2, 4]);
  assert.equal(imported[0].repeatInterval, 2);
  assert.equal(imported[1].endDate, "2026-10-15");
});

test("JSON backups preserve importance and normalize invalid older values", () => {
  const ctx = context({ kidProfiles: [], FAMILY_CHILD: "__family__", makeId: () => "imported" }, ["importBackupEvents"]);
  const imported = ctx.importBackupEvents(JSON.stringify({ activities: [event("high", "high", "09:00", { startDate: "2026-10-13" }), event("old", undefined, "10:00", { startDate: "2026-10-13" }), event("bad", "urgent", "11:00", { startDate: "2026-10-13" })] }));
  assert.deepEqual(Array.from(imported, item => item.importance), ["high", "normal", "normal"]);
});

test("recurrence occurrences and local storage retain the importance property", () => {
  const state = { activities: [event("pickup", "high", "15:00", { child: "__family__", startDate: "2026-10-13", recurrence: "weekly", repeatDays: [2] })], visibleKids: new Set(), eventFilter: "all" };
  let stored;
  const ctx = context({ state, days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(key => ({ key })), FAMILY_CHILD: "__family__", activityMatchesSearch: () => true, builtInHolidayActivities: () => [], persistScheduleData: (key, value) => { stored = JSON.parse(JSON.stringify(value)); return true; } }, ["addDays", "dateKey", "parseDateKey", "dateSerial", "activitySpanDays", "activityStartsOn", "activityOccursOn", "activitySpanPosition", "activityMatchesEventFilter", "occurrencesOnDate", "saveActivities"]);
  assert.equal(ctx.occurrencesOnDate(new Date(2026, 9, 20))[0].importance, "high");
  assert.equal(ctx.saveActivities(), true);
  assert.equal(stored[0].importance, "high");
});

test("new-event save writes the selected importance and editing can change it", () => {
  const names = ["id", "child", "date", "endDate", "eventType", "importance", "recurrence", "repeatInterval", "repeatUntil", "allDay", "start", "end", "title", "style", "color", "status", "travelMinutes", "notes", "location", "responsible", "items"];
  const fields = Object.fromEntries(names.map(name => [name, element()]));
  Object.assign(fields.child, { value: "__family__" });
  fields.title.value = "School pickup";
  fields.importance.value = "high";
  fields.start.value = "15:00";
  fields.end.value = "15:30";
  fields.date.value = "2026-10-13";
  fields.recurrence.value = "none";
  let submit;
  let saved;
  const state = { activities: [] };
  const ctx = context({ fields, state, form: { addEventListener: (_, fn) => { submit = fn; } }, requireEventDraftChoice: () => false, eventFormStep: 4, EVENT_FORM_STEPS: [1, 2, 3, 4], makeId: () => "pickup", selectedEventIcon: () => "🚗", selectedAttendees: () => ["all"], rememberCurrentSchedule: noop, activityTitle: item => item.title, clearCompletedEventDraft: noop, saveActivities: () => { saved = JSON.parse(JSON.stringify(state.activities)); return true; }, auditActivity: noop, trackProductEvent: noop, closeDialog: noop, renderAll: noop, scheduleSmartCalendarFocus: noop, showFeedbackToast: noop }, ["minutes"]);
  const start = html.indexOf('    form.addEventListener("submit", event => {');
  const end = html.indexOf('    kidsForm.addEventListener("submit"', start);
  vm.runInContext(html.slice(start, end), ctx);
  submit({ preventDefault: noop });
  assert.equal(saved[0].importance, "high");
  fields.id.value = "pickup";
  fields.importance.value = "low";
  submit({ preventDefault: noop });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].importance, "low");
});

test("shared editor writes importance while preserving unknown event fields", async () => {
  const nodes = Object.fromEntries(["sharedEventAllDay", "sharedEventStart", "sharedEventEnd", "sharedEventId", "sharedEventType", "sharedEventImportance", "sharedEventTitle", "sharedEventChild", "sharedEventDate", "sharedEventEndDate", "sharedEventEndDateField", "sharedEventNotes", "sharedEventStatus", "sharedEventDialog"].map(name => [name, element()]));
  nodes.sharedEventDialog.close = noop;
  nodes.sharedEventId.value = "shared-pickup";
  nodes.sharedEventImportance.value = "high";
  nodes.sharedEventType.value = "activity";
  nodes.sharedEventTitle.value = "Pickup";
  nodes.sharedEventStart.value = "15:00";
  nodes.sharedEventEnd.value = "15:30";
  let stored;
  const ctx = context({ document: { getElementById: id => nodes[id] }, canEditSharedCalendar: () => true, sharedCalendarState: { shared: { activities: [event("shared-pickup", "low", "15:00", { customFutureField: "keep me" })] } }, sharedEventIcon: () => "🚗", persistSharedCalendarActivities: async activities => { stored = activities; }, reportClientError: error => { throw error; } }, ["minutes", "saveSharedEvent"]);
  await ctx.saveSharedEvent({ preventDefault: noop });
  assert.equal(stored[0].importance, "high");
  assert.equal(stored[0].customFutureField, "keep me");
});

test("draft capture includes importance and resume restores a valid level", () => {
  const draftFields = JSON.parse(html.match(/const EVENT_DRAFT_FIELDS = (\[[^;]+\]);/)[1]);
  const fields = Object.fromEntries(draftFields.map(name => [name, element()]));
  fields.allDay = element();
  fields.importance.value = "high";
  fields.importance.options = ["high", "normal", "low"].map(value => ({ value }));
  fields.end.setCustomValidity = noop;
  const ctx = context({ fields, EVENT_DRAFT_FIELDS: draftFields, eventFormStep: 2, document: { querySelectorAll: () => [] }, selectedAttendees: () => ["all"], eventDraftSession: { key: "draft", pending: { values: { importance: "high" } } }, scheduleStorageKey: () => "draft", kidProfiles: [], renderAttendeeOptions: noop, renderEventColorOptions: noop, updateCustomIconField: noop, updateAllDayFields: noop, updateTripDateFields: noop, updateRecurrenceFields: noop, normalizedEventTitle: value => value, setEventFormStep: noop, renderEventDurationControls: noop, renderEventDraftState: noop, saveNewEventDraft: noop }, ["captureEventDraft", "resumeEventDraft"]);
  assert.equal(ctx.captureEventDraft().importance, "high");
  fields.importance.value = "normal";
  ctx.resumeEventDraft();
  assert.equal(fields.importance.value, "high");
  ctx.eventDraftSession = { key: "draft", pending: { values: { importance: "urgent" } } };
  fields.importance.value = "normal";
  ctx.resumeEventDraft();
  assert.equal(fields.importance.value, "normal");
});

test("all inline production scripts still parse", () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) new vm.Script(match[1]);
  }
});
