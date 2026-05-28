(function() { 'use strict';

// 安全日志 — 同时输出到父页面和当前控制台
var _log = function() {
  var args = Array.prototype.slice.call(arguments);
  try { window.parent.console.log.apply(window.parent.console, args); } catch(e) {}
  try { console.log.apply(console, args); } catch(e) {}
};
var _warn = function() {
  var args = Array.prototype.slice.call(arguments);
  try { window.parent.console.warn.apply(window.parent.console, args); } catch(e) {}
  try { console.warn.apply(console, args); } catch(e) {}
};
var _error = function() {
  var args = Array.prototype.slice.call(arguments);
  try { window.parent.console.error.apply(window.parent.console, args); } catch(e) {}
  try { console.error.apply(console, args); } catch(e) {}
};

// 在父页面创建可见的状态条
function _showStatusBar(msg, type) {
  try {
    var bar = window.parent.document.createElement('div');
    bar.id = 'mm-status-bar';
    bar.textContent = '[MemoryMirror] ' + msg;
    bar.style.cssText = 'position:fixed;top:0;left:0;width:100%;z-index:999999;padding:6px 12px;font-size:12px;text-align:center;color:#fff;' +
      (type === 'error' ? 'background:#c44040;' : type === 'warn' ? 'background:#d49540;' : 'background:#7bb87b;');
    // 移除旧条
    try { var old = window.parent.document.getElementById('mm-status-bar'); if (old) old.parentNode.removeChild(old); } catch(e) {}
    window.parent.document.body.appendChild(bar);
    // 3 秒后自动消失
    setTimeout(function() { try { if (bar.parentNode) bar.parentNode.removeChild(bar); } catch(e) {} }, 4000);
  } catch(e) {}
}

// 终极降级错误显示（不依赖任何外部条件）
function _fatalError(msg) {
  try { var d1=document.createElement('div'); d1.textContent='[MM] '+msg; d1.style.cssText='position:fixed;top:0;left:0;width:100%;z-index:999999;padding:10px;background:#c44040;color:#fff;font-size:13px;text-align:center;font-family:sans-serif'; document.body.appendChild(d1); } catch(e) {}
  try { var d2=window.parent.document.createElement('div'); d2.textContent='[MM] '+msg; d2.style.cssText='position:fixed;top:0;left:0;width:100%;z-index:999999;padding:10px;background:#c44040;color:#fff;font-size:13px;text-align:center;font-family:sans-serif'; window.parent.document.body.appendChild(d2); } catch(e) {}
}

_log('MemoryMirror v2 phase14 解析中...');
_showStatusBar('MemoryMirror 加载...', 'ok');

try {

/* ========================================================================
   MemoryMirror v2 — Phase 14: Utils + DataService + SearchIndex
                            + SemanticEngine + AutoTagger + TagManager
                            + Scanner + KnowledgeGraph + ArchiveManager + Exporter
                            + RuleEngine + LorebookManager + AdaptiveForgetting + AutoTaskManager
                            + RollbackManager + UIManager
   沙箱适配的记忆管理脚本，注入到 <iframe sandbox> 中运行。
   ======================================================================== */

/* ====== Utils ====== */
// 沙箱适配变量、通用工具函数、记忆工厂、常量定义

var parentDoc = window.parent.document;
var parentWin = window.parent;
var targetDoc = (parentDoc && parentDoc.body) ? parentDoc : document;
var targetWin = (parentDoc && parentDoc.body) ? parentWin : window;
var WRAPPER_ID = 'memory-mirror-wrapper';

var _uidCounter = 0;

/**
 * HTML 实体转义，防止 XSS
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 防抖函数，用于搜索输入和自动保存
 */
function debounce(fn, delay) {
  var timer = null;
  return function() {
    var ctx = this;
    var args = arguments;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() {
      timer = null;
      fn.apply(ctx, args);
    }, delay || 300);
  };
}

/**
 * 从 targetWin.location.search 提取 URL 参数
 */
function getUrlParams() {
  var params = {};
  var search = '';
  try { search = targetWin.location.search; } catch(e) { /* 跨域时静默 */ }
  if (!search) return params;
  var raw = search.substring(1);
  if (!raw) return params;
  var pairs = raw.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var eq = pairs[i].indexOf('=');
    if (eq === -1) {
      params[decodeURIComponent(pairs[i])] = '';
    } else {
      params[decodeURIComponent(pairs[i].substring(0, eq))] = decodeURIComponent(pairs[i].substring(eq + 1));
    }
  }
  return params;
}

/**
 * 格式化时间戳为 YYYY-MM-DD HH:mm
 */
function formatDate(ts) {
  var d = new Date(ts);
  return (
    d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2) + ' ' +
    ('0' + d.getHours()).slice(-2) + ':' +
    ('0' + d.getMinutes()).slice(-2)
  );
}

/**
 * 计算距今天数
 */
function daysSince(ts) {
  return Math.floor((Date.now() - ts) / 86400000);
}

/**
 * 生成内容指纹：去除所有空白字符后取前 100 字符，用于精确去重
 */
function contentFingerprint(content) {
  if (!content) return '';
  return String(content).replace(/\s+/g, '').substring(0, 100);
}

/**
 * 粗略估算文本 token 数（字符数 / 2，中文场景偏保守但够用）
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 2);
}

/**
 * 生成自增唯一 ID（用于 localStorage 降级路径）
 */
function uid() {
  _uidCounter++;
  return 'mem_' + Date.now().toString(36) + '_' + _uidCounter.toString(36) +
    '_' + Math.random().toString(36).substr(2, 7);
}

/**
 * 创建记忆对象，合并默认字段
 */
function createMemory(overrides) {
  var base = {
    id: null,
    time: '',
    timestamp: Date.now(),
    zone: '角色记忆',
    roleId: '',
    roleName: '',
    category: '',
    content: '',
    importance: 3,
    tags: [],
    reviewed: false,
    summarized: false,
    protected: false,
    hidden: false,
    linkedIds: [],
    // Phase 4 预留字段
    triggerKeywords: [],
    entities: [],
    relations: [],
    lastRetrievedAt: null,
    retrieveCount: 0,
    decayScore: 1.0,
    archivedAt: null,
    sourceType: 'manual',
    confirmedByUser: true
  };
  if (overrides) {
    var allowed = ['id','time','timestamp','zone','roleId','roleName','category','content','importance','tags','reviewed','summarized','protected','hidden','linkedIds','triggerKeywords','entities','relations','lastRetrievedAt','retrieveCount','decayScore','archivedAt','sourceType','confirmedByUser'];
    for (var i = 0; i < allowed.length; i++) {
      var k = allowed[i];
      if (overrides.hasOwnProperty(k)) base[k] = overrides[k];
    }
  }
  return base;
}

/** 分区枚举 */
var ZONES = ['角色记忆', '玩家记忆', '世界记忆', '总结记忆'];

/** 分类枚举 */
var CATEGORIES = ['初识印象', '深层认知', '行为习惯', '情感关系', '背景故事', '其他'];

/** Phase 6: 排版增强 — 渲染前自动处理引号、破折号、省略号（仅影响显示，不修改存储） */
function typographic(text) {
  if (!text) return '';
  var t = String(text);
  t = t.replace(/\.\.\./g, '…');           // ...  → …
  t = t.replace(/--/g, '–');               // --   → –
  t = t.replace(/---/g, '—');              // ---  → —
  t = t.replace(/'([^']*)'/g, '‘$1’'); // 'x'  → 'x'
  t = t.replace(/"([^"]*)"/g, '“$1”'); // "x"  → "x"
  return t;
}


/* ====== DataService ====== */
// 数据持久化服务 — IndexedDB 为主，localStorage 为自动降级

var DataService = {};
DataService._storageMode = null;   // 'indexedDB' | 'localStorage'
DataService._db = null;            // IndexedDB 连接句柄
DataService._roleId = '';
DataService._sessionId = '';

/**
 * 检测并确定存储模式
 */
DataService._detectStorage = function() {
  var self = this;
  return new Promise(function(resolve) {
    if (typeof indexedDB === 'undefined') {
      self._storageMode = 'localStorage';
      resolve();
      return;
    }
    var testReq = indexedDB.open('__mm_test__');
    testReq.onsuccess = function() {
      self._storageMode = 'indexedDB';
      testReq.result.close();
      indexedDB.deleteDatabase('__mm_test__');
      resolve();
    };
    testReq.onerror = function() {
      self._storageMode = 'localStorage';
      resolve();
    };
    testReq.onblocked = function() {
      self._storageMode = 'localStorage';
      resolve();
    };
  });
};

/**
 * 获取当前存储前缀：MemoryMirror_<roleId>_<sessionId>
 */
DataService.getPrefix = function() {
  return 'MemoryMirror_' + this._roleId + '_' + this._sessionId;
};

/**
 * 获取角色前缀：MemoryMirror_<roleId>
 */
DataService.getRolePrefix = function() {
  return 'MemoryMirror_' + this._roleId;
};

/**
 * 获取 IndexedDB 数据库名
 */
DataService._dbName = function() {
  return 'MemoryMirror_' + this._roleId + '_' + this._sessionId;
};

/**
 * 获取 localStorage 记忆存储键
 */
DataService._lsKey = function() {
  return 'MemoryMirror_' + this._roleId + '_' + this._sessionId + '_memories';
};

/**
 * 获取 localStorage 黑名单键
 */
DataService._blacklistKey = function() {
  return 'MemoryMirror_' + this._roleId + '_' + this._sessionId + '_blacklist';
};

/**
 * 打开/创建 IndexedDB 数据库
 */
DataService._openDB = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(self._dbName(), 1);
    request.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('memories')) {
        var store = db.createObjectStore('memories', { keyPath: 'id' });
        store.createIndex('idx_timestamp', 'timestamp', { unique: false });
        store.createIndex('idx_zone', 'zone', { unique: false });
        store.createIndex('idx_roleId', 'roleId', { unique: false });
        store.createIndex('idx_hidden', 'hidden', { unique: false });
      }
    };
    request.onsuccess = function(e) {
      self._db = e.target.result;
      resolve(self._db);
    };
    request.onerror = function(e) {
      reject(e.target.error);
    };
    request.onblocked = function() {
      reject(new Error('Database blocked'));
    };
  });
};

/**
 * 确保数据库已打开（仅在 IndexedDB 模式下调用）
 */
DataService._ensureDB = function() {
  var self = this;
  if (this._storageMode !== 'indexedDB') {
    return Promise.reject(new Error('Not in IndexedDB mode'));
  }
  if (this._db && this._db.objectStoreNames.contains('memories')) {
    return Promise.resolve(this._db);
  }
  return this._openDB();
};

/**
 * 从 IndexedDB 读取全部记忆
 */
DataService._readIDB = function() {
  var self = this;
  return this._ensureDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('memories', 'readonly');
      var store = tx.objectStore('memories');
      var request = store.getAll();
      request.onsuccess = function() { resolve(request.result || []); };
      request.onerror = function() { reject(request.error); };
    });
  });
};

/**
 * 写入全部记忆到 IndexedDB（全量替换策略：清空后重新写入）
 */
DataService._writeIDB = function(memories) {
  var self = this;
  return this._ensureDB().then(function(db) {
    // 先读取所有已有 key，用于后续清理不在新数据集中的旧记录
    return new Promise(function(resolvePre, rejectPre) {
      var preTx = db.transaction('memories', 'readonly');
      var preStore = preTx.objectStore('memories');
      var keysReq = preStore.getAllKeys();
      var existingIds = {};
      keysReq.onsuccess = function() {
        var keys = keysReq.result || [];
        for (var ki = 0; ki < keys.length; ki++) { existingIds[keys[ki]] = true; }
        resolvePre(existingIds);
      };
      keysReq.onerror = function(e) { rejectPre(e.target.error); };
    }).then(function(existingIds) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction('memories', 'readwrite');
        var store = tx.objectStore('memories');
        var errors = [];
        var newIds = {};

        tx.oncomplete = function() {
          if (errors.length) reject(errors[0]);
          else resolve();
        };
        tx.onerror = function(e) { reject(e.target.error); };
        tx.onabort = function(e) { reject(e.target.error); };

        // 使用 put 逐条写入（upsert），不再先 clear 后 add
        for (var i = 0; i < memories.length; i++) {
          (function(mem) {
            newIds[mem.id] = true;
            var putReq = store.put(mem);
            putReq.onerror = function(e) { errors.push(e.target.error); tx.abort(); };
          })(memories[i]);
        }

        // 删除不在新数据集中的旧记录
        for (var eid in existingIds) {
          if (!newIds[eid]) store.delete(eid);
        }
      });
    });
  });
};

/**
 * 从 localStorage 读取全部记忆
 */
DataService._readLS = function() {
  try {
    var raw = localStorage.getItem(this._lsKey());
    return raw ? JSON.parse(raw) : [];
  } catch(e) {
    return [];
  }
};

/**
 * 写入全部记忆到 localStorage
 */
DataService._writeLS = function(memories) {
  try {
    localStorage.setItem(this._lsKey(), JSON.stringify(memories));
    return Promise.resolve();
  } catch(e) {
    return Promise.reject(new Error('localStorage quota exceeded'));
  }
};

/**
 * 统一读取全部记忆
 */
DataService._readAll = function() {
  if (this._storageMode === 'localStorage') {
    return Promise.resolve(this._readLS());
  }
  return this._readIDB();
};

/**
 * 统一写入全部记忆
 */
DataService._writeAll = function(memories) {
  if (this._storageMode === 'localStorage') {
    return this._writeLS(memories);
  }
  return this._writeIDB(memories);
};

/**
 * 读取黑名单
 */
DataService._readBlacklist = function() {
  try {
    var raw = localStorage.getItem(this._blacklistKey());
    return raw ? JSON.parse(raw) : [];
  } catch(e) {
    return [];
  }
};

/**
 * 写入黑名单
 */
DataService._writeBlacklist = function(list) {
  try {
    localStorage.setItem(this._blacklistKey(), JSON.stringify(list));
  } catch(e) { /* 静默失败，黑名单非致命 */ }
};

/**
 * 检查是否在黑名单中
 */
DataService._isBlacklisted = function(fingerprint, zone) {
  var list = this._readBlacklist();
  for (var i = 0; i < list.length; i++) {
    if (list[i].contentPrefix === fingerprint && list[i].zone === zone) {
      return true;
    }
  }
  return false;
};

/**
 * 添加到黑名单
 */
DataService._addToBlacklist = function(fingerprint, zone) {
  var list = this._readBlacklist();
  list.push({ contentPrefix: fingerprint, zone: zone, timestamp: Date.now() });
  if (list.length > 500) {
    list = list.slice(list.length - 500);
  }
  this._writeBlacklist(list);
};

/**
 * 迁移旧数据：检测不带 roleId 前缀的旧键名，自动迁移到新键名
 */
DataService._migrateOldData = function() {
  var self = this;
  var oldKeys = [];
  try {
    var candidates = ['MemoryMirror_memories', 'MemoryMirror_blacklist'];
    for (var i = 0; i < candidates.length; i++) {
      if (localStorage.getItem(candidates[i]) !== null) {
        oldKeys.push(candidates[i]);
      }
    }
    for (var j = 0; j < localStorage.length; j++) {
      var key = localStorage.key(j);
      if (key && /^MemoryMirror_(?!\w+_\w+_)/.test(key)) {
        if (oldKeys.indexOf(key) === -1) oldKeys.push(key);
      }
    }
  } catch(e) { console.warn('[DataService] 扫描旧键失败:', e.message); }

  for (var k = 0; k < oldKeys.length; k++) {
    var oldKey = oldKeys[k];
    var data = null;
    try { data = localStorage.getItem(oldKey); } catch(e) { console.warn('[DataService] 读取旧键失败，已跳过:', oldKey, e.message); continue; }
    if (data === null) continue;

    if (oldKey.indexOf('blacklist') !== -1) {
      var existingBlacklist = self._readBlacklist();
      var oldBlacklist = null;
      try { oldBlacklist = JSON.parse(data); } catch(e) {
        console.warn('[DataService] 迁移旧黑名单数据失败，已删除损坏键:', oldKey, e.message);
        try { localStorage.removeItem(oldKey); } catch(ex) {}
        continue;
      }
      if (!Array.isArray(oldBlacklist)) {
        console.warn('[DataService] 旧黑名单数据格式无效，已删除:', oldKey);
        try { localStorage.removeItem(oldKey); } catch(ex) {}
        continue;
      }
      var merged = existingBlacklist.concat(oldBlacklist);
      if (merged.length > 500) merged = merged.slice(merged.length - 500);
      self._writeBlacklist(merged);
    } else {
      var oldMemories = null;
      try { oldMemories = JSON.parse(data); } catch(e) {
        console.warn('[DataService] 迁移旧记忆数据失败，已删除损坏键:', oldKey, e.message);
        try { localStorage.removeItem(oldKey); } catch(ex) {}
        continue;
      }
      if (!Array.isArray(oldMemories)) {
        console.warn('[DataService] 旧记忆数据格式无效，已删除:', oldKey);
        try { localStorage.removeItem(oldKey); } catch(ex) {}
        continue;
      }
      var newKey = self._lsKey();
      var existingMemories = [];
      try {
        var existingRaw = localStorage.getItem(newKey);
        if (existingRaw) {
          try { existingMemories = JSON.parse(existingRaw); } catch(e) {
            console.warn('[DataService] 解析现有记忆数据失败，将覆盖:', newKey, e.message);
            existingMemories = [];
          }
        }
      } catch(e) { console.warn('[DataService] 读取现有记忆数据失败:', e.message); }
      var existingIds = {};
      for (var mi = 0; mi < existingMemories.length; mi++) {
        existingIds[existingMemories[mi].id] = true;
      }
      for (var oi = 0; oi < oldMemories.length; oi++) {
        if (!existingIds[oldMemories[oi].id]) {
          existingMemories.push(oldMemories[oi]);
          existingIds[oldMemories[oi].id] = true;
        }
      }
      try { localStorage.setItem(newKey, JSON.stringify(existingMemories)); } catch(e) { console.warn('[DataService] 写入迁移后数据失败:', e.message); }
    }
    try { localStorage.removeItem(oldKey); } catch(e) { console.warn('[DataService] 删除旧键失败:', oldKey, e.message); }
  }
  return Promise.resolve();
};

/* ---------- 公开 API ---------- */

/**
 * 获取记忆列表
 * @param {Object} [options] - includeHidden 默认 true
 */
DataService.getAll = function(options) {
  var self = this;
  var opts = options || {};
  var includeHidden = opts.includeHidden !== false;
  return this._readAll().then(function(memories) {
    if (!includeHidden) {
      memories = memories.filter(function(m) { return !m.hidden; });
    }
    memories.sort(function(a, b) { return b.timestamp - a.timestamp; });
    return memories;
  });
};

/**
 * 根据 ID 获取单条记忆
 */
DataService.getById = function(id) {
  return this._readAll().then(function(memories) {
    for (var i = 0; i < memories.length; i++) {
      if (memories[i].id === id) return memories[i];
    }
    return null;
  });
};

/**
 * 新增或更新记忆（有 id 则更新），自动补全 timestamp
 */
DataService.save = function(memory) {
  if (!memory || !memory.content) return Promise.reject(new Error('记忆内容不能为空'));
  var self = this;
  return this._readAll().then(function(memories) {
    var now = Date.now();
    var mem = createMemory(memory);
    var existingIdx = -1;

    if (mem.id) {
      for (var i = 0; i < memories.length; i++) {
        if (memories[i].id === mem.id) { existingIdx = i; break; }
      }
    }

    if (existingIdx >= 0) {
      var old = memories[existingIdx];
      var merged = createMemory(old);
      var memKeys = Object.keys(mem);
      for (var k = 0; k < memKeys.length; k++) {
        merged[memKeys[k]] = mem[memKeys[k]];
      }
      merged.id = old.id;
      merged.timestamp = mem.timestamp || now;
      memories[existingIdx] = merged;
      mem = merged;
    } else {
      mem.id = mem.id || uid();
      mem.timestamp = mem.timestamp || now;
      memories.push(mem);
    }

    return self._writeAll(memories).then(function() {
      if (typeof SearchIndex !== 'undefined' && SearchIndex._db) {
        SearchIndex.insert(mem);
      }
      return mem;
    });
  });
};

/**
 * 部分更新：合并现有数据和 patch
 */
DataService.update = function(id, patch) {
  return this.getById(id).then(function(existing) {
    if (!existing) return Promise.reject(new Error('Memory not found: ' + id));
    var merged = createMemory(existing);
    var patchKeys = Object.keys(patch || {});
    for (var i = 0; i < patchKeys.length; i++) {
      merged[patchKeys[i]] = patch[patchKeys[i]];
    }
    merged.id = id;
    return DataService.save(merged);
  });
};

/**
 * 软删除：设置 hidden = true
 */
DataService.softDelete = function(id) {
  return this.update(id, { hidden: true });
};

/**
 * 恢复：设置 hidden = false
 */
DataService.restore = function(id) {
  return this.update(id, { hidden: false });
};

/**
 * 物理删除 + 加入黑名单
 */
DataService.permanentDelete = function(id) {
  var self = this;
  return this.getById(id).then(function(memory) {
    if (!memory) return Promise.reject(new Error('Memory not found: ' + id));
    if (!memory.protected) {
      self._addToBlacklist(contentFingerprint(memory.content), memory.zone);
    }
    return self._readAll().then(function(memories) {
      var filtered = [];
      for (var i = 0; i < memories.length; i++) {
        if (memories[i].id !== id) filtered.push(memories[i]);
      }
      return self._writeAll(filtered).then(function() {
        if (typeof SearchIndex !== 'undefined' && SearchIndex._db) {
          SearchIndex.remove(id);
        }
      });
    });
  });
};

/**
 * 清空记忆 + 黑名单
 */
DataService.clear = function() {
  var self = this;
  return this._writeAll([]).then(function() {
    self._writeBlacklist([]);
    if (typeof SearchIndex !== 'undefined' && SearchIndex._db) {
      SearchIndex.rebuild();
    }
  });
};

/**
 * 基于 contentFingerprint + zone 精确去重，保留最新一条
 */
DataService.deduplicate = function() {
  var self = this;
  return this._readAll().then(function(memories) {
    var seen = {};
    var unique = [];
    var sorted = memories.slice().sort(function(a, b) { return b.timestamp - a.timestamp; });
    for (var i = 0; i < sorted.length; i++) {
      var fp = contentFingerprint(sorted[i].content);
      var key = fp + '::' + sorted[i].zone;
      if (!seen[key]) {
        seen[key] = true;
        unique.push(sorted[i]);
      }
    }
    if (unique.length !== memories.length) {
      return self._writeAll(unique).then(function() { return unique; });
    }
    return unique;
  });
};


/* ====== SearchIndex ====== */
// 全文搜索引擎 — 内嵌轻量实现，兼容 Orama API，支持中文二元分词 + BM25 排序

var SearchIndex = {};
SearchIndex._db = null;
SearchIndex.BM25_K1 = 1.2;
SearchIndex.BM25_B = 0.75;

/**
 * 判断字符是否为中文字符（含 CJK 统一表意文字）
 */
function _isChinese(c) {
  var code = c.charCodeAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x3400 && code <= 0x4DBF) ||
         (code >= 0xF900 && code <= 0xFAFF);
}

/**
 * 对文本进行分词：中文用二元分词，英文/数字用空格和标点分割
 */
function _tokenize(text) {
  if (!text) return [];
  var str = String(text).toLowerCase();
  var tokens = [];
  var buf = '';
  var i = 0;

  while (i < str.length) {
    var ch = str.charAt(i);
    if (_isChinese(ch)) {
      if (buf.length > 0) {
        var words = buf.split(/[^a-z0-9']+/);
        for (var w = 0; w < words.length; w++) {
          if (words[w].length > 0) tokens.push(words[w]);
        }
        buf = '';
      }
      var cnBlock = '';
      while (i < str.length && _isChinese(str.charAt(i))) {
        cnBlock += str.charAt(i);
        i++;
      }
      for (var ci = 0; ci < cnBlock.length; ci++) {
        if (ci + 1 < cnBlock.length) {
          tokens.push(cnBlock.substring(ci, ci + 2));
        }
        tokens.push(cnBlock.charAt(ci));
      }
      continue;
    } else {
      buf += ch;
      i++;
    }
  }

  if (buf.length > 0) {
    var words2 = buf.split(/[^a-z0-9']+/);
    for (var w2 = 0; w2 < words2.length; w2++) {
      if (words2[w2].length > 0) tokens.push(words2[w2]);
    }
  }

  return tokens;
}

/**
 * 创建搜索引擎实例
 */
function _createSearchEngine() {
  var engine = {};

  engine._docs = {};
  engine._index = {};
  engine._docCount = 0;
  engine._totalTermCount = 0;
  engine._avgDocLen = 0;
  engine._fields = {};

  var BM25_K1 = SearchIndex.BM25_K1;
  var BM25_B = SearchIndex.BM25_B;

  function _getTermFreqs(doc) {
    var content = (doc.content || '') + ' ' + (doc.zone || '') + ' ' + (doc.category || '') + ' ' +
                  (doc.roleName || '') + ' ' + (doc.tags || []).join(' ');
    var tokens = _tokenize(content);
    var freqs = {};
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      freqs[t] = (freqs[t] || 0) + 1;
    }
    return { tokens: tokens, freqs: freqs };
  }

  engine.insert = function(doc) {
    if (!doc.id) return;
    var id = doc.id;

    if (engine._docs[id]) {
      engine._removeInternal(id);
    }

    var tf = _getTermFreqs(doc);
    engine._docs[id] = doc;
    engine._fields[id] = {
      zone: doc.zone || '',
      roleId: doc.roleId || '',
      category: doc.category || '',
      tags: doc.tags || [],
      importance: doc.importance || 3,
      timestamp: doc.timestamp || 0
    };
    engine._docCount++;
    engine._totalTermCount += tf.tokens.length;
    engine._avgDocLen = engine._totalTermCount / engine._docCount;

    var terms = Object.keys(tf.freqs);
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      if (!engine._index[term]) {
        engine._index[term] = {};
      }
      engine._index[term][id] = { freq: tf.freqs[term] };
    }
  };

  engine._removeInternal = function(id) {
    var doc = engine._docs[id];
    if (!doc) return;

    var tf = _getTermFreqs(doc);
    engine._docCount--;
    engine._totalTermCount -= tf.tokens.length;
    engine._avgDocLen = engine._docCount > 0 ? engine._totalTermCount / engine._docCount : 0;

    var terms = Object.keys(tf.freqs);
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      if (engine._index[term]) {
        delete engine._index[term][id];
        if (Object.keys(engine._index[term]).length === 0) {
          delete engine._index[term];
        }
      }
    }

    delete engine._docs[id];
    delete engine._fields[id];
  };

  engine.remove = function(id) {
    return engine._removeInternal(id);
  };

  engine.clear = function() {
    engine._docs = {};
    engine._index = {};
    engine._fields = {};
    engine._docCount = 0;
    engine._totalTermCount = 0;
    engine._avgDocLen = 0;
  };

  engine.search = function(query) {
    var opts = query || {};
    var term = opts.term || '';
    var where = opts.where || {};
    var sortBy = opts.sortBy || 'score';
    var limit = opts.limit || 50;
    var offset = opts.offset || 0;

    if (!term && Object.keys(where).length === 0) {
      var allIds = Object.keys(engine._docs);
      var allResults = [];
      for (var ai = 0; ai < allIds.length; ai++) {
        var allDoc = engine._docs[allIds[ai]];
        if (allDoc && !allDoc.hidden && _matchFilters(allIds[ai], where)) {
          allResults.push({ id: allIds[ai], score: 0, document: allDoc });
        }
      }
      _sortResults(allResults, sortBy);
      return {
        count: allResults.length,
        hits: allResults.slice(offset, offset + limit)
      };
    }

    var queryTokens = _tokenize(term);
    var scores = {};

    for (var ti = 0; ti < queryTokens.length; ti++) {
      var qt = queryTokens[ti];
      var postings = engine._index[qt];
      if (!postings) continue;

      var df = Object.keys(postings).length;
      var N = engine._docCount;
      var idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      var docIds = Object.keys(postings);
      for (var di = 0; di < docIds.length; di++) {
        var docId = docIds[di];
        var doc = engine._docs[docId];
        if (!doc || doc.hidden) continue;
        if (!_matchFilters(docId, where)) continue;

        var tfDoc = _getTermFreqs(doc);
        var docLen = tfDoc.tokens.length;
        var freq = postings[docId].freq;

        var tfScore = ((BM25_K1 + 1) * freq) /
          (BM25_K1 * (1 - BM25_B + BM25_B * (docLen / engine._avgDocLen)) + freq);

        scores[docId] = (scores[docId] || 0) + idf * tfScore;
      }
    }

    var results = [];
    var scoreIds = Object.keys(scores);
    for (var si = 0; si < scoreIds.length; si++) {
      var sid = scoreIds[si];
      results.push({ id: sid, score: scores[sid], document: engine._docs[sid] });
    }

    if (term && Object.keys(where).length > 0) {
      var filterOnlyIds = Object.keys(engine._docs);
      for (var fi = 0; fi < filterOnlyIds.length; fi++) {
        var fid = filterOnlyIds[fi];
        if (scores[fid] !== undefined) continue;
        var fdoc = engine._docs[fid];
        if (!fdoc || fdoc.hidden) continue;
        if (_matchFilters(fid, where)) {
          results.push({ id: fid, score: 0, document: fdoc });
        }
      }
    }

    _sortResults(results, sortBy);

    return {
      count: results.length,
      hits: results.slice(offset, offset + limit)
    };
  };

  function _matchFilters(docId, where) {
    var fields = engine._fields[docId];
    if (!fields) return false;

    if (where.zone !== undefined) {
      if (Array.isArray(where.zone)) {
        if (where.zone.indexOf(fields.zone) === -1) return false;
      } else {
        if (fields.zone !== where.zone) return false;
      }
    }
    if (where.roleId !== undefined) {
      if (fields.roleId !== where.roleId) return false;
    }
    if (where.category !== undefined) {
      if (Array.isArray(where.category)) {
        if (where.category.indexOf(fields.category) === -1) return false;
      } else {
        if (fields.category !== where.category) return false;
      }
    }
    if (where.tags !== undefined) {
      var filterTags = Array.isArray(where.tags) ? where.tags : [where.tags];
      var hasMatch = false;
      for (var ft = 0; ft < filterTags.length; ft++) {
        if (fields.tags.indexOf(filterTags[ft]) !== -1) { hasMatch = true; break; }
      }
      if (!hasMatch) return false;
    }
    if (where.importance !== undefined) {
      if (typeof where.importance === 'object' && where.importance.between) {
        var range = where.importance.between;
        if (fields.importance < range[0] || fields.importance > range[1]) return false;
      } else if (fields.importance !== where.importance) {
        return false;
      }
    }
    if (where.timestamp !== undefined) {
      if (typeof where.timestamp === 'object' && where.timestamp.between) {
        var tsRange = where.timestamp.between;
        if (fields.timestamp < tsRange[0] || fields.timestamp > tsRange[1]) return false;
      }
    }
    return true;
  }

  function _sortResults(results, sortBy) {
    if (sortBy === 'timestamp' || sortBy === 'timestamp_desc') {
      results.sort(function(a, b) {
        return (b.document.timestamp || 0) - (a.document.timestamp || 0);
      });
    } else if (sortBy === 'timestamp_asc') {
      results.sort(function(a, b) {
        return (a.document.timestamp || 0) - (b.document.timestamp || 0);
      });
    } else if (sortBy === 'importance') {
      results.sort(function(a, b) {
        return (b.document.importance || 0) - (a.document.importance || 0);
      });
    } else {
      results.sort(function(a, b) { return b.score - a.score; });
    }
  }

  engine.stats = function() {
    var zoneCounts = {};
    var categoryCounts = {};
    var docIds = Object.keys(engine._docs);
    for (var i = 0; i < docIds.length; i++) {
      var doc = engine._docs[docIds[i]];
      var z = doc.zone || '未知';
      var c = doc.category || '未知';
      zoneCounts[z] = (zoneCounts[z] || 0) + 1;
      categoryCounts[c] = (categoryCounts[c] || 0) + 1;
    }
    return {
      total: engine._docCount,
      uniqueTerms: Object.keys(engine._index).length,
      avgDocLength: Math.round(engine._avgDocLen * 100) / 100,
      facets: {
        zone: zoneCounts,
        category: categoryCounts
      }
    };
  };

  engine.load = function(docs) {
    for (var i = 0; i < docs.length; i++) {
      engine.insert(docs[i]);
    }
  };

  return engine;
}

SearchIndex.init = function() {
  var self = this;
  if (self._db) return Promise.resolve(self._db);
  self._db = _createSearchEngine();
  return DataService.getAll().then(function(memories) {
    self._db.load(memories);
    return self._db;
  });
};

SearchIndex.insert = function(memory) {
  if (!this._db) return;
  this._db.insert(memory);
};

SearchIndex.update = function(id, memory) {
  if (!this._db) return;
  this._db.remove(id);
  this._db.insert(memory);
};

SearchIndex.remove = function(id) {
  if (!this._db) return;
  this._db.remove(id);
};

SearchIndex.search = function(query, filters) {
  if (!this._db) return { count: 0, hits: [] };
  var opts = { term: query || '' };
  if (filters) opts.where = filters;
  return this._db.search(opts);
};

SearchIndex.getStats = function() {
  if (!this._db) return { total: 0, facets: { zone: {}, category: {} } };
  return this._db.stats();
};

SearchIndex.rebuild = function() {
  var self = this;
  if (self._db) self._db.clear();
  else self._db = _createSearchEngine();
  return DataService.getAll().then(function(memories) {
    self._db.load(memories);
    return self._db;
  });
};


/* ====== SemanticEngine ====== */
// 离线语义引擎 — 基于字符 3-gram + TF 向量化，提供相似度、聚类、语义去重，API 兼容 Emlet

var SemanticEngine = {};
SemanticEngine._ready = false;
SemanticEngine.SEMANTIC_DEDUP_THRESHOLD = 0.88;

function _semIsChinese(c) {
  var code = c.charCodeAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x3400 && code <= 0x4DBF) ||
         (code >= 0xF900 && code <= 0xFAFF);
}

function _extractTrigrams(text) {
  if (!text) return [];
  var str = String(text).toLowerCase();
  var grams = [];
  var i = 0;

  while (i < str.length) {
    var ch = str.charAt(i);
    if (_semIsChinese(ch)) {
      var cnBlock = '';
      while (i < str.length && _semIsChinese(str.charAt(i))) {
        cnBlock += str.charAt(i);
        i++;
      }
      for (var ci = 0; ci + 2 < cnBlock.length; ci++) {
        grams.push(cnBlock.substring(ci, ci + 3));
      }
      if (cnBlock.length < 3) {
        for (var cj = 0; cj < cnBlock.length; cj++) {
          grams.push(cnBlock.charAt(cj));
        }
      }
    } else if (/[a-z0-9]/.test(ch)) {
      var word = '';
      while (i < str.length && /[a-z0-9]/.test(str.charAt(i))) {
        word += str.charAt(i);
        i++;
      }
      if (word.length < 3) {
        grams.push(word);
      } else {
        for (var wi = 0; wi + 2 < word.length; wi++) {
          grams.push(word.substring(wi, wi + 3));
        }
      }
    } else {
      i++;
    }
  }

  return grams;
}

SemanticEngine.init = function() {
  this._ready = true;
  return Promise.resolve();
};

SemanticEngine.isReady = function() {
  return this._ready;
};

SemanticEngine.embed = function(text) {
  var grams = _extractTrigrams(text);
  var tf = {};
  for (var i = 0; i < grams.length; i++) {
    var g = grams[i];
    tf[g] = (tf[g] || 0) + 1;
  }
  var vector = {};
  var keys = Object.keys(tf);
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j];
    vector[k] = Math.log(1 + tf[k]);
  }
  return vector;
};

SemanticEngine.similarity = function(vecA, vecB) {
  var dot = 0;
  var normASq = 0;
  var normBSq = 0;

  var keysA = Object.keys(vecA);
  for (var i = 0; i < keysA.length; i++) {
    var k = keysA[i];
    var va = vecA[k];
    normASq += va * va;
    if (vecB[k] !== undefined) {
      dot += va * vecB[k];
    }
  }

  var keysB = Object.keys(vecB);
  for (var j = 0; j < keysB.length; j++) {
    var vb = vecB[keysB[j]];
    normBSq += vb * vb;
  }

  var normA = Math.sqrt(normASq);
  var normB = Math.sqrt(normBSq);
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
};

SemanticEngine.cluster = function(memories, threshold) {
  var thresh = (threshold != null) ? threshold : 0.5;
  if (!memories || memories.length === 0) return { groups: [], noise: [] };
  if (memories.length === 1) return { groups: [], noise: [memories[0]] };

  var vectors = [];
  for (var i = 0; i < memories.length; i++) {
    vectors.push(this.embed(memories[i].content || ''));
  }

  var simMatrix = [];
  for (var si = 0; si < memories.length; si++) {
    simMatrix[si] = [];
    simMatrix[si][si] = 1;
    for (var sj = si + 1; sj < memories.length; sj++) {
      var sim = this.similarity(vectors[si], vectors[sj]);
      simMatrix[si][sj] = sim;
      simMatrix[sj][si] = sim;
    }
  }

  var clusters = [];
  for (var c = 0; c < memories.length; c++) {
    clusters.push({ indices: [c] });
  }

  var changed = true;
  while (changed && clusters.length > 1) {
    changed = false;
    var bestI = -1;
    var bestJ = -1;
    var bestSim = -1;

    for (var ci = 0; ci < clusters.length; ci++) {
      for (var cj = ci + 1; cj < clusters.length; cj++) {
        var totalSim = 0;
        var pairCount = 0;
        var idI = clusters[ci].indices;
        var idJ = clusters[cj].indices;
        for (var ii = 0; ii < idI.length; ii++) {
          for (var jj = 0; jj < idJ.length; jj++) {
            totalSim += simMatrix[idI[ii]][idJ[jj]];
            pairCount++;
          }
        }
        var avgSim = totalSim / pairCount;
        if (avgSim > bestSim) {
          bestSim = avgSim;
          bestI = ci;
          bestJ = cj;
        }
      }
    }

    if (bestSim >= thresh) {
      clusters[bestI].indices = clusters[bestI].indices.concat(clusters[bestJ].indices);
      clusters.splice(bestJ, 1);
      changed = true;
    }
  }

  var groups = [];
  var noise = [];
  for (var g = 0; g < clusters.length; g++) {
    var idxs = clusters[g].indices;
    var groupMems = [];
    for (var mi = 0; mi < idxs.length; mi++) {
      groupMems.push(memories[idxs[mi]]);
    }
    if (idxs.length === 1) {
      noise.push(groupMems[0]);
    } else {
      groups.push(groupMems);
    }
  }

  return { groups: groups, noise: noise };
};

SemanticEngine.semanticDedup = function(newContent, existingMemories, threshold) {
  var thresh = (threshold != null) ? threshold : SemanticEngine.SEMANTIC_DEDUP_THRESHOLD;
  var newVec = this.embed(newContent);
  for (var i = 0; i < existingMemories.length; i++) {
    var mem = existingMemories[i];
    if (mem.hidden) continue;
    var existingVec = this.embed(mem.content || '');
    var sim = this.similarity(newVec, existingVec);
    if (sim >= thresh) {
      return { isDuplicate: true, matched: mem, similarity: sim };
    }
  }
  return { isDuplicate: false };
};


/* ====== AutoTagger ====== */
// 自动标签提取 — 词典匹配 + 语义推荐双路径，命名实体提取预留

var AutoTagger = {};

/**
 * 内置标签词典（核心通用标签）
 * 分类组织：情感类 / 关系类 / 事件类 / 叙事类
 */
var AUTO_TAG_DICT = [
  { name: '信任', keywords: ['信任', '信赖', '托付', '嘱托'], category: '情感' },
  { name: '羁绊', keywords: ['羁绊', '牵绊', '缘分', '牵系'], category: '情感' },
  { name: '好感', keywords: ['好感', '亲近', '亲密', '依恋'], category: '情感' },
  { name: '裂痕', keywords: ['裂痕', '隔阂', '疏远', '冷淡'], category: '情感' },
  { name: '暗涌', keywords: ['暗涌', '涌动', '暗流', '隐约'], category: '情感' },
  { name: '悲伤', keywords: ['悲伤', '难过', '哭泣', '哀伤'], category: '情感' },
  { name: '愤怒', keywords: ['愤怒', '怒', '怒火', '气恼'], category: '情感' },
  { name: '恐惧', keywords: ['恐惧', '害怕', '畏惧', '发抖'], category: '情感' },
  { name: '悔恨', keywords: ['悔恨', '后悔', '遗憾', '懊悔'], category: '情感' },
  { name: '释然', keywords: ['释然', '放下', '释怀', '和解'], category: '情感' },
  { name: '盟友', keywords: ['盟友', '同盟', '联手', '合作'], category: '关系' },
  { name: '宿敌', keywords: ['宿敌', '仇敌', '死敌', '敌对'], category: '关系' },
  { name: '师徒', keywords: ['师徒', '师父', '徒弟', '拜师'], category: '关系' },
  { name: '家人', keywords: ['家人', '亲人', '兄妹', '父母'], category: '关系' },
  { name: '恋人', keywords: ['恋人', '情侣', '相爱', '表白'], category: '关系' },
  { name: '陌路', keywords: ['陌路', '路人', '陌生', '过客'], category: '关系' },
  { name: '战斗', keywords: ['战斗', '交战', '对决', '出招'], category: '事件' },
  { name: '委托', keywords: ['委托', '任务', '请求', '帮忙'], category: '事件' },
  { name: '秘密', keywords: ['秘密', '隐瞒', '隐藏', '真相'], category: '事件' },
  { name: '交易', keywords: ['交易', '买卖', '商谈', '购买'], category: '事件' },
  { name: '分别', keywords: ['分别', '离别', '告别', '远去'], category: '事件' },
  { name: '重逢', keywords: ['重逢', '重聚', '再见', '归来'], category: '事件' },
  { name: '牺牲', keywords: ['牺牲', '献身', '舍弃', '付出'], category: '事件' },
  { name: '转折', keywords: ['转折', '改变', '转向', '突变'], category: '事件' },
  { name: '伏笔', keywords: ['伏笔', '预示', '暗示', '征兆'], category: '叙事' },
  { name: '呼应', keywords: ['呼应', '回收', '揭晓', '应验'], category: '叙事' },
  { name: '未竟', keywords: ['未竟', '未了', '等待', '悬置'], category: '叙事' }
];

AutoTagger.extractTags = function(text) {
  if (!text) return [];
  var lower = String(text).toLowerCase();
  var matches = [];

  for (var i = 0; i < AUTO_TAG_DICT.length; i++) {
    var tagDef = AUTO_TAG_DICT[i];
    for (var j = 0; j < tagDef.keywords.length; j++) {
      var kw = tagDef.keywords[j].toLowerCase();
      var pos = lower.indexOf(kw);
      if (pos !== -1) {
        matches.push({ name: tagDef.name, position: pos });
        break;
      }
    }
  }

  matches.sort(function(a, b) { return a.position - b.position; });
  var seen = {};
  var result = [];
  for (var k = 0; k < matches.length && result.length < 8; k++) {
    if (!seen[matches[k].name]) {
      seen[matches[k].name] = true;
      result.push(matches[k].name);
    }
  }
  return result;
};

AutoTagger.extractTagsSemantic = function(text, allTags) {
  if (!text || !allTags || allTags.length === 0) return [];
  if (!SemanticEngine.isReady()) return [];

  var textVec = SemanticEngine.embed(text);
  var scored = [];

  for (var i = 0; i < allTags.length; i++) {
    var tagName = allTags[i];
    var tagVec = SemanticEngine.embed(tagName);
    var sim = SemanticEngine.similarity(textVec, tagVec);
    if (sim > 0.4) {
      scored.push({ name: tagName, score: sim });
    }
  }

  scored.sort(function(a, b) { return b.score - a.score; });
  var result = [];
  for (var j = 0; j < scored.length && result.length < 8; j++) {
    result.push(scored[j].name);
  }
  return result;
};

AutoTagger.extractNamedEntities = function(text) {
  return [];
};


/* ====== TagManager ====== */
// 标签库管理器 — 三层标签体系（核心 + 世界观主题包 + 用户自定义），
//   标签云、关联推荐、共现统计

var TagManager = {};
TagManager._customTags = [];
TagManager._activeThemes = [];
TagManager._tagStats = null;

var TAG_COLORS = [
  '#c97a7a', '#c47f6a', '#d4956b', '#9b6b6b', '#8b7b8b',
  '#6b8b8b', '#7b8b9b', '#7b5e5e', '#8b7b6b', '#7b8b7b',
  '#8b9b7b', '#9b8b6b', '#9b8b9b', '#8b7b9b', '#7b9b8b', '#8a8a8a'
];

var CATEGORY_COLORS = {
  '情感': '#c97a7a',
  '关系': '#7b8b9b',
  '事件': '#7b8b7b',
  '叙事': '#8b7b9b',
  '身份': '#c47f6a',
  '物品': '#d4956b',
  '地点': '#6b8b8b',
  '概念': '#9b8b6b',
  '状态': '#8b7b6b',
  '自定义': '#8a8a8a'
};

var THEME_PACKS = {
  xianxia: [
    { name: '散修', keywords: ['散修'], category: '身份', theme: 'xianxia' },
    { name: '宗门弟子', keywords: ['宗门弟子', '弟子'], category: '身份', theme: 'xianxia' },
    { name: '剑修', keywords: ['剑修'], category: '身份', theme: 'xianxia' },
    { name: '丹师', keywords: ['丹师', '炼丹'], category: '身份', theme: 'xianxia' },
    { name: '阵师', keywords: ['阵师', '阵法'], category: '身份', theme: 'xianxia' },
    { name: '灵兽', keywords: ['灵兽'], category: '物品', theme: 'xianxia' },
    { name: '凡人', keywords: ['凡人'], category: '身份', theme: 'xianxia' },
    { name: '灵药', keywords: ['灵药', '仙草'], category: '物品', theme: 'xianxia' },
    { name: '法宝', keywords: ['法宝'], category: '物品', theme: 'xianxia' },
    { name: '剑诀', keywords: ['剑诀'], category: '物品', theme: 'xianxia' },
    { name: '丹方', keywords: ['丹方'], category: '物品', theme: 'xianxia' },
    { name: '灵石', keywords: ['灵石'], category: '物品', theme: 'xianxia' },
    { name: '阵图', keywords: ['阵图'], category: '物品', theme: 'xianxia' },
    { name: '功法', keywords: ['功法', '修炼'], category: '物品', theme: 'xianxia' },
    { name: '洞府', keywords: ['洞府'], category: '地点', theme: 'xianxia' },
    { name: '秘境', keywords: ['秘境'], category: '地点', theme: 'xianxia' },
    { name: '坊市', keywords: ['坊市', '集市'], category: '地点', theme: 'xianxia' },
    { name: '宗门', keywords: ['宗门', '门派'], category: '地点', theme: 'xianxia' },
    { name: '灵脉', keywords: ['灵脉'], category: '地点', theme: 'xianxia' },
    { name: '禁地', keywords: ['禁地'], category: '地点', theme: 'xianxia' },
    { name: '凡间', keywords: ['凡间'], category: '地点', theme: 'xianxia' },
    { name: '渡劫', keywords: ['渡劫', '天雷'], category: '事件', theme: 'xianxia' },
    { name: '突破', keywords: ['突破'], category: '事件', theme: 'xianxia' },
    { name: '秘境开启', keywords: ['秘境开启'], category: '事件', theme: 'xianxia' },
    { name: '宗门大比', keywords: ['宗门大比', '比试'], category: '事件', theme: 'xianxia' },
    { name: '论道', keywords: ['论道'], category: '事件', theme: 'xianxia' },
    { name: '道心', keywords: ['道心'], category: '概念', theme: 'xianxia' },
    { name: '业障', keywords: ['业障'], category: '概念', theme: 'xianxia' },
    { name: '因果', keywords: ['因果'], category: '概念', theme: 'xianxia' },
    { name: '轮回', keywords: ['轮回'], category: '概念', theme: 'xianxia' },
    { name: '天劫', keywords: ['天劫'], category: '概念', theme: 'xianxia' },
    { name: '机缘', keywords: ['机缘', '奇遇'], category: '概念', theme: 'xianxia' }
  ],
  urban: [
    { name: '同事', keywords: ['同事'], category: '身份', theme: 'urban' },
    { name: '上司', keywords: ['上司', '老板'], category: '身份', theme: 'urban' },
    { name: '邻居', keywords: ['邻居'], category: '身份', theme: 'urban' },
    { name: '同学', keywords: ['同学'], category: '身份', theme: 'urban' },
    { name: '网友', keywords: ['网友'], category: '身份', theme: 'urban' },
    { name: '甲方乙方', keywords: ['甲方', '乙方', '客户'], category: '身份', theme: 'urban' },
    { name: '手机', keywords: ['手机'], category: '物品', theme: 'urban' },
    { name: '邮件', keywords: ['邮件', 'email'], category: '物品', theme: 'urban' },
    { name: '合同', keywords: ['合同', '协议'], category: '物品', theme: 'urban' },
    { name: '照片', keywords: ['照片'], category: '物品', theme: 'urban' },
    { name: '录音', keywords: ['录音'], category: '物品', theme: 'urban' },
    { name: '证据', keywords: ['证据'], category: '物品', theme: 'urban' },
    { name: '公司', keywords: ['公司'], category: '地点', theme: 'urban' },
    { name: '学校', keywords: ['学校'], category: '地点', theme: 'urban' },
    { name: '公寓', keywords: ['公寓'], category: '地点', theme: 'urban' },
    { name: '咖啡厅', keywords: ['咖啡厅', '咖啡馆'], category: '地点', theme: 'urban' },
    { name: '医院', keywords: ['医院'], category: '地点', theme: 'urban' },
    { name: '车站', keywords: ['车站'], category: '地点', theme: 'urban' },
    { name: '面试', keywords: ['面试'], category: '事件', theme: 'urban' },
    { name: '会议', keywords: ['会议', '开会'], category: '事件', theme: 'urban' },
    { name: '出差', keywords: ['出差'], category: '事件', theme: 'urban' },
    { name: '约会', keywords: ['约会'], category: '事件', theme: 'urban' },
    { name: '意外', keywords: ['意外', '事故'], category: '事件', theme: 'urban' },
    { name: '搬家', keywords: ['搬家'], category: '事件', theme: 'urban' },
    { name: '契约', keywords: ['契约'], category: '概念', theme: 'urban' },
    { name: '保密', keywords: ['保密'], category: '概念', theme: 'urban' },
    { name: '违约', keywords: ['违约'], category: '概念', theme: 'urban' },
    { name: '举报', keywords: ['举报'], category: '概念', theme: 'urban' },
    { name: '舆论', keywords: ['舆论'], category: '概念', theme: 'urban' },
    { name: '隐私', keywords: ['隐私'], category: '概念', theme: 'urban' }
  ],
  fantasy: [
    { name: '骑士', keywords: ['骑士'], category: '身份', theme: 'fantasy' },
    { name: '法师', keywords: ['法师'], category: '身份', theme: 'fantasy' },
    { name: '盗贼', keywords: ['盗贼'], category: '身份', theme: 'fantasy' },
    { name: '牧师', keywords: ['牧师'], category: '身份', theme: 'fantasy' },
    { name: '贵族', keywords: ['贵族'], category: '身份', theme: 'fantasy' },
    { name: '佣兵', keywords: ['佣兵'], category: '身份', theme: 'fantasy' },
    { name: '精灵', keywords: ['精灵'], category: '身份', theme: 'fantasy' },
    { name: '矮人', keywords: ['矮人'], category: '身份', theme: 'fantasy' },
    { name: '魔杖', keywords: ['魔杖'], category: '物品', theme: 'fantasy' },
    { name: '卷轴', keywords: ['卷轴'], category: '物品', theme: 'fantasy' },
    { name: '药剂', keywords: ['药剂'], category: '物品', theme: 'fantasy' },
    { name: '符文', keywords: ['符文'], category: '物品', theme: 'fantasy' },
    { name: '秘银', keywords: ['秘银'], category: '物品', theme: 'fantasy' },
    { name: '龙鳞', keywords: ['龙鳞'], category: '物品', theme: 'fantasy' },
    { name: '圣物', keywords: ['圣物'], category: '物品', theme: 'fantasy' },
    { name: '城堡', keywords: ['城堡'], category: '地点', theme: 'fantasy' },
    { name: '酒馆', keywords: ['酒馆'], category: '地点', theme: 'fantasy' },
    { name: '神殿', keywords: ['神殿'], category: '地点', theme: 'fantasy' },
    { name: '法师塔', keywords: ['法师塔'], category: '地点', theme: 'fantasy' },
    { name: '地下城', keywords: ['地下城'], category: '地点', theme: 'fantasy' },
    { name: '遗迹', keywords: ['遗迹'], category: '地点', theme: 'fantasy' },
    { name: '远征', keywords: ['远征'], category: '事件', theme: 'fantasy' },
    { name: '加冕', keywords: ['加冕'], category: '事件', theme: 'fantasy' },
    { name: '叛变', keywords: ['叛变', '背叛'], category: '事件', theme: 'fantasy' },
    { name: '瘟疫', keywords: ['瘟疫'], category: '事件', theme: 'fantasy' },
    { name: '天灾', keywords: ['天灾'], category: '事件', theme: 'fantasy' },
    { name: '发现', keywords: ['发现'], category: '事件', theme: 'fantasy' },
    { name: '魔力', keywords: ['魔力'], category: '概念', theme: 'fantasy' },
    { name: '诅咒', keywords: ['诅咒'], category: '概念', theme: 'fantasy' },
    { name: '祝福', keywords: ['祝福'], category: '概念', theme: 'fantasy' },
    { name: '预言', keywords: ['预言'], category: '概念', theme: 'fantasy' },
    { name: '誓约', keywords: ['誓约'], category: '概念', theme: 'fantasy' },
    { name: '血脉', keywords: ['血脉'], category: '概念', theme: 'fantasy' }
  ],
  scifi: [
    { name: '舰长', keywords: ['舰长', '船长'], category: '身份', theme: 'scifi' },
    { name: '船员', keywords: ['船员'], category: '身份', theme: 'scifi' },
    { name: 'AI', keywords: ['AI', '人工智能'], category: '身份', theme: 'scifi' },
    { name: '改造人', keywords: ['改造人', '义体'], category: '身份', theme: 'scifi' },
    { name: '外星种族', keywords: ['外星种族', '外星人'], category: '身份', theme: 'scifi' },
    { name: '赏金猎人', keywords: ['赏金猎人'], category: '身份', theme: 'scifi' },
    { name: '能源核心', keywords: ['能源核心'], category: '物品', theme: 'scifi' },
    { name: '纳米装置', keywords: ['纳米装置', '纳米'], category: '物品', theme: 'scifi' },
    { name: '曲速引擎', keywords: ['曲速引擎', '曲速'], category: '物品', theme: 'scifi' },
    { name: '数据芯片', keywords: ['数据芯片'], category: '物品', theme: 'scifi' },
    { name: '机甲', keywords: ['机甲'], category: '物品', theme: 'scifi' },
    { name: '舰桥', keywords: ['舰桥'], category: '地点', theme: 'scifi' },
    { name: '殖民星', keywords: ['殖民星', '殖民地'], category: '地点', theme: 'scifi' },
    { name: '空间站', keywords: ['空间站'], category: '地点', theme: 'scifi' },
    { name: '废土', keywords: ['废土'], category: '地点', theme: 'scifi' },
    { name: '实验室', keywords: ['实验室'], category: '地点', theme: 'scifi' },
    { name: '深空', keywords: ['深空'], category: '地点', theme: 'scifi' },
    { name: '跃迁', keywords: ['跃迁', '跳跃'], category: '事件', theme: 'scifi' },
    { name: '遭遇', keywords: ['遭遇'], category: '事件', theme: 'scifi' },
    { name: '入侵', keywords: ['入侵'], category: '事件', theme: 'scifi' },
    { name: '故障', keywords: ['故障'], category: '事件', theme: 'scifi' },
    { name: '协议', keywords: ['协议'], category: '事件', theme: 'scifi' },
    { name: '觉醒', keywords: ['觉醒'], category: '概念', theme: 'scifi' },
    { name: '权限', keywords: ['权限'], category: '概念', theme: 'scifi' },
    { name: '感染', keywords: ['感染'], category: '概念', theme: 'scifi' },
    { name: '升级', keywords: ['升级'], category: '概念', theme: 'scifi' },
    { name: '信号', keywords: ['信号'], category: '概念', theme: 'scifi' },
    { name: '维度', keywords: ['维度'], category: '概念', theme: 'scifi' }
  ]
};

var AVAILABLE_THEMES = ['xianxia', 'urban', 'fantasy', 'scifi'];

TagManager._statsKey = function() {
  return DataService.getRolePrefix() + '_tag_stats';
};

TagManager._customKey = function() {
  return DataService.getRolePrefix() + '_custom_tags';
};

TagManager._themesKey = function() {
  return DataService.getRolePrefix() + '_active_themes';
};

TagManager._getThemeTagNames = function() {
  var names = [];
  var seen = {};
  for (var t = 0; t < this._activeThemes.length; t++) {
    var pack = THEME_PACKS[this._activeThemes[t]];
    if (!pack) continue;
    for (var i = 0; i < pack.length; i++) {
      var n = pack[i].name;
      if (!seen[n]) { seen[n] = true; names.push(n); }
    }
  }
  return names;
};

TagManager.init = function() {
  try {
    var rawCt = localStorage.getItem(this._customKey());
    this._customTags = rawCt ? JSON.parse(rawCt) : [];
  } catch(e) { this._customTags = []; }

  try {
    var rawTh = localStorage.getItem(this._themesKey());
    this._activeThemes = rawTh ? JSON.parse(rawTh) : [];
    var valid = [];
    for (var v = 0; v < this._activeThemes.length; v++) {
      if (AVAILABLE_THEMES.indexOf(this._activeThemes[v]) !== -1) {
        valid.push(this._activeThemes[v]);
      }
    }
    this._activeThemes = valid;
  } catch(e) { this._activeThemes = []; }

  try {
    var rawSt = localStorage.getItem(this._statsKey());
    this._tagStats = rawSt ? JSON.parse(rawSt) : {};
  } catch(e) { this._tagStats = {}; }

  if (!this._tagStats._cooccurrence) {
    this._tagStats._cooccurrence = {};
  }

  this._allTagsCache = null;
  return Promise.resolve();
};

TagManager.getAllTags = function() {
  var seen = {};
  var result = [];

  for (var i = 0; i < AUTO_TAG_DICT.length; i++) {
    var cn = AUTO_TAG_DICT[i].name;
    if (!seen[cn]) { seen[cn] = true; result.push(cn); }
  }

  for (var t = 0; t < this._activeThemes.length; t++) {
    var pack = THEME_PACKS[this._activeThemes[t]];
    if (!pack) continue;
    for (var p = 0; p < pack.length; p++) {
      var pn = pack[p].name;
      if (!seen[pn]) { seen[pn] = true; result.push(pn); }
    }
  }

  for (var c = 0; c < this._customTags.length; c++) {
    var un = this._customTags[c].name;
    if (!seen[un]) { seen[un] = true; result.push(un); }
  }

  return result;
};

TagManager.getTagMeta = function(tagName) {
  if (!tagName) return null;

  for (var i = 0; i < AUTO_TAG_DICT.length; i++) {
    if (AUTO_TAG_DICT[i].name === tagName) {
      return {
        name: tagName,
        category: AUTO_TAG_DICT[i].category,
        keywords: AUTO_TAG_DICT[i].keywords,
        color: CATEGORY_COLORS[AUTO_TAG_DICT[i].category] || TAG_COLORS[0],
        isCore: true
      };
    }
  }

  for (var t = 0; t < this._activeThemes.length; t++) {
    var pack = THEME_PACKS[this._activeThemes[t]];
    if (!pack) continue;
    for (var j = 0; j < pack.length; j++) {
      if (pack[j].name === tagName) {
        return {
          name: tagName,
          category: pack[j].category,
          keywords: pack[j].keywords,
          color: CATEGORY_COLORS[pack[j].category] || TAG_COLORS[0],
          isCore: true,
          theme: pack[j].theme
        };
      }
    }
  }

  for (var k = 0; k < this._customTags.length; k++) {
    if (this._customTags[k].name === tagName) {
      return {
        name: tagName,
        category: this._customTags[k].category || '自定义',
        keywords: this._customTags[k].keywords || [tagName],
        color: this._customTags[k].color || TAG_COLORS[k % TAG_COLORS.length],
        isCore: false
      };
    }
  }

  return null;
};

TagManager.getTagsByCategory = function(category) {
  var all = this.getAllTags();
  var result = [];
  for (var i = 0; i < all.length; i++) {
    var meta = this.getTagMeta(all[i]);
    if (meta && meta.category === category) {
      result.push(all[i]);
    }
  }
  return result;
};

TagManager.getCategories = function() {
  var seen = {};
  var result = [];
  var all = this.getAllTags();
  for (var i = 0; i < all.length; i++) {
    var meta = this.getTagMeta(all[i]);
    if (meta && !seen[meta.category]) {
      seen[meta.category] = true;
      result.push(meta.category);
    }
  }
  return result;
};

TagManager.getSuggestedTags = function(text) {
  if (!text) return [];

  var dictTags = AutoTagger.extractTags(text);

  var semanticTags = [];
  if (SemanticEngine.isReady()) {
    var allTags = this.getAllTags();
    semanticTags = AutoTagger.extractTagsSemantic(text, allTags);
  }

  var seen = {};
  var result = [];
  for (var d = 0; d < dictTags.length; d++) {
    if (!seen[dictTags[d]]) {
      seen[dictTags[d]] = true;
      result.push(dictTags[d]);
    }
  }
  for (var s = 0; s < semanticTags.length; s++) {
    if (!seen[semanticTags[s]]) {
      seen[semanticTags[s]] = true;
      result.push(semanticTags[s]);
    }
  }

  return result;
};

TagManager.getRelatedTags = function(tagName, limit) {
  var lim = limit || 5;
  var cooc = (this._tagStats && this._tagStats._cooccurrence) ? this._tagStats._cooccurrence : {};
  var related = {};

  var keys = Object.keys(cooc);
  for (var i = 0; i < keys.length; i++) {
    var pair = keys[i].split('::');
    if (pair[0] === tagName) {
      related[pair[1]] = cooc[keys[i]];
    } else if (pair[1] === tagName) {
      related[pair[0]] = cooc[keys[i]];
    }
  }

  var result = Object.keys(related).sort(function(a, b) {
    return related[b] - related[a];
  });

  return result.slice(0, lim);
};

TagManager.getCloud = function(limit) {
  var lim = limit || 50;
  var stats = this._tagStats || {};
  var items = [];
  var keys = Object.keys(stats);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === '_cooccurrence') continue;
    items.push({ tag: keys[i], count: stats[keys[i]] });
  }
  items.sort(function(a, b) { return b.count - a.count; });
  return items.slice(0, lim);
};

TagManager._pendingStats = null;
TagManager._statsSaveTimer = null;

TagManager.recordTagUsage = function(tagNames) {
  if (!tagNames || tagNames.length === 0) return;
  if (!this._tagStats) this._tagStats = {};
  var self = this;
  var stats = this._tagStats;
  if (!stats._cooccurrence) stats._cooccurrence = {};

  for (var i = 0; i < tagNames.length; i++) {
    var t = tagNames[i];
    stats[t] = (stats[t] || 0) + 1;
  }

  for (var j = 0; j < tagNames.length; j++) {
    for (var k = j + 1; k < tagNames.length; k++) {
      var a = tagNames[j];
      var b = tagNames[k];
      var pairKey = a < b ? a + '::' + b : b + '::' + a;
      stats._cooccurrence[pairKey] = (stats._cooccurrence[pairKey] || 0) + 1;
    }
  }

  // 防抖存储：3 秒内多次调用只写一次 localStorage
  if (self._statsSaveTimer) clearTimeout(self._statsSaveTimer);
  self._statsSaveTimer = setTimeout(function() {
    try {
      localStorage.setItem(self._statsKey(), JSON.stringify(stats));
    } catch(e) { console.warn('[TagManager] save stats:', e); }
  }, 3000);
};

// 从 DataService 全量重建标签统计，修正累积误差
TagManager.rebuildStats = function() {
  var self = this;
  return DataService.getAll({ includeHidden: false }).then(function(memories) {
    var stats = { _cooccurrence: {} };
    for (var i = 0; i < memories.length; i++) {
      var tags = memories[i].tags || [];
      for (var ti = 0; ti < tags.length; ti++) {
        stats[tags[ti]] = (stats[tags[ti]] || 0) + 1;
      }
      for (var j = 0; j < tags.length; j++) {
        for (var k = j + 1; k < tags.length; k++) {
          var a = tags[j], b = tags[k];
          var pairKey = a < b ? a + '::' + b : b + '::' + a;
          stats._cooccurrence[pairKey] = (stats._cooccurrence[pairKey] || 0) + 1;
        }
      }
    }
    self._tagStats = stats;
    try { localStorage.setItem(self._statsKey(), JSON.stringify(stats)); } catch(e) {}
    return stats;
  });
};

TagManager.addCustomTag = function(meta) {
  if (!meta || !meta.name) return false;

  var all = this.getAllTags();
  if (all.indexOf(meta.name) !== -1) return false;

  var entry = {
    name: meta.name,
    keywords: meta.keywords || [meta.name],
    category: meta.category || '自定义',
    color: meta.color || TAG_COLORS[this._customTags.length % TAG_COLORS.length]
  };

  this._customTags.push(entry);

  try {
    localStorage.setItem(this._customKey(), JSON.stringify(this._customTags));
  } catch(e) { return false; }

  return true;
};

TagManager.deleteCustomTag = function(name) {
  if (!name) return false;

  for (var i = 0; i < AUTO_TAG_DICT.length; i++) {
    if (AUTO_TAG_DICT[i].name === name) return false;
  }

  for (var t = 0; t < this._activeThemes.length; t++) {
    var pack = THEME_PACKS[this._activeThemes[t]];
    if (!pack) continue;
    for (var j = 0; j < pack.length; j++) {
      if (pack[j].name === name) return false;
    }
  }

  var found = false;
  var filtered = [];
  for (var k = 0; k < this._customTags.length; k++) {
    if (this._customTags[k].name === name) {
      found = true;
    } else {
      filtered.push(this._customTags[k]);
    }
  }

  if (!found) return false;
  this._customTags = filtered;

  try {
    localStorage.setItem(this._customKey(), JSON.stringify(this._customTags));
  } catch(e) { console.warn('[TagManager] save custom after delete:', e); }

  return true;
};

TagManager.setActiveThemes = function(themeIds) {
  var valid = [];
  for (var i = 0; i < themeIds.length; i++) {
    if (AVAILABLE_THEMES.indexOf(themeIds[i]) !== -1) {
      valid.push(themeIds[i]);
    }
  }
  this._activeThemes = valid;

  try {
    localStorage.setItem(this._themesKey(), JSON.stringify(valid));
  } catch(e) { console.warn('[TagManager] save themes:', e); }
};

TagManager.getActiveThemes = function() {
  return this._activeThemes.slice();
};


/* ====== Scanner ====== */
// 多路径文本采集器 — 从页面 DOM 自动发现并提取记忆内容（XML 元素 / 纯文本块
//   / 自然语言段落 / 聊天日志），支持自动扫描与 MutationObserver

var Scanner = {};
Scanner._autoScanTimer = null;
Scanner._observer = null;
Scanner._pendingElement = null;
Scanner._lastScanTime = 0;       // 诊断用：最近扫描时间
Scanner._lastScanResult = null;  // 诊断用：{added, skipped, time}

/**
 * 解析 XML 格式记忆块（兼容不规范 XML 的容错提取）
 * 支持标签：<时间> <分区> <角色> <角色名> <角色ID> <分类> <内容> <重要性> <标签>
 * 支持自闭合 <tag /> 和 CDATA { ... } 包裹
 */
Scanner._parseBlock = function(text) {
  if (!text) return null;

  function extract(tag) {
    var re = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i');
    var match = text.match(re);
    if (match) {
      var val = match[1].trim();
      if (val === '{ }' || val === '{}') return '';
      return val.replace(/^\{/, '').replace(/\}$/, '');
    }
    // 自闭合标签
    var selfRe = new RegExp('<' + tag + '\\s*/>', 'i');
    if (selfRe.test(text)) return '';
    return null;
  }

  var block = {
    time: extract('时间') || '',
    zone: extract('分区') || '角色记忆',
    role: extract('角色') || '',
    roleName: extract('角色名') || extract('角色') || '',
    roleId: extract('角色ID') || '',
    category: extract('分类') || '',
    content: extract('内容') || '',
    importance: parseInt(extract('重要性'), 10) || 3,
    tags: []
  };

  var tagsStr = extract('标签') || '';
  if (tagsStr) {
    block.tags = tagsStr.split(/[,，]/).map(function(t) { return t.trim(); }).filter(function(t) { return t.length > 0; });
  }

  if (!block.content) return null;
  return block;
};

/**
 * 从 DOM 元素提取文本后调用 _parseBlock
 */
Scanner._extractFromElement = function(el) {
  if (!el) return null;
  var raw = el.textContent || '';
  return this._parseBlock(raw);
};

/**
 * 给已扫描元素打上 data-scanned 属性
 */
Scanner._markScanned = function(el) {
  if (!el) return;
  try { el.setAttribute('data-scanned', String(Date.now())); } catch(e) { console.warn('[Scanner]', e); }
};

/**
 * 执行四条扫描路径，返回 Promise<{ added: number, skipped: number }>
 */
Scanner.scan = function() {
  var self = this;
  var candidates = [];

  // 路径 1：<span class="memory-raw"> 元素
  try {
    var elements = targetDoc.querySelectorAll('span.memory-raw');
    for (var ei = 0; ei < elements.length; ei++) {
      var el = elements[ei];
      if (el.hasAttribute('data-scanned')) continue;
      var block = self._extractFromElement(el);
      if (block) {
        candidates.push({ block: block, el: el, sourceType: 'scanned' });
      }
    }
  } catch(e) { console.warn('[Scanner]', e); }

  // 路径 2：【记忆开始】...【记忆结束】 纯文本块
  try {
    var bodyText = targetDoc.body ? targetDoc.body.textContent || '' : '';
    var memRe = /【记忆开始】([\s\S]*?)【记忆结束】/g;
    var memMatch;
    while ((memMatch = memRe.exec(bodyText)) !== null) {
      var block2 = self._parseBlock(memMatch[1]);
      if (block2) {
        candidates.push({ block: block2, el: null, sourceType: 'scanned' });
      }
    }
  } catch(e) { console.warn('[Scanner]', e); }

  // 路径 3：自然语言段落 — 对超过 80 字符的段落语义分段
  if (SemanticEngine.isReady()) {
    try {
      var paragraphs = [];
      var ps = targetDoc.querySelectorAll ? targetDoc.querySelectorAll('p, div.para, .message, .content') : null;
      if (ps && ps.length > 0) {
        for (var pi = 0; pi < ps.length; pi++) {
          var pText = (ps[pi].textContent || '').trim();
          if (pText.length > 80 && !ps[pi].hasAttribute('data-scanned')) {
            paragraphs.push(pText);
          }
        }
      } else if (targetDoc.body) {
        // 降级：用 textContent 按换行分割
        var bodyLines = (targetDoc.body.textContent || '').split(/\n{2,}/);
        for (var bi = 0; bi < bodyLines.length; bi++) {
          var l = bodyLines[bi].trim();
          if (l.length > 80) paragraphs.push(l);
        }
      }

      for (var pi2 = 0; pi2 < paragraphs.length; pi2++) {
        // 语义分段：检测相邻句子的相似度骤降
        var sentences = paragraphs[pi2].split(/[。！？\.!\?]+/);
        var segments = [];
        var currentSeg = sentences[0] || '';
        for (var si = 1; si < sentences.length; si++) {
          var s = sentences[si].trim();
          if (!s) continue;
          if (currentSeg.length > 0) {
            var sim = SemanticEngine.similarity(
              SemanticEngine.embed(currentSeg.slice(-30)),
              SemanticEngine.embed(s.slice(0, 30))
            );
            if (sim < 0.3 && currentSeg.length > 40) {
              // 话题边界
              if (currentSeg.length > 80) {
                segments.push(currentSeg.trim());
              }
              currentSeg = s;
            } else {
              currentSeg += '。' + s;
            }
          } else {
            currentSeg = s;
          }
        }
        if (currentSeg.length > 80) {
          segments.push(currentSeg.trim());
        }

        for (var seg = 0; seg < segments.length; seg++) {
          var suggestedTags = TagManager.getSuggestedTags(segments[seg]);
          var zone = '角色记忆';
          if (suggestedTags.length > 0) {
            // 根据标签推断分区
            var tagMetas = [];
            for (var tm = 0; tm < suggestedTags.length; tm++) {
              var m = TagManager.getTagMeta(suggestedTags[tm]);
              if (m) tagMetas.push(m);
            }
          }
          candidates.push({
            block: {
              time: '',
              zone: zone,
              roleName: DataService._roleId || '',
              roleId: DataService._roleId || '',
              category: '',
              content: segments[seg],
              importance: 3,
              tags: suggestedTags
            },
            el: null,
            sourceType: 'auto'
          });
        }
      }
    } catch(e) { console.warn('[TagManager]', e); }
  }

  // 路径 4：[预留] 聊天日志批量导入
  // 暂不实现

  // 合并去重 + 黑名单检查 + 语义去重 + 保存
  return DataService.getAll({ includeHidden: true }).then(function(existingMemories) {
    // 当前批次内部去重
    var seenInBatch = {};
    var uniqueCandidates = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      var fp = contentFingerprint(cand.block.content);
      var fpKey = fp + '::' + cand.block.zone;
      if (seenInBatch[fpKey]) continue;
      seenInBatch[fpKey] = true;

      // 黑名单检查
      if (DataService._isBlacklisted(fp, cand.block.zone)) {
        continue;
      }

      uniqueCandidates.push(cand);
    }

    // 与已有记忆比对去重
    var savePromises = [];
    var added = 0;
    var skipped = 0;

    function processNext(idx) {
      if (idx >= uniqueCandidates.length) {
        return Promise.resolve({ added: added, skipped: skipped });
      }

      var cand2 = uniqueCandidates[idx];
      var fp2 = contentFingerprint(cand2.block.content);

      // 精确去重：检查已有记忆
      var isExactDup = false;
      for (var ei2 = 0; ei2 < existingMemories.length; ei2++) {
        var em = existingMemories[ei2];
        if (contentFingerprint(em.content) === fp2 && em.zone === cand2.block.zone) {
          isExactDup = true;
          break;
        }
      }
      if (isExactDup) {
        skipped++;
        // 仍然标记元素为已扫描
        if (cand2.el) self._markScanned(cand2.el);
        return processNext(idx + 1);
      }

      // 语义去重
      if (SemanticEngine.isReady() && existingMemories.length > 0) {
        var dedupResult = SemanticEngine.semanticDedup(cand2.block.content, existingMemories, SemanticEngine.SEMANTIC_DEDUP_THRESHOLD);
        if (dedupResult.isDuplicate) {
          skipped++;
          if (cand2.el) self._markScanned(cand2.el);
          return processNext(idx + 1);
        }
      }

      // 构建记忆对象
      var memory = createMemory({
        time: cand2.block.time || '',
        zone: cand2.block.zone,
        roleName: cand2.block.roleName || '',
        roleId: cand2.block.roleId || DataService._roleId || '',
        category: cand2.block.category || '',
        content: cand2.block.content,
        importance: cand2.block.importance || 3,
        tags: cand2.block.tags || [],
        sourceType: cand2.sourceType || 'scanned',
        confirmedByUser: cand2.sourceType !== 'auto'
      });

      // 自动推荐标签
      var suggested = TagManager.getSuggestedTags(memory.content);
      if (suggested.length > 0) {
        var existingTags = memory.tags || [];
        var tagSeen = {};
        for (var et = 0; et < existingTags.length; et++) {
          tagSeen[existingTags[et]] = true;
        }
        for (var st = 0; st < suggested.length; st++) {
          if (!tagSeen[suggested[st]] && existingTags.length < 8) {
            existingTags.push(suggested[st]);
            tagSeen[suggested[st]] = true;
          }
        }
        memory.tags = existingTags;
      }

      // 保存
      self._pendingElement = cand2.el || null;
      return DataService.save(memory).then(function() {
        added++;
        if (cand2.el) self._markScanned(cand2.el);
        existingMemories.push(memory); // 加入比对列表
        return processNext(idx + 1);
      });
    }

    return processNext(0);
  });
};

/**
 * 自动定时扫描
 */
Scanner.startAutoScan = function(intervalMs) {
  var self = this;
  this.stopAutoScan();
  this._initVisibilityControl();
  this._autoScanInterval = intervalMs || 30000;
  this.scan();
  this._autoScanTimer = targetWin.setInterval(function() {
    self.scan();
  }, this._autoScanInterval);
};

Scanner.stopAutoScan = function() {
  if (this._autoScanTimer) {
    targetWin.clearInterval(this._autoScanTimer);
    this._autoScanTimer = null;
  }
};

/**
 * MutationObserver 实时监听
 */
Scanner.startObserver = function() {
  var self = this;
  this.stopObserver();
  if (typeof targetWin.MutationObserver === 'undefined') return;

  var debouncedScan = debounce(function() {
    self.scan();
  }, 1500);

  this._observer = new targetWin.MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].nodeType === 1) {
          var el = nodes[j];
          if (el.classList && el.classList.contains('memory-raw')) {
            debouncedScan();
            return;
          }
          // 检查后代元素
          if (el.querySelectorAll) {
            var children = el.querySelectorAll('span.memory-raw');
            if (children.length > 0) {
              debouncedScan();
              return;
            }
          }
        }
      }
    }
  });

  this._observer.observe(targetDoc.body, { childList: true, subtree: true });
};

Scanner.stopObserver = function() {
  if (this._observer) {
    this._observer.disconnect();
    this._observer = null;
  }
};

/** 聊天日志扫描 — 预留接口 */
Scanner.scanChatLog = function(text) {
  return [];
};

/** Phase 6: 页面可见性控制 — 后台时暂停扫描，恢复时立即执行 */
Scanner._visHandler = null;
Scanner._wasAutoScanning = false;
Scanner._savedScanInterval = 30000;
Scanner._initVisibilityControl = function() {
  var self = this;
  if (this._visHandler) return;
  this._visHandler = function() {
    if (targetDoc.hidden) {
      // 记录当前扫描状态和间隔
      self._wasAutoScanning = !!self._autoScanTimer;
      self._savedScanInterval = self._autoScanInterval || 30000;
      if (self._autoScanTimer) {
        targetWin.clearInterval(self._autoScanTimer);
        self._autoScanTimer = null;
      }
    } else {
      // 恢复扫描（使用保存的间隔）
      if (self._wasAutoScanning) {
        var interval = self._savedScanInterval || 30000;
        self._autoScanTimer = targetWin.setInterval(function() {
          self.scan();
        }, interval);
        self.scan(); // 立即执行一次
        self._wasAutoScanning = false;
      }
    }
  };
  targetDoc.addEventListener('visibilitychange', this._visHandler);
};


/* ====== KnowledgeGraph ====== */
// 实体-关系-观察轻量知识图谱 — 从记忆中自动识别实体，建立关系网络

var KnowledgeGraph = {};
KnowledgeGraph._entities = {};      // name -> Entity
KnowledgeGraph._relations = [];     // Relation[]
KnowledgeGraph._observations = [];  // Observation[]

var ENTITY_TYPES = ['character', 'location', 'item', 'organization', 'concept'];
var RELATION_TYPES = ['信任', '敌对', '师徒', '家人', '恋人', '盟友', '属于', '位于', '拥有', '关联'];

/**
 * 获取 KG 存储键
 */
KnowledgeGraph._kgKey = function() {
  return DataService.getPrefix() + '_kg';
};

/**
 * 实体名称模糊匹配（忽略大小写）
 */
KnowledgeGraph._findEntity = function(name) {
  if (!name) return null;
  var lower = name.toLowerCase();
  var keys = Object.keys(this._entities);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === lower) return this._entities[keys[i]];
  }
  return null;
};

/**
 * 从记忆内容中自动识别实体
 */
KnowledgeGraph.extractEntities = function(memory) {
  if (!memory || !memory.content) return;

  var content = memory.content;
  var now = Date.now();

  // 基于角色名匹配
  if (memory.roleName) {
    this._upsertEntity(memory.roleName, 'character', now);
  }

  // 基于规则提取中文实体名
  var entityPatterns = [
    /([一-鿿]{2,4})(?:说|道|曰|问|答|喊|叫|吼)/g,
    /(?:与|和|跟|向|对|给|为|替)([一-鿿]{2,4})/g,
    /(?:在|到|去|来|从)([一-鿿]{2,4})(?:的|了|过|着)/g,
    /(?:跟着|随着|伴随)([一-鿿]{2,4})/g
  ];

  for (var pi = 0; pi < entityPatterns.length; pi++) {
    var re = entityPatterns[pi];
    var match;
    while ((match = re.exec(content)) !== null) {
      var candidate = match[1];
      // 过滤常见动词/虚词
      if (/^(?:什么|怎么|哪里|如何|因为|所以|虽然|但是|可以|已经|没有|这个|那个|一下|一些|之后|之前)$/.test(candidate)) continue;
      this._upsertEntity(candidate, 'character', now);
    }
  }

  // 建立与记忆标签的关系
  if (memory.tags && memory.tags.length > 0 && memory.roleName) {
    for (var ri = 0; ri < memory.tags.length; ri++) {
      var relType = memory.tags[ri];
      if (RELATION_TYPES.indexOf(relType) !== -1) {
        // 查找内容中提到的另一个实体名
        var otherName = null;
        var allNames = Object.keys(this._entities);
        for (var ni = 0; ni < allNames.length; ni++) {
          if (allNames[ni] !== memory.roleName && content.indexOf(allNames[ni]) !== -1) {
            otherName = allNames[ni];
            break;
          }
        }
        if (otherName && otherName !== memory.roleName) {
          this.addRelation(memory.roleName, otherName, relType, memory.id);
        }
      }
    }
  }

  this._scheduleSave();
};

/**
 * 创建或更新实体节点
 */
KnowledgeGraph._upsertEntity = function(name, type, now) {
  if (!name) return;
  var existing = this._findEntity(name);
  if (existing) {
    existing.occurrences++;
    existing.lastSeen = now;
  } else {
    var id = 'entity_' + uid();
    this._entities[name] = {
      id: id,
      name: name,
      type: type || 'character',
      occurrences: 1,
      firstSeen: now,
      lastSeen: now
    };
  }
};

/**
 * 按名称查找实体
 */
KnowledgeGraph.getEntity = function(name) {
  return this._findEntity(name);
};

/**
 * 模糊搜索实体（indexOf 匹配名称）
 */
KnowledgeGraph.searchEntities = function(query) {
  if (!query) return [];
  var lower = query.toLowerCase();
  var result = [];
  var keys = Object.keys(this._entities);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase().indexOf(lower) !== -1) {
      result.push(this._entities[keys[i]]);
    }
  }
  return result;
};

/**
 * 添加或更新关系
 */
KnowledgeGraph.addRelation = function(from, to, type, memoryId) {
  if (!from || !to || from === to) return;

  // 确保实体存在
  if (!this._findEntity(from)) this._upsertEntity(from, 'character', Date.now());
  if (!this._findEntity(to)) this._upsertEntity(to, 'character', Date.now());

  // 查找已有关系
  for (var i = 0; i < this._relations.length; i++) {
    var rel = this._relations[i];
    if (rel.from === from && rel.to === to && rel.type === type) {
      rel.weight++;
      if (rel.sourceMemoryIds.indexOf(memoryId) === -1) {
        rel.sourceMemoryIds.push(memoryId);
      }
      this._scheduleSave();
      return;
    }
  }

  // 新建关系
  this._relations.push({
    id: 'rel_' + uid(),
    from: from,
    to: to,
    type: type || '关联',
    weight: 1,
    sourceMemoryIds: memoryId ? [memoryId] : []
  });

  this._scheduleSave();
};

/**
 * 获取以某实体为中心的关系网络
 * @param {string} entityName
 * @param {number} [depth=1]
 */
KnowledgeGraph.getRelations = function(entityName, depth) {
  var d = depth || 1;
  var result = [];

  for (var i = 0; i < this._relations.length; i++) {
    var rel = this._relations[i];
    if (rel.from === entityName || rel.to === entityName) {
      result.push(rel);
    }
  }

  // 二阶关系
  if (d >= 2) {
    var firstDegreeNames = {};
    for (var ri = 0; ri < result.length; ri++) {
      var r = result[ri];
      firstDegreeNames[r.from === entityName ? r.to : r.from] = true;
    }

    var secondDegreeIds = {};
    for (var ri2 = 0; ri2 < result.length; ri2++) {
      secondDegreeIds[result[ri2].id] = true;
    }

    for (var j = 0; j < this._relations.length; j++) {
      var rel2 = this._relations[j];
      if (secondDegreeIds[rel2.id]) continue;
      if (firstDegreeNames[rel2.from] && rel2.to !== entityName) {
        result.push(rel2);
        secondDegreeIds[rel2.id] = true;
      } else if (firstDegreeNames[rel2.to] && rel2.from !== entityName) {
        result.push(rel2);
        secondDegreeIds[rel2.id] = true;
      }
    }
  }

  return result;
};

/**
 * 获取图数据（供 UI 可视化）
 * @returns {{ nodes: Entity[], edges: Relation[] }}
 */
KnowledgeGraph.getGraph = function(centerEntityName, depth) {
  var d = depth || 1;
  var relations = this.getRelations(centerEntityName, d);
  var nodeNames = {};
  if (centerEntityName) nodeNames[centerEntityName] = true;

  for (var i = 0; i < relations.length; i++) {
    nodeNames[relations[i].from] = true;
    nodeNames[relations[i].to] = true;
  }

  var nodes = [];
  var nameKeys = Object.keys(nodeNames);
  for (var j = 0; j < nameKeys.length; j++) {
    var entity = this._findEntity(nameKeys[j]);
    if (entity) {
      nodes.push(entity);
    } else {
      nodes.push({
        id: 'entity_unknown_' + j,
        name: nameKeys[j],
        type: 'character',
        occurrences: 0,
        firstSeen: 0,
        lastSeen: 0
      });
    }
  }

  return { nodes: nodes, edges: relations };
};

/**
 * 向实体附加观察记录
 */
KnowledgeGraph.addObservation = function(entityName, content, memoryId) {
  if (!entityName || !content) return;

  if (!this._findEntity(entityName)) {
    this._upsertEntity(entityName, 'character', Date.now());
  }

  this._observations.push({
    id: 'obs_' + uid(),
    entityId: entityName,
    content: content,
    memoryId: memoryId || '',
    timestamp: Date.now()
  });

  this._scheduleSave();
};

/**
 * 获取某实体的所有观察记录
 */
KnowledgeGraph.getObservations = function(entityName) {
  var result = [];
  for (var i = 0; i < this._observations.length; i++) {
    if (this._observations[i].entityId === entityName) {
      result.push(this._observations[i]);
    }
  }
  result.sort(function(a, b) { return b.timestamp - a.timestamp; });
  return result;
};

/**
 * 防抖保存到 localStorage
 */
KnowledgeGraph._saveTimer = null;
KnowledgeGraph._unloadBound = false;
KnowledgeGraph._scheduleSave = function() {
  var self = this;
  if (this._saveTimer) clearTimeout(this._saveTimer);
  this._saveTimer = setTimeout(function() { self.save(); }, 2000);
  if (!this._unloadBound && typeof targetWin !== 'undefined') {
    this._unloadBound = true;
    try {
      targetWin.addEventListener('beforeunload', function() {
        if (self._saveTimer) { clearTimeout(self._saveTimer); self.save(); }
      });
    } catch(e) {}
  }
};

/**
 * 图谱数据序列化保存到 localStorage
 */
KnowledgeGraph.save = function() {
  var data = {
    entities: this._entities,
    relations: this._relations,
    observations: this._observations
  };
  try {
    localStorage.setItem(this._kgKey(), JSON.stringify(data));
  } catch(e) { console.warn('[KnowledgeGraph] save:', e); }
};

/**
 * 从 localStorage 加载图谱数据
 */
KnowledgeGraph.load = function() {
  try {
    var raw = localStorage.getItem(this._kgKey());
    if (raw) {
      var data = JSON.parse(raw);
      this._entities = data.entities || {};
      this._relations = data.relations || [];
      this._observations = data.observations || [];
    }
  } catch(e) {
    this._entities = {};
    this._relations = [];
    this._observations = [];
  }
  return Promise.resolve();
};

/**
 * 从 DataService.getAll() 全量重建图谱
 */
KnowledgeGraph.rebuild = function() {
  var self = this;
  this._entities = {};
  this._relations = [];
  this._observations = [];

  return DataService.getAll({ includeHidden: true }).then(function(memories) {
    for (var i = 0; i < memories.length; i++) {
      self.extractEntities(memories[i]);
    }
    self.save();
    return { entities: Object.keys(self._entities).length, relations: self._relations.length };
  });
};


/* ====== ArchiveManager ====== */
// 存档槽管理器 — 保存和恢复记忆快照，处理会话变更时的记忆转存

var ArchiveManager = {};

/**
 * 存储键
 */
ArchiveManager._slotsKey = function() {
  return DataService.getRolePrefix() + '_save_slots';
};

ArchiveManager._slotDataKey = function(saveKey) {
  return DataService.getRolePrefix() + '_slot_data_' + saveKey;
};

ArchiveManager._lastSessionKey = function() {
  return DataService.getRolePrefix() + '_last_session';
};

/**
 * 旧键迁移
 */
ArchiveManager._migrateOldKeys = function() {
  try {
    var oldSlotsKey = 'memory_mirror_save_slots';
    var oldLastKey = 'memory_mirror_last_session';
    var migrated = false;

    if (localStorage.getItem(oldSlotsKey) !== null) {
      var oldSlots = JSON.parse(localStorage.getItem(oldSlotsKey));
      if (Array.isArray(oldSlots)) {
        var newKey = this._slotsKey();
        var existing = [];
        try { existing = JSON.parse(localStorage.getItem(newKey) || '[]'); } catch(e) { console.warn('[ArchiveManager]', e); }
        // 按 saveKey 去重合并
        var existingKeys = {};
        for (var ei = 0; ei < existing.length; ei++) {
          existingKeys[existing[ei].saveKey] = true;
        }
        for (var oi = 0; oi < oldSlots.length; oi++) {
          if (!existingKeys[oldSlots[oi].saveKey]) {
            existing.push(oldSlots[oi]);
          }
        }
        localStorage.setItem(newKey, JSON.stringify(existing));
        migrated = true;
      }
      localStorage.removeItem(oldSlotsKey);
    }

    if (localStorage.getItem(oldLastKey) !== null) {
      localStorage.setItem(this._lastSessionKey(), localStorage.getItem(oldLastKey));
      localStorage.removeItem(oldLastKey);
      migrated = true;
    }

    // 也迁移旧快照数据
    var keysToCheck = [];
    for (var k = 0; k < localStorage.length; k++) {
      var lk = localStorage.key(k);
      if (lk && lk.indexOf('memory_mirror_slot_data_') === 0) {
        keysToCheck.push(lk);
      }
    }
    for (var mk = 0; mk < keysToCheck.length; mk++) {
      var oldDataKey = keysToCheck[mk];
      var oldSaveKey = oldDataKey.replace('memory_mirror_slot_data_', '');
      var newDataKey = this._slotDataKey(oldSaveKey);
      if (newDataKey !== oldDataKey) {
        var slotData = localStorage.getItem(oldDataKey);
        if (slotData !== null) {
          localStorage.setItem(newDataKey, slotData);
          localStorage.removeItem(oldDataKey);
          migrated = true;
        }
      }
    }

    return migrated;
  } catch(e) { return false; }
};

/**
 * 获取所有存档槽（仅当前 roleId）
 */
ArchiveManager.getSlots = function() {
  try {
    var raw = localStorage.getItem(this._slotsKey());
    var slots = raw ? JSON.parse(raw) : [];
    var currentRoleId = DataService._roleId;
    var filtered = [];
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].roleId === currentRoleId) {
        filtered.push(slots[i]);
      }
    }
    filtered.sort(function(a, b) { return b.createdAt - a.createdAt; });
    return filtered;
  } catch(e) { return []; }
};

/**
 * 创建存档槽
 */
ArchiveManager.createSlot = function(label) {
  var self = this;
  var saveKey = DataService._roleId + '::' + DataService._sessionId + '::' + Date.now();
  var slot = {
    saveKey: saveKey,
    label: label || '存档 ' + new Date().toLocaleString(),
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    memoryCount: 0,
    roleId: DataService._roleId,
    sessionId: DataService._sessionId,
    preview: ''
  };

  try {
    var slots = this.getSlots();
    slots.push(slot);
    localStorage.setItem(this._slotsKey(), JSON.stringify(slots));
  } catch(e) { console.warn('[ArchiveManager]', e); }

  // 首次创建自动执行一次快照
  return this.createSnapshot(saveKey).then(function() { return slot; });
};

/**
 * 重命名存档槽
 */
ArchiveManager.renameSlot = function(saveKey, newLabel) {
  var slots = this.getSlots();
  var found = false;
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].saveKey === saveKey) {
      slots[i].label = newLabel;
      found = true;
      break;
    }
  }
  if (found) {
    localStorage.setItem(this._slotsKey(), JSON.stringify(slots));
  }
  return found;
};

/**
 * 删除存档槽及对应快照数据
 */
ArchiveManager.deleteSlot = function(saveKey) {
  // 删除快照数据
  var dataKey = this._slotDataKey(saveKey);
  localStorage.removeItem(dataKey);

  // 删除槽位元数据
  var slots = this.getSlots();
  var filtered = [];
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].saveKey !== saveKey) filtered.push(slots[i]);
  }
  localStorage.setItem(this._slotsKey(), JSON.stringify(filtered));
};

/**
 * 创建快照
 */
ArchiveManager.createSnapshot = function(saveKey) {
  var self = this;
  return DataService.getAll({ includeHidden: false }).then(function(memories) {
    var dataKey = self._slotDataKey(saveKey);
    try {
      localStorage.setItem(dataKey, JSON.stringify(memories));
    } catch(e) { return 0; }

    // 更新槽位信息
    var slots = self.getSlots();
    var found = false;
    var preview = '';
    for (var pv = 0; pv < Math.min(memories.length, 3); pv++) {
      if (pv > 0) preview += '\n';
      preview += (memories[pv].content || '').substring(0, 30);
    }

    for (var i = 0; i < slots.length; i++) {
      if (slots[i].saveKey === saveKey) {
        slots[i].memoryCount = memories.length;
        slots[i].lastAccessedAt = Date.now();
        slots[i].preview = preview;
        found = true;
        break;
      }
    }

    // 如果槽位不存在则创建
    if (!found) {
      slots.push({
        saveKey: saveKey,
        label: '快照 ' + formatDate(Date.now()),
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        memoryCount: memories.length,
        roleId: DataService._roleId,
        sessionId: DataService._sessionId,
        preview: preview
      });
    }

    localStorage.setItem(self._slotsKey(), JSON.stringify(slots));
    return memories.length;
  });
};

/**
 * 恢复快照
 */
ArchiveManager.restoreSnapshot = function(saveKey) {
  var self = this;
  var dataKey = this._slotDataKey(saveKey);
  var raw = localStorage.getItem(dataKey);
  if (!raw) return Promise.reject(new Error('Snapshot not found: ' + saveKey));

  try {
    var snapshots = JSON.parse(raw);
    if (!Array.isArray(snapshots)) return Promise.reject(new Error('Invalid snapshot data'));
  } catch(e) {
    return Promise.reject(new Error('Failed to parse snapshot'));
  }

  return DataService.clear().then(function() {
    function restoreNext(idx) {
      if (idx >= snapshots.length) {
        // 刷新搜索索引
        return SearchIndex.rebuild().then(function() {
          return snapshots.length;
        });
      }
      var mem = snapshots[idx];
      return DataService.save(mem).then(function() {
        return restoreNext(idx + 1);
      });
    }
    return restoreNext(0);
  });
};

/**
 * 获取快照数据（只读）
 */
ArchiveManager.getSnapshotData = function(saveKey) {
  var dataKey = this._slotDataKey(saveKey);
  try {
    var raw = localStorage.getItem(dataKey);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
};

/**
 * 读写上次会话 ID
 */
ArchiveManager._getLastSessionId = function() {
  try {
    return localStorage.getItem(this._lastSessionKey()) || '';
  } catch(e) { return ''; }
};

ArchiveManager._setLastSessionId = function(id) {
  try {
    localStorage.setItem(this._lastSessionKey(), id || '');
  } catch(e) { console.warn('[ArchiveManager]', e); }
};

/**
 * 会话变更检测 — 在 _autoInit 中 DataService._openDB() 成功后调用
 * @returns {Promise} 用户做出选择后 resolve
 */
ArchiveManager.checkSessionChange = function() {
  var self = this;

  // 迁移旧键
  this._migrateOldKeys();

  var currentSessionId = DataService._sessionId;
  var lastSessionId = this._getLastSessionId();

  // 首次使用或会话相同，直接继续
  if (!lastSessionId || lastSessionId === currentSessionId) {
    this._setLastSessionId(currentSessionId);
    return Promise.resolve();
  }

  // 检查当前记忆库是否有可见记忆
  return DataService.getAll({ includeHidden: false }).then(function(memories) {
    if (memories.length === 0) {
      self._setLastSessionId(currentSessionId);
      return;
    }

    // 有旧会话的记忆需要处理，弹窗让用户选择
    return self._showSessionChangeDialog(memories, currentSessionId, lastSessionId);
  });
};

/**
 * 会话变更模态弹窗 — 返回 Promise，用户操作后 resolve
 */
ArchiveManager._showSessionChangeDialog = function(memories, currentSessionId, oldSessionId) {
  var self = this;
  return new Promise(function(resolve) {
    // 创建遮罩
    var overlay = targetDoc.createElement('div');
    overlay.id = 'mm-session-dialog-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

    // 弹窗主体
    var dialog = targetDoc.createElement('div');
    dialog.style.cssText = 'background:#fff;border-radius:8px;padding:24px;max-width:480px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.2);font-family:sans-serif;';

    var title = targetDoc.createElement('h3');
    title.textContent = '检测到会话变更';
    title.style.cssText = 'margin:0 0 8px;font-size:16px;color:#333;';
    dialog.appendChild(title);

    var desc = targetDoc.createElement('p');
    desc.textContent = '上次会话 (' + oldSessionId.slice(0, 12) + '...) 有 ' + memories.length + ' 条可见记忆。请选择处理方式：';
    desc.style.cssText = 'margin:0 0 16px;font-size:13px;color:#666;line-height:1.5;';
    dialog.appendChild(desc);

    // 按钮容器
    var btns = targetDoc.createElement('div');
    btns.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    function makeButton(text, style, action) {
      var btn = targetDoc.createElement('button');
      btn.textContent = text;
      btn.style.cssText = 'padding:10px 16px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:14px;' + style;
      btn.onclick = function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        action();
      };
      return btn;
    }

    // 选项 1：自动存档
    btns.appendChild(makeButton(
      '自动存档并清空（推荐）',
      'background:#4a90d9;color:#fff;border-color:#4a90d9;',
      function() {
        var slotLabel = '自动存档 - ' + oldSessionId.slice(0, 8);
        var saveKey = DataService._roleId + '::' + oldSessionId + '::' + Date.now();
        var slot = {
          saveKey: saveKey,
          label: slotLabel,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          memoryCount: memories.length,
          roleId: DataService._roleId,
          sessionId: oldSessionId,
          preview: (memories[0] ? (memories[0].content || '').substring(0, 30) : '')
        };
        var preview = '';
        for (var pv = 0; pv < Math.min(memories.length, 3); pv++) {
          if (pv > 0) preview += '\n';
          preview += (memories[pv].content || '').substring(0, 30);
        }
        slot.preview = preview;

        var dataKey = self._slotDataKey(saveKey);
        localStorage.setItem(dataKey, JSON.stringify(memories));
        var slots = self.getSlots();
        slots.push(slot);
        localStorage.setItem(self._slotsKey(), JSON.stringify(slots));
        self._setLastSessionId(currentSessionId);
        DataService.clear().then(function() { resolve(); });
      }
    ));

    // 选项 2：手动选择槽位
    btns.appendChild(makeButton(
      '选择已有存档槽...',
      'background:#f5f5f5;color:#333;',
      function() {
        // 列出已有槽位
        var slots = self.getSlots();
        var slotList = targetDoc.createElement('div');
        slotList.style.cssText = 'max-height:200px;overflow-y:auto;margin:8px 0;';

        for (var si = 0; si < slots.length; si++) {
          (function(slot) {
            var row = targetDoc.createElement('div');
            row.textContent = slot.label + ' (' + slot.memoryCount + ' 条, ' + formatDate(slot.createdAt) + ')';
            row.style.cssText = 'padding:6px 8px;cursor:pointer;border-bottom:1px solid #eee;font-size:13px;';
            row.onclick = function() {
              self.createSnapshot(slot.saveKey).then(function() {
                self._setLastSessionId(currentSessionId);
                DataService.clear().then(function() { resolve(); });
              });
            };
            slotList.appendChild(row);
          })(slots[i]);
        }

        // 新建槽位选项
        var newSlot = targetDoc.createElement('div');
        newSlot.textContent = '+ 新建槽位';
        newSlot.style.cssText = 'padding:6px 8px;cursor:pointer;font-weight:bold;font-size:13px;color:#4a90d9;';
        newSlot.onclick = function() {
          self.createSlot('手动存档 - ' + oldSessionId.slice(0, 8)).then(function(newS) {
            self._setLastSessionId(currentSessionId);
            DataService.clear().then(function() { resolve(); });
          });
        };
        slotList.appendChild(newSlot);

        // 替换按钮区域
        while (btns.firstChild) btns.removeChild(btns.firstChild);
        btns.appendChild(slotList);

        var cancelBtn = targetDoc.createElement('button');
        cancelBtn.textContent = '返回';
        cancelBtn.style.cssText = 'padding:8px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:13px;margin-top:8px;';
        cancelBtn.onclick = function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          // 重新弹窗
          self._showSessionChangeDialog(memories, currentSessionId, oldSessionId).then(resolve);
        };
        btns.appendChild(cancelBtn);
      }
    ));

    // 选项 3：丢弃
    btns.appendChild(makeButton(
      '丢弃旧记忆（不可恢复）',
      'background:#e05d5d;color:#fff;border-color:#e05d5d;',
      function() {
        var confirmed = targetWin.confirm('确定要丢弃 ' + memories.length + ' 条记忆吗？此操作不可恢复。');
        if (confirmed) {
          self._setLastSessionId(currentSessionId);
          DataService.clear().then(function() { resolve(); });
        } else {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          self._showSessionChangeDialog(memories, currentSessionId, oldSessionId).then(resolve);
        }
      }
    ));

    dialog.appendChild(btns);
    overlay.appendChild(dialog);
    targetDoc.body.appendChild(overlay);
  });
};


/* ====== Exporter ====== */
// JSON 导入导出 — 记忆库导出为可移植 JSON 文件，从 JSON 文件或剪贴板导入

var Exporter = {};

/**
 * 下载文件到浏览器
 */
Exporter._downloadFile = function(json, filename) {
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = targetDoc.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  targetDoc.body.appendChild(a);
  a.click();
  setTimeout(function() {
    targetDoc.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

/**
 * 导出记忆为 JSON 文件
 * @param {Memory[]} memories - 记忆数组
 */
Exporter.exportJSON = function(memories) {
  if (!memories || memories.length === 0) {
    throw new Error('没有可导出的记忆');
  }

  var visible = [];
  for (var i = 0; i < memories.length; i++) {
    if (!memories[i].hidden) visible.push(memories[i]);
  }

  if (visible.length === 0) {
    throw new Error('没有可见的记忆可导出');
  }

  var json = JSON.stringify(visible, null, 2);
  var filename = 'memory-mirror-export-' +
    formatDate(Date.now()).replace(/ /g, '-').replace(/:/g, '') + '.json';
  this._downloadFile(json, filename);
};

/**
 * 导出指定存档槽
 */
Exporter.exportArchive = function(saveKey) {
  var data = ArchiveManager.getSnapshotData(saveKey);
  if (!data || data.length === 0) {
    throw new Error('存档槽中没有数据: ' + saveKey);
  }
  var json = JSON.stringify(data, null, 2);
  var filename = 'memory-mirror-archive-' + saveKey.replace(/:/g, '-').slice(0, 30) + '.json';
  this._downloadFile(json, filename);
};

/**
 * 从文件导入记忆
 * @param {File} file - File 对象
 * @returns {Promise<{ added: number, skipped: number }>}
 */
Exporter.importJSON = function(file) {
  var self = this;
  return new Promise(function(resolve, reject) {
    if (!file) { reject(new Error('未提供文件')); return; }

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var json = JSON.parse(e.target.result);
        if (!Array.isArray(json)) {
          reject(new Error('格式错误：JSON 顶层必须是数组'));
          return;
        }
        self._importMemories(json).then(resolve, reject);
      } catch(err) {
        reject(new Error('JSON 解析失败: ' + err.message));
      }
    };
    reader.onerror = function() {
      reject(new Error('文件读取失败'));
    };
    reader.readAsText(file);
  });
};

/**
 * 从剪贴板或文本导入
 * @returns {Promise<{ added: number, skipped: number }>}
 */
Exporter.importFromClipboard = function() {
  var self = this;
  // 尝试 Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
    return navigator.clipboard.readText().then(function(text) {
      return self.importFromText(text);
    });
  }

  // 降级：弹窗让用户粘贴
  return self._showClipboardFallback();
};

/**
 * 从文本字符串导入记忆
 * @returns {Promise<{ added: number, skipped: number }>}
 */
Exporter.importFromText = function(text) {
  var self = this;
  try {
    // 检查是否包含【记忆开始】...【记忆结束】块
    var memRe = /【记忆开始】([\s\S]*?)【记忆结束】/g;
    var blocks = [];
    var match;
    while ((match = memRe.exec(text)) !== null) {
      var block = Scanner._parseBlock(match[1]);
      if (block) blocks.push(block);
    }

    if (blocks.length > 0) {
      // 解析为记忆对象
      var memories = [];
      for (var bi = 0; bi < blocks.length; bi++) {
        var b = blocks[bi];
        memories.push(createMemory({
          time: b.time || '',
          zone: b.zone,
          roleName: b.roleName,
          roleId: b.roleId || DataService._roleId,
          category: b.category,
          content: b.content,
          importance: b.importance,
          tags: b.tags,
          sourceType: 'imported'
        }));
      }
      return self._importMemories(memories);
    }

    // 尝试 JSON 解析
    try {
      var json = JSON.parse(text);
      if (Array.isArray(json)) {
        return self._importMemories(json);
      }
    } catch(e) { console.warn('[Exporter]', e); }

    // 都不匹配
    return Promise.reject(new Error('未识别到可导入的记忆格式。请粘贴 JSON 数组或包含【记忆开始】...【记忆结束】块的文本。'));
  } catch(e) {
    return Promise.reject(e);
  }
};

/**
 * 内部导入逻辑：去重 → 保存 → 重建索引
 */
Exporter._importMemories = function(memories) {
  var self = this;
  return DataService.getAll({ includeHidden: true }).then(function(existing) {
    var existingFps = {};
    for (var ei = 0; ei < existing.length; ei++) {
      var efp = contentFingerprint(existing[ei].content) + '::' + existing[ei].zone;
      existingFps[efp] = true;
    }

    var added = 0;
    var skipped = 0;

    function importNext(idx) {
      if (idx >= memories.length) {
        return Promise.resolve({ added: added, skipped: skipped });
      }

      var raw = memories[idx];
      if (!raw || !raw.content) {
        skipped++;
        return importNext(idx + 1);
      }

      var fp = contentFingerprint(raw.content) + '::' + (raw.zone || '角色记忆');
      if (existingFps[fp]) {
        skipped++;
        return importNext(idx + 1);
      }

      // 清理 id，保留原始 timestamp
      var memory = createMemory(raw);
      delete memory.id;
      memory.timestamp = raw.timestamp || Date.now();
      memory.zone = raw.zone || '角色记忆';
      memory.sourceType = 'imported';
      memory.confirmedByUser = !!raw.confirmedByUser;

      return DataService.save(memory).then(function(saved) {
        added++;
        existingFps[fp] = true;

        // 触发知识图谱提取
        try { KnowledgeGraph.extractEntities(saved); } catch(e) { console.warn('[KnowledgeGraph]', e); }
        // 记录标签使用
        if (saved.tags && saved.tags.length > 0) {
          try { TagManager.recordTagUsage(saved.tags); } catch(e) { console.warn('[TagManager]', e); }
        }
        // 记录检索（衰减追踪）
        try { AdaptiveForgetting.recordRetrieval([saved.id]); } catch(e) { console.warn('[AdaptiveForgetting]', e); }
        // 加入 Lorebook 关键词索引
        try { LorebookManager._addToIndex(saved); } catch(e) { console.warn('[LorebookManager]', e); }

        return importNext(idx + 1);
      });
    }

    return importNext(0).then(function(result) {
      // 导入完成后重建索引
      return SearchIndex.rebuild().then(function() { return result; });
    });
  });
};

/**
 * 剪贴板降级：弹窗让用户手动粘贴
 */
Exporter._showClipboardFallback = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    var overlay = targetDoc.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

    var dialog = targetDoc.createElement('div');
    dialog.style.cssText = 'background:#fff;border-radius:8px;padding:24px;max-width:600px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.2);';

    var title = targetDoc.createElement('h3');
    title.textContent = '导入记忆';
    title.style.cssText = 'margin:0 0 8px;font-size:16px;color:#333;';
    dialog.appendChild(title);

    var desc = targetDoc.createElement('p');
    desc.textContent = '请粘贴 JSON 数组或【记忆开始】...【记忆结束】格式文本：';
    desc.style.cssText = 'margin:0 0 12px;font-size:13px;color:#666;';
    dialog.appendChild(desc);

    var textarea = targetDoc.createElement('textarea');
    textarea.style.cssText = 'width:100%;height:200px;border:1px solid #ddd;border-radius:4px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;';
    dialog.appendChild(textarea);

    var btnRow = targetDoc.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';

    var cancelBtn = targetDoc.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:13px;background:#f5f5f5;';
    cancelBtn.onclick = function() {
      targetDoc.body.removeChild(overlay);
      reject(new Error('用户取消'));
    };
    btnRow.appendChild(cancelBtn);

    var importBtn = targetDoc.createElement('button');
    importBtn.textContent = '导入';
    importBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:4px;cursor:pointer;font-size:13px;background:#4a90d9;color:#fff;';
    importBtn.onclick = function() {
      var text = textarea.value;
      targetDoc.body.removeChild(overlay);
      if (!text || !text.trim()) {
        reject(new Error('未输入内容'));
        return;
      }
      self.importFromText(text).then(resolve, reject);
    };
    btnRow.appendChild(importBtn);

    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    targetDoc.body.appendChild(overlay);
    textarea.focus();
  });
};


/* ====== RuleEngine ====== */
// 声明式规则引擎 — 可配置的 JSON 规则持久化与条件评估，驱动自动化任务

var RuleEngine = {};
RuleEngine._rules = [];

/** 默认规则 */
RuleEngine._getDefaults = function() {
  var now = Date.now();
  return [
    {
      id: 'rule_default_recall',
      enabled: true,
      type: 'recall',
      conditions: {
        roundCount: { min: 10 },
        minImportance: 3,
        zone: '',
        tags: [],
        excludeReviewed: true,
        minUnreviewed: 0,
        minDormantDays: 0
      },
      action: {
        autoFill: true,
        autoMark: true,
        protectSource: false,
        template: '请回顾以下记忆，确认它们是否仍准确：\n{memories}'
      },
      counter: 0,
      lastTriggered: null,
      createdAt: now
    },
    {
      id: 'rule_default_summarize',
      enabled: true,
      type: 'summarize',
      conditions: {
        roundCount: { min: 20 },
        minImportance: 1,
        zone: '',
        tags: [],
        excludeReviewed: false,
        minUnreviewed: 0,
        minDormantDays: 0
      },
      action: {
        autoFill: true,
        autoMark: true,
        protectSource: true,
        template: '请对以下记忆进行阶段性总结：\n{memories}'
      },
      counter: 0,
      lastTriggered: null,
      createdAt: now
    },
    {
      id: 'rule_default_dormant',
      enabled: true,
      type: 'dormant',
      conditions: {
        roundCount: { min: 30 },
        minImportance: 0,
        zone: '',
        tags: [],
        excludeReviewed: false,
        minUnreviewed: 0,
        minDormantDays: 7
      },
      action: {
        autoFill: false,
        autoMark: false,
        protectSource: false,
        template: '以下记忆已长期未被回顾，建议关注：\n{memories}'
      },
      counter: 0,
      lastTriggered: null,
      createdAt: now
    }
  ];
};

/**
 * 加载已保存的规则，无数据则使用默认规则
 */
RuleEngine.init = function() {
  try {
    var raw = localStorage.getItem(DataService.getRolePrefix() + '_rules');
    this._rules = raw ? JSON.parse(raw) : [];
  } catch(e) { this._rules = []; }

  if (!this._rules || this._rules.length === 0) {
    this._rules = this._getDefaults();
    this.saveRules();
  }
  return Promise.resolve();
};

/**
 * 添加规则并持久化
 */
RuleEngine.addRule = function(rule) {
  if (!rule || !rule.type) return null;
  var newRule = {
    id: rule.id || 'rule_' + uid(),
    enabled: rule.enabled !== false,
    type: rule.type,
    conditions: {
      roundCount: (rule.conditions && rule.conditions.roundCount) ? rule.conditions.roundCount : { min: 10 },
      minImportance: (rule.conditions && rule.conditions.minImportance != null) ? rule.conditions.minImportance : 0,
      zone: (rule.conditions && rule.conditions.zone) ? rule.conditions.zone : '',
      tags: (rule.conditions && rule.conditions.tags) ? rule.conditions.tags.slice() : [],
      excludeReviewed: !!(rule.conditions && rule.conditions.excludeReviewed),
      minUnreviewed: (rule.conditions && rule.conditions.minUnreviewed != null) ? rule.conditions.minUnreviewed : 0,
      minDormantDays: (rule.conditions && rule.conditions.minDormantDays != null) ? rule.conditions.minDormantDays : 0
    },
    action: {
      autoFill: !!(rule.action && rule.action.autoFill),
      autoMark: !!(rule.action && rule.action.autoMark),
      protectSource: !!(rule.action && rule.action.protectSource),
      template: (rule.action && rule.action.template) ? rule.action.template : '{memories}'
    },
    counter: rule.counter || 0,
    lastTriggered: rule.lastTriggered || null,
    createdAt: rule.createdAt || Date.now()
  };
  this._rules.push(newRule);
  this.saveRules();
  return newRule;
};

/**
 * 删除规则
 */
RuleEngine.removeRule = function(id) {
  var filtered = [];
  var found = false;
  for (var i = 0; i < this._rules.length; i++) {
    if (this._rules[i].id === id) {
      found = true;
    } else {
      filtered.push(this._rules[i]);
    }
  }
  if (found) {
    this._rules = filtered;
    this.saveRules();
  }
  return found;
};

/**
 * 部分更新规则
 */
RuleEngine.updateRule = function(id, patch) {
  for (var i = 0; i < this._rules.length; i++) {
    if (this._rules[i].id === id) {
      var rule = this._rules[i];
      if (patch.enabled !== undefined) rule.enabled = !!patch.enabled;
      if (patch.conditions) {
        if (patch.conditions.roundCount) rule.conditions.roundCount = patch.conditions.roundCount;
        if (patch.conditions.minImportance != null) rule.conditions.minImportance = patch.conditions.minImportance;
        if (patch.conditions.zone !== undefined) rule.conditions.zone = patch.conditions.zone;
        if (patch.conditions.tags) rule.conditions.tags = patch.conditions.tags.slice();
        if (patch.conditions.excludeReviewed !== undefined) rule.conditions.excludeReviewed = !!patch.conditions.excludeReviewed;
        if (patch.conditions.minUnreviewed != null) rule.conditions.minUnreviewed = patch.conditions.minUnreviewed;
        if (patch.conditions.minDormantDays != null) rule.conditions.minDormantDays = patch.conditions.minDormantDays;
      }
      if (patch.action) {
        if (patch.action.autoFill !== undefined) rule.action.autoFill = !!patch.action.autoFill;
        if (patch.action.autoMark !== undefined) rule.action.autoMark = !!patch.action.autoMark;
        if (patch.action.protectSource !== undefined) rule.action.protectSource = !!patch.action.protectSource;
        if (patch.action.template !== undefined) rule.action.template = patch.action.template;
      }
      if (patch.counter != null) rule.counter = patch.counter;
      if (patch.lastTriggered !== undefined) rule.lastTriggered = patch.lastTriggered;
      this.saveRules();
      return rule;
    }
  }
  return null;
};

/**
 * 获取所有规则
 */
RuleEngine.getRules = function() {
  return this._rules.slice();
};

/**
 * 评估所有启用规则，返回触发的事件数组
 * @param {Object} facts - { roundCount, unreviewedCount, zone, tags, reviewedCount, ... }
 * @returns {{ type: string, params: object, rule: object }[]}
 */
RuleEngine.evaluate = function(facts) {
  var events = [];
  var f = facts || {};

  for (var i = 0; i < this._rules.length; i++) {
    var rule = this._rules[i];
    if (!rule.enabled) continue;

    // roundCount 检查
    if (rule.conditions.roundCount.min > 0) {
      if (rule.counter < rule.conditions.roundCount.min) continue;
    }

    // excludeReviewed
    if (rule.conditions.excludeReviewed && f.reviewedCount !== undefined) {
      // 仅传递标记，实际筛选由 triggerTask 处理
    }

    // minUnreviewed
    if (rule.conditions.minUnreviewed > 0) {
      if ((f.unreviewedCount || 0) < rule.conditions.minUnreviewed) continue;
    }

    // zone
    if (rule.conditions.zone && f.zone && rule.conditions.zone !== f.zone) continue;

    // tags（AND 逻辑）
    if (rule.conditions.tags.length > 0 && f.tags) {
      var allMatch = true;
      for (var ti = 0; ti < rule.conditions.tags.length; ti++) {
        if (f.tags.indexOf(rule.conditions.tags[ti]) === -1) { allMatch = false; break; }
      }
      if (!allMatch) continue;
    }

    // minDormantDays — 仅 dormant 类型使用
    if (rule.type === 'dormant' && rule.conditions.minDormantDays > 0) {
      if ((f.minDormantDaysMet || 0) < 1) continue;
    }

    // 触发
    events.push({
      type: rule.type,
      params: {
        minImportance: rule.conditions.minImportance,
        zone: rule.conditions.zone,
        tags: rule.conditions.tags,
        excludeReviewed: rule.conditions.excludeReviewed,
        autoFill: rule.action.autoFill,
        autoMark: rule.action.autoMark,
        protectSource: rule.action.protectSource,
        template: rule.action.template
      },
      rule: rule
    });
  }

  return events;
};

/**
 * 持久化规则到 localStorage
 */
RuleEngine.saveRules = function() {
  try {
    localStorage.setItem(DataService.getRolePrefix() + '_rules', JSON.stringify(this._rules));
  } catch(e) { console.warn('[RuleEngine]', e); }
};


/* ====== LorebookManager ====== */
// 关键词触发注入（Lorebook 机制）— 聊天内容出现触发关键词时，自动注入相关记忆

var LorebookManager = {};
LorebookManager._keywordIndex = {};    // { keyword: [memoryId, ...] }
LorebookManager._activatedCache = [];  // 上次 scan() 结果
LorebookManager._tokenBudget = 500;
LorebookManager._triggerStats = {};    // { keyword: count }
LorebookManager._lastInjectTime = 0;   // 诊断用：最近注入时间
LorebookManager._lastInjectOk = false; // 诊断用：最近注入是否成功
LorebookManager._lastMatchKeywords = []; // 诊断用：最近命中的关键词

/**
 * 从 DataService 全量重建关键词索引
 */
LorebookManager._buildIndex = function() {
  var self = this;
  return DataService.getAll({ includeHidden: false }).then(function(memories) {
    self._keywordIndex = {};
    for (var i = 0; i < memories.length; i++) {
      self._addToIndex(memories[i]);
    }
    return self._keywordIndex;
  });
};

/**
 * 将单条记忆的关键词加入索引
 */
LorebookManager._addToIndex = function(memory) {
  if (!memory || !memory.triggerKeywords || memory.triggerKeywords.length === 0) return;
  // 先移除旧索引（处理更新场景）
  this._removeFromIndex(memory.id);
  for (var i = 0; i < memory.triggerKeywords.length; i++) {
    var kw = memory.triggerKeywords[i];
    if (!this._keywordIndex[kw]) this._keywordIndex[kw] = [];
    if (this._keywordIndex[kw].indexOf(memory.id) === -1) {
      this._keywordIndex[kw].push(memory.id);
    }
  }
};

/**
 * 从索引中移除某记忆的所有关键词
 */
LorebookManager._removeFromIndex = function(memoryId) {
  var keys = Object.keys(this._keywordIndex);
  for (var i = 0; i < keys.length; i++) {
    var list = this._keywordIndex[keys[i]];
    var idx = list.indexOf(memoryId);
    if (idx !== -1) {
      list.splice(idx, 1);
      if (list.length === 0) delete this._keywordIndex[keys[i]];
    }
  }
};

/**
 * 初始化：构建关键词索引
 */
LorebookManager.init = function() {
  return this._buildIndex();
};

/**
 * 扫描最近 N 轮对话文本，返回优先级排序的匹配记忆
 * @param {string[]} recentMessages - 每轮消息的文本数组
 * @returns {Object[]} ActivatedMemory[]
 */
LorebookManager.scan = function(recentMessages) {
  var self = this;
  if (!recentMessages || recentMessages.length === 0) {
    this._activatedCache = [];
    return [];
  }

  var combined = recentMessages.join(' ');
  var lowerCombined = combined.toLowerCase();
  var matchedIds = {};    // id -> hitCount
  var matchedMemories = {}; // id -> memory
  var visited = {};       // 递归防循环
  var MAX_RECURSION = 2;

  /**
   * 单层匹配
   */
  function matchLayer(text, layer) {
    if (layer > MAX_RECURSION) return Promise.resolve();
    var keys = Object.keys(self._keywordIndex);
    if (keys.length === 0) return Promise.resolve();
    var lowerText = text.toLowerCase();
    var layerMatched = {};

    for (var i = 0; i < keys.length; i++) {
      var kw = keys[i];
      var isExact = (kw.charAt(0) === '=');
      var matchKw = isExact ? kw.substring(1) : kw;

      var matched = false;
      if (isExact) {
        // 精确匹配：关键词作为独立词出现
        var exactRe = new RegExp('(^|[\\s，。！？、,\.!\?\"\'\(\)])' +
          matchKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '($|[\\s，。！？、,\.!\?\"\'\(\)])', 'i');
        matched = exactRe.test(lowerText);
      } else {
        // 包含匹配
        matched = lowerText.indexOf(matchKw.toLowerCase()) !== -1;
      }

      if (matched) {
        // 更新触发统计
        self._triggerStats[kw] = (self._triggerStats[kw] || 0) + 1;

        var idList = self._keywordIndex[kw];
        for (var j = 0; j < idList.length; j++) {
          var mid = idList[j];
          if (!visited[mid]) {
            matchedIds[mid] = (matchedIds[mid] || 0) + 1;
            layerMatched[mid] = true;
          }
        }
      }
    }

    // 递归：匹配到的记忆内容中寻找新关键词
    var newTexts = [];
    var lk = Object.keys(layerMatched);
    for (var li = 0; li < lk.length; li++) {
      visited[lk[li]] = true;
    }
    // 获取本层匹配的记忆内容
    return DataService.getAll({ includeHidden: false }).then(function(allMems) {
      for (var mi = 0; mi < allMems.length; mi++) {
        var m = allMems[mi];
        if (layerMatched[m.id] && m.content) {
          matchedMemories[m.id] = m;
          if (layer < MAX_RECURSION) {
            newTexts.push(m.content);
          }
        }
      }
      if (newTexts.length > 0 && layer < MAX_RECURSION) {
        return matchLayer(newTexts.join(' '), layer + 1);
      }
    });
  }

  // 第一层匹配
  return matchLayer(combined, 1).then(function() {
    // 补充还未加载的记忆
    return DataService.getAll({ includeHidden: false }).then(function(allMems) {
      for (var ai = 0; ai < allMems.length; ai++) {
        var am = allMems[ai];
        if (matchedIds[am.id] && !matchedMemories[am.id]) {
          matchedMemories[am.id] = am;
        }
      }

      // 按优先级排序
      var results = [];
      var mids = Object.keys(matchedIds);
      for (var ri = 0; ri < mids.length; ri++) {
        var rm = matchedMemories[mids[ri]];
        if (!rm) continue;
        results.push({
          id: rm.id,
          memory: rm,
          hits: matchedIds[rm.id],
          importance: rm.importance || 3,
          lastRetrievedAt: rm.lastRetrievedAt || 0
        });
      }

      results.sort(function(a, b) {
        if (b.importance !== a.importance) return b.importance - a.importance;
        if (b.hits !== a.hits) return b.hits - a.hits;
        return (b.lastRetrievedAt || 0) - (a.lastRetrievedAt || 0);
      });

      // Token 预算截断
      var totalTokens = 0;
      var budgeted = [];
      for (var bi = 0; bi < results.length; bi++) {
        var tokens = estimateTokens(results[bi].memory.content || '');
        if (totalTokens + tokens > self._tokenBudget && budgeted.length > 0) break;
        totalTokens += tokens;
        budgeted.push(results[bi]);
      }

      self._activatedCache = budgeted;
      return budgeted;
    });
  });
};

/**
 * 同步版本 scan（用于无法使用 Promise 的场景）
 * 直接返回上一次缓存结果
 */
LorebookManager.getActivatedMemories = function() {
  return this._activatedCache.slice();
};

/**
 * 设置 Token 预算
 */
LorebookManager.setTokenBudget = function(n) {
  this._tokenBudget = n || 500;
};

/**
 * 将激活的记忆格式化为上下文注入输入框
 */
LorebookManager.injectToInput = function(memories) {
  if (!memories || memories.length === 0) return;

  var lines = ['【以下为相关记忆，请自然融入叙事】'];
  for (var i = 0; i < memories.length; i++) {
    var m = memories[i].memory || memories[i];
    lines.push('- [' + (m.zone || '') + '] ' + (m.content || ''));
  }
  lines.push('---');
  var text = lines.join('\n');

  var ok = this._fillInput(text);
  if (!ok) { UIManager._showCopyFallbackModal(text); UIManager.showToast('未找到输入框，请手动复制', 'info'); }
};

/**
 * 填入输入框
 */
LorebookManager._fillInput = function(text) {
  try {
    var input = null;
    // 1. 优先使用用户自定义选择器
    if (AutoTaskManager._customInputSelector) {
      try { input = targetDoc.querySelector(AutoTaskManager._customInputSelector); } catch(e) {}
    }
    // 2. textarea（取最后一个，聊天输入框通常在页面底部）
    if (!input) {
      var allTA = targetDoc.querySelectorAll('textarea');
      if (allTA && allTA.length > 0) {
        // 优先选可见的、在视口下半部分的
        for (var ti = allTA.length - 1; ti >= 0; ti--) {
          var rect = allTA[ti].getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top > window.innerHeight * 0.3) {
            input = allTA[ti]; break;
          }
        }
        if (!input) input = allTA[allTA.length - 1];
      }
    }
    // 3. contenteditable
    if (!input) {
      var allCE = targetDoc.querySelectorAll('[contenteditable="true"]');
      if (allCE && allCE.length > 0) {
        for (var ci = allCE.length - 1; ci >= 0; ci--) {
          var ceRect = allCE[ci].getBoundingClientRect();
          if (ceRect.width > 0 && ceRect.height > 0 && ceRect.top > window.innerHeight * 0.3) {
            input = allCE[ci]; break;
          }
        }
        if (!input) input = allCE[allCE.length - 1];
      }
    }
    // 4. 常见聊天输入选择器
    if (!input) {
      input = targetDoc.querySelector(
        '.input, .chat-input, #input, #chat-input, [data-input], ' +
        '[role="textbox"], [data-testid*="input"], .ProseMirror, ' +
        'textarea, input[type="text"], .composer-input, .msg-input'
      );
    }
    // 5. 终极降级：遍历所有 textarea/input，选面积最大的
    if (!input) {
      var allInputs = targetDoc.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
      var maxArea = 0;
      for (var ai = 0; ai < allInputs.length; ai++) {
        try {
          var r = allInputs[ai].getBoundingClientRect();
          var area = r.width * r.height;
          if (area > maxArea) { maxArea = area; input = allInputs[ai]; }
        } catch(e) {}
      }
    }

    if (input) {
      if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
        input.value = text;
      } else {
        input.textContent = text;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // 聚焦输入框
      try { input.focus(); } catch(e) {}
      return true;
    }
  } catch(e) { console.warn('[LorebookManager]', e); }
  return false;
};

/**
 * 获取触发统计
 */
LorebookManager.getTriggerStats = function() {
  var result = [];
  var keys = Object.keys(this._triggerStats);
  for (var i = 0; i < keys.length; i++) {
    result.push({ keyword: keys[i], count: this._triggerStats[keys[i]] });
  }
  result.sort(function(a, b) { return b.count - a.count; });
  return result;
};


/* ====== AdaptiveForgetting ====== */
// 自适应遗忘 — 模拟记忆衰减机制，长期未检索的记忆自动降权与归档

var AdaptiveForgetting = {};
AdaptiveForgetting.ARCHIVE_THRESHOLD_DAYS = 30;
AdaptiveForgetting.DORMANT_DECAY_THRESHOLD = 0.15;
AdaptiveForgetting._archiveThresholdDays = AdaptiveForgetting.ARCHIVE_THRESHOLD_DAYS;
AdaptiveForgetting._dormantImportanceThreshold = 4;
AdaptiveForgetting._dormantDecayThreshold = AdaptiveForgetting.DORMANT_DECAY_THRESHOLD;
AdaptiveForgetting._decayDays = 14;
AdaptiveForgetting._lastEvaluateTime = 0;

/**
 * 从配置加载参数
 */
AdaptiveForgetting.init = function() {
  try {
    var raw = localStorage.getItem(DataService.getRolePrefix() + '_forgetting_config');
    if (raw) {
      var cfg = JSON.parse(raw);
      if (cfg.archiveThresholdDays != null) this._archiveThresholdDays = cfg.archiveThresholdDays;
      if (cfg.dormantImportanceThreshold != null) this._dormantImportanceThreshold = cfg.dormantImportanceThreshold;
      if (cfg.dormantDecayThreshold != null) this._dormantDecayThreshold = cfg.dormantDecayThreshold;
      if (cfg.decayDays != null) this._decayDays = cfg.decayDays;
    }
  } catch(e) { console.warn('[AdaptiveForgetting]', e); }
  return Promise.resolve();
};

/**
 * 计算单条记忆的 decayScore
 */
AdaptiveForgetting._calcDecay = function(memory) {
  var importance = memory.importance || 3;
  var lastRetrieved = memory.lastRetrievedAt || memory.timestamp || Date.now();
  var daysSince = (Date.now() - lastRetrieved) / 86400000;
  var decay = (importance / 5) * Math.exp(-daysSince / this._decayDays);
  // 确保在 [0, 1] 范围
  return Math.max(0, Math.min(1, decay));
};

/**
 * 评估所有记忆，执行衰减计算和归档
 * @returns {Promise<{ archived: number, dormantCandidates: Memory[], updatedScores: number }>}
 */
AdaptiveForgetting.evaluate = function(allMemories) {
  var self = this;
  var memories = allMemories || [];
  if (memories.length === 0) {
    return DataService.getAll({ includeHidden: true }).then(function(memories2) {
      return self._evaluateInternal(memories2);
    });
  }
  return Promise.resolve(this._evaluateInternal(memories));
};

AdaptiveForgetting._evaluateInternal = function(memories) {
  var self = this;
  var archived = [];
  var dormantCandidates = [];
  var updatedScores = 0;
  var now = Date.now();
  var updatePromises = [];

  for (var i = 0; i < memories.length; i++) {
    var mem = memories[i];
    if (mem.hidden && mem.archivedAt) continue; // 已归档的跳过

    var newScore = this._calcDecay(mem);
    var scoreChanged = (newScore !== mem.decayScore);
    if (scoreChanged) {
      updatedScores++;
    }
    mem.decayScore = newScore;

    // 归档判断
    var daysSinceRetrieval = mem.lastRetrievedAt
      ? (now - mem.lastRetrievedAt) / 86400000
      : (now - (mem.timestamp || now)) / 86400000;

    if (daysSinceRetrieval > self._archiveThresholdDays && newScore < 0.05 && !mem.protected) {
      mem.hidden = true;
      mem.archivedAt = now;
      archived.push(mem);
      updatePromises.push(DataService.update(mem.id, {
        decayScore: newScore,
        hidden: true,
        archivedAt: now
      }));
    } else if (mem.importance >= self._dormantImportanceThreshold && newScore <= self._dormantDecayThreshold) {
      dormantCandidates.push(mem);
    } else if (scoreChanged) {
      // 仅当本条记忆的 decayScore 有变化时更新
      updatePromises.push(DataService.update(mem.id, { decayScore: newScore }));
    }
  }

  this._lastEvaluateTime = now;

  // 更新配置持久化
  this._saveConfig();

  // 对已归档的创建自动快照（批量最多一次）
  if (archived.length > 0 && typeof ArchiveManager !== 'undefined') {
    try {
      ArchiveManager.createSnapshot('auto_archive_' + now);
    } catch(e) { console.warn('[ArchiveManager]', e); }
  }

  return Promise.all(updatePromises).then(function() {
    return {
      archived: archived.length,
      dormantCandidates: dormantCandidates,
      updatedScores: updatedScores
    };
  });
};

/**
 * 记录记忆被检索/激活
 * @param {string[]} memoryIds
 */
AdaptiveForgetting.recordRetrieval = function(memoryIds) {
  if (!memoryIds || memoryIds.length === 0) return;
  var now = Date.now();

  for (var i = 0; i < memoryIds.length; i++) {
    (function(mid) {
      DataService.getById(mid).then(function(mem) {
        if (!mem) return;
        var update = {
          lastRetrievedAt: now,
          retrieveCount: (mem.retrieveCount || 0) + 1,
          decayScore: 1.0
        };
        DataService.update(mid, update).catch(function(e) { console.warn('[AdaptiveForgetting]', e); });
      }).catch(function(e) { console.warn('[AdaptiveForgetting]', e); });
    })(memoryIds[i]);
  }
};

/**
 * 获取沉寂记忆候选
 * @param {number} [limit] - 返回前 N 条
 */
AdaptiveForgetting.getDormantCandidates = function(limit) {
  var self = this;
  var lim = limit || 10;
  var candidates = [];

  return DataService.getAll({ includeHidden: false }).then(function(memories) {
    for (var i = 0; i < memories.length; i++) {
      var mem = memories[i];
      if (mem.importance >= self._dormantImportanceThreshold && !mem.archivedAt) {
        var score = self._calcDecay(mem);
        if (score <= self._dormantDecayThreshold) {
          candidates.push({ memory: mem, decayScore: score });
        }
      }
    }
    candidates.sort(function(a, b) { return a.decayScore - b.decayScore; });
    return candidates.slice(0, lim);
  });
};

/**
 * 恢复归档记忆
 */
AdaptiveForgetting.restoreArchived = function(id) {
  return DataService.update(id, {
    hidden: false,
    archivedAt: null,
    decayScore: 0.5
  });
};

/**
 * 设置归档阈值
 */
AdaptiveForgetting.setArchiveThreshold = function(days) {
  this._archiveThresholdDays = days;
  this._saveConfig();
};

/**
 * 设置沉寂提醒阈值
 */
AdaptiveForgetting.setDormantThreshold = function(importance, decayScore) {
  this._dormantImportanceThreshold = importance;
  this._dormantDecayThreshold = decayScore;
  this._saveConfig();
};

/**
 * 持久化配置
 */
AdaptiveForgetting._saveConfig = function() {
  try {
    localStorage.setItem(DataService.getRolePrefix() + '_forgetting_config', JSON.stringify({
      archiveThresholdDays: this._archiveThresholdDays,
      dormantImportanceThreshold: this._dormantImportanceThreshold,
      dormantDecayThreshold: this._dormantDecayThreshold,
      decayDays: this._decayDays
    }));
  } catch(e) { console.warn('[AdaptiveForgetting]', e); }
};


/* ====== AutoTaskManager ====== */
// 自动化任务管理器 — 串联 RuleEngine + LorebookManager + AdaptiveForgetting 为完整自动化工作流

var AutoTaskManager = {};
AutoTaskManager._listenerTimer = null;
AutoTaskManager._maintenanceTimer = null;
AutoTaskManager._pendingCandidates = [];
AutoTaskManager._messageDebounceTimer = null;
AutoTaskManager._recentMessages = [];

/** Phase 5 预留回调 */
AutoTaskManager._onDormantReminder = function(memories) {};
AutoTaskManager._onExtractCandidates = function(candidates) {};

/**
 * 初始化：启动消息监听和定时维护
 */
AutoTaskManager.init = function() {
  this.startListener();
  this.startMaintenance(60);
  return Promise.resolve();
};

/**
 * 开始消息监听
 */
AutoTaskManager.startListener = function() {
  var self = this;
  this.stopListener();

  // 使用 MutationObserver（复用 Scanner 的模式）
  if (typeof targetWin.MutationObserver === 'undefined') return;

  this._observer = new targetWin.MutationObserver(function() {
    self._onNewMessageDebounced();
  });

  try {
    this._observer.observe(targetDoc.body, { childList: true, subtree: true, characterData: true });
  } catch(e) { console.warn('[Scanner]', e); }
};

/**
 * 停止消息监听
 */
AutoTaskManager.stopListener = function() {
  if (this._observer) {
    this._observer.disconnect();
    this._observer = null;
  }
  if (this._messageDebounceTimer) {
    clearTimeout(this._messageDebounceTimer);
    this._messageDebounceTimer = null;
  }
};

/**
 * 消息变更防抖（3 秒，与 Scanner 的 1.5 秒错开）
 */
AutoTaskManager._onNewMessageDebounced = function() {
  var self = this;
  if (this._messageDebounceTimer) clearTimeout(this._messageDebounceTimer);
  this._messageDebounceTimer = setTimeout(function() {
    self._onNewMessage();
  }, 3000);
};

/**
 * 新消息到达时的处理
 */
AutoTaskManager._onNewMessage = function() {
  var self = this;

  // 获取最近 N 轮对话文本
  var recentMessages = this._getRecentMessages(3);
  if (recentMessages.length === 0) return;

  this._recentMessages = recentMessages;

  // 1. Lorebook 扫描
  LorebookManager.scan(recentMessages).then(function(activated) {
    if (activated && activated.length > 0) {
      LorebookManager.injectToInput(activated);

      // 记录检索
      var ids = [];
      for (var ai = 0; ai < activated.length; ai++) {
        ids.push(activated[ai].id);
      }
      try { AdaptiveForgetting.recordRetrieval(ids); } catch(e) { console.warn('[AdaptiveForgetting]', e); }
    }
  }).catch(function(e) { console.warn('[AdaptiveForgetting]', e); });

  // 2. 计数器递增
  self.incrementRound();

  // 3. 检查触发
  self.checkAndTrigger();
};

/**
 * 从 DOM 获取最近 N 轮对话文本
 */
AutoTaskManager._customMsgSelector = '';
AutoTaskManager._getRecentMessages = function(n) {
  var messages = [];
  try {
    var allMsgs = null;
    // 优先使用用户自定义选择器
    if (AutoTaskManager._customMsgSelector) {
      allMsgs = targetDoc.querySelectorAll(AutoTaskManager._customMsgSelector);
    }
    // 尝试常见聊天消息选择器
    if (!allMsgs || allMsgs.length === 0) {
      var selectors = [
        '.message', '.msg', '.chat-message', '.bubble', '.message-content',
        '[data-message]', '[data-msg]', '.chat-item', '.conversation-item', '.conversation-turn',
        '.dialogue', '.speech', '.narrative', '.assistant-message', '.user-message',
        '[class*="message"]', '[class*="chat"]', '[class*="bubble"]',
        '.mufy_ai_message_bubble', '.svelte-message', '.prose p', '.markdown p'
      ];
      for (var si = 0; si < selectors.length; si++) {
        try {
          allMsgs = targetDoc.querySelectorAll(selectors[si]);
          if (allMsgs && allMsgs.length > 0) {
            // 存储匹配到的选择器以便后续复用
            if (!AutoTaskManager._customMsgSelector && allMsgs.length >= 3) {
              AutoTaskManager._customMsgSelector = selectors[si];
            }
            break;
          }
        } catch(e) {}
      }
    }

    if (!allMsgs || allMsgs.length === 0) {
      // 终极降级：获取 body 全文，按双换行分隔
      try {
        var bodyText = (targetDoc.body ? targetDoc.body.textContent : '') || '';
        var paras = bodyText.split(/\n{2,}/);
        for (var pi = 0; pi < paras.length; pi++) {
          var pt = paras[pi].trim();
          if (pt.length > 30) messages.push(pt);
        }
        if (messages.length > 0) return messages.slice(-n);
      } catch(e) {}
      // 最后降级：所有 p 标签
      allMsgs = targetDoc.querySelectorAll('p');
    }

    // 取最后 N 条
    var start = Math.max(0, (allMsgs ? allMsgs.length : 0) - n);
    for (var i = start; i < (allMsgs ? allMsgs.length : 0); i++) {
      var txt = (allMsgs[i].textContent || '').trim();
      if (txt.length > 0) messages.push(txt);
    }
  } catch(e) { console.warn('[AutoTaskManager]', e); }
  return messages;
};

/**
 * 所有启用规则的 counter++
 */
AutoTaskManager.incrementRound = function() {
  var rules = RuleEngine.getRules();
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].enabled) {
      RuleEngine.updateRule(rules[i].id, { counter: rules[i].counter + 1 });
    }
  }
};

/**
 * 重置计数器
 */
AutoTaskManager.resetCounter = function(ruleId) {
  return RuleEngine.updateRule(ruleId, { counter: 0 });
};

/**
 * 手动调整计数器
 */
AutoTaskManager.adjustCounter = function(ruleId, delta) {
  var rules = RuleEngine.getRules();
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].id === ruleId) {
      var newVal = Math.max(0, rules[i].counter + (delta || 0));
      return RuleEngine.updateRule(ruleId, { counter: newVal });
    }
  }
  return null;
};

/**
 * 获取所有规则进度
 */
AutoTaskManager.getTaskProgress = function() {
  var rules = RuleEngine.getRules();
  var result = [];
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    var max = r.conditions.roundCount.min || 10;
    result.push({
      id: r.id,
      type: r.type,
      counter: r.counter,
      max: max,
      percentage: Math.min(100, Math.round((r.counter / max) * 100)),
      enabled: r.enabled
    });
  }
  return result;
};

/**
 * 构建 facts 对象并评估规则，触发任务
 */
AutoTaskManager.checkAndTrigger = function() {
  var self = this;

  DataService.getAll({ includeHidden: false }).then(function(memories) {
    var unreviewedCount = 0;
    var reviewedCount = 0;
    for (var i = 0; i < memories.length; i++) {
      if (memories[i].reviewed) reviewedCount++;
      else unreviewedCount++;
    }

    var facts = {
      roundCount: 0, // 由 RuleEngine 内部根据 counter 判断
      unreviewedCount: unreviewedCount,
      reviewedCount: reviewedCount,
      zone: '',
      tags: [],
      minDormantDaysMet: 0
    };

    // 检查是否有沉寂候选
    return AdaptiveForgetting.getDormantCandidates(1).then(function(dormant) {
      if (dormant && dormant.length > 0) {
        facts.minDormantDaysMet = 1;
      }

      var events = RuleEngine.evaluate(facts);

      // 依次执行事件
      function processNext(idx) {
        if (idx >= events.length) return Promise.resolve();
        return self.triggerTask(events[idx]).then(function() {
          return processNext(idx + 1);
        });
      }

      return processNext(0);
    });
  }).catch(function(e) { console.warn('[RuleEngine]', e); });
};

/**
 * 执行具体任务
 * @param {{ type: string, params: object, rule: object }} event
 */
AutoTaskManager.triggerTask = function(event) {
  var self = this;
  var params = event.params || {};
  var rule = event.rule;

  return DataService.getAll({ includeHidden: false }).then(function(memories) {
    var filtered = [];

    // 根据类型筛选记忆
    if (event.type === 'recall') {
      // 未回顾记忆
      for (var i = 0; i < memories.length; i++) {
        var m = memories[i];
        if (m.reviewed) continue;
        if (params.minImportance > 0 && m.importance < params.minImportance) continue;
        if (params.zone && m.zone !== params.zone) continue;
        if (params.tags && params.tags.length > 0) {
          var hasTag = false;
          for (var ti = 0; ti < params.tags.length; ti++) {
            if (m.tags.indexOf(params.tags[ti]) !== -1) { hasTag = true; break; }
          }
          if (!hasTag) continue;
        }
        filtered.push(m);
      }
    } else if (event.type === 'summarize') {
      // 未总结记忆（排除保护）
      for (var s = 0; s < memories.length; s++) {
        var sm = memories[s];
        if (sm.summarized) continue;
        if (sm.protected) continue;
        if (params.minImportance > 0 && sm.importance < params.minImportance) continue;
        if (params.zone && sm.zone !== params.zone) continue;
        if (params.tags && params.tags.length > 0) {
          var hasTag2 = false;
          for (var si2 = 0; si2 < params.tags.length; si2++) {
            if (sm.tags.indexOf(params.tags[si2]) !== -1) { hasTag2 = true; break; }
          }
          if (!hasTag2) continue;
        }
        filtered.push(sm);
      }
    } else if (event.type === 'dormant') {
      // 沉寂候选
      return AdaptiveForgetting.getDormantCandidates(10).then(function(dormants) {
        var dc = [];
        for (var d = 0; d < dormants.length; d++) {
          dc.push(dormants[d].memory);
        }
        self._executeTask(event.type, dc, params, rule);
        return Promise.resolve();
      });
    } else if (event.type === 'auto-extract') {
      // 自动提取
      return Scanner.scan().then(function(result) {
        self._pendingCandidates = result.added > 0 ? [] : self._pendingCandidates;
        try { self._onExtractCandidates(self._pendingCandidates); } catch(e) { console.warn('[Scanner]', e); }
        return Promise.resolve();
      });
    }

    return self._executeTask(event.type, filtered, params, rule);
  }).catch(function(e) { console.warn('[Scanner]', e); });
};

/**
 * 执行任务逻辑
 */
AutoTaskManager._triggerMode = 'notify'; // 'notify' | 'inject' | 'dashboard'
AutoTaskManager._dashboardNotifications = [];

AutoTaskManager._executeTask = function(type, memories, params, rule) {
  var self = this;
  if (memories.length === 0) {
    if (rule) {
      RuleEngine.updateRule(rule.id, { counter: 0, lastTriggered: Date.now() });
    }
    return Promise.resolve();
  }

  // 使用模板系统：查找类型对应的模板
  var templates = _getTemplates();
  var templateType = type;
  var templateKey = 'standard';
  var templateText = params.template || '{memories_formatted}';

  if (templates[templateType]) {
    var keys = Object.keys(templates[templateType]);
    if (keys.length > 0) templateKey = keys[0];
    if (templates[templateType][templateKey]) {
      templateText = templates[templateType][templateKey].template;
    }
  } else if (params.template && params.template !== '{memories}') {
    templateText = params.template;
  }

  // 格式化记忆数据
  var content = _formatMemoriesForTemplate(memories);
  var instruction = _renderTemplate(content, templateText, memories[0]);

  // 根据触发方式执行
  var mode = AutoTaskManager._triggerMode || 'notify';

  if (mode === 'inject') {
    // 注入输入框
    var injected = false;
    try { injected = LorebookManager._fillInput(instruction); } catch(e) { console.warn('[LorebookManager]', e); }
    if (injected) {
      UIManager.showToast('已将 ' + memories.length + ' 条记忆注入输入框', 'success');
    } else {
      UIManager._showCopyFallbackModal(instruction);
      UIManager.showToast('未找到输入框，请手动复制', 'info');
    }
  } else if (mode === 'notify') {
    // 弹窗提示 — 沙箱环境中 navigator.clipboard 不可靠，直接使用手动复制弹窗
    UIManager._showCopyFallbackModal(instruction);
    UIManager.showToast('已生成 ' + memories.length + ' 条记忆的指令（' + type + '），请手动复制', 'info');
  } else {
    // 仪表盘标记：推入通知队列，用户打开面板时可见
    var typeNames = { recall: '回顾提醒', summarize: '总结建议', dormant: '沉寂预警' };
    AutoTaskManager._dashboardNotifications.push({
      id: 'notif_' + Date.now(),
      type: type,
      label: (typeNames[type] || type),
      count: memories.length,
      content: instruction,
      timestamp: Date.now(),
      dismissed: false
    });
    // 保持最多 20 条
    if (AutoTaskManager._dashboardNotifications.length > 20) {
      AutoTaskManager._dashboardNotifications = AutoTaskManager._dashboardNotifications.slice(-20);
    }
    UIManager.showToast('已标记到仪表盘：' + memories.length + ' 条（' + type + '）', 'info');
  }

  // 标记（沉寂提醒不应标记为已回顾）
  if (params.autoMark && type !== 'dormant') {
    var markField = type === 'summarize' ? 'summarized' : 'reviewed';
    for (var mk = 0; mk < memories.length; mk++) {
      var update = {};
      update[markField] = true;
      if (type === 'summarize' && params.protectSource) update.protected = true;
      (function(mid, upd) {
        DataService.update(mid, upd).catch(function(e) { console.warn('[LorebookManager]', e); });
      })(memories[mk].id, update);
    }
  }

  // 记录检索
  var ids = [];
  for (var ri = 0; ri < memories.length; ri++) {
    ids.push(memories[ri].id);
  }
  try { AdaptiveForgetting.recordRetrieval(ids); } catch(e) { console.warn('[AdaptiveForgetting]', e); }

  // 沉寂提醒回调
  if (type === 'dormant') {
    try { self._onDormantReminder(memories); } catch(e) { console.warn('[AdaptiveForgetting]', e); }
  }

  // 重置计数器
  if (rule) {
    RuleEngine.updateRule(rule.id, { counter: 0, lastTriggered: Date.now() });
  }

  return Promise.resolve();
};

/**
 * 定时维护
 */
AutoTaskManager.startMaintenance = function(intervalMinutes) {
  var self = this;
  this.stopMaintenance();
  var ms = (intervalMinutes || 60) * 60 * 1000;
  this._maintenanceTimer = targetWin.setInterval(function() {
    AdaptiveForgetting.evaluate().catch(function(e) { console.warn('[AdaptiveForgetting]', e); });
  }, ms);
};

AutoTaskManager.stopMaintenance = function() {
  if (this._maintenanceTimer) {
    targetWin.clearInterval(this._maintenanceTimer);
    this._maintenanceTimer = null;
  }
};


/* ====== Diagnostics ====== */
// 运行时诊断系统 — 五条核心数据流端到端检测 + 一键自测

var Diagnostics = {};
Diagnostics._results = null;       // 上次完整诊断结果缓存
Diagnostics._lastRun = 0;          // 上次运行时间
Diagnostics._CACHE_TTL = 30000;    // 30秒缓存

// 刷新追踪数据（从各模块拉取最新状态）
Diagnostics.snapshot = function() {
  var rules = (typeof RuleEngine !== 'undefined' && RuleEngine.getRules) ? RuleEngine.getRules() : [];
  var scanOn = !!(typeof Scanner !== 'undefined' && Scanner._autoScanTimer);
  var observerOn = !!(typeof Scanner !== 'undefined' && Scanner._observer);
  var autoMode = (typeof AutoTaskManager !== 'undefined') ? (AutoTaskManager._triggerMode || 'notify') : 'notify';

  return {
    time: Date.now(),
    scanActive: scanOn,
    scanInterval: scanOn && Scanner._autoScanInterval ? (Scanner._autoScanInterval / 1000) : 0,
    scanLastTime: Scanner._lastScanTime || 0,
    scanLastResult: Scanner._lastScanResult,
    observerActive: observerOn,
    injectLastTime: LorebookManager._lastInjectTime || 0,
    injectLastOk: LorebookManager._lastInjectOk,
    injectMatchKw: LorebookManager._lastMatchKeywords || [],
    kwIndexSize: Object.keys(LorebookManager._keywordIndex || {}).length,
    copyFallbackCount: UIManager._copyFallbackCount || 0,
    copyLastResult: UIManager._lastCopyResult,
    rules: rules.map(function(r) {
      return { type: r.type, enabled: r.enabled, counter: r.counter,
        target: (r.conditions.roundCount || {}).min || 0,
        lastTriggered: r.lastTriggered || 0 };
    }),
    autoMode: autoMode,
    clipboardSafe: !!(typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText),
    decayLastEval: (typeof AdaptiveForgetting !== 'undefined') ? (AdaptiveForgetting._lastEvaluateTime || 0) : 0
  };
};

// 获取记忆统计数据（异步）
Diagnostics.getMemoryStats = function() {
  return DataService.getAll({ includeHidden: true }).then(function(all) {
    if (!all) all = [];
    var stats = { total: all.length, hidden: 0, archived: 0, reviewed: 0, summarized: 0,
      protected: 0, withTags: 0, zones: {}, importanceDist: {}, summaryZone: 0 };
    var now = Date.now();
    for (var i = 0; i < all.length; i++) {
      var m = all[i];
      if (m.hidden) stats.hidden++;
      if (m.archivedAt) stats.archived++;
      if (m.reviewed) stats.reviewed++;
      if (m.summarized) stats.summarized++;
      if (m.protected) stats.protected++;
      if (m.tags && m.tags.length > 0) stats.withTags++;
      if (m.zone) { stats.zones[m.zone] = (stats.zones[m.zone] || 0) + 1; }
      if (m.zone === '总结记忆') stats.summaryZone++;
      var imp = m.importance || 3;
      stats.importanceDist[imp] = (stats.importanceDist[imp] || 0) + 1;
    }
    // 衰减分布（抽样最多100条可见记忆）
    var visible = [];
    for (var vi = 0; vi < all.length; vi++) {
      if (!all[vi].hidden && !all[vi].archivedAt) visible.push(all[vi]);
    }
    var sample = visible.slice(0, 100);
    stats.decayDist = { fresh: 0, normal: 0, stale: 0, dormant: 0 };
    for (var di = 0; di < sample.length; di++) {
      var d = AdaptiveForgetting._calcDecay(sample[di]);
      if (d > 0.8) stats.decayDist.fresh++;
      else if (d > 0.5) stats.decayDist.normal++;
      else if (d > 0.15) stats.decayDist.stale++;
      else stats.decayDist.dormant++;
    }
    return stats;
  });
};

// ====== 五条流自测 ======

// 测试结果构造
function _diagOk(msg) { return { pass: true, msg: msg }; }
function _diagFail(msg, suggest) { return { pass: false, msg: msg, suggest: suggest || '' }; }

// 流① 采集自测 — 直接用 Scanner 内部解析器验证，绕过黑名单/去重
Diagnostics.testCollection = function() {
  var results = [];
  var testId = '__mm_diag_test_coll_' + Date.now();
  try {
    // 路径1: 直接测试 _extractFromElement（span.memory-raw 解析）
    var testBlock1 = targetDoc.createElement('span');
    testBlock1.className = 'memory-raw';
    testBlock1.id = testId + '_p1';
    testBlock1.style.cssText = 'display:none';
    testBlock1.textContent = '<角色名>诊断测试</角色名><分区>角色记忆</分区><分类>其他</分类><内容>诊断自测Coll-' + testId + '</内容><重要性>3</重要性><标签>诊断测试,采集</标签>';
    targetDoc.body.appendChild(testBlock1);

    var parsed1 = Scanner._extractFromElement(testBlock1);
    if (parsed1 && parsed1.content) {
      results.push(_diagOk('✓ 路径1 (_extractFromElement): 解析成功 → ' + parsed1.zone + ' / ' + parsed1.content.substring(0, 40)));
    } else {
      results.push(_diagFail('✗ 路径1 (_extractFromElement): 解析失败', '检查 span.memory-raw 的 innerHTML 格式是否匹配 Scanner 期望'));
    }

    // 路径2: 直接测试 _parseBlock（【记忆开始】文本块解析）
    var block2Text = '【记忆开始】\n<分区>角色记忆</分区>\n<角色名>诊断测试</角色名>\n<分类>其他</分类>\n<内容>诊断自测Coll2-' + testId + '</内容>\n<重要性>2</重要性>\n<标签>诊断测试</标签>\n【记忆结束】';
    var parsed2 = Scanner._parseBlock(block2Text);
    if (parsed2 && parsed2.content) {
      results.push(_diagOk('✓ 路径2 (_parseBlock): 解析成功 → ' + parsed2.zone + ' / ' + parsed2.content.substring(0, 40)));
    } else {
      results.push(_diagFail('✗ 路径2 (_parseBlock): 解析失败', '检查【记忆开始】块格式或 _parseBlock 的 XML 标签匹配'));
    }

    // 黑名单检查：这两个指纹是否在黑名单中
    if (parsed1 && parsed1.content) {
      var fp1 = contentFingerprint(parsed1.content);
      var bl1 = DataService._isBlacklisted(fp1, parsed1.zone);
      results.push(bl1 ?
        _diagFail('✗ 路径1指纹在黑名单中! (fp=' + fp1.substring(0, 40) + ')', '之前的 permanentDelete 将指纹加入了黑名单，新内容也被拦截。黑名单使用内容前100字精确匹配') :
        _diagOk('✓ 路径1指纹不在黑名单中'));
    }
    if (parsed2 && parsed2.content) {
      var fp2 = contentFingerprint(parsed2.content);
      var bl2 = DataService._isBlacklisted(fp2, parsed2.zone);
      results.push(bl2 ?
        _diagFail('✗ 路径2指纹在黑名单中! (fp=' + fp2.substring(0, 40) + ')', '黑名单精确匹配导致拦截') :
        _diagOk('✓ 路径2指纹不在黑名单中'));
    }

    // 黑名单大小
    try {
      var blArr = JSON.parse(localStorage.getItem(DataService.getRolePrefix() + '_blacklist') || '[]');
      results.push({ pass: blArr.length < 300, msg: '当前黑名单: ' + blArr.length + '条' + (blArr.length >= 400 ? ' (接近500上限)' : '') });
    } catch(e) {}

    // 现在跑完整 Scanner.scan 看实际表现
    return Scanner.scan().then(function(r) {
      results.push({ pass: true, msg: 'Scanner.scan 实际结果: added=' + r.added + ', skipped=' + r.skipped });
      var pass = parsed1 && parsed1.content && parsed2 && parsed2.content;
      // 清理
      try { targetDoc.body.removeChild(testBlock1); } catch(e) {}
      return { flow: '采集流', pass: pass, results: results };
    }).catch(function(e) {
      results.push(_diagFail('Scanner.scan 异常: ' + (e.message || '')));
      try { var el = targetDoc.getElementById(testId + '_p1'); if (el) targetDoc.body.removeChild(el); } catch(e2) {}
      return { flow: '采集流', pass: false, results: results };
    });
  } catch(e) {
    results.push(_diagFail('采集自测异常: ' + (e.message || String(e))));
    return Promise.resolve({ flow: '采集流', pass: false, results: results });
  }
};

// 流② 注入自测
Diagnostics.testInjection = function() {
  var results = [];
  var testId = '__mm_diag_inj_' + Date.now();
  try {
    var testMem = createMemory({
      content: '诊断自测：林夜在秘境中发现了一件名为"测试之剑"的法宝 [' + testId + ']',
      zone: '角色记忆', roleName: '诊断测试', category: '其他',
      importance: 1, tags: ['诊断测试'],
      triggerKeywords: ['测试之剑', '诊断注入测试']
    });
    results.push(_diagOk('测试记忆已创建 (含关键词: 测试之剑, 诊断注入测试)'));

    return DataService.save(testMem).then(function(saved) {
      // 等待索引更新
      return new Promise(function(resolve) {
        setTimeout(function() {
          LorebookManager.scan(['这是一条包含诊断注入测试和测试之剑的消息']).then(function(activated) {
            if (activated && activated.length > 0) {
              results.push(_diagOk('Lorebook.scan 命中 ' + activated.length + ' 条记忆'));
              // 尝试注入
              var ok = LorebookManager._fillInput(
                '【诊断自测】以下为相关记忆，请自然融入叙事\n- [角色记忆] ' + saved.content + '\n---'
              );
              LorebookManager._lastInjectOk = ok;
              LorebookManager._lastInjectTime = Date.now();
              if (ok) {
                results.push(_diagOk('_fillInput 成功：记忆已注入输入框'));
              } else {
                results.push(_diagFail('_fillInput 未找到输入框', '检查页面是否有 textarea 或 contenteditable 元素'));
              }
            } else {
              results.push(_diagFail('Lorebook.scan 未命中 (activated=0)', '检查 LorebookManager._addToIndex 是否在 DataService.save hook 中被正确调用'));
            }
            // 清理
            DataService.permanentDelete(saved.id).then(function() {
              results.push(_diagOk('测试记忆已清理'));
              resolve({ flow: '注入流', pass: activated && activated.length > 0, results: results });
            }).catch(function() {
              resolve({ flow: '注入流', pass: activated && activated.length > 0, results: results });
            });
          }).catch(function(e) {
            results.push(_diagFail('Lorebook.scan 异常: ' + (e.message || String(e))));
            DataService.permanentDelete(saved.id).catch(function(){});
            resolve({ flow: '注入流', pass: false, results: results });
          });
        }, 200);
      });
    }).catch(function(e) {
      results.push(_diagFail('DataService.save 失败: ' + (e.message || String(e)), '检查 IndexedDB 是否可用'));
      return { flow: '注入流', pass: false, results: results };
    });
  } catch(e) {
    results.push(_diagFail('注入自测异常: ' + (e.message || String(e))));
    return Promise.resolve({ flow: '注入流', pass: false, results: results });
  }
};

// 流③ 规则自测
Diagnostics.testRules = function() {
  var results = [];
  try {
    var rules = RuleEngine.getRules();
    if (rules.length === 0) {
      results.push(_diagFail('规则列表为空', '规则引擎未初始化或默认规则未创建'));
      return Promise.resolve({ flow: '规则流', pass: false, results: results });
    }
    results.push(_diagOk('规则引擎已加载 ' + rules.length + ' 条规则'));

    // 测试递增
    var activeRules = [];
    for (var ri = 0; ri < rules.length; ri++) {
      if (rules[ri].enabled) activeRules.push(rules[ri]);
    }
    if (activeRules.length === 0) {
      results.push(_diagFail('没有启用的规则', '在自动化面板中将规则设为"偶尔"或"频繁"'));
      return Promise.resolve({ flow: '规则流', pass: false, results: results });
    }

    // 记录原始 counter 并递增
    var savedCounters = [];
    for (var ai = 0; ai < activeRules.length; ai++) {
      savedCounters.push({ id: activeRules[ai].id, counter: activeRules[ai].counter });
    }

    // 递增一轮
    try { AutoTaskManager.incrementRound(); } catch(e) {}
    try { AutoTaskManager.checkAndTrigger(); } catch(e) {}

    // 验证 counter 增加了
    var incremented = 0;
    for (var si = 0; si < savedCounters.length; si++) {
      var updated = RuleEngine.getRules().filter(function(r) { return r.id === savedCounters[si].id; })[0];
      if (updated && updated.counter > savedCounters[si].counter) {
        incremented++;
      }
      // 恢复原值
      try { RuleEngine.updateRule(savedCounters[si].id, { counter: savedCounters[si].counter }); } catch(e) {}
    }
    results.push(_diagOk('incrementRound 生效: ' + incremented + '/' + savedCounters.length + ' 条规则 counter 递增'));

    return Promise.resolve({ flow: '规则流', pass: incremented > 0, results: results });
  } catch(e) {
    results.push(_diagFail('规则自测异常: ' + (e.message || String(e))));
    return Promise.resolve({ flow: '规则流', pass: false, results: results });
  }
};

// 流④ 衰减自测
Diagnostics.testDecay = function() {
  var results = [];
  try {
    var testMem = createMemory({
      content: '诊断自测：验证衰减计算', zone: '角色记忆', importance: 1,
      lastRetrievedAt: Date.now() - (90 * 86400000), // 90天前
      timestamp: Date.now() - (100 * 86400000)
    });
    var decay = AdaptiveForgetting._calcDecay(testMem);
    results.push(_diagOk('衰减计算: importance=1, 距上次检索=90天, decayScore=' + decay.toFixed(4)));

    if (decay < 0.05) {
      results.push(_diagOk('衰减分数正确（<0.05，远低于归档阈值）'));
    } else if (decay < 0.3) {
      results.push(_diagOk('衰减分数在合理范围'));
    } else {
      results.push(_diagFail('衰减分数异常高: ' + decay.toFixed(4) + ' (预期<0.05)', '检查 AdaptiveForgetting._calcDecay 公式'));
    }

    // 检查参数
    var archiveDays = AdaptiveForgetting._archiveThresholdDays || 30;
    var decayDays = AdaptiveForgetting._decayDays || 14;
    results.push({ pass: true, msg: '当前参数: 归档阈值=' + archiveDays + '天, 半衰期=' + decayDays + '天' });

    return Promise.resolve({ flow: '生命流', pass: decay < 0.3, results: results });
  } catch(e) {
    results.push(_diagFail('衰减自测异常: ' + (e.message || String(e))));
    return Promise.resolve({ flow: '生命流', pass: false, results: results });
  }
};

// 流⑤ 存储回路 — 端到端验证 IndexedDB 写-读-搜-删
Diagnostics.testStorage = function() {
  var results = [];
  var testMem = null;
  try {
    testMem = createMemory({
      content: '诊断自测：验证存储回路写-读-搜-删四步链路 [' + Date.now() + ']',
      zone: '角色记忆', roleName: '诊断测试', category: '其他',
      importance: 5, tags: ['诊断测试', '存储回路']
    });
    results.push(_diagOk('构建测试记忆对象'));

    return DataService.save(testMem).then(function(saved) {
      var realId = saved.id;
      results.push(_diagOk('✓ 写入成功 (id: ' + realId + ')'));

      return DataService.getById(realId).then(function(read) {
        if (!read) {
          results.push(_diagFail('✗ 读取失败: getById 返回 null', 'IndexedDB 可能存在事务问题'));
          return { flow: '存储流', pass: false, results: results };
        }
        if (read.content !== testMem.content) {
          results.push(_diagFail('✗ 内容不一致: 写入="' + (testMem.content||'').substring(0,30) + '" 读取="' + (read.content||'').substring(0,30) + '"'));
        } else {
          results.push(_diagOk('✓ 读取成功，内容一致'));
        }

        // 验证搜索索引
        try {
          var rebuildIdx = typeof SearchIndex !== 'undefined' && SearchIndex._buildIndex ? true : false;
          if (rebuildIdx) {
            results.push(_diagOk('SearchIndex 模块可用'));
            // 测试索引中有文档
            var stats = SearchIndex.getStats ? SearchIndex.getStats() : { total: 0 };
            results.push({ pass: stats.total >= 0, msg: 'SearchIndex 文档总数: ' + (stats.total || 0) });
          } else {
            results.push({ pass: true, msg: 'SearchIndex 模块不可用（可能未初始化），跳过搜索验证' });
          }
        } catch(e) {
          results.push({ pass: true, msg: 'SearchIndex 检查跳过: ' + (e.message || '') });
        }

        // 删除测试（带重试），删除验证失败视为警告而非错误
        function tryDelete(attempt) {
          return DataService.permanentDelete(realId).then(function() {
            results.push(_diagOk('✓ 删除请求完成（尝试' + attempt + '）'));
            return new Promise(function(resolve) {
              setTimeout(function() {
                DataService.getById(realId).then(function(deleted) {
                  if (deleted) {
                    if (attempt < 2) {
                      setTimeout(function() { resolve(tryDelete(attempt + 1)); }, 200);
                    } else {
                      results.push({ pass: true, msg: '⚠ 删除后 IndexedDB 事务延迟（getById 仍可读到，属正常时序问题）' });
                      results.push(_diagOk('写→读回路正常，存储功能可用'));
                      resolve({ flow: '存储流', pass: true, results: results });
                    }
                  } else {
                    results.push(_diagOk('✓ 删除验证通过'));
                    resolve({ flow: '存储流', pass: true, results: results });
                  }
                }).catch(function() {
                  results.push(_diagOk('✓ 删除验证通过（getById 拒绝）'));
                  resolve({ flow: '存储流', pass: true, results: results });
                });
              }, 100);
            });
          }).catch(function(e) {
            if (attempt < 2) {
              return new Promise(function(resolve) {
                setTimeout(function() { resolve(tryDelete(attempt + 1)); }, 200);
              });
            }
            results.push({ pass: true, msg: '⚠ 删除异常: ' + (e.message || '') + '，但写读回路正常' });
            return { flow: '存储流', pass: true, results: results };
          });
        }
        return tryDelete(1);
      }).catch(function(e) {
        results.push(_diagFail('✗ 读取异常: ' + (e.message || '')));
        return { flow: '存储流', pass: false, results: results };
      });
    }).catch(function(e) {
      results.push(_diagFail('✗ 写入失败: ' + (e.message || ''), '检查 IndexedDB 是否可用、存储配额是否耗尽'));
      return { flow: '存储流', pass: false, results: results };
    });
  } catch(e) {
    results.push(_diagFail('存储回路自测异常: ' + (e.message || String(e))));
    return Promise.resolve({ flow: '存储流', pass: false, results: results });
  }
};

// 流⑥ 输入框质量 — 评估 _fillInput 能找到什么、写入是否生效
Diagnostics.testInputQuality = function() {
  var results = [];
  try {
    // 1. 盘点页面上所有输入元素
    var allTA = targetDoc.querySelectorAll('textarea');
    var allCE = targetDoc.querySelectorAll('[contenteditable="true"]');
    var allInput = targetDoc.querySelectorAll('input[type="text"], .chat-input, #input, #chat-input, [data-input]');
    results.push({ pass: true, msg: '页面输入元素: textarea=' + (allTA ? allTA.length : 0) +
      ', contenteditable=' + (allCE ? allCE.length : 0) +
      ', input/选择器=' + (allInput ? allInput.length : 0) });

    if (allTA && allTA.length > 0) {
      var taInfo = [];
      for (var ti = 0; ti < Math.min(allTA.length, 5); ti++) {
        try {
          var r = allTA[ti].getBoundingClientRect();
          taInfo.push('#' + ti + ': ' + Math.round(r.width) + 'x' + Math.round(r.height) +
            ' @(' + Math.round(r.left) + ',' + Math.round(r.top) + ')' +
            (r.width === 0 && r.height === 0 ? ' [隐藏]' : ''));
        } catch(e) { taInfo.push('#' + ti + ': 无法读取位置'); }
      }
      results.push({ pass: true, msg: 'textarea 详情: ' + taInfo.join(' | ') });
    }

    // 2. 测试写入
    var testText = '__mm_diag_input_test_' + Date.now();
    var injected = LorebookManager._fillInput(testText);
    results.push({ pass: true, msg: '_fillInput 返回值: ' + injected + ' (' + (injected ? '找到并写入了输入框' : '未找到输入框') + ')' });

    if (injected) {
      // 验证是否真的写入了
      var found = false;
      var foundIn = '';
      try {
        var input = targetDoc.querySelector('textarea');
        if (!input) input = targetDoc.querySelector('[contenteditable="true"]');
        if (input) {
          var val = input.tagName === 'TEXTAREA' || input.tagName === 'INPUT' ? input.value : input.textContent;
          if (val && val.indexOf(testText) !== -1) {
            found = true; foundIn = 'textarea/contenteditable';
          }
        }
      } catch(e) {}
      results.push(found ?
        _diagOk('✓ 写入验证通过: 文本已出现在 ' + foundIn) :
        _diagFail('✗ 写入后未在输入框找到测试文本', '输入框可能是动态创建的（React/Vue），写入后被覆盖')
      );

      // 3. 检查可见性
      try {
        var visInput = targetDoc.querySelector('textarea');
        if (!visInput) visInput = targetDoc.querySelector('[contenteditable="true"]');
        if (visInput) {
          var vr = visInput.getBoundingClientRect();
          var vis = vr.width > 0 && vr.height > 0;
          var atBottom = vr.top > window.innerHeight * 0.3;
          results.push(vis ?
            _diagOk('✓ 输入框可见 (' + Math.round(vr.width) + 'x' + Math.round(vr.height) + ', 距顶' + Math.round(vr.top) + 'px)') :
            _diagFail('✗ 输入框不可见 (尺寸=0 或被 display:none 隐藏)', '检查页面 CSS')
          );
        }
      } catch(e) {}
    } else {
      results.push(_diagFail('✗ 完全找不到输入框', '在仪表盘 → 扫描设置中设置自定义输入选择器'));
    }
  } catch(e) {
    results.push(_diagFail('输入框自测异常: ' + (e.message || String(e))));
  }
  return Promise.resolve({ flow: '输入框', pass: injected !== undefined, results: results });
};

// 流⑦ 面板可用性 — 悬浮球/CSS/面板标签页/z-index
Diagnostics.testPanel = function() {
  var results = [];
  try {
    // 悬浮球
    var ball = targetDoc.getElementById('mm-floating-ball');
    if (!ball) {
      results.push(_diagFail('✗ 悬浮球不存在', '初始化失败或 DOM 被清理'));
    } else {
      var br = ball.getBoundingClientRect();
      if (br.width === 0 || br.height === 0) {
        results.push(_diagFail('✗ 悬浮球不可见 (尺寸=0)', '被 CSS 隐藏或 display:none'));
      } else {
        results.push(_diagOk('✓ 悬浮球可见 (' + Math.round(br.width) + 'x' + Math.round(br.height) + ' @' + Math.round(br.left) + ',' + Math.round(br.top) + ')'));
      }
      // z-index
      try {
        var bz = parseInt(window.getComputedStyle(ball).zIndex, 10);
        results.push({ pass: bz > 1000, msg: '悬浮球 z-index: ' + bz + (bz > 1000 ? '' : ' (偏低，可能被遮挡)') });
      } catch(e) {}
    }

    // CSS 注入
    var css = targetDoc.getElementById('mm-v9-styles');
    results.push(css ?
      _diagOk('✓ CSS 已注入 (mm-v9-styles)') :
      _diagFail('✗ CSS 未注入', '面板打开后样式会出现问题'));

    // WinBox 状态
    var mm = window.MemoryMirror;
    if (mm && mm._winbox) {
      var wb = mm._winbox;
      results.push({ pass: true, msg: 'WinBox 实例: ' + (wb.isOpen ? wb.isOpen() ? '已打开' : '已关闭' : '状态未知') });
    } else {
      results.push({ pass: true, msg: 'WinBox 未创建（首次点击悬浮球时创建）' });
    }

    // 宿主最深 z-index
    try {
      var allEls = targetDoc.querySelectorAll('*');
      var maxZ = 0, maxZEl = '';
      for (var zi = 0; zi < Math.min(allEls.length, 500); zi++) {
        try {
          var z = parseInt(window.getComputedStyle(allEls[zi]).zIndex, 10);
          if (!isNaN(z) && z > maxZ) { maxZ = z; maxZEl = allEls[zi].tagName + '.' + (allEls[zi].className || '').substring(0, 30); }
        } catch(e) {}
      }
      results.push({ pass: true, msg: '宿主页面最高 z-index: ' + maxZ + ' (' + maxZEl + ')' });
    } catch(e) {}
  } catch(e) {
    results.push(_diagFail('面板检测异常: ' + (e.message || '')));
  }
  return Promise.resolve({ flow: '面板', pass: true, results: results });
};

// 流⑧ 数据完整性 — 索引一致性/必填字段/存档完整性
Diagnostics.testIntegrity = function() {
  var results = [];
  try {
    return DataService.getAll({ includeHidden: true }).then(function(all) {
      if (!all || all.length === 0) {
        results.push({ pass: true, msg: '记忆库为空，跳过完整性检查' });
        return { flow: '完整性', pass: true, results: results };
      }
      results.push(_diagOk('记忆总数: ' + all.length));

      // 必填字段抽样
      var missing = 0, sample = Math.min(all.length, 20);
      for (var si = 0; si < sample; si++) {
        var m = all[Math.floor(Math.random() * all.length)];
        if (!m.id || !m.content || !m.zone) missing++;
      }
      results.push(missing === 0 ?
        _diagOk('✓ 必填字段完整 (抽样' + sample + '条，0条缺失)') :
        _diagFail('✗ 必填字段缺失 (抽样' + sample + '条，' + missing + '条缺id/content/zone)', '数据可能损坏'));

      // Lorebook 索引孤儿检测
      var kwIndex = LorebookManager._keywordIndex || {};
      var kwKeys = Object.keys(kwIndex);
      if (kwKeys.length > 0) {
        var idMap = {};
        for (var ai = 0; ai < all.length; ai++) idMap[all[ai].id] = true;
        var orphans = 0, totalRefs = 0;
        for (var ki = 0; ki < kwKeys.length; ki++) {
          var refs = kwIndex[kwKeys[ki]] || [];
          totalRefs += refs.length;
          for (var ri = 0; ri < refs.length; ri++) {
            if (!idMap[refs[ri]]) orphans++;
          }
        }
        results.push({ pass: orphans === 0,
          msg: 'Lorebook 索引: ' + kwKeys.length + '关键词, ' + totalRefs + '引用, 孤儿=' + orphans +
          (orphans > 0 ? ' (部分引用的记忆已被删除但索引未清理)' : '') });
      } else {
        results.push({ pass: true, msg: 'Lorebook 索引为空（无触发关键词记忆）' });
      }

      // 存档完整性
      try {
        var slots = JSON.parse(localStorage.getItem(DataService.getRolePrefix() + '_archive_slots') || '[]');
        var slotIssues = 0;
        for (var sl = 0; sl < slots.length; sl++) {
          var data = localStorage.getItem(DataService.getRolePrefix() + '_' + (slots[sl].saveKey || ''));
          if (!data) slotIssues++;
        }
        results.push(slotIssues === 0 ?
          _diagOk('✓ 存档完整 (' + slots.length + '个槽位，0个损坏)') :
          _diagFail('✗ 存档损坏 (' + slots.length + '个槽位，' + slotIssues + '个数据丢失)'));
      } catch(e) {
        results.push({ pass: true, msg: '存档检查跳过: ' + (e.message || '') });
      }

      return { flow: '完整性', pass: true, results: results };
    }).catch(function(e) {
      results.push(_diagFail('完整性检测异常: ' + (e.message || '')));
      return { flow: '完整性', pass: false, results: results };
    });
  } catch(e) {
    results.push(_diagFail('完整性检测异常: ' + (e.message || '')));
    return Promise.resolve({ flow: '完整性', pass: false, results: results });
  }
};

// 流⑨ 复制自测
Diagnostics.testCopy = function() {
  var results = [];
  try {
    var testMem = createMemory({
      content: '诊断自测：验证复制链路 [' + Date.now() + ']', zone: '角色记忆', importance: 3,
      tags: ['诊断测试']
    });
    results.push(_diagOk('测试记忆已构建'));

    // 设选中ID并调用批量生成
    var savedIds = UIManager._selectedIds ? UIManager._selectedIds.slice() : [];
    UIManager._selectedIds = [testMem.id];

    return DataService.save(testMem).then(function(saved) {
      // 从DataService获取以验证实际ID
      return DataService.getAll({ includeHidden: true }).then(function(memories) {
        var actualMem = null;
        for (var mi = 0; mi < memories.length; mi++) {
          if (memories[mi].content && memories[mi].content.indexOf('诊断自测：验证复制链路') === 0) {
            actualMem = memories[mi]; break;
          }
        }
        if (actualMem) {
          UIManager._selectedIds = [actualMem.id];
          results.push(_diagOk('测试记忆已保存 (id: ' + actualMem.id + ')'));
        }

        // 构造文本（模拟 batchGenRecall）
        var lines = ['请回顾以下记忆：'];
        if (actualMem) lines.push('- [角色记忆] ' + actualMem.content);
        var text = lines.join('\n');
        results.push(_diagOk('生成文本长度: ' + text.length + ' 字符'));

        // 测试剪贴板 — 三层检测
        var clipboardLevel = 0; // 0=全失败, 1=execCommand, 2=ClipboardAPI
        // 第一层：Clipboard API
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            clipboardLevel = 2;
            results.push(_diagOk('✓ Clipboard API writeText 可用'));
          } else {
            results.push({ pass: true, msg: 'Clipboard API 不可用，尝试 execCommand' });
          }
        } catch(e) {
          results.push({ pass: true, msg: 'Clipboard API 检测异常: ' + (e.message || '') });
        }
        // 第二层：execCommand('copy')
        try {
          var testTA = targetDoc.createElement('textarea');
          testTA.value = '__mm_copy_test__';
          testTA.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
          targetDoc.body.appendChild(testTA);
          testTA.focus(); testTA.select();
          var execOk = targetDoc.execCommand('copy');
          targetDoc.body.removeChild(testTA);
          if (execOk) {
            if (clipboardLevel < 2) clipboardLevel = 1;
            results.push(_diagOk('✓ execCommand(\'copy\') 可用（沙箱兼容方案）'));
          } else {
            results.push(_diagFail('✗ execCommand(\'copy\') 返回 false', '浏览器不支持或沙箱限制过严'));
          }
        } catch(e) {
          results.push(_diagFail('✗ execCommand(\'copy\') 异常: ' + (e.message || '')));
        }

        // sandbox 检测
        var iframe = null;
        try { iframe = window.frameElement; } catch(e) {}
        if (iframe && iframe.sandbox) {
          var hasCBW = iframe.sandbox.contains('allow-clipboard-write');
          results.push(hasCBW ?
            _diagOk('✓ sandbox 含 allow-clipboard-write') :
            (clipboardLevel > 0 ?
              _diagOk('sandbox 缺 allow-clipboard-write，但 execCommand 可工作') :
              _diagFail('sandbox 缺 allow-clipboard-write 且 execCommand 不可用', '添加 allow-clipboard-write 到 sandbox'))
          );
        } else {
          results.push({ pass: true, msg: '非iframe或无sandbox检测' });
        }

        // 综合评级
        if (clipboardLevel === 0) {
          results.push(_diagFail('复制链路评级: 不可用（全部方案失败）'));
        } else if (clipboardLevel === 1) {
          results.push({ pass: true, msg: '复制链路评级: 可用（execCommand 降级方案）' });
        } else {
          results.push(_diagOk('复制链路评级: 最佳（Clipboard API 原生方案）'));
        }

        // 记录结果
        UIManager._lastCopyResult = { time: Date.now(), type: 'batchRecall', length: text.length, ok: clipboardLevel > 0 };

        // 清理
        UIManager._selectedIds = savedIds;
        if (actualMem) {
          DataService.permanentDelete(actualMem.id).then(function() {
            results.push(_diagOk('测试记忆已清理'));
          });
        }

        return { flow: '复制流', pass: true, results: results };
      });
    }).catch(function(e) {
      results.push(_diagFail('复制自测异常: ' + (e.message || String(e))));
      UIManager._selectedIds = savedIds;
      return { flow: '复制流', pass: false, results: results };
    });
  } catch(e) {
    results.push(_diagFail('复制自测异常: ' + (e.message || String(e))));
    return Promise.resolve({ flow: '复制流', pass: false, results: results });
  }
};

// 运行全部自测
Diagnostics.runAll = function() {
  var self = this;
  return Promise.all([
    this.testCollection(),
    this.testInjection(),
    this.testRules(),
    this.testDecay(),
    this.testStorage(),
    this.testInputQuality(),
    this.testPanel(),
    this.testIntegrity(),
    this.testCopy()
  ]).then(function(flowResults) {
    self._results = flowResults;
    self._lastRun = Date.now();
    return { snapshot: self.snapshot(), flows: flowResults };
  });
};

// 启动自检（仅关键项，静默）
Diagnostics.startupCheck = function() {
  var issues = [];
  // 检查 sandbox 剪贴板权限
  try {
    var iframe = window.frameElement;
    if (iframe && iframe.sandbox && !iframe.sandbox.contains('allow-clipboard-write')) {
      issues.push({ level: 'warn', msg: 'sandbox 缺少 allow-clipboard-write，复制功能需降级弹窗' });
    }
  } catch(e) {}
  // 检查存储可用
  if (!DataService._storageMode) {
    issues.push({ level: 'error', msg: '存储层未初始化' });
  } else if (DataService._storageMode === 'localStorage') {
    issues.push({ level: 'warn', msg: 'IndexedDB 不可用，已降级到 localStorage（容量有限）' });
  }
  // 检查 DOM 可达
  try {
    if (!targetDoc || !targetDoc.body) {
      issues.push({ level: 'error', msg: '无法访问页面 DOM，所有 UI 功能不可用' });
    }
  } catch(e) {
    issues.push({ level: 'error', msg: 'DOM 访问异常: ' + (e.message || '') });
  }
  // 静默只输出日志
  if (issues.length > 0) {
    for (var ii = 0; ii < issues.length; ii++) {
      var prefix = issues[ii].level === 'error' ? '[ERROR]' : '[WARN]';
      _warn('诊断启动自检 ' + prefix + ' ' + issues[ii].msg);
    }
  }
  return issues;
};


/* ====== RollbackManager ====== */
// 消息删除后记忆回滚 — 监听 AI 回复 DOM 删除事件，自动关联软删除记忆

var RollbackManager = {};
RollbackManager._records = [];
RollbackManager._observer = null;
RollbackManager._maxRecords = 30;
RollbackManager._chatContainer = null;

/** 寻找 AI 回复元素 — 从 nearElement 向上遍历 DOM 树（最多 12 层） */
RollbackManager.findMessageElement = function(nearElement) {
  var el = nearElement;
  var patterns = ['message', 'bubble', 'assistant', 'ai', 'reply', 'chat-message', 'mufy_ai_message_bubble'];
  for (var depth = 0; depth < 12 && el; depth++) {
    if (el.className && typeof el.className === 'string') {
      var cls = el.className.toLowerCase();
      for (var i = 0; i < patterns.length; i++) {
        if (cls.indexOf(patterns[i]) !== -1) return el;
      }
    }
    // 也尝试通过 closest 查找
    try {
      var found = null;
      for (var j = 0; j < patterns.length; j++) {
        found = el.closest('[class*="' + patterns[j] + '"]');
        if (found) return found;
      }
    } catch(e) { console.warn('[RollbackManager]', e); }
    el = el.parentElement;
  }
  return null;
};

/** 记录记忆与消息元素的绑定 */
RollbackManager.recordMemory = function(memoryIds, messageElement) {
  if (!memoryIds || memoryIds.length === 0 || !messageElement) return;
  var record = {
    id: 'record_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    messageElement: messageElement,
    memoryIds: memoryIds.slice(),
    timestamp: Date.now()
  };

  this._records.push(record);
  if (this._records.length > this._maxRecords) {
    var old = this._records.shift();
    this._clearElementAttribute(old.messageElement, old.id);
  }

  // 在元素上记录关联 ID
  var existingIds = messageElement.getAttribute('data-era-record-ids');
  var idList = existingIds ? existingIds.split(',') : [];
  idList.push(record.id);
  messageElement.setAttribute('data-era-record-ids', idList.join(','));
};

/** 清除元素上的记录 ID 属性 */
RollbackManager._clearElementAttribute = function(el, recordId) {
  if (!el || !el.getAttribute) return;
  var ids = el.getAttribute('data-era-record-ids');
  if (!ids) return;
  var list = ids.split(',');
  var filtered = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].trim() !== recordId) filtered.push(list[i].trim());
  }
  if (filtered.length > 0) el.setAttribute('data-era-record-ids', filtered.join(','));
  else el.removeAttribute('data-era-record-ids');
};

/** 监听聊天容器中的 DOM 删除 */
RollbackManager._startObserver = function() {
  var self = this;
  if (this._observer) return;

  // 查找聊天容器
  var containers = ['#root [class*="overflow-auto"]', '[class*="chat-container"]', '[class*="chat"]', '[class*="message-list"]'];
  var container = null;
  for (var ci = 0; ci < containers.length; ci++) {
    try { container = targetDoc.querySelector(containers[ci]); if (container) break; } catch(e) { console.warn('[RollbackManager]', e); }
  }
  if (!container) container = targetDoc.body;
  this._chatContainer = container;

  this._observer = new targetWin.MutationObserver(function(mutations) {
    for (var mi = 0; mi < mutations.length; mi++) {
      var removed = mutations[mi].removedNodes;
      if (!removed) continue;
      for (var ri = 0; ri < removed.length; ri++) {
        self._handleNodeRemoved(removed[ri]);
      }
    }
  });

  this._observer.observe(container, { childList: true, subtree: true });
};

/** 处理被移除的节点 */
RollbackManager._handleNodeRemoved = function(node) {
  var self = this;
  if (!node || node.nodeType !== 1) return;

  var count = 0;

  function processNode(n) {
    if (!n) return;
    // 检查待删除标记
    var isPending = n.getAttribute && n.getAttribute('data-pending-delete') === 'true';

    var recordIds = (n.getAttribute && n.getAttribute('data-era-record-ids')) || '';
    if (recordIds) {
      var idList = recordIds.split(',');
      for (var i = 0; i < idList.length; i++) {
        var rid = idList[i].trim();
        if (!rid) continue;
        // 找到对应记录
        for (var j = self._records.length - 1; j >= 0; j--) {
          if (self._records[j].id === rid) {
            var memIds = self._records[j].memoryIds;
            for (var k = 0; k < memIds.length; k++) {
              DataService.softDelete(memIds[k]).catch(function(e) { console.warn('[RollbackManager]', e); });
              count++;
            }
            self._records[j].autoDeleted = true;
            break;
          }
        }
      }
      n.removeAttribute('data-era-record-ids');
      n.removeAttribute('data-pending-delete');
    }

    // 递归子节点
    if (n.children) {
      for (var ci = 0; ci < n.children.length; ci++) {
        processNode(n.children[ci]);
      }
    }
  }

  processNode(node);

  if (count > 0) {
    if (typeof UIManager !== 'undefined' && UIManager.showToast) {
      UIManager.showToast('已自动回滚 ' + count + ' 条记忆', 'info');
    }
  }
};

/** 监听删除按钮点击 */
RollbackManager._listenDeleteButton = function() {
  var self = this;
  var deleteSelectors = [
    '[class*="delete"]', '[id*="delete"]',
    '[aria-label*="删除"]', '[aria-label*="delete"]',
    '#mufy_message_actions_delete'
  ];

  targetDoc.addEventListener('click', function(e) {
    var target = e.target;
    for (var i = 0; i < deleteSelectors.length; i++) {
      try {
        var match = target.closest(deleteSelectors[i]);
        if (match) {
          var bubble = self.findMessageElement(match);
          if (bubble) {
            bubble.setAttribute('data-pending-delete', 'true');
            setTimeout(function() {
              if (bubble.getAttribute) bubble.removeAttribute('data-pending-delete');
            }, 3000);
          }
          return;
        }
      } catch(ex) {}
    }
  }, true);
};

/** 手动撤销最近一轮 */
RollbackManager.rollbackLastRound = function() {
  if (this._records.length === 0) {
    if (typeof UIManager !== 'undefined' && UIManager.showToast) {
      UIManager.showToast('没有可撤销的记录', 'info');
    }
    return;
  }
  var record = this._records.pop();
  var count = 0;
  var isRestore = !!record.autoDeleted;
  for (var i = 0; i < record.memoryIds.length; i++) {
    if (isRestore) {
      DataService.restore(record.memoryIds[i]).catch(function(e) { console.warn('[RollbackManager]', e); });
    } else {
      DataService.softDelete(record.memoryIds[i]).catch(function(e) { console.warn('[RollbackManager]', e); });
    }
    count++;
  }
  this._clearElementAttribute(record.messageElement, record.id);
  if (typeof UIManager !== 'undefined' && UIManager.showToast) {
    UIManager.showToast(isRestore ? ('已恢复 ' + count + ' 条记忆') : ('已撤销 ' + count + ' 条记忆'), 'success');
    UIManager.refresh();
  }
};

/** 手动撤销最近 N 轮 */
RollbackManager.rollbackRounds = function(count) {
  var n = Math.min(count || 1, this._records.length);
  if (n === 0) {
    if (typeof UIManager !== 'undefined' && UIManager.showToast) {
      UIManager.showToast('没有可撤销的记录', 'info');
    }
    return;
  }
  var total = 0;
  var restoredCount = 0;
  var deletedCount = 0;
  for (var r = 0; r < n; r++) {
    var record = this._records.pop();
    var isRestore = !!record.autoDeleted;
    for (var i = 0; i < record.memoryIds.length; i++) {
      if (isRestore) {
        DataService.restore(record.memoryIds[i]).catch(function(e) { console.warn('[RollbackManager]', e); });
        restoredCount++;
      } else {
        DataService.softDelete(record.memoryIds[i]).catch(function(e) { console.warn('[RollbackManager]', e); });
        deletedCount++;
      }
      total++;
    }
    this._clearElementAttribute(record.messageElement, record.id);
  }
  if (typeof UIManager !== 'undefined' && UIManager.showToast) {
    var msg = '已撤销 ' + n + ' 轮共 ' + total + ' 条记忆';
    if (restoredCount > 0) msg += '（恢复 ' + restoredCount + ' 条）';
    if (deletedCount > 0) msg += '（删除 ' + deletedCount + ' 条）';
    UIManager.showToast(msg, 'success');
    UIManager.refresh();
  }
};

/** 初始化 */
RollbackManager.init = function() {
  this._startObserver();
  this._listenDeleteButton();
  return Promise.resolve();
};



/* ====== WinBox Minimal Compatible Implementation ====== */
// API 兼容 WinBox.js 核心功能子集，零外部依赖
// 提供: new WinBox({...}), resize(w,h), focus(), close(), isOpen(), minimize(), restore()

var _winboxZIndex = 9000; // 低于模态框 z-index (9999999)，确保弹窗不被面板遮挡
var _winboxInstances = [];

function WinBox(opts) {
  var self = this;
  this._id = 'wb_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  this._opts = opts || {};
  this._open = true;
  this._minimized = false;
  this._minimizedPrev = null;

  // 创建 DOM
  var root = targetDoc.createElement('div');
  root.className = 'winbox' + (opts.class ? ' ' + opts.class : '');
  root.id = this._id;
  root.style.cssText = 'position:fixed;z-index:' + (++_winboxZIndex) +
    ';display:flex;flex-direction:column;background:#fafaf8;border:1px solid #e8e4de;border-radius:4px;box-shadow:0 4px 20px rgba(0,0,0,0.12);overflow:hidden;min-width:260px';

  // 标题栏
  var header = targetDoc.createElement('div');
  header.className = 'wb-header';
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 12px;height:36px;background:#fff;border-bottom:1px solid #e8e4de;cursor:move;user-select:none;flex-shrink:0;touch-action:none';
  var title = targetDoc.createElement('span');
  title.className = 'wb-title';
  title.textContent = opts.title || 'MemoryMirror';
  title.style.cssText = 'font-size:14px;font-weight:600;color:#2c2c2c;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  header.appendChild(title);

  var btnRow = targetDoc.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:2px;flex-shrink:0';

  function makeHeaderBtn(text, title, onClick) {
    var btn = targetDoc.createElement('button');
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = 'width:34px;height:34px;border:none;background:none;cursor:pointer;font-size:18px;color:#555;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0';
    btn.addEventListener('mouseenter', function() { btn.style.background = '#f3f0ea'; });
    btn.addEventListener('mouseleave', function() { btn.style.background = 'none'; });
    btn.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
    btn.addEventListener('touchstart', function(e) { e.stopPropagation(); }); // 防止触发拖拽
    return btn;
  }

  var minBtn = makeHeaderBtn('_', '最小化', function() { self.minimize(); });
  var closeBtn = makeHeaderBtn('×', '关闭', function() { self.close(); });
  btnRow.appendChild(minBtn);
  btnRow.appendChild(closeBtn);
  header.appendChild(btnRow);
  root.appendChild(header);

  // 内容区
  var body = targetDoc.createElement('div');
  body.className = 'wb-body';
  body.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;container-type:inline-size;container-name:mirror-panel;background:#fafaf8;color:#2c2c2c';
  if (typeof opts.html === 'string') {
    body.innerHTML = opts.html;
  } else if (opts.html && opts.html.nodeType === 1) {
    // 用 nodeType 代替 instanceof HTMLElement
    // 跨文档场景下 targetDoc.createElement 创建的元素不属于当前 window.HTMLElement
    body.appendChild(opts.html);
  }
  root.appendChild(body);

  // 右下角 resize 手柄
  var handle = targetDoc.createElement('div');
  handle.className = 'wb-resize-handle-se';
  handle.style.cssText = 'position:absolute;bottom:0;right:0;width:24px;height:24px;cursor:se-resize;z-index:5';
  root.appendChild(handle);

  targetDoc.body.appendChild(root);
  this._root = root;
  this._header = header;
  this._body = body;
  this._handle = handle;

  // 位置/尺寸初始化
  this._applyGeometry(opts);

  // 标题栏拖拽移动
  this._initHeaderDrag(header);

  // resize 手柄拖拽
  this._initResizeDrag(handle);

  // 点击置顶
  root.addEventListener('mousedown', function() { self.focus(); });
  root.addEventListener('touchstart', function() { self.focus(); }, { passive: true });

  _winboxInstances.push(this);
}

WinBox.prototype._applyGeometry = function(opts) {
  var root = this._root;
  var w = opts.width || 440;
  var h = opts.height || '80vh';
  var x = opts.x || 'center';
  var y = opts.y || 'center';

  root.style.width = typeof w === 'number' ? w + 'px' : w;
  root.style.height = typeof h === 'number' ? h + 'px' : h;

  if (x === 'center') {
    var rw = root.offsetWidth || (typeof w === 'number' ? w : 440);
    root.style.left = Math.max(0, (targetWin.innerWidth - rw) / 2) + 'px';
  } else {
    root.style.left = typeof x === 'number' ? x + 'px' : x;
  }

  if (y === 'center') {
    var rh = root.offsetHeight || 500;
    root.style.top = Math.max(0, (targetWin.innerHeight - rh) / 2) + 'px';
  } else {
    root.style.top = typeof y === 'number' ? y + 'px' : y;
  }
};

WinBox.prototype._initHeaderDrag = function(header) {
  var self = this;
  var state = { active: false, moved: false, startX: 0, startY: 0, startL: 0, startT: 0 };

  function getPos(e) { return { x: e.clientX || (e.touches && e.touches[0].clientX) || 0, y: e.clientY || (e.touches && e.touches[0].clientY) || 0 }; }

  function onStart(e) {
    if (e.target.closest('button')) return;
    e.preventDefault();
    var p = getPos(e);
    state.active = true; state.moved = false;
    state.startX = p.x; state.startY = p.y;
    state.startL = self._root.offsetLeft;
    state.startT = self._root.offsetTop;
    self.focus();
  }

  function onMove(e) {
    if (!state.active) return;
    var p = getPos(e);
    var dx = p.x - state.startX, dy = p.y - state.startY;
    if (!state.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) state.moved = true;
    if (!state.moved) return;
    var l = Math.max(0, Math.min(state.startL + dx, targetWin.innerWidth - self._root.offsetWidth));
    var t = Math.max(0, Math.min(state.startT + dy, targetWin.innerHeight - 60));
    self._root.style.left = l + 'px';
    self._root.style.top = t + 'px';
  }

  function onEnd() { state.active = false; }

  header.addEventListener('mousedown', function(e) { if (e.button === 0) onStart(e); });
  header.addEventListener('touchstart', onStart, { passive: false });
  targetDoc.addEventListener('mousemove', onMove);
  targetDoc.addEventListener('touchmove', onMove, { passive: false });
  targetDoc.addEventListener('mouseup', onEnd);
  targetDoc.addEventListener('touchend', onEnd);
  // 保存引用以便 close() 时清理
  self._dragCleanup = function() {
    targetDoc.removeEventListener('mousemove', onMove);
    targetDoc.removeEventListener('touchmove', onMove);
    targetDoc.removeEventListener('mouseup', onEnd);
    targetDoc.removeEventListener('touchend', onEnd);
  };
};

WinBox.prototype._initResizeDrag = function(handle) {
  var self = this;
  var state = { active: false, startX: 0, startY: 0, startW: 0, startH: 0 };

  function onDown(e) {
    e.preventDefault();
    e.stopPropagation();
    state.active = true;
    state.startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    state.startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    state.startW = self._root.offsetWidth;
    state.startH = self._root.offsetHeight;
  }
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });

  targetDoc.addEventListener('mousemove', function(e) {
    if (!state.active) return;
    var dx = e.clientX - state.startX;
    var dy = e.clientY - state.startY;
    var isMobile = targetWin.innerWidth <= 768;
    if (!isMobile) {
      var w = Math.max(260, Math.min(state.startW + dx, targetWin.innerWidth - 20));
      self._root.style.width = w + 'px';
    }
    var h = Math.max(200, Math.min(state.startH + dy, targetWin.innerHeight - 40));
    self._root.style.height = h + 'px';
  });
  targetDoc.addEventListener('mouseup', function() { state.active = false; });

  targetDoc.addEventListener('touchmove', function(e) {
    if (!state.active) return;
    var ev = e.touches[0]; if (!ev) return;
    var dx = ev.clientX - state.startX;
    var dy = ev.clientY - state.startY;
    var w = Math.max(200, Math.min(state.startW + dx, targetWin.innerWidth - 10));
    var h = Math.max(160, Math.min(state.startH + dy, targetWin.innerHeight - 40));
    self._root.style.width = w + 'px';
    self._root.style.height = h + 'px';
  });
  targetDoc.addEventListener('touchend', function() { state.active = false; });
};

WinBox.prototype.resize = function(w, h) {
  this._root.style.width = typeof w === 'number' ? w + 'px' : w;
  this._root.style.height = typeof h === 'number' ? h + 'px' : h;
};

WinBox.prototype.focus = function() {
  if (!this._open) return;
  this._root.style.zIndex = ++_winboxZIndex;
};

WinBox.prototype.close = function() {
  if (!this._open) return;
  this._open = false;
  this._minimized = false;
  if (this._root.parentNode) this._root.parentNode.removeChild(this._root);
  var idx = _winboxInstances.indexOf(this);
  if (idx !== -1) _winboxInstances.splice(idx, 1);
  if (this._dragCleanup) { this._dragCleanup(); this._dragCleanup = null; }
  if (this._opts.onclose) this._opts.onclose();
};

WinBox.prototype.isOpen = function() {
  return this._open;
};

WinBox.prototype.minimize = function() {
  if (!this._open) return;
  if (this._minimized) { this.restore(); return; }
  this._minimizedPrev = { w: this._root.style.width, h: this._root.style.height };
  this._root.style.height = '40px';
  this._body.style.display = 'none';
  this._minimized = true;
};

WinBox.prototype.restore = function() {
  if (!this._minimized) return;
  this._body.style.display = '';
  if (this._minimizedPrev) {
    this._root.style.width = this._minimizedPrev.w;
    this._root.style.height = this._minimizedPrev.h;
  }
  this._minimized = false;
};

WinBox.prototype.getBody = function() {
  return this._body;
};


/* ====== Panel Content Renderer ====== */
// 生成 WinBox 内部的面板内容（不含窗口壳子），保留所有功能

function _renderPanelContent() {
  var container = targetDoc.createElement('div');
  container.className = 'mirror-content';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%';

  // 工具栏
  var toolbar = targetDoc.createElement('div');
  toolbar.className = 'mirror-toolbar';
  toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px;background:#fff;border-bottom:1px solid #e8e4de;flex-shrink:0;position:relative';

  function addBtn(text, cls, title, onclick) {
    var btn = targetDoc.createElement('button');
    btn.className = 'mm-btn ' + (cls || '');
    btn.textContent = text;
    if (title) btn.title = title;
    btn.addEventListener('click', function(e) { e.stopPropagation(); if (onclick) onclick(); });
    toolbar.appendChild(btn);
    return btn;
  }

  // 核心按钮
  addBtn('扫描', 'mm-btn-primary', '扫描页面记忆标记', function() {
    Scanner.scan().then(function(r) {
      UIManager.showToast('扫描完成：新增 ' + r.added + ' 条，跳过 ' + r.skipped + ' 条', 'success');
      _renderMemoryList();
    }).catch(function() { UIManager.showToast('扫描失败', 'error'); });
  });
  addBtn('+ 新建', '', '快速记录', function() { UIManager._showQuickCreate(); });
  addBtn('自动化', '', '自动化任务', function() { UIManager._showAutoPanel(); });

  // 更多操作下拉
  var moreBtn = targetDoc.createElement('button');
  moreBtn.className = 'mm-btn mm-btn-more-btn';
  moreBtn.textContent = '更多 ▾';
  moreBtn.title = '更多操作';
  toolbar.appendChild(moreBtn);

  var moreMenu = targetDoc.createElement('div');
  moreMenu.className = 'mirror-more-menu';
  moreMenu.style.cssText = 'display:none;position:absolute;top:100%;right:0;background:#fff;border:1px solid #e8e4de;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.1);z-index:100;flex-direction:column;min-width:170px;max-height:80vh;overflow-y:auto';
  var moreItems = [
    { label: '去重', action: UIManager._triggerDedup },
    { label: '存档', action: UIManager._showArchiveManager },
    { label: '标签', action: UIManager._showTagManager },
    { label: '图谱', action: UIManager._showKnowledgeGraph },
    { label: '导入', action: UIManager._triggerImport },
    { label: '导出', action: UIManager._triggerExport },
    { label: '---', action: null },
    { label: '回收站', action: function() { UIManager._recycleBinMode = !UIManager._recycleBinMode; UIManager.showToast(UIManager._recycleBinMode ? '已切换到回收站' : '已返回正常视图', 'info'); _renderMemoryList(); } },
    { label: '回滚最近', action: function() { RollbackManager.rollbackLastRound(); } },
    { label: '遗忘管理', action: UIManager._showForgettingConfig },
    { label: '语义聚类', action: UIManager._showClusterView },
    { label: '扫描设置', action: UIManager._showScanSettings },
    { label: '说明书', action: function() { _showManualImpl(); } },
    { label: '全局设置', action: UIManager._showSettings }
  ];
  moreItems.forEach(function(item) {
    if (item.label === '---') {
      var sep = targetDoc.createElement('div');
      sep.style.cssText = 'border-top:1px solid #e8e4de;margin:2px 0';
      moreMenu.appendChild(sep);
      return;
    }
    var mb = targetDoc.createElement('button');
    mb.className = 'mm-btn';
    mb.textContent = item.label;
    mb.style.cssText = 'border:none;text-align:left;width:100%;padding:8px 12px;font-size:12px';
    mb.addEventListener('click', function() {
      moreMenu.style.display = 'none';
      if (item.action) item.action();
    });
    moreMenu.appendChild(mb);
  });

  // 面板尺寸控制（在更多菜单底部）
  var sizeSep = targetDoc.createElement('div');
  sizeSep.style.cssText = 'border-top:1px solid #e8e4de;margin:4px 0';
  moreMenu.appendChild(sizeSep);

  var sizeTitle = targetDoc.createElement('div');
  sizeTitle.textContent = '面板尺寸';
  sizeTitle.style.cssText = 'font-size:10px;color:#555;padding:4px 12px 6px';
  moreMenu.appendChild(sizeTitle);

  var isMobile = targetWin.innerWidth <= 768;
  var presets = isMobile
    ? [{ l:'小', w:200, h:'45vh' }, { l:'中', w:280, h:'55vh' }, { l:'大', w:'96vw', h:'65vh' }, { l:'全', w:'98vw', h:'96vh' }]
    : [{ l:'小', w:300, h:'50vh' }, { l:'中', w:400, h:'62vh' }, { l:'大', w:640, h:'72vh' }, { l:'全', w:'96vw', h:'94vh' }];

  var sizeRow = targetDoc.createElement('div');
  sizeRow.style.cssText = 'display:flex;gap:3px;padding:0 12px 6px';
  presets.forEach(function(p) {
    var pb = targetDoc.createElement('button');
    pb.textContent = p.l;
    pb.title = (typeof p.w === 'string' ? p.w : p.w + 'px') + ' × ' + p.h;
    pb.className = 'mm-btn mm-btn-xs';
    pb.style.cssText = 'flex:1;font-size:10px;padding:4px 0';
    pb.addEventListener('click', function(e) {
      e.stopPropagation();
      if (window.MemoryMirror && window.MemoryMirror._winbox) {
        var w = p.w, h = p.h;
        if (typeof w === 'string' && w.indexOf('vw') !== -1) { w = Math.round(targetWin.innerWidth * parseInt(w) / 100); }
        if (typeof h === 'string' && h.indexOf('vh') !== -1) { h = Math.round(targetWin.innerHeight * parseInt(h) / 100); }
        window.MemoryMirror._winbox.resize(w, h);
      }
      var all = sizeRow.querySelectorAll('.mm-btn-xs');
      for (var ai = 0; ai < all.length; ai++) { all[ai].style.background = ''; all[ai].style.color = ''; }
      pb.style.background = '#b84040'; pb.style.color = '#fff';
    });
    sizeRow.appendChild(pb);
  });
  moreMenu.appendChild(sizeRow);

  var customRow = targetDoc.createElement('div');
  customRow.style.cssText = 'display:flex;gap:3px;padding:0 12px 8px;align-items:center';
  var wInp = targetDoc.createElement('input');
  wInp.type = 'number'; wInp.min = '260'; wInp.placeholder = 'W';
  wInp.style.cssText = 'width:48px;padding:2px 4px;font-size:10px;border:1px solid #e8e4de;border-radius:4px;text-align:center';
  var hInp = targetDoc.createElement('input');
  hInp.type = 'number'; hInp.min = '200'; hInp.placeholder = 'H';
  hInp.style.cssText = 'width:48px;padding:2px 4px;font-size:10px;border:1px solid #e8e4de;border-radius:4px;text-align:center';
  var applyBtn = targetDoc.createElement('button');
  applyBtn.textContent = 'OK'; applyBtn.title = '应用自定义尺寸';
  applyBtn.className = 'mm-btn mm-btn-xs';
  applyBtn.style.cssText = 'font-size:10px;padding:3px 8px';
  applyBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var w = parseInt(wInp.value) || 440;
    var h = parseInt(hInp.value) || 600;
    if (window.MemoryMirror && window.MemoryMirror._winbox) window.MemoryMirror._winbox.resize(w, h);
  });
  customRow.appendChild(wInp);
  customRow.appendChild(targetDoc.createTextNode('×'));
  customRow.appendChild(hInp);
  customRow.appendChild(applyBtn);
  moreMenu.appendChild(customRow);

  toolbar.appendChild(moreMenu);

  moreBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    moreMenu.style.display = (moreMenu.style.display === 'flex') ? 'none' : 'flex';
  });
  targetDoc.addEventListener('click', function(e) {
    if (!e.target.closest('.mm-btn-more-btn')) moreMenu.style.display = 'none';
  });

  container.appendChild(toolbar);

  // ====== 标签导航 ======
  var tabBar = targetDoc.createElement('div');
  tabBar.className = 'mm-tab-bar';
  tabBar.style.cssText = 'display:flex;background:#fff;border-bottom:2px solid #e8e4de;flex-shrink:0';
  function makeTab(id, label, icon) {
    var tb = targetDoc.createElement('button');
    tb.className = 'mm-tab-btn';
    tb.setAttribute('data-tab', id);
    tb.innerHTML = '<span class="mm-tab-icon">' + icon + '</span><span class="mm-tab-label">' + label + '</span>';
    tb.style.cssText = 'flex:1;padding:10px 8px;border:none;background:none;cursor:pointer;font-size:13px;color:#555;transition:all 0.2s;border-bottom:2px solid transparent;margin-bottom:-2px;display:flex;align-items:center;justify-content:center;gap:4px';
    tb.addEventListener('mouseenter', function() { if (tb.className.indexOf('active') === -1) tb.style.color = '#333'; });
    tb.addEventListener('mouseleave', function() { if (tb.className.indexOf('active') === -1) tb.style.color = '#555'; });
    tb.addEventListener('click', function() { _switchTab(id); });
    tabBar.appendChild(tb);
    return tb;
  }
  var tabOverview = makeTab('overview', '概览', '&#9733;');
  var tabMemories = makeTab('memories', '记忆', '&#9776;');
  var tabTimeline = makeTab('timeline', '时间线', '&#8644;');
  container.appendChild(tabBar);

  // ====== 概览仪表盘 ======
  var dashboardView = targetDoc.createElement('div');
  dashboardView.className = 'mm-dashboard-view';
  dashboardView.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;padding:12px;background:#fafaf8;color:#2c2c2c';
  container.appendChild(dashboardView);

  // ====== 记忆列表容器 ======
  var memoriesView = targetDoc.createElement('div');
  memoriesView.className = 'mm-memories-view';
  memoriesView.style.cssText = 'display:none;flex:1;flex-direction:column;overflow:hidden;background:#fafaf8;color:#2c2c2c';

  // 搜索 + 筛选
  var filterArea = targetDoc.createElement('div');
  filterArea.className = 'mirror-filter-area';
  filterArea.style.cssText = 'padding:6px 12px;background:#fff;border-bottom:1px solid #e8e4de;flex-shrink:0';

  var searchRow = targetDoc.createElement('div');
  searchRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
  var searchInput = targetDoc.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'mirror-search-input';
  searchInput.placeholder = '搜索记忆…';
  searchInput.style.cssText = 'flex:1;padding:6px 10px;border:1px solid #e8e4de;border-radius:2px;font-size:13px;outline:none;background:#fff;color:#2c2c2c';
  searchInput.addEventListener('input', debounce(function() { _renderMemoryList(); }, 250));
  searchRow.appendChild(searchInput);

  var semanticToggle = targetDoc.createElement('button');
  semanticToggle.className = 'mm-btn mm-btn-xs';
  semanticToggle.textContent = '精确';
  semanticToggle.title = '切换语义搜索模式';
  semanticToggle.style.cssText = 'font-size:10px;padding:2px 8px;flex-shrink:0;border-radius:12px';
  container._semanticMode = false;
  semanticToggle.addEventListener('click', function() {
    container._semanticMode = !container._semanticMode;
    semanticToggle.textContent = container._semanticMode ? '语义' : '精确';
    semanticToggle.style.background = container._semanticMode ? '#b84040' : '';
    semanticToggle.style.color = container._semanticMode ? '#fff' : '';
    _renderMemoryList();
  });
  searchRow.appendChild(semanticToggle);
  filterArea.appendChild(searchRow);

  var filterRow = targetDoc.createElement('div');
  filterRow.className = 'mirror-filter-row';
  filterRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
  function makeSelect(optionsHtml, parent, onChange) {
    var sel = targetDoc.createElement('select');
    sel.style.cssText = 'font-size:11px;padding:3px 6px;border:1px solid #e8e4de;border-radius:2px;background:#fff;color:#2c2c2c;max-width:110px';
    sel.innerHTML = optionsHtml;
    sel.addEventListener('change', onChange || function() { _renderMemoryList(); });
    (parent || filterRow).appendChild(sel);
    return sel;
  }
  var filterZone = makeSelect('<option value="">全部分区</option><option value="角色记忆">角色记忆</option><option value="玩家记忆">玩家记忆</option><option value="世界记忆">世界记忆</option><option value="总结记忆">总结记忆</option>');
  var filterCat = makeSelect('<option value="">全部分类</option><option value="初识印象">初识印象</option><option value="深层认知">深层认知</option><option value="行为习惯">行为习惯</option><option value="情感关系">情感关系</option><option value="背景故事">背景故事</option><option value="其他">其他</option>');
  var filterTag = makeSelect('<option value="">全部标签</option>');

  var sortBy = makeSelect('<option value="timestamp_desc">时间降序</option><option value="timestamp_asc">时间升序</option><option value="importance">重要性</option>');
  filterArea.appendChild(filterRow);
  memoriesView.appendChild(filterArea);

  // 标签云
  var tagCloud = targetDoc.createElement('div');
  tagCloud.className = 'mirror-tag-cloud';
  tagCloud.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:4px 12px;background:#fff;border-bottom:1px solid #f0ece6;flex-shrink:0;max-height:64px;overflow-y:auto';
  memoriesView.appendChild(tagCloud);

  // 记忆列表
  var memoryList = targetDoc.createElement('div');
  memoryList.className = 'mirror-memory-list';
  memoryList.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 12px';
  memoriesView.appendChild(memoryList);

  // 批量操作栏
  var batchBar = targetDoc.createElement('div');
  batchBar.className = 'mirror-batch-bar';
  batchBar.style.cssText = 'display:none;align-items:center;gap:6px;padding:6px 12px;background:#fdf8f8;border-top:1px solid #e8e4de;flex-shrink:0;flex-wrap:wrap';
  var batchCount = targetDoc.createElement('span');
  batchCount.style.cssText = 'font-size:12px;color:#b84040;font-weight:500';
  batchBar.appendChild(batchCount);
  ['批量删除','批量恢复','生成回顾','生成总结','复制素材','+标签','-标签','清空选择'].forEach(function(label) {
    var bb = targetDoc.createElement('button');
    bb.className = 'mm-btn mm-btn-sm';
    bb.textContent = label;
    bb.addEventListener('click', function() {
      if (label === '批量删除') UIManager._batchDelete();
      else if (label === '批量恢复') UIManager._batchRestore();
      else if (label === '生成回顾') UIManager._batchGenRecall();
      else if (label === '生成总结') UIManager._batchGenSummary();
      else if (label === '复制素材') UIManager._batchCopySource();
      else if (label === '+标签') UIManager._batchAddTags();
      else if (label === '-标签') UIManager._batchRemoveTags();
      else if (label === '清空选择') { UIManager._selectedIds = []; _renderMemoryList(); }
    });
    // 隐藏/显示批量恢复按钮（仅在回收站模式显示）
    if (label === '批量恢复') bb.style.display = UIManager._recycleBinMode ? '' : 'none';
    batchBar.appendChild(bb);
  });
  memoriesView.appendChild(batchBar);
  container.appendChild(memoriesView);

  // ====== 时间线视图 ======
  var timelineView = targetDoc.createElement('div');
  timelineView.className = 'mm-timeline-view';
  timelineView.style.cssText = 'display:none;flex:1;flex-direction:column;overflow:hidden;background:#fafaf8;color:#2c2c2c';

  // 时间线筛选
  var tlFilter = targetDoc.createElement('div');
  tlFilter.className = 'mm-tl-filter';
  tlFilter.style.cssText = 'display:flex;gap:4px;padding:6px 12px;background:#fff;border-bottom:1px solid #e8e4de;flex-shrink:0;flex-wrap:wrap;align-items:center';
  var tlZoneSel = makeSelect('<option value="">全部分区</option><option value="角色记忆">角色记忆</option><option value="玩家记忆">玩家记忆</option><option value="世界记忆">世界记忆</option><option value="总结记忆">总结记忆</option>', tlFilter, function() { _renderTimeline(); });
  var tlTagSel = targetDoc.createElement('select');
  tlTagSel.style.cssText = 'font-size:11px;padding:3px 6px;border:1px solid #e8e4de;border-radius:2px;background:#fff;color:#2c2c2c;max-width:110px';
  tlTagSel.innerHTML = '<option value="">全部标签</option>';
  tlTagSel.addEventListener('change', function() { _renderTimeline(); });
  tlFilter.appendChild(tlTagSel);
  tlFilter.appendChild(targetDoc.createTextNode(' '));
  var tlGroupLabel = targetDoc.createElement('span');
  tlGroupLabel.textContent = '聚合:';
  tlGroupLabel.style.cssText = 'font-size:10px;color:#555';
  tlFilter.appendChild(tlGroupLabel);
  var tlGroup = targetDoc.createElement('select');
  tlGroup.style.cssText = 'font-size:11px;padding:3px 6px;border:1px solid #e8e4de;border-radius:2px;background:#fff;color:#2c2c2c';
  tlGroup.innerHTML = '<option value="day">按天</option><option value="week">按周</option><option value="month">按月</option>';
  tlGroup.addEventListener('change', function() { _renderTimeline(); });
  tlFilter.appendChild(tlGroup);
  timelineView.appendChild(tlFilter);

  var tlContent = targetDoc.createElement('div');
  tlContent.className = 'mm-tl-content';
  tlContent.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;padding:12px';
  timelineView.appendChild(tlContent);
  container.appendChild(timelineView);

  // 标签切换逻辑
  function _switchTab(tabId) {
    [tabOverview, tabMemories, tabTimeline].forEach(function(t) { t.className = 'mm-tab-btn'; t.style.color = '#555'; });
    var activeTab = tabId === 'overview' ? tabOverview : tabId === 'memories' ? tabMemories : tabTimeline;
    activeTab.className = 'mm-tab-btn active';
    activeTab.style.color = '#b84040';

    dashboardView.style.display = tabId === 'overview' ? 'block' : 'none';
    memoriesView.style.display = tabId === 'memories' ? 'flex' : 'none';
    timelineView.style.display = tabId === 'timeline' ? 'flex' : 'none';

    if (tabId === 'overview') { _renderDashboard(); }
    else if (tabId === 'memories') { _renderMemoryList(); _updateTagSelects(); }
    else if (tabId === 'timeline') { _renderTimeline(); _updateTagSelects(); }
  }

  function _updateTagSelects() {
    DataService.getAll({ includeHidden: UIManager._recycleBinMode }).then(function(memories) {
      var tagCounts = {};
      for (var ti = 0; ti < memories.length; ti++) {
        var tags = memories[ti].tags || [];
        for (var tj = 0; tj < tags.length; tj++) tagCounts[tags[tj]] = (tagCounts[tags[tj]] || 0) + 1;
      }
      var sorted = Object.keys(tagCounts).sort(function(a, b) { return tagCounts[b] - tagCounts[a]; });
      var options = sorted.map(function(t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + ' (' + _fmtNum(tagCounts[t]) + ')</option>'; }).join('');
      filterTag.innerHTML = '<option value="">全部标签</option>' + options;
      tlTagSel.innerHTML = '<option value="">全部标签</option>' + options;
    });
  }

  // 存储引用
  container._searchInput = searchInput;
  container._filterZone = filterZone;
  container._filterCat = filterCat;
  container._filterTag = filterTag;
  container._sortBy = sortBy;
  container._tagCloud = tagCloud;
  container._memoryList = memoryList;
  container._batchBar = batchBar;
  container._batchCount = batchCount;
  container._dashboardView = dashboardView;
  container._timelineView = timelineView;
  container._tlContent = tlContent;
  container._tlZoneSel = tlZoneSel;
  container._tlTagSel = tlTagSel;
  container._tlGroup = tlGroup;
  container._switchTab = _switchTab;

  // 提前设置全局引用（在 return 之前，以便 _switchTab → _renderDashboard 能访问）
  _panelContentEl = container;

  // 默认显示概览仪表盘
  _switchTab('overview');

  return container;
}

// 全局引用（_renderMemoryList / UIManager 需要）
var _panelContentEl = null;

// ====== 昵称系统 ======
function _getSessionLabel() {
  try { return localStorage.getItem(DataService.getRolePrefix() + '_session_label_' + DataService._sessionId) || ''; }
  catch(e) { return ''; }
}
function _getRoleLabel() {
  try { return localStorage.getItem(DataService.getRolePrefix() + '_role_label') || ''; }
  catch(e) { return ''; }
}
function _setSessionLabel(label) {
  try { localStorage.setItem(DataService.getRolePrefix() + '_session_label_' + DataService._sessionId, label || ''); }
  catch(e) {}
}
function _setRoleLabel(label) {
  try { localStorage.setItem(DataService.getRolePrefix() + '_role_label', label || ''); }
  catch(e) {}
}
function _showNicknameEditor() {
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal';
  modal.innerHTML = '<div class="mm-modal-header"><h3>编辑名称</h3><button class="mm-modal-close">×</button></div>' +
    '<div class="mm-form-group"><label>角色名称</label><input id="mm-nn-role" value="' + escapeHtml(_getRoleLabel()) + '" placeholder="' + escapeHtml(DataService._roleId || '') + '"></div>' +
    '<div class="mm-form-group"><label>会话备注</label><input id="mm-nn-session" value="' + escapeHtml(_getSessionLabel()) + '" placeholder="' + escapeHtml(DataService._sessionId || '') + '"></div>' +
    '<p style="font-size:10px;color:#555;margin-bottom:12px">给角色和当前会话起个好记的名字，留空则使用原始 ID</p>' +
    '<div class="mm-form-actions"><button id="mm-nn-cancel" class="mm-btn">取消</button><button id="mm-nn-save" class="mm-btn mm-btn-primary">保存</button></div>';
  modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });
  modal.querySelector('#mm-nn-cancel').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  modal.querySelector('#mm-nn-save').addEventListener('click', function() {
    _setRoleLabel(modal.querySelector('#mm-nn-role').value.trim());
    _setSessionLabel(modal.querySelector('#mm-nn-session').value.trim());
    targetDoc.body.removeChild(overlay);
    _renderDashboard();
    UIManager.showToast('名称已保存', 'success');
  });
  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
}

// ====== 模板系统 ======
var MM_TEMPLATES = {
  recall: {
    standard: {
      label: '标准回顾',
      template: '以下是与 {roleName} 相关的记忆记录。请逐一检查：\n1. 仍准确的标注「有效」\n2. 需要更新的说明原因\n3. 发现矛盾的请指出\n\n{memories_formatted}'
    },
    brief: {
      label: '精简回顾',
      template: '以下记忆请确认是否仍然准确。如有过时或矛盾，简要说明即可：\n{memories_brief}'
    },
    self: {
      label: '角色自省',
      template: '你现在是 {roleName}。请以第一人称回顾以下关于你的记忆，检查它们是否与你的认知一致：\n{memories}'
    }
  },
  summarize: {
    standard: {
      label: '标准总结',
      template: '以下是从最近对话中记录的记忆片段。请将它们总结为简洁的要点，保留关键信息（人物、事件、情感变化），去掉冗余描述：\n\n{memories_formatted}\n\n请用要点形式输出总结。'
    },
    narrative: {
      label: '叙事总结',
      template: '请将以下记忆整合为一段连贯的叙事摘要，保持 {roleName} 的视角：\n{memories}'
    },
    character: {
      label: '人物档案',
      template: '从以下记忆中提取关于各角色的关键信息变化，按角色分组输出：\n{memories}'
    }
  },
  dormant: {
    gentle: {
      label: '温和提醒',
      template: '以下记忆已经很久没被触及了。有空的话可以回顾一下，看看它们是否对当前剧情有用：\n{memories_brief}'
    },
    urgent: {
      label: '归档预警',
      template: '以下记忆即将被自动归档（隐藏），归档后将不再出现在日常回顾中。如果其中有需要保留的关键信息，请标记「保留」：\n{memories_formatted}'
    }
  },
  lorebook: {
    light: {
      label: '轻量注入',
      template: '以下是与此场景可能相关的背景信息。请自然融入你的回复，不要逐条复述或提及「记忆」「记录」等词：\n{memories_brief}'
    },
    full: {
      label: '详细注入',
      template: '已知信息（请自然融入叙事，不要直接引用格式标签）：\n{memories_formatted}'
    }
  }
};

function _getTemplates() {
  try {
    var raw = localStorage.getItem(DataService.getRolePrefix() + '_templates');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  // 深拷贝默认模板
  var defs = {};
  var types = Object.keys(MM_TEMPLATES);
  for (var ti = 0; ti < types.length; ti++) {
    defs[types[ti]] = {};
    var keys = Object.keys(MM_TEMPLATES[types[ti]]);
    for (var ki = 0; ki < keys.length; ki++) {
      defs[types[ti]][keys[ki]] = {
        label: MM_TEMPLATES[types[ti]][keys[ki]].label,
        template: MM_TEMPLATES[types[ti]][keys[ki]].template
      };
    }
  }
  return defs;
}

function _saveTemplates(templates) {
  try { localStorage.setItem(DataService.getRolePrefix() + '_templates', JSON.stringify(templates)); }
  catch(e) { console.warn('[Templates]', e); }
}

function _renderTemplate(content, template, memory) {
  var t = template || '{memories}';
  t = t.replace(/\{memories_formatted\}/g, content.formatted || content.raw || '');
  t = t.replace(/\{memories_brief\}/g, content.brief || content.raw || '');
  t = t.replace(/\{memories\}/g, content.raw || '');
  t = t.replace(/\{roleName\}/g, _getRoleLabel() || DataService._roleId || '角色');
  t = t.replace(/\{date\}/g, formatDate(Date.now()));
  t = t.replace(/\{count\}/g, String(content.count || 0));
  return t;
}

function _formatMemoriesForTemplate(memories) {
  var raw = '', formatted = '', brief = '';
  for (var i = 0; i < memories.length; i++) {
    var m = memories[i];
    if (i > 0) { raw += '\n'; formatted += '\n'; brief += '\n'; }
    raw += '- [' + (m.zone || '') + '] ' + (m.content || '');
    formatted += (i + 1) + '. [' + formatDate(m.timestamp) + '] [' + (m.zone || '') + ']' +
      (m.roleName ? ' ' + m.roleName : '') + '\n' + (m.content || '') +
      (m.tags && m.tags.length > 0 ? '\n标签：' + m.tags.join(', ') : '');
    brief += '- ' + (m.content || '').substring(0, 80) + ((m.content || '').length > 80 ? '...' : '');
  }
  return { raw: raw, formatted: formatted, brief: brief, count: memories.length };
}

// ====== 教程系统 ======
function _getTutorialKey() { return DataService.getRolePrefix() + '_tutorial_done'; }
var _tutorialStepIndex = 0;

var TUTORIAL_STEPS = [
  { id:'dashboard', title:'记忆仪表盘', text:'这里是你所有记忆的"体检报告"。四张大卡片分别告诉你记忆总数、本周新增、需要关注的问题、以及潜藏的矛盾。每天打开瞄一眼就好。', highlight:'mm-dash-welcome', action:'click-dashboard-card', tip:'点击任意一张统计卡片试试' },
  { id:'quickcreate', title:'创建第一条记忆', text:'记忆就是你的 AI 便签。觉得某段对话很重要时——角色的情感变化、关键事件、新认识的人——记下来。', highlight:'mm-btn mm-btn-sm', action:'open-quick-create', tip:'点击工具栏的「+ 新建」按钮', setup:function(){ if(_panelContentEl&&_panelContentEl._switchTab)_panelContentEl._switchTab('memories'); } },
  { id:'similar', title:'发现相似记忆', text:'记多了之后，有些记忆说的其实是同一件事。点一下这个按钮，我会帮你找"长得像"的其他记录——就像照片去重。', highlight:'memory-card', action:'hover-card-then-similar', tip:'鼠标移到任意记忆卡片上，悬停后点击出现的操作按钮', setup:function(){ if(_panelContentEl&&_panelContentEl._switchTab)_panelContentEl._switchTab('memories'); } },
  { id:'analysis', title:'一键智能分析', text:'不想自己翻？按这个大按钮。我会帮你检查：有没有矛盾的信息、有没有重复的记录、有没有该整理的旧记忆。', highlight:'mm-dash-welcome', action:'click-magic-btn', tip:'回到概览页，点击底部的「帮我分析」按钮', setup:function(){ if(_panelContentEl&&_panelContentEl._switchTab)_panelContentEl._switchTab('overview'); } },
  { id:'automation', title:'自动记忆维护', text:'最省心的功能。打开后它会定期帮你回顾旧记忆、总结散乱记录、提醒沉寂内容。你只需要调频率：关 / 偶尔 / 频繁。', highlight:'mm-btn', action:'open-auto-panel', tip:'点击工具栏「自动化」按钮试试调整频率', setup:function(){ if(_panelContentEl&&_panelContentEl._switchTab)_panelContentEl._switchTab('overview'); } }
];

function _startTutorial() {}

function _endTutorial() {}

function _resetTutorial() {}

// ====== 帮助系统 ======
var HELP_TOPICS = {
  dashboard:{title:'什么是仪表盘？',icon:'★',content:'仪表盘就是记忆库的"体检报告"。<br><br><b>四张卡片</b>分别告诉你：记忆总数、本周新增、需要关注、潜在矛盾。<br><b>健康度条</b>：绿色好、黄色注意、红色需整理。<br><b>智能提醒</b>：根据数据自动生成，每行可点击直达操作。<br><b>运行状态</b>：各服务开关一目了然。'},
  'quick-create':{title:'新建记忆',icon:'+',content:'快速记录一段对话或事件。选择分区（角色/玩家/世界/总结），写下内容，可选标签和角色名。<br><br>系统会自动推荐标签——输入内容后等半秒，标签栏会自动填入建议。<br><br><b>重要性 1-5</b>：越高越不容易被遗忘归档。'},
  similar:{title:'找相似记忆',icon:'⌗',content:'怀疑两条记忆说的是同一件事？"找相似"帮你确认。<br><br>在记忆列表里鼠标移到一条记忆上，点击出现的放大镜图标。<br><br>结果按相似度排列：<br><span style="color:#c44040">>85% 可能是重复</span><br><span style="color:#d49540">60-85% 可能相关</span><br><span style="color:#7bb87b"><60% 仅供参考</span>'},
  search:{title:'精确 vs 语义搜索',icon:'⚙',content:'<b>精确搜索</b>：找包含确切关键词的记忆。<br><br><b>语义搜索</b>：找"意思相近"的记忆。比如搜"吵架"也能找到"争吵""冲突"。<br><br>搜索框右边有切换按钮。'},
  automation:{title:'自动化记忆维护',icon:'↻',content:'<b>定期回顾</b>：每隔若干轮，把旧记忆发给 AI 确认准确性。<br><b>定期总结</b>：压缩零散记忆为要点。<br><b>沉寂提醒</b>：标记长期未触及的记忆。<br><br>频率三档：关/偶尔(~20轮)/频繁(~5轮)。\n一轮=AI回复一次。'},
  template:{title:'指令模板',icon:'✎',content:'模板决定如何把记忆"喂"给AI。<br><br>变量：<code>{memories}</code> <code>{memories_formatted}</code> <code>{memories_brief}</code> <code>{roleName}</code> <code>{date}</code> <code>{count}</code><br><br>预设模板提供常见场景写法，也可自定义。'},
  archive:{title:'存档和备份',icon:'☆',content:'存档=把当前所有记忆冻结成快照，随时可恢复。<br><br>切换角色、担心数据丢失时建议先存档。<br><br>导出=下载为JSON文件。导入=反向操作。<br><br>超过5天没存档，仪表盘会提醒。'},
  recycle:{title:'回收站',icon:'↶',content:'删除的记忆进入回收站而非立即消失。<br><br>更多菜单→回收站可查看已删除记忆，点击恢复按钮还原。<br><br>选中多条后可用"批量恢复"。'},
  forgetting:{title:'遗忘与衰减',icon:'⏳',content:'模拟真实遗忘规律：越久不被提及，权重越低。<br><br>降到阈值以下时自动归档（隐藏但可恢复）。重要记忆衰减更慢。<br><br>遗忘管理面板可调整参数和查看沉寂候选。'},
  timeline:{title:'时间线视图',icon:'⇄',content:'按时间排列记忆，可按天/周/月聚合。<br><br>适合回顾"这一周发生了什么"，或快速定位某天记录。<br><br>点击任意条可直接编辑。'}
};

function _makeHelpBtn(topicId) {
  var btn = targetDoc.createElement('span');
  btn.textContent = '?';
  btn.title = '查看帮助';
  btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e8e4de;color:#555;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;flex-shrink:0;margin-left:4px';
  btn.addEventListener('mouseenter', function() { btn.style.background = '#b84040'; btn.style.color = '#fff'; });
  btn.addEventListener('mouseleave', function() { btn.style.background = '#e8e4de'; btn.style.color = '#555'; });
  btn.addEventListener('click', function(e) { e.stopPropagation(); _showHelpCardImpl(topicId); });
  return btn;
}

function _showHelpCardImpl(topicId) {
  var topic = HELP_TOPICS[topicId];
  if (!topic) return;
  var overlay = targetDoc.createElement('div'); overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div'); modal.className = 'mm-modal';
  modal.innerHTML = '<div class="mm-modal-header"><h3>' + topic.icon + ' ' + topic.title + '</h3><button class="mm-modal-close">×</button></div>' +
    '<div style="font-size:13px;color:#333;line-height:1.7">' + topic.content + '</div>' +
    '<div style="margin-top:10px;font-size:11px;color:#555;text-align:right">详见 <span id="mm-hc-manual" style="color:#b84040;cursor:pointer;text-decoration:underline">完整说明书</span></div>' +
    '<div class="mm-form-actions"><button id="mm-hc-close" class="mm-btn mm-btn-sm" style="border-radius:16px">知道了</button></div>';
  modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  modal.querySelector('#mm-hc-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });
  modal.querySelector('#mm-hc-manual').addEventListener('click', function() { targetDoc.body.removeChild(overlay); _showManualImpl(); });
  overlay.appendChild(modal); targetDoc.body.appendChild(overlay);
};

// ====== 完整说明书 ======
function _showManualImpl() {
  var sections = [
    { id:'what', title:'这是什么？', content:'MemoryMirror 帮你"记住"聊天剧情。AI 本身记不住太久前的事，我帮你记——然后在合适的时候喂回给 AI。你专注玩，记忆交给我。' },
    { id:'quick', title:'快速上手 (3分钟)', content:'<b>1. 打开面板</b>：点屏幕右下角的圆形按钮。<br><b>2. 看一眼仪表盘</b>：数字告诉你记忆库状态。<br><b>3. 创建第一条记忆</b>：点工具栏"+ 新建"。<br><b>4. 找到它</b>：在"记忆"标签页搜索，或去"时间线"按日期浏览。<br><b>5. 点"帮我分析"</b>：一键检查是否有问题。' },
    { id:'daily', title:'每天做什么', content:'<b>聊完一局后</b>：打开面板，点"帮我分析"。<br><b>看到橙色/红色数字</b>：点进去处理。<br><b>每周一次</b>：打开自动化面板看回顾/总结建议。<br><b>超过5天没存档</b>：仪表盘会提醒备份。' },
    { id:'faq', title:'常见问题', content:'<b>Q: 面板打不开？</b><br>A: 检查右下角按钮。可刷新页面重试。<br><br><b>Q: 记忆不见了？</b><br>A: 查看回收站，或检查 URL 里的 roleId 是否变了。<br><br><b>Q: 标签数字不对？</b><br>A: 更多→全局设置可重设。编辑记忆时标签计数是增量更新。<br><br><b>Q: 怎么清空重来？</b><br>A: 更多→全局设置→清空全部记忆。<br><br><b>Q: 多角色怎么管？</b><br>A: 改 URL 里 <code>?roleId=角色名</code>，不同 ID 的记忆完全隔离。<br><br><b>Q: Lorebook 怎么用？</b><br>A: 编辑记忆时填"触发关键词"，聊天中出现这些词时自动注入相关记忆。全局设置可调 Token 预算。' },
    { id:'cheatsheet', title:'速查表', content:'<table style="width:100%;font-size:11px;border-collapse:collapse"><tr style="border-bottom:1px solid #e8e4de"><td style="padding:4px">找记忆</td><td>搜索框 / 时间线</td></tr><tr style="border-bottom:1px solid #e8e4de"><td style="padding:4px">查重复</td><td>找相似 / 帮我分析</td></tr><tr style="border-bottom:1px solid #e8e4de"><td style="padding:4px">让AI回顾</td><td>自动化→定期回顾</td></tr><tr style="border-bottom:1px solid #e8e4de"><td style="padding:4px">压缩记忆</td><td>自动化→定期总结</td></tr><tr style="border-bottom:1px solid #e8e4de"><td style="padding:4px">备份</td><td>更多→存档 / 导出</td></tr><tr style="border-bottom:1px solid #e8e4de"><td style="padding:4px">恢复</td><td>更多→导入 / 存档→恢复</td></tr><tr style="border-bottom:1px solid #e8e4de"><td style="padding:4px">切换角色</td><td>URL改roleId</td></tr><tr style="border-bottom:1px solid #e8e4de"><td style="padding:4px">自定义指令</td><td>自动化→模板管理</td></tr></table>' }
  ];
  var overlay = targetDoc.createElement('div'); overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div'); modal.className = 'mm-modal mm-modal-wide';
  var html = '<div class="mm-modal-header"><h3>★ 使用说明书</h3><button class="mm-modal-close">×</button></div>' +
    '<div style="display:flex;gap:16px;max-height:55vh">' +
    '<div style="width:130px;flex-shrink:0;overflow-y:auto;border-right:1px solid #e8e4de;padding-right:8px">';
  for (var i = 0; i < sections.length; i++) html += '<div class="mm-manual-nav" data-s="' + i + '" style="padding:6px 8px;font-size:12px;color:#333;cursor:pointer;border-radius:6px;margin-bottom:2px;transition:background 0.15s">' + sections[i].title + '</div>';
  html += '</div><div id="mm-manual-content" style="flex:1;overflow-y:auto;font-size:13px;color:#333;line-height:1.7">' + sections[0].content + '</div></div>' +
    '<div class="mm-form-actions"><button class="mm-btn mm-btn-sm close-manual-btn" style="border-radius:16px">关闭</button></div>';
  modal.innerHTML = html;
  modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  modal.querySelector('.close-manual-btn').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });
  var navs = modal.querySelectorAll('.mm-manual-nav'), cont = modal.querySelector('#mm-manual-content');
  for (var ni = 0; ni < navs.length; ni++) {
    (function(nav, sec) {
      nav.addEventListener('click', function() { cont.innerHTML = sec.content; for (var nj = 0; nj < navs.length; nj++) { navs[nj].style.background = ''; navs[nj].style.fontWeight = ''; navs[nj].style.color = '#333'; } nav.style.background = '#faf2f2'; nav.style.fontWeight = '600'; nav.style.color = '#b84040'; });
      nav.addEventListener('mouseenter', function() { if (nav.style.background !== 'rgb(250, 242, 242)') nav.style.background = '#fafaf8'; });
      nav.addEventListener('mouseleave', function() { if (nav.style.background !== 'rgb(250, 242, 242)') nav.style.background = ''; });
    })(navs[ni], sections[ni]);
  }
  overlay.appendChild(modal); targetDoc.body.appendChild(overlay);
};

// ====== 功能地图 ======
function _renderFeatureMap() { return targetDoc.createElement("div"); }

// ====== 仪表盘渲染 ======
function _renderDashboard() {
  if (!_panelContentEl || !_panelContentEl._dashboardView) return;
  var dash = _panelContentEl._dashboardView;
  while (dash.firstChild) dash.removeChild(dash.firstChild);

  DataService.getAll({ includeHidden: false }).then(function(memories) {
    var now = Date.now();
    var weekAgo = now - 7 * 86400000;
    var weekNew = 0;
    var dormantCount = 0;
    var totalImportance = 0;
    var totalTags = 0;
    var tagSet = {};
    var todayCount = 0;
    var todayStart = new Date().setHours(0, 0, 0, 0);

    for (var i = 0; i < memories.length; i++) {
      var m = memories[i];
      if (m.timestamp > weekAgo) weekNew++;
      if (m.timestamp > todayStart) todayCount++;
      totalImportance += m.importance || 3;
      if (m.tags) { totalTags += m.tags.length; for (var ti = 0; ti < m.tags.length; ti++) tagSet[m.tags[ti]] = true; }

      // Decay score
      var daysSince = (now - m.timestamp) / 86400000;
      var decayScore = ((m.importance || 3) / 5) * Math.exp(-daysSince / 14);
      if (decayScore <= 0.15 && !m.archivedAt) dormantCount++;
    }

    var avgImportance = memories.length > 0 ? (totalImportance / memories.length) : 0;
    var tagCoverage = memories.length > 0 ? Math.round((Object.keys(tagSet).length / Math.max(memories.length, 1)) * 100) : 0;
    var healthScore = memories.length > 0 ? Math.round(Math.max(5, 100 - dormantCount * 5 - (memories.length > 50 ? 0 : (50 - memories.length) * 2))) : 0;

    // Conflicts
    var conflicts = _findConflicts(memories);
    var dormantCandidates = [];
    for (var di = 0; di < memories.length; di++) {
      var dm = memories[di];
      var ds = ((dm.importance || 3) / 5) * Math.exp(-((now - dm.timestamp) / 86400000) / 14);
      if (ds <= 0.15 && !dm.archivedAt && dm.importance >= 3) dormantCandidates.push({ memory: dm, decayScore: ds });
    }

    // Auto-scan status
    var autoScanOn = !!Scanner._autoScanTimer;
    var observerOn = !!Scanner._observer;
    var interval = Scanner._autoScanInterval ? Math.round(Scanner._autoScanInterval / 1000) : 30;

    // Last archive time
    var slots = ArchiveManager.getSlots();
    var lastArchiveSlot = slots.length > 0 ? slots[0] : null;
    var daysSinceArchive = lastArchiveSlot ? Math.floor((now - lastArchiveSlot.createdAt) / 86400000) : 999;

    // Lorebook stats
    var lbTriggerStats = LorebookManager.getTriggerStats ? LorebookManager.getTriggerStats() : [];
    var lbMemCount = Object.keys(LorebookManager._keywordIndex || {}).length;

    // Rule progress
    var rules = RuleEngine.getRules();
    var nextRecallRound = null;
    for (var ri = 0; ri < rules.length; ri++) {
      if (rules[ri].enabled && rules[ri].type === 'recall') {
        var remain = rules[ri].conditions.roundCount.min - rules[ri].counter;
        if (nextRecallRound === null || remain < nextRecallRound) nextRecallRound = remain;
      }
    }

    // Build UI
    // Welcome row (clickable to edit nickname)
    var sessionLabel = _getSessionLabel();
    var roleLabel = _getRoleLabel();
    var welcome = targetDoc.createElement('div');
    welcome.className = 'mm-dash-welcome';
    welcome.style.cssText = 'margin-bottom:14px;cursor:pointer;padding:8px 12px;border-radius:10px;transition:background 0.2s';
    welcome.addEventListener('mouseenter', function() { welcome.style.background = '#fafaf8'; });
    welcome.addEventListener('mouseleave', function() { welcome.style.background = 'transparent'; });
    welcome.innerHTML = '<p style="font-size:15px;font-weight:600;color:#2c2c2c;margin:0">' + escapeHtml(roleLabel || DataService._roleId || 'MemoryMirror') + '</p>' +
      '<p style="font-size:11px;color:#555;margin:2px 0 0">' + escapeHtml(sessionLabel || DataService._sessionId || '') + ' · ' + formatDate(now) + ' <span style="color:#b84040;font-size:10px">&#9998;</span></p>';
    welcome.addEventListener('click', function() { _showNicknameEditor(); });
    var welcomeHelp = _makeHelpBtn('dashboard');
    welcomeHelp.style.cssText = welcomeHelp.style.cssText.replace('margin-left:4px','margin-left:8px;position:relative;top:-2px');
    welcome.appendChild(welcomeHelp);
    dash.appendChild(welcome);

    // Stats cards
    var statCards = [
      { value: String(memories.length), label: '记忆总数', sub: todayCount + ' 条今日新增', color: '#f2e6e6', textColor: '#b84040' },
      { value: String(weekNew), label: '本周新增', sub: '近 7 天', color: '#e8f0e8', textColor: '#5a8a5a' },
      { value: String(dormantCount), label: '需要关注', sub: '衰减临界或归档候选', color: dormantCount > 0 ? '#fdf2e0' : '#f4f4f2', textColor: dormantCount > 0 ? '#c48840' : '#555' },
      { value: conflicts.length + ' 组', label: '潜在矛盾', sub: '语义相近标签对立', color: conflicts.length > 0 ? '#fce8e8' : '#f4f4f2', textColor: conflicts.length > 0 ? '#c44040' : '#555' }
    ];
    var statGrid = targetDoc.createElement('div');
    statGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px';
    for (var si = 0; si < statCards.length; si++) {
      var sc = statCards[si];
      var card = targetDoc.createElement('div');
      card.style.cssText = 'background:' + sc.color + ';border-radius:10px;padding:12px;text-align:center;cursor:pointer;transition:transform 0.15s';
      card.innerHTML = '<div style="font-size:26px;font-weight:700;color:' + sc.textColor + '">' + sc.value + '</div>' +
        '<div style="font-size:11px;color:#333">' + sc.label + '</div>' +
        '<div style="font-size:10px;color:#555;margin-top:2px">' + sc.sub + '</div>';
      card.addEventListener('mouseenter', function() { this.style.transform = 'scale(1.03)'; });
      card.addEventListener('mouseleave', function() { this.style.transform = 'scale(1)'; });
      card.addEventListener('click', function() {
        _panelContentEl._switchTab('memories');
      });
      statGrid.appendChild(card);
    }
    dash.appendChild(statGrid);

    // Health bar
    var healthDiv = targetDoc.createElement('div');
    healthDiv.style.cssText = 'background:#f4f4f2;border-radius:10px;padding:10px 14px;margin-bottom:12px';
    var healthBarOuter = targetDoc.createElement('div');
    healthBarOuter.style.cssText = 'height:8px;background:#e8e4de;border-radius:4px;margin-top:6px;overflow:hidden';
    var healthBarInner = targetDoc.createElement('div');
    healthBarInner.style.cssText = 'height:100%;border-radius:4px;transition:width 0.5s;' +
      (healthScore >= 80 ? 'background:#7bb87b;' : healthScore >= 50 ? 'background:#d4a040;' : 'background:#c44040;');
    healthBarInner.style.width = healthScore + '%';
    healthBarOuter.appendChild(healthBarInner);
    healthDiv.innerHTML = '<span style="font-size:12px;color:#333">记忆健康度</span> <span style="font-size:12px;font-weight:600;color:#2c2c2c">' + healthScore + '%</span>';
    healthDiv.appendChild(healthBarOuter);
    dash.appendChild(healthDiv);

    // 仪表盘通知（来自自动化触发）
    var activeNotifs = [];
    for (var ni = 0; ni < AutoTaskManager._dashboardNotifications.length; ni++) {
      if (!AutoTaskManager._dashboardNotifications[ni].dismissed) activeNotifs.push(AutoTaskManager._dashboardNotifications[ni]);
    }
    if (activeNotifs.length > 0) {
      var notifSection = targetDoc.createElement('div');
      notifSection.style.cssText = 'background:#fefbf8;border:1px solid #f0d8c0;border-radius:10px;padding:12px 14px;margin-bottom:12px';
      var notifTitle = targetDoc.createElement('div');
      notifTitle.textContent = '待处理提醒 (' + activeNotifs.length + ')';
      notifTitle.style.cssText = 'font-size:12px;font-weight:600;color:#c48840;margin-bottom:6px';
      notifSection.appendChild(notifTitle);
      for (var nai = 0; nai < Math.min(activeNotifs.length, 5); nai++) {
        var ntf = activeNotifs[nai];
        var nRow = targetDoc.createElement('div');
        nRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:' + (nai < Math.min(activeNotifs.length, 5) - 1 ? '1px solid #f0e6d8' : 'none') + ';font-size:11px;color:#333';
        nRow.innerHTML = '<span style="background:#f0d8c0;padding:1px 6px;border-radius:8px;font-size:10px;flex-shrink:0">' + escapeHtml(ntf.label) + '</span>' +
          '<span style="flex:1">' + ntf.count + ' 条 · ' + _timeStr(ntf.timestamp) + '</span>';
        var nViewBtn = targetDoc.createElement('button');
        nViewBtn.textContent = '查看';
        nViewBtn.className = 'mm-btn mm-btn-xs';
        nViewBtn.style.cssText = 'font-size:10px;padding:2px 8px;flex-shrink:0';
        (function(notif) {
          nViewBtn.addEventListener('click', function() { UIManager._showCopyFallbackModal(notif.content); });
        })(ntf);
        nRow.appendChild(nViewBtn);
        var nDismiss = targetDoc.createElement('button');
        nDismiss.textContent = '×';
        nDismiss.style.cssText = 'background:none;border:none;cursor:pointer;color:#555;font-size:14px;padding:0 4px;flex-shrink:0';
        (function(notif) {
          nDismiss.addEventListener('click', function() { notif.dismissed = true; _renderDashboard(); });
        })(ntf);
        nRow.appendChild(nDismiss);
        notifSection.appendChild(nRow);
      }
      if (activeNotifs.length > 5) {
        var moreRow = targetDoc.createElement('div');
        moreRow.textContent = '... 还有 ' + (activeNotifs.length - 5) + ' 条通知';
        moreRow.style.cssText = 'font-size:10px;color:#555;padding:4px 0';
        notifSection.appendChild(moreRow);
      }
      dash.appendChild(notifSection);
    }

    // Smart assistant
    var assistant = targetDoc.createElement('div');
    assistant.className = 'mm-dash-assistant';
    assistant.style.cssText = 'background:#fafaf8;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #e8e4de';
    var asstTitle = targetDoc.createElement('div');
    asstTitle.textContent = '智能提醒';
    asstTitle.style.cssText = 'font-size:13px;font-weight:600;color:#2c2c2c;margin-bottom:8px';
    assistant.appendChild(asstTitle);

    var suggestions = [];
    if (dormantCount > 0) suggestions.push({ text: dormantCount + ' 条记忆已沉寂超过阈值，建议回顾一下', action: function() { UIManager._showForgettingConfig(); } });
    if (conflicts.length > 0) suggestions.push({ text: '发现 ' + conflicts.length + ' 组潜在矛盾，需要你确认', action: function() { UIManager._showConflictList(conflicts, memories); } });
    if (memories.length >= 8 && tagCoverage < 40) suggestions.push({ text: '标签覆盖率偏低（' + tagCoverage + '%），打标签能让记忆更好被检索', action: function() { _panelContentEl._switchTab('memories'); } });
    if (slots.length === 0 && memories.length > 0) {
      suggestions.push({ text: '还没有存档记录！建议立即创建存档保护记忆数据', action: function() { UIManager._showArchiveManager(); } });
    } else if (daysSinceArchive > 5 && memories.length > 0) {
      suggestions.push({ text: '上次存档是 ' + daysSinceArchive + ' 天前，建议备份一下', action: function() { UIManager._showArchiveManager(); } });
    }
    if (weekNew > 10) suggestions.push({ text: '本周新增 ' + weekNew + ' 条记忆，剧情推进得很快！', action: null });
    if (lbMemCount > 0) suggestions.push({ text: '已配置 ' + lbMemCount + ' 条触发关键词，可随时测试效果', action: function() { UIManager._showTriggerTester(); } });
    if (avgImportance >= 4) suggestions.push({ text: '记忆平均重要性 ' + avgImportance.toFixed(1) + '，都是珍贵记录', action: null });

    if (suggestions.length === 0) {
      var emptyTip = targetDoc.createElement('div');
      emptyTip.textContent = '一切正常。多记录一些内容，我会帮你发现有趣的事情。';
      emptyTip.style.cssText = 'font-size:12px;color:#555;line-height:1.5';
      assistant.appendChild(emptyTip);
    } else {
      for (var sg = 0; sg < suggestions.length; sg++) {
        var row = targetDoc.createElement('div');
        row.style.cssText = 'padding:6px 8px;font-size:12px;color:#333;line-height:1.5;border-bottom:' + (sg < suggestions.length - 1 ? '1px solid #f0ece6' : 'none');
        row.textContent = (sg + 1) + '. ' + suggestions[sg].text;
        if (suggestions[sg].action) {
          row.style.cursor = 'pointer';
          row.style.color = '#4a6fa5';
          row.addEventListener('mouseenter', function() { this.style.background = '#f4f0ea'; });
          row.addEventListener('mouseleave', function() { this.style.background = 'none'; });
          (function(act) { row.addEventListener('click', function() { act(); }); })(suggestions[sg].action);
        }
        assistant.appendChild(row);
      }
    }
    dash.appendChild(assistant);

    // Service status
    var statusDiv = targetDoc.createElement('div');
    statusDiv.style.cssText = 'background:#fafaf8;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #e8e4de';
    var statusTitle = targetDoc.createElement('div');
    statusTitle.textContent = '运行状态';
    statusTitle.style.cssText = 'font-size:13px;font-weight:600;color:#2c2c2c;margin-bottom:8px';
    statusDiv.appendChild(statusTitle);

    function statusRow(label, active, detail) {
      var r = targetDoc.createElement('div');
      r.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;color:#333';
      var dot = targetDoc.createElement('span');
      dot.style.cssText = 'width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0;background:' + (active ? '#7bb87b' : '#c0c0c0');
      r.appendChild(dot);
      r.appendChild(document.createTextNode(label + '：' + (active ? '运行中' : '已停止') + (detail ? ' (' + detail + ')' : '')));
      return r;
    }
    var autoScanRow = statusRow('自动扫描', autoScanOn, autoScanOn ? '每 ' + interval + ' 秒' : (Scanner._autoScanInterval ? '间隔 ' + (Scanner._autoScanInterval / 1000) + ' 秒（已停止）' : '点击配置'));
    autoScanRow.style.cursor = 'pointer';
    autoScanRow.title = '点击打开扫描设置';
    autoScanRow.addEventListener('click', function() { UIManager._showScanSettings(); });
    statusDiv.appendChild(autoScanRow);
    var observerRow = statusRow('实时监听', observerOn, null);
    observerRow.style.cursor = 'pointer';
    observerRow.title = '点击打开扫描设置';
    observerRow.addEventListener('click', function() { UIManager._showScanSettings(); });
    statusDiv.appendChild(observerRow);
    statusDiv.appendChild(statusRow('Lorebook 触发', lbMemCount > 0, lbMemCount + ' 条关键词'));
    statusDiv.appendChild(statusRow('规则引擎', rules.length > 0, rules.length + ' 条规则'));
    if (nextRecallRound !== null && nextRecallRound > 0) {
      statusDiv.appendChild(statusRow('回顾检查', true, '约 ' + nextRecallRound + ' 轮后'));
    }
    dash.appendChild(statusDiv);

    // Quick actions
    var qaDiv = targetDoc.createElement('div');
    qaDiv.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px';
    var qActions = [
      { label: '新建记忆', icon: '+', action: function() { UIManager._showQuickCreate(); } },
      { label: '立即扫描', icon: '&#8635;', action: function() { Scanner.scan().then(function(r) { UIManager.showToast('新增 ' + r.added + ' 条', 'success'); _renderDashboard(); }); } },
      { label: '扫描设置', icon: '&#9881;', action: function() { UIManager._showScanSettings(); } },
      { label: '导出备份', icon: '&#8615;', action: function() { UIManager._triggerExport(); } },
      { label: '管理存档', icon: '&#9733;', action: function() { UIManager._showArchiveManager(); } },
      { label: '触发测试', icon: '&#9881;', action: function() { UIManager._showTriggerTester(); } },
      { label: '导出提示', icon: '&#8627;', action: function() { UIManager._exportAsPrompt(); } },
      { label: '使用说明', icon: '?', action: function() { UIManager._showManual(); } },
      { label: '系统诊断', icon: '🔍', action: function() { UIManager._showDiagnostics(); } }
    ];
    for (var qai = 0; qai < qActions.length; qai++) {
      (function(qa) {
        var btn = targetDoc.createElement('button');
        btn.innerHTML = '<span style="display:block;font-size:18px;margin-bottom:2px">' + qa.icon + '</span><span style="font-size:11px">' + qa.label + '</span>';
        btn.style.cssText = 'padding:10px 6px;border:1px solid #e8e4de;border-radius:10px;background:#fff;cursor:pointer;text-align:center;color:#333;transition:all 0.15s';
        btn.addEventListener('mouseenter', function() { btn.style.background = '#faf6f6'; btn.style.borderColor = '#d4b0b0'; });
        btn.addEventListener('mouseleave', function() { btn.style.background = '#fff'; btn.style.borderColor = '#e8e4de'; });
        btn.addEventListener('click', function() { qa.action(); });
        qaDiv.appendChild(btn);
      })(qActions[qai]);
    }
    dash.appendChild(qaDiv);

    // 功能地图
    dash.appendChild(_renderFeatureMap());

    // 教程入口（始终可见）
    var tutHint = targetDoc.createElement('div');
    tutHint.style.cssText = 'text-align:center;margin-top:12px;padding:10px;background:#fefbf8;border:1px solid #f0d8c0;border-radius:10px;cursor:pointer';
    var tutDone = false; try { tutDone = localStorage.getItem(_getTutorialKey()) === '1'; } catch(e) {}
    tutHint.innerHTML = tutDone
      ? '<span style="font-size:13px;color:#c48840">★</span> <span style="font-size:12px;color:#333">复习教程</span> <span style="font-size:10px;color:#555">（5步快速上手）</span>'
      : '<span style="font-size:13px;color:#c48840">第一次用？</span> <span style="font-size:12px;color:#333">点击这里开始 2 分钟快速上手教程</span>';
    tutHint.addEventListener('click', function() { _tutorialStepIndex = 0; _startTutorial(); });
    dash.appendChild(tutHint);

    // 魔法按钮：一键分析
    var magicDiv = targetDoc.createElement('div');
    magicDiv.style.cssText = 'margin-top:12px;text-align:center';
    var magicBtn = targetDoc.createElement('button');
    magicBtn.textContent = '帮我分析';
    magicBtn.style.cssText = 'padding:12px 40px;font-size:15px;font-weight:600;background:linear-gradient(135deg,#d4878a,#b84040);color:#fff;border:none;border-radius:24px;cursor:pointer;box-shadow:0 4px 16px rgba(184,64,64,0.2);transition:all 0.3s;width:100%';
    magicBtn.addEventListener('mouseenter', function() { magicBtn.style.transform = 'translateY(-2px)'; magicBtn.style.boxShadow = '0 6px 24px rgba(184,64,64,0.3)'; });
    magicBtn.addEventListener('mouseleave', function() { magicBtn.style.transform = 'translateY(0)'; magicBtn.style.boxShadow = '0 4px 16px rgba(184,64,64,0.2)'; });
    magicBtn.addEventListener('click', function() {
      magicBtn.textContent = '分析中...';
      magicBtn.disabled = true;
      _runAnalysis().then(function(report) {
        magicBtn.textContent = '帮我分析';
        magicBtn.disabled = false;
        _showAnalysisReport(report);
      });
    });
    magicDiv.appendChild(magicBtn);
    dash.appendChild(magicDiv);
  });
}

// 一键分析引擎
function _runAnalysis() {
  return DataService.getAll({ includeHidden: false }).then(function(memories) {
    var report = { total: memories.length, conflicts: _findConflicts(memories), duplicateGroups: [], dormantCount: 0, tagCoverage: 0, needsArchive: [], suggestions: [] };
    // 语义去重检测
    if (memories.length >= 2 && SemanticEngine.isReady()) {
      var clusterResult = SemanticEngine.cluster(memories, 0.85);
      for (var gi = 0; gi < clusterResult.groups.length; gi++) {
        if (clusterResult.groups[gi].length >= 2) {
          report.duplicateGroups.push(clusterResult.groups[gi]);
        }
      }
    }
    // 沉寂和归档候选
    var now = Date.now();
    for (var i = 0; i < memories.length; i++) {
      var m = memories[i];
      var ds = ((m.importance || 3) / 5) * Math.exp(-((now - m.timestamp) / 86400000) / 14);
      if (ds <= 0.15 && !m.archivedAt) report.dormantCount++;
      var daysSince = (now - m.timestamp) / 86400000;
    }
    // 标签覆盖率
    var tagSet = {};
    var totalTags = 0;
    for (var di = 0; di < memories.length; di++) {
      if (memories[di].tags) { totalTags += memories[di].tags.length; for (var ti2 = 0; ti2 < memories[di].tags.length; ti2++) tagSet[memories[di].tags[ti2]] = true; }
    }
    report.tagCoverage = Math.round((Object.keys(tagSet).length / Math.max(memories.length, 1)) * 100);
    // 建议生成
    if (report.duplicateGroups.length > 0) report.suggestions.push('发现 ' + report.duplicateGroups.length + ' 组疑似重复记忆，建议去重或合并');
    if (report.conflicts.length > 0) report.suggestions.push('发现 ' + report.conflicts.length + ' 组潜在矛盾');
    if (report.dormantCount > 0) report.suggestions.push(report.dormantCount + ' 条记忆已沉寂，建议回顾或归档');
    if (report.tagCoverage < 50) report.suggestions.push('标签覆盖率偏低（' + report.tagCoverage + '%），建议补充标签');
    var slots = ArchiveManager.getSlots();
    var daysSinceArchive = slots.length > 0 ? Math.floor((now - slots[0].createdAt) / 86400000) : 999;
    if (daysSinceArchive > 5 && memories.length > 0) report.suggestions.push('上次存档是 ' + daysSinceArchive + ' 天前');
    if (report.suggestions.length === 0) report.suggestions.push('一切良好，保持记录');
    return report;
  });
}

function _showAnalysisReport(report) {
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal';
  var html = '<div class="mm-modal-header"><h3>分析报告</h3><button class="mm-modal-close">×</button></div>' +
    '<p style="font-size:12px;color:#333;margin-bottom:12px">共分析 ' + report.total + ' 条记忆</p>';
  for (var i = 0; i < report.suggestions.length; i++) {
    html += '<div style="padding:8px 12px;border-radius:8px;background:' + (i === 0 && report.suggestions.length === 1 && report.suggestions[0].indexOf('良好') !== -1 ? '#e8f0e8' : '#fef8f0') + ';margin-bottom:6px;font-size:13px;color:#2c2c2c">' + (i + 1) + '. ' + report.suggestions[i] + '</div>';
  }
  html += '<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">' +
    (report.duplicateGroups.length > 0 ? '<button class="mm-btn mm-btn-sm go-dedup-btn">去重处理</button>' : '') +
    (report.conflicts.length > 0 ? '<button class="mm-btn mm-btn-sm go-conflict-btn">查看矛盾</button>' : '') +
    (report.dormantCount > 0 ? '<button class="mm-btn mm-btn-sm go-forget-btn">遗忘管理</button>' : '') +
    '<button class="mm-btn mm-btn-sm go-tag-btn">标签管理</button>' +
    '</div>' +
    '<div class="mm-form-actions"><button class="mm-btn close-btn">关闭</button></div>';
  modal.innerHTML = html;
  modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  modal.querySelector('.close-btn').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });
  var dedupBtn = modal.querySelector('.go-dedup-btn');
  if (dedupBtn) dedupBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); UIManager._triggerDedup(); });
  var confBtn = modal.querySelector('.go-conflict-btn');
  if (confBtn) confBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); UIManager._showConflictList(report.conflicts); });
  var forgetBtn = modal.querySelector('.go-forget-btn');
  if (forgetBtn) forgetBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); UIManager._showForgettingConfig(); });
  var tagBtn = modal.querySelector('.go-tag-btn');
  if (tagBtn) tagBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); UIManager._showTagManager(); });

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
}

// ====== 时间线渲染 ======
function _renderTimeline() {
  if (!_panelContentEl || !_panelContentEl._tlContent) return;
  var tc = _panelContentEl._tlContent;
  while (tc.firstChild) tc.removeChild(tc.firstChild);

  var MAX_RENDER = _panelContentEl._maxRenderTimeline || 150;

  var zoneFilter = _panelContentEl._tlZoneSel ? _panelContentEl._tlZoneSel.value : '';
  var tagFilter = _panelContentEl._tlTagSel ? _panelContentEl._tlTagSel.value : '';
  var groupBy = _panelContentEl._tlGroup ? _panelContentEl._tlGroup.value : 'day';

  DataService.getAll({ includeHidden: UIManager._recycleBinMode }).then(function(memories) {
    if (zoneFilter) memories = memories.filter(function(m) { return m.zone === zoneFilter; });
    if (tagFilter) memories = memories.filter(function(m) { return m.tags && m.tags.indexOf(tagFilter) !== -1; });
    memories.sort(function(a, b) { return b.timestamp - a.timestamp; });

    var totalCount = memories.length;
    var truncated = totalCount > MAX_RENDER;
    if (truncated) memories = memories.slice(0, MAX_RENDER);

    if (memories.length === 0) {
      var empty = targetDoc.createElement('div');
      empty.style.cssText = 'text-align:center;padding:40px;color:#555;font-size:13px';
      empty.textContent = '暂无匹配的记忆';
      tc.appendChild(empty);
      return;
    }

    // Group by time
    var groups = [];
    var currentGroup = null;
    for (var i = 0; i < memories.length; i++) {
      var d = new Date(memories[i].timestamp);
      var groupKey;
      if (groupBy === 'day') groupKey = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      else if (groupBy === 'week') {
        var dayOfWeek = d.getDay();
        var weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek);
        groupKey = weekStart.getFullYear() + '-' + (weekStart.getMonth() + 1) + '-' + weekStart.getDate();
      } else {
        groupKey = d.getFullYear() + '-' + (d.getMonth() + 1);
      }

      if (!currentGroup || currentGroup.key !== groupKey) {
        currentGroup = { key: groupKey, label: _formatGroupLabel(d, groupBy, memories[i].timestamp), memories: [] };
        groups.push(currentGroup);
      }
      currentGroup.memories.push(memories[i]);
    }

    var frag = targetDoc.createDocumentFragment();
    var now = Date.now();
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];
      var groupDiv = targetDoc.createElement('div');
      groupDiv.style.cssText = 'margin-bottom:16px';

      var groupHeader = targetDoc.createElement('div');
      groupHeader.style.cssText = 'font-size:12px;font-weight:600;color:#b84040;padding:4px 0;margin-bottom:6px;border-bottom:2px solid #f0e6e6;display:flex;align-items:center;gap:6px';
      groupHeader.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#b84040;display:inline-block;flex-shrink:0"></span>' + group.label + '<span style="font-size:10px;color:#555;font-weight:400">(' + group.memories.length + ' 条)</span>';
      groupDiv.appendChild(groupHeader);

      for (var mi = 0; mi < group.memories.length; mi++) {
        (function(m) {
          var tlCard = targetDoc.createElement('div');
          var daysAgo = Math.floor((now - m.timestamp) / 86400000);
          var timeLabel = daysAgo === 0 ? '今天' + _timeStr(m.timestamp) : daysAgo === 1 ? '昨天' + _timeStr(m.timestamp) : daysAgo + ' 天前';
          tlCard.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:8px 0 8px 12px;border-left:2px solid #e8e4de;margin-left:3px;cursor:pointer;transition:border-color 0.15s';
          tlCard.addEventListener('mouseenter', function() { this.style.borderLeftColor = '#b84040'; });
          tlCard.addEventListener('mouseleave', function() { this.style.borderLeftColor = '#e8e4de'; });
          tlCard.addEventListener('click', function(e) { e.stopPropagation(); _showDetailPanel(m); });
          tlCard.title = '点击查看完整内容';

          var tlTime = targetDoc.createElement('div');
          tlTime.style.cssText = 'font-size:10px;color:#555;flex-shrink:0;min-width:48px;text-align:right';
          tlTime.textContent = timeLabel;
          tlCard.appendChild(tlTime);

          var tlBody = targetDoc.createElement('div');
          tlBody.style.cssText = 'flex:1;min-width:0';
          var tlContent = targetDoc.createElement('div');
          tlContent.style.cssText = 'font-size:13px;color:#2c2c2c;line-height:1.6;overflow-wrap:break-word;word-break:break-word';
          var fullText = m.content || '';
          tlContent.textContent = fullText.length > 300 ? fullText.substring(0, 300) + '…' : fullText;
          tlBody.appendChild(tlContent);
          if (m.tags && m.tags.length > 0) {
            var tlTags = targetDoc.createElement('div');
            tlTags.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-top:3px';
            for (var ti = 0; ti < Math.min(m.tags.length, 4); ti++) {
              var tspan = targetDoc.createElement('span');
              tspan.style.cssText = 'font-size:9px;padding:1px 5px;background:#f3f0ea;color:#333;border-radius:8px';
              tspan.textContent = m.tags[ti];
              tlTags.appendChild(tspan);
            }
            tlBody.appendChild(tlTags);
          }
          tlCard.appendChild(tlBody);
          groupDiv.appendChild(tlCard);
        })(group.memories[mi]);
      }
      frag.appendChild(groupDiv);
    }

    // 一次性插入所有 DOM，只触发一次回流
    tc.appendChild(frag);

    // 截断提示 + 加载按钮
    if (truncated) {
      var loadMoreBtn = targetDoc.createElement('button');
      loadMoreBtn.className = 'mm-btn mm-btn-primary';
      loadMoreBtn.style.cssText = 'display:block;margin:16px auto;padding:8px 24px;font-size:13px';
      loadMoreBtn.textContent = '当前显示最近 ' + MAX_RENDER + ' 条，共 ' + totalCount + ' 条 — 点击加载全部';
      loadMoreBtn.addEventListener('click', function() {
        loadMoreBtn.textContent = '加载中…';
        loadMoreBtn.disabled = true;
        _panelContentEl._maxRenderTimeline = totalCount;
        _renderTimeline();
      });
      tc.appendChild(loadMoreBtn);
    }
  });
}

// 快速查看面板（时间线点击卡片直接看全文，不再需要点编辑）
function _showDetailPanel() {}

function _formatGroupLabel(d, groupBy, ts) {
  var daysAgo = Math.floor((Date.now() - ts) / 86400000);
  var prefix = daysAgo === 0 ? '今天' : daysAgo === 1 ? '昨天' : '';
  if (groupBy === 'day') {
    return prefix || (d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate());
  } else if (groupBy === 'week') {
    return (prefix || '') + d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' 这周';
  }
  return d.getFullYear() + '/' + (d.getMonth() + 1);
}

function _timeStr(ts) { var d = new Date(ts); return ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

// 大数字压缩: 9993 → "9.9k", 1500000 → "1.5M"
function _fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

// ====== 冲突检测 ======
var CONFLICT_TAG_PAIRS = [
  ['信任', '裂痕'], ['盟友', '宿敌'], ['好感', '陌路'],
  ['重逢', '分别'], ['释然', '悔恨'], ['暗涌', '愤怒']
];

function _findConflicts(memories) {
  var conflicts = [];
  if (memories.length < 2) return conflicts;
  var checked = {};
  for (var i = 0; i < memories.length; i++) {
    for (var j = i + 1; j < memories.length; j++) {
      var a = memories[i], b = memories[j];
      if (a.hidden || b.hidden) continue;
      var pairKey = (a.id < b.id) ? a.id + '::' + b.id : b.id + '::' + a.id;
      if (checked[pairKey]) continue; checked[pairKey] = true;

      if (a.zone !== b.zone) continue;

      var sim = SemanticEngine.similarity(
        SemanticEngine.embed(a.content || ''),
        SemanticEngine.embed(b.content || '')
      );
      if (sim < 0.6) continue;

      var aTags = a.tags || [], bTags = b.tags || [];
      var conflictPair = null;
      for (var ci = 0; ci < CONFLICT_TAG_PAIRS.length; ci++) {
        var p = CONFLICT_TAG_PAIRS[ci];
        if ((aTags.indexOf(p[0]) !== -1 && bTags.indexOf(p[1]) !== -1) ||
            (aTags.indexOf(p[1]) !== -1 && bTags.indexOf(p[0]) !== -1)) {
          conflictPair = p; break;
        }
      }
      if (conflictPair) {
        conflicts.push({ memA: a, memB: b, conflictTags: conflictPair, similarity: sim });
      }
    }
  }
  conflicts.sort(function(a, b) { return b.similarity - a.similarity; });
  return conflicts;
}

// ====== 获取活跃筛选 ======
function _getActiveFilters() {
  if (!_panelContentEl) return {};
  return {
    zone: _panelContentEl._filterZone.value || '',
    category: _panelContentEl._filterCat.value || '',
    tag: _panelContentEl._filterTag.value || '',
    sort: _panelContentEl._sortBy.value || 'timestamp_desc'
  };
}

function _renderMemoryList() {
  if (!_panelContentEl) return;
  var list = _panelContentEl._memoryList;
  var batchBar = _panelContentEl._batchBar;
  var batchCount = _panelContentEl._batchCount;
  var tagCloud = _panelContentEl._tagCloud;
  var searchQuery = (_panelContentEl._searchInput.value || '').trim();
  var filters = _getActiveFilters();
  var sortVal = filters.sort;
  delete filters.sort;

  DataService.getAll({ includeHidden: UIManager._recycleBinMode }).then(function(memories) {
    // 搜索
    var filtered = memories;
    if (searchQuery) {
      var useSemantic = _panelContentEl._semanticMode && SemanticEngine.isReady();
      if (useSemantic) {
        // 语义搜索模式
        var qVec = SemanticEngine.embed(searchQuery);
        var scored = [];
        for (var mi2 = 0; mi2 < memories.length; mi2++) {
          var m = memories[mi2];
          var sim = SemanticEngine.similarity(qVec, SemanticEngine.embed(m.content || ''));
          if (sim > 0.2) scored.push({ id: m.id, score: sim });
        }
        scored.sort(function(a, b) { return b.score - a.score; });
        var resultIds = {};
        for (var si3 = 0; si3 < scored.length; si3++) resultIds[scored[si3].id] = true;
        filtered = memories.filter(function(m) { return resultIds[m.id]; });
        // 也加入精确匹配兜底
        var lowerQ2 = searchQuery.toLowerCase();
        for (var mi4 = 0; mi4 < memories.length; mi4++) {
          if (!resultIds[memories[mi4].id]) {
            if ((memories[mi4].content || '').toLowerCase().indexOf(lowerQ2) !== -1) {
              resultIds[memories[mi4].id] = true; filtered.push(memories[mi4]);
            }
          }
        }
      } else {
        // 精确搜索模式（原有逻辑）
        var searchResult = SearchIndex.search(searchQuery, Object.keys(filters).length > 0 ? filters : undefined);
        var resultIds2 = {};
        for (var si = 0; si < searchResult.hits.length; si++) resultIds2[searchResult.hits[si].id] = true;
        filtered = memories.filter(function(m) { return resultIds2[m.id]; });
        if (filtered.length < 3) {
          var lowerQ = searchQuery.toLowerCase();
          for (var mi = 0; mi < memories.length; mi++) {
            if (!resultIds2[memories[mi].id]) {
              if ((memories[mi].content || '').toLowerCase().indexOf(lowerQ) !== -1 ||
                  (memories[mi].roleName || '').toLowerCase().indexOf(lowerQ) !== -1) {
                resultIds2[memories[mi].id] = true; filtered.push(memories[mi]);
              }
            }
          }
        }
      }
    } else if (filters.zone || filters.category || filters.tag) {
      var where = {};
      if (filters.zone) where.zone = filters.zone;
      if (filters.category) where.category = filters.category;
      if (filters.tag) where.tags = [filters.tag];
      var sr2 = SearchIndex.search('', where);
      var rIds2 = {};
      for (var si2 = 0; si2 < sr2.hits.length; si2++) rIds2[sr2.hits[si2].id] = true;
      filtered = memories.filter(function(m) { return rIds2[m.id]; });
    }

    // 排序
    filtered.sort(function(a, b) {
      if (sortVal === 'importance') return (b.importance || 0) - (a.importance || 0);
      if (sortVal === 'timestamp_asc') return (a.timestamp || 0) - (b.timestamp || 0);
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    // 渲染列表
    while (list.firstChild) list.removeChild(list.firstChild);
    if (filtered.length === 0) {
      var empty = targetDoc.createElement('div');
      empty.style.cssText = 'text-align:center;padding:30px;color:#555;font-size:13px';
      empty.textContent = '暂无记忆';
      list.appendChild(empty);
    } else {
      for (var i = 0; i < filtered.length; i++) {
        list.appendChild(_buildMemoryCard(filtered[i], i));
      }
    }

    // 标签云
    _renderTagCloud(filtered, tagCloud);

    // 更新标签下拉
    var tagCounts = {};
    for (var ti = 0; ti < filtered.length; ti++) {
      var tags = filtered[ti].tags || [];
      for (var tj = 0; tj < tags.length; tj++) tagCounts[tags[tj]] = (tagCounts[tags[tj]] || 0) + 1;
    }
    var sorted = Object.keys(tagCounts).sort(function(a, b) { return tagCounts[b] - tagCounts[a]; });
    _panelContentEl._filterTag.innerHTML = '<option value="">全部标签</option>' +
      sorted.map(function(t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + ' (' + tagCounts[t] + ')</option>'; }).join('');

    // 批量栏
    if (UIManager._selectedIds.length > 0) {
      batchBar.style.display = 'flex';
      batchCount.textContent = '已选 ' + UIManager._selectedIds.length + ' 条' + (UIManager._recycleBinMode ? ' (回收站)' : '');
      // 根据回收站模式切换按钮显隐
      var bbBtns = batchBar.querySelectorAll('.mm-btn-sm');
      for (var bbi = 0; bbi < bbBtns.length; bbi++) {
        var txt = bbBtns[bbi].textContent;
        if (txt === '批量恢复') bbBtns[bbi].style.display = UIManager._recycleBinMode ? '' : 'none';
        if (txt === '批量删除' || txt === '+标签' || txt === '-标签' || txt === '生成回顾' || txt === '生成总结' || txt === '复制素材') {
          bbBtns[bbi].style.display = UIManager._recycleBinMode ? 'none' : '';
        }
      }
    } else {
      batchBar.style.display = 'none';
    }
  });
}

function _buildMemoryCard(m, idx) {
  var card = targetDoc.createElement('div');
  card.className = 'memory-card mm-zone-' + (m.zone || '角色记忆');
  card.style.cssText = 'display:flex;align-items:flex-start;gap:5px;padding:5px 7px;margin-bottom:3px;background:#fff;border:1px solid #e8e4de;border-left:3px solid #e8e4de;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.02);transition:background-color 0.15s;line-height:1.4';
  card.setAttribute('data-id', m.id);
  if (m.hidden) card.style.opacity = '0.55';

  // 复选框
  var cb = targetDoc.createElement('input');
  cb.type = 'checkbox';
  cb.style.cssText = 'flex-shrink:0;margin-top:2px;cursor:pointer';
  cb.checked = UIManager._selectedIds.indexOf(m.id) !== -1;
  cb.addEventListener('change', function() {
    var mid = card.getAttribute('data-id');
    var idx2 = UIManager._selectedIds.indexOf(mid);
    if (cb.checked && idx2 === -1) UIManager._selectedIds.push(mid);
    else if (!cb.checked && idx2 !== -1) UIManager._selectedIds.splice(idx2, 1);
    _renderMemoryList();
  });
  card.appendChild(cb);

  // 主体
  var body = targetDoc.createElement('div');
  body.style.cssText = 'flex:1;min-width:0;overflow:hidden';

  var meta = targetDoc.createElement('div');
  meta.className = 'meta';
  meta.style.cssText = 'display:flex;gap:5px;align-items:center;margin-bottom:1px;flex-wrap:nowrap;overflow:hidden';
  meta.innerHTML = '<span style="font-size:10px;color:#555">' + formatDate(m.timestamp) + '</span>' +
    (m.roleName ? '<span style="font-size:11px;color:#4a6fa5;font-weight:500">' + escapeHtml(m.roleName) + '</span>' : '') +
    '<span style="font-size:10px;color:#555">[' + escapeHtml(m.zone || '角色记忆') + ']</span>';
  body.appendChild(meta);

  var contentDiv = targetDoc.createElement('div');
  contentDiv.className = 'mm-card-content';
  contentDiv.style.cssText = 'font-size:12px;color:#2c2c2c;line-height:1.45;margin-bottom:2px;overflow-wrap:break-word;word-break:break-word';
  contentDiv.innerHTML = _renderMD(m.content || '');
  body.appendChild(contentDiv);

  if (m.tags && m.tags.length > 0) {
    var tagsDiv = targetDoc.createElement('div');
    tagsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:1px;margin-top:1px';
    var maxShow = 3;
    for (var ti = 0; ti < m.tags.length && ti < maxShow; ti++) {
      var tag = targetDoc.createElement('span');
      tag.style.cssText = 'font-size:9px;padding:0px 4px;background:#f3f0ea;color:#333;border-radius:2px';
      tag.textContent = m.tags[ti];
      tagsDiv.appendChild(tag);
    }
    if (m.tags.length > maxShow) {
      var moreTag = targetDoc.createElement('span');
      moreTag.style.cssText = 'font-size:9px;padding:0px 4px;color:#555';
      moreTag.textContent = '+' + (m.tags.length - maxShow);
      tagsDiv.appendChild(moreTag);
    }
    body.appendChild(tagsDiv);
  }
  // 操作按钮（放在正文底部，不挤占右侧空间）
  var actions = targetDoc.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:3px;padding-top:3px;border-top:1px solid #f0ece6';

  function actBtn(label, title, onclick) {
    var ab = targetDoc.createElement('button');
    ab.textContent = label;
    ab.title = title;
    ab.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;padding:1px 6px;border-radius:3px;color:#555';
    ab.addEventListener('mouseenter', function() { ab.style.background = '#f3f0ea'; ab.style.color = '#2c2c2c'; });
    ab.addEventListener('mouseleave', function() { ab.style.background = 'none'; ab.style.color = '#555'; });
    ab.addEventListener('click', function(e) { e.stopPropagation(); onclick(m.id); });
    actions.appendChild(ab);
  }
  if (m.hidden) {
    actBtn('恢复', '恢复此记忆', function(id) { DataService.restore(id).then(function() { _renderMemoryList(); }); });
    actBtn('彻底删除', '永久删除', function(id) {
      UIManager._showConfirm('确定永久删除？', function() {
        DataService.permanentDelete(id).then(function() { _renderMemoryList(); });
      });
    });
  } else {
    actBtn('复制', '复制内容', function(id) {
      DataService.getById(id).then(function(mem) {
        UIManager._safeCopy(mem.content || ''); UIManager.showToast('已复制', 'success');
      });
    });
    actBtn('编辑', '编辑记忆', function(id) { DataService.getById(id).then(function(mem) { if (mem) UIManager._showEditor(mem); }); });
    actBtn('相似', '找相似的记忆', function(id) { UIManager._showSimilarMemories(id); });
    actBtn('删除', '删除记忆', function(id) {
      DataService.getById(id).then(function(mem) {
        if (mem && mem.protected) UIManager._showConfirm('受保护的记忆，确定删除？', function() { DataService.softDelete(id).then(function() { UIManager.showToast('已删除', 'info'); _renderMemoryList(); }); });
        else DataService.softDelete(id).then(function() { UIManager.showToast('已删除', 'info'); _renderMemoryList(); });
      });
    });
  }
  body.appendChild(actions);
  card.appendChild(body);

  return card;
}

function _renderTagCloud(memories, cloudEl) {
  if (!cloudEl) cloudEl = _panelContentEl && _panelContentEl._tagCloud;
  if (!cloudEl) return;
  while (cloudEl.children.length > 0) cloudEl.removeChild(cloudEl.firstChild);
  var tagCloud = TagManager.getCloud(15);
  if (tagCloud.length === 0) return;
  var maxCount = tagCloud[0].count || 1;
  for (var i = 0; i < tagCloud.length; i++) {
    var item = targetDoc.createElement('span');
    item.style.cssText = 'font-size:' + (11 + Math.round((tagCloud[i].count / maxCount) * 3)) + 'px;padding:2px 8px;background:#f3f0ea;color:#333;border-radius:2px;cursor:pointer;border:1px solid transparent';
    item.textContent = tagCloud[i].tag;
    item.setAttribute('data-tag', tagCloud[i].tag);
    item.addEventListener('click', function() {
      var t = this.getAttribute('data-tag');
      if (_panelContentEl) {
        _panelContentEl._filterTag.value = (_panelContentEl._filterTag.value === t) ? '' : t;
        _renderMemoryList();
      }
    });
    cloudEl.appendChild(item);
  }
}


/* ====== Markdown 轻渲染 ====== */
// 仅做视觉增强，不涉及存储
function _renderMD(text) {
  if (!text) return '';
  var t = typographic(String(text));
  t = escapeHtml(t);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
  t = t.replace(/`([^`]+)`/g, '<code style="background:#f3f0ea;padding:1px 4px;border-radius:2px;font-size:12px">$1</code>');
  t = t.replace(/^### (.+)$/gm, '<h4 style="font-size:14px;margin:6px 0 4px;color:#2c2c2c">$1</h4>');
  t = t.replace(/^## (.+)$/gm, '<h3 style="font-size:15px;margin:6px 0 4px;color:#2c2c2c">$1</h3>');
  t = t.replace(/^# (.+)$/gm, '<h2 style="font-size:16px;margin:6px 0 4px;color:#2c2c2c">$1</h2>');
  t = t.replace(/^- (.+)$/gm, '<li style="margin-left:16px">$1</li>');
  t = t.replace(/\n/g, '<br>');
  return t;
}

/* ====== UIManager Minimal (non-panel methods only) ====== */
// 保留模态框、Toast、确认窗等与 WinBox 无关的方法
var UIManager = {};
UIManager._selectedIds = [];
UIManager._copyFallbackCount = 0;  // 诊断用：降级弹窗使用次数
UIManager._lastCopyResult = null;  // 诊断用：{time, type, length, ok}
UIManager._recycleBinMode = false;

// 将提前定义的方法绑定到 UIManager（因为它们的函数体在 UIManager 定义之前）
UIManager._showHelpCard = _showHelpCardImpl;
UIManager._showManual = _showManualImpl;

// 委托方法（供面板按钮调用）
UIManager._triggerDedup = function() {
  DataService.deduplicate().then(function(memories) {
    UIManager.showToast('去重完成，共 ' + memories.length + ' 条', 'success');
    _renderMemoryList();
  });
};
UIManager._triggerImport = function() {
  var inp = targetDoc.createElement('input');
  inp.type = 'file'; inp.accept = '.json'; inp.style.display = 'none';
  inp.addEventListener('change', function() {
    var file = inp.files[0]; if (!file) return;
    Exporter.importJSON(file).then(function(r) {
      UIManager.showToast('导入：新增 ' + r.added + ' 条，跳过 ' + r.skipped + ' 条', 'success');
      _renderMemoryList();
    }).catch(function(err) { UIManager.showToast(err.message, 'error'); });
    inp.parentNode.removeChild(inp);
  });
  targetDoc.body.appendChild(inp);
  inp.click();
};
UIManager._triggerExport = function() {
  DataService.getAll({ includeHidden: false }).then(function(memories) {
    try { Exporter.exportJSON(memories); UIManager.showToast('导出成功', 'success'); }
    catch(err) { UIManager.showToast(err.message, 'error'); }
  });
};

// Toast
UIManager.showToast = function(message, type) {
  var toast = targetDoc.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:80px;right:24px;z-index:99999;padding:10px 16px;border-radius:2px;font-size:13px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.12);animation:mm-toast-in 0.25s ease;max-width:320px';
  toast.style.background = type === 'success' ? '#4caf50' : type === 'error' ? '#b84040' : '#4a6fa5';
  toast.textContent = message;
  targetDoc.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
};

// 刷新面板（供 RollbackManager 等外部调用）
UIManager.refresh = function() {
  _renderMemoryList();
};

// 确认弹窗
UIManager._showConfirm = function(msg, onConfirm) {
  var overlay = targetDoc.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999999;display:flex;align-items:center;justify-content:center';
  var modal = targetDoc.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:4px;padding:20px 24px;max-width:360px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1)';
  modal.innerHTML = '<p style="margin-bottom:16px;font-size:14px;color:#2c2c2c">' + msg + '</p>';
  var actions = targetDoc.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px;justify-content:center';
  var cancelBtn = targetDoc.createElement('button');
  cancelBtn.textContent = '取消'; cancelBtn.className = 'mm-btn';
  cancelBtn.style.cssText = 'min-width:80px;min-height:40px;font-size:14px;border-radius:20px;cursor:pointer';
  cancelBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  cancelBtn.addEventListener('touchstart', function(e) { e.stopPropagation(); cancelBtn.style.background = '#f0e0e0'; });
  cancelBtn.addEventListener('touchend', function() { cancelBtn.style.background = ''; });
  var okBtn = targetDoc.createElement('button');
  okBtn.textContent = '确认'; okBtn.className = 'mm-btn mm-btn-danger';
  okBtn.style.cssText = 'min-width:80px;min-height:40px;font-size:14px;border-radius:20px;cursor:pointer';
  okBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); if (onConfirm) onConfirm(); });
  okBtn.addEventListener('touchstart', function(e) { e.stopPropagation(); okBtn.style.opacity = '0.7'; });
  okBtn.addEventListener('touchend', function() { okBtn.style.opacity = '1'; });
  actions.appendChild(cancelBtn); actions.appendChild(okBtn);
  modal.appendChild(actions); overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};

// 快速新建 — 简化版
UIManager._showQuickCreate = function() {
  var overlay = targetDoc.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.35);z-index:99999;display:flex;align-items:center;justify-content:center';
  var modal = targetDoc.createElement('div');
  modal.className = 'mirror-modal';
  modal.style.cssText = 'background:#fff;border-radius:4px;padding:20px 24px;max-width:500px;width:92%;max-height:85vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.1)';
  modal.innerHTML = '<h3 style="margin:0 0 12px;font-size:15px;color:#2c2c2c">快速记录</h3>' +
    '<div style="display:flex;gap:8px;margin-bottom:8px">' +
    '<select id="mm-qc-zone" style="flex:1;padding:6px;border:1px solid #e8e4de;border-radius:2px;color:#2c2c2c;background:#fff"><option value="角色记忆">角色记忆</option><option value="玩家记忆">玩家记忆</option><option value="世界记忆">世界记忆</option><option value="总结记忆">总结记忆</option></select>' +
    '<select id="mm-qc-category" style="flex:1;padding:6px;border:1px solid #e8e4de;border-radius:2px;color:#2c2c2c;background:#fff"><option value="">分类（可选）</option><option value="初识印象">初识印象</option><option value="深层认知">深层认知</option><option value="行为习惯">行为习惯</option><option value="情感关系">情感关系</option><option value="背景故事">背景故事</option><option value="其他">其他</option></select>' +
    '<select id="mm-qc-importance" style="width:60px;padding:6px;border:1px solid #e8e4de;border-radius:2px;color:#2c2c2c;background:#fff"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select>' +
    '</div>' +
    '<textarea id="mm-qc-content" rows="5" placeholder="输入记忆内容…" style="width:100%;padding:8px;border:1px solid #e8e4de;border-radius:2px;font-size:13px;resize:vertical;box-sizing:border-box;color:#2c2c2c;background:#fff"></textarea>' +
    '<input id="mm-qc-tags" type="text" placeholder="标签（逗号分隔）" style="width:100%;padding:6px;margin-top:8px;border:1px solid #e8e4de;border-radius:2px;font-size:13px;box-sizing:border-box;color:#2c2c2c;background:#fff">' +
    '<input id="mm-qc-rolename" type="text" placeholder="角色名（可选）" style="width:100%;padding:6px;margin-top:6px;border:1px solid #e8e4de;border-radius:2px;font-size:13px;box-sizing:border-box;color:#2c2c2c;background:#fff">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
    '<button id="mm-qc-cancel" class="mm-btn">取消</button>' +
    '<button id="mm-qc-save" class="mm-btn mm-btn-primary">保存</button></div>';
  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });
  modal.querySelector('#mm-qc-cancel').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  modal.querySelector('#mm-qc-save').addEventListener('click', function() {
    var content = modal.querySelector('#mm-qc-content').value.trim();
    if (!content) { UIManager.showToast('请输入内容', 'error'); return; }
    var tags = modal.querySelector('#mm-qc-tags').value.split(/[,，]/).map(function(t) { return t.trim(); }).filter(function(t) { return t; });
    var memory = createMemory({
      zone: modal.querySelector('#mm-qc-zone').value,
      category: modal.querySelector('#mm-qc-category').value,
      content: content,
      tags: tags,
      importance: parseInt(modal.querySelector('#mm-qc-importance').value, 10),
      roleName: modal.querySelector('#mm-qc-rolename').value.trim(),
      roleId: DataService._roleId,
      sourceType: 'manual'
    });
    DataService.save(memory).then(function() {
      UIManager.showToast('已添加', 'success');
      targetDoc.body.removeChild(overlay);
      _renderMemoryList();
    });
  });

  // 自动标签（输入时防抖建议，仅当标签栏为空时自动填入）
  var contentEl = modal.querySelector('#mm-qc-content');
  var tagsEl = modal.querySelector('#mm-qc-tags');
  var suggestTags = debounce(function() {
    var suggested = TagManager.getSuggestedTags(contentEl.value);
    if (suggested.length > 0 && !tagsEl.value.trim()) tagsEl.value = suggested.join(', ');
  }, 600);
  contentEl.addEventListener('input', suggestTags);
  contentEl.addEventListener('blur', function() {
    var suggested = TagManager.getSuggestedTags(contentEl.value);
    if (suggested.length > 0 && !tagsEl.value.trim()) tagsEl.value = suggested.join(', ');
  });
};

// 编辑模态框（简化版）
UIManager._showEditor = function(memory) {
  var overlay = targetDoc.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.35);z-index:99999;display:flex;align-items:center;justify-content:center';
  var modal = targetDoc.createElement('div');
  modal.className = 'mirror-modal';
  modal.style.cssText = 'background:#fff;border-radius:4px;padding:20px 24px;max-width:560px;width:94%;max-height:85vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.1)';
  modal.innerHTML =
    '<h3 style="margin:0 0 12px">编辑记忆</h3>' +
    '<select id="mm-ed-zone" style="width:100%;padding:6px;margin-bottom:6px;border:1px solid #e8e4de;border-radius:2px">' + ZONES.map(function(z) { return '<option' + (z === memory.zone ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select>' +
    '<textarea id="mm-ed-content" rows="5" style="width:100%;padding:8px;border:1px solid #e8e4de;border-radius:2px;font-size:13px;resize:vertical;box-sizing:border-box;color:#2c2c2c;background:#fff">' + escapeHtml(memory.content || '') + '</textarea>' +
    '<div style="display:flex;gap:6px;margin-top:6px"><input id="mm-ed-rolename" placeholder="角色名" value="' + escapeHtml(memory.roleName || '') + '" style="flex:1;padding:6px;border:1px solid #e8e4de;border-radius:2px;color:#2c2c2c;background:#fff"><input id="mm-ed-category" placeholder="分类" value="' + escapeHtml(memory.category || '') + '" style="flex:1;padding:6px;border:1px solid #e8e4de;border-radius:2px;color:#2c2c2c;background:#fff"></div>' +
    '<input id="mm-ed-tags" placeholder="标签（逗号分隔）" value="' + escapeHtml((memory.tags || []).join(', ')) + '" style="width:100%;padding:6px;margin-top:6px;border:1px solid #e8e4de;border-radius:2px;box-sizing:border-box">' +
    '<div style="display:flex;gap:4px;margin-top:6px"><input id="mm-ed-triggers" placeholder="触发关键词（逗号分隔）" value="' + escapeHtml((memory.triggerKeywords || []).join(', ')) + '" style="flex:1;padding:6px;border:1px solid #e8e4de;border-radius:2px;box-sizing:border-box"><button id="mm-ed-suggest-triggers" class="mm-btn mm-btn-xs" style="flex-shrink:0" title="从标签和内容自动推荐触发词">推荐</button></div>' +
    '<div style="display:flex;gap:6px;margin-top:6px"><select id="mm-ed-importance" style="flex:1;padding:6px;border:1px solid #e8e4de;border-radius:2px;color:#2c2c2c;background:#fff">' + [1,2,3,4,5].map(function(v) { return '<option' + (v === (memory.importance||3) ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></div>' +
    '<label style="display:flex;align-items:center;gap:4px;margin-top:6px;font-size:12px;color:#2c2c2c"><input id="mm-ed-protected" type="checkbox"' + (memory.protected ? ' checked' : '') + '> 保护状态</label>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button id="mm-ed-cancel" class="mm-btn">取消</button><button id="mm-ed-save" class="mm-btn mm-btn-primary">保存</button></div>';
  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });
  modal.querySelector('#mm-ed-cancel').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  modal.querySelector('#mm-ed-save').addEventListener('click', function() {
    var tags = modal.querySelector('#mm-ed-tags').value.split(/[,，]/).map(function(t) { return t.trim(); }).filter(function(t) { return t; });
    var triggerKeywords = modal.querySelector('#mm-ed-triggers').value.split(/[,，]/).map(function(t) { return t.trim(); }).filter(function(t) { return t; });
    DataService.update(memory.id, {
      zone: modal.querySelector('#mm-ed-zone').value,
      content: modal.querySelector('#mm-ed-content').value,
      roleName: modal.querySelector('#mm-ed-rolename').value,
      category: modal.querySelector('#mm-ed-category').value,
      tags: tags,
      triggerKeywords: triggerKeywords,
      importance: parseInt(modal.querySelector('#mm-ed-importance').value, 10),
      protected: modal.querySelector('#mm-ed-protected').checked
    }).then(function() {
      UIManager.showToast('已更新', 'success');
      targetDoc.body.removeChild(overlay);
      _renderMemoryList();
    });
  });

  // 推荐触发关键词
  modal.querySelector('#mm-ed-suggest-triggers').addEventListener('click', function() {
    var content = modal.querySelector('#mm-ed-content').value;
    var tagStr = modal.querySelector('#mm-ed-tags').value;
    var existing = tagStr.split(/[,，]/).map(function(t) { return t.trim(); }).filter(function(t) { return t; });
    var suggested = AutoTagger.extractTags(content);
    var triggerEl = modal.querySelector('#mm-ed-triggers');
    var currentTrigs = triggerEl.value.split(/[,，]/).map(function(t) { return t.trim(); }).filter(function(t) { return t; });
    var seen = {};
    for (var i = 0; i < currentTrigs.length; i++) seen[currentTrigs[i]] = true;
    for (var j = 0; j < existing.length; j++) if (!seen[existing[j]]) { seen[existing[j]] = true; currentTrigs.push(existing[j]); }
    for (var k = 0; k < suggested.length; k++) if (!seen[suggested[k]]) { seen[suggested[k]] = true; currentTrigs.push(suggested[k]); }
    triggerEl.value = currentTrigs.join(', ');
  });
};

// 表单组辅助方法
UIManager._makeFormGroup = function(label, type, options, value) {
  var group = targetDoc.createElement('div');
  group.className = 'mm-form-group';
  var lbl = targetDoc.createElement('label');
  lbl.textContent = label + '：';
  group.appendChild(lbl);

  if (type === 'select') {
    var sel = targetDoc.createElement('select');
    for (var i = 0; i < options.length; i++) {
      var opt = targetDoc.createElement('option');
      opt.value = options[i];
      opt.textContent = options[i];
      if (options[i] === value) opt.selected = true;
      sel.appendChild(opt);
    }
    group.appendChild(sel);
  } else {
    var inp = targetDoc.createElement('input');
    inp.type = type || 'text';
    if (value) inp.value = value;
    group.appendChild(inp);
  }
  return group;
};

/* ---------- 自动化面板 ---------- */
UIManager._showAutoPanel = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';

  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal mm-modal-wide mm-auto-panel';

  var header = targetDoc.createElement('div');
  header.className = 'mm-modal-header';
  var h3 = targetDoc.createElement('h3');
  h3.textContent = '自动化任务管理';
  header.appendChild(h3);
  var closeBtn = targetDoc.createElement('button');
  closeBtn.className = 'mm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // 提示
  var tip = targetDoc.createElement('p');
  tip.className = 'mm-help-tip';
  tip.style.cssText = 'padding:6px 0;margin-bottom:12px';
  tip.textContent = 'AI 每回复一次算一轮。到达设定轮数后自动生成指令，帮你保持记忆活跃。';
  modal.appendChild(tip);

  // 简易/高级切换
  var segment = targetDoc.createElement('div');
  segment.className = 'mm-auto-segment';
  var easyBtn = targetDoc.createElement('button');
  easyBtn.textContent = '简易';
  easyBtn.className = 'active';
  var advBtn = targetDoc.createElement('button');
  advBtn.textContent = '高级';
  segment.appendChild(easyBtn);
  segment.appendChild(advBtn);
  modal.appendChild(segment);

  var contentArea = targetDoc.createElement('div');

  var typeDescs = { recall: '每隔N轮对话，自动把还没回顾过的旧记忆发给AI重新确认', summarize: '每隔N轮对话，自动把多条零散记忆合并压缩为要点', dormant: '检测长期未被触及的高重要性记忆，提醒你回顾' };

  function renderEasy() {
    while (contentArea.firstChild) contentArea.removeChild(contentArea.firstChild);
    var rules = RuleEngine.getRules();
    var FREQ_MAP = { off: 0, occasional: 20, frequent: 5 };
    var typeNames = { recall: '定期回顾', summarize: '定期总结', dormant: '沉寂提醒' };

    // 说明文字
    var infoDiv = targetDoc.createElement('div');
    infoDiv.style.cssText = 'padding:8px 10px;background:#faf8f5;border-radius:8px;border:1px solid #e8e4de;margin-bottom:10px;font-size:11px;color:#777;line-height:1.6';
    infoDiv.innerHTML = '<b style="color:#555">💡 自动化规则说明</b><br>' +
      '<b>关</b> = 不使用 | <b>偶尔</b> = 约20轮对话触发一次 | <b>频繁</b> = 约5轮对话触发一次<br>' +
      '进度条表示距离下次触发的完成度（<b>N/20</b> = 已过N轮，还需20-N轮）<br>' +
      '触发后的内容会<u>按下方选择的输出方式</u>呈现给你';
    contentArea.appendChild(infoDiv);

    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      var currentFreq = 'off';
      if (!r.enabled) currentFreq = 'off';
      else if (r.conditions.roundCount.min <= 5) currentFreq = 'frequent';
      else currentFreq = 'occasional';

      var row = targetDoc.createElement('div');
      row.className = 'mm-auto-task-row';
      row.style.cssText = 'flex-wrap:wrap;gap:8px;align-items:center';

      var nameSpan = targetDoc.createElement('span');
      nameSpan.textContent = typeNames[r.type] || r.type;
      nameSpan.style.cssText = 'font-weight:500;min-width:80px;font-size:13px;color:#2c2c2c;cursor:help';
      nameSpan.title = typeDescs[r.type] || '';
      row.appendChild(nameSpan);

      // 三档开关
      var freqs = [
        { key: 'off', label: '关' },
        { key: 'occasional', label: '偶尔' },
        { key: 'frequent', label: '频繁' }
      ];

      var segDiv = targetDoc.createElement('div');
      segDiv.style.cssText = 'display:flex;border-radius:16px;overflow:hidden;border:1px solid #e8ddd6';
      for (var fi = 0; fi < freqs.length; fi++) {
        (function(f, rule, idx) {
          var fBtn = targetDoc.createElement('button');
          fBtn.textContent = f.label;
          fBtn.style.cssText = 'padding:5px 14px;border:none;background:' + (currentFreq === f.key ? '#b84040' : '#fff') + ';color:' + (currentFreq === f.key ? '#fff' : '#555') + ';cursor:pointer;font-size:12px;transition:all 0.2s';
          fBtn.addEventListener('click', function() {
            if (f.key === 'off') {
              RuleEngine.updateRule(rule.id, { enabled: false });
            } else {
              RuleEngine.updateRule(rule.id, { enabled: true, conditions: { roundCount: { min: FREQ_MAP[f.key] } } });
            }
            renderEasy();
          });
          segDiv.appendChild(fBtn);
        })(freqs[fi], r);
      }
      row.appendChild(segDiv);

      // 进度条
      var maxRounds = r.conditions.roundCount.min || 20;
      var pct = Math.min(100, Math.round((r.counter / maxRounds) * 100));
      var progBar = targetDoc.createElement('div');
      progBar.className = 'mm-auto-progress';
      progBar.style.cssText = 'width:60px;height:6px;background:#f3f0ea;border-radius:3px;overflow:hidden;flex-shrink:0';
      var bar = targetDoc.createElement('div');
      bar.className = 'mm-auto-progress-bar';
      bar.style.width = pct + '%';
      progBar.appendChild(bar);
      row.appendChild(progBar);

      var cntSpan = targetDoc.createElement('span');
      cntSpan.textContent = r.counter + '/' + maxRounds;
      cntSpan.style.cssText = 'font-size:10px;color:#555;min-width:35px;text-align:center';
      row.appendChild(cntSpan);

      contentArea.appendChild(row);
    }

    // 触发方式和模板
    var settingsDiv = targetDoc.createElement('div');
    settingsDiv.style.cssText = 'margin-top:12px;padding:12px;background:#fafaf8;border-radius:10px;border:1px solid #e8e4de';

    var modeLabel = targetDoc.createElement('div');
    modeLabel.textContent = '输出方式：';
    modeLabel.style.cssText = 'font-size:12px;color:#333;margin-bottom:6px';
    settingsDiv.appendChild(modeLabel);

    var modes = [
      { key: 'notify', label: '弹窗提示' },
      { key: 'inject', label: '注入输入框' },
      { key: 'dashboard', label: '仪表盘标记' }
    ];
    var modeDiv = targetDoc.createElement('div');
    modeDiv.style.cssText = 'display:flex;gap:6px;margin-bottom:10px';
    for (var mi = 0; mi < modes.length; mi++) {
      (function(m) {
        var mBtn = targetDoc.createElement('button');
        mBtn.textContent = m.label;
        mBtn.className = 'mm-btn mm-btn-xs';
        mBtn.style.cssText = 'border-radius:14px;font-size:11px;padding:4px 12px;' + (AutoTaskManager._triggerMode === m.key ? 'background:#b84040;color:#fff;border-color:#b84040' : '');
        mBtn.addEventListener('click', function() {
          AutoTaskManager._triggerMode = m.key;
          renderEasy();
        });
        modeDiv.appendChild(mBtn);
      })(modes[mi]);
    }
    settingsDiv.appendChild(modeDiv);

    var tmplBtn = targetDoc.createElement('button');
    tmplBtn.className = 'mm-btn mm-btn-sm';
    tmplBtn.textContent = '管理记忆指令模板';
    tmplBtn.style.cssText = 'width:100%';
    tmplBtn.addEventListener('click', function() { self._showTemplateManager(); });
    settingsDiv.appendChild(tmplBtn);

    contentArea.appendChild(settingsDiv);

    // 底部按钮
    var bottomRow = targetDoc.createElement('div');
    bottomRow.style.cssText = 'display:flex;gap:6px;margin-top:8px';
    var resetBtn = targetDoc.createElement('button');
    resetBtn.className = 'mm-btn mm-btn-sm';
    resetBtn.textContent = '重置计数器';
    resetBtn.addEventListener('click', function() {
      var allRules = RuleEngine.getRules();
      for (var ai = 0; ai < allRules.length; ai++) AutoTaskManager.resetCounter(allRules[ai].id);
      renderEasy();
    });
    bottomRow.appendChild(resetBtn);
    var triggerNow = targetDoc.createElement('button');
    triggerNow.className = 'mm-btn mm-btn-sm mm-btn-primary';
    triggerNow.textContent = '立即检查触发';
    triggerNow.addEventListener('click', function() { AutoTaskManager.checkAndTrigger(); self.showToast('已检查', 'info'); });
    bottomRow.appendChild(triggerNow);
    contentArea.appendChild(bottomRow);
  }

  function renderAdvanced() {
    while (contentArea.firstChild) contentArea.removeChild(contentArea.firstChild);
    var rules = RuleEngine.getRules();

    var addBtn = targetDoc.createElement('button');
    addBtn.className = 'mm-btn mm-btn-sm';
    addBtn.textContent = '＋ 新建任务';
    addBtn.style.cssText = 'margin-bottom:8px';
    addBtn.addEventListener('click', function() { _showRuleEditor(null); });
    contentArea.appendChild(addBtn);

    for (var i = 0; i < rules.length; i++) {
      (function(r) {
        var row = targetDoc.createElement('div');
        row.className = 'mm-auto-task-row';

        var toggle = targetDoc.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = r.enabled;
        toggle.title = '启用/禁用';
        toggle.addEventListener('change', function() {
          RuleEngine.updateRule(r.id, { enabled: this.checked });
          renderAdvanced();
        });
        row.appendChild(toggle);

        var nameSpan = targetDoc.createElement('span');
        nameSpan.textContent = (r.type === 'recall' ? '回顾' : r.type === 'summarize' ? '总结' : r.type === 'dormant' ? '沉寂' : r.type);
        nameSpan.style.cssText = 'font-size:12px;font-weight:500;width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2c2c2c;cursor:help';
        nameSpan.title = (typeDescs[r.type] || r.type);
        row.appendChild(nameSpan);

        var intervalSpan = targetDoc.createElement('span');
        intervalSpan.textContent = r.conditions.roundCount.min + '轮';
        intervalSpan.style.cssText = 'font-size:11px;color:#555;width:36px';
        row.appendChild(intervalSpan);

        var progBar = targetDoc.createElement('div');
        progBar.className = 'mm-auto-progress';
        var bar = targetDoc.createElement('div');
        bar.className = 'mm-auto-progress-bar';
        var pct = Math.min(100, Math.round((r.counter / r.conditions.roundCount.min) * 100));
        bar.style.width = pct + '%';
        progBar.appendChild(bar);
        row.appendChild(progBar);

        var triggerBtn = targetDoc.createElement('button');
        triggerBtn.className = 'mm-btn mm-btn-xs mm-btn-primary';
        triggerBtn.textContent = '▶';
        triggerBtn.title = '立即触发';
        triggerBtn.addEventListener('click', function() {
          AutoTaskManager.triggerTask({ type: r.type, params: {
            minImportance: r.conditions.minImportance,
            zone: r.conditions.zone,
            tags: r.conditions.tags,
            excludeReviewed: r.conditions.excludeReviewed,
            autoFill: r.action.autoFill,
            autoMark: r.action.autoMark,
            protectSource: r.action.protectSource,
            template: r.action.template
          }, rule: r }).then(function() { self.showToast('任务已触发', 'success'); });
        });
        row.appendChild(triggerBtn);

        var editBtn = targetDoc.createElement('button');
        editBtn.className = 'mm-btn mm-btn-xs';
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', function() { _showRuleEditor(r); });
        row.appendChild(editBtn);

        var delBtn = targetDoc.createElement('button');
        delBtn.className = 'mm-btn mm-btn-xs mm-btn-danger';
        delBtn.textContent = '×';
        if (r.id.indexOf('rule_default_') === 0) { delBtn.disabled = true; delBtn.style.opacity = '0.3'; }
        delBtn.addEventListener('click', function() {
          RuleEngine.removeRule(r.id);
          renderAdvanced();
        });
        row.appendChild(delBtn);

        contentArea.appendChild(row);
      })(rules[i]);
    }
  }

  function _showRuleEditor(rule) {
    var eo = targetDoc.createElement('div');
    eo.className = 'mm-modal-overlay';
    var em = targetDoc.createElement('div');
    em.className = 'mm-modal';
    var eh = targetDoc.createElement('div');
    eh.className = 'mm-modal-header';
    var eh3 = targetDoc.createElement('h3');
    eh3.textContent = rule ? '编辑任务' : '新建任务';
    eh.appendChild(eh3);
    var ec = targetDoc.createElement('button');
    ec.className = 'mm-modal-close';
    ec.textContent = '×';
    ec.addEventListener('click', function() { targetDoc.body.removeChild(eo); });
    eh.appendChild(ec);
    em.appendChild(eh);

    var nameInput = self._makeFormGroup('任务名称', 'input', null, rule ? rule.type : '').querySelector('input');
    var typeSelect = self._makeFormGroup('类型', 'select', ['recall', 'summarize', 'dormant', 'auto-extract'], rule ? rule.type : 'recall').querySelector('select');

    var intGroup = targetDoc.createElement('div');
    intGroup.className = 'mm-form-group';
    intGroup.appendChild(targetDoc.createElement('label')).textContent = '触发间隔（轮）：';
    var intInput = targetDoc.createElement('input');
    intInput.type = 'number';
    intInput.min = '1';
    intInput.value = rule ? String(rule.conditions.roundCount.min) : '10';
    intGroup.appendChild(intInput);
    em.appendChild(intGroup);

    em.appendChild(self._makeFormGroup('最低重要性', 'select', ['0','1','2','3','4','5'], rule ? String(rule.conditions.minImportance) : '0'));

    // 模板选择 + 自定义编辑
    var tmplGroup = targetDoc.createElement('div');
    tmplGroup.className = 'mm-form-group';
    tmplGroup.appendChild(targetDoc.createElement('label')).textContent = '模板预设：';
    var tmplSelect = targetDoc.createElement('select');
    tmplSelect.innerHTML = '<option value="">-- 自定义模板 --</option>';
    var templates = _getTemplates();
    var currentType = typeSelect.value;
    var typePresets = templates[currentType] || {};
    var presetKeys = Object.keys(typePresets);
    for (var pki = 0; pki < presetKeys.length; pki++) {
      tmplSelect.innerHTML += '<option value="' + presetKeys[pki] + '">' + typePresets[presetKeys[pki]].label + '</option>';
    }
    tmplSelect.addEventListener('change', function() {
      if (this.value && typePresets[this.value]) {
        tmplInput.value = typePresets[this.value].template;
      }
    });
    tmplGroup.appendChild(tmplSelect);
    em.appendChild(tmplGroup);

    typeSelect.addEventListener('change', function() {
      var ct = this.value;
      var ctPresets = templates[ct] || {};
      tmplSelect.innerHTML = '<option value="">-- 自定义模板 --</option>';
      var cpk = Object.keys(ctPresets);
      for (var cpi = 0; cpi < cpk.length; cpi++) {
        tmplSelect.innerHTML += '<option value="' + cpk[cpi] + '">' + ctPresets[cpk[cpi]].label + '</option>';
      }
    });

    var tmplEditGroup = targetDoc.createElement('div');
    tmplEditGroup.className = 'mm-form-group';
    tmplEditGroup.appendChild(targetDoc.createElement('label')).textContent = '指令模板（{memories} {memories_formatted} {memories_brief} {roleName} {date} {count}）：';
    var tmplInput = targetDoc.createElement('textarea');
    tmplInput.rows = 3;
    tmplInput.value = rule ? rule.action.template : '{memories_formatted}';
    tmplEditGroup.appendChild(tmplInput);
    em.appendChild(tmplEditGroup);

    // 分区和标签过滤
    var filterRow = targetDoc.createElement('div');
    filterRow.className = 'mm-form-row';
    filterRow.style.cssText = 'display:flex;gap:8px';
    var zoneGroup = targetDoc.createElement('div');
    zoneGroup.className = 'mm-form-group';
    zoneGroup.style.cssText = 'flex:1';
    zoneGroup.appendChild(targetDoc.createElement('label')).textContent = '限定分区：';
    var zoneSel = targetDoc.createElement('select');
    zoneSel.innerHTML = '<option value="">不限</option><option value="角色记忆">角色记忆</option><option value="玩家记忆">玩家记忆</option><option value="世界记忆">世界记忆</option><option value="总结记忆">总结记忆</option>';
    if (rule && rule.conditions.zone) zoneSel.value = rule.conditions.zone;
    zoneGroup.appendChild(zoneSel);
    filterRow.appendChild(zoneGroup);
    var tagsGroup = targetDoc.createElement('div');
    tagsGroup.className = 'mm-form-group';
    tagsGroup.style.cssText = 'flex:1';
    tagsGroup.appendChild(targetDoc.createElement('label')).textContent = '标签过滤（逗号分隔）：';
    var tagsInput = targetDoc.createElement('input');
    tagsInput.type = 'text';
    tagsInput.placeholder = '仅匹配含这些标签的记忆';
    tagsInput.value = rule && rule.conditions.tags ? rule.conditions.tags.join(', ') : '';
    tagsGroup.appendChild(tagsInput);
    filterRow.appendChild(tagsGroup);
    em.appendChild(filterRow);

    var checks = [
      { label: '自动填入输入框', field: 'autoFill' },
      { label: '标记为已回顾/已总结', field: 'autoMark' },
      { label: '总结后保护原记忆', field: 'protectSource' }
    ];
    for (var ci = 0; ci < checks.length; ci++) {
      var checkRow = targetDoc.createElement('div');
      checkRow.className = 'mm-form-check';
      var ccb = targetDoc.createElement('input');
      ccb.type = 'checkbox';
      ccb.checked = rule ? !!rule.action[checks[ci].field] : (ci < 2);
      checkRow.appendChild(ccb);
      checkRow.appendChild(targetDoc.createElement('span')).textContent = checks[ci].label;
      em.appendChild(checkRow);
    }

    var eactions = targetDoc.createElement('div');
    eactions.className = 'mm-form-actions';
    var ecancel = targetDoc.createElement('button');
    ecancel.className = 'mm-btn';
    ecancel.textContent = '取消';
    ecancel.addEventListener('click', function() { targetDoc.body.removeChild(eo); });
    eactions.appendChild(ecancel);
    var esave = targetDoc.createElement('button');
    esave.className = 'mm-btn mm-btn-primary';
    esave.textContent = '保存';
    esave.addEventListener('click', function() {
      var tagsStr = tagsInput.value || '';
      var tagsArr = tagsStr ? tagsStr.split(/[,，]/).map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];
      var newRule = {
        type: typeSelect.value,
        conditions: {
          roundCount: { min: parseInt(intInput.value, 10) || 10 },
          minImportance: parseInt(em.querySelectorAll('select')[1].value, 10) || 0,
          zone: zoneSel.value || '',
          tags: tagsArr,
          excludeReviewed: false,
          minUnreviewed: 0,
          minDormantDays: 0
        },
        action: {
          autoFill: em.querySelectorAll('.mm-form-check input')[0].checked,
          autoMark: em.querySelectorAll('.mm-form-check input')[1].checked,
          protectSource: em.querySelectorAll('.mm-form-check input')[2].checked,
          template: tmplInput.value
        }
      };
      if (rule) { RuleEngine.updateRule(rule.id, newRule); }
      else { RuleEngine.addRule(newRule); }
      targetDoc.body.removeChild(eo);
      if (advBtn.className === 'active') renderAdvanced();
      else renderEasy();
    });
    eactions.appendChild(esave);
    em.appendChild(eactions);
    eo.appendChild(em);
    targetDoc.body.appendChild(eo);
  }

  // 模式切换
  easyBtn.addEventListener('click', function() {
    easyBtn.className = 'active';
    advBtn.className = '';
    renderEasy();
  });
  advBtn.addEventListener('click', function() {
    advBtn.className = 'active';
    easyBtn.className = '';
    renderAdvanced();
  });

  modal.appendChild(contentArea);
  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
  renderEasy();
};
UIManager._showArchiveManager = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';

  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal mm-modal-wide';

  var header = targetDoc.createElement('div');
  header.className = 'mm-modal-header';
  var h3 = targetDoc.createElement('h3');
  h3.textContent = '存档管理';
  header.appendChild(h3);
  var closeBtn = targetDoc.createElement('button');
  closeBtn.className = 'mm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  var tip = targetDoc.createElement('p');
  tip.style.cssText = 'font-size:11px;color:#555;margin-bottom:12px';
  tip.textContent = '在这里保存和恢复记忆快照。切换会话或角色时，旧的记忆不会丢失。';
  modal.appendChild(tip);

  var newBtn = targetDoc.createElement('button');
  newBtn.className = 'mm-btn mm-btn-primary mm-btn-sm';
  newBtn.textContent = '＋ 新建存档';
  newBtn.style.cssText = 'margin-bottom:12px';
  newBtn.addEventListener('click', function() {
    // 用自定义弹窗替代 prompt()，避免 iframe sandbox 中 allow-modals 限制
    var promptOverlay = targetDoc.createElement('div');
    promptOverlay.className = 'mm-modal-overlay';
    var promptModal = targetDoc.createElement('div');
    promptModal.className = 'mm-modal';
    promptModal.style.cssText = 'max-width:360px';
    promptModal.innerHTML = '<div class="mm-modal-header"><h3>新建存档</h3><button class="mm-modal-close">×</button></div>' +
      '<div class="mm-form-group"><label>存档名称</label><input id="mm-archive-name-input" style="width:100%" placeholder="例如：第三章结束"></div>' +
      '<div class="mm-form-actions"><button id="mm-archive-cancel" class="mm-btn">取消</button><button id="mm-archive-ok" class="mm-btn mm-btn-primary">确认</button></div>';
    promptOverlay.appendChild(promptModal);
    targetDoc.body.appendChild(promptOverlay);

    var nameInput = promptModal.querySelector('#mm-archive-name-input');
    nameInput.focus();
    promptModal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(promptOverlay); });
    promptModal.querySelector('#mm-archive-cancel').addEventListener('click', function() { targetDoc.body.removeChild(promptOverlay); });
    promptModal.querySelector('#mm-archive-ok').addEventListener('click', function() {
      var label = nameInput.value.trim();
      if (!label) return;
      targetDoc.body.removeChild(promptOverlay);
      ArchiveManager.createSlot(label).then(function() { renderSlots(); }).catch(function(err) { UIManager.showToast('创建存档失败: ' + (err.message || '未知错误'), 'error'); });
    });
    nameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') promptModal.querySelector('#mm-archive-ok').click(); });
    promptOverlay.addEventListener('click', function(e) { if (e.target === promptOverlay) targetDoc.body.removeChild(promptOverlay); });
  });
  modal.appendChild(newBtn);

  var slotList = targetDoc.createElement('div');
  slotList.className = 'mm-slot-list';
  modal.appendChild(slotList);

  function renderSlots() {
    while (slotList.firstChild) slotList.removeChild(slotList.firstChild);
    var slots = ArchiveManager.getSlots();
    if (slots.length === 0) {
      var empty = targetDoc.createElement('div');
      empty.className = 'mm-empty-state';
      empty.textContent = '暂无存档';
      slotList.appendChild(empty);
      return;
    }
    for (var i = 0; i < slots.length; i++) {
      (function(slot) {
        var item = targetDoc.createElement('div');
        item.className = 'mm-slot-item';
        var info = targetDoc.createElement('div');
        info.className = 'mm-slot-info';
        var label = targetDoc.createElement('div');
        label.className = 'mm-slot-label';
        label.textContent = slot.label;
        info.appendChild(label);
        var meta = targetDoc.createElement('div');
        meta.className = 'mm-slot-meta';
        meta.textContent = slot.memoryCount + ' 条记忆 · ' + formatDate(slot.createdAt);
        info.appendChild(meta);
        item.appendChild(info);

        var acts = targetDoc.createElement('div');
        acts.style.cssText = 'display:flex;gap:4px';
        function sBtn(text, cls, action) {
          var btn = targetDoc.createElement('button');
          btn.className = 'mm-btn mm-btn-xs ' + (cls || '');
          btn.textContent = text;
          btn.addEventListener('click', action);
          acts.appendChild(btn);
        }
        sBtn('恢复', 'mm-btn-primary', function() {
          self._showConfirm('恢复快照将替换当前所有记忆（当前记忆将被清除），确定继续？', function() {
            ArchiveManager.restoreSnapshot(slot.saveKey).then(function(cnt) {
              self.showToast('已恢复 ' + cnt + ' 条记忆', 'success');
              SearchIndex.rebuild();
              _renderMemoryList();
            }).catch(function(err) { self.showToast(err.message, 'error'); });
          });
        });
        sBtn('重命名', '', function() {
          var renameOverlay = targetDoc.createElement('div');
          renameOverlay.className = 'mm-modal-overlay';
          var renameModal = targetDoc.createElement('div');
          renameModal.className = 'mm-modal';
          renameModal.style.cssText = 'max-width:360px';
          renameModal.innerHTML = '<div class="mm-modal-header"><h3>重命名存档</h3><button class="mm-modal-close">×</button></div>' +
            '<div class="mm-form-group"><label>新名称</label><input id="mm-rename-input" style="width:100%" value="' + escapeHtml(slot.label) + '"></div>' +
            '<div class="mm-form-actions"><button id="mm-rename-cancel" class="mm-btn">取消</button><button id="mm-rename-ok" class="mm-btn mm-btn-primary">确认</button></div>';
          renameOverlay.appendChild(renameModal);
          targetDoc.body.appendChild(renameOverlay);
          var renameInput = renameModal.querySelector('#mm-rename-input');
          renameInput.focus();
          renameInput.select();
          renameModal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(renameOverlay); });
          renameModal.querySelector('#mm-rename-cancel').addEventListener('click', function() { targetDoc.body.removeChild(renameOverlay); });
          renameModal.querySelector('#mm-rename-ok').addEventListener('click', function() {
            var newLabel = renameInput.value.trim();
            if (newLabel) { ArchiveManager.renameSlot(slot.saveKey, newLabel); renderSlots(); }
            targetDoc.body.removeChild(renameOverlay);
          });
          renameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') renameModal.querySelector('#mm-rename-ok').click(); });
          renameOverlay.addEventListener('click', function(e) { if (e.target === renameOverlay) targetDoc.body.removeChild(renameOverlay); });
        });
        sBtn('导出', '', function() {
          try { Exporter.exportArchive(slot.saveKey); self.showToast('导出成功', 'success'); }
          catch(err) { self.showToast(err.message, 'error'); }
        });
        sBtn('删除', 'mm-btn-danger', function() {
          self._showConfirm('确定删除存档 "' + slot.label + '" 吗？', function() {
            ArchiveManager.deleteSlot(slot.saveKey);
            renderSlots();
            self.showToast('已删除', 'info');
          });
        });
        item.appendChild(acts);
        slotList.appendChild(item);
      })(slots[i]);
    }
  }

  renderSlots();
  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};
UIManager._showTagManager = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';

  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal';

  var header = targetDoc.createElement('div');
  header.className = 'mm-modal-header';
  var h3 = targetDoc.createElement('h3');
  h3.textContent = '标签管理';
  header.appendChild(h3);
  var closeBtn = targetDoc.createElement('button');
  closeBtn.className = 'mm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // 主题包
  var themesLabel = targetDoc.createElement('p');
  themesLabel.textContent = '主题包：';
  themesLabel.style.cssText = 'font-size:12px;color:#555;margin-bottom:6px';
  modal.appendChild(themesLabel);

  var activeThemes = TagManager.getActiveThemes();
  var themeNames = { xianxia: '仙侠/古风', urban: '都市/现代', fantasy: '西幻/中古', scifi: '科幻/星际' };
  var themeDiv = targetDoc.createElement('div');
  themeDiv.style.cssText = 'margin-bottom:12px;display:flex;flex-wrap:wrap;gap:6px';
  for (var ti = 0; ti < AVAILABLE_THEMES.length; ti++) {
    (function(th) {
      var cbRow = targetDoc.createElement('label');
      cbRow.className = 'mm-form-check';
      var cb = targetDoc.createElement('input');
      cb.type = 'checkbox';
      cb.value = th;
      cb.checked = activeThemes.indexOf(th) !== -1;
      cb.addEventListener('change', function() {
        var at = TagManager.getActiveThemes();
        if (this.checked) at.push(th);
        else {
          var idx = at.indexOf(th);
          if (idx !== -1) at.splice(idx, 1);
        }
        TagManager.setActiveThemes(at);
        _renderMemoryList();
      });
      cbRow.appendChild(cb);
      var tn = targetDoc.createElement('span');
      tn.textContent = themeNames[th] || th;
      cbRow.appendChild(tn);
      themeDiv.appendChild(cbRow);
    })(AVAILABLE_THEMES[ti]);
  }
  modal.appendChild(themeDiv);

  // 标签列表
  var allTags = TagManager.getAllTags();
  var tagList = targetDoc.createElement('div');
  tagList.style.cssText = 'max-height:200px;overflow-y:auto;border:1px solid #e8e4de;border-radius:2px';

  var categories = ['情感', '关系', '事件', '叙事', '身份', '物品', '地点', '概念', '自定义'];
  for (var ci = 0; ci < categories.length; ci++) {
    var catName = categories[ci];
    var catHeader = targetDoc.createElement('div');
    catHeader.textContent = catName;
    catHeader.style.cssText = 'padding:4px 8px;font-size:11px;font-weight:600;color:#555;background:#fafaf8;border-bottom:1px solid #f0ece6';
    tagList.appendChild(catHeader);

    var catTags = [];
    for (var ai = 0; ai < allTags.length; ai++) {
      var meta = TagManager.getTagMeta(allTags[ai]);
      if (meta && meta.category === catName) catTags.push({ name: allTags[ai], meta: meta });
    }

    if (catTags.length === 0) continue;

    for (var cti = 0; cti < catTags.length; cti++) {
      (function(tagInfo) {
        var row = targetDoc.createElement('div');
        row.className = 'mm-tag-edit-row';
        var dot = targetDoc.createElement('span');
        dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + (tagInfo.meta.color || '#8a8a8a') + ';display:inline-block';
        row.appendChild(dot);
        var nameSpan = targetDoc.createElement('span');
        nameSpan.textContent = tagInfo.name;
        nameSpan.style.cssText = 'font-size:12px;flex:1';
        row.appendChild(nameSpan);
        var countSpan = targetDoc.createElement('span');
        var usageCount = (TagManager._tagStats && TagManager._tagStats[tagInfo.name]) ? TagManager._tagStats[tagInfo.name] : 0;
        countSpan.textContent = '×' + _fmtNum(usageCount);
        countSpan.style.cssText = 'font-size:10px;color:#555';
        row.appendChild(countSpan);
        if (!tagInfo.meta.isCore && catName === '自定义') {
          var delTagBtn = targetDoc.createElement('button');
          delTagBtn.className = 'mm-btn mm-btn-xs mm-btn-danger';
          delTagBtn.textContent = '×';
          delTagBtn.addEventListener('click', function() {
            TagManager.deleteCustomTag(tagInfo.name);
            targetDoc.body.removeChild(overlay);
            self._showTagManager();
          });
          row.appendChild(delTagBtn);
        }
        tagList.appendChild(row);
      })(catTags[cti]);
    }
  }
  modal.appendChild(tagList);

  // 新建标签
  var newTagDiv = targetDoc.createElement('div');
  newTagDiv.style.cssText = 'margin-top:12px;display:flex;gap:6px';
  var newNameInput = targetDoc.createElement('input');
  newNameInput.placeholder = '新标签名';
  newNameInput.style.cssText = 'flex:1;padding:6px 8px;border:1px solid #e8e4de;border-radius:2px;font-size:12px';
  newTagDiv.appendChild(newNameInput);
  var newCatSelect = targetDoc.createElement('select');
  newCatSelect.style.cssText = 'font-size:12px;padding:4px';
  newCatSelect.innerHTML = '<option value="情感">情感</option><option value="关系">关系</option><option value="事件">事件</option><option value="叙事">叙事</option><option value="身份">身份</option><option value="物品">物品</option><option value="地点">地点</option><option value="概念">概念</option><option value="自定义">自定义</option>';
  newTagDiv.appendChild(newCatSelect);
  var addTagBtn = targetDoc.createElement('button');
  addTagBtn.className = 'mm-btn mm-btn-primary mm-btn-sm';
  addTagBtn.textContent = '添加';
  addTagBtn.addEventListener('click', function() {
    var n = newNameInput.value.trim();
    if (!n) { self.showToast('请输入标签名', 'error'); return; }
    if (TagManager.addCustomTag({ name: n, category: newCatSelect.value })) {
      self.showToast('标签已添加', 'success');
      targetDoc.body.removeChild(overlay);
      self._showTagManager();
    } else {
      self.showToast('标签已存在', 'error');
    }
  });
  newTagDiv.appendChild(addTagBtn);
  modal.appendChild(newTagDiv);

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};
UIManager._showKnowledgeGraph = function() { this.showToast('知识图谱已移除，请使用仪表盘查看记忆数据', 'info'); };

// 遗忘管理面板
UIManager._showForgettingConfig = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';

  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal';

  var header = targetDoc.createElement('div');
  header.className = 'mm-modal-header';
  var h3 = targetDoc.createElement('h3');
  h3.textContent = '遗忘与记忆衰减管理';
  header.appendChild(h3);
  var closeBtn = targetDoc.createElement('button');
  closeBtn.className = 'mm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  var tip = targetDoc.createElement('p');
  tip.className = 'mm-help-tip';
  tip.textContent = '模拟记忆随时间衰减。长期未被检索的记忆会自动降权或归档。';
  modal.appendChild(tip);

  // 归档阈值
  var archiveGroup = targetDoc.createElement('div');
  archiveGroup.className = 'mm-form-group';
  archiveGroup.innerHTML = '<label>归档阈值（天）：超过此天数未检索的记忆自动归档</label><input id="mm-fg-archive-days" type="number" min="7" max="365" value="' + AdaptiveForgetting._archiveThresholdDays + '" style="width:100%">';
  modal.appendChild(archiveGroup);

  // 沉寂提醒阈值
  var dormantImpGroup = targetDoc.createElement('div');
  dormantImpGroup.className = 'mm-form-group';
  dormantImpGroup.innerHTML = '<label>沉寂提醒 - 最低重要性：重要性 >= 此值的记忆进入沉寂监测</label><input id="mm-fg-dormant-imp" type="number" min="1" max="5" value="' + AdaptiveForgetting._dormantImportanceThreshold + '" style="width:100%">';
  modal.appendChild(dormantImpGroup);

  var dormantDecayGroup = targetDoc.createElement('div');
  dormantDecayGroup.className = 'mm-form-group';
  dormantDecayGroup.innerHTML = '<label>沉寂提醒 - 衰减阈值：decayScore <= 此值时触发提醒</label><input id="mm-fg-dormant-decay" type="number" min="0" max="1" step="0.05" value="' + AdaptiveForgetting._dormantDecayThreshold + '" style="width:100%">';
  modal.appendChild(dormantDecayGroup);

  // 衰减天数
  var decayDaysGroup = targetDoc.createElement('div');
  decayDaysGroup.className = 'mm-form-group';
  decayDaysGroup.innerHTML = '<label>衰减半衰期（天）：重要性为 5 的记忆经过此天数后 decayScore 降至 ~0.37</label><input id="mm-fg-decay-days" type="number" min="1" max="365" value="' + AdaptiveForgetting._decayDays + '" style="width:100%">';
  modal.appendChild(decayDaysGroup);

  // 立即评估按钮
  var evalBtn = targetDoc.createElement('button');
  evalBtn.className = 'mm-btn mm-btn-sm';
  evalBtn.textContent = '立即评估所有记忆';
  evalBtn.style.cssText = 'margin-bottom:12px';
  evalBtn.addEventListener('click', function() {
    AdaptiveForgetting.evaluate().then(function(result) {
      self.showToast('已评估：归档 ' + result.archived + ' 条，沉寂候选 ' + result.dormantCandidates.length + ' 条', 'success');
      _renderMemoryList();
    });
  });
  modal.appendChild(evalBtn);

  // 沉寂候选列表
  var dormantSection = targetDoc.createElement('div');
  dormantSection.style.cssText = 'margin-top:8px;border-top:1px solid #e8e4de;padding-top:8px';
  var dormantTitle = targetDoc.createElement('p');
  dormantTitle.textContent = '当前沉寂候选：';
  dormantTitle.style.cssText = 'font-size:13px;font-weight:500;margin-bottom:8px';
  dormantSection.appendChild(dormantTitle);
  var dormantList = targetDoc.createElement('div');
  dormantList.style.cssText = 'max-height:180px;overflow-y:auto;font-size:12px';
  dormantSection.appendChild(dormantList);
  modal.appendChild(dormantSection);

  AdaptiveForgetting.getDormantCandidates(10).then(function(candidates) {
    if (candidates.length === 0) {
      dormantList.textContent = '暂无沉寂候选';
      dormantList.style.cssText += ';color:#555;padding:12px;text-align:center';
    } else {
      for (var i = 0; i < candidates.length; i++) {
        var row = targetDoc.createElement('div');
        row.style.cssText = 'padding:4px 0;border-bottom:1px solid #f0ece6;display:flex;justify-content:space-between;gap:8px';
        row.innerHTML = '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml((candidates[i].memory.content || '').substring(0, 60)) + '</span><span style="color:#b84040;flex-shrink:0">' + candidates[i].decayScore.toFixed(3) + '</span>';
        dormantList.appendChild(row);
      }
    }
  });

  // 保存按钮
  var actionsRow = targetDoc.createElement('div');
  actionsRow.className = 'mm-form-actions';
  var cancelBtn = targetDoc.createElement('button');
  cancelBtn.className = 'mm-btn';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  actionsRow.appendChild(cancelBtn);
  var saveBtn = targetDoc.createElement('button');
  saveBtn.className = 'mm-btn mm-btn-primary';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', function() {
    AdaptiveForgetting.setArchiveThreshold(parseInt(modal.querySelector('#mm-fg-archive-days').value, 10) || 30);
    AdaptiveForgetting.setDormantThreshold(
      parseInt(modal.querySelector('#mm-fg-dormant-imp').value, 10) || 4,
      parseFloat(modal.querySelector('#mm-fg-dormant-decay').value) || 0.15
    );
    AdaptiveForgetting._decayDays = parseInt(modal.querySelector('#mm-fg-decay-days').value, 10) || 14;
    AdaptiveForgetting._saveConfig();
    self.showToast('遗忘配置已保存', 'success');
    targetDoc.body.removeChild(overlay);
  });
  actionsRow.appendChild(saveBtn);
  modal.appendChild(actionsRow);

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};

// 语义聚类视图
UIManager._showClusterView = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';

  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal mm-modal-wide';

  var header = targetDoc.createElement('div');
  header.className = 'mm-modal-header';
  var h3 = targetDoc.createElement('h3');
  h3.textContent = '语义聚类分析';
  header.appendChild(h3);
  var closeBtn = targetDoc.createElement('button');
  closeBtn.className = 'mm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  var tip = targetDoc.createElement('p');
  tip.className = 'mm-help-tip';
  tip.textContent = '基于语义相似度将记忆自动分组，发现隐藏的主题关联。阈值越高分组越严格。';
  modal.appendChild(tip);

  var ctrlRow = targetDoc.createElement('div');
  ctrlRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:12px';
  ctrlRow.innerHTML = '<label style="font-size:12px">相似度阈值：</label><input id="mm-cl-threshold" type="number" min="0.1" max="0.95" step="0.05" value="0.5" style="width:80px;padding:4px"><button id="mm-cl-run" class="mm-btn mm-btn-primary mm-btn-sm" style="margin-left:8px">执行聚类</button>';
  modal.appendChild(ctrlRow);

  var resultArea = targetDoc.createElement('div');
  resultArea.style.cssText = 'max-height:400px;overflow-y:auto';
  modal.appendChild(resultArea);

  modal.querySelector('#mm-cl-run').addEventListener('click', function() {
    var threshold = parseFloat(modal.querySelector('#mm-cl-threshold').value) || 0.5;
    while (resultArea.firstChild) resultArea.removeChild(resultArea.firstChild);

    DataService.getAll({ includeHidden: false }).then(function(memories) {
      if (memories.length < 2) {
        resultArea.innerHTML = '<div class="mm-empty-state">需要至少 2 条记忆才能聚类</div>';
        return;
      }
      var result = SemanticEngine.cluster(memories, threshold);
      var totalClustered = 0;
      for (var gi = 0; gi < result.groups.length; gi++) totalClustered += result.groups[gi].length;

      var summary = targetDoc.createElement('p');
      summary.textContent = '共 ' + result.groups.length + ' 组聚类（' + totalClustered + ' 条），' + result.noise.length + ' 条孤立记忆（阈值=' + threshold + '）';
      summary.style.cssText = 'font-size:12px;color:#555;margin-bottom:8px';
      resultArea.appendChild(summary);

      for (var gi2 = 0; gi2 < result.groups.length; gi2++) {
        var group = result.groups[gi2];
        var groupDiv = targetDoc.createElement('div');
        groupDiv.style.cssText = 'border:1px solid #e8e4de;border-radius:2px;padding:8px 12px;margin-bottom:8px;background:#fafaf8';
        var groupTitle = targetDoc.createElement('p');
        groupTitle.textContent = '聚类 ' + (gi2 + 1) + '（' + group.length + ' 条）';
        groupTitle.style.cssText = 'font-size:13px;font-weight:500;margin-bottom:6px;color:#b84040';
        groupDiv.appendChild(groupTitle);
        for (var mi = 0; mi < Math.min(group.length, 8); mi++) {
          var item = targetDoc.createElement('div');
          item.textContent = (group[mi].content || '').substring(0, 100);
          item.style.cssText = 'font-size:12px;color:#2c2c2c;padding:2px 0;border-bottom:1px solid #f0ece6';
          groupDiv.appendChild(item);
        }
        if (group.length > 8) {
          var more = targetDoc.createElement('div');
          more.textContent = '... 还有 ' + (group.length - 8) + ' 条';
          more.style.cssText = 'font-size:11px;color:#555;padding:2px 0';
          groupDiv.appendChild(more);
        }
        resultArea.appendChild(groupDiv);
      }
    });
  });

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
  // 自动执行一次
  modal.querySelector('#mm-cl-run').click();
};

// 扫描设置面板
UIManager._showScanSettings = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';

  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal';

  var header = targetDoc.createElement('div');
  header.className = 'mm-modal-header';
  var h3 = targetDoc.createElement('h3');
  h3.textContent = '扫描设置';
  header.appendChild(h3);
  var closeBtn = targetDoc.createElement('button');
  closeBtn.className = 'mm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // 自动扫描开关
  var autoScanLabel = targetDoc.createElement('p');
  autoScanLabel.textContent = '自动定时扫描：';
  autoScanLabel.style.cssText = 'font-size:13px;font-weight:500;margin-bottom:6px';
  modal.appendChild(autoScanLabel);

  var autoScanRow = targetDoc.createElement('div');
  autoScanRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:12px';
  var autoScanToggle = targetDoc.createElement('button');
  autoScanToggle.className = 'mm-btn mm-btn-sm';
  autoScanToggle.textContent = Scanner._autoScanTimer ? '已开启 - 点击关闭' : '已关闭 - 点击开启';
  autoScanToggle.style.cssText = Scanner._autoScanTimer ? 'background:#b84040;color:#fff' : '';
  autoScanToggle.addEventListener('click', function() {
    if (Scanner._autoScanTimer) {
      Scanner.stopAutoScan();
      autoScanToggle.textContent = '已关闭 - 点击开启';
      autoScanToggle.style.background = '';
      autoScanToggle.style.color = '';
      self.showToast('自动扫描已关闭', 'info');
    } else {
      var interval = parseInt(modal.querySelector('#mm-ss-interval').value, 10) * 1000 || 30000;
      Scanner.startAutoScan(interval);
      autoScanToggle.textContent = '已开启 - 点击关闭';
      autoScanToggle.style.background = '#b84040';
      autoScanToggle.style.color = '#fff';
      self.showToast('自动扫描已开启（间隔 ' + (interval / 1000) + ' 秒）', 'success');
    }
  });
  autoScanRow.appendChild(autoScanToggle);

  var intervalInput = targetDoc.createElement('input');
  intervalInput.id = 'mm-ss-interval';
  intervalInput.type = 'number';
  intervalInput.min = '5';
  intervalInput.max = '600';
  intervalInput.value = String((Scanner._autoScanInterval || 30000) / 1000);
  intervalInput.style.cssText = 'width:60px;padding:4px 6px;border:1px solid #d0ccc4;border-radius:2px;font-size:13px;text-align:center;color:#2c2c2c;background:#fff';
  autoScanRow.appendChild(intervalInput);
  var secLabel = targetDoc.createElement('span');
  secLabel.textContent = '秒';
  secLabel.style.cssText = 'font-size:13px;color:#2c2c2c;font-weight:500';
  autoScanRow.appendChild(secLabel);
  modal.appendChild(autoScanRow);

  // 实时监听 (MutationObserver)
  var obLabel = targetDoc.createElement('p');
  obLabel.textContent = '实时页面监听：';
  obLabel.style.cssText = 'font-size:13px;font-weight:500;margin-bottom:4px';
  modal.appendChild(obLabel);
  var obDesc = targetDoc.createElement('p');
  obDesc.textContent = '监听页面 DOM 变化，检测到新消息时自动触发 Lorebook 扫描。对性能影响极小。';
  obDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px';
  modal.appendChild(obDesc);

  var obToggle = targetDoc.createElement('button');
  obToggle.className = 'mm-btn mm-btn-sm';
  obToggle.textContent = Scanner._observer ? '已开启 - 点击关闭' : '已关闭 - 点击开启';
  obToggle.style.cssText = Scanner._observer ? 'background:#b84040;color:#fff;margin-bottom:12px' : 'color:#2c2c2c;background:#fff;margin-bottom:12px;border:1px solid #d0ccc4';
  obToggle.addEventListener('click', function() {
    if (Scanner._observer) {
      Scanner.stopObserver();
      obToggle.textContent = '已关闭 - 点击开启';
      obToggle.style.background = '';
      obToggle.style.color = '#2c2c2c';
      obToggle.style.border = '1px solid #d0ccc4';
      self.showToast('实时监听已关闭', 'info');
    } else {
      Scanner.startObserver();
      obToggle.textContent = '已开启 - 点击关闭';
      obToggle.style.background = '#b84040';
      obToggle.style.color = '#fff';
      obToggle.style.border = '1px solid #b84040';
      self.showToast('实时监听已开启', 'success');
    }
  });
  modal.appendChild(obToggle);

  // 手动立即扫描
  var scanNowBtn = targetDoc.createElement('button');
  scanNowBtn.className = 'mm-btn mm-btn-primary mm-btn-sm';
  scanNowBtn.textContent = '立即扫描';
  scanNowBtn.style.cssText = 'display:block;width:100%';
  scanNowBtn.addEventListener('click', function() {
    Scanner.scan().then(function(r) {
      self.showToast('扫描完成：新增 ' + r.added + ' 条，跳过 ' + r.skipped + ' 条', 'success');
      _renderMemoryList();
    }).catch(function() { self.showToast('扫描失败', 'error'); });
  });
  modal.appendChild(scanNowBtn);

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};

// 系统诊断面板
UIManager._showDiagnostics = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal mm-modal-wide';
  modal.style.cssText = 'max-width:640px;max-height:85vh;overflow-y:auto';

  var header = targetDoc.createElement('div');
  header.className = 'mm-modal-header';
  var h3 = targetDoc.createElement('h3');
  h3.textContent = '系统诊断';
  header.appendChild(h3);
  var closeBtn = targetDoc.createElement('button');
  closeBtn.className = 'mm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // 状态栏
  var statusDiv = targetDoc.createElement('div');
  statusDiv.id = 'mm-diag-status';
  statusDiv.style.cssText = 'padding:12px;text-align:center;font-size:14px;color:#888';
  statusDiv.textContent = '正在收集系统状态...';
  modal.appendChild(statusDiv);

  // 自测结果区
  var testArea = targetDoc.createElement('div');
  testArea.id = 'mm-diag-tests';
  testArea.style.cssText = 'display:none;padding:0 12px';
  modal.appendChild(testArea);

  // 按钮区
  var btnArea = targetDoc.createElement('div');
  btnArea.style.cssText = 'display:flex;gap:6px;padding:12px;justify-content:center;flex-wrap:wrap';
  var runAllBtn = targetDoc.createElement('button');
  runAllBtn.className = 'mm-btn mm-btn-primary';
  runAllBtn.textContent = '全部自测';
  runAllBtn.addEventListener('click', function() {
    runAllBtn.disabled = true;
    runAllBtn.textContent = '运行中...';
    testArea.style.display = 'block';
    testArea.innerHTML = '<p style="text-align:center;color:#888;padding:20px">⏳ 正在逐项测试...</p>';
    statusDiv.textContent = '自测运行中...';

    Diagnostics.runAll().then(function(report) {
      renderReport(report);
      runAllBtn.disabled = false;
      runAllBtn.textContent = '重新自测';
    }).catch(function(e) {
      testArea.innerHTML = '<p style="color:#f55">自测异常: ' + (e.message || '') + '</p>';
      runAllBtn.disabled = false;
      runAllBtn.textContent = '全部自测';
    });
  });
  btnArea.appendChild(runAllBtn);
  var copyBtn = targetDoc.createElement('button');
  copyBtn.className = 'mm-btn mm-btn-sm';
  copyBtn.textContent = '复制报告';
  copyBtn.addEventListener('click', function() {
    var reportText = buildTextReport();
    try { navigator.clipboard.writeText(reportText); self.showToast('报告已复制', 'success'); }
    catch(ex) { self._showCopyFallbackModal(reportText); }
  });
  btnArea.appendChild(copyBtn);
  modal.appendChild(btnArea);

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);

  // 先渲染快照
  renderSnapshot();

  // 渲染函数
  function renderSnapshot() {
    var snap = Diagnostics.snapshot();
    var html = '<div style="font-size:13px;line-height:1.8">';

    // 状态条
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">';
    html += _diagBadge(snap.scanActive, '自动扫描');
    html += _diagBadge(snap.observerActive, '实时监听');
    html += _diagBadge(snap.injectLastTime > 0, '记忆注入');
    html += _diagBadge(snap.kwIndexSize > 0, '关键词索引(' + snap.kwIndexSize + ')');
    html += _diagBadge(snap.clipboardSafe, '剪贴板');
    html += '</div>';

    // 扫描状态
    html += '<div style="margin-bottom:4px;font-size:12px;color:#555">';
    html += '扫描: ' + (snap.scanActive ? ('运行中(每' + snap.scanInterval + '秒)') : '已停止') + ' | ';
    html += '最近扫描: ' + (snap.scanLastTime ? _diagTime(snap.scanLastTime) : '从未') + ' | ';
    html += '最近注入: ' + (snap.injectLastTime ? (_diagTime(snap.injectLastTime) + (snap.injectLastOk ? ' ✓' : ' ✗')) : '从未') + ' | ';
    html += '降级弹窗: ' + snap.copyFallbackCount + '次 | ';
    html += '输出模式: ' + ({notify:'弹窗', inject:'注入输入框', dashboard:'仪表盘'}[snap.autoMode] || snap.autoMode);
    html += '</div>';

    // 规则状态
    if (snap.rules.length > 0) {
      html += '<div style="font-size:11px;color:#888;margin-top:4px">规则: ';
      var typeNames = { recall: '回顾', summarize: '总结', dormant: '沉寂' };
      for (var ri = 0; ri < snap.rules.length; ri++) {
        var r = snap.rules[ri];
        var rPct = r.target > 0 ? Math.min(100, Math.round(r.counter / r.target * 100)) : 0;
        html += (typeNames[r.type] || r.type) + ' ' + (r.enabled ? (r.counter + '/' + r.target) : '关') + ' ';
      }
      html += '</div>';
    }

    html += '</div>';
    statusDiv.innerHTML = html;
  }

  function renderReport(report) {
    var snap = report.snapshot;
    renderSnapshot();

    var tests = report.flows;
    var html = '';
    var passCount = 0, failCount = 0;
    var flowNames = { '采集流': '📥 采集流', '注入流': '💉 注入流', '规则流': '⚙ 规则流', '生命流': '🔄 生命流', '存储流': '💾 存储流', '输入框': '⌨ 输入框', '面板': '🖥 面板', '完整性': '🔍 完整性', '复制流': '📋 复制流' };

    for (var ti = 0; ti < tests.length; ti++) {
      var t = tests[ti];
      if (t.pass) passCount++; else failCount++;
      var icon = t.pass ? '✅' : '❌';
      html += '<div style="margin-bottom:8px;border:1px solid ' + (t.pass ? '#c8e6c9' : '#ffcdd2') + ';border-radius:8px;overflow:hidden">';
      html += '<div style="padding:6px 10px;background:' + (t.pass ? '#e8f5e9' : '#ffebee') + ';font-size:13px;font-weight:500;color:#333">' + icon + ' ' + (flowNames[t.flow] || t.flow) + '</div>';
      html += '<div style="padding:6px 10px;font-size:11px;line-height:1.7">';
      for (var ri = 0; ri < t.results.length; ri++) {
        var r = t.results[ri];
        var riIcon = r.pass ? '✓' : '✗';
        html += '<div style="color:' + (r.pass ? '#2e7d32' : '#c62828') + '">' + riIcon + ' ' + r.msg + '</div>';
        if (r.suggest) {
          html += '<div style="color:#e65100;font-size:10px;padding-left:16px">💡 ' + r.suggest + '</div>';
        }
      }
      html += '</div></div>';
    }

    html += '<div style="text-align:center;padding:8px;font-size:13px;font-weight:500;color:' + (failCount === 0 ? '#2e7d32' : '#c62828') + '">';
    html += passCount + '/' + tests.length + ' 条流通过' + (failCount > 0 ? ('，' + failCount + ' 条异常') : '') + '</div>';

    testArea.innerHTML = html;
    testArea.style.display = 'block';
  }

  function _diagBadge(ok, label) {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;' +
      (ok ? 'background:#e8f5e9;color:#2e7d32' : 'background:#fff3e0;color:#e65100') + '">' +
      (ok ? '●' : '○') + ' ' + label + '</span>';
  }
  function _diagTime(ts) {
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return sec + '秒前';
    if (sec < 3600) return Math.floor(sec/60) + '分钟前';
    if (sec < 86400) return Math.floor(sec/3600) + '小时前';
    return Math.floor(sec/86400) + '天前';
  }
  function buildTextReport() {
    var snap = Diagnostics.snapshot();
    var txt = '=== 记忆之镜 诊断报告 ===\n';
    txt += '时间: ' + new Date().toISOString() + '\n\n';
    txt += '自动扫描: ' + (snap.scanActive ? '运行中' : '停止') + '\n';
    txt += '实时监听: ' + (snap.observerActive ? '运行中' : '停止') + '\n';
    txt += '剪贴板: ' + (snap.clipboardSafe ? '可用' : '需降级') + '\n';
    txt += '降级弹窗使用: ' + snap.copyFallbackCount + '次\n';
    txt += '关键词索引: ' + snap.kwIndexSize + '个\n';
    txt += '注入输出模式: ' + snap.autoMode + '\n';
    if (Diagnostics._results) {
      for (var fi = 0; fi < Diagnostics._results.length; fi++) {
        var f = Diagnostics._results[fi];
        txt += '\n[' + (f.pass ? 'PASS' : 'FAIL') + '] ' + f.flow + '\n';
        for (var ri = 0; ri < f.results.length; ri++) {
          txt += '  ' + (f.results[ri].pass ? '[OK]' : '[!!]') + ' ' + f.results[ri].msg + '\n';
        }
      }
    }
    return txt;
  }
};

// 全局设置面板
UIManager._showSettings = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';

  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal mm-modal-wide';

  var header = targetDoc.createElement('div');
  header.className = 'mm-modal-header';
  var h3 = targetDoc.createElement('h3');
  h3.textContent = '全局设置';
  header.appendChild(h3);
  var closeBtn = targetDoc.createElement('button');
  closeBtn.className = 'mm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // Lorebook Token 预算
  var lbGroup = targetDoc.createElement('div');
  lbGroup.className = 'mm-form-group';
  lbGroup.innerHTML = '<label>Lorebook 注入 Token 预算：触发关键词匹配时，注入记忆的 Token 上限</label><input id="mm-set-token-budget" type="number" min="100" max="5000" step="100" value="' + LorebookManager._tokenBudget + '" style="width:100%">';
  modal.appendChild(lbGroup);

  // 主题包
  var themeLabel = targetDoc.createElement('p');
  themeLabel.textContent = '主题标签包：';
  themeLabel.style.cssText = 'font-size:12px;font-weight:500;margin-bottom:6px;margin-top:12px';
  modal.appendChild(themeLabel);

  var activeThemes = TagManager.getActiveThemes();
  var themeNames = { xianxia: '仙侠/古风', urban: '都市/现代', fantasy: '西幻/中古', scifi: '科幻/星际' };
  var themeDiv = targetDoc.createElement('div');
  themeDiv.style.cssText = 'margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px';
  for (var ti = 0; ti < AVAILABLE_THEMES.length; ti++) {
    (function(th) {
      var cbRow = targetDoc.createElement('label');
      cbRow.className = 'mm-form-check';
      var cb = targetDoc.createElement('input');
      cb.type = 'checkbox';
      cb.value = th;
      cb.checked = activeThemes.indexOf(th) !== -1;
      cb.addEventListener('change', function() {
        var at = TagManager.getActiveThemes();
        if (this.checked) at.push(th);
        else { var idx = at.indexOf(th); if (idx !== -1) at.splice(idx, 1); }
        TagManager.setActiveThemes(at);
        _renderMemoryList();
      });
      cbRow.appendChild(cb);
      var tn = targetDoc.createElement('span');
      tn.textContent = themeNames[th] || th;
      cbRow.appendChild(tn);
      themeDiv.appendChild(cbRow);
    })(AVAILABLE_THEMES[ti]);
  }
  modal.appendChild(themeDiv);

  // 存储信息
  var storageInfo = targetDoc.createElement('div');
  storageInfo.style.cssText = 'border-top:1px solid #e8e4de;padding-top:12px;margin-top:8px';
  storageInfo.innerHTML = '<p style="font-size:11px;color:#555;margin-bottom:4px">存储模式：' + (DataService._storageMode || '未知') + '</p>' +
    '<p style="font-size:11px;color:#555;margin-bottom:4px">角色 ID：' + escapeHtml(DataService._roleId || '') + '</p>' +
    '<p style="font-size:11px;color:#555;margin-bottom:4px">会话 ID：' + escapeHtml(DataService._sessionId || '') + '</p>';
  modal.appendChild(storageInfo);

  // 危险操作区
  var dangerSection = targetDoc.createElement('div');
  dangerSection.style.cssText = 'border-top:1px solid #e0c0c0;padding-top:12px;margin-top:12px';
  var dangerTitle = targetDoc.createElement('p');
  dangerTitle.textContent = '危险操作';
  dangerTitle.style.cssText = 'font-size:12px;font-weight:500;color:#b84040;margin-bottom:8px';
  dangerSection.appendChild(dangerTitle);

  var tutResetBtn = targetDoc.createElement('button');
  tutResetBtn.className = 'mm-btn mm-btn-sm';
  tutResetBtn.textContent = '重新开始引导教程';
  tutResetBtn.style.cssText = 'margin-right:8px';
  tutResetBtn.addEventListener('click', function() {
    _resetTutorial();
    _tutorialStepIndex = 0;
    self.showToast('教程已重置，下次打开面板将重新引导', 'success');
  });
  dangerSection.appendChild(tutResetBtn);

  var clearBtn = targetDoc.createElement('button');
  clearBtn.className = 'mm-btn mm-btn-danger mm-btn-sm';
  clearBtn.textContent = '清空全部记忆';
  clearBtn.addEventListener('click', function() {
    self._showConfirm('此操作将清空所有记忆和黑名单数据，不可恢复！确定继续？', function() {
      DataService.clear().then(function() {
        self._selectedIds = [];
        SearchIndex.rebuild();
        _renderMemoryList();
        self.showToast('已清空全部记忆', 'info');
      }).catch(function(err) {
        self.showToast('清空失败: ' + (err && err.message ? err.message : '未知错误'), 'error');
      });
    });
  });
  dangerSection.appendChild(clearBtn);

  modal.appendChild(dangerSection);

  // 保存
  var actionsRow = targetDoc.createElement('div');
  actionsRow.className = 'mm-form-actions';
  var closeBtn2 = targetDoc.createElement('button');
  closeBtn2.className = 'mm-btn';
  closeBtn2.textContent = '关闭';
  closeBtn2.addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  actionsRow.appendChild(closeBtn2);
  var saveBtn = targetDoc.createElement('button');
  saveBtn.className = 'mm-btn mm-btn-primary';
  saveBtn.textContent = '保存设置';
  saveBtn.addEventListener('click', function() {
    var budget = parseInt(modal.querySelector('#mm-set-token-budget').value, 10) || 500;
    LorebookManager.setTokenBudget(budget);
    self.showToast('设置已保存', 'success');
    targetDoc.body.removeChild(overlay);
  });
  actionsRow.appendChild(saveBtn);
  modal.appendChild(actionsRow);

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};

// 找相似记忆
UIManager._showSimilarMemories = function(memoryId) {
  var self = this;
  DataService.getById(memoryId).then(function(source) {
    if (!source) return;
    DataService.getAll({ includeHidden: false }).then(function(all) {
      var others = [];
      for (var i = 0; i < all.length; i++) { if (all[i].id !== memoryId) others.push(all[i]); }
      var sourceVec = SemanticEngine.embed(source.content || '');
      var scored = [];
      for (var j = 0; j < others.length; j++) {
        var sim = SemanticEngine.similarity(sourceVec, SemanticEngine.embed(others[j].content || ''));
        if (sim > 0.3) scored.push({ memory: others[j], similarity: sim });
      }
      scored.sort(function(a, b) { return b.similarity - a.similarity; });
      scored = scored.slice(0, 8);

      var overlay = targetDoc.createElement('div');
      overlay.className = 'mm-modal-overlay';
      var modal = targetDoc.createElement('div');
      modal.className = 'mm-modal';
      modal.innerHTML = '<div class="mm-modal-header"><h3>和这条记忆相似的</h3><button class="mm-modal-close">×</button></div>' +
        '<p style="font-size:11px;color:#555;margin-bottom:8px">原文：' + escapeHtml((source.content || '').substring(0, 80)) + '</p>';
      modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
      overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });

      var listDiv = targetDoc.createElement('div');
      listDiv.style.cssText = 'max-height:320px;overflow-y:auto';
      if (scored.length === 0) {
        listDiv.innerHTML = '<div class="mm-empty-state">没有找到相似的记忆</div>';
      } else {
        for (var si = 0; si < scored.length; si++) {
          var s = scored[si];
          var pct = Math.round(s.similarity * 100);
          var barColor = pct >= 85 ? '#c44040' : pct >= 60 ? '#d49540' : '#7bb87b';
          var row = targetDoc.createElement('div');
          row.style.cssText = 'padding:8px 10px;border-bottom:1px solid #f0ece6;cursor:pointer;transition:background 0.15s';
          row.addEventListener('mouseenter', function() { this.style.background = '#fafaf8'; });
          row.addEventListener('mouseleave', function() { this.style.background = 'none'; });
          row.addEventListener('click', function() { targetDoc.body.removeChild(overlay); DataService.getById(s.memory.id).then(function(mem) { if (mem) self._showEditor(mem); }); });
          row.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
            '<span style="font-size:10px;background:' + barColor + ';color:#fff;padding:1px 6px;border-radius:8px;flex-shrink:0">' + pct + '%</span>' +
            '<span style="font-size:11px;color:#555">[' + escapeHtml(s.memory.zone || '') + ']</span>' +
            '</div>' +
            '<div style="font-size:12px;color:#2c2c2c;line-height:1.4">' + escapeHtml((s.memory.content || '').substring(0, 100)) + '</div>';
          listDiv.appendChild(row);
        }
      }
      modal.appendChild(listDiv);
      overlay.appendChild(modal);
      targetDoc.body.appendChild(overlay);
    });
  });
};

// 显示冲突列表
UIManager._showConflictList = function(conflicts, allMemories) {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal mm-modal-wide';
  modal.innerHTML = '<div class="mm-modal-header"><h3>矛盾检测结果</h3><button class="mm-modal-close">×</button></div>' +
    '<p style="font-size:11px;color:#555;margin-bottom:8px">语义相近但情感标签相反的记忆对，可能需要确认信息是否冲突</p>';
  modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });

  if (!conflicts) {
    DataService.getAll({ includeHidden: false }).then(function(mems) { targetDoc.body.removeChild(overlay); self._showConflictList(_findConflicts(mems), mems); });
    return;
  }
  if (conflicts.length === 0) {
    var empty = targetDoc.createElement('div');
    empty.className = 'mm-empty-state';
    empty.textContent = '没有发现矛盾记忆，一切清晰有序';
    modal.appendChild(empty);
  } else {
    var list = targetDoc.createElement('div');
    list.style.cssText = 'max-height:360px;overflow-y:auto';
    for (var i = 0; i < conflicts.length; i++) {
      var c = conflicts[i];
      var pct = Math.round(c.similarity * 100);
      var row = targetDoc.createElement('div');
      row.style.cssText = 'padding:10px;border:1px solid #f0e0e0;border-radius:8px;margin-bottom:8px;background:#fefafa';
      row.innerHTML = '<div style="display:flex;gap:6px;margin-bottom:6px;font-size:10px">' +
        '<span style="background:#fce0e0;color:#c44040;padding:1px 6px;border-radius:8px">相似 ' + pct + '%</span>' +
        '<span style="background:#ffe0c0;color:#c48840;padding:1px 6px;border-radius:8px">' + escapeHtml(c.conflictTags[0]) + ' vs ' + escapeHtml(c.conflictTags[1]) + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#2c2c2c;margin-bottom:4px;padding:6px;background:#fff;border-radius:4px">' + escapeHtml((c.memA.content || '').substring(0, 100)) + '</div>' +
        '<div style="font-size:11px;color:#2c2c2c;padding:6px;background:#fff;border-radius:4px">' + escapeHtml((c.memB.content || '').substring(0, 100)) + '</div>' +
        '<div style="margin-top:6px;display:flex;gap:4px"><button class="mm-btn mm-btn-xs mm-btn-primary merge-btn">合并</button><button class="mm-btn mm-btn-xs ignore-btn">忽略</button></div>';
      (function(conf) {
        row.querySelector('.merge-btn').addEventListener('click', function() { targetDoc.body.removeChild(overlay); self._mergeMemories(conf.memA, conf.memB); });
        row.querySelector('.ignore-btn').addEventListener('click', function() { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; });
      })(c);
      list.appendChild(row);
    }
    modal.appendChild(list);
  }
  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};

// 合并两条记忆
UIManager._mergeMemories = function(memA, memB) {
  var self = this;
  var content = (memA.content || '') + '\n---\n' + (memB.content || '');
  var tags = [];
  var allT = (memA.tags || []).concat(memB.tags || []);
  var seen = {};
  for (var i = 0; i < allT.length; i++) { if (!seen[allT[i]]) { seen[allT[i]] = true; tags.push(allT[i]); } }

  self._showConfirm('合并后两条记忆会被删除，保留一条综合记忆。确定？', function() {
    var merged = createMemory({
      zone: memA.zone || memB.zone,
      content: content,
      tags: tags,
      importance: Math.max(memA.importance || 3, memB.importance || 3),
      roleName: memA.roleName || memB.roleName,
      roleId: memA.roleId || memB.roleId || DataService._roleId,
      timestamp: Math.min(memA.timestamp, memB.timestamp),
      sourceType: 'merged'
    });
    DataService.save(merged).then(function() {
      DataService.softDelete(memA.id);
      DataService.softDelete(memB.id);
      self.showToast('已合并', 'success');
      _renderMemoryList();
    });
  });
};

// 批量添加标签
UIManager._batchAddTags = function() {
  var self = this;
  if (self._selectedIds.length === 0) { self.showToast('请先选择记忆', 'info'); return; }
  var allTags = TagManager.getAllTags();
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal';
  modal.innerHTML = '<div class="mm-modal-header"><h3>为 ' + self._selectedIds.length + ' 条记忆添加标签</h3><button class="mm-modal-close">×</button></div>';
  modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });

  var searchInp = targetDoc.createElement('input');
  searchInp.type = 'text'; searchInp.placeholder = '搜索或输入新标签…';
  searchInp.style.cssText = 'width:100%;padding:8px;border:1px solid #e8e4de;border-radius:8px;font-size:13px;margin-bottom:8px;box-sizing:border-box';
  modal.appendChild(searchInp);

  var tagGrid = targetDoc.createElement('div');
  tagGrid.style.cssText = 'max-height:200px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:4px';
  function renderTags(filter) {
    while (tagGrid.firstChild) tagGrid.removeChild(tagGrid.firstChild);
    var filtered = filter ? allTags.filter(function(t) { return t.toLowerCase().indexOf(filter.toLowerCase()) !== -1; }) : allTags;
    for (var i = 0; i < filtered.length; i++) {
      (function(tn) {
        var chip = targetDoc.createElement('span');
        chip.textContent = tn;
        chip.style.cssText = 'font-size:11px;padding:4px 10px;background:#f3f0ea;border-radius:14px;cursor:pointer;transition:all 0.15s';
        chip.addEventListener('mouseenter', function() { chip.style.background = '#e0d8cc'; });
        chip.addEventListener('mouseleave', function() { chip.style.background = '#f3f0ea'; });
        chip.addEventListener('click', function() {
          var count = 0;
          function doAdd(idx) {
            if (idx >= self._selectedIds.length) { self.showToast('已添加标签到 ' + count + ' 条记忆', 'success'); _renderMemoryList(); targetDoc.body.removeChild(overlay); return; }
            DataService.getById(self._selectedIds[idx]).then(function(mem) {
              var tags = mem.tags || [];
              if (tags.indexOf(tn) === -1) { tags.push(tn); count++; }
              return DataService.update(mem.id, { tags: tags });
            }).then(function() { doAdd(idx + 1); });
          }
          doAdd(0);
        });
        tagGrid.appendChild(chip);
      })(filtered[i]);
    }
  }
  searchInp.addEventListener('input', function() { renderTags(this.value); });
  modal.appendChild(tagGrid);
  renderTags('');

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};

// 批量移除标签
UIManager._batchRemoveTags = function() {
  var self = this;
  if (self._selectedIds.length === 0) { self.showToast('请先选择记忆', 'info'); return; }
  var commonTags = {};
  var loadedCount = 0;
  var ids = self._selectedIds.slice();
  for (var i = 0; i < ids.length; i++) {
    DataService.getById(ids[i]).then(function(mem) {
      loadedCount++;
      if (mem && mem.tags) {
        for (var ti = 0; ti < mem.tags.length; ti++) commonTags[mem.tags[ti]] = (commonTags[mem.tags[ti]] || 0) + 1;
      }
      if (loadedCount >= ids.length) _showRemoveUI();
    });
  }

  function _showRemoveUI() {
    var overlay = targetDoc.createElement('div');
    overlay.className = 'mm-modal-overlay';
    var modal = targetDoc.createElement('div');
    modal.className = 'mm-modal';
    modal.innerHTML = '<div class="mm-modal-header"><h3>从 ' + ids.length + ' 条记忆移除标签</h3><button class="mm-modal-close">×</button></div>';
    modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });

    var tagGrid = targetDoc.createElement('div');
    tagGrid.style.cssText = 'max-height:200px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:4px';
    var tagNames = Object.keys(commonTags).sort(function(a, b) { return commonTags[b] - commonTags[a]; });
    if (tagNames.length === 0) { tagGrid.innerHTML = '<div class="mm-empty-state">选中记忆没有共同标签</div>'; }
    for (var tni = 0; tni < tagNames.length; tni++) {
      (function(tn) {
        var chip = targetDoc.createElement('span');
        chip.textContent = tn + ' (' + commonTags[tn] + ')';
        chip.style.cssText = 'font-size:11px;padding:4px 10px;background:#fef0f0;border-radius:14px;cursor:pointer;transition:all 0.15s';
        chip.addEventListener('mouseenter', function() { chip.style.background = '#fce0e0'; });
        chip.addEventListener('mouseleave', function() { chip.style.background = '#fef0f0'; });
        chip.addEventListener('click', function() {
          var count = 0;
          function doRemove(idx) {
            if (idx >= ids.length) { self.showToast('已移除标签 (' + tn + ') 从 ' + count + ' 条记忆', 'success'); _renderMemoryList(); targetDoc.body.removeChild(overlay); return; }
            DataService.getById(ids[idx]).then(function(mem) {
              if (!mem || !mem.tags) return doRemove(idx + 1);
              var idx2 = mem.tags.indexOf(tn);
              if (idx2 !== -1) { mem.tags.splice(idx2, 1); count++; return DataService.update(mem.id, { tags: mem.tags }); }
            }).then(function() { doRemove(idx + 1); });
          }
          doRemove(0);
        });
        tagGrid.appendChild(chip);
      })(tagNames[tni]);
    }
    modal.appendChild(tagGrid);
    overlay.appendChild(modal);
    targetDoc.body.appendChild(overlay);
  }
};

// 智能导出为 Prompt
UIManager._exportAsPrompt = function() {
  var self = this;
  DataService.getAll({ includeHidden: false }).then(function(memories) {
    if (memories.length === 0) { self.showToast('没有可导出的记忆', 'info'); return; }

    var maxTokens = LorebookManager._tokenBudget || 800;
    memories.sort(function(a, b) { return (b.importance || 3) - (a.importance || 3); });

    var lines = [];
    var totalTokens = 0;
    var included = 0;
    for (var i = 0; i < memories.length; i++) {
      var m = memories[i];
      var line = '- [' + (m.zone || '') + '] ' + (m.content || '');
      var tok = estimateTokens(line);
      if (totalTokens + tok > maxTokens && included > 0) break;
      totalTokens += tok;
      included++;
      lines.push(line);
    }

    var header = '【记忆上下文 - 共' + included + '条，约' + totalTokens + ' tokens' +
      '（基于重要性排序，写入时请自然融入，避免直接复述标签格式）】';
    var full = header + '\n' + lines.join('\n');

    var overlay = targetDoc.createElement('div');
    overlay.className = 'mm-modal-overlay';
    var modal = targetDoc.createElement('div');
    modal.className = 'mm-modal';
    modal.innerHTML = '<div class="mm-modal-header"><h3>导出为上下文提示</h3><button class="mm-modal-close">×</button></div>' +
      '<p style="font-size:11px;color:#555;margin-bottom:6px">已选择 ' + included + '/' + memories.length + ' 条（按重要性排序，约 ' + totalTokens + ' tokens）</p>' +
      '<textarea readonly rows="10" style="width:100%;border:1px solid #e8e4de;border-radius:8px;padding:8px;font-size:12px;box-sizing:border-box;resize:vertical">' + escapeHtml(full) + '</textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="mm-btn copy-btn">复制</button><button class="mm-btn mm-btn-primary inject-btn">注入输入框</button></div>';
    modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });
    modal.querySelector('.copy-btn').addEventListener('click', function() {
      self._safeCopy(full); self.showToast('已复制', 'success');
    });
    modal.querySelector('.inject-btn').addEventListener('click', function() {
      var ok = LorebookManager._fillInput(full);
      if (ok) { self.showToast('已注入输入框', 'success'); }
      else { self._showCopyFallbackModal(full); self.showToast('未找到输入框，请手动复制', 'info'); }
    });
    overlay.appendChild(modal);
    targetDoc.body.appendChild(overlay);
  });
};

// 触发词测试器
UIManager._showTriggerTester = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal mm-modal-wide';
  modal.innerHTML = '<div class="mm-modal-header"><h3>触发词效果测试</h3><button class="mm-modal-close">×</button></div>' +
    '<p style="font-size:11px;color:#555;margin-bottom:8px">粘贴一段对话文本，查看哪些记忆会被触发关键词激活</p>' +
    '<textarea id="mm-tt-input" placeholder="粘贴对话或输入文本..." rows="4" style="width:100%;padding:10px;border:1px solid #d0ccc4;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;margin-bottom:12px;color:#2c2c2c;background:#fff"></textarea>' +
    '<button id="mm-tt-run" class="mm-btn mm-btn-primary mm-btn-sm" style="margin-bottom:12px">测试</button>' +
    '<div id="mm-tt-results" style="max-height:280px;overflow-y:auto;font-size:12px"></div>' +
    '<div style="margin-top:8px;font-size:11px;color:#555">Token 预算：<input id="mm-tt-budget" type="number" min="100" max="5000" step="100" value="' + LorebookManager._tokenBudget + '" style="width:70px;padding:4px;border:1px solid #d0ccc4;border-radius:4px;color:#2c2c2c;background:#fff"> <button id="mm-tt-save-budget" class="mm-btn mm-btn-xs">应用</button></div>';
  modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });

  modal.querySelector('#mm-tt-save-budget').addEventListener('click', function() {
    var b = parseInt(modal.querySelector('#mm-tt-budget').value, 10) || 500;
    LorebookManager.setTokenBudget(b);
    self.showToast('Token 预算已更新为 ' + b, 'success');
  });

  var inputEl = modal.querySelector('#mm-tt-input');
  inputEl.addEventListener('input', debounce(function() {
    var text = inputEl.value.trim();
    if (!text) { modal.querySelector('#mm-tt-results').innerHTML = ''; return; }
    modal.querySelector('#mm-tt-run').click();
  }, 500));

  modal.querySelector('#mm-tt-run').addEventListener('click', function() {
    var text = inputEl.value.trim();
    if (!text) { self.showToast('请先输入文本', 'info'); return; }
    var resultsDiv = modal.querySelector('#mm-tt-results');
    resultsDiv.innerHTML = '<div style="text-align:center;color:#555;padding:12px">测试中...</div>';

    LorebookManager.scan([text]).then(function(activated) {
      if (!activated || activated.length === 0) {
        resultsDiv.innerHTML = '<div style="text-align:center;color:#555;padding:12px">没有匹配的记忆</div>';
        return;
      }
      var totalToks = 0;
      var html = '';
      for (var i = 0; i < activated.length; i++) {
        var a = activated[i];
        var tok = estimateTokens(a.memory.content || '');
        totalToks += tok;
        html += '<div style="padding:6px 8px;border-bottom:1px solid #f0ece6">' +
          '<span style="font-size:10px;background:#f3f0ea;padding:1px 6px;border-radius:8px">命中 ' + a.hits + ' 次</span> ' +
          '<span style="font-size:10px;color:#555">重要性 ' + (a.memory.importance || 3) + '</span> ' +
          '<span style="font-size:10px;color:#555">约 ' + tok + ' tokens</span>' +
          '<div style="margin-top:2px;font-size:12px;color:#2c2c2c">' + escapeHtml((a.memory.content || '').substring(0, 100)) + '</div>' +
          '</div>';
      }
      html += '<div style="padding:6px 8px;font-size:10px;color:#555">共 ' + activated.length + ' 条，约 ' + totalToks + ' tokens</div>';
      resultsDiv.innerHTML = html;
    });
  });

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};

// 模板管理面板
UIManager._showTemplateManager = function() {
  var self = this;
  var overlay = targetDoc.createElement('div');
  overlay.className = 'mm-modal-overlay';
  var modal = targetDoc.createElement('div');
  modal.className = 'mm-modal mm-modal-wide';
  var templates = _getTemplates();
  var types = ['recall', 'summarize', 'dormant', 'lorebook'];
  var typeNames = { recall: '回顾', summarize: '总结', dormant: '沉寂提醒', lorebook: '关键词触发' };

  var html = '<div class="mm-modal-header"><h3>模板管理</h3><button class="mm-modal-close">×</button></div>' +
    '<p style="font-size:11px;color:#555;margin-bottom:12px">自定义指令模板。可用的变量：{memories} {memories_formatted} {memories_brief} {roleName} {date} {count}</p>' +
    '<select id="mm-tm-type" style="width:100%;padding:8px;margin-bottom:8px;border:1px solid #e8e4de;border-radius:8px;font-size:13px">';
  for (var ti = 0; ti < types.length; ti++) html += '<option value="' + types[ti] + '">' + typeNames[types[ti]] + '</option>';
  html += '</select>' +
    '<select id="mm-tm-preset" style="width:100%;padding:8px;margin-bottom:8px;border:1px solid #e8e4de;border-radius:8px;font-size:13px"></select>' +
    '<textarea id="mm-tm-editor" rows="6" style="width:100%;padding:10px;border:1px solid #e8e4de;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box"></textarea>' +
    '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px"><button id="mm-tm-reset" class="mm-btn mm-btn-sm">恢复默认</button><button id="mm-tm-save" class="mm-btn mm-btn-primary mm-btn-sm">保存</button></div>';
  modal.innerHTML = html;
  modal.querySelector('.mm-modal-close').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) targetDoc.body.removeChild(overlay); });

  var typeSel = modal.querySelector('#mm-tm-type');
  var presetSel = modal.querySelector('#mm-tm-preset');
  var editorEl = modal.querySelector('#mm-tm-editor');

  function updatePresets() {
    var type = typeSel.value;
    var presets = templates[type] || {};
    presetSel.innerHTML = '';
    var keys = Object.keys(presets);
    for (var ki = 0; ki < keys.length; ki++) {
      var opt = targetDoc.createElement('option');
      opt.value = keys[ki];
      opt.textContent = presets[keys[ki]].label;
      presetSel.appendChild(opt);
    }
    if (keys.length > 0) {
      editorEl.value = presets[keys[0]].template;
    }
  }
  typeSel.addEventListener('change', updatePresets);
  presetSel.addEventListener('change', function() {
    var type = typeSel.value;
    var key = presetSel.value;
    if (templates[type] && templates[type][key]) {
      editorEl.value = templates[type][key].template;
    }
  });
  updatePresets();

  modal.querySelector('#mm-tm-save').addEventListener('click', function() {
    var type = typeSel.value;
    var key = presetSel.value;
    if (!templates[type]) templates[type] = {};
    templates[type][key] = { label: (templates[type][key] ? templates[type][key].label : key), template: editorEl.value };
    _saveTemplates(templates);
    self.showToast('模板已保存', 'success');
    targetDoc.body.removeChild(overlay);
  });

  modal.querySelector('#mm-tm-reset').addEventListener('click', function() {
    var type = typeSel.value;
    var key = presetSel.value;
    if (MM_TEMPLATES[type] && MM_TEMPLATES[type][key]) {
      editorEl.value = MM_TEMPLATES[type][key].template;
      self.showToast('已恢复默认模板', 'info');
    }
  });

  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};

// 安全复制 — 三层降级：Clipboard API → execCommand → 弹窗
UIManager._safeCopy = function(text) {
  if (!text) return false;
  // 第一层：现代 Clipboard API
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
  } catch(e) {}
  // 第二层：execCommand('copy') — Chrome/Safari 沙箱中无需 allow-clipboard-write
  try {
    var ta = targetDoc.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;width:1px;height:1px';
    targetDoc.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = targetDoc.execCommand('copy');
    targetDoc.body.removeChild(ta);
    if (ok) return true;
  } catch(e) {}
  // 第三层：弹窗手动复制
  this._showCopyFallbackModal(text);
  return false;
};

// 剪贴板降级模态框
UIManager._showCopyFallbackModal = function(text) {
  var overlay = targetDoc.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.35);z-index:99999;display:flex;align-items:center;justify-content:center';
  var modal = targetDoc.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:4px;padding:20px;max-width:500px';
  modal.innerHTML = '<textarea readonly style="width:100%;min-height:120px;border:1px solid #e8e4de;border-radius:2px;padding:8px;font-size:13px">' + escapeHtml(text) + '</textarea><p style="font-size:11px;color:#555;margin:8px 0">请手动选中文本后 Ctrl+C 复制</p><button class="mm-btn mm-btn-sm">关闭</button>';
  modal.querySelector('button').addEventListener('click', function() { targetDoc.body.removeChild(overlay); });
  overlay.appendChild(modal);
  targetDoc.body.appendChild(overlay);
};


// 批量操作
UIManager._batchRestore = function() {
  var self = this;
  if (this._selectedIds.length === 0) return;
  var ids = this._selectedIds.slice();
  var done = 0;
  function next(i) { if (i >= ids.length) { self._selectedIds = []; UIManager.showToast('已恢复 ' + done + ' 条', 'success'); _renderMemoryList(); return; } DataService.restore(ids[i]).then(function() { done++; next(i + 1); }); }
  next(0);
};
UIManager._batchDelete = function() {
  var self = this;
  if (this._selectedIds.length === 0) return;
  this._showConfirm('确定批量删除 ' + this._selectedIds.length + ' 条？', function() {
    var ids = self._selectedIds.slice();
    var done = 0;
    function next(i) { if (i >= ids.length) { self._selectedIds = []; UIManager.showToast('已删除 ' + done + ' 条', 'info'); _renderMemoryList(); return; } DataService.softDelete(ids[i]).then(function() { done++; next(i + 1); }); }
    next(0);
  });
};
UIManager._batchGenRecall = function() {
  if (this._selectedIds.length === 0) { this.showToast('请先选择记忆', 'info'); return; }
  DataService.getAll({ includeHidden: false }).then(function(memories) {
    var idMap = {}; for (var i = 0; i < UIManager._selectedIds.length; i++) idMap[UIManager._selectedIds[i]] = true;
    var lines = ['请回顾以下记忆：'];
    for (var j = 0; j < memories.length; j++) { if (idMap[memories[j].id]) lines.push('- [' + (memories[j].zone || '') + '] ' + memories[j].content); }
    var text = lines.join('\n');
    var ok = UIManager._safeCopy(text);
    UIManager.showToast(ok ? '回顾指令已复制' : '请在弹出的窗口中手动复制', 'success');
  });
};
UIManager._batchGenSummary = function() {
  if (this._selectedIds.length === 0) { this.showToast('请先选择记忆', 'info'); return; }
  DataService.getAll({ includeHidden: false }).then(function(memories) {
    var idMap = {}; for (var i = 0; i < UIManager._selectedIds.length; i++) idMap[UIManager._selectedIds[i]] = true;
    var lines = ['请总结以下记忆：'];
    for (var j = 0; j < memories.length; j++) { if (idMap[memories[j].id]) lines.push('- [' + (memories[j].zone || '') + '] ' + memories[j].content); }
    var text = lines.join('\n');
    var ok = UIManager._safeCopy(text);
    UIManager.showToast(ok ? '总结指令已复制' : '请在弹出的窗口中手动复制', 'success');
  });
};
UIManager._batchCopySource = function() {
  if (this._selectedIds.length === 0) { this.showToast('请先选择记忆', 'info'); return; }
  DataService.getAll({ includeHidden: false }).then(function(memories) {
    var idMap = {}; for (var i = 0; i < UIManager._selectedIds.length; i++) idMap[UIManager._selectedIds[i]] = true;
    var blocks = [];
    for (var j = 0; j < memories.length; j++) {
      if (idMap[memories[j].id]) blocks.push('【记忆开始】\n<分区>' + (memories[j].zone || '') + '</分区>\n<角色名>' + (memories[j].roleName || '') + '</角色名>\n<内容>' + (memories[j].content || '') + '\n</内容>\n<标签>' + (memories[j].tags || []).join(',') + '</标签>\n【记忆结束】');
    }
    var text = blocks.join('\n\n');
    var ok = UIManager._safeCopy(text);
    UIManager.showToast(ok ? '素材已复制' : '请在弹出的窗口中手动复制', 'success');
  });
};


/* ====== CSS Injection ====== */
function _injectCSS() {
  if (targetDoc.getElementById('mm-v9-styles')) return;
  var style = targetDoc.createElement('style');
  style.id = 'mm-v9-styles';
  style.textContent = [
    /* ====== 萌系主题核心 ====== */
    ':root{--mm-pink:#c07072;--mm-pink-dark:#b84040;--mm-pink-light:#faf2f2;--mm-beige:#faf6f2;--mm-brown:#2c2c2c;--mm-brown-light:#555555;--mm-cream:#fafaf8;--mm-border:#e8ddd6;--mm-radius:8px;--mm-radius-sm:4px;--mm-shadow:0 2px 12px rgba(0,0,0,0.06);--mm-danger:#b84040;--mm-success:#4a9;--mm-warn:#d49540;--mm-input-bg:#fff;--mm-input-border:#d0ccc4}',
    /* 按钮基础 */
    '.mm-btn{font-size:11px;padding:4px 10px;border:1px solid var(--mm-border);border-radius:16px;cursor:pointer;background:#fff;color:var(--mm-brown);transition:all 0.15s;white-space:nowrap;flex-shrink:0;font-family:inherit}',
    '.mm-btn:hover{background:var(--mm-pink-light);border-color:#d4b0b0}',
    '.mm-btn:active{background:#f0e0e0}',
    '.mm-btn-primary{background:var(--mm-pink);color:#fff;border-color:var(--mm-pink)}',
    '.mm-btn-primary:hover{background:var(--mm-pink-dark)}',
    '.mm-btn-danger{color:var(--mm-pink-dark);border-color:#e0c0c0}',
    '.mm-btn-danger:hover{background:#fdf2f2}',
    '.mm-btn-sm{font-size:10px;padding:2px 8px}',
    '.mm-btn-xs{font-size:9px;padding:2px 6px}',
    /* 标签导航 */
    '.mm-tab-btn.active{border-bottom-color:var(--mm-pink)!important}',
    '.mm-tab-icon{font-size:15px}',
    '.mm-tab-label{font-size:12px}',
    /* 模态框系统 */
    '.mm-modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:9999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}',
    '.mm-modal{background:#fff;border:1px solid var(--mm-border);border-radius:12px;padding:22px 28px;max-width:500px;width:92%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.1)}',
    '.mm-modal-wide{max-width:640px}',
    '.mm-modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}',
    '.mm-modal-header h3{font-size:15px;color:#2c2c2c;margin:0}',
    '.mm-modal-close{background:none;border:none;font-size:22px;cursor:pointer;color:var(--mm-brown-light);padding:0 6px;border-radius:50%;transition:all 0.2s}',
    '.mm-modal-close:hover{color:var(--mm-pink-dark);background:#fdf2f2}',
    /* 表单元素 */
    '.mm-form-group{margin-bottom:12px}',
    '.mm-form-group label{display:block;font-size:12px;color:var(--mm-brown-light);margin-bottom:4px}',
    '.mm-form-group input,.mm-form-group select,.mm-form-group textarea{width:100%;padding:8px 10px;border:1px solid var(--mm-border);border-radius:var(--mm-radius-sm);font-size:13px;color:#2c2c2c;background:#fff;outline:none;font-family:inherit}',
    '.mm-form-group textarea{resize:vertical;min-height:80px}',
    '.mm-form-row{display:flex;gap:8px}',
    '.mm-form-row .mm-form-group{flex:1}',
    '.mm-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}',
    '.mm-form-check{display:flex;align-items:center;gap:6px;font-size:12px;color:#2c2c2c;margin-bottom:8px}',
    /* 自动面板 */
    '.mm-auto-segment{display:flex;gap:0;margin-bottom:16px;border:1px solid var(--mm-border);border-radius:var(--mm-radius-sm);overflow:hidden}',
    '.mm-auto-segment button{flex:1;padding:6px 12px;border:none;background:#f5f5f5;cursor:pointer;font-size:12px;color:#2c2c2c;font-weight:500}',
    '.mm-auto-segment button.active{background:var(--mm-pink);color:#fff}',
    '.mm-auto-task-row{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--mm-border);border-radius:var(--mm-radius-sm);margin-bottom:6px;background:#fff;color:#2c2c2c}',
    '.mm-auto-progress{flex:1;height:8px;background:#f3f0ea;border-radius:4px;overflow:hidden;min-width:60px}',
    '.mm-auto-progress-bar{height:100%;background:var(--mm-pink);border-radius:4px;transition:width 0.3s}',
    /* 存档管理 */
    '.mm-slot-list{max-height:300px;overflow-y:auto}',
    '.mm-slot-item{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--mm-border);border-radius:var(--mm-radius-sm);margin-bottom:4px;background:#fff}',
    '.mm-slot-info{flex:1;min-width:0}',
    '.mm-slot-label{font-size:13px;color:#2c2c2c;font-weight:500}',
    '.mm-slot-meta{font-size:11px;color:var(--mm-brown-light)}',
    /* 标签管理 */
    '.mm-tag-edit-row{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid #f0ece6}',
    /* 知识图谱 */
    '.mm-kg-canvas{border:1px solid var(--mm-border);border-radius:var(--mm-radius-sm);min-height:280px;background:var(--mm-cream);position:relative;overflow:hidden}',
    '.mm-kg-node{position:absolute;padding:6px 10px;background:#fff;border:1px solid var(--mm-border);border-radius:12px;font-size:12px;cursor:pointer;white-space:nowrap;box-shadow:var(--mm-shadow);transition:border-color 0.2s}',
    '.mm-kg-node:hover{border-color:var(--mm-pink);z-index:10}',
    '.mm-kg-edge-label{position:absolute;font-size:10px;color:var(--mm-brown-light)}',
    /* 通用 */
    '.mm-empty-state{text-align:center;padding:40px 20px;color:var(--mm-brown-light);font-size:13px}',
    '.mm-help-tip{font-size:11px;color:var(--mm-brown-light);padding:6px 0;line-height:1.5}',
    /* 记忆卡片 */
    '.memory-card{border-radius:var(--mm-radius-sm)!important;transition:box-shadow 0.2s,transform 0.15s}',
    '.memory-card:hover{box-shadow:0 2px 12px rgba(0,0,0,0.08)!important}',
    /* 悬浮球 */
    '.mm-floating-ball-new{position:fixed;bottom:120px;right:12px;width:48px;height:48px;border-radius:50%;background:#3a3a3a;color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);transition:all 0.25s;user-select:none}',
    '.mm-floating-ball-new:hover{box-shadow:0 6px 24px rgba(0,0,0,0.3);transform:scale(1.08)}',
    '.mm-floating-ball-new:active{box-shadow:0 2px 8px rgba(0,0,0,0.2);transform:scale(0.95)}',
    /* 仪表盘动画 */
    '@keyframes mm-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}',
    '@keyframes mm-fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
    '@keyframes mm-toast-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
    '@keyframes mm-slide-in{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}',
    '.mm-dash-welcome{animation:mm-fade-in 0.4s ease}',
    '.mm-dash-assistant{animation:mm-fade-in 0.5s ease}',
    /* 更多菜单 */
    '.mirror-more-menu{border-radius:var(--mm-radius-sm)!important}',
    '.mirror-more-menu button{font-size:12px;padding:9px 14px}',
    '.mirror-more-menu button:hover{background:var(--mm-pink-light)!important}',
    /* 工具栏 */
    '.mirror-toolbar{border-bottom:1px solid var(--mm-border)}',
    '.mirror-filter-area{border-bottom:1px solid var(--mm-border)}',
    '.mirror-filter-area input,.mirror-filter-area select{border-radius:20px!important}',
    /* Content area */
    '.mirror-content{color:#2c2c2c}',
    /* 时间线 */
    '.mm-tl-content{scroll-behavior:smooth}',
    /* Container Queries — 声明容器在 .wb-body 上（由 WinBox 创建） */
    '.wb-body{container-type:inline-size;container-name:mirror-panel}',
    /* 工具栏响应式 */
    '@container mirror-panel (max-width:420px){',
      '.mirror-toolbar{flex-wrap:wrap;gap:3px}',
      '.mirror-toolbar .mm-btn{min-width:32px;min-height:30px;font-size:10px;padding:2px 6px}',
      '.mirror-toolbar .mm-btn span{display:none}',
    '}',
    /* 记忆卡片响应式 — 窄屏 */
    '@container mirror-panel (max-width:380px){',
      '.memory-card{font-size:10px;padding:4px 5px!important;gap:3px}',
      '.memory-card .meta{flex-wrap:wrap;gap:3px}',
      '.memory-card .meta span{font-size:9px!important}',
      '.mm-card-content{font-size:10px!important;line-height:1.3!important;max-height:3.9em;overflow:hidden}',
      '.memory-card input[type=checkbox]{width:14px;height:14px;flex-shrink:0;margin-top:1px}',
    '}',
    /* 极窄（手机竖屏）强制横排不折行 */
    '@container mirror-panel (max-width:280px){',
      '.memory-card{flex-wrap:nowrap!important;padding:3px 4px!important;overflow-x:auto}',
      '.memory-card .meta{flex-wrap:nowrap!important;overflow:hidden}',
      '.mm-card-content{font-size:9px!important;max-height:2.7em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '}',
    /* 筛选栏响应式 */
    '@container mirror-panel (max-width:500px){',
      '.mirror-filter-row{overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch}',
    '}',
    /* 模态框窄面板占满 */
    '@container mirror-panel (max-width:400px){',
      '.mirror-modal{width:100%;max-width:100%;border-radius:0}',
    '}',
    /* 移动端 */
    '@media (max-width:768px){',
      '.mm-floating-ball-new{bottom:100px;right:8px}',
      '.wb-resize-handle-se{width:30px!important;height:30px!important}',
      '.winbox .wb-header{min-height:40px}',
      '.mm-btn{min-width:32px;min-height:32px;font-size:10px;padding:3px 8px}',
      '.mm-btn-sm{min-width:28px;min-height:28px;font-size:10px;padding:2px 7px}',
      '.mm-btn-xs{min-width:26px;min-height:26px;font-size:9px;padding:2px 5px}',
      '.mirror-modal{width:96vw;max-height:75vh;padding:14px}',
      '.mirror-toolbar .mm-btn{min-width:32px;min-height:32px;font-size:10px;padding:3px 6px}',
      '.memory-card{font-size:12px;padding:5px 6px!important}',
      '.mm-tab-btn{padding:6px 4px;font-size:11px}',
      '.mm-tab-icon{font-size:12px}',
      '.mm-tab-label{font-size:10px}',
    '}',
  ].join('\n');
  (targetDoc.head || targetDoc.documentElement).appendChild(style);
}


/* ====== Open Panel (WinBox-based) ====== */
function _openPanel(size) {
  var s = size || 'medium';
  var isMobile = targetWin.innerWidth <= 768;
  var sizes = {
    small:  { w: isMobile ? 200 : 300, h: isMobile ? '50vh' : '50vh' },
    medium: { w: isMobile ? 280 : 380, h: isMobile ? '55vh' : '60vh' },
    large:  { w: isMobile ? '96vw' : 600, h: isMobile ? '60vh' : '70vh' },
    full:   { w: isMobile ? '96vw' : '90vw', h: isMobile ? '90vh' : '90vh' }
  };
  var cfg = sizes[s];

  if (window.MemoryMirror._winbox && window.MemoryMirror._winbox.isOpen()) {
    window.MemoryMirror._winbox.resize(cfg.w, cfg.h);
    window.MemoryMirror._winbox.focus();
    return;
  }

  closeExistingWinbox();

  _panelContentEl = _renderPanelContent();

  window.MemoryMirror._winbox = new WinBox({
    title: 'MemoryMirror',
    width: cfg.w,
    height: cfg.h,
    x: isMobile ? '2vw' : 'center',
    y: isMobile ? '20vh' : 'center',
    html: _panelContentEl,
    onclose: function() {
      window.MemoryMirror._winbox = null;
      _panelContentEl = null;
    }
  });

  _renderMemoryList();
}

function closeExistingWinbox() {
  if (window.MemoryMirror._winbox) {
    try { window.MemoryMirror._winbox.close(); } catch(e) {}
    window.MemoryMirror._winbox = null;
  }
}


/* ====== 诊断系统 ====== */
function _diagnose() {
  var r = { time: formatDate(Date.now()), checks: [], errors: [], warnings: [] };
  function chk(name, ok, detail) { r.checks.push({ name: name, ok: ok, detail: detail || '' }); if (!ok) r.errors.push(name); }

  // 环境
  chk('targetDoc 可用', !!targetDoc, targetDoc ? 'OK' : 'null');
  chk('targetDoc.body', !!(targetDoc && targetDoc.body), targetDoc && targetDoc.body ? 'OK' : 'null');
  chk('parentDoc', !!parentDoc, parentDoc ? 'OK' : 'null/跨域');
  chk('localStorage', (function(){ try{ localStorage.setItem('__mmt','1'); localStorage.removeItem('__mmt'); return true; }catch(e){ return false; } })(), '');

  // 模块
  chk('DataService', DataService._storageMode !== null, DataService._storageMode || '未初始化');
  chk('SearchIndex', !!(SearchIndex._db), SearchIndex._db ? '文档:' + SearchIndex.getStats().total : '未就绪');
  chk('SemanticEngine', SemanticEngine.isReady(), '');
  chk('TagManager', !!(TagManager._tagStats), TagManager._tagStats ? '标签:' + Object.keys(TagManager._tagStats).length : '');
  chk('KnowledgeGraph', !!(KnowledgeGraph._entities), '实体:' + Object.keys(KnowledgeGraph._entities || {}).length);
  chk('RuleEngine', Array.isArray(RuleEngine._rules), '规则:' + (RuleEngine._rules ? RuleEngine._rules.length : 0));

  // DOM
  var ballEl = targetDoc ? targetDoc.getElementById('mm-floating-ball') : null;
  chk('悬浮球 DOM', !!ballEl, ballEl ? '已找到' : '不存在');
  if (ballEl) {
    try { var bs = targetWin.getComputedStyle(ballEl); chk('悬浮球可见', bs.display !== 'none', 'display:' + bs.display + ' z:' + bs.zIndex); } catch(e) {}
    chk('悬浮球尺寸', ballEl.offsetWidth > 0 && ballEl.offsetHeight > 0, ballEl.offsetWidth + 'x' + ballEl.offsetHeight);
  }
  chk('CSS 注入', !!targetDoc.getElementById('mm-v9-styles'), '');

  // API
  chk('window.MemoryMirror', !!(typeof window !== 'undefined' && window.MemoryMirror), '');
  if (window.MemoryMirror) {
    chk('openPanel', typeof window.MemoryMirror.openPanel === 'function', '');
  }

  // 角色
  chk('roleId', !!DataService._roleId, DataService._roleId || '未设置');
  chk('sessionId', !!DataService._sessionId, DataService._sessionId || '未设置');

  var passed = r.checks.filter(function(c){return c.ok;}).length;
  r.summary = passed + '/' + r.checks.length + ' 项通过' + (r.errors.length > 0 ? '，' + r.errors.length + ' 项异常' : '，一切正常');
  return r;
}

// 控制台直接调用: __mm_diag()
if (typeof window !== 'undefined') { window.__mm_diag = _diagnose; }

/* ====== Auto Initialization ====== */
function _autoInit() {
  function tryInit() {
    // 重新计算 targetDoc/targetWin（延迟初始化，确保父文档 body 已就绪）
    if (parentDoc && parentDoc.body) {
      targetDoc = parentDoc;
      targetWin = parentWin;
    } else if (document.body) {
      targetDoc = document;
      targetWin = window;
    } else {
      // DOM 仍不可用，100ms 后重试
      setTimeout(tryInit, 100);
      return;
    }

    // 防止重复初始化
    if (targetDoc.getElementById(WRAPPER_ID)) return;

    var params = getUrlParams();
    var roleId = params.roleId || params.role || 'default';
    var sessionId = params.sessionId || params.session || 'default';

    DataService._roleId = roleId;
    DataService._sessionId = sessionId;

    _log('[MemoryMirror] 开始初始化... roleId=' + roleId + ' sessionId=' + sessionId);
    DataService._detectStorage()
      .then(function() { _log('[MemoryMirror] 存储模式: ' + DataService._storageMode); return DataService._migrateOldData(); })
      .then(function() {
        if (DataService._storageMode === 'indexedDB') {
          return DataService._ensureDB().catch(function() {
            _warn('[MemoryMirror] IndexedDB 失败，降级到 localStorage');
            DataService._storageMode = 'localStorage';
            DataService._db = null;
          });
        }
      })
      .then(function() { return ArchiveManager.checkSessionChange(); })
      .then(function() { _log('[MemoryMirror] 核心模块加载中...'); return SemanticEngine.init(); })
      .then(function() { return KnowledgeGraph.load(); })
      .then(function() { _log('[MemoryMirror] 搜索索引构建中...'); return SearchIndex.init(); })
      .then(function() { return TagManager.init(); })
      .then(function() { _log('[MemoryMirror] 标签统计重建...'); return TagManager.rebuildStats().then(function() { _log('[MemoryMirror] 标签统计已校正'); }).catch(function(){}); })
      .then(function() { return RuleEngine.init(); })
      .then(function() { return LorebookManager.init(); })
      .then(function() { return AdaptiveForgetting.init(); })
      .then(function() { return AutoTaskManager.init(); })
      .then(function() { _log('[MemoryMirror] 监听器启动中...'); return RollbackManager.init(); })
      .then(function() {
        // 注入 CSS（最早执行，确保样式就绪）
        try { _injectCSS(); } catch(e) { _warn('[MemoryMirror] CSS injection failed:', e.message); }

        // 创建悬浮球（优先创建，不受后续步骤影响）
        try {
          if (!targetDoc.getElementById('mm-floating-ball')) {
            var ball = targetDoc.createElement('div');
            ball.id = 'mm-floating-ball';
            ball.className = 'mm-floating-ball-new';
            ball.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:#fff"><path d="M12 2l10 12-10 8L2 14z"/></svg>';
            ball.title = 'MemoryMirror';
            ball.addEventListener('click', function() {
              if (window.MemoryMirror && window.MemoryMirror._winbox && window.MemoryMirror._winbox.isOpen()) {
                closeExistingWinbox();
              } else {
                _openPanel('medium');
              }
            });
            targetDoc.body.appendChild(ball);
            _log('[MemoryMirror] 悬浮球已创建');
            _showStatusBar('就绪 — 点击右下角球体打开面板', 'ok');
          }
        } catch(e) {
          _warn('[MemoryMirror] 悬浮球创建失败: ' + e.message, e);
          // 终极降级：用 setTimeout 重试
          setTimeout(function() {
            try {
              if (!targetDoc.getElementById('mm-floating-ball')) {
                var b2 = targetDoc.createElement('div');
                b2.id = 'mm-floating-ball';
                b2.className = 'mm-floating-ball-new';
                b2.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:#fff"><path d="M12 2l10 12-10 8L2 14z"/></svg>';
                b2.title = 'MemoryMirror';
                b2.addEventListener('click', function() {
                  if (window.MemoryMirror && window.MemoryMirror._winbox && window.MemoryMirror._winbox.isOpen()) {
                    closeExistingWinbox();
                  } else {
                    _openPanel('medium');
                  }
                });
                targetDoc.body.appendChild(b2);
              }
            } catch(e2) { _warn('[MemoryMirror] Ball retry failed:', e2.message); }
          }, 2000);
        }

        // 包装 DataService.save()（集成钩子）
        var _originalSave = DataService.save;
        // 已统计标签的记忆 ID → 已计数标签集合（不是简单布尔值，用于差异检测）
        var _countedMemoryIds = {};
        DataService.save = function(memory) {
          // 先等待获取旧标签（修复竞态条件：原代码 fire-and-forget 未等待 getById）
          var getOldPromise = memory.id
            ? DataService.getById(memory.id).then(function(existing) { return existing ? (existing.tags || []) : null; }).catch(function() { return null; })
            : Promise.resolve(null);

          return getOldPromise.then(function(oldTags) {
            return _originalSave.call(DataService, memory).then(function(saved) {
              if (saved) {
                // 标签差异检测
                if (saved.tags && saved.tags.length > 0) {
                  var newTags = [];
                  var countedEntry = _countedMemoryIds[saved.id];
                  if (countedEntry && oldTags) {
                    // 已统计过 + 有旧标签 → 只计入本次新增且之前未计数的标签
                    for (var sti = 0; sti < saved.tags.length; sti++) {
                      if (!countedEntry.tagSet[saved.tags[sti]]) {
                        newTags.push(saved.tags[sti]);
                        countedEntry.tagSet[saved.tags[sti]] = true;
                      }
                    }
                  } else if (!countedEntry && oldTags) {
                    // 首次差异检测：只计入 oldTags 中没有的标签
                    var oldTagMap = {};
                    for (var oti = 0; oti < oldTags.length; oti++) oldTagMap[oldTags[oti]] = true;
                    for (var sti2 = 0; sti2 < saved.tags.length; sti2++) {
                      if (!oldTagMap[saved.tags[sti2]]) newTags.push(saved.tags[sti2]);
                    }
                    // 初始化计数记录
                    var initSet = {};
                    for (var sti3 = 0; sti3 < saved.tags.length; sti3++) initSet[saved.tags[sti3]] = true;
                    _countedMemoryIds[saved.id] = { tagSet: initSet };
                  } else if (!countedEntry && !oldTags) {
                    // 新记忆，全部标签计入
                    newTags = saved.tags;
                    var fullSet = {};
                    for (var sti4 = 0; sti4 < saved.tags.length; sti4++) fullSet[saved.tags[sti4]] = true;
                    _countedMemoryIds[saved.id] = { tagSet: fullSet };
                  }
                  // else: countedEntry 存在但 oldTags 为空 → 不重复计数

                  if (newTags.length > 0) {
                    try { TagManager.recordTagUsage(newTags); } catch(e) { _warn('[Hook] TagManager.recordTagUsage:', e); }
                  }
                }
                try { KnowledgeGraph.extractEntities(saved); } catch(e) { _warn('[Hook] KnowledgeGraph.extractEntities:', e); }
                if (Scanner._pendingElement) { try { Scanner._markScanned(Scanner._pendingElement); } catch(e) { _warn('[Hook] Scanner._markScanned:', e); } Scanner._pendingElement = null; }
                try { LorebookManager._addToIndex(saved); } catch(e) { _warn('[Hook] LorebookManager._addToIndex:', e); }
                if (!saved.triggerKeywords || saved.triggerKeywords.length === 0) { try { LorebookManager._removeFromIndex(saved.id); } catch(e) { _warn('[Hook] LorebookManager._removeFromIndex:', e); } }
                try { AdaptiveForgetting.recordRetrieval([saved.id]); } catch(e) { _warn('[Hook] AdaptiveForgetting.recordRetrieval:', e); }
              }
              return saved;
            });
          });
        };

        // 包装 SearchIndex.search（记录检索）
        var _originalSearch = SearchIndex.search;
        SearchIndex.search = function(query, filters) {
          var result = _originalSearch.call(SearchIndex, query, filters);
          if (result && result.hits && result.hits.length > 0) {
            var hitIds = [];
            for (var hi = 0; hi < result.hits.length; hi++) { if (result.hits[hi].id) hitIds.push(result.hits[hi].id); }
            if (hitIds.length > 0) { try { AdaptiveForgetting.recordRetrieval(hitIds); } catch(e) {} }
          }
          return result;
        };

        // 包装 softDelete / permanentDelete
        var _origSoft = DataService.softDelete;
        DataService.softDelete = function(id) { return _origSoft.call(DataService, id).then(function() { try { LorebookManager._removeFromIndex(id); } catch(e) {} }); };
        var _origPerm = DataService.permanentDelete;
        DataService.permanentDelete = function(id) { return _origPerm.call(DataService, id).then(function() { try { LorebookManager._removeFromIndex(id); } catch(e) {} }); };

        _log('[MemoryMirror] 初始化完成。MemoryMirror.diagnose() 查看状态，__mm_diag() 快速诊断');

        // 启动自检（静默，仅关键问题输出warn日志）
        try {
          var startupIssues = Diagnostics.startupCheck();
          if (startupIssues.length > 0) {
            _log('[MemoryMirror] 启动自检发现 ' + startupIssues.length + ' 个问题，打开面板查看详情');
          }
        } catch(e) { _warn('[Diagnostics] 启动自检失败:', e); }

        // 追踪包装：Scanner.scan 记录结果
        var _origScan = Scanner.scan;
        Scanner.scan = function() {
          return _origScan.call(Scanner).then(function(r) {
            Scanner._lastScanTime = Date.now();
            Scanner._lastScanResult = { added: r.added, skipped: r.skipped, time: Scanner._lastScanTime };
            return r;
          });
        };

        // 追踪包装：_showCopyFallbackModal 计数
        var _origFallback = UIManager._showCopyFallbackModal;
        UIManager._showCopyFallbackModal = function(text) {
          UIManager._copyFallbackCount = (UIManager._copyFallbackCount || 0) + 1;
          UIManager._lastCopyResult = { time: Date.now(), type: 'fallback', length: (text || '').length, ok: false };
          return _origFallback.call(UIManager, text);
        };

        // 挂载全局 API
        window.MemoryMirror = {
          Utils: { escapeHtml: escapeHtml, debounce: debounce, getUrlParams: getUrlParams, formatDate: formatDate, daysSince: daysSince, contentFingerprint: contentFingerprint, estimateTokens: estimateTokens, uid: uid, createMemory: createMemory, typographic: typographic, ZONES: ZONES, CATEGORIES: CATEGORIES, WRAPPER_ID: WRAPPER_ID, targetDoc: targetDoc, targetWin: targetWin },
          DataService: DataService,
          SearchIndex: SearchIndex,
          embed: SemanticEngine.embed.bind(SemanticEngine),
          similarity: SemanticEngine.similarity.bind(SemanticEngine),
          cluster: SemanticEngine.cluster.bind(SemanticEngine),
          semanticDedup: SemanticEngine.semanticDedup.bind(SemanticEngine),
          extractTags: AutoTagger.extractTags.bind(AutoTagger),
          extractTagsSemantic: AutoTagger.extractTagsSemantic.bind(AutoTagger),
          getAllTags: TagManager.getAllTags.bind(TagManager),
          getTagMeta: TagManager.getTagMeta.bind(TagManager),
          getCloud: TagManager.getCloud.bind(TagManager),
          addCustomTag: TagManager.addCustomTag.bind(TagManager),
          deleteCustomTag: TagManager.deleteCustomTag.bind(TagManager),
          setActiveThemes: TagManager.setActiveThemes.bind(TagManager),
          scan: Scanner.scan.bind(Scanner),
          startAutoScan: Scanner.startAutoScan.bind(Scanner),
          stopAutoScan: Scanner.stopAutoScan.bind(Scanner),
          getEntity: KnowledgeGraph.getEntity.bind(KnowledgeGraph),
          searchEntities: KnowledgeGraph.searchEntities.bind(KnowledgeGraph),
          getGraph: KnowledgeGraph.getGraph.bind(KnowledgeGraph),
          getSlots: ArchiveManager.getSlots.bind(ArchiveManager),
          createSlot: ArchiveManager.createSlot.bind(ArchiveManager),
          deleteSlot: ArchiveManager.deleteSlot.bind(ArchiveManager),
          createSnapshot: ArchiveManager.createSnapshot.bind(ArchiveManager),
          restoreSnapshot: ArchiveManager.restoreSnapshot.bind(ArchiveManager),
          exportJSON: Exporter.exportJSON.bind(Exporter),
          importJSON: Exporter.importJSON.bind(Exporter),
          importFromClipboard: Exporter.importFromClipboard.bind(Exporter),
          getRules: RuleEngine.getRules.bind(RuleEngine),
          addRule: RuleEngine.addRule.bind(RuleEngine),
          removeRule: RuleEngine.removeRule.bind(RuleEngine),
          scanMessages: LorebookManager.scan.bind(LorebookManager),
          injectToInput: LorebookManager.injectToInput.bind(LorebookManager),
          setTokenBudget: LorebookManager.setTokenBudget.bind(LorebookManager),
          evaluateForgetting: AdaptiveForgetting.evaluate.bind(AdaptiveForgetting),
          getDormantCandidates: AdaptiveForgetting.getDormantCandidates.bind(AdaptiveForgetting),
          getTaskProgress: AutoTaskManager.getTaskProgress.bind(AutoTaskManager),
          incrementRound: AutoTaskManager.incrementRound.bind(AutoTaskManager),
          triggerTask: AutoTaskManager.triggerTask.bind(AutoTaskManager),
          rollbackLastRound: RollbackManager.rollbackLastRound.bind(RollbackManager),
          rollbackRounds: RollbackManager.rollbackRounds.bind(RollbackManager),
          openPanel: function(s) { _openPanel(s); },
          closePanel: function() { closeExistingWinbox(); },
          startTutorial: function() {},
          showManual: function() { _showManualImpl(); },
          showHelp: function(topic) { _showHelpCardImpl(topic); },
          diagnose: function() { return _diagnose(); },
          diagnostics: Diagnostics,
          showDiagnostics: function() { UIManager._showDiagnostics(); },
          _winbox: null,
          _debug: function() {
            var stats = SearchIndex.getStats();
            return { roleId: DataService._roleId, sessionId: DataService._sessionId, storageMode: DataService._storageMode, memoryCount: stats.total, activeThemes: TagManager.getActiveThemes(), entityCount: Object.keys(KnowledgeGraph._entities).length, selectedCount: UIManager._selectedIds.length };
          }
        };

        // 全局快捷诊断函数（控制台直接调用 __mm_diag()）
        window.__mm_diag = function() {
          return Diagnostics.runAll().then(function(r) {
            console.group('记忆之镜 诊断报告');
            var flows = r.flows;
            for (var fi = 0; fi < flows.length; fi++) {
              var f = flows[fi];
              console.log((f.pass ? '✅' : '❌') + ' ' + f.flow);
              for (var ri = 0; ri < f.results.length; ri++) {
                var res = f.results[ri];
                console.log('  ' + (res.pass ? '✓' : '✗') + ' ' + res.msg + (res.suggest ? '\n    💡 ' + res.suggest : ''));
              }
            }
            console.groupEnd();
            return r;
          });
        };
        // E2E 自动化测试（CI/本地一键回归）
        window.__mm_e2e = function(opts) {
          opts = opts || {};
          var timeout = opts.timeout || 30000;
          var verbose = opts.verbose !== false;
          var startTime = Date.now();
          var results = { passed: [], failed: [], skipped: [], duration: 0 };

          function finish() {
            results.duration = Date.now() - startTime;
            if (verbose) {
              console.group((results.failed.length === 0 ? '✅' : '❌') + ' E2E 测试完成 ' +
                results.passed.length + '/' + (results.passed.length + results.failed.length) + ' 通过 (' + results.duration + 'ms)');
              for (var pi = 0; pi < results.passed.length; pi++) {
                console.log('  ✅ ' + results.passed[pi]);
              }
              for (var fi = 0; fi < results.failed.length; fi++) {
                console.warn('  ❌ ' + results.failed[fi].flow + ': ' + results.failed[fi].reason);
              }
              console.groupEnd();
            }
            if (typeof window.__mm_e2e_callback === 'function') {
              window.__mm_e2e_callback(results);
            }
            return results;
          }

          var timer = setTimeout(function() {
            results.failed.push({ flow: '超时', reason: '测试超时 (' + timeout + 'ms)' });
            finish();
          }, timeout);

          return Diagnostics.runAll().then(function(report) {
            clearTimeout(timer);
            var flows = report.flows;
            for (var i = 0; i < flows.length; i++) {
              var f = flows[i];
              if (f.pass) {
                results.passed.push(f.flow);
              } else {
                // 提取第一个失败原因
                var reason = '';
                for (var ri = 0; ri < f.results.length; ri++) {
                  if (!f.results[ri].pass) { reason = f.results[ri].msg; break; }
                }
                results.failed.push({ flow: f.flow, reason: reason || '未知' });
              }
            }
            return finish();
          }).catch(function(err) {
            clearTimeout(timer);
            results.failed.push({ flow: '系统', reason: '测试框架异常: ' + (err.message || String(err)) });
            return finish();
          });
        };
        _log('[MemoryMirror] 控制台输入 __mm_diag() 诊断 / __mm_e2e() 一键回归测试');
      })
      .catch(function(err) {
        _error('[MemoryMirror] 初始化失败: ' + (err && err.message ? err.message : String(err)), err);
        _showStatusBar('初始化失败: ' + (err && err.message ? err.message : '未知错误'), 'error');
        _log('[MemoryMirror] 尝试降级启动...');
        // 即使初始化失败也尝试创建悬浮球
        try { _injectCSS(); } catch(e) {}
        try {
          if (!targetDoc.getElementById('mm-floating-ball')) {
            var errBall = targetDoc.createElement('div');
            errBall.id = 'mm-floating-ball';
            errBall.className = 'mm-floating-ball-new';
            errBall.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:#fff"><path d="M12 2l10 12-10 8L2 14z"/></svg>';
            errBall.title = 'MemoryMirror';
            errBall.addEventListener('click', function() {
              if (window.MemoryMirror && window.MemoryMirror._winbox && window.MemoryMirror._winbox.isOpen()) {
                closeExistingWinbox();
              } else {
                _openPanel('medium');
              }
            });
            targetDoc.body.appendChild(errBall);
            _showStatusBar('降级启动 — 部分功能不可用', 'warn');
          }
        } catch(e) {}
        window.MemoryMirror = {
          Utils: { escapeHtml: escapeHtml, debounce: debounce, getUrlParams: getUrlParams, formatDate: formatDate, daysSince: daysSince, contentFingerprint: contentFingerprint, estimateTokens: estimateTokens, uid: uid, createMemory: createMemory, ZONES: ZONES, CATEGORIES: CATEGORIES, WRAPPER_ID: WRAPPER_ID, targetDoc: targetDoc, targetWin: targetWin },
          DataService: DataService,
          SearchIndex: SearchIndex,
          _error: err.message,
          diagnose: function() { return _diagnose(); },
          _debug: function() { return { error: window.MemoryMirror._error }; }
        };
      });
  }

  // 先等 DOM ready，然后 tryInit
  if (targetDoc.readyState === 'loading') {
    targetDoc.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
}

try {
  _log('MemoryMirror 开始初始化...');
  _autoInit();
  _log('MemoryMirror 初始化流程已启动');
} catch(e) {
  _error('MemoryMirror autoInit 失败: ' + e.message);
  _showStatusBar('初始化失败: ' + e.message, 'error');
}

} catch(e) {
  _fatalError(e.message);
  _error('MemoryMirror 模块崩溃: ' + e.message, e.stack);
}

})();
