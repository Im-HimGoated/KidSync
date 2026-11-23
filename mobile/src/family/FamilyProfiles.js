import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, ChoiceRow, Field, useCalendarUi } from '../calendar/ui';
import profileOptions from '../../../shared/family-profiles';

const avatars = profileOptions.AVATARS;
const palettes = profileOptions.PALETTES;
const copy = {
  en: {
    name: 'Name', color: 'Color', avatar: 'Avatar', grade: 'Grade', school: 'School', profiles: 'Family profiles',
    add: 'Add a child', remove: 'Remove profile', done: 'Done',
    save: 'Save profiles', saving: 'Saving…', empty: 'No child profiles yet.',
    invalid: 'Enter a unique name for each child.', failed: 'Could not save. Check your connection and try again.',
    conflict: 'Profiles changed on another device. Close and reopen to see the latest changes.',
    scope: 'This calendar is no longer selected. Reopen its profiles to continue.',
    removal: 'Activities assigned to a removed child will become family activities.',
    colors: ['Blue', 'Green', 'Coral', 'Gold'],
  },
  zh: {
    name: '姓名', color: '颜色', avatar: '头像', grade: '年级', school: '学校', profiles: '家庭资料',
    add: '添加孩子', remove: '移除资料', done: '完成',
    save: '保存资料', saving: '正在保存…', empty: '暂无孩子资料。',
    invalid: '请为每个孩子输入不同的姓名。', failed: '保存失败，请检查网络后重试。',
    conflict: '其他设备修改了资料。请关闭后重新打开以查看最新资料。',
    scope: '此日历已不再选中。请重新打开其资料后继续。',
    removal: '移除孩子后，分配给此孩子的活动会改为全家活动。',
    colors: ['蓝色', '绿色', '珊瑚色', '金色'],
  },
};

function normalize(profile, index) {
  const { id, name, palette, avatar, grade, school } = profile || {};
  return { ...profile, id: id ?? `profile-${index}-${Date.now()}`, name: typeof name === 'string' ? name : '',
    palette: palettes.includes(palette) ? palette : 'blue',
    avatar: typeof avatar === 'string' && avatar.length <= 16 ? avatar : avatars[0],
    grade: typeof grade === 'string' ? grade : '', school: typeof school === 'string' ? school : '' };
}

const editableValues = profiles => JSON.stringify(profiles.map(({ id, name, palette, avatar, grade, school }) => [id, name, palette, avatar, grade, school]));

export default function FamilyProfiles({ original, language, busy, onSave, onDirtyChange }) {
  const t = copy[language] || copy.en;
  const { u, palettes: familyPalettes } = useCalendarUi();
  const baseline = useRef(original);
  const [profiles, setProfiles] = useState(() => original.map(normalize));
  const clean = useRef(profiles);
  const [index, setIndex] = useState(-1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const saving = useRef(false), mounted = useRef(true);
  const dirty = editableValues(profiles) !== editableValues(clean.current);
  const blocked = !!busy || submitting;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const profile = profiles[index];
  function selectProfile(nextIndex) {
    if (busy || saving.current) return;
    setIndex(nextIndex);
  }
  function change(key, value) {
    if (busy || saving.current) return;
    setError('');
    setProfiles(previous => previous.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }
  function addProfile() {
    if (busy || saving.current || profiles.length >= 50) return;
    setError(''); setIndex(profiles.length);
    setProfiles(items => [...items, normalize({ id: globalThis.crypto?.randomUUID?.() || `kid-${Date.now()}-${Math.random().toString(36).slice(2)}` }, items.length)]);
  }
  function removeProfile() {
    if (busy || saving.current) return;
    setError(''); setProfiles(items => items.filter((_, i) => i !== index)); setIndex(-1);
  }
  async function save() {
    if (saving.current || busy) return;
    const names = profiles.map(item => item.name.trim().toLowerCase());
    if (names.some(name => !name || name === 'all' || name === '__family__') || new Set(names).size !== names.length) {
      setError(t.invalid);
      return;
    }
    saving.current = true;
    setSubmitting(true); setError('');
    const submission = profiles.map(item => ({ ...item, name: item.name.trim(), grade: item.grade.trim(), school: item.school.trim() }));
    try {
      const result = await onSave({ original: baseline.current, profiles: submission });
      if (result === false || result?.error) throw new Error('SAVE_FAILED');
      if (mounted.current) {
        baseline.current = submission; clean.current = submission; setProfiles(submission);
      }
    }
    catch (failure) { if (mounted.current) setError(failure?.code === 'CONFLICT' ? t.conflict : failure?.code === 'STALE_SCOPE' ? t.scope : t.failed); }
    finally { saving.current = false; if (mounted.current) setSubmitting(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
    {!!error && <Text accessibilityRole="alert" style={u.error}>{error}</Text>}
    {profile ? <>
      <Field label={t.name} value={profile.name} onChangeText={value => change('name', value)} maxLength={28} editable={!blocked} />
      <Text style={u.label}>{t.color}</Text>
      <ChoiceRow label={t.color} value={profile.palette} onChange={value => change('palette', value)} disabled={blocked}
        options={palettes.map((value, i) => ({ value, label: t.colors[i], color: familyPalettes[value]?.line }))} />
      <Text style={u.label}>{t.avatar}</Text>
      <ChoiceRow label={t.avatar} value={profile.avatar} onChange={value => change('avatar', value)} disabled={blocked}
        options={avatars.map(value => ({ value, label: value }))} />
      <Field label={t.grade} value={profile.grade} onChangeText={value => change('grade', value)} maxLength={30} editable={!blocked} />
      <Field label={t.school} value={profile.school} onChangeText={value => change('school', value)} maxLength={60} editable={!blocked} />
      <Button disabled={blocked} onPress={() => selectProfile(-1)}>{t.done}</Button>
      <Button danger disabled={blocked} onPress={removeProfile}>{t.remove}</Button>
    </> : <>
      {profiles.length ? profiles.map((item, i) => <Button key={item.id} secondary disabled={blocked} onPress={() => selectProfile(i)}>
        {`${item.avatar} ${item.name || t.name}`}
      </Button>) : <Text style={u.body}>{t.empty}</Text>}
      <Button secondary disabled={blocked || profiles.length >= 50} onPress={addProfile}>{t.add}</Button>
      {baseline.current.length > profiles.length && <Text style={u.body}>{t.removal}</Text>}
      <View><Button disabled={blocked} onPress={save}>{blocked ? t.saving : t.save}</Button></View>
    </>}
  </ScrollView>;
}
