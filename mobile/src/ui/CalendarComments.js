import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshCw, Send } from 'lucide-react-native';
import commentsService from '../family/calendar-comments';
import { Button, Field } from '../calendar/ui';
import { useAppearance, useThemeStyles } from './AppearanceContext';

export const calendarCommentsCopy = {
  en: {
    title: 'Calendar comments', action: 'Comments', sharedCalendar: 'Shared calendar', refresh: 'Refresh comments', loading: 'Loading comments…', empty: 'No comments yet.',
    scope: 'Comments for {name}', viewer: 'Viewer', commenter: 'Commenter', editor: 'Editor', owner: 'Owner',
    readOnly: 'You can read comments. Commenter or editor access is needed to post.',
    write: 'Your comment is shared with the people who can access this calendar.', stale: 'Refresh the calendar to confirm your access before posting.',
    loadFailed: 'Could not load comments. Check your connection and refresh.',
    postFailed: 'Could not confirm your comment. Your text is kept here. Refresh to check the conversation before retrying.',
    review: 'Refresh comments before retrying.', draft: 'Your unsent comment', comment: 'Write a comment', post: 'Post comment', posting: 'Posting…',
    length: 'Use 1,000 characters or fewer.', unknown: 'Calendar member', unavailable: 'Sign in with the account that opened this calendar.',
    discardTitle: 'Discard this comment?', discardBody: 'Your unsent comment will be lost.'
  },
  zh: {
    title: '日历评论', action: '评论', sharedCalendar: '共享日历', refresh: '刷新评论', loading: '正在加载评论…', empty: '暂无评论。',
    scope: '“{name}”的评论', viewer: '查看者', commenter: '评论者', editor: '编辑者', owner: '所有者',
    readOnly: '你可以查看评论，发表评论需要评论者或编辑者权限。',
    write: '有权访问此日历的成员可以看到你的评论。', stale: '请先刷新日历以确认权限，再发表评论。',
    loadFailed: '无法加载评论，请检查网络后刷新。',
    postFailed: '无法确认评论已发布。文字仍保留在此，请先刷新查看对话，再决定是否重试。',
    review: '重试前请先刷新评论。', draft: '尚未发送的评论', comment: '写评论', post: '发表评论', posting: '正在发布…',
    length: '请使用不超过 1,000 个字符。', unknown: '日历成员', unavailable: '请使用打开此日历的账户登录。',
    discardTitle: '放弃这条评论？', discardBody: '尚未发送的评论将丢失。'
  }
};

// Content only: CalendarScreen keeps its existing native Sheet mounted.
export default function CalendarComments({ client, account, calendar, role, stale, language = 'en', onDirtyChange, onBusyChange }) {
  const t = calendarCommentsCopy[String(language).startsWith('zh') ? 'zh' : 'en'];
  const { colors } = useAppearance(), s = useThemeStyles(createStyles);
  const scope = JSON.stringify([account?.id, account?.email, calendar?.ownerId || calendar?.owner_id, calendar?.id]);
  const current = useRef(scope), access = useRef({ role, stale });
  current.current = scope; access.current = { role, stale };
  const [state, setState] = useState(null), [draft, setDraft] = useState({ scope, body: '' });
  const body = draft.scope === scope ? draft.body : '';
  const controller = useMemo(() => {
    try { return commentsService.createCalendarComments({ client, account, calendar, getAccess: () => access.current,
      isCurrent: () => current.current === scope, onChange: setState }); }
    catch { return null; }
  }, [client, account?.id, account?.email, calendar?.id, calendar?.ownerId, calendar?.owner_id, scope]);
  const shown = state?.scope === controller?.scope ? state : controller?.getState();
  useEffect(() => {
    if (!controller) return undefined;
    void controller.load();
    const refresh = () => { if (!AppState.currentState || AppState.currentState === 'active') void controller.load({ silent: true }); };
    const listener = AppState.addEventListener('change', next => { if (next === 'active') refresh(); });
    const timer = setInterval(refresh, 5000);
    return () => { clearInterval(timer); listener.remove(); controller.dispose(); };
  }, [controller]);
  useEffect(() => { onBusyChange?.(!!shown?.posting); return () => { onBusyChange?.(false); }; }, [shown?.posting, onBusyChange]);
  const canPost = !!controller?.canPost(), tooLong = Array.from(body.trim()).length > 1000;
  async function submit() {
    if (!controller) return;
    const result = await controller.post(body);
    if (result.ok && current.current === scope) { setDraft({ scope, body: '' }); onDirtyChange?.(false); }
  }
  if (!controller) return <View style={s.content}><Text accessibilityRole="alert" style={s.error}>{t.unavailable}</Text></View>;
  return <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <View style={s.heading}><Text style={[s.scope, s.flex]}>{t.scope.replace('{name}', typeof calendar?.name === 'string' ? calendar.name : '')}</Text><Text style={s.role}>{t[role] || t.viewer}</Text></View>
    <Text style={s.body}>{stale ? t.stale : canPost ? t.write : t.readOnly}</Text>
    <Button secondary icon={RefreshCw} disabled={shown.loading || shown.posting} onPress={() => controller.load()}>{t.refresh}</Button>
    {shown.loading && <ActivityIndicator accessibilityLabel={t.loading} color={colors.primary} />}
    {shown.loadError && <Text accessibilityRole="alert" style={s.error}>{t.loadFailed}</Text>}
    {shown.loaded && !shown.loadError && !shown.comments.length && <Text style={s.body}>{t.empty}</Text>}
    {shown.comments.map(item => <View key={item.id} style={s.comment}>
      <Text style={s.author}>{typeof item.author_email === 'string' ? item.author_email : t.unknown}</Text>
      <Text selectable style={s.commentBody}>{item.body}</Text>
      {typeof item.created_at === 'string' && Number.isFinite(new Date(item.created_at).getTime()) && <Text style={s.date}>{new Date(item.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</Text>}
    </View>)}
    {(canPost || !!body) && <View>
      <Field label={canPost ? t.comment : t.draft} value={body} multiline editable={!shown.posting} onChangeText={value => { setDraft({ scope, body: value }); onDirtyChange?.(!!value.trim()); }} />
      {tooLong && <Text accessibilityRole="alert" style={s.error}>{t.length}</Text>}
      {shown.postError && <Text accessibilityRole="alert" style={s.error}>{t.postFailed}</Text>}
      {shown.needsReview && <Text style={s.body}>{t.review}</Text>}
      {canPost && <Button icon={Send} disabled={!body.trim() || tooLong || shown.posting || !shown.loaded || shown.needsReview} onPress={submit}>{shown.posting ? t.posting : t.post}</Button>}
    </View>}
  </ScrollView>;
}
function createStyles(c) { return StyleSheet.create({
  scroll: { flexShrink: 1, minHeight: 0 }, content: { padding: 20, paddingBottom: 28, gap: 16 },
  heading: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, flex: { flex: 1, minWidth: 0 },
  scope: { color: c.ink, fontSize: 15, lineHeight: 22, fontWeight: '600' }, role: { color: c.primary, backgroundColor: c.primarySoft, fontSize: 12, padding: 6, borderRadius: 7 },
  body: { color: c.muted, fontSize: 13, lineHeight: 21 }, error: { color: c.error, fontSize: 13, lineHeight: 21 },
  comment: { padding: 14, gap: 7, borderWidth: 1, borderColor: c.line, borderRadius: 12, backgroundColor: c.surface2 },
  author: { color: c.ink, fontSize: 12, lineHeight: 19, fontWeight: '600' }, commentBody: { color: c.ink, fontSize: 15, lineHeight: 23 }, date: { color: c.muted, fontSize: 11, lineHeight: 17 }
}); }
