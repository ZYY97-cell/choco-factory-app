// ===== app_v2_addon.js - 采购v2 + 品控模块前端 =====
// 追加到 index.html 加载

// ===== 通知点击跳转 =====
window.onNotifJump = function(linkType, linkId) {
  if (!linkType) return;
  var map = {
    'order': function() { window._detailOrderId = linkId; navigate('clerk-detail'); },
    'procurement': function() { window._detailProcId = linkId; navigate('purchase-detail'); },
    'procurement_v2': function() { window._detailProcV2Id = linkId; navigate('procurement-v2-detail'); },
    'qc_report': function() { window._detailQcReportNo = linkId; navigate('qc-report-edit'); },
    'qc_check': function() { showToast('卫生检查详情暂不支持跳转', 'warning'); }
  };
  if (map[linkType]) map[linkType]();
};

// 重写通知渲染，支持 link_type 跳转
(function overrideRenderNotifications() {
  var orig = window.renderNotifications;
  window.renderNotifications = async function() {
    await window.loadNotifications();
    var notifs = window.notifications || [];
    var html = '<div class="page-header"><h1>🔔 消息通知</h1></div><div class="page-content">';
    if (notifs.length) {
      html += '<button class="btn btn-outline btn-sm" style="margin-bottom:10px" onclick="markAllRead()">全部已读</button>';
      notifs.forEach(function(n) {
        var hasLink = n.link_type && n.link_id;
        var clickFn = hasLink
          ? 'onNotifJump(\"' + esc(String(n.link_type)) + '\",' + n.link_id + ')'
          : 'markRead(' + n.id + ')';
        var typeLabel = { 'order_new':'新订单','order_dispatch':'派单','qc_pass':'质检通过','qc_fail':'质检不合格','pack_done':'打包完成','proc_approve':'采购审批','proc_v2_new':'采购申请','proc_v2_ordered':'已下单','proc_v2_arrived':'已到货','proc_v2_delivered':'已交付','proc_v2_reprocure':'重新采购','qc_report':'品控报告' }[n.type] || n.type;
        html += '<div class="notification-item ' + (n.is_read?'':'unread') + '" onclick="' + clickFn + '">'
              + '<div class="noti-type">' + typeLabel + '</div>'
              + '<div class="noti-title">' + esc(n.title) + '</div>'
              + (n.content ? '<div class="noti-content">' + esc(n.content) + '</div>' : '')
              + '<div class="noti-time">' + formatTime(n.created_at) + '</div>'
              + '</div>';
      });
    } else {
      html += '<div class="empty-state"><div class="empty-icon">🔔</div>暂无消息</div>';
    }
    html += '</div>' + renderTabBar('notifications');
    $('#app').innerHTML = html;
  };
})();

// ===== 采购v2（全员下单简化流程）=====

var PROC_V2_STATUS = {
  pending: { label: '待处理', color: '#D48806' },
  ordered: { label: '已下单', color: '#1890FF' },
  arrived: { label: '已到货', color: '#722ED1' },
  delivered: { label: '已交付', color: '#52C41A' },
  re_procure: { label: '重新采购', color: '#CF1322' },
  cancelled: { label: '已取消', color: '#999' }
};

async function renderProcurementV2List() {
  var stats = {};
  try { stats = await API.get('/api/procurement-v2/stats'); } catch(e) {}
  var orders = [];
  try { orders = await API.get('/api/procurement-v2/orders'); } catch(e) {}
  var statusFilter = window._procV2StatusFilter || '';
  var filtered = statusFilter ? orders.filter(function(o) { return o.status === statusFilter; }) : orders;

  var html = '<div class="page-header"><h1>🛒 采购申请</h1></div><div class="page-content">';
  html += '<div class="proc-v2-stats">';
  ['pending','ordered','arrived','delivered','re_procure'].forEach(function(s) {
    var st = PROC_V2_STATUS[s] || {};
    var isActive = window._procV2StatusFilter === s;
    html += '<div class="proc-v2-stat-item' + (isActive?' active':'') + '" style="border-left:3px solid ' + (st.color||'#999') + '" onclick="window._procV2StatusFilter=\'' + (isActive?'':s) + '\';renderProcurementV2List()">'
          + '<div class="proc-v2-stat-num" style="color:' + (st.color||'#999') + '">' + (stats[s]||0) + '</div>'
          + '<div class="proc-v2-stat-label">' + (st.label||s) + '</div></div>';
  });
  html += '</div>';
  html += '<button class="btn btn-primary btn-block" onclick="navigate(\'procurement-v2-new\')" style="margin-bottom:12px">+ 新建采购申请</button>';
  if (!filtered.length) {
    html += '<div class="empty-state"><div class="empty-icon">📭</div>暂无采购申请</div>';
  } else {
    filtered.forEach(function(o) {
      var st = PROC_V2_STATUS[o.status] || {};
      html += '<div class="proc-v2-card" onclick="window._detailProcV2Id=' + o.id + ';navigate(\'procurement-v2-detail\')">'
            + '<div class="proc-v2-card-header"><span class="proc-v2-item-name">' + esc(o.item_name) + '</span>'
            + '<span style="font-size:12px;padding:2px 8px;border-radius:10px;background:' + (st.color||'#999') + '20;color:' + (st.color||'#999') + '">' + (st.label||o.status) + '</span></div>'
            + '<div class="proc-v2-card-info"><span>申请人：' + esc(o.applicant_name || '') + '</span><span>数量：' + o.quantity + '</span></div>'
            + '<div class="proc-v2-card-footer">' + formatTime(o.created_at) + '</div></div>';
    });
  }
  html += '</div>' + renderTabBar('procurement-v2-list');
  $('#app').innerHTML = html;
}

async function renderProcurementV2New() {
  $('#app').innerHTML = '<div class="page-header"><h1>🛒 新建采购申请</h1></div><div class="page-content"><div class="card">'
    + '<div class="form-group"><label>物品名称 *</label><input class="form-input" id="pv2-item-name" placeholder="请输入采购物品名称"></div>'
    + '<div class="form-group"><label>规格型号</label><input class="form-input" id="pv2-item-spec" placeholder="规格/型号"></div>'
    + '<div class="form-group"><label>数量 *</label><input class="form-input" type="number" id="pv2-qty" value="1" min="1"></div>'
    + '<div class="form-group"><label>供应商名称</label><input class="form-input" id="pv2-supplier" placeholder="供应商名称"></div>'
    + '<div class="form-group"><label>预计价格（元）</label><input class="form-input" type="number" step="0.01" id="pv2-price" placeholder="0.00"></div>'
    + '<button class="btn btn-primary btn-block" onclick="submitProcurementV2New()">提交申请</button>'
    + '<button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate(\'procurement-v2-list\')">取消</button>'
    + '</div></div>' + renderTabBar('procurement-v2-new');
}

async function submitProcurementV2New() {
  var itemName = document.getElementById('pv2-item-name').value.trim();
  if (!itemName) return showToast('请填写物品名称', 'error');
  var res = await API.post('/api/procurement-v2/orders', {
    item_name: itemName,
    item_spec: document.getElementById('pv2-item-spec').value.trim(),
    quantity: parseInt(document.getElementById('pv2-qty').value) || 1,
    supplier_name: document.getElementById('pv2-supplier').value.trim(),
    estimated_price: parseFloat(document.getElementById('pv2-price').value) || 0
  });
  if (res.success) { showToast('采购申请已提交', 'success'); navigate('procurement-v2-list'); }
  else showToast(res.error || '提交失败', 'error');
}

async function renderProcurementV2Detail() {
  var oid = window._detailProcV2Id;
  if (!oid) return navigate('procurement-v2-list');
  var data = await API.get('/api/procurement-v2/orders/' + oid);
  if (!data.success) return navigate('procurement-v2-list');
  var o = data.order, logs = data.logs || [];
  var st = PROC_V2_STATUS[o.status] || {};
  var role = currentUser.role;
  var canOp = ['warehouse','procurement','finance','admin'].indexOf(role) !== -1;

  var html = '<div class="page-header"><h1>🛒 采购详情</h1></div><div class="page-content"><div class="card">'
    + '<div class="card-title">' + esc(o.item_name) + ' <span style="font-size:12px;padding:2px 8px;border-radius:10px;background:' + (st.color||'#999') + '20;color:' + (st.color||'#999') + '">' + (st.label||o.status) + '</span></div>'
    + '<div class="detail-row"><span class="label">申请单号</span><span class="value">' + esc(o.order_no) + '</span></div>'
    + '<div class="detail-row"><span class="label">申请人</span><span class="value">' + esc(o.applicant_name || '') + '</span></div>'
    + (o.item_spec ? '<div class="detail-row"><span class="label">规格</span><span class="value">' + esc(o.item_spec) + '</span></div>' : '')
    + '<div class="detail-row"><span class="label">数量</span><span class="value">' + o.quantity + '</span></div>'
    + (o.supplier_name ? '<div class="detail-row"><span class="label">供应商</span><span class="value">' + esc(o.supplier_name) + '</span></div>' : '')
    + (o.estimated_price ? '<div class="detail-row"><span class="label">预估价格</span><span class="value">¥' + parseFloat(o.estimated_price).toFixed(2) + '</span></div>' : '')
    + (o.ordered_record_url ? '<div class="detail-row"><span class="label">采购记录</span><span class="value"><a href="' + o.ordered_record_url + '" target="_blank">查看文件</a></span></div>' : '')
    + (o.expected_arrival ? '<div class="detail-row"><span class="label">预计到货</span><span class="value">' + esc(o.expected_arrival) + '</span></div>' : '')
    + (o.arrived_qty ? '<div class="detail-row"><span class="label">到货数量</span><span class="value">' + o.arrived_qty + '</span></div>' : '')
    + (o.arrived_notes ? '<div class="detail-row"><span class="label">验收备注</span><span class="value">' + esc(o.arrived_notes) + '</span></div>' : '')
    + '</div>';

  // 操作按钮
  if (canOp) {
    html += '<div class="card"><div class="card-title">操作</div>';
    if (o.status === 'pending') {
      html += '<button class="btn btn-primary btn-block" onclick="pv2MarkOrdered(' + o.id + ')" style="margin-bottom:8px">标记已下单</button>';
    }
    if (o.status === 'ordered') {
      html += '<div style="margin-bottom:8px"><input type="text" class="form-input" id="pv2-expected" placeholder="预计到货时间（如：3天后）"><br><br>'
            + '<label>上传采购记录</label><input type="file" id="pv2-record-file" class="form-input"></div>'
            + '<button class="btn btn-primary btn-block" onclick="pv2UploadRecord(' + o.id + ')" style="margin-bottom:8px">上传采购记录</button>';
    }
    if (o.status === 'ordered') {
      html += '<div style="margin-bottom:8px"><input type="number" class="form-input" id="pv2-arrive-qty" placeholder="实际到货数量" style="margin-bottom:8px">'
            + '<textarea class="form-input" id="pv2-arrive-notes" placeholder="验收备注"></textarea></div>'
            + '<button class="btn btn-primary btn-block" onclick="pv2Arrive(' + o.id + ')" style="margin-bottom:8px">确认到货</button>';
    }
    if (o.status === 'arrived') {
      html += '<button class="btn btn-primary btn-block" onclick="pv2Deliver(' + o.id + ')" style="margin-bottom:8px">交付</button>';
      html += '<button class="btn btn-danger btn-block" onclick="pv2ReProcure(' + o.id + ')" style="margin-bottom:8px">重新采购</button>';
    }
    html += '</div>';
  }

  // 流程日志
  if (logs.length) {
    html += '<div class="card"><div class="card-title">流程日志</div>';
    logs.forEach(function(lg) {
      html += '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px">'
            + '<span style="color:var(--primary)">' + esc(lg.operator_name || '') + '</span> '
            + esc(lg.action || '') + '<br><span style="font-size:11px;color:var(--text-secondary)">' + formatTime(lg.created_at) + '</span>'
            + '</div>';
    });
    html += '</div>';
  }

  html += '<button class="btn btn-outline btn-block" onclick="navigate(\'procurement-v2-list\')">返回</button></div>'
       + renderTabBar('procurement-v2-detail');
  $('#app').innerHTML = html;
}

async function pv2MarkOrdered(oid) {
  var res = await API.put('/api/procurement-v2/orders/' + oid + '/mark-ordered');
  if (res.success) { showToast('已标记下单', 'success'); renderProcurementV2Detail(); }
  else showToast(res.error || '操作失败', 'error');
}

async function pv2UploadRecord(oid) {
  var fileInput = document.getElementById('pv2-record-file');
  var expected = document.getElementById('pv2-expected').value.trim();
  if (!fileInput.files[0] && !expected) return showToast('请上传文件或填写预计到货时间', 'warning');
  var formData = new FormData();
  formData.append('expected_arrival', expected);
  if (fileInput.files[0]) formData.append('record_file', fileInput.files[0]);
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/procurement-v2/orders/' + oid + '/upload-record', true);
    xhr.onload = function() {
      var res = JSON.parse(xhr.responseText);
      if (res.success) { showToast('采购记录已上传', 'success'); renderProcurementV2Detail(); }
      else showToast(res.error || '上传失败', 'error');
    };
    xhr.send(formData);
  } catch(e) { showToast('上传失败', 'error'); }
}

async function pv2Arrive(oid) {
  var qty = document.getElementById('pv2-arrive-qty').value;
  var notes = document.getElementById('pv2-arrive-notes').value.trim();
  var res = await API.put('/api/procurement-v2/orders/' + oid + '/arrive', { arrived_qty: qty, notes: notes });
  if (res.success) { showToast('已确认到货', 'success'); renderProcurementV2Detail(); }
  else showToast(res.error || '操作失败', 'error');
}

async function pv2Deliver(oid) {
  var res = await API.put('/api/procurement-v2/orders/' + oid + '/deliver');
  if (res.success) { showToast('已交付', 'success'); renderProcurementV2Detail(); }
  else showToast(res.error || '操作失败', 'error');
}

async function pv2ReProcure(oid) {
  if (!confirm('确认需要重新采购？')) return;
  var res = await API.put('/api/procurement-v2/orders/' + oid + '/re-procure');
  if (res.success) { showToast('已标记重新采购', 'warning'); renderProcurementV2Detail(); }
  else showToast(res.error || '操作失败', 'error');
}

// ===== 品控报告 =====

var QC_REPORT_TYPES = { 'raw_material': '原料验收', 'production': '生产过程', 'finished': '成品出厂' };
var QC_CONCLUSIONS = { 'pass': '合格', 'fail': '不合格', 'conditional': '条件通过' };

async function renderQcReports() {
  var reports = [];
  try { reports = await API.get('/api/qc-reports'); } catch(e) {}
  var typeFilter = window._qcReportTypeFilter || '';
  var filtered = typeFilter ? reports.filter(function(r) { return r.report_type === typeFilter; }) : reports;

  var html = '<div class="page-header"><h1>📋 品控报告</h1></div><div class="page-content">';
  html += '<div style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;padding-bottom:4px">';
  ['', 'raw_material', 'production', 'finished'].forEach(function(t) {
    var label = t ? QC_REPORT_TYPES[t] : '全部';
    html += '<button class="btn btn-sm ' + (typeFilter===t ? 'btn-primary' : 'btn-outline') + '" onclick="window._qcReportTypeFilter=\'' + t + '\';renderQcReports()">' + label + '</button>';
  });
  html += '</div>';

  var canCreate = ['qc','admin'].indexOf(currentUser.role) !== -1;
  if (canCreate) {
    html += '<button class="btn btn-primary btn-block" onclick="navigate(\'qc-report-edit\')" style="margin-bottom:12px">+ 新建报告</button>';
  }

  if (!filtered.length) {
    html += '<div class="empty-state"><div class="empty-icon">📋</div>暂无品控报告</div>';
  } else {
    filtered.forEach(function(r) {
      var conclusionColor = { 'pass':'#52C41A','fail':'#CF1322','conditional':'#D48806' }[r.conclusion] || '#999';
      html += '<div class="qc-report-card" onclick="window._detailQcReportId=' + r.id + ';navigate(\'qc-report-edit\')">'
            + '<div class="qc-report-header"><span class="qc-report-title">' + esc(r.title) + '</span>'
            + (r.conclusion ? '<span style="font-size:12px;padding:2px 8px;border-radius:10px;background:' + conclusionColor + '20;color:' + conclusionColor + '">' + (QC_CONCLUSIONS[r.conclusion]||r.conclusion) + '</span>' : '')
            + '</div>'
            + '<div class="qc-report-meta"><span>类型：' + (QC_REPORT_TYPES[r.report_type]||r.report_type) + '</span>'
            + (r.batch_no ? '<span>批次：' + esc(r.batch_no) + '</span>' : '') + '</div>'
            + '<div class="qc-report-footer">' + formatTime(r.report_date) + '</div></div>';
    });
  }
  html += '</div>' + renderTabBar('qc-reports');
  $('#app').innerHTML = html;
}

async function renderQcReportEdit() {
  var rid = window._detailQcReportId || 0;
  var report = null;
  if (rid) {
    try {
      var res = await API.get('/api/qc-reports/' + rid);
      if (res.success) report = res.report;
    } catch(e) {}
  }

  var isView = rid && ['packaging','warehouse','clerk'].indexOf(currentUser.role) !== -1;
  var canEdit = ['qc','admin'].indexOf(currentUser.role) !== -1;

  var reportDate = report ? report.report_date : (new Date().toISOString().slice(0,10));
  var reportType = report ? report.report_type : 'raw_material';

  var html = '<div class="page-header"><h1>' + (rid ? (isView ? '查看报告' : '编辑报告') : '新建报告') + '</h1></div><div class="page-content"><div class="card">';
  if (report) {
    html += '<div class="detail-row"><span class="label">报告编号</span><span class="value">' + esc(report.report_no) + '</span></div>';
  }
  html += '<div class="form-group"><label>报告类型 *</label><select class="form-input" id="qcr-type">'
        + '<option value="raw_material"' + (reportType==='raw_material'?' selected':'') + '>原料验收</option>'
        + '<option value="production"' + (reportType==='production'?' selected':'') + '>生产过程</option>'
        + '<option value="finished"' + (reportType==='finished'?' selected':'') + '>成品出厂</option></select></div>'
        + '<div class="form-group"><label>报告标题 *</label><input class="form-input" id="qcr-title" value="' + (report?esc(report.title):'') + '" placeholder="报告标题"></div>'
        + '<div class="form-group"><label>检测对象</label><input class="form-input" id="qcr-target" value="' + (report?esc(report.target_name||''):'') + '" placeholder="原料/产品名称"></div>'
        + '<div class="form-group"><label>批次号</label><input class="form-input" id="qcr-batch" value="' + (report?esc(report.batch_no||''):'') + '" placeholder="批次号"></div>'
        + '<div class="form-group"><label>报告日期</label><input class="form-input" type="date" id="qcr-date" value="' + reportDate + '"></div>'
        + '<div style="display:flex;gap:8px"><div class="form-group" style="flex:1"><label>抽样数量</label><input class="form-input" type="number" id="qcr-sample-qty" value="' + (report?(report.sample_qty||0):'') + '"></div>'
        + '<div class="form-group" style="flex:1"><label>合格数</label><input class="form-input" type="number" id="qcr-qualified" value="' + (report?(report.qualified_qty||0):'') + '"></div>'
        + '<div class="form-group" style="flex:1"><label>不合格数</label><input class="form-input" type="number" id="qcr-unqualified" value="' + (report?(report.unqualified_qty||0):'') + '"></div></div>'
        + '<div class="form-group"><label>结论</label><select class="form-input" id="qcr-conclusion">'
        + '<option value="">请选择</option><option value="pass"' + (report&&report.conclusion==='pass'?' selected':'') + '>合格</option>'
        + '<option value="fail"' + (report&&report.conclusion==='fail'?' selected':'') + '>不合格</option>'
        + '<option value="conditional"' + (report&&report.conclusion==='conditional'?' selected':'') + '>条件通过</option></select></div>'
        + '<div class="form-group"><label>详细描述</label><textarea class="form-input" id="qcr-detail" placeholder="检测详情、问题描述等">' + (report?esc(report.detail||''):'') + '</textarea></div>'
        + '<div class="form-group"><label>上传图片</label><input type="file" class="form-input" id="qcr-images" multiple accept="image/*"></div>';

  if (canEdit) {
    html += '<button class="btn btn-primary btn-block" onclick="submitQcReport(' + (rid||0) + ')">' + (rid?'保存修改':'提交报告') + '</button>';
    if (rid) {
      html += '<button class="btn btn-danger btn-block" style="margin-top:8px" onclick="deleteQcReport(' + rid + ')">删除报告</button>';
    }
  }
  html += '<button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate(\'qc-reports\')">返回</button></div></div>'
       + renderTabBar('qc-report-edit');
  $('#app').innerHTML = html;
}

async function submitQcReport(rid) {
  var type = document.getElementById('qcr-type').value;
  var title = document.getElementById('qcr-title').value.trim();
  if (!title) return showToast('请填写报告标题', 'error');
  var imagesInput = document.getElementById('qcr-images');
  var hasNewImages = imagesInput && imagesInput.files && imagesInput.files.length > 0;

  if (rid && !hasNewImages) {
    var res = await API.put('/api/qc-reports/' + rid, {
      report_type: type, title: title,
      target_name: document.getElementById('qcr-target').value.trim(),
      batch_no: document.getElementById('qcr-batch').value.trim(),
      report_date: document.getElementById('qcr-date').value,
      sample_qty: parseInt(document.getElementById('qcr-sample-qty').value) || 0,
      qualified_qty: parseInt(document.getElementById('qcr-qualified').value) || 0,
      unqualified_qty: parseInt(document.getElementById('qcr-unqualified').value) || 0,
      conclusion: document.getElementById('qcr-conclusion').value,
      detail: document.getElementById('qcr-detail').value.trim()
    });
    if (res.success) { showToast('报告已更新', 'success'); navigate('qc-reports'); }
    else showToast(res.error || '保存失败', 'error');
    return;
  }

  var formData = new FormData();
  formData.append('report_type', type);
  formData.append('title', title);
  formData.append('target_name', document.getElementById('qcr-target').value.trim());
  formData.append('batch_no', document.getElementById('qcr-batch').value.trim());
  formData.append('report_date', document.getElementById('qcr-date').value);
  formData.append('sample_qty', parseInt(document.getElementById('qcr-sample-qty').value) || 0);
  formData.append('qualified_qty', parseInt(document.getElementById('qcr-qualified').value) || 0);
  formData.append('unqualified_qty', parseInt(document.getElementById('qcr-unqualified').value) || 0);
  formData.append('conclusion', document.getElementById('qcr-conclusion').value);
  formData.append('detail', document.getElementById('qcr-detail').value.trim());
  if (hasNewImages) {
    for (var i = 0; i < imagesInput.files.length; i++) {
      formData.append('images', imagesInput.files[i]);
    }
  }
  try {
    var xhr = new XMLHttpRequest();
    xhr.open(rid ? 'PUT' : 'POST', rid ? '/api/qc-reports/' + rid : '/api/qc-reports', true);
    xhr.onload = function() {
      var res = JSON.parse(xhr.responseText);
      if (res.success) { showToast(rid ? '报告已更新' : '报告已提交', 'success'); navigate('qc-reports'); }
      else showToast(res.error || '提交失败', 'error');
    };
    xhr.send(formData);
  } catch(e) { showToast('提交失败', 'error'); }
}

async function deleteQcReport(rid) {
  if (!confirm('确认删除此报告？')) return;
  var res = await API.delete('/api/qc-reports/' + rid);
  if (res.success) { showToast('报告已删除', 'success'); navigate('qc-reports'); }
  else showToast(res.error || '删除失败', 'error');
}

// ===== 品控卫生检查 =====

var QC_CHECK_TYPES = { 'personal': '人员卫生', 'equipment': '设备卫生', 'environment': '环境卫生', 'raw_material': '原料卫生' };
var QC_DEDUCTION_ITEMS = {
  personal: ['指甲过长/指甲油','首饰未摘除','工服不整洁','未戴口罩/帽子','手部未消毒'],
  equipment: ['设备残留物','设备未清洁','温度控制异常','设备维护记录缺失'],
  environment: ['地面有杂物','排水沟堵塞','墙壁天花板污渍','垃圾桶未盖'],
  raw_material: ['原料过期','原料存放不当','原料包装破损','无合格证明']
};

async function renderQcChecks() {
  var checks = [];
  try { checks = await API.get('/api/qc-checks'); } catch(e) {}
  var typeFilter = window._qcCheckTypeFilter || '';
  var dateFilter = window._qcCheckDateFilter || '';
  var filtered = checks.filter(function(c) {
    if (typeFilter && c.check_type !== typeFilter) return false;
    if (dateFilter && c.check_date !== dateFilter) return false;
    return true;
  });

  var html = '<div class="page-header"><h1>🧼 卫生检查</h1></div><div class="page-content">';
  html += '<div style="display:flex;gap:6px;margin-bottom:8px;overflow-x:auto">';
  ['' ,'personal','equipment','environment','raw_material'].forEach(function(t) {
    var label = t ? QC_CHECK_TYPES[t] : '全部';
    html += '<button class="btn btn-sm ' + (typeFilter===t?'btn-primary':'btn-outline') + '" onclick="window._qcCheckTypeFilter=\'' + t + '\';renderQcChecks()">' + label + '</button>';
  });
  html += '</div>';
  html += '<div style="margin-bottom:12px"><input type="date" class="form-input" id="qc-check-date-filter" value="' + (dateFilter||'') + '" onchange="window._qcCheckDateFilter=this.value;renderQcChecks()" style="width:160px;display:inline-block">'
        + '<button class="btn btn-sm btn-outline" onclick="window._qcCheckDateFilter=\'\';renderQcChecks()" style="margin-left:6px">清除日期</button></div>';

  var canCreate = ['qc','admin'].indexOf(currentUser.role) !== -1;
  if (canCreate) {
    html += '<button class="btn btn-primary btn-block" onclick="navigate(\'qc-check-new\')" style="margin-bottom:12px">+ 新建检查</button>';
  }

  if (!filtered.length) {
    html += '<div class="empty-state"><div class="empty-icon">🧼</div>暂无卫生检查记录</div>';
  } else {
    filtered.forEach(function(c) {
      html += '<div class="qc-check-card" onclick="window._detailQcCheckId=' + c.id + ';showQcCheckDetail(' + c.id + ')">'
            + '<div class="qc-check-header"><span class="qc-check-type">' + (QC_CHECK_TYPES[c.check_type]||c.check_type) + '</span>'
            + '<span class="qc-check-score">得分：' + (c.total_score||100) + '</span></div>'
            + (c.check_area ? '<div class="qc-check-area">区域：' + esc(c.check_area) + '</div>' : '')
            + '<div class="qc-check-footer">' + formatTime(c.check_date) + ' · ' + esc(c.inspector_name || '') + '</div></div>';
    });
  }
  html += '</div>' + renderTabBar('qc-checks');
  $('#app').innerHTML = html;
}

async function renderQcCheckNew() {
  var today = new Date().toISOString().slice(0,10);
  var html = '<div class="page-header"><h1>🧼 新建卫生检查</h1></div><div class="page-content"><div class="card">'
    + '<div class="form-group"><label>检查类型 *</label><select class="form-input" id="qcc-type" onchange="renderDeductionItems()">'
    + '<option value="personal">人员卫生</option><option value="equipment">设备卫生</option>'
    + '<option value="environment">环境卫生</option><option value="raw_material">原料卫生</option></select></div>'
    + '<div class="form-group"><label>检查区域</label><input class="form-input" id="qcc-area" placeholder="具体区域/工位"></div>'
    + '<div class="form-group"><label>检查日期</label><input class="form-input" type="date" id="qcc-date" value="' + today + '"></div>'
    + '<div id="qcc-deduction-area" style="margin-top:12px"><div class="card-title">扣分项目（点击选中扣分项，每项扣2分）</div><div id="qcc-deduction-items"></div>'
    + '<div style="margin-top:8px;font-size:13px">总分：<span id="qcc-total-score" style="font-weight:700;color:var(--primary)">100</span> 分（已扣 <span id="qcc-deduction" style="font-weight:700;color:var(--danger)">0</span> 分）</div></div>'
    + '<div class="form-group" style="margin-top:12px"><label>备注</label><textarea class="form-input" id="qcc-notes" placeholder="检查备注"></textarea></div>'
    + '<div class="form-group"><label>上传照片</label><input type="file" class="form-input" id="qcc-photos" multiple accept="image/*"></div>'
    + '<button class="btn btn-primary btn-block" onclick="submitQcCheck()">提交检查</button>'
    + '<button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate(\'qc-checks\')">取消</button>'
    + '</div></div>' + renderTabBar('qc-check-new');
  $('#app').innerHTML = html;
  renderDeductionItems();
}

function renderDeductionItems() {
  var type = document.getElementById('qcc-type').value;
  var items = QC_DEDUCTION_ITEMS[type] || [];
  var html = items.map(function(item, idx) {
    return '<button class="score-btn" id="ded-item-' + idx + '" onclick="toggleDeduction(' + idx + ')" style="margin:4px;padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer">' + item + '</button>';
  }).join('');
  document.getElementById('qcc-deduction-items').innerHTML = html;
  window._selectedDeductions = [];
  updateScoreDisplay();
}

function toggleDeduction(idx) {
  var btn = document.getElementById('ded-item-' + idx);
  var arr = window._selectedDeductions || [];
  var pos = arr.indexOf(idx);
  if (pos !== -1) {
    arr.splice(pos, 1);
    btn.style.background = '#fff';
    btn.style.borderColor = '#ddd';
  } else {
    arr.push(idx);
    btn.style.background = '#FFF1F0';
    btn.style.borderColor = '#FF4D4F';
  }
  window._selectedDeductions = arr;
  updateScoreDisplay();
}

function updateScoreDisplay() {
  var deduction = (window._selectedDeductions || []).length * 2;
  var totalScore = Math.max(100 - deduction, 0);
  var dedEl = document.getElementById('qcc-deduction');
  var totalEl = document.getElementById('qcc-total-score');
  if (dedEl) dedEl.textContent = deduction;
  if (totalEl) totalEl.textContent = totalScore;
}

async function submitQcCheck() {
  var type = document.getElementById('qcc-type').value;
  var area = document.getElementById('qcc-area').value.trim();
  var date = document.getElementById('qcc-date').value;
  var notes = document.getElementById('qcc-notes').value.trim();
  var deductionDetails = (window._selectedDeductions || []).map(function(idx) {
    var items = QC_DEDUCTION_ITEMS[type] || [];
    return items[idx] || '';
  }).join('; ');
  var totalDeduction = (window._selectedDeductions || []).length * 2;

  var formData = new FormData();
  formData.append('check_type', type);
  formData.append('check_area', area);
  formData.append('check_date', date);
  formData.append('total_deduction', totalDeduction);
  formData.append('deduction_details', deductionDetails);
  formData.append('notes', notes);
  var photosInput = document.getElementById('qcc-photos');
  if (photosInput && photosInput.files) {
    for (var i = 0; i < photosInput.files.length; i++) {
      formData.append('photos', photosInput.files[i]);
    }
  }
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/qc-checks', true);
    xhr.onload = function() {
      var res = JSON.parse(xhr.responseText);
      if (res.success) { showToast('卫生检查已提交', 'success'); navigate('qc-checks'); }
      else showToast(res.error || '提交失败', 'error');
    };
    xhr.send(formData);
  } catch(e) { showToast('提交失败', 'error'); }
}

async function showQcCheckDetail(cid) {
  showToast('检查详情开发中...', 'warning');
}

// ===== 品控绩效考核 =====

async function renderQcPerformance() {
  var month = window._qcPerfMonth || new Date().toISOString().slice(0,7);
  var perf = { inspect_count: 0, check_count: 0, report_count: 0 };
  try {
    var res = await API.get('/api/qc-performance?month=' + encodeURIComponent(month));
    if (res.success) perf = res.performance;
  } catch(e) {}

  var totalScore = (perf.inspect_count||0) + (perf.check_count||0)*2 + (perf.report_count||0)*3;

  var html = '<div class="page-header"><h1>📈 绩效考核</h1></div><div class="page-content">'
    + '<div style="margin-bottom:12px"><input type="month" class="form-input" value="' + month + '" onchange="window._qcPerfMonth=this.value;renderQcPerformance()" style="width:160px;display:inline-block">'
    + '<button class="btn btn-sm btn-outline" onclick="window._qcPerfMonth=\'\';renderQcPerformance()" style="margin-left:6px">本月</button></div>'
    + '<div class="card"><div class="card-title">📊 ' + month + ' 绩效汇总</div>'
    + '<div class="stats-grid">'
    + '<div class="stat-card"><div class="stat-value">' + (perf.inspect_count||0) + '</div><div class="stat-label">质检次数</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + (perf.check_count||0) + '</div><div class="stat-label">卫生检查次数</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + (perf.report_count||0) + '</div><div class="stat-label">报告数量</div></div>'
    + '</div></div>'
    + '<div class="card" style="margin-top:12px"><div class="card-title">💡 绩效说明</div>'
    + '<div class="detail-row"><span class="label">质检次数</span><span class="value">每次质检 +1 分</span></div>'
    + '<div class="detail-row"><span class="label">卫生检查</span><span class="value">每次检查 +2 分</span></div>'
    + '<div class="detail-row"><span class="label">品控报告</span><span class="value">每篇报告 +3 分</span></div>'
    + '<div class="detail-row"><span class="label">总分</span><span class="value" style="font-weight:700;color:var(--primary)">' + totalScore + ' 分</span></div>'
    + '</div></div>' + renderTabBar('qc-performance');
  $('#app').innerHTML = html;
}

// ===== 品控出库单查看 =====

async function renderQcOutbound() {
  var orders = [];
  try { orders = await API.get('/api/qc-outbound-orders'); } catch(e) {}
  var html = '<div class="page-header"><h1>🚚 出库单</h1></div><div class="page-content">';
  if (!orders.length) {
    html += '<div class="empty-state"><div class="empty-icon">🚚</div>暂无出库单</div>';
  } else {
    orders.forEach(function(o) {
      html += '<div class="order-item" onclick="showToast(\'出库单详情开发中\',\'warning\')">'
            + '<div class="order-item-header"><span class="order-customer">' + esc(o.customer_name || '') + '</span>' + statusTag(o.status) + '</div>'
            + '<div class="order-product">' + esc(o.product_name || '') + '</div>'
            + '<div class="order-footer"><span class="order-no">' + esc(o.order_no || '') + '</span><span class="order-qty">出库 ' + (o.outbound_qty||0) + ' 个</span></div></div>';
    });
  }
  html += '</div>' + renderTabBar('qc-outbound');
  $('#app').innerHTML = html;
}
