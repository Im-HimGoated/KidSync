const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
function source(name, next) {
  return html.slice(html.indexOf(`    function ${name}(`), html.indexOf(`    ${next}`));
}
const context = vm.createContext({});
vm.runInContext(source("parseScannedLogistics", "function renderScannedGameSummary("), context);
const parse = text => JSON.parse(JSON.stringify(context.parseScannedLogistics(text)));

test("reads labeled adult and packing details from Markdown", () => {
  assert.deepEqual(parse("- **Responsible adult:** Coach Maria Chen\n- **What to bring:** Cleats, shin guards, water bottle"), {
    responsible: "Coach Maria Chen", items: "Cleats, shin guards, water bottle"
  });
});

test("reads multiline packing lists without swallowing the next field", () => {
  assert.deepEqual(parse("Responsible adult:\nAlex Kim\nWhat to bring:\n- Uniform\n- Water\n- Arrival: 9:30 AM"), {
    responsible: "Alex Kim", items: "Uniform; Water"
  });
});

test("reads explicit instructions in English and Chinese", () => {
  assert.deepEqual(parse("The responsible adult is Maria Chen. Players should bring cleats and water. Families are welcome."), {
    responsible: "Maria Chen", items: "cleats and water"
  });
  assert.deepEqual(parse("负责人：王老师\n携带物品：球鞋、水壶"), { responsible: "王老师", items: "球鞋、水壶" });
  assert.deepEqual(parse("负责人是王老师。请携带球鞋和水壶。"), { responsible: "王老师", items: "球鞋和水壶" });
});

test("does not infer an adult from a contact or invent missing equipment", () => {
  assert.deepEqual(parse("Contact: Sam Lee\nLocation: Riverside Park\nSnacks provided after the game."), { responsible: "", items: "" });
  assert.deepEqual(parse("Responsible adult:\nLocation: Park\nWhat to bring:\nTime: 10 AM"), { responsible: "", items: "" });
});

test("fits existing field limits", () => {
  const details = parse(`Responsible adult: ${"A".repeat(80)}\nBring: ${"B".repeat(200)}`);
  assert.equal(details.responsible.length, 60);
  assert.equal(details.items.length, 160);
});

test("applies extracted fields but preserves manual values when absent", () => {
  const fields = Object.fromEntries(["title", "date", "start", "end", "allDay", "location", "responsible", "items", "eventType", "recurrence", "repeatInterval", "repeatUntil", "notes"].map(key => [key, { value: "manual" }]));
  let details = { text: "Game", title: "Game", ...parse("Responsible adult: Coach Chen\nBring: Water") };
  const noop = () => {};
  const applyContext = vm.createContext({ fields, parseScannedGameDetails: () => details,
    inferredEventDefaults: () => null, normalizedEventTitle: value => value, setIconField: noop,
    updateAllDayFields: noop, updateRecurrenceFields: noop, updateConflictSuggestions: noop,
    gameScanText: {}, renderScannedGameSummary: noop,
    gameScanProgress: { classList: { add: noop, remove: noop } }, gameScanProgressText: {},
    t: value => value, scheduleNewEventDraftSave: noop });
  vm.runInContext(source("applyScannedGameDetails", "async function scanGamePhoto("), applyContext);
  assert.equal(applyContext.applyScannedGameDetails("Game"), true);
  assert.equal(fields.responsible.value, "Coach Chen");
  assert.equal(fields.items.value, "Water");
  details = { text: "Other game", title: "Other game", ...parse("Other game") };
  applyContext.applyScannedGameDetails("Other game");
  assert.equal(fields.responsible.value, "Coach Chen");
  assert.equal(fields.items.value, "Water");
});
