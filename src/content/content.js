// src/content/content.js

const DEFAULT_RATES = [2.0, 1.5, 1.25, 1.0, 0.75, 0.5];
let currentUserRates = [...DEFAULT_RATES];
let hoverListenerAttached = false;
let currentTargetRate = null;

// 状态标记
let isLongPressing = false;
let hoverListenerBound = false;
let gestureListenerBound = false;

// 全局设置 (统一出厂默认延迟为 280ms，兼顾灵敏度与单击暂停防误触)
let globalSettings = {
  enableChipmunk: true,
  longPressSpeed: 3.0,
  enableGesture: true,
  enableMouseLongPress: true,
  mouseLongPressDelay: 280
};

// 工具函数：获取主视频节点，防止匹配到缩略图/悬浮卡片的预览 video
function getMainVideo() {
  return document.querySelector('.bpx-player-video-area video, #bilibili-player video, .bilibili-player-video video, video');
}

// 工具函数：获取主播放器容器
function getPlayerContainer() {
  return document.querySelector('.bpx-player-container, #bilibili-player, .bpx-player-video-area, #player-wrap');
}

// ==========================================
// 初始化与 Storage 响应式热更新
// ==========================================
function init() {
  chrome.storage.sync.get(['customSpeeds', 'settings'], (result) => {
    if (result.customSpeeds && Array.isArray(result.customSpeeds) && result.customSpeeds.length > 0) {
      currentUserRates = result.customSpeeds;
    }
    if (!currentUserRates.includes(1.0)) currentUserRates.push(1.0);

    if (result.settings) {
      globalSettings = { ...globalSettings, ...result.settings };
    }

    // 立即启动首次挂载检测与监听
    checkAndMount();
    startPlayerObserver();
  });
}

// 监听 storage 变更，实现即时无感知热更新（无需刷新 B站 网页）
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    globalSettings = { ...globalSettings, ...changes.settings.newValue };
    const video = getMainVideo();
    if (isLongPressing) {
      applySpeed(globalSettings.longPressSpeed, true);
      toggleNativeLongPressUI(true, globalSettings.longPressSpeed);
    } else if (video && currentTargetRate !== null) {
      applySpeed(currentTargetRate, false);
    }
  }

  if (changes.customSpeeds && changes.customSpeeds.newValue) {
    let updatedRates = changes.customSpeeds.newValue;
    if (!updatedRates.includes(1.0)) updatedRates.push(1.0);
    currentUserRates = updatedRates;
    injectMenu(currentUserRates, true);
  }
});

// ==========================================
// 倍速应用与超高倍速“花栗鼠”音调管理
// ==========================================
function applySpeed(rate, isTemporary = false) {
  const video = getMainVideo();
  if (!video) return;

  if (!isTemporary) currentTargetRate = rate;

  const CHIPMUNK_THRESHOLD = 7.0;
  if (globalSettings.enableChipmunk) {
    if (rate >= CHIPMUNK_THRESHOLD) {
      video.preservesPitch = false;
      video.mozPreservesPitch = false;
      video.webkitPreservesPitch = false;
    } else {
      video.preservesPitch = true;
      video.mozPreservesPitch = true;
      video.webkitPreservesPitch = true;
    }
  } else {
    video.preservesPitch = true;
    video.mozPreservesPitch = true;
    video.webkitPreservesPitch = true;
  }
  video.playbackRate = rate;
}

// ==========================================
// 倍速防篡改守护（防止切 P / 换画质后 B站 重置倍速）
// ==========================================
function setupAntiReset(video) {
  if (!video || video.hasAttribute('data-pro-speed-guardian')) return;

  video.addEventListener('ratechange', () => {
    if (currentTargetRate === null) return;

    // 判断当前应该守护哪个倍数
    const expectedRate = isLongPressing ? globalSettings.longPressSpeed : currentTargetRate;

    // 只要实际倍数与期望倍数偏离超过 0.08（被原生代码重置），自动矫正
    if (Math.abs(video.playbackRate - expectedRate) > 0.08) {
      applySpeed(expectedRate, isLongPressing);

      if (isLongPressing) {
        toggleNativeLongPressUI(true, expectedRate);
      }
    }
  });

  video.setAttribute('data-pro-speed-guardian', 'true');
}

// ==========================================
// B 站原生风格长按提示 UI（展示具体倍速值）
// ==========================================
function toggleNativeLongPressUI(isShowing, speed = 3.0) {
  let hintBox = document.querySelector('.bpx-player-three-playrate-hint');

  if (!hintBox) {
    const videoArea = document.querySelector('.bpx-player-video-area') || getPlayerContainer();
    if (videoArea) {
      hintBox = document.createElement('div');
      hintBox.className = 'bpx-player-three-playrate-hint';
      hintBox.style.display = 'none';
      hintBox.innerHTML = `
        <span class="bpx-player-three-playrate-hint-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 111 66" width="111" height="66" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%; transform: translate3d(0px, 0px, 0px);"><defs><clipPath id="__lottie_element_245"><rect width="111" height="66" x="0" y="0"></rect></clipPath></defs><g clip-path="url(#__lottie_element_245)"><g transform="matrix(1,0,0,1,94.5,32.5)" opacity="0.15" style="display: block;"><g opacity="1" transform="matrix(0,3,-3,0,0,0)"><path fill="rgb(255,255,255)" fill-opacity="1" d=" M6.138000011444092,3.5460000038146973 C6.4679999351501465,4.105999946594238 6.2779998779296875,4.826000213623047 5.7179999351501465,5.156000137329102 C5.538000106811523,5.265999794006348 5.3379998207092285,5.326000213623047 5.118000030517578,5.326000213623047 C5.118000030517578,5.326000213623047 -5.122000217437744,5.326000213623047 -5.122000217437744,5.326000213623047 C-5.771999835968018,5.326000213623047 -6.302000045776367,4.796000003814697 -6.302000045776367,4.145999908447266 C-6.302000045776367,3.936000108718872 -6.242000102996826,3.7260000705718994 -6.142000198364258,3.5460000038146973 C-6.142000198364258,3.5460000038146973 -1.3519999980926514,-4.553999900817871 -1.3519999980926514,-4.553999900817871 C-0.9120000004768372,-5.294000148773193 0.04800000041723251,-5.544000148773193 0.7979999780654907,-5.104000091552734 C1.027999997138977,-4.973999977111816 1.218000054359436,-4.783999919891357 1.3480000495910645,-4.553999900817871 C1.3480000495910645,-4.553999900817871 6.138000011444092,3.5460000038146973 6.138000011444092,3.5460000038146973z"></path></g></g><g transform="matrix(1,0,0,1,55.5,32.5)" opacity="0.36666666666666664" style="display: block;"><g opacity="1" transform="matrix(0,3,-3,0,0,0)"><path fill="rgb(255,255,255)" fill-opacity="1" d=" M6.138000011444092,3.5460000038146973 C6.4679999351501465,4.105999946594238 6.2779998779296875,4.826000213623047 5.7179999351501465,5.156000137329102 C5.538000106811523,5.265999794006348 5.3379998207092285,5.326000213623047 5.118000030517578,5.326000213623047 C5.118000030517578,5.326000213623047 -5.122000217437744,5.326000213623047 -5.122000217437744,5.326000213623047 C-5.771999835968018,5.326000213623047 -6.302000045776367,4.796000003814697 -6.302000045776367,4.145999908447266 C-6.302000045776367,3.936000108718872 -6.242000102996826,3.7260000705718994 -6.142000198364258,3.5460000038146973 C-6.142000198364258,3.5460000038146973 -1.3519999980926514,-4.553999900817871 -1.3519999980926514,-4.553999900817871 C-0.9120000004768372,-5.294000148773193 0.04800000041723251,-5.544000148773193 0.7979999780654907,-5.104000091552734 C1.027999997138977,-4.973999977111816 1.218000054359436,-4.783999919891357 1.3480000495910645,-4.553999900817871 C1.3480000495910645,-4.553999900817871 6.138000011444092,3.5460000038146973 6.138000011444092,3.5460000038146973z"></path></g></g><g transform="matrix(1,0,0,1,16.5,32.5)" opacity="0.5833333333333333" style="display: block;"><g opacity="1" transform="matrix(0,3,-3,0,0,0)"><path fill="rgb(255,255,255)" fill-opacity="1" d=" M6.138000011444092,3.5460000038146973 C6.4679999351501465,4.105999946594238 6.2779998779296875,4.826000213623047 5.7179999351501465,5.156000137329102 C5.538000106811523,5.265999794006348 5.3379998207092285,5.326000213623047 5.118000030517578,5.326000213623047 C5.118000030517578,5.326000213623047 -5.122000217437744,5.326000213623047 -5.122000217437744,5.326000213623047 C-5.771999835968018,5.326000213623047 -6.302000045776367,4.796000003814697 -6.302000045776367,4.145999908447266 C-6.302000045776367,3.936000108718872 -6.242000102996826,3.7260000705718994 -6.142000198364258,3.5460000038146973 C-6.142000198364258,3.5460000038146973 -1.3519999980926514,-4.553999900817871 -1.3519999980926514,-4.553999900817871 C-0.9120000004768372,-5.294000148773193 0.04800000041723251,-5.544000148773193 0.7979999780654907,-5.104000091552734 C1.027999997138977,-4.973999977111816 1.218000054359436,-4.783999919891357 1.3480000495910645,-4.553999900817871 C1.3480000495910645,-4.553999900817871 6.138000011444092,3.5460000038146973 6.138000011444092,3.5460000038146973z"></path></g></g></g></svg></span>
        <span class="bpx-player-three-playrate-hint-text"></span>
      `;
      videoArea.appendChild(hintBox);
    }
  }

  if (hintBox) {
    if (isShowing) {
      hintBox.style.display = '';
      const textSpan = hintBox.querySelector('.bpx-player-three-playrate-hint-text');
      if (textSpan) {
        textSpan.textContent = `${speed}x 倍速播放中`;
      }
    } else {
      hintBox.style.display = 'none';
    }
  } else {
    // 极端情况兜底更新控制栏显示
    const resultDiv = document.querySelector('.bpx-player-ctrl-playbackrate-result');
    if (resultDiv) resultDiv.textContent = isShowing ? `🚀 ${speed}x` : `${currentTargetRate}x`;
  }
}

// ==========================================
// 键盘长按加速监听 (ArrowRight)
// ==========================================
function setupKeyboardListener() {
  if (hoverListenerBound) return;

  function isTyping() {
    const target = document.activeElement;
    if (!target) return false;
    const tagName = target.tagName.toUpperCase();
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && !isTyping()) {
      if (e.repeat && !isLongPressing) {
        isLongPressing = true;
        applySpeed(globalSettings.longPressSpeed, true);
        toggleNativeLongPressUI(true, globalSettings.longPressSpeed);
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowRight' && isLongPressing) {
      isLongPressing = false;
      applySpeed(currentTargetRate);
      toggleNativeLongPressUI(false);
    }
  });

  hoverListenerBound = true;
}

// ==========================================
// 手势滑动引擎 & 鼠标长按加速引擎
// ==========================================
function setupGestureSeeking() {
  if (gestureListenerBound) return;

  let isDragging = false;
  let isSignificantDrag = false;
  let startX = 0;
  let startVideoTime = 0;
  let targetTime = 0;

  // 左键长按相关的状态变量
  let mouseLongPressTimer = null;
  let isMouseLongPressing = false;
  let wasMouseLongPressing = false;
  let wasDragging = false; // 用于在 mouseup 后干净拦截随后的 click 暂停事件
  let justCancelledDrag = false;

  // rAF 渲染节流标志与句柄
  let rafPending = false;
  let rafPendingId = null;
  function formatTime(secs, totalSecs = 0) {
    if (isNaN(secs)) return "00:00";
    secs = Math.max(0, secs);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);

    if (totalSecs >= 3600 || h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function showDragUI(offset, target, total) {
    // 关键防线：若用户已经结束拖拽，绝不再唤醒 HUD
    if (!isDragging || !isSignificantDrag) {
      hideDragUI();
      return;
    }

    let toast = document.getElementById('bilispark-drag-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bilispark-drag-toast';
      const videoArea = document.querySelector('.bpx-player-video-area') || getPlayerContainer();
      if (videoArea) videoArea.appendChild(toast);
    }

    toast.style.display = 'flex';
    const isForward = offset >= 0;
    const sign = isForward ? '+' : '-';
    const absOffset = Math.abs(offset);
    // 小于 10 秒保留 1 位小数，给看课精细微调提供明确的反馈；>= 10 秒显示整数
    const offsetNum = absOffset < 10 ? absOffset.toFixed(1) : Math.round(absOffset);
    const offsetText = `${sign}${offsetNum}s`;
    const progressPercent = total > 0 ? Math.min(100, Math.max(0, (target / total) * 100)) : 0;

    toast.innerHTML = `
      <div class="bilispark-hud-content">
        <span class="bilispark-hud-offset ${isForward ? 'forward' : 'backward'}">
          ${isForward ? '⏩' : '⏪'} ${offsetText}
        </span>
        <span class="bilispark-hud-sep">·</span>
        <span class="bilispark-hud-time">${formatTime(target, total)}</span>
        <span class="bilispark-hud-total">/ ${formatTime(total, total)}</span>
        <span class="bilispark-hud-tip">右键取消</span>
      </div>
      <div class="bilispark-hud-bar">
        <div class="bilispark-hud-progress ${isForward ? 'forward' : 'backward'}" style="width: ${progressPercent.toFixed(1)}%;"></div>
      </div>
    `;
  }

  function hideDragUI() {
    // 取消尚未执行的异步帧，彻底杜绝 mouseup 后异步帧重新唤醒 HUD
    if (rafPendingId) {
      cancelAnimationFrame(rafPendingId);
      rafPendingId = null;
    }
    rafPending = false;

    // 隐藏所有可能存在的 toast 节点
    const toasts = document.querySelectorAll('#bilispark-drag-toast');
    toasts.forEach(t => {
      t.style.display = 'none';
    });
  }

  // 1. 鼠标按下 (处理左键和右键取消)
  document.body.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (!target.closest('.bpx-player-video-area') && !target.closest('#bilibili-player')) return;
    if (target.closest('.bpx-player-control-wrap') || target.closest('.bpx-player-sending-area') || target.closest('.bpx-player-dialog-wrap')) return;

    // 拖拽中按下右键：立即撤销快进
    if (e.button === 2 && isDragging && isSignificantDrag) {
      isDragging = false;
      isSignificantDrag = false;
      justCancelledDrag = true;
      hideDragUI();
      document.body.classList.remove('bilispark-dragging');
      setTimeout(() => { justCancelledDrag = false; }, 200);
      return;
    }

    // 只有左键且开启手势或长按时继续
    if (e.button !== 0) return;
    if (!globalSettings.enableGesture && !globalSettings.enableMouseLongPress) return;

    const video = getMainVideo();
    if (!video) return;

    // 初始化滑动数据
    isDragging = true;
    isSignificantDrag = false;
    startX = e.clientX;
    startVideoTime = video.currentTime;

    // 启动左键长按计时器 (默认 280ms)
    if (globalSettings.enableMouseLongPress) {
      const delay = globalSettings.mouseLongPressDelay || 280;
      mouseLongPressTimer = setTimeout(() => {
        if (isDragging && !isSignificantDrag) {
          isMouseLongPressing = true;
          isLongPressing = true;
          applySpeed(globalSettings.longPressSpeed, true);
          toggleNativeLongPressUI(true, globalSettings.longPressSpeed);
        }
      }, delay);
    }
  }, true);

  // 2. 鼠标移动 (通过 requestAnimationFrame 调度优化)
  document.body.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const video = getMainVideo();
    if (!video) return;

    const deltaX = e.clientX - startX;
    const absDelta = Math.abs(deltaX);

    // 未进入实质性拖拽前，需超过 8px 死区
    if (!isSignificantDrag) {
      if (absDelta <= 8) return;
      if (!globalSettings.enableGesture) return;
      if (isMouseLongPressing) return;

      // 快速移动说明意在快进，掐灭长按计时器
      if (mouseLongPressTimer) {
        clearTimeout(mouseLongPressTimer);
        mouseLongPressTimer = null;
      }

      isSignificantDrag = true;
      document.body.classList.add('bilispark-dragging');
    }

    if (!globalSettings.enableGesture) return;

    // 专为“听课回退刚刚听懂的地方”设计的精细微调曲线：
    // activePx 从 0 启动，前 60px 内非常缓和（约 0.07s/px），微移 20~40px 即可精确定位到 2~4 秒前；
    // 后续自然提速，拖动较大幅度时也可平滑跨过 10~25 秒。
    const activePx = Math.max(0, absDelta - 8);
    const sec = activePx * 0.07 + Math.pow(activePx / 35, 1.7);
    const offsetTime = (deltaX > 0 ? 1 : -1) * sec;

    const duration = video.duration || 0;
    targetTime = Math.max(0, Math.min(startVideoTime + offsetTime, duration));

    if (!rafPending) {
      rafPending = true;
      rafPendingId = requestAnimationFrame(() => {
        rafPending = false;
        rafPendingId = null;
        if (!isDragging || !isSignificantDrag) return;
        showDragUI(offsetTime, targetTime, duration);
      });
    }
  }, true);

  // 3. 鼠标松开
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;

    if (mouseLongPressTimer) {
      clearTimeout(mouseLongPressTimer);
      mouseLongPressTimer = null;
    }

    if (isMouseLongPressing) {
      isMouseLongPressing = false;
      isLongPressing = false;
      wasMouseLongPressing = true;
      applySpeed(currentTargetRate);
      toggleNativeLongPressUI(false);
      setTimeout(() => { wasMouseLongPressing = false; }, 60);
    }

    if (!isDragging) return;

    // 记录是否刚刚发生过拖拽，用于精准拦截随后的 click 暂停事件
    if (isSignificantDrag) {
      wasDragging = true;
      const video = getMainVideo();
      if (video) video.currentTime = targetTime;
      setTimeout(() => { wasDragging = false; }, 60);
    }

    // 同步重置所有拖拽状态，无条件隐藏 HUD
    isDragging = false;
    isSignificantDrag = false;
    document.body.classList.remove('bilispark-dragging');
    hideDragUI();
  }, true);

  // 4. 拦截点击事件 (防止拖拽或长按后误触画面暂停)
  document.body.addEventListener('click', (e) => {
    if (wasDragging || wasMouseLongPressing) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // 5. 拦截右键菜单 (右键取消拖拽时防弹出菜单)
  document.body.addEventListener('contextmenu', (e) => {
    if (justCancelledDrag) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 6. 窗口失焦时兜底清理 (防止切换标签页或 Alt-Tab 导致状态残留)
  window.addEventListener('blur', () => {
    if (isDragging) {
      isDragging = false;
      isSignificantDrag = false;
      document.body.classList.remove('bilispark-dragging');
      hideDragUI();
    }
  });

  gestureListenerBound = true;
}

// ==========================================
// 播放器倍速菜单滚动与居中定位
// ==========================================
function snapToActive(menuUl) {
  if (!menuUl) return;
  const activeItem = menuUl.querySelector('.bpx-state-active');
  if (!activeItem) return;

  const prevDisplay = menuUl.style.display;
  const prevVisibility = menuUl.style.visibility;
  menuUl.style.display = 'block';
  menuUl.style.visibility = 'hidden';

  const targetScroll = activeItem.offsetTop - (menuUl.clientHeight / 2) + (activeItem.clientHeight / 2);
  menuUl.scrollTop = targetScroll;

  menuUl.style.display = prevDisplay;
  menuUl.style.visibility = prevVisibility;
}

// ==========================================
// 注入自定义倍速列表到原生菜单
// ==========================================
function injectMenu(rates, force = false) {
  const menuUl = document.querySelector('.bpx-player-ctrl-playbackrate-menu');
  if (!menuUl) return;
  if (!force && menuUl.hasAttribute('data-pro-speed-injected')) return;

  const video = getMainVideo();
  if (video) {
    setupAntiReset(video);
    if (currentTargetRate === null) currentTargetRate = video.playbackRate;
  }

  menuUl.innerHTML = '';

  // 精度规整并去重降序排列
  const sanitizedRates = rates
    .map(r => Number(parseFloat(r).toFixed(2)))
    .filter(r => !isNaN(r) && r > 0);
  const allRates = Array.from(new Set(sanitizedRates)).sort((a, b) => b - a);

  allRates.forEach(rate => {
    const li = document.createElement('li');
    li.className = 'bpx-player-ctrl-playbackrate-menu-item';
    li.dataset.value = rate;
    li.textContent = rate + 'x';

    if (currentTargetRate && Math.abs(currentTargetRate - rate) < 0.01) {
      li.classList.add('bpx-state-active');
    }

    li.addEventListener('click', (e) => {
      e.stopPropagation();
      applySpeed(rate, false);
      const resultDiv = document.querySelector('.bpx-player-ctrl-playbackrate-result');
      if (resultDiv) resultDiv.textContent = rate + 'x';
      menuUl.querySelectorAll('.bpx-player-ctrl-playbackrate-menu-item').forEach(item => {
        item.classList.remove('bpx-state-active');
      });
      li.classList.add('bpx-state-active');
    });

    menuUl.appendChild(li);
  });

  menuUl.setAttribute('data-pro-speed-injected', 'true');
}

function setupGlobalHoverListener() {
  if (hoverListenerAttached) return;
  document.body.addEventListener('mouseenter', (e) => {
    const target = e.target;
    if (target && target.classList && target.classList.contains('bpx-player-ctrl-playbackrate')) {
      const menuUl = target.querySelector('.bpx-player-ctrl-playbackrate-menu');
      if (menuUl) snapToActive(menuUl);
    }
  }, true);
  hoverListenerAttached = true;
}

// ==========================================
// 播放器状态检测与高效作用域监听 (带 rAF 节流)
// ==========================================
let activeObserver = null;
let observingTarget = null;
let checkRafPending = false;

function checkAndMount() {
  const video = getMainVideo();
  const menu = document.querySelector('.bpx-player-ctrl-playbackrate-menu');

  if (video && !video.hasAttribute('data-pro-speed-guardian')) {
    currentTargetRate = video.playbackRate;
    setupAntiReset(video);
    setupKeyboardListener();
    setupGestureSeeking();
  }

  if (menu && !menu.hasAttribute('data-pro-speed-injected')) {
    injectMenu(currentUserRates);
    setupGlobalHoverListener();
  }

  // 性能优化：播放器容器就绪后，将 observer 从全局 body 收敛到播放器容器
  const container = getPlayerContainer();
  if (container && observingTarget !== container) {
    bindObserver(container);
  }
}

function requestCheck() {
  if (checkRafPending) return;
  checkRafPending = true;
  requestAnimationFrame(() => {
    checkRafPending = false;
    checkAndMount();
  });
}

function bindObserver(targetNode) {
  if (activeObserver) {
    activeObserver.disconnect();
  }
  observingTarget = targetNode;
  activeObserver = new MutationObserver(() => {
    requestCheck();
  });
  activeObserver.observe(targetNode, { childList: true, subtree: true });
}

function startPlayerObserver() {
  const container = getPlayerContainer();
  if (container) {
    bindObserver(container);
  } else {
    // 容器未挂载时先监听 body，一旦探测到容器立即收敛
    bindObserver(document.body);
  }

  // 支持 B站 SPA 切集无缝注入
  window.addEventListener('popstate', requestCheck);
}

init();
