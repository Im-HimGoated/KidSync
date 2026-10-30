import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CloudCheck, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { Button, Sheet } from '../calendar/ui';
import { useAppearance, useThemeStyles } from './AppearanceContext';
import copy from '../lib/sync-copy';
import schedules from '../../../shared/backend/schedules';

function Version({ label, event, t }) {
  const s = useThemeStyles(createStyles);
  const text = value => ['string', 'number'].includes(typeof value) ? String(value) : '';
  const translated = (field, value) => ['child', 'importance', 'recurrence'].includes(field)
    && Object.prototype.hasOwnProperty.call(t.values, value) ? t.values[value] : text(value);
  return <View style={{ gap: 3 }}><Text style={s.status}>{label}</Text>
    <Text style={s.text}>{event ? [text(event.title), text(event.startDate), event.allDay ? t.allDay : `${text(event.start)}–${text(event.end)}`].filter(Boolean).join(' · ') : t.missing}</Text>
    {!!event && Object.keys(t.fields).map(field => text(event[field]) ? <Text key={field} style={s.text}>{t.fields[field]}: {translated(field, event[field])}</Text> : null)}
  </View>;
}

/** Small persistent owner-sync status; destructive queue discard is confirmed. */
export default function SyncStatus({ sync, language = 'en' }) {
  const { colors } = useAppearance();
  const s = useThemeStyles(createStyles);
  const t = copy[language] || copy.en;
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  if (!sync?.userId) return null;
  const status = sync.status, count = sync.pendingCount || 0;
  const warning = ['CONFLICT', 'AUTH_REQUIRED', 'STORAGE_ERROR', 'ERROR'].includes(status);
  const Icon = warning ? TriangleAlert : status === 'OFFLINE' ? CloudOff : status === 'SUBSCRIBED' ? CloudCheck : RefreshCw;
  async function run(action) {
    if (busy) return; setBusy(true); setFailed(false);
    try { await action(); setConfirm(false); } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  const close = () => { if (!busy) { setOpen(false); setConfirm(false); setFailed(false); } };
  return <>
    <View style={[s.bar, warning && s.warning]}>
      <Icon size={17} color={warning ? colors.red : colors.muted} />
      <View style={{ flex: 1 }}><Text accessibilityLiveRegion="polite" style={s.status}>{t[status] || t.ERROR}</Text>
        {count > 0 && <Text style={s.hint}>{t.pending(count)}</Text>}</View>
      {(count > 0 || warning) ? <Button secondary onPress={() => setOpen(true)} style={s.action}>{t.review}</Button>
        : ['OFFLINE', 'CACHED', 'ERROR'].includes(status) && <Button secondary onPress={() => run(sync.refresh)} disabled={busy} style={s.action}>{t.retry}</Button>}
    </View>
    {open && <Sheet title={t.review} closeLabel={t.close} onClose={close} busy={busy}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.text}>{status === 'CONFLICT' ? t.conflict : status === 'STORAGE_ERROR' ? t.storage : status === 'AUTH_REQUIRED' ? t.auth : count ? t.retained : t.cached}</Text>
        {(sync.pending || []).map(operation => {
          const latest = schedules.calendarEntries(sync.confirmedRow?.schedule).find(item => item.id === operation.calendarId)?.data?.activities?.find?.(item => item?.id === operation.eventId);
          return <View style={s.card} key={operation.id}>
          <Text style={s.status}>{operation.kind === 'delete' ? t.actionDelete : t.actionSave} · {operation.event?.title || operation.original?.title}</Text>
          <Version label={t.current} event={latest} t={t} />
          {operation.original && <Version label={t.original} event={operation.original} t={t} />}
          {operation.event && <Version label={t.device} event={operation.event} t={t} />}
        </View>; })}
        {failed && <Text accessibilityRole="alert" style={s.error}>{t.failed}</Text>}
        {confirm ? <View style={s.card}>
          <Text accessibilityRole="header" style={s.status}>{t.confirmTitle}</Text><Text style={s.text}>{t.confirmBody}</Text>
          <Button danger disabled={busy} onPress={() => run(sync.discardPending)}>{t.confirm}</Button>
          <Button secondary disabled={busy} onPress={() => setConfirm(false)}>{t.keep}</Button>
        </View> : <>
          <Button disabled={busy || status === 'SYNCING'} onPress={() => run(status === 'CONFLICT' ? sync.retry : sync.refresh)}>{t.retry}</Button>
          {count > 0 && <Button secondary danger disabled={busy || status === 'SYNCING'} onPress={() => setConfirm(true)}>{t.discard}</Button>}
        </>}
      </ScrollView>
    </Sheet>}
  </>;
}
const createStyles = colors => StyleSheet.create({
  bar: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 10, paddingVertical: 3, backgroundColor: colors.page, borderBottomWidth: 1, borderBottomColor: colors.line },
  warning: { backgroundColor: colors.redSoft }, status: { color: colors.ink, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17 }, action: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 5 },
  body: { padding: 18, gap: 14 }, text: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, gap: 10 }, error: { color: colors.red, fontSize: 14, lineHeight: 21 },
});
