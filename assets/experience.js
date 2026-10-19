(() => {
  'use strict';

  const copy = {
    en: {
      startKicker: 'Get started', startTitle: 'Build your family schedule',
      startBody: 'Personalize the children or add your first event. You can explore with example events at any time.',
      startEvent: 'Add first event', startChild: 'Set up children', startExample: 'Try example',
      menuPlan: 'Plan and review', menuView: 'View and display', menuHistory: 'History and help',
      sharePeople: 'People', shareComments: 'Comments', shareFiles: 'Export and import',
      shareAccessIntro: 'Create a secure link for one person, choose what they can do, and include a note.',
      shareCommentsHeading: 'Read and reply to feedback on this calendar.',
      shareFilesHeading: 'Download, print, or import a copy of your calendar.',
      shareFilesIntro: 'Make a copy of your schedule or import events from a file.',
      shareTabs: 'Share tools'
    },
    zh: {
      startKicker: '开始使用', startTitle: '创建家庭日程',
      startBody: '设置孩子信息或添加第一个活动，也可以随时用示例活动探索。',
      startEvent: '添加第一个活动', startChild: '设置孩子信息', startExample: '试用示例',
      menuPlan: '计划与回顾', menuView: '视图与显示', menuHistory: '历史与帮助',
      sharePeople: '共享成员', shareComments: '评论', shareFiles: '导出与导入',
      shareAccessIntro: '为一位成员创建安全链接，设置权限并附上留言。',
      shareCommentsHeading: '阅读并回复此日历的反馈。',
      shareFilesHeading: '下载、打印或导入日历副本。',
      shareFilesIntro: '保存日程副本，或从文件导入活动。',
      shareTabs: '共享工具'
    }
  };
  const language = () => document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
  const more = document.getElementById('moreActions');
  const groups = [...more.querySelectorAll('.more-actions-group')];
  const dialog = document.getElementById('shareDialog');
  const tabs = [...dialog.querySelectorAll('[data-share-tab]')];
  const access = document.getElementById('shareAccessPanel');
  const comments = document.getElementById('ownerCommentsPanel');
  const files = document.getElementById('shareFilesPanel');
  let canManageAccess = true;

  function localize() {
    const labels = copy[language()];
    document.querySelectorAll('[data-experience-text]').forEach(node => {
      node.textContent = labels[node.dataset.experienceText] || node.textContent;
    });
    groups.forEach(group => {
      const summary = group.querySelector('summary');
      summary.setAttribute('aria-label', labels[summary.dataset.experienceText]);
    });
    document.getElementById('shareTabs').setAttribute('aria-label', labels.shareTabs);
    if (dialog.open) selectShareTab(tabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.dataset.shareTab || 'files');
  }

  function selectShareTab(name, focus = false) {
    const selected = canManageAccess && ['access', 'comments'].includes(name) ? name : 'files';
    access.hidden = selected !== 'access';
    comments.hidden = selected !== 'comments';
    files.hidden = selected !== 'files';
    const introKey = { access: 'shareAccessIntro', comments: 'shareCommentsHeading', files: 'shareFilesHeading' }[selected];
    document.getElementById('shareDialogIntro').textContent = copy[language()][introKey];
    tabs.forEach(tab => {
      const active = tab.dataset.shareTab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
  }

  function openShare(owner) {
    canManageAccess = owner;
    tabs[0].hidden = !owner;
    tabs[1].hidden = !owner;
    selectShareTab(owner ? 'access' : 'files');
  }

  groups.forEach(group => group.addEventListener('toggle', () => {
    if (!group.open) return;
    groups.forEach(other => { if (other !== group) other.open = false; });
  }));
  more.addEventListener('click', event => {
    if (event.target.closest('button')) more.open = false;
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectShareTab(tab.dataset.shareTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (!canManageAccess) return;
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectShareTab(tabs[target].dataset.shareTab, true);
    });
  });
  document.getElementById('dashboardStartEvent').addEventListener('click', () => document.getElementById('dashboardAddEvent').click());
  document.getElementById('dashboardStartChild').addEventListener('click', () => document.getElementById('emptyAddKid').click());
  document.getElementById('dashboardStartExample').addEventListener('click', () => document.getElementById('loadPreset').click());
  localize();
  window.KidsSyncExperience = { localize, openShare, selectShareTab };
})();
