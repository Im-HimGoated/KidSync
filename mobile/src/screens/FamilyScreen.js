import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Bell, CalendarDays, Check, ChevronRight, Inbox, Link2, MailPlus, MessageCircle, RefreshCw, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react-native';
import sharing from '../../../shared/backend/mobile-sharing';
import coordination from '../../../shared/backend/mobile-coordination';
import calendarTools from '../lib/calendar';
import homeModel from '../home/model';
import { Button, ChoiceRow, colors, Field, IconButton, Sheet, u } from '../calendar/ui';

export const familyCopy = {
  en: {
    title: 'Family', people: 'People', inbox: 'Inbox', pickups: 'Pickups', refresh: 'Refresh family access',
    calendar: 'Calendar', owner: 'Owner', you: 'You', members: 'Calendar access', membersBody: 'Invite trusted adults and choose exactly what they can do.',
    invite: 'Invite someone', email: 'Email address', note: 'Optional note', noteHint: 'For example, School pickups and practice updates',
    role: 'Permission', viewer: 'Viewer', commenter: 'Commenter', editor: 'Editor', pending: 'Pending', active: 'Active', declined: 'Declined', banned: 'Blocked',
    viewerHint: 'Can view the calendar', commenterHint: 'Can view and comment', editorHint: 'Can edit when using a supported editor',
    sendInvite: 'Create invitation', inviteCreated: 'Invitation created', inviteHonesty: 'KidsSync adds it to their Inbox. It does not send an email automatically.',
    shareLink: 'Share invitation link', shared: 'Share sheet opened', shareFailed: 'Could not open the share sheet. The invitation is still in their KidsSync Inbox.',
    noMembers: 'No one else has access yet.', memberDetails: 'Access details', saveRole: 'Save permission', remove: 'Remove access', removeConfirm: 'Remove this person from the calendar?', keep: 'Keep access',
    incoming: 'Calendar invitations', incomingBody: 'Accept an invitation before its calendar or pickup requests appear.', noInvites: 'No calendar invitations right now.',
    accept: 'Accept', decline: 'Decline', openShared: 'Open shared calendar', from: 'From', invitationNote: 'Note',
    sharedCalendar: 'Shared calendar', readOnly: 'Viewer access is read-only.', canComment: 'You can view and comment on this calendar.', editorActive: 'Editor access is active. Shared event editing is currently available on the web calendar while the native editor adapter is completed.',
    upcoming: 'Upcoming plans', noUpcoming: 'No upcoming plans in this shared calendar.', comments: 'Calendar comments', comment: 'Write a comment', commentHint: 'Keep the whole family updated', sendComment: 'Post comment', noComments: 'No comments yet.', commentsUnavailable: 'Comments could not be loaded. Refresh and try again.',
    handoff: 'Family Handoff Center', handoffBody: 'Ask an accepted calendar member to confirm a pickup.', noPickupEvents: 'No upcoming activities need a handoff.',
    assign: 'Assign pickup', assignTo: 'Responsible adult', request: 'Request confirmation', awaiting: 'Awaiting confirmation', accepted: 'Accepted', pickupDeclined: 'Declined', cancelled: 'Cancelled', unassigned: 'Not assigned',
    yourRequests: 'Your pickup requests', noRequests: 'No pickup requests need your response.', pickupAccept: 'I can do it', pickupDecline: 'I cannot',
    pickupUnavailable: 'Shared pickup coordination is unavailable. The family-coordination database migration may still need to be applied.',
    loadFailed: 'Family access could not be fully loaded. Check your connection and refresh.', saveFailed: 'That change was not confirmed. Refresh and try again.',
    close: 'Close', saving: 'Saving…', web: 'Open web calendar', family: 'Family', allDay: 'All day', notAvailable: 'Unavailable',
  },
  zh: {
    title: '家庭', people: '成员', inbox: '收件箱', pickups: '接送', refresh: '刷新家庭权限', calendar: '日历', owner: '所有者', you: '你',
    members: '日历权限', membersBody: '邀请信任的成人，并明确选择他们可以做什么。', invite: '邀请成员', email: '邮箱地址', note: '备注（选填）', noteHint: '例如：负责学校接送和训练更新',
    role: '权限', viewer: '查看者', commenter: '评论者', editor: '编辑者', pending: '待接受', active: '已加入', declined: '已拒绝', banned: '已屏蔽',
    viewerHint: '可以查看日历', commenterHint: '可以查看和评论', editorHint: '可在支持的编辑器中修改', sendInvite: '创建邀请', inviteCreated: '邀请已创建', inviteHonesty: '邀请会显示在对方的 KidsSync 收件箱中，不会自动发送电子邮件。',
    shareLink: '共享邀请链接', shared: '已打开共享菜单', shareFailed: '无法打开共享菜单。邀请仍会显示在对方的 KidsSync 收件箱中。', noMembers: '尚未与其他人共享。', memberDetails: '权限详情', saveRole: '保存权限', remove: '移除权限', removeConfirm: '从日历中移除此成员？', keep: '保留权限',
    incoming: '日历邀请', incomingBody: '接受邀请后才能查看日历和接送请求。', noInvites: '目前没有日历邀请。', accept: '接受', decline: '拒绝', openShared: '打开共享日历', from: '来自', invitationNote: '备注',
    sharedCalendar: '共享日历', readOnly: '查看者权限为只读。', canComment: '你可以查看并评论此日历。', editorActive: '编辑者权限已生效。原生编辑适配完成前，请在网页日历中修改共享日程。', upcoming: '即将开始', noUpcoming: '此共享日历暂无即将开始的安排。', comments: '日历评论', comment: '写评论', commentHint: '让全家了解最新情况', sendComment: '发布评论', noComments: '暂无评论。', commentsUnavailable: '无法加载评论，请刷新重试。',
    handoff: '家庭交接中心', handoffBody: '请已接受邀请的日历成员确认接送。', noPickupEvents: '近期没有需要交接的活动。', assign: '安排接送', assignTo: '负责人', request: '请求确认', awaiting: '等待确认', accepted: '已接受', pickupDeclined: '已拒绝', cancelled: '已取消', unassigned: '未安排', yourRequests: '你的接送请求', noRequests: '目前没有需要回复的接送请求。', pickupAccept: '我可以', pickupDecline: '我无法接送', pickupUnavailable: '共享接送暂不可用，可能仍需应用 family-coordination 数据库迁移。',
    loadFailed: '无法完整加载家庭权限，请检查网络后刷新。', saveFailed: '服务器未确认此更改，请刷新重试。', close: '关闭', saving: '保存中…', web: '打开网页日历', family: '全家', allDay: '全天', notAvailable: '不可用',
  },
};

const roleOptions = (t) => [
  { value: 'viewer', label: t.viewer }, { value: 'commenter', label: t.commenter }, { value: 'editor', label: t.editor },
];
const statusLabel = (status, t) => ({ pending: t.pending, active: t.active, declined: t.declined, banned: t.banned,
  accepted: t.accepted, cancelled: t.cancelled }[status] || t.notAvailable);
const safeArray = value => Array.isArray(value) ? value : [];
const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const dateLabel = (value, language) => {
  const date = calendarTools.parseDateKey(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : value;
};
const timeLabel = (event, language, t) => event.allDay ? t.allDay : calendarTools.formatTime(event.start, language) || t.allDay;

function Badge({ children, tone = 'neutral' }) {
  return <View style={[s.badge, tone === 'good' && s.badgeGood, tone === 'warn' && s.badgeWarn]}><Text style={[s.badgeText, tone === 'good' && s.badgeGoodText, tone === 'warn' && s.badgeWarnText]}>{children}</Text></View>;
}

function SectionHeading({ icon: Icon, title, body, action }) {
  return <View style={s.sectionHeading}><View style={s.sectionIcon}><Icon size={19} color={colors.green} /></View><View style={s.flex}><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text>{!!body && <Text style={s.body}>{body}</Text>}</View>{action}</View>;
}

function EventLine({ event, occurrenceDate, language, t, trailing, onPress }) {
  const content = <><View style={s.eventIcon}><Text style={s.eventEmoji}>{event.icon || '📅'}</Text></View><View style={s.flex}><Text numberOfLines={1} style={s.rowTitle}>{event.title || t.calendar}</Text><Text numberOfLines={1} style={s.body}>{dateLabel(occurrenceDate, language)} · {timeLabel(event, language, t)}</Text></View>{trailing}{onPress && <ChevronRight size={18} color={colors.muted} />}</>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.eventLine, pressed && s.pressed]}>{content}</Pressable> : <View style={s.eventLine}>{content}</View>;
}

export default function FamilyScreen({ language = 'en', client, user, calendars = [], calendar, onSelectCalendar, onOpenWebsite, onPendingCount }) {
  const t = familyCopy[String(language).startsWith('zh') ? 'zh' : 'en'];
  const [tab, setTab] = useState('people'), [members, setMembers] = useState([]), [invitations, setInvitations] = useState([]);
  const [ownerPickups, setOwnerPickups] = useState([]), [sharedContexts, setSharedContexts] = useState([]);
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [busy, setBusy] = useState('');
  const [error, setError] = useState(''), [pickupError, setPickupError] = useState(''), [notice, setNotice] = useState('');
  const [sheet, setSheet] = useState(null), [sheetError, setSheetError] = useState(''), [removeConfirm, setRemoveConfirm] = useState(false);
  const [invite, setInvite] = useState({ email: '', role: 'viewer', note: '' }), [createdInvite, setCreatedInvite] = useState(null);
  const [memberRole, setMemberRole] = useState('viewer'), [assignee, setAssignee] = useState('');
  const [comments, setComments] = useState([]), [comment, setComment] = useState(''), [commentsError, setCommentsError] = useState(false);
  const request = useRef(0), mounted = useRef(true);
  const account = { id: user?.id || '', email: user?.email || '' };
  const today = calendarTools.dateKey(new Date()), rangeEnd = calendarTools.dateKey(calendarTools.addDays(new Date(), 30));
  const ownerCalendar = calendar ? { ...calendar, ownerId: user?.id } : null;
  const ownerEvents = safeArray(calendar?.data?.activities);
  const upcoming = useMemo(() => homeModel.upcomingOccurrences(ownerEvents, calendarTools.parseDateKey(today), 14)
    .filter(item => item.event.status !== 'cancelled' && !item.event.isBuiltInHoliday), [calendar?.id, calendar?.data, today]);
  const pickupMembers = useMemo(() => [{ email: account.email, label: `${account.email} · ${t.you}` }, ...members
    .filter(member => member.status === 'active').map(member => ({ email: member.member_email, label: member.member_email }))]
    .filter((item, index, all) => item.email && all.findIndex(other => sameEmail(other.email, item.email)) === index), [members, account.email, t.you]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current += 1; }; }, []);

  async function load({ pull = false } = {}) {
    const ticket = ++request.current, scope = `${account.id}:${calendar?.id || ''}`;
    if (pull) setRefreshing(true); else setLoading(true);
    setError(''); setPickupError('');
    const memberRequest = ownerCalendar ? sharing.listCalendarMembers(client, account, ownerCalendar.id) : Promise.resolve([]);
    const ownerPickupRequest = ownerCalendar ? coordination.listCalendarPickups(client, account, ownerCalendar, { startDate: today, endDate: rangeEnd }) : Promise.resolve([]);
    const [memberResult, invitationResult, pickupResult] = await Promise.allSettled([
      memberRequest, sharing.listCalendarInvitations(client, account), ownerPickupRequest,
    ]);
    if (!mounted.current || ticket !== request.current || scope !== `${account.id}:${calendar?.id || ''}`) return;
    const nextMembers = memberResult.status === 'fulfilled' ? memberResult.value : [];
    const nextInvitations = invitationResult.status === 'fulfilled' ? invitationResult.value : [];
    const nextOwnerPickups = pickupResult.status === 'fulfilled' ? pickupResult.value : [];
    setMembers(nextMembers); setInvitations(nextInvitations); setOwnerPickups(nextOwnerPickups);
    if (memberResult.status === 'rejected' || invitationResult.status === 'rejected') setError(t.loadFailed);
    if (pickupResult.status === 'rejected') setPickupError(t.pickupUnavailable);
    const active = nextInvitations.filter(item => item.status === 'active').slice(0, 12);
    const contextResults = await Promise.allSettled(active.map(async invitation => {
      const sharedCalendar = await sharing.readMemberCalendar(client, account, invitation.id);
      let pickups = [], pickupUnavailable = false;
      try { pickups = await coordination.listCalendarPickups(client, account, sharedCalendar, { startDate: today, endDate: rangeEnd }); }
      catch { pickupUnavailable = true; }
      return { invitation, calendar: sharedCalendar, pickups, pickupUnavailable };
    }));
    if (!mounted.current || ticket !== request.current || scope !== `${account.id}:${calendar?.id || ''}`) return;
    const contexts = contextResults.filter(item => item.status === 'fulfilled').map(item => item.value);
    setSharedContexts(contexts);
    const incomingPickupCount = [...nextOwnerPickups, ...contexts.flatMap(item => item.pickups)]
      .filter(item => item.status === 'pending' && sameEmail(item.assignee_email, account.email)).length;
    onPendingCount?.(nextInvitations.filter(item => item.status === 'pending').length + incomingPickupCount);
    setLoading(false); setRefreshing(false);
  }

  useEffect(() => { if (account.id && account.email) load(); }, [account.id, account.email, calendar?.id]);

  async function run(key, work, success) {
    if (busy) return;
    setBusy(key); setSheetError(''); setNotice('');
    try { const result = await work(); if (!mounted.current) return; await success?.(result); return result; }
    catch { if (mounted.current) setSheetError(t.saveFailed); return null; }
    finally { if (mounted.current) setBusy(''); }
  }

  async function createInvitation() {
    await run('invite', () => sharing.inviteCalendarMember(client, account, ownerCalendar, invite), async saved => {
      setCreatedInvite(saved); setNotice(t.inviteCreated); await load();
    });
  }

  async function shareInvitation() {
    if (!createdInvite) return;
    try {
      const url = sharing.buildInvitationUrl('https://kid-sync-delta.vercel.app/', createdInvite);
      await Share.share({ title: `${createdInvite.calendar_name} · KidsSync`, message: `${createdInvite.calendar_name} · KidsSync\n${url}`, url });
      setNotice(t.shared);
    } catch { setNotice(t.shareFailed); }
  }

  async function respondInvitation(invitation, status) {
    await run(`invite-${invitation.id}`, () => sharing.respondCalendarInvitation(client, account, invitation.id, status), async () => { setSheet(null); await load(); });
  }

  async function saveMember() {
    await run(`member-${sheet.member.id}`, () => sharing.changeCalendarMemberRole(client, account, ownerCalendar.id, sheet.member.id, memberRole), async () => { setSheet(null); await load(); });
  }

  async function removeMember() {
    await run(`member-${sheet.member.id}`, () => sharing.revokeCalendarMember(client, account, ownerCalendar.id, sheet.member.id), async () => { setSheet(null); setRemoveConfirm(false); await load(); });
  }

  async function assignPickup() {
    if (!sheet?.occurrence) return;
    await run(`pickup-${sheet.occurrence.key}`, () => coordination.assignCalendarPickup(client, account, ownerCalendar, {
      eventId: String(sheet.occurrence.event.id), date: sheet.occurrence.dateKey, email: assignee,
    }), async () => { setSheet(null); await load(); });
  }

  async function answerPickup(pickup, status) {
    await run(`pickup-${pickup.id}`, () => coordination.respondCalendarPickup(client, account, pickup, status), async () => { setSheet(null); await load(); });
  }

  async function openShared(invitation) {
    const context = sharedContexts.find(item => item.invitation.id === invitation.id);
    if (!context) { setSheetError(t.loadFailed); return; }
    setComments([]); setComment(''); setCommentsError(false); setSheet({ type: 'shared', context });
    try {
      const loadedComments = await sharing.listCalendarComments(client, account, context.calendar);
      if (mounted.current) setComments(loadedComments);
    } catch { if (mounted.current) setCommentsError(true); }
  }

  async function postComment() {
    const context = sheet?.context;
    if (!context) return;
    await run(`comment-${context.invitation.id}`, () => sharing.addCalendarComment(client, account, context.calendar, { body: comment }), saved => {
      setComments(items => [...items, saved]); setComment('');
    });
  }

  const incomingPickups = [...ownerPickups.map(pickup => ({ pickup, calendar: ownerCalendar, events: ownerEvents })),
    ...sharedContexts.flatMap(context => context.pickups.map(pickup => ({ pickup, calendar: context.calendar, events: context.calendar.data.activities })))]
    .filter(item => item.pickup.status === 'pending' && sameEmail(item.pickup.assignee_email, account.email));
  const pickupFor = occurrence => ownerPickups.find(item => String(item.event_id) === String(occurrence.event.id) && item.occurrence_date === occurrence.dateKey && item.status !== 'cancelled');

  return <View style={s.page}>
    <View style={s.header}><View style={s.flex}><Text accessibilityRole="header" style={s.title}>{t.title}</Text><Text style={s.body}>{calendar?.name || t.calendar}</Text></View><IconButton icon={RefreshCw} label={t.refresh} onPress={() => load({ pull: true })} disabled={refreshing || !!busy} /></View>
    {calendars.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.calendars}>{calendars.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === calendar?.id }} onPress={() => onSelectCalendar?.(item.id)} style={[s.calendarChip, item.id === calendar?.id && s.calendarSelected]}><Text numberOfLines={1} style={[s.calendarText, item.id === calendar?.id && s.calendarTextSelected]}>{item.name}</Text></Pressable>)}</ScrollView>}
    <View accessibilityRole="tablist" style={s.tabs}>{[
      ['people', t.people, UsersRound], ['inbox', t.inbox, Inbox], ['pickups', t.pickups, Bell],
    ].map(([value, label, Icon]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[s.tab, tab === value && s.tabSelected]}><Icon size={17} color={tab === value ? colors.white : colors.muted} /><Text style={[s.tabText, tab === value && s.tabTextSelected]}>{label}</Text></Pressable>)}</View>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.blue} />}>
      {!!error && <Text accessibilityRole="alert" style={u.error}>{error}</Text>}
      {!!notice && <Text accessibilityRole="status" style={s.notice}>{notice}</Text>}
      {loading ? <ActivityIndicator color={colors.blue} style={s.loader} /> : tab === 'people' ? <>
        <SectionHeading icon={ShieldCheck} title={t.members} body={t.membersBody} action={ownerCalendar && <IconButton icon={MailPlus} label={t.invite} onPress={() => { setInvite({ email: '', role: 'viewer', note: '' }); setCreatedInvite(null); setSheetError(''); setNotice(''); setSheet({ type: 'invite' }); }} />} />
        <View style={s.personRow}><View style={s.avatar}><UserRound size={19} color={colors.green} /></View><View style={s.flex}><Text style={s.rowTitle}>{account.email}</Text><Text style={s.body}>{t.you}</Text></View><Badge tone="good">{t.owner}</Badge></View>
        {members.length ? members.map(member => <Pressable key={member.id} accessibilityRole="button" onPress={() => { setMemberRole(member.role); setRemoveConfirm(false); setSheetError(''); setSheet({ type: 'member', member }); }} style={({ pressed }) => [s.personRow, pressed && s.pressed]}><View style={s.avatar}><UserRound size={19} color={colors.blue} /></View><View style={s.flex}><Text numberOfLines={1} style={s.rowTitle}>{member.member_email}</Text><Text style={s.body}>{statusLabel(member.status, t)}</Text></View><Badge tone={member.status === 'active' ? 'good' : 'warn'}>{t[member.role] || member.role}</Badge><ChevronRight size={18} color={colors.muted} /></Pressable>) : <Text style={s.empty}>{t.noMembers}</Text>}
        <Button secondary icon={MailPlus} onPress={() => { setInvite({ email: '', role: 'viewer', note: '' }); setCreatedInvite(null); setSheetError(''); setNotice(''); setSheet({ type: 'invite' }); }} disabled={!ownerCalendar}>{t.invite}</Button>
      </> : tab === 'inbox' ? <>
        <SectionHeading icon={Bell} title={t.yourRequests} body={t.noRequests} />
        {incomingPickups.length ? incomingPickups.map(({ pickup, calendar: pickupCalendar, events }) => {
          const event = safeArray(events).find(item => String(item.id) === String(pickup.event_id));
          return <View key={pickup.id} style={s.request}><Text style={s.rowTitle}>{event?.title || pickupCalendar?.name || t.pickups}</Text><Text style={s.body}>{dateLabel(pickup.occurrence_date, language)} · {pickupCalendar?.name}</Text><View style={s.actions}><Button secondary disabled={!!busy} onPress={() => answerPickup(pickup, 'declined')}>{t.pickupDecline}</Button><Button disabled={!!busy} onPress={() => answerPickup(pickup, 'accepted')}>{t.pickupAccept}</Button></View></View>;
        }) : <Text style={s.empty}>{t.noRequests}</Text>}
        <SectionHeading icon={Inbox} title={t.incoming} body={t.incomingBody} />
        {invitations.length ? invitations.map(invitation => <View key={invitation.id} style={s.invitation}><View style={s.rowTop}><View style={s.flex}><Text style={s.rowTitle}>{invitation.calendar_name}</Text><Text style={s.body}>{t.from}: {invitation.owner_email}</Text></View><Badge tone={invitation.status === 'active' ? 'good' : 'warn'}>{t[invitation.role] || invitation.role}</Badge></View>{!!invitation.invitation_note && <Text style={s.note}>{t.invitationNote}: {invitation.invitation_note}</Text>}{invitation.status === 'pending' ? <View style={s.actions}><Button secondary disabled={!!busy} onPress={() => respondInvitation(invitation, 'declined')}>{t.decline}</Button><Button disabled={!!busy} onPress={() => respondInvitation(invitation, 'active')}>{t.accept}</Button></View> : <Button secondary icon={CalendarDays} onPress={() => openShared(invitation)}>{t.openShared}</Button>}</View>) : <Text style={s.empty}>{t.noInvites}</Text>}
      </> : <>
        <SectionHeading icon={UsersRound} title={t.handoff} body={t.handoffBody} />
        {!!pickupError && <Text accessibilityRole="alert" style={u.error}>{pickupError}</Text>}
        {upcoming.length ? upcoming.map(occurrence => {
          const pickup = pickupFor(occurrence), mine = pickup && sameEmail(pickup.assignee_email, account.email);
          const trailing = pickup ? <Badge tone={pickup.status === 'accepted' ? 'good' : 'warn'}>{statusLabel(pickup.status, t)}</Badge> : <Badge>{t.unassigned}</Badge>;
          return <View key={occurrence.key}><EventLine event={occurrence.event} occurrenceDate={occurrence.dateKey} language={language} t={t} trailing={trailing} onPress={() => { setAssignee(pickup?.assignee_email || pickupMembers[0]?.email || ''); setSheetError(''); setSheet({ type: 'pickup', occurrence, pickup }); }} />{mine && pickup.status === 'pending' && <View style={s.inlineActions}><Pressable accessibilityRole="button" onPress={() => answerPickup(pickup, 'declined')} style={s.textButton}><Text style={s.textButtonLabel}>{t.pickupDecline}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => answerPickup(pickup, 'accepted')} style={s.textButton}><Text style={s.textButtonLabel}>{t.pickupAccept}</Text></Pressable></View>}</View>;
        }) : <Text style={s.empty}>{t.noPickupEvents}</Text>}
      </>}
    </ScrollView>

    {!!sheet && <Sheet title={sheet.type === 'invite' ? t.invite : sheet.type === 'member' ? t.memberDetails : sheet.type === 'pickup' ? t.assign : t.sharedCalendar} closeLabel={t.close} busy={!!busy} onClose={() => { setSheet(null); setSheetError(''); setRemoveConfirm(false); }}>
      {sheet.type === 'invite' && <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
        <Field label={t.email} value={invite.email} onChangeText={value => setInvite(values => ({ ...values, email: value }))} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} editable={!busy && !createdInvite} />
        <Text style={u.label}>{t.role}</Text><ChoiceRow label={t.role} value={invite.role} disabled={!!busy || !!createdInvite} onChange={value => setInvite(values => ({ ...values, role: value }))} options={roleOptions(t)} />
        <Text style={s.roleHint}>{invite.role === 'viewer' ? t.viewerHint : invite.role === 'commenter' ? t.commenterHint : t.editorHint}</Text>
        <Field label={t.note} value={invite.note} onChangeText={value => setInvite(values => ({ ...values, note: value }))} placeholder={t.noteHint} multiline maxLength={500} editable={!busy && !createdInvite} />
        <Text style={s.honesty}>{t.inviteHonesty}</Text>{!!sheetError && <Text accessibilityRole="alert" style={u.error}>{sheetError}</Text>}
        {!createdInvite ? <Button icon={MailPlus} disabled={!!busy || !invite.email.trim()} onPress={createInvitation}>{busy ? t.saving : t.sendInvite}</Button> : <><View style={s.success}><Check size={20} color={colors.green} /><Text style={s.successText}>{t.inviteCreated}</Text></View><Button icon={Link2} onPress={shareInvitation}>{t.shareLink}</Button></>}
      </ScrollView>}
      {sheet.type === 'member' && <View style={s.sheetContent}><Text style={s.rowTitle}>{sheet.member.member_email}</Text><Text style={u.label}>{t.role}</Text><ChoiceRow label={t.role} value={memberRole} disabled={!!busy} onChange={setMemberRole} options={roleOptions(t)} /><Text style={s.roleHint}>{memberRole === 'viewer' ? t.viewerHint : memberRole === 'commenter' ? t.commenterHint : t.editorHint}</Text>{!!sheetError && <Text accessibilityRole="alert" style={u.error}>{sheetError}</Text>}<Button disabled={!!busy || memberRole === sheet.member.role} onPress={saveMember}>{busy ? t.saving : t.saveRole}</Button>{removeConfirm ? <View style={s.confirm}><Text style={s.rowTitle}>{t.removeConfirm}</Text><View style={s.actions}><Button secondary disabled={!!busy} onPress={() => setRemoveConfirm(false)}>{t.keep}</Button><Button danger disabled={!!busy} onPress={removeMember}>{t.remove}</Button></View></View> : <Button danger secondary icon={X} disabled={!!busy} onPress={() => setRemoveConfirm(true)}>{t.remove}</Button>}</View>}
      {sheet.type === 'pickup' && <View style={s.sheetContent}><EventLine event={sheet.occurrence.event} occurrenceDate={sheet.occurrence.dateKey} language={language} t={t} />
        <Text style={u.label}>{t.assignTo}</Text><View style={s.assignees}>{pickupMembers.map(person => <Pressable key={person.email} accessibilityRole="radio" accessibilityState={{ checked: sameEmail(person.email, assignee) }} onPress={() => setAssignee(person.email)} style={[s.assignee, sameEmail(person.email, assignee) && s.assigneeSelected]}><View style={s.flex}><Text numberOfLines={1} style={s.rowTitle}>{person.label}</Text></View>{sameEmail(person.email, assignee) && <Check size={19} color={colors.green} />}</Pressable>)}</View>{!!sheetError && <Text accessibilityRole="alert" style={u.error}>{sheetError}</Text>}<Button disabled={!!busy || !assignee} onPress={assignPickup}>{busy ? t.saving : t.request}</Button></View>}
      {sheet.type === 'shared' && <SharedCalendarContent language={language} t={t} context={sheet.context} comments={comments} commentsError={commentsError} comment={comment} setComment={setComment} busy={!!busy} error={sheetError} onPost={postComment} onWebsite={onOpenWebsite} onPickup={answerPickup} account={account} />}
    </Sheet>}
  </View>;
}

function SharedCalendarContent({ language, t, context, comments, commentsError, comment, setComment, busy, error, onPost, onWebsite, onPickup, account }) {
  const today = calendarTools.parseDateKey(calendarTools.dateKey(new Date()));
  const occurrences = homeModel.upcomingOccurrences(context.calendar.data.activities, today, 30).filter(item => item.event.status !== 'cancelled').slice(0, 20);
  const canComment = ['commenter', 'editor'].includes(context.invitation.role);
  const capability = context.invitation.role === 'viewer' ? t.readOnly : context.invitation.role === 'commenter' ? t.canComment : t.editorActive;
  const myPickups = context.pickups.filter(item => item.status === 'pending' && sameEmail(item.assignee_email, account.email));
  return <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
    <View style={s.rowTop}><View style={s.flex}><Text style={s.sharedTitle}>{context.calendar.name}</Text><Text style={s.body}>{t.from}: {context.calendar.ownerEmail}</Text></View><Badge tone="good">{t[context.invitation.role]}</Badge></View>
    <Text style={s.capability}>{capability}</Text>{context.invitation.role === 'editor' && <Button secondary onPress={onWebsite}>{t.web}</Button>}
    {myPickups.length > 0 && <><Text style={s.sheetHeading}>{t.yourRequests}</Text>{myPickups.map(pickup => { const event = context.calendar.data.activities.find(item => String(item.id) === String(pickup.event_id)); return <View key={pickup.id} style={s.request}><Text style={s.rowTitle}>{event?.title || t.pickups}</Text><Text style={s.body}>{dateLabel(pickup.occurrence_date, language)}</Text><View style={s.actions}><Button secondary disabled={busy} onPress={() => onPickup(pickup, 'declined')}>{t.pickupDecline}</Button><Button disabled={busy} onPress={() => onPickup(pickup, 'accepted')}>{t.pickupAccept}</Button></View></View>; })}</>}
    <Text style={s.sheetHeading}>{t.upcoming}</Text>{occurrences.length ? occurrences.map(item => <EventLine key={item.key} event={item.event} occurrenceDate={item.dateKey} language={language} t={t} />) : <Text style={s.empty}>{t.noUpcoming}</Text>}
    <Text style={s.sheetHeading}>{t.comments}</Text>{commentsError ? <Text style={u.error}>{t.commentsUnavailable}</Text> : comments.length ? comments.map(item => <View key={item.id} style={s.comment}><Text style={s.rowTitle}>{item.author_email}</Text><Text style={s.commentBody}>{item.body}</Text></View>) : <Text style={s.empty}>{t.noComments}</Text>}
    {canComment && <><Field label={t.comment} value={comment} onChangeText={setComment} placeholder={t.commentHint} multiline maxLength={1000} editable={!busy} />{!!error && <Text accessibilityRole="alert" style={u.error}>{error}</Text>}<Button icon={MessageCircle} disabled={busy || !comment.trim()} onPress={onPost}>{busy ? t.saving : t.sendComment}</Button></>}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page }, flex: { flex: 1, minWidth: 0 }, pressed: { opacity: 0.55 },
  header: { minHeight: 62, paddingHorizontal: 17, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line }, title: { color: colors.ink, fontSize: 22, fontWeight: '700' }, body: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  calendars: { paddingHorizontal: 16, paddingVertical: 9, gap: 8 }, calendarChip: { minHeight: 40, maxWidth: 180, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.white }, calendarSelected: { borderColor: colors.blue, backgroundColor: colors.blueSoft }, calendarText: { color: colors.ink, fontSize: 13, fontWeight: '600' }, calendarTextSelected: { color: colors.blue },
  tabs: { marginHorizontal: 16, marginVertical: 9, minHeight: 45, flexDirection: 'row', backgroundColor: '#E9EFEC', borderRadius: 8, padding: 3, gap: 3 }, tab: { flex: 1, minHeight: 39, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, tabSelected: { backgroundColor: colors.green }, tabText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, tabTextSelected: { color: colors.white },
  scroll: { flex: 1 }, content: { padding: 17, paddingBottom: 32, gap: 12 }, loader: { margin: 30 }, notice: { color: colors.green, backgroundColor: colors.primarySoft, borderRadius: 8, padding: 11, fontSize: 12, lineHeight: 18 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 6, marginBottom: 3 }, sectionIcon: { width: 35, height: 35, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  personRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 11 }, avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, rowTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700' }, rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  badge: { minHeight: 24, maxWidth: 100, borderRadius: 8, backgroundColor: '#EDF1F2', paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: colors.muted, fontSize: 10, fontWeight: '700' }, badgeGood: { backgroundColor: colors.primarySoft }, badgeGoodText: { color: colors.green }, badgeWarn: { backgroundColor: '#FBF1DF' }, badgeWarnText: { color: '#805615' },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingVertical: 16, textAlign: 'center' }, invitation: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 14, gap: 10 }, note: { color: colors.ink, fontSize: 12, lineHeight: 19, backgroundColor: colors.white, padding: 10, borderRadius: 8 }, actions: { flexDirection: 'row', gap: 8, alignItems: 'center' }, request: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, gap: 9, backgroundColor: colors.white },
  eventLine: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 }, eventIcon: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, eventEmoji: { fontSize: 17 }, inlineActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingBottom: 8 }, textButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 }, textButtonLabel: { color: colors.blue, fontSize: 12, fontWeight: '700' },
  sheetContent: { paddingHorizontal: 19, paddingTop: 6, paddingBottom: 30, gap: 14 }, roleHint: { color: colors.muted, fontSize: 12, lineHeight: 18 }, honesty: { color: colors.muted, fontSize: 12, lineHeight: 19, borderLeftWidth: 3, borderLeftColor: colors.green, paddingLeft: 10 }, success: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, borderRadius: 8, padding: 11 }, successText: { color: colors.green, fontSize: 13, fontWeight: '700' }, confirm: { gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  assignees: { borderTopWidth: 1, borderTopColor: colors.line }, assignee: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 8 }, assigneeSelected: { backgroundColor: colors.primarySoft }, sharedTitle: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '700' }, capability: { color: colors.muted, fontSize: 13, lineHeight: 21, backgroundColor: colors.primarySoft, borderRadius: 8, padding: 11 }, sheetHeading: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700', marginTop: 8 }, comment: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10, gap: 3 }, commentBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
