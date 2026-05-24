// =============================================================================
// common-utils.js
// sidemenu.js + hearing.js + keyboard-nav.js の統合ファイル
// index.html / mail.html / screen.html / admin.html 共通で読み込む
//
// 変更点：
//   ・ダークモードのデフォルトを「オフ（ライトモード）」に変更。
//     OS設定（prefers-color-scheme: dark）には追従しない。
//     ユーザーが手動でトグルを切り替えた場合のみダークモードになる。
//   ・triggerImport / importJSON：File System Access API（Chrome/Edge）を使って
//     開いているファイルと同じフォルダのJSONを選択できるよう変更。
//     データ反映後はページリロードなしで即時更新する。
// =============================================================================

// =============================================================================
// ⓪ 統合 IndexedDB レイヤー
//    全データを screenFlowDB（v5）の appData ストアで管理する。
//    localStorage は darkMode と hearingState のみ継続使用。
// =============================================================================
var _APP_IDB_INST = null;
function _appIdbOpen() {
  if (_APP_IDB_INST) return Promise.resolve(_APP_IDB_INST);
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('screenFlowDB', 5);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('patterns'))      db.createObjectStore('patterns');
      if (!db.objectStoreNames.contains('imageLib'))       db.createObjectStore('imageLib');
      if (!db.objectStoreNames.contains('appData'))        db.createObjectStore('appData');
      if (!db.objectStoreNames.contains('sideMenuFiles')) db.createObjectStore('sideMenuFiles');
    };
    req.onsuccess = function(e) {
      _APP_IDB_INST = e.target.result;
      _APP_IDB_INST.onclose = function() { _APP_IDB_INST = null; };
      _APP_IDB_INST.onversionchange = function() { _APP_IDB_INST.close(); _APP_IDB_INST = null; };
      resolve(_APP_IDB_INST);
    };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

window.idbGetAppData = function(key) {
  return _appIdbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx  = db.transaction('appData', 'readonly');
      var req = tx.objectStore('appData').get(key);
      req.onsuccess = function(e) { resolve(e.target.result !== undefined ? e.target.result : null); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
};

window.idbSetAppData = function(key, value) {
  return _appIdbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx  = db.transaction('appData', 'readwrite');
      var req = tx.objectStore('appData').put(value, key);
      tx.oncomplete = function() { resolve(); };
      tx.onerror    = function(e) { reject(e.target.error); };
    });
  });
};

// 全ページ共通の in-memory キャッシュ
window._appCache = {
  scripts:          {},
  mailTemplates:    [],
  mailCatMeta:      { cats: [], subs: {} },
  updateHistory:    [],
  hearingQuestions: [],
  hearingPolicies:  [],
  hearingPatterns:  [],
  sideMenuData:     null
};

// localStorage からの一回限りのマイグレーション
function _migrateFromLocalStorage() {
  var map = {
    scripts:          'talkScripts',
    mailTemplates:    'mailTemplates',
    mailCatMeta:      'mailCatMeta',
    updateHistory:    'updateHistory',
    hearingQuestions: 'hearingQuestionsDef_v1',
    hearingPolicies:  'hearingPolicies_v1',
    sideMenuData:     'sideMenuData'
  };
  var writes = [];
  Object.keys(map).forEach(function(idbKey) {
    try {
      var raw = localStorage.getItem(map[idbKey]);
      if (raw) {
        var val = JSON.parse(raw);
        window._appCache[idbKey] = val;
        writes.push(window.idbSetAppData(idbKey, val));
        localStorage.removeItem(map[idbKey]);
      }
    } catch(e) {}
  });
  return Promise.all(writes);
}

/**
 * 全データを IDB から _appCache に読み込む。
 * 各ページの DOMContentLoaded で await / .then() して使う。
 */
window.initAppData = function() {
  // ── data.js の APP_STATIC_DATA を優先適用（sideMenu・hearing・履歴・固定テキスト）──
  var sd = window.APP_STATIC_DATA;
  if (sd) {
    if (sd.sideMenuData     != null) window._appCache.sideMenuData     = sd.sideMenuData;
    if (sd.hearingQuestions != null) window._appCache.hearingQuestions = sd.hearingQuestions;
    if (sd.hearingPolicies  != null) window._appCache.hearingPolicies  = sd.hearingPolicies;
    if (sd.hearingPatterns  != null) window._appCache.hearingPatterns  = sd.hearingPatterns;
    if (sd.updateHistory    != null) window._appCache.updateHistory    = sd.updateHistory;
    if (sd.fixedTexts       != null) window._appCache.fixedTexts       = sd.fixedTexts;
    if (sd.sideMenuFiles) {
      Object.keys(sd.sideMenuFiles).forEach(function(id) {
        var f = sd.sideMenuFiles[id];
        window.idbSaveMenuFile(Object.assign({}, f, { id: id }));
      });
    }
  }
  // common-utils.js 直書きの DEFAULT_UPDATE_HISTORY をキャッシュにセット
  // （APP_STATIC_DATA が存在する場合はそちらを優先）
  if (!window._appCache.updateHistory || !window._appCache.updateHistory.length) {
    if (window.DEFAULT_UPDATE_HISTORY && window.DEFAULT_UPDATE_HISTORY.length) {
      window._appCache.updateHistory = window.DEFAULT_UPDATE_HISTORY;
    }
  }
  if (!window._appCache.hearingQuestions || !window._appCache.hearingQuestions.length) {
    if (typeof HEARING_QUESTIONS_DEFAULT !== 'undefined' && HEARING_QUESTIONS_DEFAULT.length) {
      window._appCache.hearingQuestions = JSON.parse(JSON.stringify(HEARING_QUESTIONS_DEFAULT));
    }
  }

  // scripts / mailTemplates / mailCatMeta は IDB から読む
  var keys = ['scripts','mailTemplates','mailCatMeta'];
  return _appIdbOpen().then(function(db) {
    return new Promise(function(resolve) {
      var tx    = db.transaction('appData', 'readonly');
      var store = tx.objectStore('appData');
      var result = {};
      var left   = keys.length;
      keys.forEach(function(k) {
        var req = store.get(k);
        req.onsuccess = function(e) { result[k] = e.target.result; if (!--left) resolve(result); };
        req.onerror   = function()  { result[k] = null;            if (!--left) resolve(result); };
      });
    });
  }).then(function(result) {
    // data.js がない場合は IDB からヒアリング・サイドメニュー等も読む（後方互換）
    if (!sd) {
      var legacyKeys = ['updateHistory','hearingQuestions','hearingPolicies','hearingPatterns','sideMenuData','fixedTexts'];
      return _appIdbOpen().then(function(db) {
        return new Promise(function(resolve2) {
          var tx2    = db.transaction('appData', 'readonly');
          var store2 = tx2.objectStore('appData');
          var left2  = legacyKeys.length;
          legacyKeys.forEach(function(k) {
            var r = store2.get(k);
            r.onsuccess = function(e) { result[k] = e.target.result; if (!--left2) resolve2(result); };
            r.onerror   = function()  { result[k] = null;            if (!--left2) resolve2(result); };
          });
        });
      });
    }
    return result;
  }).then(function(result) {
    var needsMigration = keys.some(function(k) { return result[k] == null; });
    if (needsMigration) return _migrateFromLocalStorage().then(function() { return result; });
    return result;
  }).then(function(result) {
    keys.forEach(function(k) {
      if (result[k] != null) window._appCache[k] = result[k];
    });
    // data.js なし時の legacy keys も反映
    if (!sd) {
      ['updateHistory','hearingQuestions','hearingPolicies','hearingPatterns','sideMenuData','fixedTexts'].forEach(function(k) {
        if (result[k] != null) window._appCache[k] = result[k];
      });
    }
    return window._appCache;
  });
};

// =============================================================================
// ① ダークモード初期化（DOM構築前に実行してフラッシュ防止）
// 要件：「ダークモード：オフ」をデフォルトにする。
// 変更前：OS設定（prefers-color-scheme）を優先していた。
// 変更後：localStorage に明示的な設定がある場合のみ適用。
//         未設定（初回起動）の場合は必ずライトモード。
// =============================================================================
(function () {
  var s = localStorage.getItem('darkMode');
  if (s === '1') {
    // ユーザーが明示的にダークモードを有効にした場合のみ適用
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    // 未設定・オフ どちらもライトモード（OS設定には追従しない）
    document.documentElement.setAttribute('data-theme', 'light');
    if (!s) localStorage.setItem('darkMode', '0'); // 初回起動時に明示的にオフを保存
  }
})();

window.applyDarkMode = function (d) {
  if (d) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('darkMode', '1');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('darkMode', '0');
  }
  var c = document.getElementById('darkModeToggle');
  if (c) c.checked = d;
};

// =============================================================================
// ② 定型文クイックコピー
// =============================================================================
window.QUICK_ITEMS = [
  { text: '🟥HELP🟥',                          label: '🟥HELP🟥' },
  { text: '🟨保留中🟨',                         label: '🟨保留中🟨' },
  { text: '🟦後処理🟦',                         label: '🟦後処理🟦' },
  { text: '📱【検証機使用希望】📱（iPhone）',     label: 'iPhone' },
  { text: '📱【検証機使用希望】📱（Android）',    label: 'Android' },
  { text: '📱【検証機　返却します】📱',               label: '検証機返却' },
  { text: '☕10分休憩よろしいでしょうか☕',        label: '10分休憩' },
  { text: '🍱お昼休憩よろしいでしょうか🍱',       label: 'お昼休憩' },
  { text: '🐻離席してもよろしいでしょうか🐻',     label: 'お手洗い' },
];

window.renderQuickMenu = function () {
  var el = document.getElementById('quickMenu');
  if (!el) return;
  el.innerHTML = window.QUICK_ITEMS.map(function (item, i) {
    return '<div class="quick-menu-item" data-qi="' + i + '">' + item.label + '</div>';
  }).join('');
  el.addEventListener('click', function (ev) {
    var d = ev.target.closest('[data-qi]');
    if (!d) return;
    var item = window.QUICK_ITEMS[parseInt(d.dataset.qi)];
    if (item) window.copyText(item.text, item.label);
  });
};

window.toggleQuickMenu = function () {
  var menu = document.getElementById('quickMenu');
  if (menu) menu.classList.toggle('open');
};

window.copyText = function (text, label) {
  function doToast() {
    var menu = document.getElementById('quickMenu');
    if (menu) menu.classList.remove('open');
    var toast = document.getElementById('quickCopyToast');
    if (!toast) return;
    toast.textContent = '「' + label + '」をコピーしました';
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 2000);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(doToast).catch(function () { _fallbackCopy(text); doToast(); });
  } else {
    _fallbackCopy(text);
    doToast();
  }
};

function _fallbackCopy(text) {
  var el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

// =============================================================================
// ③ データ更新（JSON インポート）
//
// 要件：
//   ・「データ更新」ボタンで、開いているHTMLファイルと同じフォルダのJSONを選択できる。
//   ・File System Access API（Chrome/Edge）を使用。
//   ・データ反映後はページリロードなしで即時更新する。
//
// 処理フロー：
//   1. window.showOpenFilePicker が使える場合（Chrome/Edge）→ API で選択
//   2. それ以外（Safari 等）→ 従来の <input type="file"> でフォールバック
//   3. JSON を解析して localStorage に保存し、ページ内のデータを即時更新
// =============================================================================

/**
 * 「データ更新」ボタンのクリックハンドラ。
 * File System Access API が使える場合はそちらで、なければ <input> にフォールバック。
 */
window.triggerImport = async function () {
  // showDirectoryPicker（Chrome/Edge）でフォルダを選択しその中のJSONを読み込む
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      const jsonFiles = [];
      for await (const [name, handle] of dirHandle) {
        if (handle.kind === 'file' && name.endsWith('.json')) {
          jsonFiles.push({ name, handle });
        }
      }
      if (jsonFiles.length === 0) {
        alert('フォルダ内にJSONファイルが見つかりません。');
        return;
      }
      let targetFile;
      if (jsonFiles.length === 1) {
        targetFile = jsonFiles[0];
      } else {
        const names = jsonFiles.map((f, i) => (i + 1) + ': ' + f.name).join('\n');
        const idx = parseInt(prompt('読み込むJSONファイルを番号で選んでください:\n\n' + names)) - 1;
        if (isNaN(idx) || idx < 0 || idx >= jsonFiles.length) return;
        targetFile = jsonFiles[idx];
      }
      const file = await targetFile.handle.getFile();
      const text = await file.text();
      _processImportText(text, true);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  // showOpenFilePicker フォールバック
  if (window.showOpenFilePicker) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON ファイル', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      const file = await fileHandle.getFile();
      const text = await file.text();
      _processImportText(text, true);
    } catch (e) {
      if (e.name !== 'AbortError') {
        var el = document.getElementById('importFile');
        if (el) el.click();
      }
    }
  } else {
    var el = document.getElementById('importFile');
    if (el) el.click();
  }
};

/**
 * <input type="file"> 経由でファイルが選択された場合のハンドラ。
 * admin.html は独自のインポート処理を持つため、ここは index.html / mail.html / screen.html 向け。
 */
window.importJSON = function (input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    _processImportText(e.target.result, true); // ページリロードなし
    input.value = '';
  };
  reader.readAsText(file);
};

/**
 * JSON テキストを解析して localStorage に保存し、ページを即時更新する。
 * @param {string}  text       - JSON 文字列
 * @param {boolean} noReload   - true: ページリロードなし、false: リロードあり（旧挙動）
 */
// =============================================================================
// 差分結合ヘルパー（インポート時：上書きではなく ID ベースでマージ）
// =============================================================================

// スクリプトを結合する（カテゴリ key が同じなら上書き、なければ追加）
function _mergeScripts(current, incoming) {
  if (!incoming) return current;
  var merged = JSON.parse(JSON.stringify(current || {}));
  Object.keys(incoming).forEach(function(key) {
    merged[key] = incoming[key]; // カテゴリごと上書き（スクリプトは key 単位）
  });
  return merged;
}

// メールテンプレートを結合する（id が同じなら上書き、なければ追加）
function _mergeMail(current, incoming) {
  if (!Array.isArray(incoming)) return current;
  var merged = JSON.parse(JSON.stringify(Array.isArray(current) ? current : []));
  incoming.forEach(function(t) {
    var idx = merged.findIndex(function(x){ return x.id === t.id; });
    if (idx >= 0) merged[idx] = t; // 既存を上書き
    else merged.push(t);           // 差分を追加
  });
  return merged;
}

// 画面遷移データを結合する（パターン id が同じなら画面レベルでマージ）
function _mergeScreenData(current, incoming) {
  if (!Array.isArray(incoming)) return current;
  var merged = JSON.parse(JSON.stringify(Array.isArray(current) ? current : []));
  incoming.forEach(function(inPat) {
    var exPat = merged.find(function(p){ return p.id === inPat.id; });
    if (!exPat) {
      merged.push(inPat); // 新パターンを追加
    } else {
      // 既存パターン内で画面を結合
      exPat.name = inPat.name; // パターン名は最新を使用
      (inPat.screens || []).forEach(function(inScr) {
        var exScr = exPat.screens.find(function(s){ return s.id === inScr.id; });
        if (exScr) Object.assign(exScr, inScr); // 既存画面を上書き
        else exPat.screens.push(inScr);          // 差分画面を追加
      });
    }
  });
  return merged;
}

/**
 * imageLib 配列を IDB の imageLib ストアに直接保存する。
 * idbSetScreenData に依存しないため、どのページからでも呼び出せる。
 */
function _saveImageLibToIdb(libItems) {
  if (!Array.isArray(libItems) || !libItems.length) return;
  _appIdbOpen().then(function(db) {
    var tx = db.transaction('imageLib', 'readwrite');
    var store = tx.objectStore('imageLib');
    libItems.forEach(function(item) {
      if (item && item.id) {
        store.put(item, item.id);
      }
    });
    tx.oncomplete = function() {
      try { var bc = new BroadcastChannel('tool_data_update'); bc.postMessage({type:'imageLibUpdated',ts:Date.now()}); bc.close(); } catch(e) {}
    };
  }).catch(function(e){ console.warn('_saveImageLibToIdb failed:', e); });
}

/**
 * 全タブに全データ更新を通知する。
 */
function _broadcastAllDataUpdated() {
  try {
    var bc = new BroadcastChannel('tool_data_update');
    bc.postMessage({ type: 'allDataUpdated', ts: Date.now() });
    bc.close();
  } catch(e) {}
}

function _processImportText(text, noReload) {
  try {
    _importProgressShow('JSONを解析中…', 'ファイルを確認しています', 20);
    setTimeout(function () {
      try {
        var raw = JSON.parse(text);
        var imported = { scripts: false, mail: false, screen: false, history: false };

        // ===== version:3/2/1（統合JSON：スクリプト＋メール＋画面遷移＋更新履歴）=====
        if (raw && (raw.version === 3 || raw.version === 2 || raw.version === 1) &&
            'talkScripts' in raw && 'mailTemplates' in raw) {
          _importProgressHide();
          if (!confirm('インポートしたデータを現在のデータに差分結合します（重複は上書き、新規は追加）。よろしいですか？')) return;
          _importProgressShow('データを結合中…', 'スクリプト・メール', 50);
          setTimeout(function () {
            try {
              // スクリプト：カテゴリ key 単位で結合
              var curScripts = window._appCache.scripts || {};
              var mergedScripts = _mergeScripts(curScripts, raw.talkScripts);
              window._appCache.scripts = mergedScripts;
              window.idbSetAppData('scripts', mergedScripts);
              try { var _bcs2=new BroadcastChannel('tool_data_update'); _bcs2.postMessage({type:'scriptsUpdated',ts:Date.now()}); _bcs2.close(); } catch(e) {}
              // メール：id 単位で結合
              var curMail = window._appCache.mailTemplates || [];
              var mergedMail = _mergeMail(curMail, raw.mailTemplates);
              window._appCache.mailTemplates = mergedMail;
              window.idbSetAppData('mailTemplates', mergedMail);
              imported.scripts = true;
              imported.mail    = true;
              raw = Object.assign({}, raw, { talkScripts: mergedScripts, mailTemplates: mergedMail });

              // 画面遷移 — IDB書き込み完了後にbroadcast（screen.htmlへ即時反映）
              var _screenSaveP = Promise.resolve();
              if ((raw.version === 2 || raw.version === 3) && Array.isArray(raw.screenData)) {
                var curScreenData = null;
                try {
                  if (typeof patterns !== 'undefined' && Array.isArray(patterns) && patterns.length) {
                    curScreenData = patterns;
                  } else {
                    var csd = localStorage.getItem('screenFlowIndex'); if(csd) curScreenData = JSON.parse(csd);
                  }
                } catch(e) {}
                var mergedScreen = _mergeScreenData(curScreenData, raw.screenData);
                imported.screen = true;
                imported.screenData = mergedScreen;
                raw = Object.assign({}, raw, { screenData: mergedScreen });
                _screenSaveP = idbSetScreenData(mergedScreen)
                  .then(function () {
                    try { var _bc=new BroadcastChannel('tool_data_update'); _bc.postMessage({type:'screenDataUpdated',ts:Date.now()}); _bc.close(); } catch(e2) {}
                  })
                  .catch(function (err) {
                    console.error('[import] idbSetScreenData failed:', err);
                    try { var _bc=new BroadcastChannel('tool_data_update'); _bc.postMessage({type:'screenDataUpdated',ts:Date.now()}); _bc.close(); } catch(e2) {}
                  });
              }

              // v3: imageLib を IDB に直接保存
              if (raw.version === 3 && Array.isArray(raw.imageLib) && raw.imageLib.length) {
                _saveImageLibToIdb(raw.imageLib);
              }
              window._pendingImgLib = null;

              // 添付ファイル
              if (Array.isArray(raw.sideMenuFiles) && raw.sideMenuFiles.length && window.idbSaveMenuFile) {
                Promise.all(raw.sideMenuFiles.map(function(f){ return window.idbSaveMenuFile(f); })).catch(function(){});
              }

              // 更新履歴
              if (Array.isArray(raw.updateHistory) && raw.updateHistory.length > 0) {
                _mergeHistory(raw.updateHistory);
                imported.history = true;
              }

              // ヒアリング
              if (Array.isArray(raw.hearingQuestions)) { window._appCache.hearingQuestions = raw.hearingQuestions; window.idbSetAppData('hearingQuestions', raw.hearingQuestions); }
              if (Array.isArray(raw.hearingPolicies))  { window._appCache.hearingPolicies  = raw.hearingPolicies;  window.idbSetAppData('hearingPolicies',  raw.hearingPolicies); }
              if (Array.isArray(raw.hearingPatterns))  { window._appCache.hearingPatterns  = raw.hearingPatterns;  window.idbSetAppData('hearingPatterns',  raw.hearingPatterns); }

              // スクリプト・メールを他タブへ通知
              try { var _bca=new BroadcastChannel('tool_data_update'); _bca.postMessage({type:'mailDataUpdated',ts:Date.now()}); _bca.close(); } catch(e) {}

              _importProgressUpdate('データを反映中…', '', 80);
              _screenSaveP.then(function () {
                setTimeout(function () {
                  try {
                    if (noReload) { _applyImportedDataToPage(imported, raw); } else { location.reload(); }
                  } catch(e) { console.error('applyImport error:', e); }
                  _importProgressHide();
                }, 0);
              });
            } catch(err2) { _importProgressHide(); alert('結合処理に失敗しました: ' + err2.message); }
          }, 0);
        }
        // ===== メールテンプレート単体配列 =====
        else if (Array.isArray(raw)) {
          _importProgressHide();
          if (!confirm('現在のデータをインポートしたデータで上書きします。よろしいですか？')) return;
          _importProgressShow('データを保存中…', 'メールテンプレート', 60);
          setTimeout(function () {
            try {
              window._appCache.mailTemplates = raw;
              window.idbSetAppData('mailTemplates', raw);
              imported.mail = true;
              _broadcastAllDataUpdated();
              _importProgressUpdate('データを反映中…', '', 85);
              setTimeout(function () {
                try {
                  if (noReload) { _applyImportedDataToPage(imported, raw); } else { location.reload(); }
                } catch(e) {}
                _importProgressHide();
              }, 0);
            } catch(err2) { _importProgressHide(); alert('保存に失敗しました: ' + err2.message); }
          }, 0);
        }
        // ===== トークスクリプト単体オブジェクト =====
        else {
          var keys = Object.keys(raw);
          var valid = keys.length > 0 && keys.every(function (k) {
            return raw[k] && raw[k].name && (Array.isArray(raw[k].list) || raw[k].sub);
          });
          if (valid) {
            _importProgressHide();
            if (!confirm('現在のデータをインポートしたデータで上書きします。よろしいですか？')) return;
            _importProgressShow('データを保存中…', 'スクリプト', 60);
            setTimeout(function () {
              try {
                window._appCache.scripts = raw;
                window.idbSetAppData('scripts', raw).then(function() {
                  imported.scripts = true;
                  _broadcastAllDataUpdated();
                  _importProgressUpdate('データを反映中…', '', 85);
                  setTimeout(function () {
                    try {
                      if (noReload) { _applyImportedDataToPage(imported, raw); } else { location.reload(); }
                    } catch(e) { console.error('applyImport error:', e); }
                    _importProgressHide();
                  }, 0);
                }).catch(function(e) { _importProgressHide(); alert('IDB保存に失敗しました: ' + e.message); });
              } catch(err2) { _importProgressHide(); alert('保存に失敗しました: ' + err2.message); }
            }, 0);
          } else {
            _importProgressHide();
            alert('ファイルの形式が正しくありません。');
            return;
          }
        }
      } catch (err) {
        _importProgressHide();
        alert('読み込みに失敗しました: ' + err.message);
      }
    }, 0);
  } catch (err) {
    _importProgressHide();
    alert('読み込みに失敗しました: ' + err.message);
  }
}

/**
 * インポートしたデータをページ内変数に即時反映する（リロードなし）。
 * 各ページの描画関数（renderScriptSidebar, init 等）を呼び出す。
 */
function _applyImportedDataToPage(imported, raw) {
  var msgs = [];
  // deepcopy: structuredClone（Chrome 98+）が使えれば高速、なければ JSON roundtrip
  var _clone = typeof structuredClone === 'function'
    ? structuredClone
    : function (v) { return JSON.parse(JSON.stringify(v)); };

  // スクリプトデータの反映（index.html の scripts 変数を再ロード）
  if (imported.scripts && typeof window.reloadScripts === 'function') {
    window.reloadScripts();
    msgs.push('スクリプト');
  } else if (imported.scripts) {
    try {
      var saved = JSON.stringify(window._appCache.scripts || null);
      if (saved && typeof scripts !== 'undefined') {
        var newData = JSON.parse(saved);
        Object.keys(scripts).forEach(function(k){ delete scripts[k]; });
        Object.assign(scripts, newData);
        if (typeof renderScriptSidebar === 'function') renderScriptSidebar();
        if (typeof renderHome === 'function') renderHome();
        msgs.push('スクリプト');
      }
    } catch(e) {}
  }

  // メールテンプレートの反映（mail.html の templates 変数を再ロード）
  if (imported.mail) {
    try {
      var saved = JSON.stringify(window._appCache.mailTemplates || null);
      if (saved && typeof templates !== 'undefined') {
        templates.length = 0;
        _clone(JSON.parse(saved)).forEach(function(t){ templates.push(t); });
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof showList === 'function') showList('__all__');
        msgs.push('メール');
      }
      // BroadcastChannel でほかのタブにも通知する
      try {
        var bc = new BroadcastChannel('tool_data_update');
        bc.postMessage({ type: 'mailDataUpdated', ts: Date.now() });
        bc.close();
      } catch(e) {}
    } catch(e) {}
  }

  // 画面遷移データの反映
  // admin.html では applyImport() が処理するためここでは screenPatterns を更新するのみ
  // screen.html では patterns 変数に直接反映する
  if (imported.screen && imported.screenData) {
    try {
      // screen.html 用：patterns 変数に直接反映（localStorage 経由しない）
      if (typeof patterns !== 'undefined') {
        patterns.length = 0;
        imported.screenData.forEach(function(p){ patterns.push(p); });
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof renderFlow === 'function') renderFlow();
        msgs.push('画面遷移');
      }
      // IDB にも保存（screen.html / admin.html 共通・画像含む完全データ）
      if (typeof idbSetScreenData === 'function') {
        var _idbP = idbSetScreenData(imported.screenData);
        // 保存完了後に admin.html へ反映通知
        var _afterSave = function() {
          try {
            var _bcast = new BroadcastChannel('tool_data_update');
            _bcast.postMessage({ type: 'screenDataUpdated', ts: Date.now() });
            _bcast.close();
          } catch(e) {}
          try { localStorage.setItem('_screenSaveTs', Date.now().toString()); } catch(e) {}
        };
        if (_idbP && typeof _idbP.then === 'function') { _idbP.then(_afterSave); }
        else { _afterSave(); }
      }
    } catch(e) {}
  }

  // 更新履歴の反映
  if (imported.history && typeof window.renderHistory === 'function') {
    window.renderHistory();
  }

  // 反映完了トースト表示
  var msg = msgs.length > 0
    ? '✅ ' + msgs.join('・') + 'データを更新しました'
    : '✅ データを更新しました';

  // 簡易トースト（各ページ固有の toast 関数があればそちらを使う）
  if (typeof toast === 'function') {
    toast(msg);
  } else {
    // 共通のシンプルなトースト
    var el = document.getElementById('_importToast');
    if (!el) {
      el = document.createElement('div');
      el.id = '_importToast';
      el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2f3542;color:white;padding:10px 18px;border-radius:8px;font-size:12px;font-weight:600;pointer-events:none;z-index:9999;opacity:0;transition:opacity .25s;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(function(){ el.style.opacity = '0'; }, 2800);
  }
}

// 更新履歴をマージ保存（既存にないIDのみ追加し、日付降順ソート）
function _mergeHistory(incoming) {
  try {
    var cur = window._appCache.updateHistory || [];
    var inMap = {};
    incoming.forEach(function (h) { inMap[h.id] = h; });
    var kept   = cur.filter(function (h) { return !inMap[h.id]; });
    var merged = incoming.concat(kept);
    merged.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    window._appCache.updateHistory = merged;
    window.idbSetAppData('updateHistory', merged);
  } catch (e) {}
}

// =============================================================================
// ④ タブ管理・サイドメニュー
// =============================================================================
var _namedTabs = {};
window.openNamedTab = function (url, name) {
  var tab = _namedTabs[name];
  if (tab && !tab.closed) { tab.focus(); }
  else { _namedTabs[name] = window.open(url, name); }
};

window.toggleSideMenu = function () {
  var m = document.getElementById('sideMenu');
  if (!m) return;
  m.classList.toggle('open');
};

window.toggleAccordion = function (id) {
  var body = document.getElementById(id);
  if (!body) return;
  var header = body.previousElementSibling;
  var isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (header) {
    header.classList.toggle('open', !isOpen);
    var arrow = header.querySelector('.arrow');
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
  }
};

window.toggleSubAccordion = function (id) {
  var body = document.getElementById(id);
  if (!body) return;
  var header = body.previousElementSibling;
  var isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (header) {
    header.classList.toggle('open', !isOpen);
    var sarrow = header.querySelector('.sub-arrow');
    if (sarrow) sarrow.style.transform = isOpen ? '' : 'rotate(90deg)';
  }
};

// 管理画面：パスワード認証付きオープン
var ADMIN_PW = 'admin1234';
var _adminUnlocked = false;
window.openAdminWithAuth = function () {
  if (_adminUnlocked) {
    sessionStorage.setItem('adminAuth', '1');
    window.openNamedTab('admin.html', 'adminTab');
    return;
  }
  var pw = prompt('管理画面のパスワードを入力してください');
  if (pw === null) return;
  if (pw === ADMIN_PW) {
    _adminUnlocked = true;
    sessionStorage.setItem('adminAuth', '1');
    window.openNamedTab('admin.html', 'adminTab');
  } else {
    alert('パスワードが違います');
  }
};

// =============================================================================
// 添付ファイル機能 — sideMenuFiles IDB 操作
// =============================================================================

/** ファイルを IDB sideMenuFiles に保存 */
window.idbSaveMenuFile = function(fileObj) {
  return _appIdbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx  = db.transaction('sideMenuFiles', 'readwrite');
      tx.objectStore('sideMenuFiles').put(fileObj, fileObj.id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror    = function(e) { reject(e.target.error); };
    });
  });
};

/** IDB から全ファイルを取得 */
window.idbGetAllMenuFiles = function() {
  return _appIdbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx  = db.transaction('sideMenuFiles', 'readonly');
      var req = tx.objectStore('sideMenuFiles').getAll();
      req.onsuccess = function(e) { resolve(e.target.result || []); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
};

/** IDB から特定ファイルを取得 */
window.idbGetMenuFile = function(id) {
  return _appIdbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx  = db.transaction('sideMenuFiles', 'readonly');
      var req = tx.objectStore('sideMenuFiles').get(id);
      req.onsuccess = function(e) { resolve(e.target.result || null); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
};

/** IDB から特定ファイルを削除 */
window.idbDeleteMenuFile = function(id) {
  return _appIdbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx  = db.transaction('sideMenuFiles', 'readwrite');
      tx.objectStore('sideMenuFiles').delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror    = function(e) { reject(e.target.error); };
    });
  });
};

// =============================================================================
// 添付ファイル機能 — CSS インジェクション
// =============================================================================
(function() {
  var css =
    /* ドロップゾーン */
    '.sm-files-dz{border:2px dashed var(--border,#dfe4ea);border-radius:8px;padding:12px;margin:8px 10px 4px;text-align:center;font-size:11px;color:var(--text3,#999);cursor:pointer;transition:border-color .15s,background .15s;}' +
    '.sm-files-dz:hover,.sm-files-dz.drag-over{border-color:var(--accent,#3742fa);background:var(--accent-lt,#eef0ff);color:var(--accent,#3742fa);}' +
    '.sm-files-dz-icon{font-size:20px;display:block;margin-bottom:3px;}' +
    /* ファイルリスト */
    '.sm-files-list{list-style:none;margin:0;padding:0 0 6px;}' +
    '.sm-file-item{display:flex;align-items:center;gap:5px;padding:5px 10px 5px 12px;border-bottom:1px solid var(--border2,#f0f0f0);font-size:12px;}' +
    '.sm-file-item:last-child{border-bottom:none;}' +
    '.sm-file-icon{font-size:15px;flex-shrink:0;}' +
    '.sm-file-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--accent,#3742fa);cursor:pointer;font-weight:600;}' +
    '.sm-file-name:hover{text-decoration:underline;}' +
    '.sm-file-size{font-size:10px;color:var(--text3,#999);flex-shrink:0;}' +
    '.sm-file-del{flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--text3,#999);font-size:13px;padding:2px 4px;border-radius:4px;}' +
    '.sm-file-del:hover{color:#e74c3c;}' +
    /* ファイルアクションモーダル */
    '#smFileModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9900;align-items:center;justify-content:center;}' +
    '#smFileModal.open{display:flex;}' +
    '.sm-file-modal-box{background:var(--surface,#fff);border-radius:14px;padding:26px 26px 20px;min-width:260px;max-width:320px;width:88%;box-shadow:0 12px 40px rgba(0,0,0,.25);}' +
    '.sm-file-modal-title{font-size:13px;font-weight:700;color:var(--text,#2f3542);margin:0 0 5px;word-break:break-all;line-height:1.5;}' +
    '.sm-file-modal-sub{font-size:11px;color:var(--text3,#999);margin:0 0 16px;}' +
    '.sm-file-modal-btns{display:flex;flex-direction:column;gap:7px;}' +
    '.sm-file-modal-btn{padding:9px 0;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s;font-family:inherit;}' +
    '.sm-file-modal-btn:hover{opacity:.85;}' +
    '.sm-file-modal-btn.view{background:var(--accent,#3742fa);color:#fff;}' +
    '.sm-file-modal-btn.dl{background:var(--surface2,#f1f2f6);color:var(--text,#2f3542);border:1px solid var(--border,#dfe4ea);}' +
    '.sm-file-modal-btn.cancel{background:none;color:var(--text3,#999);font-weight:400;font-size:12px;padding:5px 0;}' +
    /* PDF ビューアモーダル */
    '#smPdfViewer{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9910;flex-direction:column;}' +
    '#smPdfViewer.open{display:flex;}' +
    '.sm-pdf-toolbar{height:46px;background:var(--header-bg,#2f3542);color:#fff;display:flex;align-items:center;padding:0 14px;gap:10px;flex-shrink:0;}' +
    '.sm-pdf-toolbar-title{flex:1;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.sm-pdf-toolbar-btn{background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer;font-weight:600;font-family:inherit;}' +
    '.sm-pdf-toolbar-btn:hover{background:rgba(255,255,255,.28);}' +
    '#smPdfFrame{flex:1;width:100%;border:none;background:#fff;}';
  var el = document.createElement('style');
  el.id = 'smFilesStyle';
  el.textContent = css;
  (document.head || document.documentElement).appendChild(el);
})();

// =============================================================================
// 添付ファイル機能 — モーダル DOM 注入
// =============================================================================
(function() {
  function _inject() {
    if (!document.getElementById('smFileModal')) {
      var m = document.createElement('div');
      m.id = 'smFileModal';
      m.innerHTML =
        '<div class="sm-file-modal-box">' +
          '<p class="sm-file-modal-title" id="smFileModalTitle"></p>' +
          '<p class="sm-file-modal-sub"  id="smFileModalSub"></p>' +
          '<div class="sm-file-modal-btns">' +
            '<button class="sm-file-modal-btn view"   id="smFileModalViewBtn" onclick="window._smViewPdf()" style="display:none">🌐 ブラウザで閲覧</button>' +
            '<button class="sm-file-modal-btn dl"     id="smFileModalDlBtn"   onclick="window._smDownloadFile()">⬇ ダウンロード</button>' +
            '<button class="sm-file-modal-btn cancel"                         onclick="window._smCloseFileModal()">キャンセル</button>' +
          '</div>' +
        '</div>';
      m.addEventListener('click', function(e){ if(e.target===m) window._smCloseFileModal(); });
      document.body.appendChild(m);
    }
    if (!document.getElementById('smPdfViewer')) {
      var v = document.createElement('div');
      v.id = 'smPdfViewer';
      v.innerHTML =
        '<div class="sm-pdf-toolbar">' +
          '<span class="sm-pdf-toolbar-title" id="smPdfViewerTitle"></span>' +
          '<button class="sm-pdf-toolbar-btn" onclick="window._smDownloadFile()">⬇ DL</button>' +
          '<button class="sm-pdf-toolbar-btn" onclick="window._smClosePdfViewer()">✕ 閉じる</button>' +
        '</div>' +
        '<iframe id="smPdfFrame" src="about:blank"></iframe>';
      document.body.appendChild(v);
    }
  }
  if (document.body) { _inject(); }
  else { document.addEventListener('DOMContentLoaded', _inject); }
})();

// =============================================================================
// 添付ファイル機能 — ファイルアクション
// =============================================================================

/** MIMEタイプ → アイコン */
window._smMimeIcon = function(mime) {
  if (!mime) return '📄';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('zip') || mime.includes('compressed')) return '📦';
  return '📄';
};

/** ファイルサイズ表示 */
window._smFormatSize = function(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
};

/** 現在操作中のファイル */
window._smCurrentFile = null;

/** ファイル名クリック → アクション選択モーダル */
window._smFileAction = function(id) {
  if (!window.idbGetMenuFile) { alert('ファイル機能が初期化されていません'); return; }
  window.idbGetMenuFile(id).then(function(f) {
    if (!f) { alert('ファイルが見つかりません（ID: ' + id + '）'); return; }
    window._smCurrentFile = f;
    var isPdf = f.mimeType === 'application/pdf';
    var isImg = (f.mimeType || '').startsWith('image/');

    // PDF → 別タブで開く
    if (isPdf) {
      var tab = window.open('', '_blank');
      if (tab) {
        tab.document.write(
          '<html><head><title>' + f.name.replace(/</g,'&lt;') + '</title></head>' +
          '<body style="margin:0;padding:0;">' +
          '<embed src="' + f.dataUrl + '" type="application/pdf" width="100%" height="100%" style="position:fixed;inset:0;width:100%;height:100%;">' +
          '</body></html>'
        );
        tab.document.close();
      }
      return;
    }

    // 画像 → 別タブで開く
    if (isImg) {
      var imgTab = window.open('', '_blank');
      if (imgTab) {
        imgTab.document.write(
          '<html><head><title>' + f.name.replace(/</g,'&lt;') + '</title></head>' +
          '<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;">' +
          '<img src="' + f.dataUrl + '" style="max-width:100%;max-height:100vh;object-fit:contain;">' +
          '</body></html>'
        );
        imgTab.document.close();
      }
      return;
    }

    // その他 → 即ダウンロード
    window._smDownloadFile();
  }).catch(function(e) {
    alert('ファイルの読み込みに失敗しました: ' + (e && e.message || e));
  });
};

window._smCloseFileModal = function() {
  var m = document.getElementById('smFileModal');
  if (m) m.classList.remove('open');
};

window._smViewPdf = function() {
  window._smCloseFileModal();
  var f = window._smCurrentFile; if (!f) return;
  var viewer = document.getElementById('smPdfViewer');
  var frame  = document.getElementById('smPdfFrame');
  var title  = document.getElementById('smPdfViewerTitle');
  if (!viewer || !frame) return;
  if (title) title.textContent = f.name;
  frame.src = f.dataUrl;
  viewer.classList.add('open');
};

window._smClosePdfViewer = function() {
  var v = document.getElementById('smPdfViewer');
  var f = document.getElementById('smPdfFrame');
  if (v) v.classList.remove('open');
  if (f) f.src = 'about:blank';
};

window._smDownloadFile = function() {
  window._smCloseFileModal();
  var f = window._smCurrentFile; if (!f) return;
  var a = document.createElement('a');
  a.href     = f.dataUrl;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ document.body.removeChild(a); }, 100);
};

/** マニュアルPDFをブラウザで閲覧（別タブで開く） */
window._smOpenManualPdf = function(event, url) {
  event.preventDefault();
  event.stopPropagation();
  if (!url) return;
  // file:// URL はブラウザのセキュリティ制限により window.open で開く
  var tab = window.open(url, '_blank');
  if (!tab) {
    // ポップアップブロック時はアンカーリンクで代替
    var a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); }, 100);
  }
};

window._smDeleteFile = function(id) {
  if (!confirm('このファイルを削除しますか？')) return;
  window.idbDeleteMenuFile(id).then(function() {
    window._renderSideMenuFileList();
  });
};

// =============================================================================
// 添付ファイル機能 — サイドメニューファイルリスト描画
// =============================================================================
window._renderSideMenuFileList = function() {
  var listEl = document.getElementById('smFilesList'); if (!listEl) return;
  window.idbGetAllMenuFiles().then(function(files) {
    if (!files || !files.length) {
      listEl.innerHTML = '<li style="padding:7px 14px;font-size:11px;color:var(--text3,#999)">ファイルがありません</li>';
      return;
    }
    files.sort(function(a,b){ return (b.addedAt||'').localeCompare(a.addedAt||''); });
    var _e = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    listEl.innerHTML = files.map(function(f) {
      return '<li class="sm-file-item">' +
        '<span class="sm-file-icon">' + window._smMimeIcon(f.mimeType) + '</span>' +
        '<span class="sm-file-name" onclick="window._smFileAction(\'' + _e(f.id) + '\')" title="' + _e(f.name) + '">' + _e(f.name) + '</span>' +
        '<span class="sm-file-size">' + window._smFormatSize(f.size) + '</span>' +
        '<button class="sm-file-del" onclick="window._smDeleteFile(\'' + _e(f.id) + '\')" title="削除">🗑</button>' +
      '</li>';
    }).join('');
  }).catch(function() {
    listEl.innerHTML = '<li style="padding:7px 14px;font-size:11px;color:var(--text3,#999)">読み込みエラー</li>';
  });
};

// =============================================================================
// 添付ファイル機能 — D&D ハンドラ
// =============================================================================
window._smHandleDrop = function(event) {
  event.preventDefault();
  event.stopPropagation();
  var files = event.dataTransfer && event.dataTransfer.files;
  if (!files || !files.length) return;
  Array.prototype.forEach.call(files, _smSaveFile);
};

window._smHandleFileInput = function(input) {
  var files = input.files; if (!files || !files.length) return;
  Array.prototype.forEach.call(files, _smSaveFile);
  input.value = '';
};

function _smSaveFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var fileObj = {
      id:       'smf_' + Date.now() + '_' + Math.random().toString(36).substr(2,6),
      name:     file.name,
      mimeType: file.type || _smGuessMime(file.name),
      size:     file.size,
      dataUrl:  e.target.result,
      addedAt:  new Date().toISOString()
    };
    window.idbSaveMenuFile(fileObj);
  };
  reader.readAsDataURL(file);
}

function _smGuessMime(name) {
  var ext = (name||'').split('.').pop().toLowerCase();
  return {pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',doc:'application/msword',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',ppt:'application/vnd.ms-powerpoint',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',zip:'application/zip',txt:'text/plain'}[ext] || 'application/octet-stream';
}

// =============================================================================
// ⑤ サイドメニュー HTML 構築・更新履歴描画
// =============================================================================
window.renderHistory = function () {
  var panel = document.getElementById('historyPanel');
  if (!panel) return;
  var arr = window._appCache.updateHistory || [];
  if (!arr || arr.length === 0) {
    arr = window.DEFAULT_UPDATE_HISTORY || [];
  }
  if (!arr || arr.length === 0) {
    arr = [{ id: 'h_default_1', content: '初版作成', author: '-', approver: '-', date: '2026/03/08' }];
  }
  var td = function (v) {
    return '<td style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;color:var(--text,#2f3542);word-break:break-all;">' + (v || '-') + '</td>';
  };
  var rows = arr.map(function (e) { return '<tr>' + td(e.content) + td(e.author) + td(e.approver) + td(e.date) + '</tr>'; }).join('');
  panel.innerHTML =
    '<div style="padding:10px 12px 14px;"><div style="overflow-x:auto;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:280px;">' +
    '<colgroup><col><col style="width:52px"><col style="width:52px"><col style="width:82px"></colgroup>' +
    '<thead><tr style="background:var(--surface2,#f8f9fa)">' +
    '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">更新内容</th>' +
    '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">更新者</th>' +
    '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">承認者</th>' +
    '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">更新日</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div>';
};

// =============================================================================
// サイドメニュー JSON キー
// =============================================================================
var SIDE_MENU_DATA_KEY = 'sideMenuData';

// @@UPDATE_HISTORY_START@@
window.DEFAULT_UPDATE_HISTORY = [
  { id: 'h_default_1', content: '初版作成', author: '-', approver: '-', date: '2026/03/08' }
];
// @@UPDATE_HISTORY_END@@

// @@SIDE_MENU_DATA_START@@
// デフォルトのサイドメニューデータ（オリジナル全URL入り）
window.DEFAULT_SIDE_MENU_DATA = [
  {
    "id": "linkTools",
    "label": "🔧 ツール",
    "type": "links",
    "items": [
      {
        "name": "Genesys",
        "url": "https://login.mypurecloud.jp/#/authenticate-adv/org/tci-gp1",
        "manualUrl": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【NGH】Genesys Cloud利用マニュアル_20251029.pdf"
      },
      {
        "name": "CRM",
        "url": "https://ctssvr501.cloud.contact-link.jp/cts_nhk_net/login/index.php",
        "manualUrl": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【trans-CRM】利用マニュアル_20260410.pdf"
      },
      {
        "name": "LINE WORKS",
        "url": "https://talk.worksmobile.com/#/",
        "manualUrl": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【LINE WORKS】インストールと活用方法.pdf"
      },
      {
        "name": "対話要約AI",
        "url": "https://tci-dcc-support-summaryai02.spiral-site.com/summary_nhk",
        "manualUrl": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【NGH】対話要約AIマニュアル_20250819.pdf"
      },
      {
        "name": "SpeechVisualizer",
        "url": "http://tci-ami-web16/Speechvisualizer/"
      },
      {
        "name": "新Transpeech",
        "url": "https://transpeech.jp/login",
        "manualUrl": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【新transpeech】マニュアル_20260317_軽量版.pdf"
      }
    ]
  },
  {
    "id": "linkDocs",
    "label": "📄 資料",
    "type": "links_with_sub",
    "subSections": [
      {
        "id": "subDocs_Work",
        "label": "NHKONE 関連資料",
        "items": [
          {
            "name": "コールセンターについて",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】コールセンターについて_20260410.pdf"
          },
          {
            "name": "サービス概要・世帯での利用",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】サービス概要・世帯での利用_20250908.pdf"
          },
          {
            "name": "学校での利用",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】学校での利用_20260102.pdf"
          },
          {
            "name": "事業での利用",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】事業での利用_20250904.pdf"
          },
          {
            "name": "ユーザーお困りポイント",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【世帯アカウント】ユーザーお困りポイント_20250908.pdf"
          },
          {
            "name": "アカウント登録導線説明資料",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NHK ONE】アカウント登録導線説明資料.pdf"
          },
          {
            "name": "受信料アカウント全国説明会資料",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【確定版】20251110_受信料アカウント全国説明会資料_1117修正.pdf"
          },
          {
            "name": "J→S転送対応フロー",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/S⇔J転送/J→S転送受け/【NGH版】J→S転送受けフロー_20260520.pdf"
          },
          {
            "name": "S→J転送対応フロー",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/S⇔J転送/S→J転送/【NGH用】S→J転送対応フロー_20260520.pdf"
          },
          {
            "name": "PW+ログインID忘れのユーザー対応",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/NHK ONE 関連資料/【NGH版】PW+ログインID忘れのユーザー対応.pdf"
          }
        ]
      },
      {
        "id": "subDocs_Quality",
        "label": "応対品質",
        "items": [
          {
            "name": "クレーム対応のポイント",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/応対品質/クレーム対応のポイント.pdf"
          },
          {
            "name": "わかりやすい伝え方・話し方（ロジカルシンキング）",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/応対品質/わかりやすい伝え方・話し方（ロジカルシンキング）.pdf"
          },
          {
            "name": "高齢者対応",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/応対品質/高齢者対応.pdf"
          }
        ]
      },
      {
        "id": "subDocs_Training",
        "label": "研修",
        "items": [
          {
            "name": "【NGH】事業所紹介",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/【NGH】事業所紹介_20260401.pdf"
          },
          {
            "name": "【NGH】CMマニュアル",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/【NGH】CMマニュアル_20260430.pdf"
          },
          {
            "name": "AmiVoice マニュアル",
            "url": "file://tohoku/share/拠点/仙台青葉/00_事業所/NGH/業務資料/マニュアル関連/各種ツール/【transpeech】AmiVoice Operator Agent利用マニュアル.pdf"
          }
        ]
      }
    ]
  },
  {
    "id": "linkSites",
    "label": "🌐 関連サイト",
    "type": "links",
    "items": [
      {
        "name": "NHK HP",
        "url": "https://www.nhk.or.jp/"
      },
      {
        "name": "NHKONEインフォメーション",
        "url": "https://www.nhk.or.jp/nhkone/"
      },
      {
        "name": "ヘルプセンター",
        "url": "https://www.nhk.or.jp/nhkone/help/"
      },
      {
        "name": "NHK for school",
        "url": "https://www.nhk.or.jp/school/"
      },
      {
        "name": "全国のNHK放送局",
        "url": "https://www.nhk.or.jp/info/pr/nationwide-nhk/"
      },
      {
        "name": "各放送局営業窓口一覧",
        "url": "https://www.nhk-cs.jp/jushinryo/menjo/window.html"
      },
      {
        "name": "学校コード検索HP",
        "url": "https://edu-data.jp/"
      },
      {
        "name": "郵便局HP",
        "url": "https://www.post.japanpost.jp/zipcode/index.html"
      },
      {
        "name": "e-typing",
        "url": "https://www.e-typing.ne.jp/roma/check/"
      }
    ]
  }
];
// @@SIDE_MENU_DATA_END@@

window.loadSideMenuData = function() {
  return window._appCache.sideMenuData || null;
};

window.saveSideMenuData = function(data) {
  window._appCache.sideMenuData = data;
  window.idbSetAppData('sideMenuData', data);
};

// 初回起動時の localStorage 書き込みは廃止。
// サイドメニューデータの正は common-utils.js の DEFAULT_SIDE_MENU_DATA（jsファイル直書き）。
// admin.html の「📝 jsファイルに書き込む」で更新する。

function _phonRow(letter, r1, r2) {
  var cell = function (v) {
    return '<td style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;color:var(--text,#2f3542)">' + v + '</td>';
  };
  return '<tr>' + cell(letter) + cell(r1) + cell(r2) + '</tr>';
}

function _buildSideMenuHTML(isDark) {
  // localStorage は使用しない。jsファイルの DEFAULT_SIDE_MENU_DATA を正として参照する。
  var sections = window.DEFAULT_SIDE_MENU_DATA;
  var html = '';

  // ダークモードトグル（固定）
  html += '<div class="side-section"><div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;">' +
    '<span style="font-size:13px;font-weight:600;">🌙 ダークモード</span>' +
    '<label class="dark-toggle-sw"><input type="checkbox" id="darkModeToggle"' + (isDark ? ' checked' : '') + ' onchange="window.applyDarkMode(this.checked)"><span class="dark-toggle-sl"></span></label>' +
    '</div></div>';

  // JSON 定義セクション
  sections.forEach(function(sec, si) {
    var secId = sec.id || ('smSec_' + si);

    if (sec.type === 'links_with_sub') {
      // サブアコーディオン付きセクション
      html += '<div class="side-section"><div class="side-section-header" onclick="toggleAccordion(\'' + secId + '\')">' +
        sec.label + ' <span class="arrow" style="display:inline-block;transition:transform .2s">▶</span></div>' +
        '<ul class="accordion-body" id="' + secId + '">';
      (sec.subSections || []).forEach(function(sub, sj) {
        var subId = sub.id || (secId + '_sub' + sj);
        var lis = (sub.items || []).map(function(it) {
          if (it.disabled) {
            return '<li><span class="sm-link-disabled">' + (it.name || '') + '<em class="sm-disabled-badge">無効</em></span></li>';
          }
          if (it.fileId) {
            return '<li><a href="javascript:void(0)" onclick="window._smFileAction(\'' + it.fileId.replace(/'/g,"\\'") + '\')" style="display:flex;align-items:center;gap:4px;">📎 ' + it.name + '</a></li>';
          }
          return '<li><a href="' + (it.url || '#') + '" target="_blank">' + it.name + '</a></li>';
        }).join('');
        html += '<li class="sub-acc-item">' +
          '<div class="sub-acc-header" onclick="toggleSubAccordion(\'' + subId + '\')">' +
          '<span class="sub-arrow" style="display:inline-block;transition:transform .2s">▶</span>' + sub.label +
          '</div><ul class="sub-acc-body" id="' + subId + '">' + lis + '</ul></li>';
      });
      html += '</ul></div>';

    } else if (sec.type === 'phonetic') {
      // フォネティックコード（固定テーブル）
      html += '<div class="side-section"><div class="side-section-header" onclick="toggleAccordion(\'' + secId + '\')">' +
        sec.label + ' <span class="arrow" style="display:inline-block;transition:transform .2s">▶</span></div>' +
        '<div class="accordion-body" id="' + secId + '" style="padding:10px 12px 14px;"><div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:220px;">' +
        '<colgroup><col><col style="width:100px"><col style="width:100px"></colgroup>' +
        '<thead><tr style="background:var(--surface2,#f8f9fa)">' +
        '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">アルファベット</th>' +
        '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">読み方①</th>' +
        '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">読み方②</th>' +
        '</tr></thead><tbody>' +
        _phonRow('A','アメリカ','アップル') + _phonRow('B','ブラジル','ブック') +
        _phonRow('C','チャイナ','キャット') + _phonRow('D','デンマーク','ドクター') +
        _phonRow('E','エジプト','イングリッシュ') + _phonRow('F','フランス','') +
        _phonRow('G','グーグル','') + _phonRow('H','ホンコン','') +
        _phonRow('I','イタリア','') + _phonRow('J','ジャパン','') +
        _phonRow('K','キング','') + _phonRow('L','ロンドン','') +
        _phonRow('M','メキシコ','') + _phonRow('N','ニューヨーク','') +
        _phonRow('O','大阪','') + _phonRow('P','パリ','') +
        _phonRow('Q','クイーン','') + _phonRow('R','ローマ','') +
        _phonRow('S','スター','') + _phonRow('T','東京','') +
        _phonRow('U','USA','') + _phonRow('V','ヴィクトリー','') +
        _phonRow('W','ワールド','') + _phonRow('X','エックス線','') +
        _phonRow('Y','ヤフー','') + _phonRow('Z','ゼブラ','') +
        _phonRow('-','ハイフン','') + _phonRow('_','アンダーバー','') +
        '</tbody></table></div></div></div>';

    } else {
      // 通常リンクセクション
      var lis = (sec.items || []).map(function(it) {
        if (it.disabled) {
          return '<li><span class="sm-link-disabled">' + (it.name || '') + '<em class="sm-disabled-badge">無効</em></span></li>';
        }
        if (it.fileId) {
          return '<li><a href="javascript:void(0)" onclick="window._smFileAction(\'' + it.fileId.replace(/'/g,"\\'") + '\')" style="display:flex;align-items:center;gap:4px;">📎 ' + it.name + '</a></li>';
        }
        var manualBtn = (it.manualUrl) ?
          '<a href="' + (it.manualUrl||'')+'" target="_blank" title="マニュアルをブラウザで閲覧" style="border:1px solid var(--accent,#4361ee);border-radius:4px;color:var(--accent,#4361ee);font-size:10px;padding:1px 6px;line-height:1.5;flex-shrink:0;white-space:nowrap;text-decoration:none;background:none;">📕 マニュアル</a>　' : '';
        return '<li style="display:flex;align-items:center;gap:4px;">' + '<a href="' + (it.url || '#') + '" target="_blank" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + it.name + '</a>' + manualBtn + '</li>';
      }).join('');
      html += '<div class="side-section"><div class="side-section-header" onclick="toggleAccordion(\'' + secId + '\')">' +
        sec.label + ' <span class="arrow" style="display:inline-block;transition:transform .2s">▶</span></div>' +
        '<ul class="accordion-body" id="' + secId + '">' + lis + '</ul></div>';
    }
  });

  // フォネティックコード（固定）
  html += '<div class="side-section"><div class="side-section-header" onclick="toggleAccordion(\'noticePanel\')">📖フォネティックコード <span class="arrow" style="display:inline-block;transition:transform .2s">▶</span></div>' +
    '<div class="accordion-body" id="noticePanel" style="padding:10px 12px 14px;"><div style="overflow-x:auto;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:220px;">' +
    '<colgroup><col><col style="width:100px"><col style="width:100px"></colgroup>' +
    '<thead><tr style="background:var(--surface2,#f8f9fa)">' +
    '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">アルファベット</th>' +
    '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">読み方①</th>' +
    '<th style="padding:6px 8px;border:1px solid var(--border,#e8eaed);text-align:center;font-weight:700;color:var(--text2,#555)">読み方②</th>' +
    '</tr></thead><tbody>' +
    _phonRow('A','アメリカ','アップル') + _phonRow('B','ブラジル','ブック') +
    _phonRow('C','チャイナ','キャット') + _phonRow('D','デンマーク','ドクター') +
    _phonRow('E','エジプト','イングリッシュ') + _phonRow('F','フランス','') +
    _phonRow('G','グーグル','') + _phonRow('H','ホンコン','') +
    _phonRow('I','イタリア','') + _phonRow('J','ジャパン','') +
    _phonRow('K','キング','') + _phonRow('L','ロンドン','') +
    _phonRow('M','メキシコ','') + _phonRow('N','ニューヨーク','') +
    _phonRow('O','大阪','') + _phonRow('P','パリ','') +
    _phonRow('Q','クイーン','') + _phonRow('R','ローマ','') +
    _phonRow('S','スター','') + _phonRow('T','東京','') +
    _phonRow('U','USA','') + _phonRow('V','ヴィクトリー','') +
    _phonRow('W','ワールド','') + _phonRow('X','エックス線','') +
    _phonRow('Y','ヤフー','') + _phonRow('Z','ゼブラ','') +
    _phonRow('-','ハイフン','') + _phonRow('_','アンダーバー','') +
    '</tbody></table></div></div></div>';

  // 更新履歴（固定）
  html += '<div class="side-section" id="historySideSection">' +
    '<div class="side-section-header" onclick="toggleAccordion(\'historyPanel\')">📝 更新履歴 <span class="arrow" style="display:inline-block;transition:transform .2s">▶</span></div>' +
    '<div class="accordion-body" id="historyPanel" style="padding:0;"></div></div>';

  return html;
}

// =============================================================================
// ⑥ ヒアリングチェックシート（hearing.js 全機能）
// ※ 変更なし（省略せず全文維持）
// =============================================================================

var HEARING_KEY = 'hearingState_v4';

var DEFAULT_STATE = {
  usage: null, isMigration: null, oldPlusId: null, migMailConfirmed: null, migMailUsable: null,
  isAccountPerson: null, sAccountCreated: null, authCodeIssue: null, authCodeResult: null,
  jAccountCreated: null, jAuthCodeIssue: null, sjLinked: null, sjLoginlessResult: null,
  devices: {}, mailDomain: '', mailDomainManual: '', cbMistake: false, cbReject: false, cbSpam: false,
  memo: ''
};

var DEVICE_LIST = ['iPhone', 'Android', 'タブレット', 'PC', 'TV'];
var DEVICE_DETAIL_OPTIONS = {
  'iPhone':    ['Web', 'アプリ', 'Web,アプリ両方'],
  'Android':   ['Web', 'アプリ', 'Web,アプリ両方'],
  'タブレット': ['Web', 'アプリ', 'Web,アプリ両方'],
  'PC':        ['Windows', 'Mac', 'ChromeBook'],
  'TV':        []
};

function loadHearingState() {
  try {
    var saved = localStorage.getItem(HEARING_KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      var devices = {};
      DEVICE_LIST.forEach(function (d) {
        devices[d] = (parsed.devices && parsed.devices[d]) ? parsed.devices[d] : { selected: false, detail: '' };
      });
      parsed.devices = devices;
      return Object.assign({}, DEFAULT_STATE, parsed);
    }
  } catch (e) {}
  var state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  DEVICE_LIST.forEach(function (d) { state.devices[d] = { selected: false, detail: '' }; });
  return state;
}

function saveHearingState() {
  try { localStorage.setItem(HEARING_KEY, JSON.stringify(hearingState)); } catch (e) {}
}

var hearingState = loadHearingState();
var hearingPanelOpen = false;

window.toggleHearingPanel = function () {
  hearingPanelOpen = !hearingPanelOpen;
  var panel = document.getElementById('hearingPanel');
  var btn   = document.getElementById('hearingToggleBtn');
  if (panel) panel.classList.toggle('open', hearingPanelOpen);
  if (btn)   btn.textContent = hearingPanelOpen ? '＞' : '＜';
};

window.resetHearing = function () {
  hearingState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  DEVICE_LIST.forEach(function (d) { hearingState.devices[d] = { selected: false, detail: '' }; });
  saveHearingState();
  renderHearing();
};

window.setHearing = function (field, value) {
  // リセット定義をデータ駆動定義から取得（カスタム質問対応）
  var qs = _hrGetQuestions();
  var resets = {};
  qs.forEach(function(q) { if (q.resets && q.resets.length) resets[q.field] = q.resets; });
  if (resets[field]) resets[field].forEach(function (f) { hearingState[f] = null; });
  hearingState[field] = value;
  saveHearingState();
  renderHearing();
};

window.toggleHearingDevice = function (device) {
  var d = hearingState.devices[device];
  d.selected = !d.selected;
  if (!d.selected) d.detail = '';
  saveHearingState();
  renderHearing();
};

window.setHearingDeviceDetail = function (device, value) {
  hearingState.devices[device].detail = value;
  saveHearingState();
  renderHearing();
};

window.onHearingDomainChange = function () {
  var sel = document.getElementById('hearingDomainSel');
  if (!sel) return;
  hearingState.mailDomain = sel.value;
  var mw = document.getElementById('hearingDomainManualWrap');
  if (mw) mw.style.display = sel.value === '__manual__' ? 'block' : 'none';
  saveHearingState();
  renderHearingSummary();
};

window.onHearingDomainManualInput = function () {
  var inp = document.getElementById('hearingDomainManual');
  if (!inp) return;
  hearingState.mailDomainManual = inp.value;
  saveHearingState();
  renderHearingSummary();
};

window.onHearingCheckChange = function (field) {
  var el = document.getElementById('hearingCb_' + field);
  if (!el) return;
  hearingState[field] = el.checked;
  saveHearingState();
  renderHearingSummary();
};

function _boolBtns(field, value, labelTrue, labelFalse) {
  var t = '<button class="hr-btn' + (value === true  ? ' active' : '') + '" onclick="setHearing(\'' + field + '\',true)">'  + labelTrue  + '</button>';
  var f = '<button class="hr-btn' + (value === false ? ' active' : '') + '" onclick="setHearing(\'' + field + '\',false)">' + labelFalse + '</button>';
  return t + f;
}

function _strBtns(field, value, items) {
  return items.map(function (item) {
    var active = value === item.v ? ' active' : '';
    return '<button class="hr-btn' + active + '" onclick="setHearing(\'' + field + '\',\'' + item.v + '\')">' + item.l + '</button>';
  }).join('');
}

function _hrRow(label, content, extraClass) {
  return '<div class="hr-row' + (extraClass ? ' ' + extraClass : '') + '">' +
         '<div class="hr-label">■' + label + '</div>' +
         '<div class="hr-btns">' + content + '</div>' +
         '</div>';
}

function _hEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function calcPolicies(s) {
  var policies = [];
  if (s.usage === '世帯' && s.isMigration === true && s.oldPlusId === false) policies.push('移行対象者ではありませんので新規登録を案内してください');
  if (s.usage === '世帯' && s.isMigration === true && s.oldPlusId === true && s.migMailConfirmed === false) policies.push('ガイダンス2で確認を依頼してください');
  if (s.usage === '世帯' && s.isMigration === true && s.oldPlusId === true && s.migMailConfirmed === true && s.migMailUsable === false) policies.push('ガイダンス2で連携解除を依頼してください');
  if (s.sjLinked === '再連携必要') policies.push('ガイダンス2で連携解除後の再登録となることを案内してください');
  if (s.sAccountCreated === false && s.authCodeResult === '認証コード受信') policies.push('PW変更後、ログインしてご利用いただくようご案内ください。');
  if (s.sjLinked === 'ログイン不可' && s.sjLoginlessResult === '認証コード受信') policies.push('PW変更後、ログインしてご利用いただくようご案内ください。');
  if (s.usage === '世帯' && s.isMigration === true && s.sjLinked === 'ログイン不可' && s.sjLoginlessResult === '認証コード未着(任意情報なし)') policies.push('入力されたメールアドレスでアカウントが作成されていない可能性が高いです。\n移行手続きを進めていただくようご案内ください');
  if (s.usage === '世帯' && s.isMigration === true && s.sjLinked === 'ログイン不可' && s.sjLoginlessResult === '認証コード未着(任意情報あり)') policies.push('このメールアドレスでSアカは作成済みです\n任意情報を失念してしまうとアカウントの復旧ができません\nガイダンス2で連携解除後の新規登録となることをご案内ください。');
  if (s.usage === '世帯' && s.isMigration === false && s.sjLinked === 'ログイン不可' && s.sjLoginlessResult === '認証コード未着(任意情報なし)') policies.push('入力されたメールアドレスでアカウントが作成されていない可能性が高いです。\n新規登録の手続きを進めていただくようご案内ください');
  if (s.usage === '世帯' && s.isMigration === false && s.sjLinked === 'ログイン不可' && s.sjLoginlessResult === '認証コード未着(任意情報あり)') policies.push('このメールアドレスでSアカは作成済みです\n任意情報を失念してしまうとアカウントの復旧ができません\nガイダンス2で連携解除後の新規登録となることをご案内ください。');
  if (s.authCodeIssue === 'Jアカ重複メール受信') policies.push('ガイダンス2で受信料アカウントの登録状況確認を依頼してください。');
  if (s.authCodeIssue === '移行エラーメール受信' && s.authCodeResult === '認証コード未着(任意情報なし)') policies.push('入力されたアドレスが登録表記との不一致等の理由で移行対象のアドレスではない可能性があるため、ガイダンス2で確認を依頼してください。');
  if (s.authCodeIssue === '移行エラーメール受信' && s.authCodeResult === '認証コード未着(任意情報あり)') policies.push('任意情報を失念してしまうとアカウントの復旧ができないため、ガイダンス2で連携解除後の新規登録となることをご案内ください。');
  if (s.authCodeIssue === '新規エラーメール受信' && s.authCodeResult === '認証コード未着(任意情報なし)') policies.push('入力されたアドレスが移行の対象である可能性があるため、移行手続きをお試しいただくようご案内ください。');
  if (s.usage === '世帯' && s.isMigration === false && s.authCodeIssue === '新規エラーメール受信' && s.authCodeResult === '認証コード未着(任意情報あり)') policies.push('このメールアドレスでSアカは作成済みです\n任意情報を失念してしまうとアカウントの復旧ができません\n作成済みのSアカは3か月未ログインで自動削除となり、そこから1か月経過後より同アドレスの利用が可能となります\n別メアドでのSアカ新規に不承の場合は、当窓口でのSアカ削除を承ってください。');
  if (s.usage === '世帯' && s.isMigration === true && s.oldPlusId === true && s.migMailConfirmed === true && s.migMailUsable === true && s.sAccountCreated === false && s.authCodeIssue === '新規エラーメール受信' && s.authCodeResult === '認証コード未着(任意情報あり)') policies.push('このメールアドレスでSアカは作成済みです\n任意情報を失念してしまうとアカウントの復旧ができません\nガイダンス2で連携解除後の新規登録となることをご案内ください。');
  if (s.authCodeIssue === 'メール受信なし' && s.cbMistake === true && s.cbReject === true && s.cbSpam === true) policies.push('クライアントエスカレーションの案件です');
  // admin.html で登録されたカスタム対応方針を追記
  if (typeof _hrCustomPolicies === 'function') {
    _hrCustomPolicies(s).forEach(function(p){ if(p)policies.push(p); });
  }
  return policies;
}

// ===================================================================
// ヒアリング質問定義（データ駆動式）
// localStorage に 'hearingQuestionsDef_v1' があればそちらを使用する。
// デフォルト項目数 = 0（admin.htmlで追加管理）
// ===================================================================
// @@HEARING_QUESTIONS_START@@
var HEARING_QUESTIONS_DEFAULT = [
  {
    "id": "q_usage",
    "label": "用途",
    "field": "usage",
    "type": "str",
    "options": [
      {
        "l": "世帯",
        "v": "世帯"
      },
      {
        "l": "学校",
        "v": "学校"
      },
      {
        "l": "事業",
        "v": "事業"
      }
    ],
    "showIf": [],
    "builtin": true,
    "enabled": true,
    "resets": [
      "isMigration",
      "oldPlusId",
      "migMailConfirmed",
      "migMailUsable",
      "isAccountPerson",
      "sAccountCreated",
      "authCodeIssue",
      "authCodeResult",
      "jAccountCreated",
      "jAuthCodeIssue",
      "sjLinked",
      "sjLoginlessResult"
    ]
  },
  {
    "id": "q_isMigration",
    "label": "移行対象者ですか？",
    "field": "isMigration",
    "type": "bool",
    "trueLabel": "はい",
    "falseLabel": "いいえ",
    "showIf": [
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": [
      "oldPlusId",
      "migMailConfirmed",
      "migMailUsable",
      "sAccountCreated",
      "authCodeIssue",
      "authCodeResult",
      "jAccountCreated",
      "jAuthCodeIssue",
      "sjLinked",
      "sjLoginlessResult"
    ]
  },
  {
    "id": "q_oldPlusId",
    "label": "2025/8/15時点で旧プラスのIDは発行されていましたか？",
    "field": "oldPlusId",
    "type": "bool",
    "trueLabel": "はい(わからない)",
    "falseLabel": "いいえ",
    "showIf": [
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "isMigration",
          "op": "true"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": [
      "migMailConfirmed",
      "migMailUsable"
    ]
  },
  {
    "id": "q_migMailConfirmed",
    "label": "7月/9月/10月に送信している移行案内メールは確認されていますか？",
    "field": "migMailConfirmed",
    "type": "bool",
    "trueLabel": "はい",
    "falseLabel": "いいえ(わからない)",
    "showIf": [
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "isMigration",
          "op": "true"
        },
        {
          "field": "oldPlusId",
          "op": "true"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": [
      "migMailUsable"
    ]
  },
  {
    "id": "q_migMailUsable",
    "label": "移行案内メールを受信しているメールアドレスは現在も使用可能ですか？",
    "field": "migMailUsable",
    "type": "bool",
    "trueLabel": "はい",
    "falseLabel": "いいえ",
    "showIf": [
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "isMigration",
          "op": "true"
        },
        {
          "field": "oldPlusId",
          "op": "true"
        },
        {
          "field": "migMailConfirmed",
          "op": "true"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": []
  },
  {
    "id": "q_isAccountPerson",
    "label": "入電者はアカウント担当者ですか？",
    "field": "isAccountPerson",
    "type": "bool",
    "trueLabel": "はい",
    "falseLabel": "いいえ",
    "showIf": [
      [
        {
          "field": "usage",
          "op": "in",
          "value": "学校,事業"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": [
      "sAccountCreated",
      "authCodeIssue",
      "authCodeResult",
      "jAccountCreated",
      "jAuthCodeIssue",
      "sjLinked",
      "sjLoginlessResult"
    ]
  },
  {
    "id": "q_sAccountCreated",
    "label": "Sアカは作成済みですか？",
    "field": "sAccountCreated",
    "type": "bool",
    "trueLabel": "はい",
    "falseLabel": "いいえ",
    "showIf": [
      [
        {
          "field": "usage",
          "op": "notnull"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": [
      "authCodeIssue",
      "authCodeResult",
      "jAccountCreated",
      "jAuthCodeIssue",
      "sjLinked",
      "sjLoginlessResult"
    ]
  },
  {
    "id": "q_authCodeIssue",
    "label": "認証コード未着ですか？（Sアカ）",
    "field": "authCodeIssue",
    "type": "str",
    "options": [
      {
        "l": "移行エラーメール受信",
        "v": "移行エラーメール受信"
      },
      {
        "l": "新規エラーメール受信",
        "v": "新規エラーメール受信"
      },
      {
        "l": "メール受信なし",
        "v": "メール受信なし"
      }
    ],
    "showIf": [
      [
        {
          "field": "sAccountCreated",
          "op": "false"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": [
      "authCodeResult"
    ]
  },
  {
    "id": "q_authCodeResult",
    "label": "PWをお忘れの方はこちらから認証コードが届くか（Sアカ）",
    "field": "authCodeResult",
    "type": "str",
    "options": [
      {
        "l": "認証コード受信",
        "v": "認証コード受信"
      },
      {
        "l": "認証コード未着(任意情報なし)",
        "v": "認証コード未着(任意情報なし)"
      },
      {
        "l": "認証コード未着(任意情報あり)",
        "v": "認証コード未着(任意情報あり)"
      }
    ],
    "showIf": [
      [
        {
          "field": "authCodeIssue",
          "op": "in",
          "value": "移行エラーメール受信,新規エラーメール受信"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": []
  },
  {
    "id": "q_sjLinked",
    "label": "S-J連携済みですか？",
    "field": "sjLinked",
    "type": "str",
    "options": [
      {
        "l": "連携済み",
        "v": "連携済み"
      },
      {
        "l": "未連携",
        "v": "未連携"
      },
      {
        "l": "未確認（再連携が必要です）",
        "v": "再連携必要"
      },
      {
        "l": "ログイン不可",
        "v": "ログイン不可"
      }
    ],
    "showIf": [
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "sAccountCreated",
          "op": "true"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": [
      "jAccountCreated",
      "jAuthCodeIssue",
      "sjLoginlessResult"
    ]
  },
  {
    "id": "q_sjLoginlessResult",
    "label": "PWをお忘れの方はこちらから認証コードが届くか（ログイン不可）",
    "field": "sjLoginlessResult",
    "type": "str",
    "options": [
      {
        "l": "認証コード受信",
        "v": "認証コード受信"
      },
      {
        "l": "認証コード未着(任意情報なし)",
        "v": "認証コード未着(任意情報なし)"
      },
      {
        "l": "認証コード未着(任意情報あり)",
        "v": "認証コード未着(任意情報あり)"
      }
    ],
    "showIf": [
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "sAccountCreated",
          "op": "true"
        },
        {
          "field": "sjLinked",
          "op": "eq",
          "value": "ログイン不可"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": []
  },
  {
    "id": "q_jAccountCreated",
    "label": "Jアカは作成済みですか？",
    "field": "jAccountCreated",
    "type": "bool",
    "trueLabel": "はい",
    "falseLabel": "いいえ",
    "showIf": [
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "sAccountCreated",
          "op": "true"
        },
        {
          "field": "isMigration",
          "op": "true"
        },
        {
          "field": "oldPlusId",
          "op": "true"
        },
        {
          "field": "migMailConfirmed",
          "op": "true"
        },
        {
          "field": "migMailUsable",
          "op": "true"
        },
        {
          "field": "sjLinked",
          "op": "in",
          "value": "未連携,再連携必要"
        }
      ],
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "sAccountCreated",
          "op": "true"
        },
        {
          "field": "isMigration",
          "op": "neq",
          "value": "true"
        },
        {
          "field": "sjLinked",
          "op": "in",
          "value": "未連携,再連携必要"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": [
      "jAuthCodeIssue"
    ]
  },
  {
    "id": "q_jAuthCodeIssue",
    "label": "確認コード未着ですか？（Jアカ）",
    "field": "jAuthCodeIssue",
    "type": "str",
    "options": [
      {
        "l": "Jアカ重複メール受信",
        "v": "Jアカ重複メール受信"
      },
      {
        "l": "メール受信なし",
        "v": "メール受信なし"
      }
    ],
    "showIf": [
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "sAccountCreated",
          "op": "true"
        },
        {
          "field": "isMigration",
          "op": "true"
        },
        {
          "field": "oldPlusId",
          "op": "true"
        },
        {
          "field": "migMailConfirmed",
          "op": "true"
        },
        {
          "field": "migMailUsable",
          "op": "true"
        },
        {
          "field": "sjLinked",
          "op": "in",
          "value": "未連携,再連携必要"
        },
        {
          "field": "jAccountCreated",
          "op": "false"
        }
      ],
      [
        {
          "field": "usage",
          "op": "eq",
          "value": "世帯"
        },
        {
          "field": "sAccountCreated",
          "op": "true"
        },
        {
          "field": "isMigration",
          "op": "neq",
          "value": "true"
        },
        {
          "field": "sjLinked",
          "op": "in",
          "value": "未連携,再連携必要"
        },
        {
          "field": "jAccountCreated",
          "op": "false"
        }
      ]
    ],
    "builtin": true,
    "enabled": true,
    "resets": []
  }
];
// @@HEARING_QUESTIONS_END@@

var HEARING_POLICIES_DEFAULT  = [];
// localStorage キーは後方互換のため定義のみ残す（読み書きには使用しない）
var HEARING_QUESTIONS_KEY = 'hearingQuestionsDef_v1';

function _hrQuestionsLoad() {
  return JSON.parse(JSON.stringify(window._appCache.hearingQuestions || []));
}
function _hrQuestionsSave(list) {
  window._appCache.hearingQuestions = JSON.parse(JSON.stringify(list || []));
  window.idbSetAppData('hearingQuestions', window._appCache.hearingQuestions);
}
function _hrGetQuestions() {
  var cached = _hrQuestionsLoad();
  if (cached && cached.length) return cached;
  return JSON.parse(JSON.stringify(HEARING_QUESTIONS_DEFAULT));
}

function _hrEvalShowIf(showIf, s) {
  if (!showIf || !showIf.length) return true;
  return showIf.some(function(group) {
    return group.every(function(cond) {
      var val = (cond.field in s) ? s[cond.field] : undefined;
      switch(cond.op) {
        case 'eq':      return val === cond.value;
        case 'neq':     return val !== cond.value;
        case 'true':    return val === true;
        case 'false':   return val === false;
        case 'notnull': return val !== null && val !== undefined;
        case 'in':      return (cond.value||'').split(',').indexOf(String(val)) >= 0;
        default:        return true;
      }
    });
  });
}

// ===================================================================
// ヒアリング状態のタブ間リアルタイム同期（localStorage storage イベント）
// ===================================================================
window.addEventListener('storage', function(e) {
  if (e.key !== HEARING_KEY) return;
  try {
    var updated = e.newValue ? JSON.parse(e.newValue) : null;
    if (!updated) return;
    // devices は DEVICE_LIST ベースで補完
    var devices = {};
    DEVICE_LIST.forEach(function(d) {
      devices[d] = (updated.devices && updated.devices[d])
        ? updated.devices[d] : { selected: false, detail: '' };
    });
    updated.devices = devices;
    hearingState = Object.assign({}, DEFAULT_STATE, updated);
    if (typeof renderHearing === 'function') renderHearing();
  } catch(ex) {}
});

function renderHearing() {
  var el = document.getElementById('hearingContent');
  if (!el) return;
  var s = hearingState;
  var qs = _hrGetQuestions();

  // ── パターンによる表示/非表示オーバーライドを評価 ──
  var patterns = window._appCache.hearingPatterns || [];
  var patternOverrides = {}; // questionId -> true(show)/false(hide)
  patterns.forEach(function(pat) {
    if (!pat.conditions || !pat.conditions.length) return;
    var allMet = pat.conditions.every(function(cond) {
      var sv = s[cond.field];
      if (typeof sv === 'boolean') return (cond.value === 'true') === sv;
      return String(sv === null || sv === undefined ? '' : sv) === String(cond.value || '');
    });
    if (allMet) {
      (pat.targets || []).forEach(function(t) { patternOverrides[t.id] = t.show; });
    }
  });

  var h = '';
  qs.forEach(function(q) {
    if (!q.enabled) return;
    // パターンが優先、なければ showIf を評価
    if (q.id in patternOverrides) {
      if (!patternOverrides[q.id]) return;
    } else if (!_hrEvalShowIf(q.showIf, s)) {
      return;
    }
    if (q.type === 'bool') {
      h += _hrRow(q.label, _boolBtns(q.field, s[q.field], q.trueLabel||'はい', q.falseLabel||'いいえ'));
    } else if (q.type === 'str') {
      h += _hrRow(q.label, _strBtns(q.field, s[q.field], q.options||[]));
    } else if (q.type === 'text') {
      h += _hrRow(q.label, '<input type="text" class="hr-text-input" value="' + _hEsc(s[q.field]||'') + '" oninput="setHearing(\'' + q.field + '\',this.value)">');
    }
  });

  // メール未着調査（固定セクション）
  var _showMailInvestigation = s.authCodeIssue === 'メール受信なし' || s.jAuthCodeIssue === 'メール受信なし';
  if (_showMailInvestigation) {
    var dv = s.mailDomain;
    var _rejectLabel = s.jAuthCodeIssue === 'メール受信なし' ? '受信拒否（mail.service.nhk-cs.jp）' : '受信拒否（mail.nhk）';
    h += '<div class="hr-divider">メール未着調査</div>';
    h += '<div class="hr-row"><div class="hr-label">■ドメイン（＠以降）</div><select id="hearingDomainSel" class="hr-select" onchange="onHearingDomainChange()"><option value="">選択してください</option>' + _mkOpt('@docomo.ne.jp',dv) + _mkOpt('@softbank.ne.jp',dv) + _mkOpt('@i.softbank.jp',dv) + _mkOpt('@ezweb.ne.jp',dv) + _mkOpt('@au.com',dv) + _mkOpt('@gmail.com',dv) + _mkOpt('@yahoo.co.jp',dv) + _mkOpt('@outlook.com',dv) + '<option value="__manual__"' + (dv==='__manual__'?' selected':'') + '>その他（手入力）</option></select><div id="hearingDomainManualWrap" style="display:' + (dv==='__manual__'?'block':'none') + ';margin-top:6px;"><input id="hearingDomainManual" type="text" class="hr-text-input" placeholder="例）@example.com" value="' + _hEsc(s.mailDomainManual) + '" oninput="onHearingDomainManualInput()"></div></div>';
    h += '<div class="hr-row"><div class="hr-label">■確認項目</div>' + _mkChk('cbMistake',s.cbMistake,'メールアドレスの入力ミス') + _mkChk('cbReject',s.cbReject,_rejectLabel) + _mkChk('cbSpam',s.cbSpam,'迷惑メールフィルター') + '</div>';
  }

  // ── メモ欄 ──
  h += '<div class="hr-row hr-memo-row">' +
    '<div class="hr-label">■メモ</div>' +
    '<textarea class="hr-memo-textarea" rows="3" placeholder="自由記入欄…" oninput="window._setHearingMemo(this.value)">' +
    _hEsc(s.memo || '') + '</textarea>' +
    '</div>';

  h += '<div id="hearingSummaryArea"></div>';
  el.innerHTML = h;
  renderHearingSummary();
}

function _mkOpt(val, selected) { return '<option value="' + val + '"' + (selected === val ? ' selected' : '') + '>' + val + '</option>'; }
function _mkChk(id, checked, label) { return '<label class="hr-check-label"><input id="hearingCb_' + id + '" type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="onHearingCheckChange(\'' + id + '\')">' + ' ' + label + '</label>'; }

window._setHearingMemo = function(val) {
  hearingState.memo = val;
  saveHearingState();
  renderHearingSummary();
};

function renderHearingSummary() {
  var area = document.getElementById('hearingSummaryArea');
  if (!area) return;
  var s = hearingState, rows = [];
  if (s.usage) rows.push(['用途', s.usage, '']);
  if (s.usage === '世帯') {
    if (s.isMigration !== null) rows.push(['移行対象者', s.isMigration ? 'はい' : 'いいえ', 'bool']);
    if (s.isMigration === true) {
      if (s.oldPlusId !== null) rows.push(['旧プラスID発行', s.oldPlusId ? 'はい(わからない)' : 'いいえ', 'bool']);
      if (s.oldPlusId === true) {
        if (s.migMailConfirmed !== null) rows.push(['移行案内メール確認', s.migMailConfirmed ? 'はい' : 'いいえ(わからない)', 'bool']);
        if (s.migMailConfirmed === true && s.migMailUsable !== null) rows.push(['メールアドレス使用可', s.migMailUsable ? 'はい' : 'いいえ', 'bool']);
      }
    }
  }
  if ((s.usage === '学校' || s.usage === '事業') && s.isAccountPerson !== null) rows.push(['アカウント担当者', s.isAccountPerson ? 'はい' : 'いいえ', 'bool']);
  if (s.sAccountCreated !== null) rows.push(['Sアカ作成済み', s.sAccountCreated ? 'はい' : 'いいえ', 'bool']);
  if (s.sAccountCreated === false && s.authCodeIssue) rows.push(['認証コード未着', s.authCodeIssue, '']);
  if (s.sAccountCreated === false && s.authCodeResult) rows.push(['認証コード確認', s.authCodeResult, '']);
  if (s.usage === '世帯' && s.sAccountCreated === true && s.sjLinked !== null) rows.push(['S-J連携', s.sjLinked === '再連携必要' ? '未確認（再連携必要）' : s.sjLinked, s.sjLinked === '連携済み' ? 'yes' : 'no']);
  if (s.usage === '世帯' && s.sAccountCreated === true && s.sjLinked === 'ログイン不可' && s.sjLoginlessResult !== null) rows.push(['認証コード確認(ログイン不可)', s.sjLoginlessResult, '']);
  if (s.usage === '世帯' && s.sAccountCreated === true && (s.sjLinked === '未連携' || s.sjLinked === '再連携必要') && s.jAccountCreated !== null) rows.push(['Jアカ作成済み', s.jAccountCreated ? 'はい' : 'いいえ', 'bool']);
  var envParts = [];
  DEVICE_LIST.forEach(function (device) {
    var d = s.devices[device];
    if (d.selected) envParts.push(d.detail ? device + '(' + d.detail + ')' : device);
  });
  if (envParts.length) rows.push(['操作環境', envParts.join('、'), '']);
  if (s.authCodeIssue === 'メール受信なし') {
    var domain = s.mailDomain === '__manual__' ? s.mailDomainManual : s.mailDomain;
    if (domain) rows.push(['ドメイン', domain, '']);
    var checks = [];
    if (s.cbMistake) checks.push('入力ミス');
    if (s.cbReject)  checks.push('受信拒否');
    if (s.cbSpam)    checks.push('迷惑メールフィルター');
    if (checks.length) rows.push(['確認項目', checks.join('、'), '']);
  }
  var policies = calcPolicies(s);

  // ── カスタム質問（builtin でない質問）の結果を追加 ──
  var qs2 = (typeof _hrGetQuestions === 'function') ? _hrGetQuestions() : [];
  var patterns2 = window._appCache.hearingPatterns || [];
  var patOver2 = {};
  patterns2.forEach(function(pat) {
    if (!pat.conditions || !pat.conditions.length) return;
    var ok = pat.conditions.every(function(c) {
      var sv = s[c.field];
      if (typeof sv === 'boolean') return (c.value === 'true') === sv;
      return String(sv === null || sv === undefined ? '' : sv) === String(c.value || '');
    });
    if (ok) (pat.targets || []).forEach(function(t) { patOver2[t.id] = t.show; });
  });
  qs2.forEach(function(q) {
    if (q.builtin) return; // 組み込み質問は上で既にrows追加済みのためスキップ
    if (!q.enabled) return;
    if (q.id in patOver2) { if (!patOver2[q.id]) return; }
    else if (!_hrEvalShowIf(q.showIf, s)) return;
    var val = s[q.field];
    if (val === null || val === undefined || val === '') return;
    var disp = '';
    if (q.type === 'bool') {
      if (val === true)  disp = q.trueResult  || q.trueLabel  || 'はい';
      if (val === false) disp = q.falseResult || q.falseLabel || 'いいえ';
    } else if (q.type === 'str') {
      var opt = (q.options || []).find(function(o) { return o.v === val; });
      disp = opt ? (opt.r || opt.l) : String(val);
    } else if (q.type === 'text') {
      disp = String(val);
    }
    if (disp) rows.push([q.label, disp, '']);
  });

  if (rows.length === 0 && policies.length === 0) { area.innerHTML = ''; return; }
  var h = '<div class="hr-summary"><div class="hr-summary-title">📋 ヒアリング内容</div><div class="hr-summary-rows">';
  rows.forEach(function (r) {
    var label = r[0], val = r[1], type = r[2];
    var valClass = 'hr-sum-val';
    if (type === 'bool') valClass += (val === 'はい' || val === 'はい(わからない)') ? ' hr-sum-yes' : ' hr-sum-no';
    if (type === 'yes') valClass += ' hr-sum-yes';
    if (type === 'no')  valClass += ' hr-sum-no';
    h += '<div class="hr-summary-row"><span class="hr-sum-label">' + _hEsc(label) + '</span><span class="' + valClass + '">' + _hEsc(val) + '</span></div>';
  });
  h += '</div>';
  if (policies.length > 0) {
    h += '<div id="hearingPolicyArea">';
    policies.forEach(function (p) { h += '<div class="hr-summary-policy"><span class="hr-policy-icon">📌</span><span class="hr-policy-text">対応方針：' + _hEsc(p).replace(/\n/g, '<br>') + '</span></div>'; });
    h += '</div>';
  }
  h += '</div>';
  area.innerHTML = h;
  if (policies.length > 0) {
    setTimeout(function () {
      var pEl = document.getElementById('hearingPolicyArea');
      if (pEl) pEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }
}

window.copyHearingText = function () {
  var s = hearingState, lines = [];
  if (s.usage) lines.push('用途：' + s.usage);
  if (s.usage === '世帯') {
    if (s.isMigration !== null) lines.push('移行対象者：' + (s.isMigration ? 'はい' : 'いいえ'));
    if (s.isMigration === true) {
      if (s.oldPlusId !== null) lines.push('旧プラスID発行：' + (s.oldPlusId ? 'はい(わからない)' : 'いいえ'));
      if (s.oldPlusId === true) {
        if (s.migMailConfirmed !== null) lines.push('移行案内メール確認：' + (s.migMailConfirmed ? 'はい' : 'いいえ(わからない)'));
        if (s.migMailConfirmed === true && s.migMailUsable !== null) lines.push('メールアドレス使用可：' + (s.migMailUsable ? 'はい' : 'いいえ'));
      }
    }
  }
  if ((s.usage === '学校' || s.usage === '事業') && s.isAccountPerson !== null) lines.push('アカウント担当者：' + (s.isAccountPerson ? 'はい' : 'いいえ'));
  if (s.sAccountCreated !== null) lines.push('Sアカ作成済み：' + (s.sAccountCreated ? 'はい' : 'いいえ'));
  if (s.sAccountCreated === false && s.authCodeIssue) lines.push('認証コード未着：' + s.authCodeIssue);
  if (s.sAccountCreated === false && s.authCodeResult) lines.push('認証コード確認：' + s.authCodeResult);
  if (s.usage === '世帯' && s.sAccountCreated === true && s.sjLinked) lines.push('S-J連携：' + (s.sjLinked === '再連携必要' ? '未確認（再連携必要）' : s.sjLinked));
  if (s.usage === '世帯' && s.sAccountCreated === true && s.sjLinked === 'ログイン不可' && s.sjLoginlessResult) lines.push('認証コード確認(ログイン不可)：' + s.sjLoginlessResult);
  if (s.usage === '世帯' && s.sAccountCreated === true && (s.sjLinked === '未連携' || s.sjLinked === '再連携必要') && s.jAccountCreated !== null) lines.push('Jアカ作成済み：' + (s.jAccountCreated ? 'はい' : 'いいえ'));
  var envParts = [];
  DEVICE_LIST.forEach(function (device) { var d = s.devices[device]; if (d.selected) envParts.push(d.detail ? device + '(' + d.detail + ')' : device); });
  if (envParts.length) lines.push('操作環境：' + envParts.join('、'));
  if (s.authCodeIssue === 'メール受信なし') {
    var domain = s.mailDomain === '__manual__' ? s.mailDomainManual : s.mailDomain;
    if (domain) lines.push('ドメイン：' + domain);
    var chks = [];
    if (s.cbMistake) chks.push('入力ミス');
    if (s.cbReject)  chks.push('受信拒否');
    if (s.cbSpam)    chks.push('迷惑メールフィルター');
    if (chks.length) lines.push('確認項目：' + chks.join('、'));
  }
  calcPolicies(s).forEach(function (p) { lines.push('対応方針：' + p); });

  // ── カスタム質問の結果 ──
  var cqs = (typeof _hrGetQuestions === 'function') ? _hrGetQuestions() : [];
  var cpats = window._appCache.hearingPatterns || [];
  var cpOver = {};
  cpats.forEach(function(pat) {
    if (!pat.conditions || !pat.conditions.length) return;
    var ok = pat.conditions.every(function(c) {
      var sv = s[c.field];
      if (typeof sv === 'boolean') return (c.value === 'true') === sv;
      return String(sv === null || sv === undefined ? '' : sv) === String(c.value || '');
    });
    if (ok) (pat.targets || []).forEach(function(t) { cpOver[t.id] = t.show; });
  });
  cqs.forEach(function(q) {
    if (!q.enabled) return;
    if (q.id in cpOver) { if (!cpOver[q.id]) return; }
    else if (!_hrEvalShowIf(q.showIf, s)) return;
    var val = s[q.field];
    if (val === null || val === undefined || val === '') return;
    var disp = '';
    if (q.type === 'bool') {
      if (val === true)  disp = q.trueResult  || q.trueLabel  || 'はい';
      if (val === false) disp = q.falseResult || q.falseLabel || 'いいえ';
    } else if (q.type === 'str') {
      var opt = (q.options || []).find(function(o) { return o.v === val; });
      disp = opt ? (opt.r || opt.l) : String(val);
    } else if (q.type === 'text') {
      disp = String(val);
    }
    if (disp) lines.push(q.label + '：' + disp);
  });

  // ── メモ ──
  if (s.memo && s.memo.trim()) lines.push('メモ：' + s.memo.trim());

  if (lines.length === 0) { _showHearingToast('コピーする内容がありません', true); return; }
  var text = lines.join('\n');
  var done = function () { _showHearingToast('ヒアリング内容をコピーしました', false); };
  if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done).catch(function () { _fallbackCopy(text); done(); }); }
  else { _fallbackCopy(text); done(); }
};

function _showHearingToast(msg, isError) {
  var toast = document.getElementById('hearingCopyToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'hearing-copy-toast show' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { toast.className = 'hearing-copy-toast'; }, 2000);
}

window.renderHearing = renderHearing;

// =============================================================================
// ⑦ キーボードナビゲーション（変更なし）
// =============================================================================
document.addEventListener('keydown', function (e) {
  var key = e.key;
  var focused = document.activeElement;
  if (key === 'Enter') {
    if (focused && focused !== document.body) {
      if (focused.tagName === 'BUTTON' || focused.getAttribute('role') === 'button' ||
          focused.classList.contains('sb-item') || focused.classList.contains('script-list-item') ||
          focused.classList.contains('step-choice-btn') || focused.classList.contains('suggest-item')) {
        focused.click(); e.preventDefault(); return;
      }
    }
  }
  var searchBox  = document.getElementById('searchBox');
  var suggestBox = document.getElementById('suggestBox');
  if (focused === searchBox && suggestBox && suggestBox.style.display !== 'none') {
    var items   = suggestBox.querySelectorAll('.suggest-item');
    var current = suggestBox.querySelector('.suggest-item.kb-focus');
    var idx = -1;
    items.forEach(function (el, i) { if (el === current) idx = i; });
    if (key === 'ArrowDown') { e.preventDefault(); if (current) current.classList.remove('kb-focus'); var next = items[Math.min(idx + 1, items.length - 1)]; next.classList.add('kb-focus'); next.scrollIntoView({ block: 'nearest' }); return; }
    if (key === 'ArrowUp') { e.preventDefault(); if (current) current.classList.remove('kb-focus'); if (idx > 0) { var prev = items[idx - 1]; prev.classList.add('kb-focus'); prev.scrollIntoView({ block: 'nearest' }); } return; }
    if (key === 'Enter') { e.preventDefault(); if (current) { current.click(); return; } if (items.length > 0) { items[0].click(); return; } }
  }
  if (key === 'ArrowLeft') {
    if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.tagName === 'SELECT')) return;
    var backBtn = document.querySelector('.step-back-btn');
    if (backBtn) { e.preventDefault(); backBtn.click(); return; }
    if (typeof goBack === 'function') { e.preventDefault(); goBack(); }
    return;
  }
  if (key === 'ArrowRight') {
    if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.tagName === 'SELECT')) return;
    if (typeof goForward === 'function') { e.preventDefault(); goForward(); }
    return;
  }
});

(function () {
  if (document.getElementById('_cuKbCSS')) return;
  var style = document.createElement('style');
  style.id = '_cuKbCSS';
  style.textContent =
    '.suggest-item.kb-focus { background: #eef0ff !important; }' +
    '.script-list-item:focus { outline: 2px solid #3742fa; outline-offset: -2px; }' +
    '.step-choice-btn:focus { outline: 2px solid #3742fa; border-color: #3742fa; background: #f0f4ff; }' +
    '.sb-acc-header:focus { outline: 2px solid #3742fa; outline-offset: -2px; }' +
    '.sb-item:focus { outline: 2px solid #3742fa; outline-offset: -2px; }' +
    '.hr-btn:focus, .hr-device-btn:focus, .hr-detail-btn:focus { outline: 2px solid #3742fa; }' +
    // ── メモ欄 ──
    '.hr-memo-row { align-items: flex-start !important; }' +
    '.hr-memo-textarea { width:100%; min-height:60px; resize:vertical; padding:7px 9px; border:1px solid var(--border,#dfe4ea); border-radius:6px; font-family:inherit; font-size:12px; background:var(--bg,#f1f2f6); color:var(--text,#2f3542); line-height:1.6; transition:border-color .15s; }' +
    '.hr-memo-textarea:focus { outline:none; border-color:var(--accent,#3742fa); }';
  document.head.appendChild(style);
})();

// =============================================================================
// ⑧ DOMContentLoaded：サイドメニュー描画 & 各種初期化
// =============================================================================
document.addEventListener('DOMContentLoaded', function () {
  if (!document.getElementById('_smDarkCSS')) {
    var st = document.createElement('style');
    st.id = '_smDarkCSS';
    st.textContent =
      '.dark-toggle-sw{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0}' +
      '.dark-toggle-sw input{opacity:0;width:0;height:0}' +
      '.dark-toggle-sl{position:absolute;cursor:pointer;inset:0;background:#ccc;border-radius:24px;transition:.3s}' +
      '.dark-toggle-sl:before{content:"";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}' +
      'input:checked+.dark-toggle-sl{background:#5c6afc}' +
      'input:checked+.dark-toggle-sl:before{transform:translateX(20px)}';
    document.head.appendChild(st);
  }

  var m = document.getElementById('sideMenu');
  if (m) {
    var saved  = localStorage.getItem('darkMode');
    var isDark = saved === '1';
    m.innerHTML = _buildSideMenuHTML(isDark);
    window.renderHistory();
    window.addEventListener('storage', function (e) {
      if (e.key === 'updateHistory') window.renderHistory();
      if (e.key === 'sideMenuData') {
        var isDarkNow = localStorage.getItem('darkMode') === '1';
        m.innerHTML = _buildSideMenuHTML(isDarkNow);
        window.renderHistory();
      }
    });
  }

  window.renderQuickMenu();

  if (document.getElementById('hearingContent')) renderHearing();

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.quick-copy-area')) {
      var qm = document.getElementById('quickMenu');
      if (qm) qm.classList.remove('open');
    }
    var btn = document.getElementById('menuBtn');
    if (m && !m.contains(e.target) && btn && e.target !== btn && !btn.contains(e.target)) {
      m.classList.remove('open');
    }
  });
});

// =============================================================================
// ⑦ 画面へのJSON D&Dインポート
//    JSON ファイルをページ上にドロップするとインポートを実行する
// =============================================================================
(function () {
  function _handleDrop(e) {
    // 添付ファイルドロップゾーン上へのドロップは無視
    var dz = document.getElementById('smFilesDropZone');
    if (dz && (e.target === dz || dz.contains(e.target))) return;
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('dnd-json-hover');
    var files = Array.from(e.dataTransfer.files).filter(function(f) {
      return f.name.endsWith('.json');
    });
    if (!files.length) return;
    var file = files[0];
    var reader = new FileReader();
    reader.onload = function(ev) {
      _processImportText(ev.target.result, true);
    };
    reader.readAsText(file);
  }
  function _handleDragOver(e) {
    var dz = document.getElementById('smFilesDropZone');
    if (dz && (e.target === dz || dz.contains(e.target))) return;
    var types = Array.from(e.dataTransfer.types || []);
    if (!types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    document.body.classList.add('dnd-json-hover');
  }
  function _handleDragLeave(e) {
    // bodyの外にカーソルが出た場合のみ解除
    if (e.relatedTarget && document.body.contains(e.relatedTarget)) return;
    document.body.classList.remove('dnd-json-hover');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      document.body.addEventListener('dragover',  _handleDragOver);
      document.body.addEventListener('dragleave', _handleDragLeave);
      document.body.addEventListener('drop',      _handleDrop);
    });
  } else {
    document.body.addEventListener('dragover',  _handleDragOver);
    document.body.addEventListener('dragleave', _handleDragLeave);
    document.body.addEventListener('drop',      _handleDrop);
  }
})();

// =============================================================================
// ⑧ サイドバー JS制御フォーカスマネージャー
//    ブラウザネイティブ focus に依存しない永続的なフォーカス表示。
//    どこをクリックしても最後に触ったサイドバー要素の青枠を保持し、
//    Esc キーのみで解除する。
//    使用方法:
//      sbFocusSet(id)     … 指定IDの要素にフォーカスを移す
//      sbFocusRestore()   … DOM再構築後に前回フォーカスを復元する
// =============================================================================
(function () {
  var _focusId = null;

  window.sbFocusSet = function (id) {
    // 旧フォーカスを解除
    if (_focusId) {
      var old = document.getElementById(_focusId);
      if (old) old.classList.remove('sb-js-focus');
    }
    _focusId = id || null;
    // 新しい要素に付与
    if (_focusId) {
      var el = document.getElementById(_focusId);
      if (el) el.classList.add('sb-js-focus');
    }
  };

  // DOM再構築後に前回フォーカスを復元する（renderSidebar の末尾で呼ぶ）
  window.sbFocusRestore = function () {
    if (!_focusId) return;
    var el = document.getElementById(_focusId);
    if (el) el.classList.add('sb-js-focus');
  };

  // Esc キーでフォーカスを解除
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.sbFocusSet(null);
  });
})();

// =============================================================================
// ⑨ 共通インポートプログレスオーバーレイ
//    admin.html の _importProgressShow/Update/Hide と同一 API。
//    index.html / mail.html / screen.html で D&D JSON インポート時に表示する。
// =============================================================================
(function () {
  var _el = null;

  function _ensure() {
    if (_el) return _el;
    // CSS
    var style = document.createElement('style');
    style.textContent = [
      '#_impProg{display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);align-items:center;justify-content:center}',
      '#_impProg.show{display:flex}',
      '#_impProgBox{background:var(--surface,#fff);border-radius:12px;padding:24px 28px;min-width:300px;max-width:440px;width:88vw;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:12px}',
      '#_impProgLbl{font-size:13px;font-weight:700;color:var(--text,#222)}',
      '#_impProgSub{font-size:11px;color:var(--text3,#888);margin-top:-6px;min-height:15px}',
      '#_impProgTrack{width:100%;height:6px;background:var(--surface2,#eee);border-radius:3px;overflow:hidden}',
      '#_impProgBar{height:100%;width:0%;background:var(--accent,#3742fa);border-radius:3px;transition:width .15s ease}'
    ].join('');
    document.head.appendChild(style);
    // HTML
    _el = document.createElement('div');
    _el.id = '_impProg';
    _el.innerHTML = '<div id="_impProgBox">'
      + '<div id="_impProgLbl">読み込み中…</div>'
      + '<div id="_impProgSub"></div>'
      + '<div id="_impProgTrack"><div id="_impProgBar"></div></div>'
      + '</div>';
    document.body.appendChild(_el);
    return _el;
  }

  window._importProgressShow = function (label, sub, pct) {
    _ensure().classList.add('show');
    window._importProgressUpdate(label, sub, pct);
  };
  window._importProgressUpdate = function (label, sub, pct) {
    _ensure();
    var l = document.getElementById('_impProgLbl');
    var s = document.getElementById('_impProgSub');
    var b = document.getElementById('_impProgBar');
    if (l) l.textContent = label || '';
    if (s) s.textContent = sub   || '';
    if (b) b.style.width = Math.min(100, Math.max(0, pct || 0)) + '%';
  };
  window._importProgressHide = function () {
    var el = document.getElementById('_impProg');
    if (el) el.classList.remove('show');
  };
})();

// =============================================================================
// ⑩ idbSetScreenData / idbGetScreenData スタブ（index/script/mail.html 用）
//    _appIdbOpen()（v5 共有接続）を使うため IDB バージョン競合が発生しない。
// =============================================================================
(function () {
  if (typeof idbSetScreenData !== 'function') {
    window.idbSetScreenData = function (data) {
      if (!data) return Promise.resolve();
      return _appIdbOpen().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('patterns', 'readwrite');
          tx.objectStore('patterns').put(data, 'data');
          tx.oncomplete = function () { resolve(); };
          tx.onerror    = function (e) { reject(e.target.error); };
          tx.onabort    = function (e) { reject(tx.error || e); };
        });
      });
    };
  }
  if (typeof idbGetScreenData !== 'function') {
    window.idbGetScreenData = function () {
      return _appIdbOpen().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx  = db.transaction('patterns', 'readonly');
          var req = tx.objectStore('patterns').get('data');
          req.onsuccess = function (e) { resolve(e.target.result || null); };
          req.onerror   = function (e) { reject(e.target.error); };
        });
      }).catch(function () { return null; });
    };
  }
})();

// =============================================================================
// ⑪ BroadcastChannel 受信リスナー（admin.html / 他ページからのリアルタイム反映）
// =============================================================================
(function() {
  var _rxBc;
  try { _rxBc = new BroadcastChannel('tool_data_update'); } catch(e) { return; }

  _rxBc.onmessage = function(ev) {
    var type = ev.data && ev.data.type;

    // ── スクリプトデータ更新 ──
    if (type === 'scriptsUpdated') {
      // app.js (index.html) の reloadScripts 関数があれば呼ぶ
      if (typeof window.reloadScripts === 'function') {
        window.reloadScripts();
      }
    }

    // ── メールデータ更新 ──
    if (type === 'mailDataUpdated') {
      try {
        var _mt = window._appCache.mailTemplates;
        if (_mt) {
          // mail.html: templates 配列を再ロード
          if (typeof templates !== 'undefined' && Array.isArray(templates)) {
            templates.length = 0;
            _mt.forEach(function(t){ templates.push(t); });
            if (typeof renderSidebar === 'function') renderSidebar();
            if (typeof showList    === 'function') showList(typeof currentCat !== 'undefined' ? currentCat : '__all__');
          }
        }
      } catch(e) {}
    }

    // ── 画面遷移データ更新 ──
    if (type === 'screenDataUpdated') {
      // screen.html: idbGetScreenData から再ロード
      if (typeof idbGetScreenData === 'function') {
        idbGetScreenData().then(function(data) {
          if (!Array.isArray(data) || !data.length) return;
          if (typeof patterns !== 'undefined') {
            patterns.length = 0;
            data.forEach(function(p){ patterns.push(p); });
          }
          // 表示キャッシュをクリア
          if (typeof _pvImgCache !== 'undefined') { Object.keys(_pvImgCache).forEach(function(k){ delete _pvImgCache[k]; }); }
          if (typeof renderSidebar === 'function') renderSidebar();
          if (typeof renderFlow    === 'function') renderFlow();
        });
      }
    }

    // ── サイドメニュー更新 ──
    if (type === 'sideMenuUpdated') {
      if (ev.data && ev.data.data) {
        window._appCache.sideMenuData = ev.data.data;
        window.idbSetAppData('sideMenuData', ev.data.data);
      }
      var sideMenuEl = document.getElementById('sideMenu');
      if (sideMenuEl) {
        var isDarkNow = localStorage.getItem('darkMode') === '1';
        sideMenuEl.innerHTML = _buildSideMenuHTML(isDarkNow);
        window.renderHistory();
      }
    }

    // ── 全データ更新（どのページからのインポートでも全タブに反映） ──
    if (type === 'allDataUpdated') {
      // スクリプト
      if (typeof window.reloadScripts === 'function') { window.reloadScripts(); }
      // メール
      try {
        var _mt2 = window._appCache.mailTemplates;
        if (_mt2 && typeof templates !== 'undefined' && Array.isArray(templates)) {
          templates.length = 0; _mt2.forEach(function(t){ templates.push(t); });
          if (typeof renderSidebar === 'function') renderSidebar();
          if (typeof showList === 'function') showList(typeof currentCat !== 'undefined' ? currentCat : '__all__');
        }
      } catch(e) {}
      // 画面遷移
      if (typeof idbGetScreenData === 'function') {
        idbGetScreenData().then(function(scrData) {
          if (!Array.isArray(scrData) || !scrData.length) return;
          if (typeof patterns !== 'undefined') {
            patterns.length = 0; scrData.forEach(function(p){ patterns.push(p); });
            if (typeof _pvImgCache !== 'undefined') { Object.keys(_pvImgCache).forEach(function(k){ delete _pvImgCache[k]; }); }
            if (typeof renderSidebar === 'function') renderSidebar();
            if (typeof renderFlow === 'function') renderFlow();
          }
        }).catch(function(){});
      }
      // ヒアリング
      if (typeof window.renderHearing === 'function') window.renderHearing();
      // サイドメニュー・更新履歴
      window.idbGetAppData('scripts').then(function(sc) {
        if (sc) window._appCache.scripts = sc;
        return window.idbGetAppData('mailTemplates');
      }).then(function(mt) {
        if (mt) window._appCache.mailTemplates = mt;
      }).catch(function(){});
    }

    // ── 画像ライブラリ更新 ──
    if (type === 'imageLibUpdated') {
      // screen.html / admin.html の画像キャッシュをクリア
      try { if (typeof _pvImgCache !== 'undefined') { Object.keys(_pvImgCache).forEach(function(k){ delete _pvImgCache[k]; }); } } catch(e) {}
      try { if (typeof _imgLibAllItems !== 'undefined') { _imgLibAllItems = []; if (typeof _imgLibRender === 'function') _imgLibRender(); } } catch(e) {}
    }

    // ── ヒアリング更新 ──
    if (type === 'hearingUpdated') {
      if (ev.data.questions) { window._appCache.hearingQuestions = ev.data.questions; window.idbSetAppData('hearingQuestions', ev.data.questions); }
      if (ev.data.policies)  { window._appCache.hearingPolicies  = ev.data.policies;  window.idbSetAppData('hearingPolicies',  ev.data.policies);  }
      if (ev.data.patterns)  { window._appCache.hearingPatterns  = ev.data.patterns;  window.idbSetAppData('hearingPatterns',  ev.data.patterns);  }
      // hearing はIDBで管理 (localStorage不使用)
      if (typeof window.renderHearing === 'function') window.renderHearing();
    }
  };
})();

// =============================================================================
// 同期URL自動フェッチ（ビューアページ用: script/mail/screen.html）
// admin.html は自前で DOMContentLoaded で処理するため除外
// =============================================================================
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // admin.html 判定（タブパネルがあるか）
    if (document.getElementById('tabScript') || document.getElementById('tabBtnScript')) return;
    var syncUrl  = localStorage.getItem('syncUrl')  || '';
    var syncIntv = parseInt(localStorage.getItem('syncInterval') || '0');
    if (!syncUrl) return;
    function _doSync() {
      fetch(syncUrl, { cache: 'no-store' })
        .then(function(r) { return r.ok ? r.text() : Promise.reject('HTTP ' + r.status); })
        .then(function(text) {
          if (typeof window._processImportText === 'function') window._processImportText(text, true);
        })
        .catch(function(e) { console.warn('[sync] fetch failed:', e); });
    }
    setTimeout(_doSync, 1500);
    if (syncIntv) setInterval(_doSync, syncIntv * 1000);
  });
})();

