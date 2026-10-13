const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const context = vm.createContext({
  userSettings: { defaultEventDuration: 30 }, kidProfiles: [{ name: "Charlie" }, { name: "安安" }], FAMILY_CHILD: "Family",
  dateKey: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  addDays: (date, count) => { const next = new Date(date); next.setDate(next.getDate() + count); return next; },
  timeInputValue: minutes => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
});
vm.runInContext(html.slice(html.indexOf("    function validScannedDate("), html.indexOf("    function renderScannedGameSummary(")), context);
const parse = text => JSON.parse(JSON.stringify(context.parseScannedGameDetails(text)));

test("interprets general events and explicit metadata", () => {
  const result = parse("Title: Piano lesson\nChild: Charlie\nDate: 17 October 2026\nTime: 14:00-15:30\nLocation: Music Studio\nAddress: 125 Main Street\nResponsible adult: Ms. Chen\nBring: Sheet music\nRepeat: Every 2 weeks on Saturday\nUntil: December 19, 2026\nStatus: Tentative\nPriority: High\nTravel time: 30 minutes");
  for (const [key, value] of Object.entries({ title: "Piano lesson", child: "Charlie", date: "2026-10-17", start: "14:00", end: "15:30", location: "Music Studio, 125 Main Street", responsible: "Ms. Chen", items: "Sheet music", recurrence: "weekly", repeatInterval: 2, repeatUntil: "2026-12-19", status: "tentative", importance: "high", travelMinutes: "30" })) assert.equal(result[key], value, key);
  assert.deepEqual(result.repeatDays, [6]);
});

test("reads Chinese dates, clocks, logistics, and recurrence", () => {
  const result = parse("活动：编程课\n孩子：安安\n日期：2026年10月17日\n时间：下午3点半至5点\n地点：学校电脑室\n负责人：王老师\n携带物品：笔记本电脑\n重复：每周六\n状态：已确认");
  for (const [key, value] of Object.entries({ title: "编程课", date: "2026-10-17", start: "15:30", end: "17:00", child: "安安", location: "学校电脑室", responsible: "王老师", items: "笔记本电脑" })) assert.equal(result[key], value, key);
  assert.deepEqual(result.repeatDays, [6]);
});

test("recognizes trip details in English and Chinese", () => {
  const english = parse("Title: Family trip\nDate: 2026-10-17\nEnd date: 2026-10-20\nTime: 9:00-17:00");
  assert.equal(english.eventType, "trip");
  assert.equal(english.endDate, "2026-10-20");
  const chinese = parse("活动：北京旅行\n日期：2026年10月17日\n返程日期：2026年10月20日\n时间：上午9点至下午5点");
  assert.equal(chinese.eventType, "trip");
  assert.equal(chinese.endDate, "2026-10-20");
});

test("keeps arrival separate from match times", () => {
  const result = parse("Title: Soccer\nDate: October 17, 2026\nArrival: 9:30 AM\nTime: 10:00-11:15 AM\nCoach Alex will supervise.\nPlayers should bring cleats and water.");
  assert.equal(result.start, "10:00");
  assert.equal(result.end, "11:15");
  assert.equal(result.responsible, "Coach Alex");
  assert.equal(result.items, "cleats and water");
  assert.match(result.text, /Arrival: 9:30 AM/);
});

test("reads all-day and duration without assigning soccer defaults", () => {
  const allDay = parse("Title: School holiday\nDate: 2026-10-17\nAll day");
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.eventType, "holiday");
  assert.equal(allDay.start, "");
  assert(!allDay.warnings.includes("timeReview"));
  const duration = parse("Title: Robotics\nDate: 2026-10-17\nStart: 4 PM\nDuration: 90 minutes");
  assert.equal(duration.start, "16:00");
  assert.equal(duration.end, "17:30");
  assert(!duration.warnings.includes("estimatedEnd"));
});

test("flags unclear information and does not invent a child", () => {
  assert(parse("Location: Park").warnings.includes("titleReview"));
  assert(parse("Title: Appointment\nStart: 4 PM").warnings.includes("estimatedEnd"));
  assert(parse("Title: Appointment\nTime: 23:00-01:00").warnings.includes("timeReview"));
  assert(parse("Title: Webinar\nTime: 10:00-11:00 AM EST").warnings.includes("timezoneReview"));
  assert.equal(parse("Title: Event\nChild: Unknown").child, undefined);
});

test("recognizes generic headings and preserves unstructured instructions", () => {
  const result = parse("Dentist appointment\nDate: October 17, 2026\nStart: 3 PM\nPlease complete the consent form before arrival.");
  assert.equal(result.title, "Dentist appointment");
  assert.equal(result.start, "15:00");
  assert.match(result.text, /consent form/);
});

test("flags multiple dates, numeric formats, and invalid repeat boundaries", () => {
  assert(parse("Title: Schedule\nDate: 2026-10-17\nDate: 2026-10-18").warnings.includes("multipleEvents"));
  assert(parse("Title: Event\nDate: 10/17/2026").warnings.includes("numericDateReview"));
  const boundary = parse("Title: Lessons\nDate: 2026-10-17\nRepeat: Weekly\nUntil: 2026-10-01");
  assert.equal(boundary.repeatUntil, "");
  assert(boundary.warnings.includes("repeatReview"));
});

test("ignores all-day equipment and invalid dates", () => {
  const result = parse("Title: School trip\nDate: February 30, 2026\nBring: all-day pass\nTime: 10:00-12:00");
  assert.equal(result.date, "");
  assert.equal(result.allDay, undefined);
  assert.equal(result.start, "10:00");
});
