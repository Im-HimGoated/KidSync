import React, { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, ChoiceRow, Field, useCalendarUi } from '../calendar/ui';

const avatars = ['🧒', '👧', '👦', '🧑‍🚀', '🧑‍🎨', '🧑‍🔬', '🦸', '🐼', '🦊', '🐯'];
const palettes = ['blue', 'green', 'coral', 'gold'];
const copy = {
  en: {
    name: 'Name', color: 'Color', avatar: 'Avatar', grade: 'Grade', school: 'School', profiles: 'Family profiles',
    add: 'Add a child', remove: 'Remove profile', done: 'Done',
    save: 'Save profiles', saving: 'Saving…', empty: 'No child profiles yet.',
    invalid: 'Enter a unique name for each child.', failed: 'Could not save. Check your connection and try again.',
    conflict: 'Profiles changed on another device. Close and reopen to see the latest changes.',
    removal: 'Activities assigned to a removed child will become family activities.',
    colors: ['Blue', 'Green', 'Coral', 'Gold'],
  },
  zh: {
    name: '姓名', color: '颜色', avatar: '头像', grade: '年级', school: '学校', profiles: '家庭资料',
    add: '添加孩子', remove: '移除资料', done: '完成',
    save: '保存资料', saving: '正在保存…', empty: '暂无孩子资料。',
    invalid: '请为每个孩子输入不同的姓名。', failed: '保存失败，请检查网络后重试。',
    conflict: '其他设备修改了资料。请关闭后重新打开以查看最新资料。',
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

export default function FamilyProfiles({ original, language, busy, onSave }) {
  const t = copy[language] || copy.en;
  const { u } = useCalendarUi();
  const baseline = useRef(original);
  const [profiles, setProfiles] = useState(() => original.map(normalize));
  const [index, setIndex] = useState(-1);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const profile = profiles[index];
  function change(key, value) {
    setError('');
    setProfiles(previous => previous.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }
  async function save() {
    if (saving.current || busy) return;
    const names = profiles.map(item => item.name.trim().toLowerCase());
    if (names.some(name => !name || name === 'all' || name === '__family__') || new Set(names).size !== names.length) {
      setError(t.invalid);
      return;
    }
    saving.current = true;
    setError('');
    try { await onSave({ original: baseline.current, profiles }); }
    catch (failure) { setError(failure?.code === 'CONFLICT' ? t.conflict : t.failed); }
    finally { saving.current = false; }
  }
  return <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
    {!!error && <Text accessibilityRole="alert" style={u.error}>{error}</Text>}
    {profile ? <>
      <Field label={t.name} value={profile.name} onChangeText={value => change('name', value)} maxLength={28} />
      <Text style={u.label}>{t.color}</Text>
      <ChoiceRow label={t.color} value={profile.palette} onChange={value => change('palette', value)}
        options={palettes.map((value, i) => ({ value, label: t.colors[i] }))} />
      <Text style={u.label}>{t.avatar}</Text>
      <ChoiceRow label={t.avatar} value={profile.avatar} onChange={value => change('avatar', value)}
        options={avatars.map(value => ({ value, label: value }))} />
      <Field label={t.grade} value={profile.grade} onChangeText={value => change('grade', value)} maxLength={30} />
      <Field label={t.school} value={profile.school} onChangeText={value => change('school', value)} maxLength={60} />
      <Button onPress={() => setIndex(-1)}>{t.done}</Button>
      <Button danger onPress={() => { setProfiles(items => items.filter((_, i) => i !== index)); setIndex(-1); }}>{t.remove}</Button>
    </> : <>
      {profiles.length ? profiles.map((item, i) => <Button key={item.id} secondary disabled={busy} onPress={() => setIndex(i)}>
        {`${item.avatar} ${item.name || t.name}`}
      </Button>) : <Text style={u.body}>{t.empty}</Text>}
      <Button secondary disabled={busy || profiles.length >= 50} onPress={() => {
        setIndex(profiles.length);
        setProfiles(items => [...items, normalize({ id: globalThis.crypto?.randomUUID?.() || `kid-${Date.now()}-${Math.random().toString(36).slice(2)}` }, items.length)]);
      }}>{t.add}</Button>
      {baseline.current.length > profiles.length && <Text style={u.body}>{t.removal}</Text>}
      <View><Button disabled={busy} onPress={save}>{busy ? t.saving : t.save}</Button></View>
    </>}
  </ScrollView>;
}
