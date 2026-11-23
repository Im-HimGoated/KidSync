// Portable parsing rules extracted from the website document scanner.
// Input is document data. No browser, network, OCR or calendar writes occur here.
const MAX_DOCUMENT_LENGTH = 20000;

function parseDocumentText(rawText, options = {}) {
  if (typeof rawText !== 'string' || !rawText.trim()) throw new Error('DOCUMENT_EMPTY');
  if (rawText.length > MAX_DOCUMENT_LENGTH) throw new Error('DOCUMENT_TOO_LONG');
  const kidProfiles = (Array.isArray(options.kids) ? options.kids : [])
    .filter(kid => kid && typeof kid.name === 'string');
  const FAMILY_CHILD = '__family__';
  const userSettings = { defaultEventDuration: options.defaultDuration };
  const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
  const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };
  const timeInputValue = minutes => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  function validScannedDate(year, month, day) {
    const candidate = new Date(year, month, day);
    if (candidate.getFullYear() !== year || candidate.getMonth() !== month || candidate.getDate() !== day) return null;
    return candidate;
  }

  function scannedYearOrNext(month, day, yearText) {
    let year = yearText ? Number(yearText) : new Date().getFullYear();
    if (year < 100) year += 2000;
    let candidate = validScannedDate(year, month, day);
    if (!yearText && candidate && candidate.getTime() < addDays(new Date(), -30).getTime()) {
      candidate = validScannedDate(year + 1, month, day);
    }
    return candidate;
  }

  function parseScannedDate(text) {
    const chinese = text.match(/(?:(20\d{2})年)?\s*(\d{1,2})月\s*(\d{1,2})[日号]/);
    if (chinese) {
      const candidate = scannedYearOrNext(Number(chinese[2]) - 1, Number(chinese[3]), chinese[1]);
      if (candidate) return dateKey(candidate);
    }
    const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (iso) {
      const candidate = validScannedDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      if (candidate) return dateKey(candidate);
    }
    const numeric = text.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/(\d{2,4}))?\b/);
    if (numeric) {
      const candidate = scannedYearOrNext(Number(numeric[1]) - 1, Number(numeric[2]), numeric[3]);
      if (candidate) return dateKey(candidate);
    }
    const monthNames = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const named = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
    if (named) {
      const candidate = scannedYearOrNext(monthNames[named[1].slice(0, 3).toLowerCase()], Number(named[2]), named[3]);
      if (candidate) return dateKey(candidate);
    }
    const dayFirst = text.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i);
    if (dayFirst) {
      const candidate = scannedYearOrNext(monthNames[dayFirst[2].slice(0, 3).toLowerCase()], Number(dayFirst[1]), dayFirst[3]);
      if (candidate) return dateKey(candidate);
    }
    if (/\btomorrow\b|明天/i.test(text)) return dateKey(addDays(new Date(), 1));
    if (/\btoday\b|今天/i.test(text)) return dateKey(new Date());
    const weekday = text.trim().match(/^(?:next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
    if (weekday) {
      const day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekday[1].toLowerCase());
      const today = new Date();
      const offset = (day - today.getDay() + 7) % 7;
      return dateKey(addDays(today, offset || (/^next/i.test(text) ? 7 : 0)));
    }
    return "";
  }

  function scannedClockValue(hourText, minuteText, meridiemText) {
    let hour = Number(hourText);
    const minute = Number(minuteText || 0);
    const meridiem = String(meridiemText || "").toLowerCase().replace(/\./g, "");
    if (minute > 59 || hour > 23) return null;
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      if (meridiem === "pm" && hour !== 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
    }
    return hour * 60 + minute;
  }

  function parseScannedTimes(text) {
    if (text.split("\n").some(line => /^(?:(?:time|when|时间)\s*[:：]\s*)?(?:all[ -]day(?:\s+event)?|全天|整天)[.!。]?$/i.test(line.trim()))) return { start: "", end: "", allDay: true };
    // Arrival and check-in are logistics, not the event's start time.
    const timeLines = text.split("\n").filter(line => !/^\s*(?:[-*•]\s*)?(?:arrival|arrive|check[ -]?in|warm[ -]?up|到达|签到|集合)\s*[:：]/i.test(line));
    const timeText = timeLines.join("\n");
    const duration = timeText.match(/(?:duration|lasts?|length|时长)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|小时|分钟)/i);
    const durationMinutes = duration ? Math.round(Number(duration[1]) * (/hour|hr|小时/i.test(duration[2]) ? 60 : 1)) : null;
    const finish = (start, end) => {
      if (start === null || end !== null && end <= start) return { start: "", end: "", warning: "timeReview" };
      const resolved = end ?? start + (durationMinutes || Math.max(15, Number(userSettings.defaultEventDuration) || 30));
      if (resolved > 1439) return { start: "", end: "", warning: "overnight" };
      return { start: timeInputValue(start), end: timeInputValue(resolved), estimatedEnd: end === null && !durationMinutes };
    };
    const clock24 = timeText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|—|to|至|到)\s*([01]?\d|2[0-3]):([0-5]\d)(?!\d|\s*[ap]\.?m)/i);
    if (clock24 && !/上午|下午|晚上|中午/.test(timeText)) return finish(scannedClockValue(clock24[1], clock24[2]), scannedClockValue(clock24[3], clock24[4]));
    const chineseClock = timeText.match(/(上午|下午|晚上|中午)?\s*(\d{1,2})(?:[:：](\d{2})|点(半|\d{1,2}分?)?)\s*(?:-|–|—|至|到)\s*(上午|下午|晚上|中午)?\s*(\d{1,2})(?:[:：](\d{2})|点(半|\d{1,2}分?)?)/);
    if (chineseClock) {
      const meridiem = word => word === "上午" ? "am" : word ? "pm" : "";
      const minute = (numeric, word) => numeric || (word === "半" ? "30" : word?.replace("分", "") || "0");
      return finish(scannedClockValue(chineseClock[2], minute(chineseClock[3], chineseClock[4]), meridiem(chineseClock[1])), scannedClockValue(chineseClock[6], minute(chineseClock[7], chineseClock[8]), meridiem(chineseClock[5] || chineseClock[1])));
    }
    text = timeText;
    const range = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (range) {
      let start = scannedClockValue(range[1], range[2], range[3] || range[6]);
      const end = scannedClockValue(range[4], range[5], range[6]);
      if (start !== null && end !== null && end <= start && !range[3] && String(range[6]).toLowerCase().startsWith("p")) {
        start = scannedClockValue(range[1], range[2], "am");
      }
      return finish(start, end);
    }
    const startMatch = text.match(/(?:start|kickoff|tipoff|game\s*time|time)(?:\s*time)?\s*[:\-]?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
    const endMatch = text.match(/(?:end|finish)(?:\s*time)?\s*[:\-]?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
    const anyTime = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    const source = startMatch || anyTime;
    if (!source) {
      const single24 = text.match(/(?:start|time|开始|时间)\s*[:：]\s*([01]?\d|2[0-3]):([0-5]\d)/i);
      const singleChinese = text.match(/(上午|下午|晚上|中午)\s*(\d{1,2})(?:[:：](\d{2})|点(半|\d{1,2}分?)?)/);
      if (singleChinese) return finish(scannedClockValue(singleChinese[2], singleChinese[3] || (singleChinese[4] === "半" ? "30" : singleChinese[4]?.replace("分", "") || "0"), singleChinese[1] === "上午" ? "am" : "pm"), null);
      return single24 ? finish(scannedClockValue(single24[1], single24[2]), null) : { start: "", end: "" };
    }
    const start = scannedClockValue(source[1], source[2], source[3]);
    const explicitEnd = endMatch ? scannedClockValue(endMatch[1], endMatch[2], endMatch[3]) : null;
    if (start === null) return { start: "", end: "" };
    return finish(start, explicitEnd);
  }

  function scannedLineValue(lines, labels) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const match = line.match(new RegExp(`^(?:${labels.join("|")})\\s*[:：\\-]\\s*(.+)$`, "i"));
      if (match?.[1]) return match[1].trim();
      if (new RegExp(`^(?:${labels.join("|")})\\s*[:：]?$`, "i").test(line) && lines[index + 1] && !/^[^:：]{1,40}[:：]/.test(lines[index + 1])) return lines[index + 1];
    }
    return "";
  }

  function parseScannedGameDetails(rawText) {
    const text = String(rawText || "").replace(/\r/g, "").replace(/[|]+/g, " ").trim();
    const lines = text.split("\n").map(line => line.replace(/\*\*/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const dateText = scannedLineValue(lines, ["date", "start date", "when", "日期", "开始日期"]);
    let date = parseScannedDate(dateText || lines.filter(line => !/^(?:until|ends on|end date|repeat until|截止重复|结束日期)\s*[:：]/i.test(line)).join("\n"));
    const times = parseScannedTimes(lines.join("\n"));
    let title = scannedLineValue(lines, ["event", "game", "match", "title", "activity", "event name", "活动", "活动名称", "标题", "比赛", "课程"]);
    if (title && (parseScannedDate(title) || /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(title))) title = "";
    const opponent = scannedLineValue(lines, ["opponent", "away team", "versus", "vs\\.?", "对手", "客队"]);
    const home = scannedLineValue(lines, ["home team", "主队"]);
    if (!title && opponent) title = home ? `${home} vs ${opponent}` : `Game vs ${opponent}`;
    if (!title) {
      title = lines.find(line => /\b(vs\.?|versus|game|match|tournament)\b/i.test(line)
        && !/^game\s*(details|description)?$/i.test(line)
        && !/\b(?:am|pm)\b/i.test(line)) || lines.find(line => !/[:：]/.test(line) && !parseScannedDate(line) && line.length <= 100) || "";
    }
    let location = scannedLineValue(lines, ["location", "venue", "field", "地点", "场地"]);
    const address = scannedLineValue(lines, ["address", "地址"]);
    if (address && !location.includes(address)) location = [location, address].filter(Boolean).join(", ");
    if (!location) {
      location = lines.find(line => /\b(field|stadium|park|gym|complex|school|center|centre|arena)\b/i.test(line)
        && !/^[^:：]{1,40}[:：]/.test(line) && line !== title
        && !/^(location|venue|field)\s*:?$/i.test(line)) || "";
    }
    const extras = parseScannedEventExtras(lines, title);
    const warnings = [];
    if (!date && extras.repeatDays?.length) {
      const next = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index)).find(day => extras.repeatDays.includes(day.getDay()));
      date = dateKey(next);
      warnings.push("dateInferred");
    }
    const statedDates = lines.filter(line => /^(?:date|日期)\s*[:：]/i.test(line)).map(parseScannedDate).filter(Boolean);
    if (new Set(statedDates).size > 1) warnings.push("multipleEvents");
    if (!title) warnings.push("titleReview");
    if (!date) warnings.push("dateReview");
    if (!times.start && !times.allDay) warnings.push(times.warning || "timeReview");
    if (times.estimatedEnd) warnings.push("estimatedEnd");
    if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(dateText)) warnings.push("numericDateReview");
    if (/\b(?:PST|PDT|EST|EDT|CST|CDT|MST|MDT|UTC|GMT|CET|BST)\b/i.test(text)) warnings.push("timezoneReview");
    if (extras.repeatUntil && date && extras.repeatUntil < date) { extras.repeatUntil = ""; warnings.push("repeatReview"); }
    return { text, title: title.slice(0, 100), date, start: times.start, end: times.end, allDay: times.allDay, location: location.slice(0, 100), ...parseScannedLogistics(text), ...extras, warnings };
  }

  function parseScannedEventExtras(lines, title) {
    const result = {};
    const repeats = scannedLineValue(lines, ["repeat", "repeats", "recurrence", "重复", "频率"]) || lines.find(line => /^(?:every|each|weekly|daily|monthly|yearly|每|周一至周五|工作日)/i.test(line)) || "";
    const interval = repeats.match(/every\s+(\d+)\s+(days?|weeks?|months?|years?)/i);
    if (interval) {
      result.recurrence = { d: "daily", w: "weekly", m: "monthly", y: "yearly" }[interval[2][0].toLowerCase()];
      result.repeatInterval = Math.max(1, Math.min(12, Number(interval[1])));
    } else {
      if (/weekdays?|工作日|周一至周五/i.test(repeats)) { result.recurrence = "weekly"; result.repeatDays = [1, 2, 3, 4, 5]; }
      else if (/daily|every day|每天|每日/i.test(repeats)) result.recurrence = "daily";
      else if (/monthly|every month|每月/i.test(repeats)) result.recurrence = "monthly";
      else if (/yearly|annually|every year|每年/i.test(repeats)) result.recurrence = "yearly";
      else if (/weekly|weekend|every|each|每周|每星期/i.test(repeats)) result.recurrence = "weekly";
      else if (/none|one.time|不重复|单次/i.test(repeats)) result.recurrence = "none";
    }
    if (result.recurrence === "weekly" && !result.repeatDays) {
      const weekdays = [/\bsun(?:day)?s?\b|[周期]日|[周期]天/i, /\bmon(?:day)?s?\b|[周期]一/i, /\btue(?:sday)?s?\b|[周期]二/i, /\bwed(?:nesday)?s?\b|[周期]三/i, /\bthu(?:rsday)?s?\b|[周期]四/i, /\bfri(?:day)?s?\b|[周期]五/i, /\bsat(?:urday)?s?\b|[周期]六/i];
      result.repeatDays = weekdays.flatMap((pattern, day) => pattern.test(repeats) ? [day] : []);
      if (/weekends?|周末/i.test(repeats)) result.repeatDays = [0, 6];
    }
    const until = scannedLineValue(lines, ["until", "ends on", "end date", "repeat until", "截止重复", "结束日期"]) || repeats.match(/(?:until|through|截至|直到)\s*(.+)$/i)?.[1];
    if (until) result.repeatUntil = parseScannedDate(until);
    const type = scannedLineValue(lines, ["event type", "type", "事件类型", "类型"]) || title;
    if (/birthday|生日/i.test(type)) result.eventType = "birthday";
    else if (/holiday|节假日|假期|节日/i.test(type)) result.eventType = "holiday";
    else if (/deadline|due date|截止/i.test(type)) result.eventType = "deadline";
    else if (/trip|travel|flight|vacation|旅行|出行|航班|度假/i.test(type)) result.eventType = "trip";
    if (result.eventType === "trip") {
      const tripEnd = scannedLineValue(lines, ["trip end", "trip ends", "return date", "end date", "旅行结束", "返程日期", "结束日期"]);
      const parsedTripEnd = parseScannedDate(tripEnd);
      if (parsedTripEnd) result.endDate = parsedTripEnd;
      if (!result.recurrence) delete result.repeatUntil;
    }
    const status = scannedLineValue(lines, ["status", "状态"]);
    if (/cancelled|canceled|取消/i.test(status)) result.status = "cancelled";
    else if (/tentative|pending|暂定|待定/i.test(status)) result.status = "tentative";
    else if (/confirmed|已确认|确认/i.test(status)) result.status = "confirmed";
    const importance = scannedLineValue(lines, ["importance", "priority", "重要性", "优先级"]);
    if (/high|urgent|important|高|紧急|重要/i.test(importance)) result.importance = "high";
    else if (/low|低/i.test(importance)) result.importance = "low";
    else if (/normal|普通|正常/i.test(importance)) result.importance = "normal";
    const child = scannedLineValue(lines, ["child", "for", "kid", "孩子", "参与者"]);
    if (child) {
      const match = kidProfiles.find(kid => kid.name.toLowerCase() === child.toLowerCase());
      if (match) result.child = match.name;
      else if (/^(?:family|all|全家|所有人)$/i.test(child)) result.child = FAMILY_CHILD;
    }
    const travel = scannedLineValue(lines, ["travel time", "travel buffer", "travel", "路程时间", "出行时间"]);
    const travelMinutes = travel?.match(/^(15|30|45|60)\s*(?:min(?:utes?)?|分钟)?$/i);
    if (travelMinutes) result.travelMinutes = travelMinutes[1];
    return result;
  }

  function parseScannedLogistics(text) {
    const entries = text.split("\n").map(line => ({
      value: line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim(),
      bullet: /^\s*(?:[-*•]|\d+[.)])\s+/.test(line)
    })).filter(entry => entry.value);
    const lines = entries.map(entry => entry.value);
    const adultLabel = /^(?:responsible adult|responsible|adult in charge|person in charge|supervising adult|supervisor|caregiver|coach|负责人|负责的成人|带队成人|教练)\s*[:：\-]\s*(.*)$/i;
    const itemsLabel = /^(?:what to bring|things to bring|items to bring|bring|packing list|equipment|需要携带|携带物品|物品清单|装备)\s*[:：\-]\s*(.*)$/i;
    const sectionLabel = /^(?:[\w \-/]{1,40}|[\u3400-\u9fff]{1,16})\s*[:：]/;
    let responsible = "";
    const items = [];
    for (let index = 0; index < lines.length; index += 1) {
      const adult = lines[index].match(adultLabel);
      if (adult && !responsible) {
        const next = lines[index + 1] || "";
        responsible = adult[1] || (!sectionLabel.test(next) ? next : "");
      }
      const packing = lines[index].match(itemsLabel);
      if (!packing) continue;
      if (packing[1]) items.push(packing[1]);
      // Continue only list-shaped lines; unrelated prose stays in the notes.
      for (let next = index + 1; next < entries.length; next += 1) {
        if (!entries[next].bullet) break;
        const value = entries[next].value;
        if (sectionLabel.test(value)) break;
        items.push(value);
      }
      if (!packing[1] && !items.length && lines[index + 1] && !sectionLabel.test(lines[index + 1])) items.push(lines[index + 1]);
    }
    if (!responsible) {
      const mention = text.match(/(?:responsible adult|adult in charge|supervising adult)\s+(?:is|will be)\s+([^\n.!?]+)/i)
        || text.match(/(?:^|[\n.!?]\s*)([^\n.!?]{2,60}?)\s+(?:will supervise|is supervising|will be supervising|is in charge)\b/i)
        || text.match(/(?:负责人|负责的成人|带队成人)(?:是|为)\s*([^\n。！？]+)/);
      if (mention) responsible = mention[1].trim();
    }
    if (!items.length) {
      const instruction = text.match(/\b(?:(?:players|children|kids|participants|families)\s+(?:should|must|need to)|please)\s+bring\s+([^\n.!?]+)/i)
        || text.match(/(?:^|[.!?]\s+)bring\s+([^\n.!?]+)/im)
        || text.match(/(?:请携带|需要带上|请带上)\s*([^\n。！？]+)/);
      if (instruction) items.push(instruction[1].trim());
    }
    return { responsible: responsible.slice(0, 60), items: [...new Set(items)].join("; ").slice(0, 160) };
  }

  const details = parseScannedGameDetails(rawText);
  const warnings = [...details.warnings];
  const draft = {
    title: details.title, startDate: details.date || '', endDate: details.endDate || '',
    start: details.start, end: details.end, allDay: details.allDay === true,
    location: details.location, responsible: details.responsible, items: details.items,
    notes: details.text,
  };
  for (const field of ['eventType', 'recurrence', 'repeatInterval', 'repeatDays', 'repeatUntil', 'status', 'importance', 'travelMinutes']) {
    if (details[field] !== undefined) draft[field] = details[field];
  }
  if (draft.travelMinutes !== undefined) draft.travelMinutes = Number(draft.travelMinutes);
  if (details.child) {
    const person = kidProfiles.find(kid => kid.name === details.child);
    draft.child = person ? String(person.id ?? person.name) : FAMILY_CHILD;
  }
  return { draft, warnings };
}

module.exports = { MAX_DOCUMENT_LENGTH, parseDocumentText };
