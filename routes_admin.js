/**
 * routes_admin.js - 可视化后台管理路由
 * 提供：模块拖拽排序、字段在线编辑、SSE实时同步、公告管理
 */

var sseClients = []; // SSE 客户端列表

// 默认模块配置（各角色菜单）
var DEFAULT_MODULES = {
  admin: [
    { key: 'dashboard', label: '数据看板', icon: '📊', sort: 0 },
    { key: 'orders', label: '订单管理', icon: '📋', sort: 1 },
    { key: 'teams', label: '班组管理', icon: '👥', sort: 2 },
    { key: 'customers', label: '客户档案', icon: '🏢', sort: 3 },
    { key: 'products', label: '产品档案', icon: '🍫', sort: 4 },
    { key: 'warehouse', label: '仓库管理', icon: '🏭', sort: 5 },
    { key: 'procurement_v2', label: '采购管理', icon: '🛒', sort: 6 },
    { key: 'qc', label: '品控管理', icon: '🔍', sort: 7 },
    { key: 'finance', label: '财务工资', icon: '💰', sort: 8 },
    { key: 'settings', label: '系统设置', icon: '⚙️', sort: 9 },
    { key: 'audit', label: '操作日志', icon: '📝', sort: 10 }
  ],
  clerk: [
    { key: 'dashboard', label: '数据看板', icon: '📊', sort: 0 },
    { key: 'orders', label: '订单管理', icon: '📋', sort: 1 },
    { key: 'customers', label: '客户档案', icon: '🏢', sort: 2 },
    { key: 'products', label: '产品档案', icon: '🍫', sort: 3 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 4 }
  ],
  supervisor: [
    { key: 'dashboard', label: '数据看板', icon: '📊', sort: 0 },
    { key: 'orders', label: '订单管理', icon: '📋', sort: 1 },
    { key: 'dispatch', label: '派单管理', icon: '📤', sort: 2 },
    { key: 'productions', label: '生产记录', icon: '🏭', sort: 3 },
    { key: 'teams', label: '班组管理', icon: '👥', sort: 4 },
    { key: 'finance', label: '财务工资', icon: '💰', sort: 5 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 6 }
  ],
  team: [
    { key: 'my_orders', label: '我的生产', icon: '🏭', sort: 0 },
    { key: 'productions', label: '生产记录', icon: '📋', sort: 1 },
    { key: 'procurement_v2', label: '采购申请', icon: '🛒', sort: 2 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 3 }
  ],
  qc: [
    { key: 'inspections', label: '质检管理', icon: '🔍', sort: 0 },
    { key: 'qc_reports', label: '品控报告', icon: '📄', sort: 1 },
    { key: 'qc_hygiene', label: '卫生检查', icon: '🧹', sort: 2 },
    { key: 'qc_performance', label: '绩效考核', icon: '⭐', sort: 3 },
    { key: 'qc_outbound', label: '出库管理', icon: '📦', sort: 4 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 5 }
  ],
  packaging: [
    { key: 'packaging', label: '打包管理', icon: '📦', sort: 0 },
    { key: 'qc_reports', label: '品控报告', icon: '📄', sort: 1 },
    { key: 'procurement_v2', label: '采购申请', icon: '🛒', sort: 2 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 3 }
  ],
  warehouse: [
    { key: 'warehouse', label: '仓库管理', icon: '🏭', sort: 0 },
    { key: 'outbound', label: '出库管理', icon: '🚚', sort: 1 },
    { key: 'procurement_v2', label: '采购申请', icon: '🛒', sort: 2 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 3 }
  ],
  finance: [
    { key: 'finance', label: '财务工资', icon: '💰', sort: 0 },
    { key: 'dashboard', label: '数据看板', icon: '📊', sort: 1 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 2 }
  ],
  procurement: [
    { key: 'procurement_v2', label: '采购管理', icon: '🛒', sort: 0 },
    { key: 'suppliers', label: '供应商管理', icon: '🏪', sort: 1 },
    { key: 'warehouse', label: '仓库查询', icon: '🏭', sort: 2 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 3 }
  ],
  preparation: [
    { key: 'preparation', label: '配料管理', icon: '🧪', sort: 0 },
    { key: 'warehouse', label: '仓库查询', icon: '🏭', sort: 1 },
    { key: 'procurement_v2', label: '采购申请', icon: '🛒', sort: 2 },
    { key: 'notifications', label: '消息通知', icon: '🔔', sort: 3 }
  ],
  console: [
    { key: 'dashboard', label: '数据看板', icon: '📊', sort: 0 },
    { key: 'orders', label: '订单监控', icon: '📋', sort: 1 },
    { key: 'productions', label: '生产监控', icon: '🏭', sort: 2 },
    { key: 'warehouse', label: '仓库监控', icon: '🏭', sort: 3 },
    { key: 'audit', label: '操作日志', icon: '📝', sort: 4 }
  ]
};

// 默认字段配置（主要表单字段）
var DEFAULT_FIELDS = {
  orders: [
    { key: 'order_no', label: '订单编号', type: 'text', required: 1, sort: 0 },
    { key: 'customer_id', label: '客户', type: 'select', required: 1, sort: 1 },
    { key: 'product_id', label: '产品', type: 'select', required: 1, sort: 2 },
    { key: 'quantity', label: '数量', type: 'number', required: 1, sort: 3 },
    { key: 'deadline', label: '交货期', type: 'date', required: 0, sort: 4 },
    { key: 'is_urgent', label: '加急', type: 'checkbox', required: 0, sort: 5 },
    { key: 'notes', label: '备注', type: 'textarea', required: 0, sort: 6 }
  ],
  products: [
    { key: 'name', label: '产品名称', type: 'text', required: 1, sort: 0 },
    { key: 'details', label: '明细描述', type: 'textarea', required: 0, sort: 1 },
    { key: 'color_code', label: '色号', type: 'text', required: 0, sort: 2 },
    { key: 'inner_pack_spec', label: '内包规格', type: 'text', required: 0, sort: 3 },
    { key: 'inner_pack_qty', label: '内包数量', type: 'number', required: 0, sort: 4 },
    { key: 'outer_pack_spec', label: '外包规格', type: 'text', required: 0, sort: 5 },
    { key: 'items_per_box', label: '每箱数量', type: 'number', required: 0, sort: 6 },
    { key: 'inner_pack_size', label: '内包袋尺寸', type: 'text', required: 0, sort: 7 },
    { key: 'outer_box_size', label: '外箱尺寸规格', type: 'text', required: 0, sort: 8 },
    { key: 'packing_method', label: '打包方式', type: 'text', required: 0, sort: 9 }
  ],
  productions: [
    { key: 'batch_no', label: '批次号', type: 'number', required: 1, sort: 0 },
    { key: 'workers', label: '参与人员', type: 'text', required: 1, sort: 1 },
    { key: 'total_produced', label: '生产数量', type: 'number', required: 1, sort: 2 },
    { key: 'plan_date', label: '计划日期', type: 'date', required: 0, sort: 3 },
    { key: 'notes', label: '备注', type: 'textarea', required: 0, sort: 4 }
  ],
  inspections: [
    { key: 'qualified_qty', label: '合格数量', type: 'number', required: 1, sort: 0 },
    { key: 'unqualified_qty', label: '不合格数量', type: 'number', required: 1, sort: 1 },
    { key: 'defect_hair', label: '毛发缺陷', type: 'number', required: 0, sort: 2 },
    { key: 'defect_color_mix', label: '混色缺陷', type: 'number', required: 0, sort: 3 },
    { key: 'defect_edge', label: '边缘缺陷', type: 'number', required: 0, sort: 4 },
    { key: 'defect_whitening', label: '白化缺陷', type: 'number', required: 0, sort: 5 },
    { key: 'defect_bubble', label: '气泡缺陷', type: 'number', required: 0, sort: 6 },
    { key: 'defect_broken', label: '破损缺陷', type: 'number', required: 0, sort: 7 },
    { key: 'result', label: '检验结果', type: 'select', required: 1, sort: 8, options: '合格|pass,不合格|fail' }
  ],
  procurement_v2: [
    { key: 'item_name', label: '物品名称', type: 'text', required: 1, sort: 0 },
    { key: 'item_spec', label: '规格型号', type: 'text', required: 0, sort: 1 },
    { key: 'quantity', label: '数量', type: 'number', required: 1, sort: 2 },
    { key: 'supplier_name', label: '建议供应商', type: 'text', required: 0, sort: 3 },
    { key: 'estimated_price', label: '预估单价', type: 'number', required: 0, sort: 4 },
    { key: 'priority', label: '优先级', type: 'select', required: 1, sort: 5, options: '普通|normal,紧急|urgent,备用|backup' }
  ],
  qc_reports: [
    { key: 'title', label: '报告标题', type: 'text', required: 1, sort: 0 },
    { key: 'report_type', label: '报告类型', type: 'select', required: 1, sort: 1, options: '原料验收|raw_material,生产过程|production,成品出厂|finished' },
    { key: 'target_name', label: '检验对象', type: 'text', required: 0, sort: 2 },
    { key: 'batch_no', label: '批次号', type: 'text', required: 0, sort: 3 },
    { key: 'sample_qty', label: '抽样数量', type: 'number', required: 0, sort: 4 },
    { key: 'qualified_qty', label: '合格数量', type: 'number', required: 0, sort: 5 },
    { key: 'conclusion', label: '检验结论', type: 'select', required: 1, sort: 6, options: '合格|pass,不合格|fail,有条件|conditional' },
    { key: 'detail', label: '检验详情', type: 'textarea', required: 0, sort: 7 }
  ]
};

module.exports = function setupAdminRoutes(app, getDb, saveDatabase, requireRole) {
  var db;

  function ensureDb() {
    if (!db) db = getDb();
    return db;
  }

  function bumpVersion() {
    try {
      ensureDb().run("UPDATE admin_config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1");
      saveDatabase();
    } catch(e) {}
  }

  function broadcastUpdate(type, data) {
    var msg = 'data: ' + JSON.stringify({ type: type, data: data, ts: Date.now() }) + '\n\n';
    sseClients = sseClients.filter(function(c) {
      try { c.write(msg); return true; } catch(e) { return false; }
    });
  }

  // 初始化默认模块配置（首次运行时）
  function initDefaultModules() {
    var d = ensureDb();
    var count = d.exec("SELECT COUNT(*) FROM admin_module_config");
    if (count[0] && count[0].values[0][0] > 0) return;
    Object.keys(DEFAULT_MODULES).forEach(function(role) {
      DEFAULT_MODULES[role].forEach(function(m) {
        try {
          d.run("INSERT OR IGNORE INTO admin_module_config (role, module_key, module_label, sort_order, is_visible, icon) VALUES ('" +
            role + "','" + m.key + "','" + m.label.replace(/'/g,"''") + "'," + m.sort + ",1,'" + (m.icon||'') + "')");
        } catch(e) {}
      });
    });
    saveDatabase();
  }

  // 初始化默认字段配置
  function initDefaultFields() {
    var d = ensureDb();
    var count = d.exec("SELECT COUNT(*) FROM admin_field_config");
    if (count[0] && count[0].values[0][0] > 0) return;
    Object.keys(DEFAULT_FIELDS).forEach(function(mod) {
      DEFAULT_FIELDS[mod].forEach(function(f) {
        try {
          d.run("INSERT OR IGNORE INTO admin_field_config (module_key, field_key, field_label, field_type, is_required, is_visible, sort_order, options) VALUES ('" +
            mod + "','" + f.key + "','" + f.label.replace(/'/g,"''") + "','" + (f.type||'text') + "'," +
            (f.required||0) + ",1," + (f.sort||0) + ",'" + (f.options||'').replace(/'/g,"''") + "')");
        } catch(e) {}
      });
    });
    saveDatabase();
  }

  // 调用初始化
  setTimeout(function() {
    try { initDefaultModules(); initDefaultFields(); } catch(e) { console.error('admin init:', e.message); }
  }, 1000);

  // ===== SSE 实时推送 =====
  app.get('/admin/api/events', function(req, res) {
    // 允许跨域（Render海外部署）
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // 发送初始连接确认
    res.write('data: ' + JSON.stringify({ type: 'connected', ts: Date.now() }) + '\n\n');

    // 心跳（每25秒，防止Render超时断连）
    var heartbeat = setInterval(function() {
      try { res.write(': heartbeat\n\n'); } catch(e) { clearInterval(heartbeat); }
    }, 25000);

    sseClients.push(res);

    req.on('close', function() {
      clearInterval(heartbeat);
      sseClients = sseClients.filter(function(c) { return c !== res; });
    });
  });

  // ===== 获取配置版本号（前端轮询用） =====
  app.get('/admin/api/config-version', function(req, res) {
    try {
      var r = ensureDb().exec("SELECT version, updated_at FROM admin_config_version WHERE id = 1");
      if (r[0]) {
        res.json({ version: r[0].values[0][0], updated_at: r[0].values[0][1] });
      } else {
        res.json({ version: 1, updated_at: new Date().toISOString() });
      }
    } catch(e) {
      res.json({ version: 1, updated_at: new Date().toISOString() });
    }
  });

  // ===== 模块配置 =====

  // 获取所有角色的模块配置
  app.get('/admin/api/modules', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var r = d.exec("SELECT * FROM admin_module_config ORDER BY role, sort_order");
    if (!r[0]) return res.json({});
    var cols = r[0].columns;
    var rows = r[0].values.map(function(row) {
      var o = {}; cols.forEach(function(c,i){ o[c]=row[i]; }); return o;
    });
    // 按角色分组
    var result = {};
    rows.forEach(function(row) {
      if (!result[row.role]) result[row.role] = [];
      result[row.role].push(row);
    });
    res.json(result);
  });

  // 获取指定角色的模块配置（前端用，不需要admin权限）
  app.get('/admin/api/modules/:role', function(req, res) {
    var d = ensureDb();
    var role = req.params.role;
    var r = d.exec("SELECT * FROM admin_module_config WHERE role='" + role.replace(/'/g,"''") + "' ORDER BY sort_order");
    if (!r[0]) return res.json([]);
    var cols = r[0].columns;
    var rows = r[0].values.map(function(row) {
      var o = {}; cols.forEach(function(c,i){ o[c]=row[i]; }); return o;
    });
    res.json(rows);
  });

  // 批量保存某角色的模块排序
  app.post('/admin/api/modules/:role', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var role = req.params.role;
    var modules = req.body.modules; // [{module_key, module_label, icon, sort_order, is_visible}]
    if (!Array.isArray(modules)) return res.status(400).json({ error: '参数错误' });

    modules.forEach(function(m, idx) {
      var sortOrder = (typeof m.sort_order === 'number') ? m.sort_order : idx;
      var isVisible = m.is_visible !== undefined ? (m.is_visible ? 1 : 0) : 1;
      d.run("INSERT OR REPLACE INTO admin_module_config (role, module_key, module_label, sort_order, is_visible, icon, updated_at) VALUES ('" +
        role.replace(/'/g,"''") + "','" +
        (m.module_key||'').replace(/'/g,"''") + "','" +
        (m.module_label||'').replace(/'/g,"''") + "'," +
        sortOrder + "," + isVisible + ",'" +
        (m.icon||'').replace(/'/g,"''") + "',CURRENT_TIMESTAMP)");
    });
    bumpVersion();
    broadcastUpdate('module_config_changed', { role: role });
    res.json({ ok: true });
  });

  // 切换模块显示/隐藏
  app.patch('/admin/api/modules/:role/:moduleKey', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var role = req.params.role;
    var moduleKey = req.params.moduleKey;
    var is_visible = req.body.is_visible ? 1 : 0;
    d.run("UPDATE admin_module_config SET is_visible=" + is_visible + ", updated_at=CURRENT_TIMESTAMP WHERE role='" +
      role.replace(/'/g,"''") + "' AND module_key='" + moduleKey.replace(/'/g,"''") + "'");
    bumpVersion();
    saveDatabase();
    broadcastUpdate('module_config_changed', { role: role, module_key: moduleKey, is_visible: is_visible });
    res.json({ ok: true });
  });

  // ===== 字段配置 =====

  // 获取所有模块字段配置
  app.get('/admin/api/fields', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var r = d.exec("SELECT * FROM admin_field_config ORDER BY module_key, sort_order");
    if (!r[0]) return res.json({});
    var cols = r[0].columns;
    var rows = r[0].values.map(function(row) {
      var o = {}; cols.forEach(function(c,i){ o[c]=row[i]; }); return o;
    });
    var result = {};
    rows.forEach(function(row) {
      if (!result[row.module_key]) result[row.module_key] = [];
      result[row.module_key].push(row);
    });
    res.json(result);
  });

  // 获取指定模块的字段配置（前端用）
  app.get('/admin/api/fields/:module', function(req, res) {
    var d = ensureDb();
    var mod = req.params.module;
    var r = d.exec("SELECT * FROM admin_field_config WHERE module_key='" + mod.replace(/'/g,"''") + "' AND is_visible=1 ORDER BY sort_order");
    if (!r[0]) return res.json([]);
    var cols = r[0].columns;
    var rows = r[0].values.map(function(row) {
      var o = {}; cols.forEach(function(c,i){ o[c]=row[i]; }); return o;
    });
    res.json(rows);
  });

  // 批量保存某模块的字段配置
  app.post('/admin/api/fields/:module', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var mod = req.params.module;
    var fields = req.body.fields;
    if (!Array.isArray(fields)) return res.status(400).json({ error: '参数错误' });

    fields.forEach(function(f, idx) {
      var sortOrder = (typeof f.sort_order === 'number') ? f.sort_order : idx;
      var isVisible = f.is_visible !== undefined ? (f.is_visible ? 1 : 0) : 1;
      var isRequired = f.is_required ? 1 : 0;
      d.run("INSERT OR REPLACE INTO admin_field_config (module_key, field_key, field_label, field_type, is_required, is_visible, sort_order, options, updated_at) VALUES ('" +
        mod.replace(/'/g,"''") + "','" +
        (f.field_key||'').replace(/'/g,"''") + "','" +
        (f.field_label||'').replace(/'/g,"''") + "','" +
        (f.field_type||'text').replace(/'/g,"''") + "'," +
        isRequired + "," + isVisible + "," + sortOrder + ",'" +
        (f.options||'').replace(/'/g,"''") + "',CURRENT_TIMESTAMP)");
    });
    bumpVersion();
    broadcastUpdate('field_config_changed', { module: mod });
    res.json({ ok: true });
  });

  // 单个字段更新
  app.patch('/admin/api/fields/:module/:fieldKey', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var mod = req.params.module;
    var fieldKey = req.params.fieldKey;
    var updates = [];
    if (req.body.field_label !== undefined) updates.push("field_label='" + req.body.field_label.replace(/'/g,"''") + "'");
    if (req.body.is_visible !== undefined) updates.push("is_visible=" + (req.body.is_visible ? 1 : 0));
    if (req.body.sort_order !== undefined) updates.push("sort_order=" + parseInt(req.body.sort_order));
    if (req.body.options !== undefined) updates.push("options='" + req.body.options.replace(/'/g,"''") + "'");
    if (updates.length === 0) return res.json({ ok: true });
    updates.push("updated_at=CURRENT_TIMESTAMP");
    d.run("UPDATE admin_field_config SET " + updates.join(',') + " WHERE module_key='" +
      mod.replace(/'/g,"''") + "' AND field_key='" + fieldKey.replace(/'/g,"''") + "'");
    bumpVersion();
    saveDatabase();
    broadcastUpdate('field_config_changed', { module: mod, field_key: fieldKey });
    res.json({ ok: true });
  });

  // ===== 公告管理 =====

  // 获取所有公告
  app.get('/admin/api/announcements', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var r = d.exec("SELECT * FROM admin_announcements ORDER BY created_at DESC LIMIT 50");
    if (!r[0]) return res.json([]);
    var cols = r[0].columns;
    res.json(r[0].values.map(function(row) {
      var o = {}; cols.forEach(function(c,i){ o[c]=row[i]; }); return o;
    }));
  });

  // 获取活跃公告（前端用，根据角色过滤）
  app.get('/admin/api/announcements/active', function(req, res) {
    var d = ensureDb();
    var role = req.query.role || 'all';
    var r = d.exec("SELECT * FROM admin_announcements WHERE is_active=1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) ORDER BY created_at DESC LIMIT 5");
    if (!r[0]) return res.json([]);
    var cols = r[0].columns;
    var rows = r[0].values.map(function(row) {
      var o = {}; cols.forEach(function(c,i){ o[c]=row[i]; }); return o;
    });
    // 过滤目标角色
    rows = rows.filter(function(a) {
      if (a.target_roles === 'all') return true;
      var roles = a.target_roles.split(',');
      return roles.indexOf(role) !== -1;
    });
    res.json(rows);
  });

  // 发布公告
  app.post('/admin/api/announcements', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var title = (req.body.title||'').replace(/'/g,"''");
    var content = (req.body.content||'').replace(/'/g,"''");
    var targetRoles = (req.body.target_roles||'all').replace(/'/g,"''");
    var expiresAt = req.body.expires_at ? "'" + req.body.expires_at + "'" : 'NULL';
    var adminId = req.session && req.session.user ? req.session.user.id : 0;
    d.run("INSERT INTO admin_announcements (title, content, target_roles, is_active, created_by, expires_at) VALUES ('" +
      title + "','" + content + "','" + targetRoles + "',1," + adminId + "," + expiresAt + ")");
    saveDatabase();
    broadcastUpdate('announcement', { title: req.body.title, content: req.body.content, target_roles: req.body.target_roles });
    res.json({ ok: true });
  });

  // 切换公告状态
  app.patch('/admin/api/announcements/:id', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var id = parseInt(req.params.id);
    var is_active = req.body.is_active ? 1 : 0;
    d.run("UPDATE admin_announcements SET is_active=" + is_active + " WHERE id=" + id);
    saveDatabase();
    broadcastUpdate('announcement_changed', { id: id, is_active: is_active });
    res.json({ ok: true });
  });

  // 删除公告
  app.delete('/admin/api/announcements/:id', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    d.run("DELETE FROM admin_announcements WHERE id=" + parseInt(req.params.id));
    saveDatabase();
    res.json({ ok: true });
  });

  // ===== 统计数据（后台仪表盘） =====
  app.get('/admin/api/stats', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    function q(sql) {
      try { var r = d.exec(sql); return r[0] ? r[0].values[0][0] : 0; } catch(e) { return 0; }
    }
    res.json({
      orders_total: q("SELECT COUNT(*) FROM orders"),
      orders_pending: q("SELECT COUNT(*) FROM orders WHERE status='pending'"),
      orders_producing: q("SELECT COUNT(*) FROM orders WHERE status='producing'"),
      orders_completed: q("SELECT COUNT(*) FROM orders WHERE status='completed'"),
      users_total: q("SELECT COUNT(*) FROM users"),
      teams_total: q("SELECT COUNT(*) FROM teams"),
      products_total: q("SELECT COUNT(*) FROM products"),
      customers_total: q("SELECT COUNT(*) FROM customers"),
      raw_materials_low: q("SELECT COUNT(*) FROM raw_materials WHERE stock_qty <= min_alert"),
      proc_v2_pending: q("SELECT COUNT(*) FROM procurement_orders_v2 WHERE status='pending'"),
      qc_reports_today: q("SELECT COUNT(*) FROM qc_reports WHERE DATE(created_at)=DATE('now')"),
      sseClients: sseClients.length
    });
  });

  // ===== 用户管理（admin后台） =====
  app.get('/admin/api/users', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var r = d.exec("SELECT id, username, role, real_name, team_id, created_at FROM users ORDER BY id");
    if (!r[0]) return res.json([]);
    var cols = r[0].columns;
    res.json(r[0].values.map(function(row) {
      var o = {}; cols.forEach(function(c,i){ o[c]=row[i]; }); return o;
    }));
  });

  // 重置用户密码
  app.post('/admin/api/users/:id/reset-password', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var bcrypt = require('bcryptjs');
    var newPwd = req.body.password || '123456';
    var hash = bcrypt.hashSync(newPwd, 10);
    d.run("UPDATE users SET password='" + hash.replace(/'/g,"''") + "' WHERE id=" + parseInt(req.params.id));
    saveDatabase();
    res.json({ ok: true });
  });

  // 修改用户角色
  app.patch('/admin/api/users/:id', requireRole('admin'), function(req, res) {
    var d = ensureDb();
    var updates = [];
    if (req.body.role) updates.push("role='" + req.body.role.replace(/'/g,"''") + "'");
    if (req.body.real_name) updates.push("real_name='" + req.body.real_name.replace(/'/g,"''") + "'");
    if (updates.length === 0) return res.json({ ok: true });
    d.run("UPDATE users SET " + updates.join(',') + " WHERE id=" + parseInt(req.params.id));
    saveDatabase();
    res.json({ ok: true });
  });

  console.log('[admin] 可视化后台路由已加载');
};
