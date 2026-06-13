// routes_v2.js - 采购v2 + 品控模块路由
module.exports = function(app, db, dbRun, dbQuery, rowsToObjects, safe, addNotif, requireLogin, requireRole, canViewQcReports, upload, cleanupOldProcurementData) {

  // ============================================================
  // 采购v2（全员下单简化流程）
  // ============================================================

  // 列表
  app.get('/api/procurement-v2/orders', requireLogin, function(req, res) {
    var uid = req.session.user.id;
    var role = req.session.user.role;
    var sql = "SELECT * FROM procurement_orders_v2 WHERE 1=1";
    if (['warehouse','procurement','finance','admin'].indexOf(role) === -1) {
      sql += " AND applicant_id=" + uid;
    }
    var status = req.query.status || '';
    if (status) sql += " AND status='" + safe(status) + "'";
    sql += " ORDER BY created_at DESC";
    var rows = rowsToObjects(dbQuery(sql));
    res.json({ success: true, orders: rows });
  });

  // 统计
  app.get('/api/procurement-v2/stats', requireLogin, function(req, res) {
    var stats = {};
    ['pending','ordered','arrived','delivered','re_procure','cancelled'].forEach(function(s) {
      var r = dbQuery("SELECT COUNT(*) as c FROM procurement_orders_v2 WHERE status='" + s + "'");
      stats[s] = r[0] ? r[0].values[0][0] : 0;
    });
    res.json({ success: true, stats: stats });
  });

  // 详情
  app.get('/api/procurement-v2/orders/:id', requireLogin, function(req, res) {
    var rows = dbQuery("SELECT * FROM procurement_orders_v2 WHERE id=" + req.params.id);
    if (!rows[0]) return res.status(404).json({ error: '未找到' });
    var order = rowsToObjects(rows)[0];
    var logs = rowsToObjects(dbQuery("SELECT * FROM procurement_logs_v2 WHERE order_id=" + req.params.id + " ORDER BY created_at ASC"));
    res.json({ success: true, order: order, logs: logs });
  });

  // 创建
  app.post('/api/procurement-v2/orders', requireLogin, function(req, res) {
    var user = req.session.user;
    var item_name = req.body.item_name;
    if (!item_name) return res.status(400).json({ error: '物品名称不能为空' });
    var quantity = parseInt(req.body.quantity) || 1;
    var order_no = 'PO' + Date.now() + Math.random().toString(36).substr(2, 4);
    dbRun("INSERT INTO procurement_orders_v2 (order_no,applicant_id,applicant_name,applicant_role,item_name,item_spec,quantity,supplier_name,estimated_price) VALUES ('" + order_no + "'," + user.id + ",'" + safe(user.real_name) + "','" + user.role + "','" + safe(item_name) + "','" + safe(req.body.item_spec||'') + "'," + quantity + ",'" + safe(req.body.supplier_name||'') + "'," + (parseFloat(req.body.estimated_price)||0) + ")");
    addNotif('warehouse', null, 'proc_v2_new', '新采购申请', user.real_name + ' 提交了采购申请：' + item_name, null, 'procurement_v2', order_no);
    addNotif('procurement', null, 'proc_v2_new', '新采购申请', user.real_name + ' 提交了采购申请：' + item_name, null, 'procurement_v2', order_no);
    addNotif('finance', null, 'proc_v2_new', '新采购申请', user.real_name + ' 提交了采购申请：' + item_name, null, 'procurement_v2', order_no);
    addNotif('admin', null, 'proc_v2_new', '新采购申请', user.real_name + ' 提交了采购申请：' + item_name, null, 'procurement_v2', order_no);
    res.json({ success: true, order_no: order_no });
  });

  // 标记已下单（仓库/采购/财务/admin）
  app.put('/api/procurement-v2/orders/:id/mark-ordered', requireRole('warehouse','procurement','finance','admin'), function(req, res) {
    var oid = req.params.id;
    var user = req.session.user;
    dbRun("UPDATE procurement_orders_v2 SET status='ordered',ordered_at=CURRENT_TIMESTAMP,ordered_by=" + user.id + ",updated_at=CURRENT_TIMESTAMP WHERE id=" + oid);
    dbRun("INSERT INTO procurement_logs_v2 (order_id,operator_id,operator_name,operator_role,action,detail,old_status,new_status) VALUES (" + oid + "," + user.id + ",'" + safe(user.real_name) + "','" + user.role + "','标记已下单','已联系供应商下单','pending','ordered')");
    var ord = rowsToObjects(dbQuery("SELECT * FROM procurement_orders_v2 WHERE id=" + oid));
    if (ord[0]) {
      addNotif(null, ord[0].applicant_id, 'proc_v2_ordered', '采购已下单', '您的采购申请 ' + ord[0].item_name + ' 已下单', null, 'procurement_v2', ord[0].order_no);
    }
    res.json({ success: true });
  });

  // 上传采购记录（仓库/采购/财务/admin）
  app.post('/api/procurement-v2/orders/:id/upload-record', requireRole('warehouse','procurement','finance','admin'), upload.single('record_file'), function(req, res) {
    var oid = req.params.id;
    var user = req.session.user;
    var fileUrl = req.file ? ('/uploads/' + req.file.filename) : '';
    var expected = req.body.expected_arrival || '';
    var sql = "UPDATE procurement_orders_v2 SET ordered_record_url='" + safe(fileUrl) + "',expected_arrival='" + safe(expected) + "',updated_at=CURRENT_TIMESTAMP WHERE id=" + oid;
    dbRun(sql);
    dbRun("INSERT INTO procurement_logs_v2 (order_id,operator_id,operator_name,operator_role,action,detail,old_status,new_status) VALUES (" + oid + "," + user.id + ",'" + safe(user.real_name) + "','" + user.role + "','上传采购记录','上传了采购记录文件','ordered','ordered')");
    res.json({ success: true, file_url: fileUrl });
  });

  // 货到验收（仓库/采购/财务/admin）
  app.put('/api/procurement-v2/orders/:id/arrive', requireRole('warehouse','procurement','finance','admin'), function(req, res) {
    var oid = req.params.id;
    var user = req.session.user;
    var arrived_qty = parseInt(req.body.arrived_qty) || 0;
    dbRun("UPDATE procurement_orders_v2 SET status='arrived',arrived_at=CURRENT_TIMESTAMP,arrived_qty=" + arrived_qty + ",arrived_notes='" + safe(req.body.notes||'') + "',updated_at=CURRENT_TIMESTAMP WHERE id=" + oid);
    dbRun("INSERT INTO procurement_logs_v2 (order_id,operator_id,operator_name,operator_role,action,detail,old_status,new_status) VALUES (" + oid + "," + user.id + ",'" + safe(user.real_name) + "','" + user.role + "','货到验收','到货数量：' || " + arrived_qty + ",'ordered','arrived')");
    var ord = rowsToObjects(dbQuery("SELECT * FROM procurement_orders_v2 WHERE id=" + oid));
    if (ord[0]) {
      addNotif(null, ord[0].applicant_id, 'proc_v2_arrived', '采购已到货', '您的采购申请 ' + ord[0].item_name + ' 已到货，请验收', null, 'procurement_v2', ord[0].order_no);
    }
    res.json({ success: true });
  });

  // 交付（仓库/采购/财务/admin）
  app.put('/api/procurement-v2/orders/:id/deliver', requireRole('warehouse','procurement','finance','admin'), function(req, res) {
    var oid = req.params.id;
    var user = req.session.user;
    dbRun("UPDATE procurement_orders_v2 SET status='delivered',delivered_at=CURRENT_TIMESTAMP,delivered_by=" + user.id + ",updated_at=CURRENT_TIMESTAMP WHERE id=" + oid);
    dbRun("INSERT INTO procurement_logs_v2 (order_id,operator_id,operator_name,operator_role,action,detail,old_status,new_status) VALUES (" + oid + "," + user.id + ",'" + safe(user.real_name) + "','" + user.role + "','交付','流程完成交付','arrived','delivered')");
    var ord = rowsToObjects(dbQuery("SELECT * FROM procurement_orders_v2 WHERE id=" + oid));
    if (ord[0]) {
      addNotif(null, ord[0].applicant_id, 'proc_v2_delivered', '采购已交付', '您的采购申请 ' + ord[0].item_name + ' 已交付', null, 'procurement_v2', ord[0].order_no);
    }
    res.json({ success: true });
  });

  // 重新采购（仓库/采购/财务/admin）
  app.put('/api/procurement-v2/orders/:id/re-procure', requireRole('warehouse','procurement','finance','admin'), function(req, res) {
    var oid = req.params.id;
    var user = req.session.user;
    dbRun("UPDATE procurement_orders_v2 SET status='re_procure',updated_at=CURRENT_TIMESTAMP WHERE id=" + oid);
    dbRun("INSERT INTO procurement_logs_v2 (order_id,operator_id,operator_name,operator_role,action,detail,old_status,new_status) VALUES (" + oid + "," + user.id + ",'" + safe(user.real_name) + "','" + user.role + "','重新采购','货品异常，需重新采购','','re_procure')");
    var ord = rowsToObjects(dbQuery("SELECT * FROM procurement_orders_v2 WHERE id=" + oid));
    if (ord[0]) {
      addNotif(null, ord[0].applicant_id, 'proc_v2_reprocure', '需重新采购', '您的采购申请 ' + ord[0].item_name + ' 需重新采购', null, 'procurement_v2', ord[0].order_no);
    }
    res.json({ success: true });
  });

  // 取消
  app.put('/api/procurement-v2/orders/:id/cancel', requireLogin, function(req, res) {
    var oid = req.params.id;
    var user = req.session.user;
    var ord = rowsToObjects(dbQuery("SELECT * FROM procurement_orders_v2 WHERE id=" + oid));
    if (!ord[0]) return res.status(404).json({ error: '未找到' });
    if (ord[0].applicant_id != user.id && user.role != 'admin') return res.status(403).json({ error: '权限不足' });
    dbRun("UPDATE procurement_orders_v2 SET status='cancelled',cancel_reason='" + safe(req.body.reason||'') + "',updated_at=CURRENT_TIMESTAMP WHERE id=" + oid);
    dbRun("INSERT INTO procurement_logs_v2 (order_id,operator_id,operator_name,operator_role,action,detail,old_status,new_status) VALUES (" + oid + "," + user.id + ",'" + safe(user.real_name) + "','" + user.role + "','取消','取消采购','" + ord[0].status + "','cancelled')");
    res.json({ success: true });
  });

  // ============================================================
  // 品控报告（原料验收/生产过程/成品出厂）
  // ============================================================

  // 列表（权限隔离）
  app.get('/api/qc-reports', requireLogin, canViewQcReports, function(req, res) {
    var sql = "SELECT * FROM qc_reports WHERE 1=1";
    var type = req.query.type || '';
    if (type) sql += " AND report_type='" + safe(type) + "'";
    sql += " ORDER BY created_at DESC";
    var rows = rowsToObjects(dbQuery(sql));
    res.json({ success: true, reports: rows });
  });

  // 详情
  app.get('/api/qc-reports/:id', requireLogin, canViewQcReports, function(req, res) {
    var rows = dbQuery("SELECT * FROM qc_reports WHERE id=" + req.params.id);
    if (!rows[0]) return res.status(404).json({ error: '未找到' });
    res.json({ success: true, report: rowsToObjects(rows)[0] });
  });

  // 创建
  app.post('/api/qc-reports', requireRole('qc','admin'), upload.array('images', 5), function(req, res) {
    var user = req.session.user;
    var report_no = 'QC' + Date.now() + Math.random().toString(36).substr(2, 4);
    var imgs = req.files ? req.files.map(function(f) { return '/uploads/' + f.filename; }).join(',') : '';
    dbRun("INSERT INTO qc_reports (report_no,report_type,title,target_name,batch_no,inspector_id,inspector_name,report_date,sample_qty,qualified_qty,unqualified_qty,conclusion,images,detail) VALUES ('" + report_no + "','" + safe(req.body.report_type) + "','" + safe(req.body.title) + "','" + safe(req.body.target_name||'') + "','" + safe(req.body.batch_no||'') + "'," + user.id + ",'" + safe(user.real_name) + "','" + safe(req.body.report_date||'') + "'," + (parseInt(req.body.sample_qty)||0) + "," + (parseInt(req.body.qualified_qty)||0) + "," + (parseInt(req.body.unqualified_qty)||0) + ",'" + safe(req.body.conclusion||'') + "','" + safe(imgs) + "','" + safe(req.body.detail||'') + "')");
    addNotif('packaging', null, 'qc_report', '新品控报告', '有新品控报告：' + req.body.title, null, 'qc_report', report_no);
    addNotif('warehouse', null, 'qc_report', '新品控报告', '有新品控报告：' + req.body.title, null, 'qc_report', report_no);
    addNotif('clerk', null, 'qc_report', '新品控报告', '有新品控报告：' + req.body.title, null, 'qc_report', report_no);
    addNotif('admin', null, 'qc_report', '新品控报告', '有新品控报告：' + req.body.title, null, 'qc_report', report_no);
    res.json({ success: true, report_no: report_no });
  });

  // 更新
  app.put('/api/qc-reports/:id', requireRole('qc','admin'), upload.array('images', 5), function(req, res) {
    var rid = req.params.id;
    var imgs = req.files ? req.files.map(function(f) { return '/uploads/' + f.filename; }).join(',') : '';
    var sql = "UPDATE qc_reports SET title='" + safe(req.body.title) + "',report_type='" + safe(req.body.report_type) + "',target_name='" + safe(req.body.target_name||'') + "',batch_no='" + safe(req.body.batch_no||'') + "',report_date='" + safe(req.body.report_date||'') + "',sample_qty=" + (parseInt(req.body.sample_qty)||0) + ",qualified_qty=" + (parseInt(req.body.qualified_qty)||0) + ",unqualified_qty=" + (parseInt(req.body.unqualified_qty)||0) + ",conclusion='" + safe(req.body.conclusion||'') + "',detail='" + safe(req.body.detail||'') + "'";
    if (imgs) sql += ",images='" + safe(imgs) + "'";
    sql += " WHERE id=" + rid;
    dbRun(sql);
    res.json({ success: true });
  });

  // 删除
  app.delete('/api/qc-reports/:id', requireRole('qc','admin'), function(req, res) {
    dbRun("DELETE FROM qc_reports WHERE id=" + req.params.id);
    res.json({ success: true });
  });

  // ============================================================
  // 品控卫生检查
  // ============================================================

  // 列表
  app.get('/api/qc-checks', requireRole('qc','admin'), function(req, res) {
    var sql = "SELECT * FROM qc_hygiene_checks WHERE 1=1";
    var type = req.query.type || '';
    if (type) sql += " AND check_type='" + safe(type) + "'";
    var date = req.query.date || '';
    if (date) sql += " AND check_date='" + safe(date) + "'";
    sql += " ORDER BY created_at DESC";
    var rows = rowsToObjects(dbQuery(sql));
    res.json({ success: true, checks: rows });
  });

  // 创建
  app.post('/api/qc-checks', requireRole('qc','admin'), upload.array('photos', 5), function(req, res) {
    var user = req.session.user;
    var check_no = 'HY' + Date.now() + Math.random().toString(36).substr(2, 4);
    var photos = req.files ? req.files.map(function(f) { return '/uploads/' + f.filename; }) : [];
    dbRun("INSERT INTO qc_hygiene_checks (check_no,check_type,check_area,inspector_id,inspector_name,check_date,total_score,deduction_details,notes) VALUES ('" + check_no + "','" + safe(req.body.check_type) + "','" + safe(req.body.check_area||'') + "'," + user.id + ",'" + safe(user.real_name) + "','" + safe(req.body.check_date||'') + "'," + (100 - (parseInt(req.body.total_deduction)||0)) + ",'" + safe(req.body.deduction_details||'') + "','" + safe(req.body.notes||'') + "')");
    var checkId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    photos.forEach(function(url) {
      dbRun("INSERT INTO qc_hygiene_photos (check_id,photo_url) VALUES (" + checkId + ",'" + safe(url) + "')");
    });
    res.json({ success: true, check_no: check_no });
  });

  // ============================================================
  // 品控绩效考核
  // ============================================================

  app.get('/api/qc-performance', requireRole('qc','admin'), function(req, res) {
    var month = req.query.month || new Date().toISOString().slice(0, 7);
    // 质检次数
    var inspectCount = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM inspections WHERE inspector_id IS NOT NULL AND strftime('%Y-%m', inspected_at)='" + month + "'"))[0].c || 0;
    // 卫生检查次数
    var checkCount = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM qc_hygiene_checks WHERE strftime('%Y-%m', check_date||'-01')='" + month + "'"))[0].c || 0;
    // 报告数量
    var reportCount = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM qc_reports WHERE strftime('%Y-%m', report_date||'-01')='" + month + "'"))[0].c || 0;
    res.json({ success: true, performance: { month: month, inspect_count: inspectCount, check_count: checkCount, report_count: reportCount } });
  });

  // ============================================================
  // 品控出库单列表
  // ============================================================

  app.get('/api/qc-outbound-orders', requireRole('qc','admin'), function(req, res) {
    var rows = rowsToObjects(dbQuery("SELECT o.*, c.name as customer_name FROM outbound_orders o LEFT JOIN customers c ON o.customer_id=c.id ORDER BY o.created_at DESC LIMIT 50"));
    res.json({ success: true, orders: rows });
  });

  // ============================================================
  // 通知 - 标记已读
  // ============================================================

  app.put('/api/notifications/:id/read', requireLogin, function(req, res) {
    var uid = req.session.user.id;
    var role = req.session.user.role;
    dbRun("UPDATE notifications SET is_read=1 WHERE id=" + req.params.id + " AND (user_id=" + uid + " OR role='" + role + "')");
    res.json({ success: true });
  });

  app.put('/api/notifications/read-all', requireLogin, function(req, res) {
    var uid = req.session.user.id;
    var role = req.session.user.role;
    dbRun("UPDATE notifications SET is_read=1 WHERE (user_id=" + uid + " OR role='" + role + "') AND is_read=0");
    res.json({ success: true });
  });

  // 清理旧采购数据（启动时执行一次）
  try { cleanupOldProcurementData(); } catch(e) {}

};
