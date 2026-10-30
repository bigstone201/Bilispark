document.addEventListener('DOMContentLoaded', () => {
  // === 导航与视图元素 ===
  const tabSpeed = document.getElementById('tabSpeed');
  const tabGesture = document.getElementById('tabGesture');
  const settingBtn = document.getElementById('settingBtn');
  const backFromSettingsBtn = document.getElementById('backFromSettingsBtn');

  const speedView = document.getElementById('speedView');
  const speedSettingsView = document.getElementById('speedSettingsView');
  const gestureView = document.getElementById('gestureView');

  const speedFooter = document.getElementById('speedFooter');
  const speedSettingsFooter = document.getElementById('speedSettingsFooter');
  const gestureFooter = document.getElementById('gestureFooter');

  // === 倍速管理相关元素 ===
  const input = document.getElementById('speedInput');
  const addBtn = document.getElementById('addBtn');
  const list = document.getElementById('speedList');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const quickAddContainer = document.getElementById('quickAddContainer');
  const chipmunkToggle = document.getElementById('chipmunkToggle');
  const saveSpeedSettingsBtn = document.getElementById('saveSpeedSettingsBtn');

  // === 手势相关元素 ===
  const gestureToggle = document.getElementById('gestureToggle');
  const mouseLongPressToggle = document.getElementById('mouseLongPressToggle');
  const mouseLongPressDelayInput = document.getElementById('mouseLongPressDelayInput');
  const longPressInput = document.getElementById('longPressInput');
  const saveSettingBtn = document.getElementById('saveSettingBtn');

  // === 通用元素 ===
  const status = document.getElementById('status');

  // === 配置常量 ===
  const QUICK_RATES = [0.75, 1.25, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0];
  const DEFAULT_RATES = [2.0, 1.5, 1.25, 1.0, 0.75, 0.5];

  // === 状态变量 ===
  let currentTab = 'speed';
  let currentSpeeds = [];
  let userSettings = {
    enableChipmunk: true,
    longPressSpeed: 3.0,
    enableGesture: true,
    enableMouseLongPress: true,
    mouseLongPressDelay: 280
  };

  init();

  function init() {
    chrome.storage.sync.get(['customSpeeds', 'settings'], (result) => {
      // 1. 加载并规整倍数列表
      if (result.customSpeeds && Array.isArray(result.customSpeeds) && result.customSpeeds.length > 0) {
        currentSpeeds = result.customSpeeds
          .map(r => Number(parseFloat(r).toFixed(2)))
          .filter(r => !isNaN(r) && r > 0);
      } else {
        currentSpeeds = [...DEFAULT_RATES];
      }

      if (!currentSpeeds.includes(1.0)) currentSpeeds.push(1.0);
      currentSpeeds.sort((a, b) => b - a);

      // 2. 加载用户设置
      if (result.settings) {
        userSettings = { ...userSettings, ...result.settings };
      }

      // 同步 UI 状态
      chipmunkToggle.checked = userSettings.enableChipmunk !== false;
      if (gestureToggle) gestureToggle.checked = userSettings.enableGesture !== false;
      if (mouseLongPressToggle) mouseLongPressToggle.checked = userSettings.enableMouseLongPress !== false;
      if (mouseLongPressDelayInput) mouseLongPressDelayInput.value = userSettings.mouseLongPressDelay || 280;
      if (longPressInput) longPressInput.value = userSettings.longPressSpeed || 3.0;

      renderAll();
    });
  }

  // === 导航切换逻辑 (左侧切页，右侧设置) ===
  function switchTab(tabName) {
    if (tabName === 'gesture') {
      currentTab = 'gesture';
      tabSpeed.classList.remove('active');
      tabSpeed.setAttribute('aria-selected', 'false');
      tabGesture.classList.add('active');
      tabGesture.setAttribute('aria-selected', 'true');

      speedView.classList.add('hidden');
      speedSettingsView.classList.add('hidden');
      speedFooter.classList.add('hidden');
      speedSettingsFooter.classList.add('hidden');

      gestureView.classList.remove('hidden');
      gestureFooter.classList.remove('hidden');

      // 手势页无需独立设置面板，将齿轮按钮置灰
      settingBtn.classList.add('is-disabled');
      settingBtn.title = '手势设置已全部显示在面板中';
    } else {
      currentTab = 'speed';
      tabGesture.classList.remove('active');
      tabGesture.setAttribute('aria-selected', 'false');
      tabSpeed.classList.add('active');
      tabSpeed.setAttribute('aria-selected', 'true');

      gestureView.classList.add('hidden');
      gestureFooter.classList.add('hidden');
      speedSettingsView.classList.add('hidden');
      speedSettingsFooter.classList.add('hidden');

      speedView.classList.remove('hidden');
      speedFooter.classList.remove('hidden');

      settingBtn.classList.remove('is-disabled');
      settingBtn.title = '倍速高级设置 (花栗鼠音效等)';
    }
    showStatus('');
  }

  function openSpeedSettings() {
    speedView.classList.add('hidden');
    speedFooter.classList.add('hidden');
    gestureView.classList.add('hidden');
    gestureFooter.classList.add('hidden');

    speedSettingsView.classList.remove('hidden');
    speedSettingsFooter.classList.remove('hidden');
    showStatus('');
  }

  function closeSpeedSettings() {
    speedSettingsView.classList.add('hidden');
    speedSettingsFooter.classList.add('hidden');

    speedView.classList.remove('hidden');
    speedFooter.classList.remove('hidden');
    showStatus('');
  }

  tabSpeed.addEventListener('click', () => switchTab('speed'));
  tabGesture.addEventListener('click', () => switchTab('gesture'));

  settingBtn.addEventListener('click', () => {
    if (currentTab === 'speed') {
      openSpeedSettings();
    }
  });

  if (backFromSettingsBtn) {
    backFromSettingsBtn.addEventListener('click', closeSpeedSettings);
  }

  // === 倍数增删逻辑 ===
  function addSpeed(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) {
      showStatus('请输入有效的数字', true);
      return;
    }

    const cleanRate = Number(parseFloat(rate).toFixed(2));

    if (cleanRate <= 0) {
      showStatus('倍数必须大于 0', true);
      return;
    }
    if (cleanRate > 16) {
      showStatus('浏览器限制最大倍数为 16.0', true);
      return;
    }

    if (!currentSpeeds.includes(cleanRate)) {
      currentSpeeds.push(cleanRate);
      currentSpeeds.sort((a, b) => b - a);
      renderAll();
      input.value = '';
      showStatus('');
    } else {
      showStatus('该倍数已存在', true);
    }
  }

  function removeSpeed(rate) {
    if (rate === 1.0) {
      showStatus('1.0x 为标准基准倍速，不可移除', true);
      return;
    }
    currentSpeeds = currentSpeeds.filter(s => Math.abs(s - rate) > 0.001);
    renderAll();
  }

  function renderAll() {
    renderQuickAdd();
    renderList();
  }

  function renderQuickAdd() {
    quickAddContainer.innerHTML = '';
    QUICK_RATES.forEach(rate => {
      const exists = currentSpeeds.some(s => Math.abs(s - rate) < 0.001);
      if (!exists) {
        const btn = document.createElement('div');
        btn.className = 'quick-btn';
        btn.textContent = `+ ${rate}x`;
        btn.onclick = () => addSpeed(rate);
        quickAddContainer.appendChild(btn);
      }
    });
  }

  function renderList() {
    list.innerHTML = '';
    currentSpeeds.forEach(rate => {
      const item = document.createElement('div');
      item.className = 'speed-item';
      if (Math.abs(rate - 1.0) < 0.001) {
        item.classList.add('locked');
        item.title = '基准倍速 (不可删除)';
        item.innerHTML = `<span>${rate}x</span>`;
      } else {
        item.innerHTML = `<span>${rate}x</span><button class="delete-btn" title="删除">×</button>`;
        item.querySelector('.delete-btn').onclick = (e) => {
          e.stopPropagation();
          removeSpeed(rate);
        };
      }
      list.appendChild(item);
    });
  }

  // === 事件绑定 ===
  addBtn.addEventListener('click', () => {
    addSpeed(parseFloat(input.value));
  });

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  // 保存倍数列表
  saveBtn.addEventListener('click', () => {
    if (!currentSpeeds.includes(1.0)) currentSpeeds.push(1.0);
    currentSpeeds.sort((a, b) => b - a);

    chrome.storage.sync.set({ customSpeeds: currentSpeeds }, () => {
      showStatus('✅ 倍速设置已实时生效！');
    });
  });

  resetBtn.addEventListener('click', () => {
    if (confirm('确定要恢复到初始倍数列表吗？')) {
      currentSpeeds = [...DEFAULT_RATES];
      renderAll();
      showStatus('已恢复默认，点击“保存倍速并应用”生效');
    }
  });

  // 保存倍速高级设置 (花栗鼠音效等)
  if (saveSpeedSettingsBtn) {
    saveSpeedSettingsBtn.addEventListener('click', () => {
      userSettings.enableChipmunk = chipmunkToggle.checked;
      chrome.storage.sync.set({ settings: userSettings }, () => {
        showStatus('✅ 设置已实时生效！');
        setTimeout(closeSpeedSettings, 400);
      });
    });
  }

  // 保存手势设置 (页面二)
  saveSettingBtn.addEventListener('click', () => {
    userSettings.enableGesture = gestureToggle.checked;
    userSettings.enableMouseLongPress = mouseLongPressToggle.checked;

    if (mouseLongPressDelayInput) {
      let delay = parseInt(mouseLongPressDelayInput.value, 10);
      if (isNaN(delay) || delay < 50) delay = 280;
      userSettings.mouseLongPressDelay = delay;
    }

    if (longPressInput) {
      let lpSpeed = parseFloat(longPressInput.value);
      if (!lpSpeed || lpSpeed <= 0) lpSpeed = 3.0;
      userSettings.longPressSpeed = Number(lpSpeed.toFixed(2));
    }

    chrome.storage.sync.set({ settings: userSettings }, () => {
      showStatus('✅ 手势设置已实时生效！');
    });
  });

  function showStatus(msg, isError = false) {
    status.textContent = msg;
    status.style.color = isError ? '#FF6699' : '#00AEEC';
  }
});
