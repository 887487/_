// =====================================================
// データ読み込み（localStorageから）
// =====================================================
let scripts;
try {
  const saved = localStorage.getItem('talkScripts');
  scripts = saved ? JSON.parse(saved) : {};
} catch(e) { scripts = {}; }

// ページ遷移履歴スタック（← → ナビゲーション用）
let historyStack = [];
let forwardStack  = [];

// メインコンテンツエリアへの参照
const contentArea = document.getElementById('contentArea');

// =====================================================
// ホーム表示
// =====================================================
function renderHome() {
  // サイドバーがコンテンツ一覧を持つため、
  // contentAreaにはウェルカムメッセージのみ表示する
  contentArea.innerHTML = `
    <div class="home-welcome">
      <div class="home-welcome-icon">📋</div>
      <div class="home-welcome-title">トークスクリプト集</div>
      <div class="home-welcome-text">左のサイドバーからスクリプトを選択してください。</div>
    </div>
  `;
  // クロージングを非表示に戻す
  hideClosingSection();
}

// =====================================================
// 状態変数
// =====================================================
let currentType      = null;  // 選択中カテゴリキー
let currentSubKey    = null;  // 選択中サブカテゴリキー
let currentOpenIndex = null;  // 選択中スクリプトインデックス
let stepHistory      = [];    // ステップ戻る用履歴
let visitedSteps     = [];    // 選択済みステップの記録

// =====================================================
// サイドバーからのスクリプト選択（直接ステップ表示）
// =====================================================
function selectUsageItem(type, subKey, index) {
  historyStack.push(contentArea.innerHTML);
  forwardStack     = [];
  currentType      = type;
  currentSubKey    = subKey || null;
  currentOpenIndex = index;
  stepHistory      = [];
  visitedSteps     = [];
  hideClosingSection();
  // アクティブ状態だけ更新（アコーディオン開閉は一切変えない）
  updateSidebarActive();
  // ステップ0からスクリプトを表示
  renderScriptDetail(type, subKey || null, index, 0, true);
}

// =====================================================
// スクリプト詳細表示（ステップ縦並び・サイドバー主導モード）
// サイドバーがナビゲーションを担うため、左リストペインは廃止
// =====================================================
function renderScriptDetail(type, subKey, itemIndex, stepIndex, isNewScript) {
  const list = getScriptList(type, subKey);
  const item = list[itemIndex];
  if (!item) return;

  if (isNewScript) {
    visitedSteps = [];
    stepHistory  = [];
  }

  contentArea.innerHTML = buildAllSteps(type, subKey, itemIndex, stepIndex);

  if (isNewScript) {
    // 新規スクリプト選択 → main 最上部へ
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.resetScrollFab) window.resetScrollFab();
  } else {
    // ステップ進行 → 現在のステップバブル位置へスクロール
    requestAnimationFrame(() => {
      const cur    = document.getElementById('currentStepBubble');
      const mainEl = document.querySelector('main');
      if (!cur || !mainEl) return;
      const top = cur.getBoundingClientRect().top - mainEl.getBoundingClientRect().top + mainEl.scrollTop - 16;
      mainEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  }
}

// =====================================================
// スクリプト一覧取得ヘルパー
// =====================================================
function getScriptList(type, subKey) {
  const cat = scripts[type];
  if (!cat) return [];
  if (subKey && cat.sub && cat.sub[subKey]) return cat.sub[subKey].list || [];
  return cat.list || [];
}

// =====================================================
// ステップ縦並び描画エンジン
// 各ステップを独立したカードとして表示する
// =====================================================
function buildAllSteps(type, subKey, itemIndex, currentStepIndex) {
  const list = getScriptList(type, subKey);
  const item = list[itemIndex];
  if (!item) return '';

  let html = `<div class="script-detail-title">${item.title}</div>`;
  html += `<div class="step-cards">`;

  // 実際に通過したステップだけを順番に収集（分岐で飛ばしたステップは除外）
  const pathSteps = visitedSteps
    .filter(v => v.type === type && v.subKey === subKey && v.itemIndex === itemIndex && !v.isScriptJump)
    .map(v => v.stepIndex);
  // 重複除去・昇順（履歴上の順序で表示）
  const uniquePath = [...new Set(pathSteps)];
  // 現在ステップを末尾に追加（既に含まれていなければ）
  if (!uniquePath.includes(currentStepIndex)) uniquePath.push(currentStepIndex);

  for (const si of uniquePath) {
    const step      = item.steps[si];
    if (!step || !step.text) continue;
    const isCurrent = si === currentStepIndex;

    if (!isCurrent) {
      // 過去のステップ
      const chosen = visitedSteps.find(v =>
        v.type === type && v.subKey === subKey &&
        v.itemIndex === itemIndex && v.stepIndex === si
      );
      html += `<div class="step-card step-card-past">`;
      html += `<div class="step-card-header">`;
      html += `<span class="step-card-num">ステップ ${si}</span>`;
      html += `</div>`;
      html += `<div class="step-card-body">${step.text}</div>`;
      if (chosen && chosen.choiceLabel) {
        html += `<div class="step-chosen-badge">✔ ${chosen.choiceLabel}</div>`;
      }
      html += `</div>`;

    } else {
      // 現在のステップ
      html += `<div class="step-card step-card-current" id="currentStepBubble">`;
      html += `<div class="step-card-header">`;
      html += `<span class="step-card-num">ステップ ${si}${si === 0 ? '　▶ 開始' : ''}</span>`;
      html += `</div>`;
      html += `<div class="step-card-body">${step.text}</div>`;
      if (step.memo) {
        html += `<div class="step-memo-display">📝 ${step.memo.replace(/\n/g, '<br>')}</div>`;
      }
      if (step.choices && step.choices.length > 0) {
        html += `<div class="step-choices">`;
        step.choices.forEach(c => {
          if (typeof c.go === 'string' && c.go.includes('/')) {
            html += `<button class="step-choice-btn step-choice-jump"
              onclick="jumpToScript('${type}','${subKey||''}',${itemIndex},${si},'${c.go}','${(c.label||'').replace(/'/g,"\\'")}')">
              ${c.label} ↗</button>`;
          } else {
            html += `<button class="step-choice-btn"
              onclick="goStep('${type}','${subKey||''}',${itemIndex},${si},${c.go},'${(c.label||'').replace(/'/g,"\\'")}')">
              ${c.label}</button>`;
          }
        });
        html += `</div>`;
      } else {
        html += `<div class="step-end-badge">✓ 対応完了</div>`;
      }
      if (stepHistory.length > 0) {
        html += `<button class="step-back-btn" onclick="stepBack()">← 前のステップに戻る</button>`;
      }
      html += `</div>`;

      // 対応完了なら同じ step-cards 内にクロージングを追加
      if (!step.choices || step.choices.length === 0) {
        const closingTextEl = document.getElementById('closingText');
        const closingText   = closingTextEl ? closingTextEl.innerHTML
          : 'ご案内は以上となりますが、そのほか確認されたいことなどはございませんでしょうか？';
        html += `<div class="closing inline-closing">
          <div class="opening-title">クロージングトーク</div>
          <div id="inlineClosingText" class="opening-text">${closingText}</div>
          <div class="closing-buttons">
            <button onclick="closingNone()">不明点なし</button>
            <button onclick="closingAsk()">不明点あり</button>
          </div>
        </div>`;
      }
    }
  }

  html += `</div>`;  // .step-cards 閉じ
  return html;
}

// =====================================================
// 現在のステップバブルへスクロール
// =====================================================
function scrollToCurrent() {
  const cur  = document.getElementById('currentStepBubble');
  const main = document.querySelector('main');
  if (!cur || !main) return;
  const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;
  const top = cur.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 16;
  main.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// =====================================================
// ステップ移動（選択肢ボタン押下時）
// =====================================================
function goStep(type, subKey, itemIndex, fromIndex, nextIndex, choiceLabel) {
  stepHistory.push({ type, subKey, itemIndex, stepIndex: fromIndex });
  visitedSteps.push({ type, subKey, itemIndex, stepIndex: fromIndex, choiceLabel: choiceLabel || '' });
  hideClosingSection();
  renderScriptDetail(type, subKey, itemIndex, nextIndex, false);
}

// =====================================================
// 別スクリプトへのジャンプ（go値が "type/subKey/index/step" 形式）
// =====================================================
function jumpToScript(fromType, fromSubKey, fromItemIndex, fromStepIndex, goStr, choiceLabel) {
  const parts       = goStr.split('/');
  const toType      = parts[0];
  const toSubKey    = parts[1] || null;
  const toItemIndex = parseInt(parts[2]) || 0;
  const toStepIndex = parseInt(parts[3]) || 0;

  stepHistory.push({ type: fromType, subKey: fromSubKey, itemIndex: fromItemIndex, stepIndex: fromStepIndex, isScriptJump: true });
  visitedSteps.push({ type: fromType, subKey: fromSubKey, itemIndex: fromItemIndex, stepIndex: fromStepIndex, choiceLabel: choiceLabel || '', isScriptJump: true });

  currentType      = toType;
  currentSubKey    = toSubKey;
  currentOpenIndex = toItemIndex;
  hideClosingSection();
  updateSidebarActive();
  renderScriptDetail(toType, toSubKey, toItemIndex, toStepIndex, false);
}

// =====================================================
// 前のステップに戻る
// =====================================================
function stepBack() {
  if (stepHistory.length === 0) return;
  const prev = stepHistory.pop();
  visitedSteps = visitedSteps.filter(v =>
    !(v.type === prev.type && v.subKey === prev.subKey &&
      v.itemIndex === prev.itemIndex && v.stepIndex === prev.stepIndex)
  );
  hideClosingSection();

  if (prev.isScriptJump) {
    // 別スクリプトからのジャンプ戻り
    currentType      = prev.type;
    currentSubKey    = prev.subKey;
    currentOpenIndex = prev.itemIndex;
    updateSidebarActive();
  }
  renderScriptDetail(prev.type, prev.subKey, prev.itemIndex, prev.stepIndex, false);
}

// =====================================================
// 検索結果からスクリプトを開く
// =====================================================
function openScript(type, subKey, i) {
  historyStack.push(contentArea.innerHTML);
  forwardStack     = [];
  currentType      = type;
  currentSubKey    = subKey || null;
  currentOpenIndex = i;
  stepHistory      = [];
  visitedSteps     = [];
  hideClosingSection();
  updateSidebarActive();
  renderScriptDetail(type, subKey || null, i, 0, true);
}

// =====================================================
// ナビゲーション（ブラウザ的な進む・戻る）
// =====================================================
function goBack() {
  if (historyStack.length > 0) {
    forwardStack.push(contentArea.innerHTML);
    contentArea.innerHTML = historyStack.pop();
  }
}

function goForward() {
  if (forwardStack.length > 0) {
    historyStack.push(contentArea.innerHTML);
    contentArea.innerHTML = forwardStack.pop();
  }
}

function goHome() {
  historyStack = []; forwardStack = [];
  currentType = null; currentSubKey = null; currentOpenIndex = null;
  stepHistory = []; visitedSteps = [];
  renderHome();
  renderScriptSidebar();
  // 検索欄をリセット
  const sb = document.getElementById('searchBox');
  const cb = document.getElementById('clearBtn');
  const sg = document.getElementById('suggestBox');
  if (sb) sb.value = '';
  if (cb) cb.style.display = 'none';
  if (sg) { sg.style.display = 'none'; sg.innerHTML = ''; }
}

// =====================================================
// クロージングセクション（インライン版）
// =====================================================
function showClosingSection() { /* contentAreaにインライン描画するため不要 */ }
function hideClosingSection()  { /* contentArea再描画時に自動消去されるため不要 */ }

// クロージング文言切り替え
function closingNone() {
  const el = document.getElementById('inlineClosingText');
  if (el) el.innerHTML = 'ありがとうございます。 それでは本日●●がご案内いたしました。それでは失礼いたします。';
}
function closingAsk() {
  const el = document.getElementById('inlineClosingText');
  if (el) el.innerHTML = '○○○についてでございますね。（お問い合わせ内容に回答）';
}

// =====================================================
// 検索
// =====================================================
const searchBox  = document.getElementById('searchBox');
const suggestBox = document.getElementById('suggestBox');
const clearBtn   = document.getElementById('clearBtn');

// 全スクリプトをフラット配列で取得
function getAllScripts() {
  const all = [];
  Object.entries(scripts).forEach(([typeKey, cat]) => {
    if (cat.sub) {
      Object.entries(cat.sub).forEach(([subKey, sub]) => {
        (sub.list || []).forEach((item, i) => {
          const fullText = item.steps ? item.steps.map(s => (s.text || '') + ' ' + (s.memo || '')).join(' ') : (item.text || '');
          all.push({ typeKey, subKey, index: i, categoryName: cat.name + ' › ' + sub.name, title: item.title, text: fullText });
        });
      });
    }
    // 直下アイテムは常に含める（cat.subがあっても）
    (cat.list || []).forEach((item, i) => {
      const fullText = item.steps ? item.steps.map(s => (s.text || '') + ' ' + (s.memo || '')).join(' ') : (item.text || '');
      all.push({ typeKey, subKey: null, index: i, categoryName: cat.name, title: item.title, text: fullText });
    });
  });
  return all;
}

function highlight(str, keyword) {
  if (!keyword) return str;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return str.replace(new RegExp(escaped, 'gi'), match => `<mark>${match}</mark>`);
}

function excerpt(text, keyword) {
  const lower = text.toLowerCase(), kLower = keyword.toLowerCase();
  const idx = lower.indexOf(kLower);
  if (idx === -1) return '';
  const start = Math.max(0, idx - 30), end = Math.min(text.length, idx + keyword.length + 30);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

let _searchResults = [];

searchBox.addEventListener('input', () => {
  const val = searchBox.value.trim();
  clearBtn.style.display = val ? 'block' : 'none';
  if (!val) { suggestBox.style.display = 'none'; suggestBox.innerHTML = ''; _searchResults = []; return; }

  const allItems = getAllScripts();
  _searchResults  = allItems.filter(item =>
    item.title.toLowerCase().includes(val.toLowerCase()) ||
    item.text.toLowerCase().includes(val.toLowerCase())
  );
  suggestBox.innerHTML = '';

  if (_searchResults.length === 0) {
    suggestBox.innerHTML = `<div class="no-result">「${val}」に一致するスクリプトが見つかりません</div>`;
    suggestBox.style.display = 'block';
    return;
  }

  _searchResults.forEach(item => {
    const div = document.createElement('div');
    div.className = 'suggest-item';
    const textMatch = item.text.toLowerCase().includes(val.toLowerCase());
    div.innerHTML = `<div>${highlight(item.title, val)}</div>
      <div class="suggest-meta">${item.categoryName}</div>
      ${textMatch ? `<div class="suggest-meta" style="margin-top:2px;">${excerpt(item.text, val)}</div>` : ''}`;
    div.onclick = () => {
      searchBox.value = item.title;
      suggestBox.style.display = 'none';
      showSearchResults([item], val);
    };
    suggestBox.appendChild(div);
  });
  suggestBox.style.display = 'block';
});

// Enter キー：サジェスト選択ではなく検索実行
searchBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = searchBox.value.trim();
    if (!val) return;
    suggestBox.style.display = 'none';
    const allItems = getAllScripts();
    const results = allItems.filter(item =>
      item.title.toLowerCase().includes(val.toLowerCase()) ||
      item.text.toLowerCase().includes(val.toLowerCase())
    );
    showSearchResults(results, val);
  }
});

function showSearchResults(results, keyword) {
  historyStack.push(contentArea.innerHTML);
  forwardStack = [];
  if (!results.length) {
    contentArea.innerHTML = `<div style="padding:40px;text-align:center;color:#aaa"><div style="font-size:32px">🔍</div><div>「${keyword}」に一致するスクリプトが見つかりません</div></div>`;
    return;
  }
  let h = `<div style="padding:4px 0 12px;font-size:13px;color:#888">「${keyword}」の検索結果：${results.length}件</div>`;
  results.forEach(item => {
    const titleHtml = highlight(escHtml(item.title), keyword);
    const textSnippet = excerpt(item.text, keyword);
    const textHtml = highlight(escHtml(textSnippet), keyword);
    h += `<div class="search-result-card" onclick="openScript('${item.typeKey}','${item.subKey||''}',${item.index})">
      <div class="result-title">${titleHtml}</div>
      <div class="result-category">${escHtml(item.categoryName)}</div>
      ${textSnippet ? `<div class="result-text">${textHtml}</div>` : ''}
    </div>`;
  });
  contentArea.innerHTML = h;
}

// 後方互換
function showSearchResult(item, keyword) {
  showSearchResults([item], keyword);
}

clearBtn.onclick = () => {
  searchBox.value = '';
  clearBtn.style.display = 'none';
  suggestBox.style.display = 'none';
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-area')) suggestBox.style.display = 'none';
});

// =====================================================
// トークスクリプト サイドバー描画
// ・「すべて（N件）」ラッパーを廃止
// ・sidebar-topに総件数を表示
// ・デフォルト：第1カテゴリのみ展開、サブカテゴリ・アイテムは格納
// ・ホバー時プレビュー機能付き
// =====================================================
(function() {

  // ── サイドバーHTML生成（初回・データ変更時のみ呼ぶ）──
  function renderScriptSidebar() {
    const el = document.getElementById('scriptSidebarEl');
    if (!el) return;

    // ── アコーディオン展開状態を保存 ──
    const openSet = new Set();
    el.querySelectorAll('.sb-acc-body.open').forEach(function(body) {
      const block = body.parentElement;
      if (block && block.id) openSet.add(block.id);
    });

    if (!scripts || !Object.keys(scripts).length) {
      el.innerHTML = '<div style="padding:14px;color:var(--text3,#aaa);font-size:12px;">スクリプトがまだ登録されていません</div>';
      updateSidebarTopCount(0);
      return;
    }

    // 総件数を計算
    let totalCount = 0;
    Object.values(scripts).forEach(cat => {
      if (cat.sub) {
        Object.values(cat.sub).forEach(sub => { totalCount += (sub.list || []).length; });
      }
      totalCount += (cat.list || []).length;
    });
    updateSidebarTopCount(totalCount);

    let h = '';

    Object.entries(scripts).forEach(function([key, cat]) {
      const color    = cat.color || '#3742fa';
      const catAccId = 'sbAcc_' + key;
      h += `<div class="sb-acc-block" id="${catAccId}">`;
      h += `<div class="sb-acc-header sb-cat-header-inner"
              id="sbHdr_${catAccId}"
              onclick="toggleSbAcc('${catAccId}');sbFocusSet('sbHdr_${catAccId}')"
              tabindex="0" role="button">`;
      h += `<span class="sb-acc-arrow">▶</span>`;
      h += `<span class="sb-cat-dot" style="background:${color}"></span>`;
      // カテゴリの総件数（直下 + サブカテゴリ以下）
      const catCount = (cat.list || []).length
        + Object.values(cat.sub || {}).reduce(function(a, s){ return a + (s.list || []).length; }, 0);
      h += `<span class="sb-acc-label">${escHtml(cat.name || '')}<span class="sb-acc-count">（${catCount}件）</span></span>`;
      h += `</div>`;
      h += `<div class="sb-acc-body">`;  // デフォルト格納（後で状態復元）

      if (cat.sub) {
        Object.entries(cat.sub).forEach(function([subKey, sub]) {
          const subAccId = 'sbAcc_' + key + '_' + subKey;
          h += `<div class="sb-acc-block" id="${subAccId}">`;
          h += `<div class="sb-acc-header sb-sub-header"
                  id="sbHdr_${subAccId}"
                  onclick="toggleSbAcc('${subAccId}');sbFocusSet('sbHdr_${subAccId}')"
                  tabindex="0" role="button">`;
          h += `<span class="sb-acc-arrow">▶</span>`;
          // サブカテゴリの件数
          const subCount = (sub.list || []).length;
          h += `<span class="sb-acc-label">📁 ${escHtml(sub.name || '')}<span class="sb-acc-count">（${subCount}件）</span></span>`;
          h += `</div>`;
          h += `<div class="sb-acc-body">`;
          (sub.list || []).forEach(function(item, i) {
            const isActive    = currentType === key && currentSubKey === subKey && currentOpenIndex === i;
            const itemId      = 'sbItem_' + key + '_' + subKey + '_' + i;
            const previewText = getItemPreviewText(item);
            h += `<div class="sb-item sb-item-sub${isActive ? ' active' : ''}"
                    id="${itemId}"
                    onclick="selectUsageItem('${key}','${subKey}',${i});sbFocusSet('${itemId}')"
                    tabindex="0" role="button"
                    data-preview="${escAttr(previewText)}">`;
            h += `<span class="sb-item-title">${escHtml(item.title || '')}</span>`;
            h += `</div>`;
          });
          h += `</div></div>`;
        });
      }
      // 直下アイテム（サブカテゴリなし）は常に表示
      (cat.list || []).forEach(function(item, i) {
        const isActive    = currentType === key && !currentSubKey && currentOpenIndex === i;
        const itemId      = 'sbItem_' + key + '__' + i;
        const previewText = getItemPreviewText(item);
        h += `<div class="sb-item${isActive ? ' active' : ''}"
                id="${itemId}"
                onclick="selectUsageItem('${key}','',${i});sbFocusSet('${itemId}')"
                tabindex="0" role="button"
                data-preview="${escAttr(previewText)}">`;
        h += `<span class="sb-item-title">${escHtml(item.title || '')}</span>`;
        h += `</div>`;
      });
      h += `</div></div>`;
    });

    el.innerHTML = h;

    // ── アコーディオン展開状態を復元 ──
    openSet.forEach(function(blockId) {
      const block = document.getElementById(blockId);
      if (!block) return;
      const body  = block.querySelector(':scope > .sb-acc-body');
      const arrow = block.querySelector(':scope > .sb-acc-header .sb-acc-arrow');
      if (body)  body.classList.add('open');
      if (arrow) arrow.style.transform = 'rotate(90deg)';
    });

    scrollToActiveItem();
    if (typeof sbFocusRestore === 'function') sbFocusRestore();
  }

  // ── アクティブ状態だけ更新（アコーディオン開閉状態を一切変えない）──
  function updateSidebarActive() {
    const el = document.getElementById('scriptSidebarEl');
    if (!el) return;
    // 既存のすべての .sb-item から active を外す
    el.querySelectorAll('.sb-item').forEach(function(node) {
      node.classList.remove('active');
    });
    // 現在選択中のアイテムに active を付ける
    if (currentType === null || currentOpenIndex === null) return;
    const subPart  = currentSubKey || '';
    const activeEl = document.getElementById('sbItem_' + currentType + '_' + subPart + '_' + currentOpenIndex)
                  || document.getElementById('sbItem_' + currentType + '__' + currentOpenIndex);
    if (activeEl) {
      activeEl.classList.add('active');
    }
  }

  // ── プレビューテキスト生成（最初のステップ本文を使用）──
  function getItemPreviewText(item) {
    if (!item) return '';
    if (item.steps && item.steps.length > 0) {
      return (item.steps[0].text || '').slice(0, 120);
    }
    return (item.text || '').slice(0, 120);
  }

  // ── sidebar-top の件数更新 ──
  function updateSidebarTopCount(count) {
    const el = document.getElementById('scriptSidebarTop');
    if (el) el.textContent = '📂 コンテンツ一覧（' + count + '件）';
  }

  // ── アクティブアイテムへスクロール（フル再描画後に使用）──
  function scrollToActiveItem() {
    if (currentType === null || currentOpenIndex === null) return;
    const subPart  = currentSubKey || '';
    const activeEl = document.getElementById('sbItem_' + currentType + '_' + subPart + '_' + currentOpenIndex)
                  || document.getElementById('sbItem_' + currentType + '__' + currentOpenIndex);
    if (activeEl) {
      setTimeout(() => {
        const sidebarScroll = document.getElementById('scriptSidebarEl');
        if (!sidebarScroll) return;
        const parent = sidebarScroll.parentElement; // sidebar-scroll div
        if (!parent) return;
        const elTop = activeEl.getBoundingClientRect().top;
        const pTop  = parent.getBoundingClientRect().top;
        const offset = elTop - pTop + parent.scrollTop - 60;
        parent.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
      }, 80);
    }
  }

  // ── アコーディオン開閉 ──
  window.toggleSbAcc = function(id) {
    const block = document.getElementById(id);
    if (!block) return;
    const body  = block.querySelector(':scope > .sb-acc-body');
    const arrow = block.querySelector(':scope > .sb-acc-header .sb-acc-arrow');
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
  };

  // ── ホバープレビュー tooltip（マウスカーソルに追従）──
  const tooltip = document.getElementById('sbPreviewTooltip');
  let tooltipTimer = null;

  // mousemove でカーソル位置を常時追跡
  document.addEventListener('mousemove', function(e) {
    if (tooltip && tooltip.style.display === 'block') {
      const offset = 16;
      const tipW   = tooltip.offsetWidth  || 280;
      const tipH   = tooltip.offsetHeight || 60;
      const winW   = window.innerWidth;
      const winH   = window.innerHeight;
      // 右にはみ出す場合は左側に表示
      const left = (e.clientX + offset + tipW > winW)
                    ? e.clientX - tipW - offset
                    : e.clientX + offset;
      // 下にはみ出す場合は上にずらす
      const top  = (e.clientY + offset + tipH > winH)
                    ? e.clientY - tipH - offset
                    : e.clientY + offset;
      tooltip.style.left = left + 'px';
      tooltip.style.top  = top  + 'px';
    }
  });

  document.addEventListener('mouseover', function(e) {
    const item = e.target.closest('.sb-item[data-preview]');
    if (!item || !tooltip) return;
    const preview = item.getAttribute('data-preview');
    if (!preview) return;
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      tooltip.textContent = preview;
      tooltip.style.display = 'block';
    }, 260);
  });

  document.addEventListener('mouseout', function(e) {
    const item = e.target.closest('.sb-item[data-preview]');
    if (!item) return;
    clearTimeout(tooltipTimer);
    if (tooltip) tooltip.style.display = 'none';
  });

  // グローバル公開
  // renderScriptSidebar：初回描画・ホーム戻り時に使用
  // updateSidebarActive：スクリプト選択・ステップ移動時に使用（アコーディオン状態を保持）
  window.renderScriptSidebar  = renderScriptSidebar;
  window.updateSidebarActive  = updateSidebarActive;

  // 初回描画
  renderScriptSidebar();

})();

// =====================================================
// 「現在のステップへ」固定ボタン
// スクロール時に常に画面最下部へ表示し、
// スクリプトが未選択のときは非表示
// =====================================================
(function() {
  // index.html に埋め込まれている #scrollToCurrentBtn を使用
  // （存在しない場合は動的生成）
  var btn = document.getElementById('scrollToCurrentBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id        = 'scrollToCurrentBtn';
    btn.className = 'scroll-to-current-fab';
    document.body.appendChild(btn);
  }
  btn.className   = 'scroll-to-current-fab';
  btn.textContent = '▼ 現在のステップへ';
  btn.style.display = 'none';
  btn.onclick = function() {
    var cur    = document.getElementById('currentStepBubble');
    var mainEl = document.querySelector('main');
    if (!cur || !mainEl) return;
    var top = cur.getBoundingClientRect().top - mainEl.getBoundingClientRect().top + mainEl.scrollTop - 16;
    mainEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  // main のスクロールに応じて表示・非表示を切り替え
  var mainEl = document.querySelector('main');
  if (mainEl) {
    mainEl.addEventListener('scroll', function() {
      var cur = document.getElementById('currentStepBubble');
      if (!cur) { btn.style.display = 'none'; return; }
      var rect    = cur.getBoundingClientRect();
      var mainRect = mainEl.getBoundingClientRect();
      if (rect.top >= mainRect.top && rect.bottom <= mainRect.bottom) {
        btn.style.display = 'none';
      } else {
        btn.style.display = 'flex';
      }
    }, { passive: true });
  }

  // スクリプト描画後に表示状態をリセット（グローバルから呼べるように公開）
  window.resetScrollFab = function() {
    btn.style.display = 'none';
  };
})();
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,' ');
}

// =====================================================
// 別スクリプトジャンプ・スタイル追加
// =====================================================
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .step-choice-jump  { border-style: dashed !important; opacity: 0.85; }
    .step-bubble-num  { font-size:10px; font-weight:700; color:#888; margin-bottom:4px; }
    .step-bubble-text { white-space:pre-wrap; word-break:break-word; }
    .step-connector   { text-align:center; color:#c0c8e0; font-size:18px; line-height:1.2; margin:2px 0; user-select:none; }

    /* ウェルカムメッセージ */
    .home-welcome {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      padding:60px 20px; gap:12px; color:#aaa;
    }
    .home-welcome-icon  { font-size:40px; opacity:0.3; }
    .home-welcome-title { font-size:16px; font-weight:700; }
    .home-welcome-text  { font-size:13px; }
  `;
  document.head.appendChild(style);
})();

// =====================================================
// 初期化
// =====================================================
renderHome();
