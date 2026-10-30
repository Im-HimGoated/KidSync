const en = {
  calendar: 'Calendar', dashboard: 'Dashboard', agenda: 'Today', week: 'Week', month: 'Month', today: 'Today',
  planning: { myself: 'Planning for: yourself', children: 'Planning for: your children', family: 'Planning for: your family' }, searchResults: 'Search results',
  share: 'Share', search: 'Search activities', searchPlaceholder: 'Activity, person, place, or pickup adult', close: 'Close', everyone: 'Everyone', family: 'Family',
  previous: 'Previous period', next: 'Next period', datePicker: 'Choose a date', jump: 'Go to date', date: 'Date', dateHint: 'YYYY-MM-DD',
  calendars: 'Your calendars', createCalendar: 'Create a calendar', calendarName: 'Calendar name',
  empty: 'A little breathing room.', emptyBody: 'No activities for this day. Add a plan, or choose another date.', noResults: 'No matching activities', clear: 'Clear search',
  noCalendar: 'Your family calendar starts here.', noCalendarBody: 'Create a calendar to add your first activity. Your existing KidsSync calendars also appear here.',
  add: 'Add activity', edit: 'Edit activity', details: 'Activity details', cancel: 'Cancel', allDay: 'All day', untimed: 'Time not set', noDate: 'Date not set', cancelled: 'Cancelled',
  refresh: 'Refresh', refreshing: 'Refreshing…', live: 'In sync', connecting: 'Connecting', loading: 'Loading your calendar…',
  loadFailed: 'Could not load your calendar. Refresh to try again.', saveFailed: 'Could not save. Check your connection and try again.',
  conflict: 'This calendar changed while you were editing. Your draft is kept open. Refresh the calendar, then reopen the latest activity before trying again.',
  conflictRefresh: 'Refresh calendar', created: 'Calendar created', saved: 'Activity saved', removed: 'Activity deleted', invalidDate: 'Use a valid date in YYYY-MM-DD format.', invalidName: 'Enter a name of 100 characters or fewer.',
  permission: 'You don’t have permission to change this calendar.', readOnly: 'This calendar is read-only.', openPreferences: 'Calendar preferences',
  noAdult: 'Not assigned', pickup: 'Pickup', untimedHint: 'Activities without valid start and end times', overviewHint: 'Week overview. Tap a date for the full activity list below.',
};
const zh = {
  calendar: '日历', dashboard: '首页', agenda: '今天', week: '周', month: '月', today: '今天', share: '共享', search: '搜索活动', searchPlaceholder: '活动、家人、地点或接送人', close: '关闭', everyone: '所有人', family: '全家',
  planning: { myself: '计划对象：自己', children: '计划对象：孩子', family: '计划对象：全家' }, searchResults: '搜索结果',
  previous: '上一时段', next: '下一时段', datePicker: '选择日期', jump: '前往日期', date: '日期', dateHint: 'YYYY-MM-DD', calendars: '你的日历', createCalendar: '创建日历', calendarName: '日历名称',
  empty: '留一点自由的时光。', emptyBody: '这一天还没有活动。添加安排，或查看其他日期。', noResults: '没有找到活动', clear: '清除搜索', noCalendar: '从这里开启家庭日历。', noCalendarBody: '创建日历并添加第一项活动，也可查看已有的 KidsSync 日历。',
  add: '添加活动', edit: '编辑活动', details: '活动详情', cancel: '取消', allDay: '全天', untimed: '时间待定', noDate: '日期待定', cancelled: '已取消', refresh: '刷新', refreshing: '刷新中…', live: '已同步', connecting: '连接中', loading: '正在加载日历…',
  loadFailed: '无法加载日历，请刷新重试。', saveFailed: '保存失败，请检查网络后重试。', conflict: '编辑期间日历已发生变化，草稿仍保留。请刷新日历，再重新打开最新活动后重试。', conflictRefresh: '刷新日历', created: '已创建日历', saved: '已保存活动', removed: '已删除活动', invalidDate: '请输入有效日期，格式为 YYYY-MM-DD。', invalidName: '请输入 100 个字符以内的名称。', permission: '你没有修改此日历的权限。', readOnly: '此日历仅供查看。', openPreferences: '日历偏好', noAdult: '尚未安排', pickup: '接送人', untimedHint: '尚未设置有效开始与结束时间的活动', overviewHint: '每周总览。点击日期，在下方查看完整活动列表。',
};
export default function getCopy(language) { return String(language).startsWith('zh') ? zh : en; }
export function dateLabel(date, language, options) { return date.toLocaleDateString(String(language).startsWith('zh') ? 'zh-CN' : 'en-US', options); }
