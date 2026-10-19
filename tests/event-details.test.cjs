const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const extract = (name, next) => html.slice(html.indexOf(`    function ${name}(`), html.indexOf(`    ${next}`));

test("event sheet escapes content, renders logistics, and hides holiday deletion", () => {
  const nodes = {};
  const node = id => nodes[id] ||= { style: {}, insertAdjacentHTML() {}, setAttribute(key, value) { this[key] = value; } };
  let opened = 0;
  const context = vm.createContext({
    document: { getElementById: node }, hideEventPeek() {},
    parseDateKey: value => value, dateKey: value => value, selectedDate: "2026-10-17",
    formatFullDate: () => "Saturday, October 17", eventTimeText: () => "10:00 AM - 11:15 AM",
    displayChild: () => "Charlie", recurrenceValue: event => event.recurrence || "none",
    recurrenceLabel: () => "Weekly", userSettings: { notifications: true }, reminderLeadLabel: () => "30 minutes before",
    calendars: [{ id: "family", name: "Family" }], currentCalendarId: "family",
    activityStatus: () => "scheduled", activityStatusLabel: () => "Scheduled",
    eventImportance: () => "normal", eventImportanceLabel: () => "Normal", eventImportanceBadge: () => "",
    escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    t: key => key, activityTitle: event => event.title, eventColors: () => ({ line: "#237cc0" }),
    window: { lucide: { createIcons() {} } }, eventDetailsDialog: { showModal() { opened++; } }
  });
  vm.runInContext(extract("showEventDetails", "function bindCalendarEventActions("), context);
  context.showEventDetails({ title: "Soccer <script>", responsible: "Coach Chen", items: "Water and cleats", location: "Field 3" });
  assert.match(nodes.eventDetailsBody.innerHTML, /Soccer &lt;script&gt;/);
  assert.match(nodes.eventDetailsBody.innerHTML, /Coach Chen/);
  assert.match(nodes.eventDetailsBody.innerHTML, /Water and cleats/);
  assert.match(nodes.eventDetailsBody.innerHTML, /30 minutes before/);
  assert.match(nodes.eventDetailsBody.innerHTML, /Family/);
  assert.equal(nodes.eventDetailsDelete.hidden, false);
  assert.equal(nodes.eventDetailsDuplicate.hidden, false);
  assert.equal(nodes.eventDetailsImportanceControl.hidden, false);
  assert.equal(nodes.eventDetailsImportance.value, "normal");
  assert.equal(nodes.eventDetailsConfirm.hidden, true);
  context.showEventDetails({ title: "Holiday", isBuiltInHoliday: true, allDay: true });
  assert.equal(nodes.eventDetailsDelete.hidden, true);
  assert.equal(nodes.eventDetailsDuplicate.hidden, true);
  assert.equal(nodes.eventDetailsImportanceControl.hidden, true);
  assert.doesNotMatch(nodes.eventDetailsBody.innerHTML, /30 minutes before/);
  assert.equal(opened, 2);
});

test("deletion targets the stored series, records history and supplies undo", () => {
  const activity = { id: "soccer", title: "Soccer", recurrence: "weekly" };
  const calls = [];
  const context = vm.createContext({ state: { activities: [activity, { id: "other" }] },
    rememberCurrentSchedule: () => calls.push("history"), t: value => value, activityTitle: event => event.title,
    saveActivities: () => calls.push("save"), auditActivity: () => calls.push("audit"),
    dialog: { open: false }, closeDialog() { throw new Error("Unrelated editor must stay closed"); },
    renderAll: () => calls.push("render"), scheduleSmartCalendarFocus() {},
    showDeleteUndo: event => calls.push(event) });
  vm.runInContext(extract("deleteCalendarActivity", 'deleteButton.addEventListener("click", () => deleteCalendarActivity('), context);
  context.deleteCalendarActivity("soccer");
  assert.equal(context.state.activities.length, 1);
  assert.equal(context.state.activities[0].id, "other");
  assert.deepEqual(calls, ["history", "save", "audit", "render", activity]);
  context.deleteCalendarActivity("missing");
  assert.equal(calls.length, 5);
});

test("details importance saves the series with history and refreshes its visible order", () => {
  const activity = { id: "soccer", title: "Soccer", importance: "normal" };
  const feedback = {};
  const actions = [];
  const context = vm.createContext({
    eventDetailsActivity: { ...activity, occurrenceDate: "2026-10-17" },
    state: { activities: [activity] },
    document: { getElementById: () => feedback },
    eventImportance: item => item.importance || "normal",
    activityTitle: item => item.title,
    t: key => key,
    rememberCurrentSchedule: () => actions.push("history"),
    saveActivities: () => actions.push("save"),
    auditActivity: (action, before, after) => { actions.push("audit"); assert.equal(before.importance, "normal"); assert.equal(after.importance, "high"); },
    renderAll: () => actions.push("render"),
    showEventDetails: updated => { actions.push("details"); assert.equal(updated.importance, "high"); assert.equal(updated.occurrenceDate, "2026-10-17"); }
  });
  vm.runInContext(extract("changeEventDetailsImportance", "function locateEventDetailsDate("), context);
  assert.equal(context.changeEventDetailsImportance("urgent"), false);
  assert.equal(context.changeEventDetailsImportance("high"), true);
  assert.equal(activity.importance, "high");
  assert.deepEqual(actions, ["history", "save", "audit", "render", "details"]);
  assert.equal(feedback.textContent, "eventActions.importanceSaved");
  assert.equal(context.changeEventDetailsImportance("high"), true);
  assert.equal(actions.length, 5);
});
