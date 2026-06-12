// ===== 巧克力工厂生产管控 - 前端核心逻辑（v2） =====
console.log('app.js loaded, v2.1');

const API = {
  async request(url, options = {}) {
    const resp = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    return resp.json();
  },
  get: (url) => API.request(url),
  post: (url, body) => API.request(url, { method: 'POST', body }),
  put: (url, body) => API.request(url, { method: 'PUT', body }),
  delete: (url) => API.request(url, { method: 'DELETE' })
};

// 全局状态
let currentUser = null;
let currentPage = '';
let notifications = [];

// ===== 工具函数 =====
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(msg, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  // 分级显示时长：error/warning 4s, success 2.5s, 其他 3s
  var dur = type === 'error' || type === 'warning' ? 4000 : type === 'success' ? 2500 : 3000;
  setTimeout(() => t.remove(), dur);
}

const STATUS_MAP = {
  pending: { label: '待派单', class: 'status-pending' },
  dispatched: { label: '已派单', class: 'status-dispatched' },
  producing: { label: '生产中', class: 'status-produced' },
  produced: { label: '生产完工', class: 'status-produced' },
  inspecting: { label: '质检中', class: 'status-inspecting' },
  qc_passed: { label: '质检通过', class: 'status-qc_passed' },
  qc_failed: { label: '质检不合格', class: 'status-qc_failed' },
  rework: { label: '待补产', class: 'status-rework' },
  packaging: { label: '打包中', class: 'status-packaging' },
  completed: { label: '已完成', class: 'status-completed' },
  cancelled: { label: '已取消', class: 'status-cancelled' }
};

function statusTag(status) {
  const s = STATUS_MAP[status] || { label: status, class: '' };
  return `<span class="status-tag ${s.class}">${s.label}</span>`;
}

// 悬浮采购按钮
function initFloatingButton() {
  if (document.querySelector('.fab-btn')) return;
  var fab = document.createElement('div');
  fab.className = 'fab-btn';
  fab.innerHTML = '🛒';
  fab.title = '采购申请';
  fab.onclick = function() { navigate('purchase-request'); };
  document.body.appendChild(fab);
}

function formatTime(t) {
  if (!t) return '-';
  return t.replace('T', ' ').slice(0, 16);
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===== 页面路由 =====
function navigate(page) {
  currentPage = page;
  const container = $('#app');
  container.innerHTML = '';
  container.className = 'app-container';
  
  switch(page) {
    case 'login': renderLogin(); break;
    case 'clerk-orders': renderClerkOrders(); break;
    case 'clerk-new': renderClerkNewOrder(); break;
    case 'clerk-detail': renderOrderDetail('clerk'); break;
    case 'supervisor-pending': renderSupervisorPending(); break;
    case 'supervisor-dispatch': renderSupervisorDispatch(); break;
    case 'supervisor-stats': renderSupervisorStats(); break;
    case 'supervisor-requisition': renderRequisition(); break;
    case 'team-list': renderTeamOrders(); break;
    case 'team-produce': renderTeamProduce(); break;
    case 'team-rework': renderTeamRework(); break;
    case 'qc-list': renderQCOrders(); break;
    case 'qc-inspect': renderQCInspect(); break;
    case 'qc-requisition': renderRequisition(); break;
    case 'pack-list': renderPackOrders(); break;
    case 'pack-complete': renderPackComplete(); break;
    case 'pack-requisition': renderPackRequisition(); break;
    case 'console-overview': renderConsoleOverview(); break;
    case 'console-orders': renderConsoleOrders(); break;
    case 'finance-overview': renderFinanceOverview(); break;
    case 'finance-wages': renderFinanceWages(); break;
    case 'finance-prices': renderFinancePrices(); break;
    case 'warehouse-materials': renderWarehouseMaterials(); break;
    case 'warehouse-inner': renderWarehouseInner(); break;
    case 'warehouse-outer': renderWarehouseOuter(); break;
    case 'warehouse-finished': renderWarehouseFinished(); break;
    case 'warehouse-outbound': renderWarehouseOutbound(); break;
    case 'warehouse-ledger': renderWarehouseLedger(); break;
    case 'warehouse-inbound': renderWarehouseInbound(); break;
    case 'warehouse-auxiliary': renderWarehouseAuxiliary(); break;
    case 'warehouse-receiving': renderWarehouseReceiving(); break;
    case 'purchase-request': renderPurchaseRequestForm(); break;
    case 'my-purchases': renderMyPurchases(); break;
    case 'purchase-list': renderPurchaseList(); break;
    case 'purchase-detail': renderPurchaseDetail(); break;
    case 'warehouse-procurement': renderProcurementList(); break;
    case 'warehouse-procurement-new': renderProcurementNew(); break;
    case 'warehouse-procurement-detail': renderProcurementDetail(); break;
    case 'warehouse-suppliers': renderSuppliers(); break;
    case 'warehouse-supplier-certs': renderSupplierCerts(); break;
    case 'preparation-list': renderPreparationList(); break;
    case 'preparation-form': renderPreparationForm(); break;
    case 'notifications': renderNotifications(); break;
    case 'stats': renderStats(); break;
    case 'admin': renderAdmin(); break;
    default: renderDashboard(); break;
  }
}

// ===== 登录页 =====
function renderLogin() {
  $('#app').innerHTML = `
    <div class="login-page">
      <div class="login-logo">🍫</div>
      <div class="login-title">巧克力工厂生产管控</div>
      <div class="login-subtitle">全流程线上流转管理系统</div>
      <div class="login-form">
        <div class="form-group">
          <label>账号</label>
          <input class="form-input" id="login-username" placeholder="请输入用户名" autocomplete="username">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input class="form-input" id="login-password" type="password" placeholder="请输入密码" autocomplete="current-password">
        </div>
        <button class="btn btn-primary" onclick="doLogin()">登 录</button>
        <div style="margin-top:16px;font-size:12px;color:#999;text-align:center">
          预设账号：wenyuan / shengchang / shengchanA<br>zhijian / dabao / zongkong / caiwu<br>cangguan / caigou / admin · 密码 123456
        </div>
      </div>
    </div>`;
}

async function doLogin() {
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value.trim();
  if (!username || !password) return showToast('请输入用户名和密码', 'error');
  
  const res = await API.post('/api/login', { username, password });
  if (res.success) {
    currentUser = res.user;
    showToast('登录成功', 'success');
    try { loadNotifications(); } catch(e) {}
    navigate('dashboard');
  } else {
    showToast(res.msg || '登录失败', 'error');
  }
}

// ===== 仪表板 =====
// 根据角色获取对应的订单列表页
function getOrderListPage(role) {
  var map = {
    clerk: 'clerk-orders',
    supervisor: 'supervisor-pending',
    team: 'team-list',
    qc: 'qc-list',
    packaging: 'pack-list',
    console: 'console-orders',
    finance: 'clerk-orders',
    warehouse: 'clerk-orders',
    procurement: 'clerk-orders',
    preparation: 'clerk-orders',
    admin: 'clerk-orders'
  };
  return map[role] || 'clerk-orders';
}

async function renderDashboard() {
  try {
  const roleTabs = {
    clerk: [
      { id: 'clerk-orders', icon: '📋', label: '订单管理' },
      { id: 'clerk-new', icon: '➕', label: '新建订单' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    supervisor: [
      { id: 'supervisor-pending', icon: '📥', label: '待派单' },
      { id: 'supervisor-stats', icon: '📊', label: '统计' },
      { id: 'supervisor-requisition', icon: '📋', label: '领料' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📈', label: '数据' }
    ],
    team: [
      { id: 'team-list', icon: '🏭', label: '待生产' },
      { id: 'team-rework', icon: '🔄', label: '补产' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    qc: [
      { id: 'qc-list', icon: '🔍', label: '待质检' },
      { id: 'qc-requisition', icon: '📋', label: '领料' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    packaging: [
      { id: 'pack-list', icon: '📦', label: '待打包' },
      { id: 'pack-requisition', icon: '📋', label: '领料' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    console: [
      { id: 'console-overview', icon: '🖥️', label: '总台总览' },
      { id: 'console-orders', icon: '📋', label: '全部订单' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '数据统计' }
    ],
    finance: [
      { id: 'finance-overview', icon: '💰', label: '财务总览' },
      { id: 'finance-wages', icon: '💵', label: '工资核算' },
      { id: 'finance-prices', icon: '🏷️', label: '计件工价' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' }
    ],
    warehouse: [
      { id: 'warehouse-procurement', icon: '📋', label: '采购处理' },
      { id: 'purchase-list', icon: '📊', label: '采购审批' },
      { id: 'warehouse-suppliers', icon: '🏢', label: '供应商' },
      { id: 'warehouse-materials', icon: '🧈', label: '原材料' },
      { id: 'warehouse-inner', icon: '📥', label: '内包材' },
      { id: 'warehouse-outer', icon: '📦', label: '外包材' },
      { id: 'warehouse-auxiliary', icon: '🔧', label: '辅料' },
      { id: 'warehouse-finished', icon: '🏭', label: '成品仓' },
      { id: 'warehouse-outbound', icon: '🚚', label: '出库' },
      { id: 'warehouse-inbound', icon: '📥', label: '入库' },
      { id: 'warehouse-receiving', icon: '📦', label: '到货' },
      { id: 'warehouse-ledger', icon: '📒', label: '台账' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    procurement: [
      { id: 'warehouse-procurement', icon: '📋', label: '采购处理' },
      { id: 'purchase-list', icon: '📊', label: '申请列表' },
      { id: 'warehouse-suppliers', icon: '🏢', label: '供应商' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'notifications', icon: '🔔', label: '消息' }
    ],
    preparation: [
      { id: 'preparation-list', icon: '🧪', label: '配料记录' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'my-purchases', icon: '📝', label: '我的采购' },
      { id: 'notifications', icon: '🔔', label: '消息' }
    ],
    admin: [
      { id: 'admin', icon: '⚙️', label: '管理' },
      { id: 'purchase-list', icon: '📊', label: '采购审批' },
      { id: 'purchase-request', icon: '🛒', label: '采购申请' },
      { id: 'stats', icon: '📊', label: '统计' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'clerk-orders', icon: '📋', label: '全部订单' }
    ]
  };

  const tabs = roleTabs[currentUser.role] || [];
  const stats = await API.get('/api/stats/overview');
  
  const roleNames = { clerk: '文员', supervisor: '生产组长', team: '生产班组', qc: '内包质检', packaging: '外包打包', console: '总台', finance: '财务', warehouse: '仓库管理', procurement: '采购专员', preparation: '配料人员', admin: '管理员' };

  $('#app').innerHTML = `
    <div class="page-header">
      <h1>🍫 巧克力工厂</h1>
      <span class="role-badge">${roleNames[currentUser.role]} · ${currentUser.real_name}</span>
    </div>
    <div class="page-content">
      <div class="stats-grid">
        <div class="stat-card" style="cursor:pointer" onclick="navigate(getOrderListPage(currentUser.role))"><div class="stat-value">${stats.total||0}</div><div class="stat-label">总订单</div></div>
        <div class="stat-card" style="cursor:pointer" onclick="navigate(getOrderListPage(currentUser.role))"><div class="stat-value" style="color:#D48806">${stats.pending||0}</div><div class="stat-label">待派单</div></div>
        <div class="stat-card" style="cursor:pointer" onclick="navigate(getOrderListPage(currentUser.role))"><div class="stat-value" style="color:#1890FF">${stats.producing||0}</div><div class="stat-label">生产中</div></div>
        <div class="stat-card" style="cursor:pointer" onclick="navigate(getOrderListPage(currentUser.role))"><div class="stat-value" style="color:#52C41A">${stats.completed||0}</div><div class="stat-label">已完成</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${tabs.map(t => `
          <div class="card" style="cursor:pointer;text-align:center;padding:20px 10px" onclick="navigate('${t.id}')">
            <div style="font-size:28px">${t.icon}</div>
            <div style="font-weight:600;margin-top:6px">${t.label}</div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:16px;text-align:center">
        <button class="btn btn-outline btn-sm" onclick="doLogout()">退出登录</button>
      </div>
    </div>
    ${renderTabBar('dashboard')}`;
  } catch(e) {
    console.error('renderDashboard error:', e);
    $('#app').innerHTML = '<div class="page-header"><h1>🍫 巧克力工厂</h1></div><div class="page-content"><div class="empty-state"><div class="empty-icon">⚠️</div>数据加载失败，请刷新页面重试</div></div>';
  }
}

async function doLogout() {
  await API.post('/api/logout');
  currentUser = null;
  navigate('login');
}

// ===== 文员端 - 订单管理 =====
async function renderClerkOrders() {
  const orders = await API.get('/api/orders');
  window._allOrders = orders;
  
  $('#app').innerHTML = `
    <div class="page-header">
      <h1>📋 订单管理</h1>
      <span class="role-badge">文员 · ${currentUser.real_name}</span>
    </div>
    <div class="page-content">
      <div class="search-bar">
        <input id="search-keyword" placeholder="搜索单号/客户" oninput="filterOrders()">
        <button class="btn btn-primary btn-sm" onclick="navigate('clerk-new')">+ 新建</button>
      </div>
      <div class="filter-tags">
        <span class="filter-tag active" onclick="setFilter(this,'')">全部</span>
        <span class="filter-tag" onclick="setFilter(this,'pending')">待派单</span>
        <span class="filter-tag" onclick="setFilter(this,'dispatched')">已派单</span>
        <span class="filter-tag" onclick="setFilter(this,'produced')">生产完工</span>
        <span class="filter-tag" onclick="setFilter(this,'qc_passed')">质检通过</span>
        <span class="filter-tag" onclick="setFilter(this,'qc_failed')">不合格</span>
        <span class="filter-tag" onclick="setFilter(this,'completed')">已完成</span>
      </div>
      <div id="order-list"></div>
    </div>
    ${renderTabBar('clerk-orders')}`;
  renderOrderList(orders);
}

function renderOrderList(orders) {
  const list = $('#order-list');
  if (!orders.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>暂无订单</div>';
    return;
  }
  list.innerHTML = orders.map(o => `
    <div class="order-item ${o.is_urgent ? 'urgent' : ''}" onclick="viewOrder(${o.id},'clerk')">
      <div class="order-item-header">
        <span class="order-customer">${o.customer_name}${o.is_urgent ? ' 🔴加急' : ''}</span>
        ${statusTag(o.status)}
      </div>
      <div class="order-product">${o.product_name} · ${o.product_details || ''}</div>
      <div class="order-footer">
        <span class="order-no">${o.order_no}</span>
        <span class="order-qty">下单 ${o.quantity} 个</span>
      </div>
      <div class="order-footer"><span>${formatTime(o.created_at)}</span></div>
    </div>
  `).join('');
}

function setFilter(el, status) {
  $$('.filter-tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const orders = window._allOrders || [];
  const filtered = status ? orders.filter(o => o.status === status) : orders;
  renderOrderList(filtered);
}

function filterOrders() {
  const keyword = $('#search-keyword').value.trim().toLowerCase();
  const activeFilter = document.querySelector('.filter-tag.active');
  const status = activeFilter ? activeFilter.textContent === '全部' ? '' : Object.keys(STATUS_MAP).find(k => STATUS_MAP[k].label === activeFilter.textContent) : '';
  let orders = window._allOrders || [];
  if (status) orders = orders.filter(o => o.status === status);
  if (keyword) orders = orders.filter(o => o.order_no.toLowerCase().includes(keyword) || o.customer_name.toLowerCase().includes(keyword));
  renderOrderList(orders);
}

// ===== 文员端 - 新建订单 =====
async function renderClerkNewOrder() {
  var customers = await API.get('/api/customers');
  var allProducts = await API.get('/api/products');
  window._allProducts = allProducts;
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>➕ 新建生产单</h1><span class="role-badge">文员</span></div>
    <div class="page-content"><div class="card">
      <div class="form-group"><label>客户名称 *</label><select class="form-input" id="sel-customer"><option value="">请选择客户</option>${customers.map(function(c){ return '<option value="'+c.id+'">'+c.name+'</option>'; }).join('')}</select></div>
      <div style="font-weight:700;font-size:14px;margin:12px 0 6px">📦 添加产品（可添加多个）</div>
      <div id="order-products">
        <div class="order-product-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
          <select class="form-input" style="flex:1" onchange="updateOrderProductsInfo()">${allProducts.map(function(p){ return '<option value="'+p.id+'">'+p.name+'</option>'; }).join('')}</select>
          <input class="form-input" type="number" min="1" value="1" placeholder="数量" style="width:80px"><button class="btn btn-danger btn-sm" style="width:30px;padding:4px;font-size:12px" onclick="removeOrderProduct(this)">×</button>
        </div></div>
      <button class="btn btn-outline btn-sm" onclick="addOrderProduct()">+ 添加产品</button>
      <div id="order-products-info" style="margin-top:8px"></div>
      <div class="form-group" style="margin-top:12px"><label>交货期限</label><input class="form-input" id="inp-deadline" type="date"></div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="chk-urgent"><label for="chk-urgent" style="margin:0">加急订单</label></div>
      <div class="form-group"><label>备注</label><textarea class="form-input" id="inp-notes" placeholder="客户特殊要求等"></textarea></div>
      <button class="btn btn-primary btn-block" onclick="submitNewOrder()">提交订单</button>
      <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate('clerk-orders')">取消</button>
    </div></div>`;
}
function addOrderProduct() {
  var div = document.createElement('div');
  div.className = 'order-product-row';
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center';
  var opts = (window._allProducts||[]).map(function(p){ return '<option value="'+p.id+'">'+p.name+'</option>'; }).join('');
  div.innerHTML = '<select class="form-input" style="flex:1" onchange="updateOrderProductsInfo()">'+opts+'</select><input class="form-input" type="number" min="1" value="1" placeholder="数量" style="width:80px"><button class="btn btn-danger btn-sm" style="width:30px;padding:4px;font-size:12px" onclick="removeOrderProduct(this)">×</button>';
  document.getElementById('order-products').appendChild(div);
}
function removeOrderProduct(btn) {
  var rows = document.querySelectorAll('.order-product-row');
  if (rows.length <= 1) return;
  btn.closest('.order-product-row').remove();
  updateOrderProductsInfo();
}
function updateOrderProductsInfo() {
  var info = document.getElementById('order-products-info');
  var rows = document.querySelectorAll('.order-product-row');
  var html = '', all = window._allProducts || [];
  rows.forEach(function(row){
    var sel = row.querySelector('select'), qty = row.querySelector('input[type=number]');
    var pid = parseInt(sel.value);
    if (!pid) return;
    var prod = all.find(function(p){ return p.id === pid; });
    if (!prod) return;
    html += '<div style="margin-top:6px;padding:6px 10px;background:#fdf8f3;border-radius:8px;font-size:13px"><strong>'+prod.name+'</strong> ×'+qty.value+(prod.inner_pack_spec?' | 内包:'+prod.inner_pack_spec+' ×'+(prod.inner_pack_qty||1)+'/件':'')+(prod.outer_pack_spec?' | 外包:'+prod.outer_pack_spec:'')+((prod.children||[]).length?'<br>子产品: '+prod.children.map(function(c){return c.name+'×'+c.quantity}).join(', '):'')+(prod.image_url?'<br><img src="'+prod.image_url+'" style="max-width:80px;margin-top:4px;border-radius:6px">':'')+'</div>';
  });
  if (html) { info.innerHTML = html; info.classList.remove('hidden'); }
  else info.classList.add('hidden');
}

async function submitNewOrder() {
  var customer_id = parseInt(document.getElementById('sel-customer').value);
  if (!customer_id) return showToast('请选择客户', 'error');
  
  var rows = document.querySelectorAll('.order-product-row');
  var items = [];
  rows.forEach(function(row){
    var sel = row.querySelector('select'), qty = row.querySelector('input[type=number]');
    var pid = parseInt(sel.value), quantity = parseInt(qty.value)||1;
    if (pid && quantity > 0) items.push({ product_id: pid, quantity: quantity });
  });
  if (!items.length) return showToast('请至少添加一个产品', 'error');
  
  var res = await API.post('/api/orders', {
    customer_id: customer_id,
    items: items,
    deadline: document.getElementById('inp-deadline').value,
    is_urgent: document.getElementById('chk-urgent').checked,
    notes: document.getElementById('inp-notes').value.trim()
  });
  if (res.success) {
    showToast('订单 '+res.order_no+' 创建成功！（'+res.items_count+'个产品）', 'success');
    if (res.deduction_msg) setTimeout(function(){ alert('库存扣减：\n'+res.deduction_msg); }, 500);
    navigate('clerk-orders');
  } else {
    showToast(res.msg || '创建失败', 'error');
  }
}

// ===== 订单详情（通用） =====
async function viewOrder(id, fromRole) {
  window._currentOrderId = id;
  window._fromRole = fromRole;
  navigate(fromRole + '-detail');
}

async function renderOrderDetail(role) {
  var id = window._currentOrderId;
  var order = await API.get('/api/orders/' + id);
  if (!order) return showToast('订单不存在', 'error');
  
  var backPage = { clerk: 'clerk-orders', supervisor: 'supervisor-pending', team: 'team-list', qc: 'qc-list', packaging: 'pack-list', console: 'console-orders', finance: 'finance-overview' };
  
  // 多产品明细 HTML
  var itemsHtml = '';
  (order.items||[]).forEach(function(it){
    itemsHtml += '<div style="margin-bottom:10px;padding:10px;background:#fdf8f3;border-radius:10px;border-left:4px solid var(--primary)">' +
      '<div style="font-weight:700;font-size:14px">'+it.product_name+' ×'+it.quantity+'</div>' +
      (it.color_code?'<div style="font-size:12px;color:var(--text-secondary)">色卡: '+it.color_code+'</div>':'') +
      (it.inner_pack_spec?'<div style="font-size:12px;color:var(--text-secondary)">内包: '+it.inner_pack_spec+'</div>':'') +
      (it.outer_pack_spec?'<div style="font-size:12px;color:var(--text-secondary)">外包: '+it.outer_pack_spec+'</div>':'') +
      (it.image_url?'<img src="'+it.image_url+'" style="max-width:80px;margin-top:4px;border-radius:6px">':'') +
      ((it.children||[]).length?'<div style="font-size:11px;color:var(--accent);margin-top:4px">子产品: '+it.children.map(function(c){return c.name+'×'+c.quantity}).join(', ')+'</div>':'') +
      ((it.images||[]).map(function(im){return '<img src="'+im.image_url+'" style="width:40px;height:40px;object-fit:cover;border-radius:4px;margin:2px;display:inline-block">';}).join('')) +
      '</div>';
  });
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📄 订单详情</h1></div>
    <div class="page-content">
      <div class="detail-section">
        <h3>📋 基本信息</h3>
        <div class="detail-row"><span class="label">单号</span><span class="value" style="font-family:monospace">${order.order_no}</span></div>
        <div class="detail-row"><span class="label">状态</span><span class="value">${statusTag(order.status)}</span></div>
        <div class="detail-row"><span class="label">客户</span><span class="value">${order.customer_name}${order.customer_contact?' ('+order.customer_contact+')':''}</span></div>
        ${order.customer_notes?'<div class="detail-row"><span class="label">客户备注</span><span class="value">'+order.customer_notes+'</span></div>':''}
        ${order.is_urgent?'<div class="detail-row"><span class="label">加急</span><span class="value" style="color:var(--danger)">🔴 加急</span></div>':''}
        ${order.deadline?'<div class="detail-row"><span class="label">交货</span><span class="value">'+order.deadline+'</span></div>':''}
        ${order.notes?'<div class="detail-row"><span class="label">备注</span><span class="value">'+order.notes+'</span></div>':''}
        <div class="detail-row"><span class="label">创建时间</span><span class="value">'+formatTime(order.created_at)+'</span></div>
      </div>
      
      <div class="detail-section">
        <h3>📦 产品清单（'+((order.items||[]).length||1)+'个）</h3>
        ${itemsHtml || '<div class="detail-row"><span class="label">产品</span><span class="value">'+order.product_name+'</span></div><div class="detail-row"><span class="label">数量</span><span class="value" style="font-weight:700;color:var(--primary)">'+order.quantity+'</span></div>'}
        ${order.image_url?'<img src="'+order.image_url+'" style="max-width:200px;margin-top:8px;border-radius:8px">':''}
        ${(order.product_children||[]).length?'<div style="font-size:12px;color:var(--accent);margin-top:4px">子产品: '+order.product_children.map(function(c){return c.name+'×'+c.quantity}).join(', ')+'</div>':''}
        ${(order.product_images||[]).map(function(im){return '<img src="'+im.image_url+'" style="width:60px;height:60px;object-fit:cover;border-radius:6px;margin:4px;display:inline-block">';}).join('')}
      </div>
      
      ${order.dispatch ? '<div class="detail-section"><h3>📌 派单信息</h3><div class="detail-row"><span class="label">班组</span><span class="value">'+order.dispatch.team_name+'</span></div><div class="detail-row"><span class="label">派单人</span><span class="value">'+order.dispatch.dispatcher_name+'</span></div><div class="detail-row"><span class="label">时间</span><span class="value">'+formatTime(order.dispatch.dispatched_at)+'</span></div></div>' : ''}
      
      <button class="btn btn-outline btn-block" style="margin-top:12px" onclick="navigate('${backPage[role]||'clerk-orders'}')">返回</button>
    </div>` +
    (backPage[role] ? renderTabBar(backPage[role]) : '');
}
// ===== 生产组长端 =====
async function renderSupervisorPending() {
  var orders = await API.get('/api/orders?status=pending');
  var allOrders = await API.get('/api/orders');
  var overview = await API.get('/api/stats/overview');
  var ims = await API.get('/api/inner-pack-materials');
  var preps = await API.get('/api/preparations');
  
  // 内包材库存总计
  var innerStock = ims.reduce(function(s,m){ return s + (m.stock_qty||0); }, 0);
  
  // 检查配料状态
  var prepMap = {};
  preps.forEach(function(p){ prepMap[p.order_id] = true; });
  
  // 统计生产中订单
  var producing = allOrders.filter(function(o){ return o.status === 'producing'; });
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📥 待派单</h1><span class="role-badge">生产组长</span></div>
    <div class="page-content">
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat-card"><div class="stat-value">${overview.total||0}</div><div class="stat-label">总订单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#D48806">${overview.pending||0}</div><div class="stat-label">待派单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#1890FF">${producing.length}</div><div class="stat-label">生产中</div></div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap">
        <span>📦 内包材库存: <strong style="color:${innerStock<100?'var(--danger)':'var(--success)'}">${innerStock}</strong></span>
      </div>
      ${!orders.length ? '<div class="empty-state"><div class="empty-icon">📭</div>暂无待派单订单</div>' :
        orders.map(function(o){
          var innerNeed = (o.inner_pack_qty||1) * (o.quantity||0);
          var stockWarn = innerNeed > innerStock;
          var prepDone = prepMap[o.id];
          return `<div class="order-item ${o.is_urgent?'urgent':''}" onclick="openDispatch(${o.id})">
            <div class="order-item-header">
              <span class="order-customer">${o.customer_name}${o.is_urgent?' 🔴加急':''}</span>
              ${statusTag(o.status)}
            </div>
            <div class="order-product">${o.product_name}${o.product_details?' · '+o.product_details:''}</div>
            <div class="order-footer">
              <span class="order-no">${o.order_no}</span>
              <span class="order-qty">下单 ${o.quantity}</span>
            </div>
            ${stockWarn ? '<div style="margin-top:4px;font-size:12px;color:var(--danger)">⚠️ 内包材不足（需'+innerNeed+',库存'+innerStock+'）</div>' : ''}
            <div style="margin-top:4px;font-size:12px;color:var(--text-secondary)">配料: ${prepDone?'✅ 已完成':'⏳ 未完成'}</div>
            <div style="margin-top:6px">
              <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openDispatch(${o.id})">去派单</button>
              <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();viewOrder(${o.id},'supervisor')">查看</button>
            </div></div>`;
        }).join('')}
    </div>
    ${renderTabBar('supervisor-pending')}`;
}

async function openDispatch(orderId) {
  try {
  window._dispatchOrderId = orderId;
  var order = await API.get('/api/orders/' + orderId);
  var teams = await API.get('/api/teams');
  var ds = await API.get('/api/dispatch-stats');
  var dispatchStats = ds.stats || ds;
  var threshold = ds.threshold || 3;
  var items = order.items || [];
  // 如果items为空，构造单产品
  if (!items.length) {
    items = [{ product_id: order.product_id, product_name: order.product_name, quantity: order.quantity }];
  }
  window._dispatchItems = items;
  window._dispatchTeams = teams;
  // 默认模式：按产品拆分
  window._dispatchMode = 'byProduct';
  window._dispatchSelections = {};
  
  var modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  buildDispatchModal(modal, order, teams, items, dispatchStats, threshold);
  document.body.appendChild(modal);
  } catch(e) {
    console.error('openDispatch error:', e);
    showToast('派单数据加载失败，请刷新重试', 'error');
  }
}

function buildDispatchModal(modal, order, teams, items, dispatchStats, threshold) {
  var mode = window._dispatchMode || 'byProduct';
  
  var renderTeamCard = function(t, extra, showQty) {
    var stat = dispatchStats.find(function(s){return s.team_id===t.id;}) || { dispatch_count: 0, total_quantity: 0 };
    var otherMin = Math.min.apply(null, dispatchStats.filter(function(s){return s.team_id!==t.id;}).map(function(s){return s.dispatch_count;}));
    var isWarning = stat.dispatch_count - otherMin >= threshold;
    var cls = 'team-dispatch-card' + (isWarning?' warning':'');
    if (showQty) {
      // 按数量拆分模式：带数量输入框
      return '<div class="'+cls+'" data-team-id="'+t.id+'">' +
        '<div class="team-info"><div class="team-name">'+esc(t.name)+' '+(isWarning?'<span class="warning-badge">⚠️ 偏多</span>':'')+'</div>' +
        '<div class="team-stats">本月接单：'+stat.dispatch_count+' 次 | 累计产量：'+(stat.total_quantity||0)+'</div></div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-top:6px">' +
        '<input class="form-input dispatch-qty-input" data-team-id="'+t.id+'" data-extra="'+(extra||'')+'" type="number" min="0" placeholder="0" style="width:80px;padding:6px;font-size:13px" oninput="onDispatchQtyChange(this)" value="0">' +
        '<span style="font-size:12px;color:var(--text-secondary)">件</span></div></div>';
    }
    return '<div class="'+cls+'" onclick="selectTeam(this,'+t.id+','+(extra||'\'')+')" data-team-id="'+t.id+'" data-extra="'+(extra||'')+'">' +
      '<div class="team-info"><div class="team-name">'+esc(t.name)+' '+(isWarning?'<span class="warning-badge">⚠️ 偏多</span>':'')+'</div>' +
      '<div class="team-stats">本月接单：'+stat.dispatch_count+' 次 | 累计产量：'+(stat.total_quantity||0)+'</div></div>' +
      '<div style="font-size:20px;color:var(--border)">○</div></div>';
  };
  
  var modeTabs = '<div style="display:flex;gap:4px;margin-bottom:12px">' +
    '<div class="dispatch-mode-tab'+(mode==='byProduct'?' active':'')+'" onclick="switchDispatchMode(\'byProduct\')" style="flex:1;text-align:center;padding:8px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;'+(mode==='byProduct'?'background:var(--primary);color:#fff':'background:#f0ebe3;color:var(--text-secondary)')+'">📦 按产品拆分</div>' +
    '<div class="dispatch-mode-tab'+(mode==='byQuantity'?' active':'')+'" onclick="switchDispatchMode(\'byQuantity\')" style="flex:1;text-align:center;padding:8px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;'+(mode==='byQuantity'?'background:var(--primary);color:#fff':'background:#f0ebe3;color:var(--text-secondary)')+'">🔢 按数量拆分</div></div>';
  
  var bodyHtml = '';
  if (mode === 'byProduct') {
    // 按产品拆分模式
    bodyHtml = items.map(function(it, i) {
      return '<div style="margin-bottom:12px;padding:10px;background:#fdf8f3;border-radius:8px">' +
        '<div style="font-weight:700;margin-bottom:6px">📦 产品'+(i+1)+': '+esc(it.product_name)+' ×'+it.quantity+'</div>' +
        '<div style="margin-bottom:4px;font-size:12px;color:var(--text-secondary)">选择班组：</div>' +
        '<div id="dispatch-teams-'+i+'">' + teams.map(function(t){return renderTeamCard(t, 'item_'+i);}).join('') + '</div>' +
        '<div class="dispatch-status" id="dispatch-status-'+i+'"></div></div>';
    }).join('');
    // 整体分配
    if (items.length > 1) {
      bodyHtml += '<div style="margin-bottom:12px;padding:10px;background:#e8f5e9;border-radius:8px;border:2px dashed var(--success)">' +
        '<div style="font-weight:700;margin-bottom:4px;color:var(--success)">🎯 整体分配（所有产品给同一班组）</div>' +
        '<div id="dispatch-teams-all">' + teams.map(function(t){return renderTeamCard(t, 'all');}).join('') + '</div></div>';
    }
  } else {
    // 按数量拆分模式
    bodyHtml = items.map(function(it, i) {
      var tid = items.length > 1 ? ('item_'+i) : 'qty';
      return '<div style="margin-bottom:14px;padding:12px;background:#fdf8f3;border-radius:8px">' +
        '<div style="font-weight:700;margin-bottom:4px">📦 产品'+(items.length>1?(''+(i+1)+': '):'')+esc(it.product_name)+' <span style="color:var(--primary)">总量 '+it.quantity+' 件</span></div>' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">为每个班组分配数量（总和='+it.quantity+'）：</div>' +
        '<div id="dispatch-qtyteams-'+tid+'">' + teams.map(function(t){return renderTeamCard(t, tid+'_team'+t.id, true);}).join('') + '</div>' +
        '<div style="margin-top:6px;font-size:12px" id="dispatch-qty-summary-'+tid+'"><span style="color:var(--danger)">已分配: <b id="dqty-alloc-'+tid+'">0</b> / '+it.quantity+' 件</span></div></div>';
    }).join('');
  }
  
  modal.innerHTML = '<div class="modal-content" style="max-height:85vh;overflow-y:auto">' +
    '<div class="modal-header"><h3>📌 派单 - '+esc(order.order_no)+'</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>' +
    '<div class="detail-section" style="margin-bottom:8px"><div class="detail-row"><span class="label">客户</span><span class="value">'+esc(order.customer_name)+'</span></div>' +
    '<div class="detail-row"><span class="label">总数量</span><span class="value" style="font-weight:700;color:var(--primary)">'+order.quantity+'</span></div></div>' +
    modeTabs + bodyHtml +
    '<button class="btn btn-primary btn-block" style="margin-top:12px" onclick="confirmDispatch()">确认派单</button></div>';
}

// 切换派单模式
function switchDispatchMode(mode) {
  window._dispatchMode = mode;
  window._dispatchSelections = {};
  window._dispatchQtySelections = {};
  var modal = document.getElementById('dispatch-modal');
  if (!modal) return;
  var orderId = window._dispatchOrderId;
  if (!orderId) return;
  API.get('/api/orders/' + orderId).then(function(order) {
    var items = order.items || [];
    if (!items.length) items = [{ product_id: order.product_id, product_name: order.product_name, quantity: order.quantity }];
    var teams = window._dispatchTeams || [];
    var ds = window._dispatchStats || { stats: [], threshold: 3 };
    buildDispatchModal(modal, order, teams, items, ds.stats || ds, ds.threshold || 3);
  }).catch(function() {
    // fallback: rebuild with cached data
    buildDispatchModal(modal, { order_no: '?', customer_name: '?', quantity: 0 }, window._dispatchTeams || [], window._dispatchItems || [], [], 3);
  });
}

// 数量输入变化
function onDispatchQtyChange(el) {
  var teamId = parseInt(el.dataset.teamId);
  var extra = el.dataset.extra || 'qty';
  var val = parseInt(el.value) || 0;
  if (val < 0) { el.value = 0; val = 0; }
  
  if (!window._dispatchQtySelections) window._dispatchQtySelections = {};
  if (!window._dispatchQtySelections[extra]) window._dispatchQtySelections[extra] = {};
  window._dispatchQtySelections[extra][teamId] = val;
  
  // 更新汇总
  updateQtySummary(extra);
}

function updateQtySummary(extra) {
  var sel = (window._dispatchQtySelections && window._dispatchQtySelections[extra]) || {};
  var total = 0;
  for (var k in sel) { total += sel[k] || 0; }
  
  var allocEl = document.getElementById('dqty-alloc-' + extra);
  if (allocEl) allocEl.textContent = total;
  
  // 获取目标数量
  var items = window._dispatchItems || [];
  var target = 0;
  if (extra === 'qty') {
    target = items[0] ? items[0].quantity : 0;
  } else if (extra && extra.startsWith('item_')) {
    var idx = parseInt(extra.split('_')[1]);
    target = items[idx] ? items[idx].quantity : 0;
  }
  
  // 颜色提示
  var summaryEl = document.getElementById('dispatch-qty-summary-' + extra);
  if (summaryEl && target > 0) {
    if (total === target) {
      summaryEl.innerHTML = '<span style="color:var(--success)">✅ 已分配: <b>' + total + '</b> / ' + target + ' 件（刚好）</span>';
    } else if (total > target) {
      summaryEl.innerHTML = '<span style="color:var(--danger)">⚠️ 已分配: <b>' + total + '</b> / ' + target + ' 件（超出 ' + (total-target) + '）</span>';
    } else {
      summaryEl.innerHTML = '<span style="color:var(--warning)">已分配: <b>' + total + '</b> / ' + target + ' 件（还差 ' + (target-total) + '）</span>';
    }
  }
}

async function confirmDispatch() {
  var mode = window._dispatchMode || 'byProduct';
  var itms = window._dispatchItems || [];
  var items = [];
  
  if (mode === 'byQuantity') {
    // 按数量拆分模式
    var qtySels = window._dispatchQtySelections || {};
    var errors = [];
    var warnings = [];
    itms.forEach(function(it, i) {
      var extra = itms.length > 1 ? ('item_'+i) : 'qty';
      var sel = qtySels[extra] || {};
      var subtotal = 0;
      for (var teamId in sel) {
        var qty = sel[teamId] || 0;
        if (qty > 0) {
          items.push({ team_id: parseInt(teamId), product_id: it.product_id, dispatch_qty: qty });
          subtotal += qty;
        }
      }
      if (subtotal === 0) {
        errors.push('产品'+(itms.length>1?(''+(i+1)+' '):'')+esc(it.product_name)+'：未分配任何数量');
      } else if (subtotal !== it.quantity) {
        warnings.push('产品'+(itms.length>1?(''+(i+1)+' '):'')+esc(it.product_name)+'：已分配'+subtotal+'/'+it.quantity+'（差额'+(it.quantity-subtotal)+'）');
      }
    });
    if (errors.length > 0) {
      return showToast('请为以下产品分配数量：' + errors.join('；'), 'error');
    }
    if (warnings.length > 0 && !confirm('以下产品数量未完全分配：\n' + warnings.join('\n') + '\n\n已分配的数量将立即派单，剩余数量保留待派状态。\n\n确定继续？')) {
      return;
    }
    if (!items.length) {
      return showToast('请为至少一个班组填写分配数量', 'error');
    }
  } else {
    // 按产品拆分模式
    var sels = window._dispatchSelections || {};
    var missing = [];
    var hasIndividual = false;
    
    itms.forEach(function(it, i) {
      var key = 'item_' + i;
      if (sels[key]) {
        items.push({ team_id: sels[key], product_id: it.product_id });
        hasIndividual = true;
      } else {
        missing.push(i);
      }
    });
    
    if (!hasIndividual && sels.all) {
      itms.forEach(function(it) {
        items.push({ team_id: sels.all, product_id: it.product_id });
      });
    } else if (hasIndividual && sels.all && missing.length > 0) {
      missing.forEach(function(i) {
        items.push({ team_id: sels.all, product_id: itms[i].product_id });
      });
    }
    
    if (!items.length && window._selectedTeamId) {
      var firstItem = itms[0] || {};
      items.push({ team_id: window._selectedTeamId, product_id: firstItem.product_id || null });
    }
    
    if (!items.length) {
      return showToast('请至少为一个产品选择班组（可逐个选或使用整体分配）', 'error');
    }
    
    // 允许部分派单：已选的产品先派，未选的保留待派状态
    if (missing.length > 0 && !sels.all && hasIndividual) {
      var names = missing.map(function(i) { return '产品' + (i+1); }).join('、');
      if (!confirm('以下产品未分配班组：' + names + '\n\n已选 ' + items.length + ' 个产品将立即派单，剩余产品保留待派状态，可后续补派。\n\n确定只派已选产品？')) {
        return;
      }
    }
  }
  
  var res = await API.post('/api/orders/' + window._dispatchOrderId + '/dispatch', { items: items });
  if (res.success) { showToast('派单成功（' + items.length + '条）', 'success'); closeModal(); navigate('supervisor-pending'); }
  else showToast(res.msg || '派单失败', 'error');
}

// 按产品模式：点击选择班组
function selectTeam(el, teamId, extra) {
  var cards = el.parentElement.querySelectorAll('.team-dispatch-card');
  cards.forEach(function(c) { c.classList.remove('selected'); });
  el.classList.add('selected');
  if (!window._dispatchSelections) window._dispatchSelections = {};
  window._dispatchSelections[extra || 'single'] = teamId;
  // 更新选中状态显示
  updateDispatchStatus(extra, teamId);
}

// 更新派单状态提示
function updateDispatchStatus(extra, teamId) {
  if (!extra) return;
  if (extra === 'all') return; // 整体分配不需要状态提示
  var idx = null;
  if (extra.startsWith('item_')) idx = extra.split('_')[1];
  var statusEl = document.getElementById('dispatch-status-' + idx);
  if (statusEl) {
    var teams = window._dispatchTeams || [];
    var t = teams.find(function(x) { return x.id === teamId; });
    statusEl.innerHTML = '<span style="color:var(--success);font-weight:600">✅ 已选: ' + (t ? esc(t.name) : '班组' + teamId) + '</span>';
  }
}

function closeModal() {
  const m = document.getElementById('dispatch-modal') || document.getElementById('inspect-modal');
  if (m) m.remove();
}

async function renderSupervisorDispatch() { navigate('supervisor-pending'); }

// ===== 物料领料申请 =====
async function renderRequisition() {
  var rm = await API.get('/api/raw-materials');
  var im = await API.get('/api/inner-pack-materials');
  var am = await API.get('/api/product-accessories');
  var role = currentUser.role;
  var roleLabel = role === 'qc' ? '内包质检' : role === 'supervisor' ? '生产组长' : '物料申请';
  var tabId = role === 'qc' ? 'qc-requisition' : 'supervisor-requisition';
  var backPage = role === 'qc' ? 'qc-list' : 'supervisor-pending';
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📋 物料领料申请</h1><span class="role-badge">${roleLabel}</span></div>
    <div class="page-content">
      <div class="form-group"><label>领料类型</label><select class="form-input" id="req-type" onchange="onReqTypeChange()">
        <option value="raw">🧈 原材料</option><option value="inner">📥 内包材</option><option value="aux">🔧 辅料/配件</option>
      </select></div>
      <div class="form-group"><label>选择物料</label><select class="form-input" id="req-material">
        ${rm.map(function(m){ return '<option value="raw_'+m.id+'">'+esc(m.name)+' (库存:'+(m.stock_qty||0)+')</option>'; }).join('')}
      </select></div>
      <div class="form-group"><label>领料数量</label><input class="form-input" id="req-qty" type="number" min="1"></div>
      <div class="form-group"><label>用途说明</label><input class="form-input" id="req-note" placeholder="关联订单或用途"></div>
      <button class="btn btn-primary btn-block" onclick="submitRequisition()">提交领料申请</button>
    </div>
    ${renderTabBar(tabId)}`;
  window._reqMaterials = { raw: rm, inner: im, aux: am };
  window._reqBackPage = backPage;
}
function onReqTypeChange() {
  var t = document.getElementById('req-type').value;
  var m = window._reqMaterials[t] || [];
  document.getElementById('req-material').innerHTML = m.map(function(x){
    var prefix = t==='raw'?'raw_':t==='inner'?'inner_':'aux_';
    return '<option value="'+prefix+x.id+'">'+x.name+' (库存:'+(x.stock_qty||0)+')</option>';
  }).join('');
}
async function submitRequisition() {
  var v = document.getElementById('req-material').value.split('_');
  var type = v[0], mid = parseInt(v[1]);
  var qty = parseInt(document.getElementById('req-qty').value);
  var note = document.getElementById('req-note').value.trim();
  if (!mid || !qty || qty < 1) return showToast('请完善领料信息', 'error');
  var res = await API.post('/api/material-requisitions', { type: type, material_id: mid, quantity: qty, note: note });
  if (res.success) { showToast('领料申请已提交', 'success'); navigate(window._reqBackPage||'supervisor-pending'); }
  else showToast(res.msg || '提交失败', 'error');
}

async function renderSupervisorStats() {
  const stats = await API.get('/api/dispatch-stats');
  const overview = await API.get('/api/stats/overview');
  const allOrders = await API.get('/api/orders');
  const producing = allOrders.filter(function(o){ return o.status === 'producing'; });
  const now = new Date();
  const month = '' + now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📊 派单统计</h1><span class="role-badge">${month}</span></div>
    <div class="page-content">
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card"><div class="stat-value">${overview.total||0}</div><div class="stat-label">总订单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#D48806">${overview.pending||0}</div><div class="stat-label">待派单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#1890FF">${producing.length}</div><div class="stat-label">生产中</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#52C41A">${overview.completed||0}</div><div class="stat-label">已完成</div></div>
      </div>
      ${stats.map(s => `
        <div class="card">
          <div class="card-title">${s.team_name}</div>
          <div class="detail-row"><span class="label">本月派单</span><span class="value" style="font-weight:700">${s.dispatch_count} 次</span></div>
          <div class="detail-row"><span class="label">累计产量</span><span class="value">${s.total_quantity || 0}</span></div>
        </div>
      `).join('')}
    </div>
    ${renderTabBar('supervisor-stats')}`;
}

// ===== 生产班组端 =====
async function renderTeamOrders() {
  var orders = await API.get('/api/orders');
  // 过滤分配给当前班组的订单（支持多产品拆分派单）
  var myOrders = orders.filter(function(o) {
    if (o.status !== 'dispatched' && o.status !== 'dispatched_partial') return false;
    // 检查是否有派单记录给当前班组
    var dispatches = o.dispatches || [];
    if (!dispatches.length && o.team_id === currentUser.team_id) return true;
    return dispatches.some(function(d) { return d.team_id === currentUser.team_id; });
  });
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🏭 待生产订单</h1><span class="role-badge">班组${currentUser.team_id}</span></div>
    <div class="page-content">
      ${!myOrders.length ? '<div class="empty-state"><div class="empty-icon">📭</div>暂无待生产订单</div>' :
        myOrders.map(function(o) {
          // 显示当前班组被分配的明细
          var myDispatch = (o.dispatches||[]).find(function(d){return d.team_id===currentUser.team_id;}) || {};
          var productHint = '';
          if (myDispatch.product_id) {
            var prodName = '';
            (o.items||[]).forEach(function(it){ if (it.product_id === myDispatch.product_id) prodName = it.product_name; });
            if (!prodName && o.product_id === myDispatch.product_id) prodName = o.product_name;
            productHint = '<div style="font-size:11px;color:var(--accent);margin-top:2px">分配产品: '+(prodName||'产品#'+myDispatch.product_id)+'</div>';
          }
          return '<div class="order-item" onclick="startProduction('+o.id+')">' +
            '<div class="order-item-header"><span class="order-customer">'+esc(o.customer_name)+'</span>'+statusTag(o.status)+'</div>' +
            '<div class="order-product">'+esc(o.product_name)+'</div>' +
            productHint +
            '<div class="order-footer"><span class="order-no">'+esc(o.order_no)+'</span><span class="order-qty">下单 '+o.quantity+'</span></div>' +
            '<div style="margin-top:6px"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();startProduction('+o.id+')">开始填报</button></div>' +
            '</div>';
        }).join('')}
    </div>
    ${renderTabBar('team-list')}`;
}

async function startProduction(orderId) {
  window._produceOrderId = orderId;
  navigate('team-produce');
}

async function renderTeamProduce() {
  const orderId = window._produceOrderId;
  if (!orderId) return navigate('team-list');
  const order = await API.get(`/api/orders/${orderId}`);
  const team = (await API.get('/api/teams')).find(t => t.id === currentUser.team_id);
  const members = team ? team.members : [];
  
  window._selectedWorkers = [];
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🏭 生产填报</h1></div>
    <div class="page-content">
      <div class="detail-section">
        <h3>📋 订单信息</h3>
        <div class="detail-row"><span class="label">单号</span><span class="value">${order.order_no}</span></div>
        <div class="detail-row"><span class="label">客户</span><span class="value">${order.customer_name}</span></div>
        <div class="detail-row"><span class="label">产品</span><span class="value">${order.product_name}</span></div>
        <div class="detail-row"><span class="label">下单数量</span><span class="value" style="font-weight:700;color:var(--primary)">${order.quantity}</span></div>
        ${order.image_url ? '<img src="'+order.image_url+'" style="max-width:200px;margin-top:6px;border-radius:8px">' : ''}
        ${(order.product_children||[]).length ? '<div style="margin-top:8px;font-size:13px;color:var(--accent)"><strong>子产品组合：</strong>'+order.product_children.map(function(c){return c.name+'×'+c.quantity}).join(' / ')+'</div>' : ''}
      </div>
      <div class="detail-section">
        <h3>👷 选择当班人员</h3>
        <div class="worker-select">
          ${members.map(m => `<div class="worker-chip" onclick="toggleWorker(this,'${m.name}')">${m.name}</div>`).join('')}
        </div>
      </div>
      <div class="detail-section">
        <h3>📝 分项生产数据</h3>
        <table class="production-table">
          <thead><tr><th>项目</th><th>下单数量</th><th>实际产量</th></tr></thead>
          <tbody>
            ${(order.items||[]).map(it => `<tr><td>${it.name}</td><td>${order.quantity}</td><td><input type="number" min="0" id="prod-${it.id}" placeholder="0" oninput="calcTotal()"></td></tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="2" style="font-weight:700">合计</td><td id="prod-total" style="font-weight:700;color:var(--primary)">0</td></tr></tfoot>
        </table>
      </div>
      <div class="form-group">
        <label>备注</label>
        <textarea class="form-input" id="prod-notes" placeholder="生产异常、物料问题等"></textarea>
      </div>
      <button class="btn btn-primary btn-block" onclick="submitProduction()">生产完工提交</button>
      <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate('team-list')">取消</button>
    </div>`;
}

function toggleWorker(el, name) {
  el.classList.toggle('selected');
  const idx = window._selectedWorkers.indexOf(name);
  if (idx > -1) window._selectedWorkers.splice(idx, 1);
  else window._selectedWorkers.push(name);
}

function calcTotal() {
  let total = 0;
  $$('[id^="prod-"]').forEach(inp => {
    if (inp.id !== 'prod-total' && inp.id !== 'prod-notes') total += parseInt(inp.value) || 0;
  });
  const el = $('#prod-total');
  if (el) el.textContent = total;
}

async function submitProduction() {
  const orderId = window._produceOrderId;
  const workers = window._selectedWorkers.join('、');
  if (!workers) return showToast('请选择当班人员', 'error');
  
  const order = await API.get(`/api/orders/${orderId}`);
  const itemDetails = (order.items||[]).map(it => ({
    name: it.name,
    product_item_id: it.id,
    produced: parseInt($(`#prod-${it.id}`).value) || 0,
    order_qty: order.quantity
  }));
  const total = itemDetails.reduce((s, it) => s + it.produced, 0);
  const notes = $('#prod-notes').value.trim();
  
  const res = await API.post(`/api/orders/${orderId}/production`, { workers, item_details: itemDetails, total_produced: total, notes, is_rework: false });
  if (res.success) { showToast('生产数据提交成功', 'success'); navigate('team-list'); }
  else showToast(res.msg || '提交失败', 'error');
}

async function renderTeamRework() {
  const orders = await API.get('/api/orders');
  const myRework = orders.filter(o => o.team_id === currentUser.team_id && o.status === 'qc_failed');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🔄 待补产订单</h1></div>
    <div class="page-content">
      ${!myRework.length ? '<div class="empty-state"><div class="empty-icon">✅</div>暂无补产订单</div>' :
        myRework.map(o => `
          <div class="order-item urgent" onclick="startRework(${o.id})">
            <div class="order-item-header"><span class="order-customer">${o.customer_name} 🔄补产</span>${statusTag(o.status)}</div>
            <div class="order-product">${o.product_name}</div>
            <div class="order-footer"><span class="order-no">${o.order_no}</span><span class="order-qty">下单 ${o.quantity}</span></div>
            <div style="margin-top:6px"><button class="btn btn-accent btn-sm" onclick="event.stopPropagation();startRework(${o.id})">补产填报</button></div>
          </div>
        `).join('')}
    </div>
    ${renderTabBar('team-rework')}`;
}

async function startRework(orderId) {
  window._reworkOrderId = orderId;
  const order = await API.get(`/api/orders/${orderId}`);
  const team = (await API.get('/api/teams')).find(t => t.id === currentUser.team_id);
  const members = team ? team.members : [];
  window._selectedWorkers = [];
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🔄 补产填报</h1></div>
    <div class="page-content">
      <div class="alert-banner"><span class="alert-icon">⚠️</span><span>此订单合格数量不足，需要补产</span></div>
      <div class="detail-section">
        <h3>📋 订单信息</h3>
        <div class="detail-row"><span class="label">单号</span><span class="value">${order.order_no}</span></div>
        <div class="detail-row"><span class="label">客户</span><span class="value">${order.customer_name}</span></div>
        <div class="detail-row"><span class="label">下单数量</span><span class="value" style="font-weight:700;color:var(--primary)">${order.quantity}</span></div>
      </div>
      <div class="detail-section">
        <h3>👷 选择当班人员</h3>
        <div class="worker-select">
          ${members.map(m => `<div class="worker-chip" onclick="toggleWorker(this,'${m.name}')">${m.name}</div>`).join('')}
        </div>
      </div>
      <div class="detail-section">
        <h3>📝 补产数据</h3>
        <table class="production-table">
          <thead><tr><th>项目</th><th>补产数量</th></tr></thead>
          <tbody>
            ${(order.items||[]).map(it => `<tr><td>${it.name}</td><td><input type="number" min="0" id="rw-${it.id}" placeholder="0" oninput="calcRework()"></td></tr>`).join('')}
          </tbody>
          <tfoot><tr><td style="font-weight:700">合计</td><td id="rw-total" style="font-weight:700">0</td></tr></tfoot>
        </table>
      </div>
      <div class="form-group"><label>备注</label><textarea class="form-input" id="rw-notes" placeholder="补产情况说明"></textarea></div>
      <button class="btn btn-primary btn-block" onclick="submitRework()">提交补产</button>
      <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate('team-rework')">取消</button>
    </div>`;
}

function calcRework() {
  let total = 0;
  $$('[id^="rw-"]').forEach(inp => { if (inp.id !== 'rw-total' && inp.id !== 'rw-notes') total += parseInt(inp.value) || 0; });
  const el = $('#rw-total');
  if (el) el.textContent = total;
}

async function submitRework() {
  const orderId = window._reworkOrderId;
  const workers = window._selectedWorkers.join('、');
  if (!workers) return showToast('请选择当班人员', 'error');
  const order = await API.get(`/api/orders/${orderId}`);
  const itemDetails = (order.items||[]).map(it => ({
    name: it.name, product_item_id: it.id,
    produced: parseInt($(`#rw-${it.id}`).value) || 0, order_qty: order.quantity
  }));
  const total = itemDetails.reduce((s, it) => s + it.produced, 0);
  const notes = $('#rw-notes').value.trim();
  const res = await API.post(`/api/orders/${orderId}/rework`, { workers, item_details: itemDetails, total_produced: total, notes });
  if (res.success) { showToast('补产数据提交成功', 'success'); navigate('team-rework'); }
  else showToast(res.msg || '提交失败', 'error');
}

// ===== 内包质检端（★核心改动：按细项分类填报） =====
async function renderQCOrders() {
  const orders = await API.get('/api/orders');
  const myOrders = orders.filter(o => ['produced','inspecting'].includes(o.status));
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🔍 待质检订单</h1><span class="role-badge">内包质检</span></div>
    <div class="page-content">
      ${!myOrders.length ? '<div class="empty-state"><div class="empty-icon">✅</div>暂无待质检订单</div>' :
        myOrders.map(o => `
          <div class="order-item" onclick="startInspection(${o.id})">
            <div class="order-item-header"><span class="order-customer">${o.customer_name}</span>${statusTag(o.status)}</div>
            <div class="order-product">${o.product_name} · ${o.product_details || ''}</div>
            <div class="order-footer"><span class="order-no">${o.order_no}</span><span class="order-qty">下单 ${o.quantity}</span></div>
            <div style="margin-top:6px"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();startInspection(${o.id})">开始质检</button></div>
          </div>
        `).join('')}
    </div>
    ${renderTabBar('qc-list')}`;
}

async function startInspection(orderId) {
  window._inspectOrderId = orderId;
  navigate('qc-inspect');
}

async function renderQCInspect() {
  const orderId = window._inspectOrderId;
  if (!orderId) return navigate('qc-list');
  const order = await API.get(`/api/orders/${orderId}`);
  const items = order.items || [];
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🔍 质检填报</h1></div>
    <div class="page-content">
      <div class="detail-section">
        <h3>📋 订单信息</h3>
        <div class="detail-row"><span class="label">单号</span><span class="value">${order.order_no}</span></div>
        <div class="detail-row"><span class="label">客户</span><span class="value">${order.customer_name}</span></div>
        <div class="detail-row"><span class="label">产品</span><span class="value">${order.product_name}</span></div>
        <div class="detail-row"><span class="label">下单数量</span><span class="value" style="font-weight:700;color:var(--primary)">${order.quantity}</span></div>
        ${order.color_code ? '<div class="detail-row"><span class="label">产品色号</span><span class="value"><span class="color-card-display"><span class="color-swatch" style="background:'+order.color_code+'"></span>'+order.color_code+'</span></span></div>' : ''}
        <div class="detail-row"><span class="label">内包材规格</span><span class="value">${order.inner_pack_spec||'-'} ×${order.inner_pack_qty||1}/件</span></div>
        <div class="detail-row"><span class="label">包装袋规格</span><span class="value" style="font-weight:700;color:var(--accent)">${order.inner_pack_spec||'-'}</span></div>
        ${order.image_url ? '<img src="'+order.image_url+'" style="max-width:160px;margin-top:8px;border-radius:8px">' : ''}
        ${(order.product_children||[]).length ? '<div style="margin-top:8px;font-size:13px;color:var(--accent)"><strong>子产品组合：</strong>'+order.product_children.map(function(c){return c.name+'×'+c.quantity}).join(' / ')+'</div>' : ''}
        ${(order.product_images||[]).map(function(im){return '<img src="'+im.image_url+'" style="width:50px;height:50px;object-fit:cover;border-radius:4px;margin:4px;display:inline-block">';}).join('')}
      </div>
      
      <div class="detail-section">
        <h3>📝 分项质检数据（每个细项单独填报）</h3>
        <div style="margin-bottom:8px;font-size:12px;color:var(--text-secondary)">逐项填写每个产品细项的合格数和不良原因</div>
        ${items.map((it, idx) => `
          <div class="card" style="border-left:4px solid var(--primary);margin-bottom:10px">
            <div style="font-weight:700;font-size:15px;margin-bottom:8px">🔸 ${it.name}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <div class="form-group" style="margin:0">
                <label style="font-size:12px">合格数量 *</label>
                <input class="form-input" type="number" min="0" id="qc-qual-${it.id}" placeholder="0" oninput="calcQCItemTotal(${it.id})">
              </div>
              <div class="form-group" style="margin:0">
                <label style="font-size:12px">不合格数量</label>
                <input class="form-input" type="number" min="0" id="qc-unqual-${it.id}" placeholder="0" oninput="calcQCItemTotal(${it.id})" readonly style="background:#f5f5f5">
              </div>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">不良原因分类：</div>
            <div class="defect-grid">
              <div class="defect-item"><label>毛发</label><input type="number" min="0" id="qc-dh-${it.id}" value="0" oninput="calcQCItemTotal(${it.id})"></div>
              <div class="defect-item"><label>串色</label><input type="number" min="0" id="qc-dcm-${it.id}" value="0" oninput="calcQCItemTotal(${it.id})"></div>
              <div class="defect-item"><label>毛边</label><input type="number" min="0" id="qc-de-${it.id}" value="0" oninput="calcQCItemTotal(${it.id})"></div>
              <div class="defect-item"><label>泛白</label><input type="number" min="0" id="qc-dw-${it.id}" value="0" oninput="calcQCItemTotal(${it.id})"></div>
              <div class="defect-item"><label>气洞</label><input type="number" min="0" id="qc-dbub-${it.id}" value="0" oninput="calcQCItemTotal(${it.id})"></div>
              <div class="defect-item"><label>破损</label><input type="number" min="0" id="qc-dbro-${it.id}" value="0" oninput="calcQCItemTotal(${it.id})"></div>
              <div class="defect-item"><label>颜色不合格</label><input type="number" min="0" id="qc-dcf-${it.id}" value="0" oninput="calcQCItemTotal(${it.id})"></div>
            </div>
          </div>
        `).join('')}
        
        <div class="card" style="background:#FDF8F3;border:2px solid var(--primary)">
          <div style="font-weight:700;font-size:15px;margin-bottom:8px">📊 质检汇总</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div style="text-align:center;padding:8px;background:white;border-radius:8px">
              <div style="font-size:24px;font-weight:800;color:var(--success)" id="qc-total-qual">0</div>
              <div style="font-size:12px;color:var(--text-secondary)">总合格数</div>
            </div>
            <div style="text-align:center;padding:8px;background:white;border-radius:8px">
              <div style="font-size:24px;font-weight:800;color:var(--danger)" id="qc-total-unqual">0</div>
              <div style="font-size:12px;color:var(--text-secondary)">总不合格数</div>
            </div>
          </div>
          <div id="qc-compare" style="margin-top:8px;text-align:center;font-size:13px"></div>
        </div>
      </div>
      
      <button class="btn btn-primary btn-block" onclick="submitInspection()">提交质检结果</button>
      <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate('qc-list')">取消</button>
    </div>`;
}

function calcQCItemTotal(itemId) {
  const qual = parseInt($(`#qc-qual-${itemId}`).value) || 0;
  const dh = parseInt($(`#qc-dh-${itemId}`).value) || 0;
  const dcm = parseInt($(`#qc-dcm-${itemId}`).value) || 0;
  const de = parseInt($(`#qc-de-${itemId}`).value) || 0;
  const dw = parseInt($(`#qc-dw-${itemId}`).value) || 0;
  const dbub = parseInt($(`#qc-dbub-${itemId}`).value) || 0;
  const dbro = parseInt($(`#qc-dbro-${itemId}`).value) || 0;
  const dcf = parseInt($(`#qc-dcf-${itemId}`).value) || 0;
  const totalDefect = dh + dcm + de + dw + dbub + dbro + dcf;
  $(`#qc-unqual-${itemId}`).value = totalDefect;
  
  // 更新汇总
  let totalQual = 0, totalUnqual = 0;
  $$('[id^="qc-qual-"]').forEach(inp => { totalQual += parseInt(inp.value) || 0; });
  $$('[id^="qc-unqual-"]').forEach(inp => { totalUnqual += parseInt(inp.value) || 0; });
  $('#qc-total-qual').textContent = totalQual;
  $('#qc-total-unqual').textContent = totalUnqual;
}

async function submitInspection() {
  const orderId = window._inspectOrderId;
  const order = await API.get(`/api/orders/${orderId}`);
  const items = order.items || [];
  
  const itemInspections = items.map(it => {
    const qual = parseInt($(`#qc-qual-${it.id}`).value) || 0;
    const unqual = parseInt($(`#qc-unqual-${it.id}`).value) || 0;
    const dh = parseInt($(`#qc-dh-${it.id}`).value) || 0;
    const dcm = parseInt($(`#qc-dcm-${it.id}`).value) || 0;
    const de = parseInt($(`#qc-de-${it.id}`).value) || 0;
    const dw = parseInt($(`#qc-dw-${it.id}`).value) || 0;
    const dbub = parseInt($(`#qc-dbub-${it.id}`).value) || 0;
    const dbro = parseInt($(`#qc-dbro-${it.id}`).value) || 0;
    const dcf = parseInt($(`#qc-dcf-${it.id}`).value) || 0;
    const defectSum = dh + dcm + de + dw + dbub + dbro + dcf;
    if (defectSum !== unqual) {
      showToast(`${it.name}：不良项合计(${defectSum})≠不合格数(${unqual})`, 'error');
    }
    return {
      product_item_id: it.id, product_item_name: it.name,
      qualified_qty: qual, unqualified_qty: unqual,
      defect_hair: dh, defect_color_mix: dcm, defect_edge: de,
      defect_whitening: dw, defect_bubble: dbub, defect_broken: dbro, defect_color_fail: dcf
    };
  });
  
  const totalQual = itemInspections.reduce((s, it) => s + it.qualified_qty, 0);
  const totalUnqual = itemInspections.reduce((s, it) => s + it.unqualified_qty, 0);
  
  const res = await API.post(`/api/orders/${orderId}/inspection`, {
    production_id: 0, qualified_qty: totalQual, unqualified_qty: totalUnqual,
    item_inspections: itemInspections
  });
  
  if (res.success) {
    if (res.result === 'pass') showToast('质检通过！已流转至外包打包', 'success');
    else showToast('质检不合格，已发送补产通知', 'warning');
    navigate('qc-list');
  } else {
    showToast(res.msg || '提交失败', 'error');
  }
}

// ===== 外包打包端 =====
async function renderPackOrders() {
  var orders = await API.get('/api/orders?status=qc_passed');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📦 待打包订单</h1><span class="role-badge">外包打包</span></div>
    <div class="page-content">
      ${!orders.length ? '<div class="empty-state"><div class="empty-icon">📭</div>暂无待打包订单</div>' :
        orders.map(function(o) {
          var ccHtml = o.color_code ? '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:'+esc(o.color_code)+';border:1px solid #999;vertical-align:middle;margin-right:5px"></span>' : '';
          var boxHtml = o.outer_pack_spec ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">📐 '+esc(o.outer_pack_spec)+'</div>' : '';
          var itemsHtml = '';
          if (o.items && o.items.length > 1) {
            itemsHtml = '<div style="font-size:11px;color:var(--accent);margin-top:2px">多产品: '+o.items.map(function(it){return it.product_name+'×'+it.quantity;}).join(' / ')+'</div>';
          } else if (o.product_children && o.product_children.length) {
            itemsHtml = '<div style="font-size:11px;color:var(--accent);margin-top:2px">含子产品: '+o.product_children.map(function(c){return c.name+'×'+c.quantity;}).join(' / ')+'</div>';
          }
          return '<div class="order-item" onclick="startPack('+o.id+')">'
            + '<div class="order-item-header"><span class="order-customer">'+esc(o.customer_name)+'</span>'+statusTag(o.status)+'</div>'
            + '<div class="order-product">'+ccHtml+esc(o.product_name)+'</div>'
            + (o.inner_pack_spec ? '<div style="font-size:11px;color:var(--text-secondary)">🛍️ '+esc(o.inner_pack_spec)+'</div>' : '')
            + boxHtml + itemsHtml
            + '<div class="order-footer"><span class="order-no">'+esc(o.order_no)+'</span><span class="order-qty">下单 '+o.quantity+'</span></div>'
            + '<div style="margin-top:6px"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();startPack('+o.id+')">开始打包</button></div>'
            + '</div>';
        }).join('')}
    </div>
    ${renderTabBar('pack-list')}`;
}

async function startPack(orderId) {
  window._packOrderId = orderId;
  navigate('pack-complete');
}

async function renderPackComplete() {
  var orderId = window._packOrderId;
  if (!orderId) return navigate('pack-list');
  var order = await API.get('/api/orders/' + orderId);
  var outMats = [];
  try { outMats = await API.get('/api/outer-pack-materials'); } catch(e) {}

  // 产品色号色块
  var ccHtml = order.color_code ? '<span style="display:inline-block;width:18px;height:18px;border-radius:4px;background:'+esc(order.color_code)+';border:1px solid #999;vertical-align:middle;margin-right:6px"></span><span style="font-size:13px;color:var(--text-secondary)">'+esc(order.color_code)+'</span>' : '<span style="color:var(--text-secondary)">未设置</span>';

  // 多产品订单项
  var itemsHtml = '';
  if (order.items && order.items.length > 0) {
    itemsHtml = '<div class="detail-section"><h3>🧩 订单产品明细</h3>';
    order.items.forEach(function(it) {
      var itCC = it.color_code ? '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:'+esc(it.color_code)+';border:1px solid #999;vertical-align:middle;margin-right:4px"></span>' : '';
      itemsHtml += '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px;margin-bottom:8px">'
        + '<div style="font-weight:700">'+itCC+esc(it.product_name)+' <span style="color:var(--accent);font-weight:800">×'+it.quantity+'</span></div>';
      if (it.inner_pack_spec) itemsHtml += '<div style="font-size:12px;color:var(--text-secondary)">🛍️ 内包材: '+esc(it.inner_pack_spec)+'</div>';
      if (it.outer_pack_spec) itemsHtml += '<div style="font-size:12px;color:var(--text-secondary)">📐 盒/箱规: '+esc(it.outer_pack_spec)+'</div>';
      if (it.children && it.children.length) {
        itemsHtml += '<div style="font-size:11px;color:var(--accent);margin-top:4px">└ 子产品: '+it.children.map(function(c){return c.name+'×'+c.quantity;}).join(' / ')+'</div>';
      }
      itemsHtml += '</div>';
    });
    itemsHtml += '</div>';
  }

  // 子产品明细
  var childrenHtml = '';
  if (order.product_children && order.product_children.length) {
    childrenHtml = '<div class="detail-section"><h3>🧸 子产品组合</h3>'
      + order.product_children.map(function(c) {
        var cImg = c.image_url ? '<img src="'+esc(c.image_url)+'" style="width:40px;height:40px;object-fit:cover;border-radius:6px;margin-right:8px" onerror="this.style.display=\'none\'">' : '';
        return '<div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color)">'+cImg+'<span style="flex:1;font-weight:600">'+esc(c.name)+'</span><span style="color:var(--accent);font-weight:800">×'+c.quantity+'</span></div>';
      }).join('')
      + '</div>';
  }

  // 盒规与箱规（从外包材库存匹配）
  var boxSpecHtml = '';
  var cartonSpecHtml = '';
  if (outMats.length) {
    var boxes = outMats.filter(function(m){return m.box_type === '飞机盒' || m.box_type === '礼盒';});
    var cartons = outMats.filter(function(m){return m.box_type === '外箱';});
    if (boxes.length) {
      boxSpecHtml = '<div class="detail-section"><h3>📏 盒规（内盒规格）</h3>'
        + boxes.map(function(m){
          var dQty = m.items_per_box ? Math.ceil(order.quantity / m.items_per_box) : 0;
          var lowClass = m.stock_qty < (m.min_alert||0) ? 'color:var(--error)' : '';
          return '<div class="detail-row"><span class="label">'+esc(m.name)+'</span><span class="value">'+esc(m.spec||'-')+' | 每盒装'+m.items_per_box+'个 | 需约'+dQty+'个 <span style="'+lowClass+'">库存:'+m.stock_qty+'</span></span></div>';
        }).join('')
        + '</div>';
    }
    if (cartons.length) {
      cartonSpecHtml = '<div class="detail-section"><h3>📐 箱规（外箱规格）</h3>'
        + cartons.map(function(m){
          var lowClass = m.stock_qty < (m.min_alert||0) ? 'color:var(--error)' : '';
          return '<div class="detail-row"><span class="label">'+esc(m.name)+'</span><span class="value">'+esc(m.spec||'-')+' <span style="'+lowClass+'">库存:'+m.stock_qty+'</span></span></div>';
        }).join('')
        + '</div>';
    }
  }

  // 产品配置的盒/箱规文字
  if (order.outer_pack_spec && !boxSpecHtml) {
    boxSpecHtml = '<div class="detail-section"><h3>📏 盒/箱规</h3><div class="detail-row"><span class="label">外包规格</span><span class="value">'+esc(order.outer_pack_spec)+'</span></div></div>';
  }

  $('#app').innerHTML = `
    <div class="page-header"><h1>📦 打包登记</h1><span class="role-badge">外包打包</span></div>
    <div class="page-content">
      <!-- 订单概要 -->
      <div class="detail-section">
        <h3>📋 订单信息</h3>
        <div class="detail-row"><span class="label">单号</span><span class="value" style="font-weight:800">${esc(order.order_no)}</span></div>
        <div class="detail-row"><span class="label">客户</span><span class="value">${esc(order.customer_name)} · ${esc(order.customer_contact||'-')}</span></div>
        <div class="detail-row"><span class="label">下单数量</span><span class="value" style="font-weight:800;color:var(--accent)">${order.quantity}</span></div>
        ${order.deadline ? '<div class="detail-row"><span class="label">交付期限</span><span class="value" style="color:var(--error)">⚠️ '+esc(order.deadline)+'</span></div>' : ''}
      </div>

      <!-- 产品色号 -->
      <div class="detail-section">
        <h3>🎨 产品信息</h3>
        <div class="detail-row"><span class="label">产品名称</span><span class="value" style="font-weight:700">${esc(order.product_name)}</span></div>
        <div class="detail-row"><span class="label">产品色号</span><span class="value">${ccHtml}</span></div>
        <div class="detail-row"><span class="label">内包材规格</span><span class="value">${esc(order.inner_pack_spec||'-')}${order.inner_pack_qty ? ' ×'+order.inner_pack_qty : ''}</span></div>
        ${order.product_details ? '<div class="detail-row"><span class="label">产品备注</span><span class="value">'+esc(order.product_details)+'</span></div>' : ''}
      </div>

      ${itemsHtml}
      ${childrenHtml}
      ${boxSpecHtml}
      ${cartonSpecHtml}

      <!-- 打包登记表单 -->
      <div class="card" style="margin-top:12px">
        <div class="form-group">
          <label>打包方式说明 *</label>
          <textarea class="form-input" id="pack-method" placeholder="例：每袋装5颗 → 每盒装2袋（10颗/盒）→ 每箱装12盒（120颗/箱）"></textarea>
        </div>
        <div class="form-group">
          <label>打包日期</label>
          <input class="form-input" id="pack-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group">
          <label>打包作业人员</label>
          <input class="form-input" id="pack-worker" placeholder="姓名">
        </div>
        <div class="form-group">
          <label>营养标签信息</label>
          <textarea class="form-input" id="pack-nutrition" placeholder="配料表、营养成分等标签信息"></textarea>
        </div>
        <div class="form-group">
          <label>产品生产日期</label>
          <input class="form-input" id="pack-prod-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <button class="btn btn-success btn-block" onclick="completePack()">✅ 打包完成（流程闭环）</button>
        <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate('pack-list')">取消</button>
      </div>
    </div>
    ${renderTabBar('pack-complete')}`;
}

async function completePack() {
  const pack_method = $('#pack-method').value.trim();
  if (!pack_method) return showToast('请填写打包方式', 'error');
  const pack_date = $('#pack-date').value;
  const pack_worker = $('#pack-worker').value.trim();
  const nutrition_label = $('#pack-nutrition').value.trim();
  const production_date = $('#pack-prod-date').value;
  const res = await API.post(`/api/orders/${window._packOrderId}/packaging`, { pack_method, pack_date, pack_worker, nutrition_label, production_date });
  if (res.success) { showToast('打包完成，订单已闭环！', 'success'); navigate('pack-list'); }
  else showToast(res.msg || '提交失败', 'error');
}

// 外包材领料申请
async function renderPackRequisition() {
  var orders = [];
  var outMats = [];
  try { orders = await API.get('/api/orders?status=qc_passed'); } catch(e) {}
  try { outMats = await API.get('/api/outer-pack-materials'); } catch(e) {}

  window._reqMats = outMats;
  window._reqOrders = orders;

  $('#app').innerHTML = `
    <div class="page-header"><h1>📋 外包材领料</h1><span class="role-badge">外包打包</span></div>
    <div class="page-content">
      <div class="detail-section" style="background:var(--bg-secondary);padding:12px;border-radius:8px;margin-bottom:12px">
        <div style="font-size:13px;color:var(--text-secondary)">💡 外包材领料申请将发送至仓库，仓库确认后发放。建议关联对应订单方便追踪。</div>
      </div>
      <div class="form-group">
        <label>选择外包材 *</label>
        <select class="form-input" id="pack-req-material" onchange="onPackReqMatChange()">
          <option value="">-- 请选择外包材 --</option>
          ${outMats.map(function(m){
            var low = m.stock_qty < (m.min_alert||0);
            return '<option value="'+m.id+'">'+esc(m.name)+' ('+esc(m.spec||'')+') | '+m.box_type+' | 库存:'+m.stock_qty+(low?' ⚠️低库存':'')+'</option>';
          }).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>领料数量 *</label>
        <input class="form-input" id="pack-req-qty" type="number" min="1" placeholder="请输入领用数量">
      </div>
      <div class="form-group">
        <label>关联订单（可选）</label>
        <select class="form-input" id="pack-req-order">
          <option value="">-- 不关联订单 --</option>
          ${orders.map(function(o){
            return '<option value="'+o.id+'|'+esc(o.order_no)+'">'+esc(o.order_no)+' · '+esc(o.customer_name)+' · '+esc(o.product_name)+' ×'+o.quantity+'</option>';
          }).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>用途说明</label>
        <input class="form-input" id="pack-req-note" placeholder="如：订单QK000001的飞机盒和外箱">
      </div>
      <button class="btn btn-primary btn-block" onclick="submitPackRequisition()">📤 提交领料申请</button>
    </div>
    ${renderTabBar('pack-requisition')}`;
}

function onPackReqMatChange() {
  var mid = parseInt(document.getElementById('pack-req-material').value);
  var m = (window._reqMats||[]).find(function(x){return x.id === mid;});
  if (m && document.getElementById('pack-req-note')) {
    var cur = document.getElementById('pack-req-note').value;
    if (!cur) document.getElementById('pack-req-note').value = '外包材: '+m.name+' '+m.spec;
  }
}

async function submitPackRequisition() {
  var mid = parseInt(document.getElementById('pack-req-material').value);
  var qty = parseInt(document.getElementById('pack-req-qty').value);
  var orderVal = document.getElementById('pack-req-order').value;
  var note = document.getElementById('pack-req-note').value.trim();

  if (!mid || !qty || qty < 1) return showToast('请完善领料信息', 'error');

  var orderId = null, orderNo = '';
  if (orderVal) {
    var parts = orderVal.split('|');
    orderId = parseInt(parts[0]);
    orderNo = parts[1] || '';
  }

  var res = await API.post('/api/material-requisitions', {
    type: 'outer',
    material_id: mid,
    quantity: qty,
    order_id: orderId,
    order_no: orderNo,
    note: note
  });

  if (res.success) {
    showToast('外包材领料申请已提交至仓库', 'success');
    document.getElementById('pack-req-material').value = '';
    document.getElementById('pack-req-qty').value = '';
    document.getElementById('pack-req-order').value = '';
    document.getElementById('pack-req-note').value = '';
  } else {
    showToast(res.msg || '提交失败', 'error');
  }
}

// ===== 总台监控端 =====
async function renderConsoleOverview() {
  const stats = await API.get('/api/stats/overview');
  const orders = await API.get('/api/orders');
  const recent = orders.slice(0, 10);
  
  const statusCount = {};
  orders.forEach(o => { statusCount[o.status] = (statusCount[o.status] || 0) + 1; });
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🖥️ 总台监控</h1><span class="role-badge">总台</span></div>
    <div class="page-content">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${stats.total||0}</div><div class="stat-label">总订单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#D48806">${stats.pending||0}</div><div class="stat-label">待派单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#1890FF">${stats.producing||0}</div><div class="stat-label">生产中</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#52C41A">${stats.completed||0}</div><div class="stat-label">已完成</div></div>
      </div>
      <div class="card">
        <div class="card-title">📊 各状态订单分布</div>
        ${Object.entries(STATUS_MAP).map(([k,v]) => `
          <div class="detail-row"><span class="label">${v.label}</span><span class="value">${statusCount[k]||0}</span></div>
        `).join('')}
      </div>
      <div class="card">
        <div class="card-title">🕐 最近订单</div>
        ${recent.map(o => `
          <div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center" onclick="viewOrder(${o.id},'console')">
            <div><span style="font-weight:600">${o.customer_name}</span> <span style="font-size:12px;color:var(--text-secondary)">${o.order_no}</span></div>
            ${statusTag(o.status)}
          </div>
        `).join('')}
      </div>
    </div>
    ${renderTabBar('console-overview')}`;
}

async function renderConsoleOrders() {
  const orders = await API.get('/api/orders');
  window._allOrders = orders;
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📋 全部订单</h1><span class="role-badge">总台</span></div>
    <div class="page-content">
      <div class="search-bar">
        <input id="search-keyword" placeholder="搜索单号/客户" oninput="filterOrders()">
      </div>
      <div class="filter-tags">
        <span class="filter-tag active" onclick="setFilter(this,'')">全部</span>
        <span class="filter-tag" onclick="setFilter(this,'pending')">待派单</span>
        <span class="filter-tag" onclick="setFilter(this,'dispatched')">已派单</span>
        <span class="filter-tag" onclick="setFilter(this,'produced')">生产完工</span>
        <span class="filter-tag" onclick="setFilter(this,'qc_passed')">质检通过</span>
        <span class="filter-tag" onclick="setFilter(this,'qc_failed')">不合格</span>
        <span class="filter-tag" onclick="setFilter(this,'completed')">已完成</span>
      </div>
      <div id="order-list"></div>
    </div>
    ${renderTabBar('console-orders')}`;
  renderOrderList(orders);
}

// ===== 财务端 =====
async function renderFinanceOverview() {
  const stats = await API.get('/api/stats/overview');
  const now = new Date();
  const period = '' + now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const wageSummary = await API.get(`/api/wages/summary?period=${period}`);
  const totalWage = wageSummary.reduce((s, w) => s + (parseFloat(w.total_wage) || 0), 0);
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>💰 财务总览</h1><span class="role-badge">财务 · ${period}</span></div>
    <div class="page-content">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${stats.completed||0}</div><div class="stat-label">已完成订单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#CF1322">¥${totalWage.toFixed(2)}</div><div class="stat-label">本月工资总额</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#389E0D">${wageSummary.length}</div><div class="stat-label">计薪人数</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#1890FF">${stats.total||0}</div><div class="stat-label">总订单数</div></div>
      </div>
      <div class="card">
        <div class="card-title">💵 本月工资汇总</div>
        ${wageSummary.length ? `
          <table class="production-table">
            <thead><tr><th>工人</th><th>参与订单</th><th>合格产量</th><th>工资</th><th>操作</th></tr></thead>
            <tbody>
              ${wageSummary.map(w => `
                <tr>
                  <td style="font-weight:600">${w.team_member_name}</td>
                  <td>${w.order_count}</td>
                  <td>${w.total_qualified}</td>
                  <td style="color:var(--primary);font-weight:700">¥${parseFloat(w.total_wage).toFixed(2)}</td>
                  <td><button class="btn btn-outline btn-sm" onclick="viewWorkerDetail('${w.team_member_name}')">明细</button></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td style="font-weight:700">合计</td>
                <td>-</td>
                <td>${wageSummary.reduce((s,w)=>s+(parseInt(w.total_qualified)||0),0)}</td>
                <td style="font-weight:700;color:var(--primary)">¥${totalWage.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        ` : '<div style="text-align:center;padding:20px;color:var(--text-secondary)">本月暂无工资数据</div>'}
      </div>
    </div>
    ${renderTabBar('finance-overview')}`;
}

async function viewWorkerDetail(name) {
  const now = new Date();
  const period = '' + now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const details = await API.get(`/api/wages/worker/${encodeURIComponent(name)}?period=${period}`);
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>💵 ${name} - 工资明细</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <table class="production-table">
        <thead><tr><th>订单</th><th>项目</th><th>合格量</th><th>单价</th><th>金额</th></tr></thead>
        <tbody>
          ${details.map(d => `
            <tr>
              <td style="font-size:11px">${d.order_no}</td>
              <td>${d.product_item_name}</td>
              <td>${d.qualified_qty}</td>
              <td>¥${parseFloat(d.price_per_unit).toFixed(2)}</td>
              <td style="font-weight:700;color:var(--primary)">¥${parseFloat(d.wage_amount).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="4" style="font-weight:700">合计</td>
          <td style="font-weight:700;color:var(--primary)">¥${details.reduce((s,d)=>s+parseFloat(d.wage_amount),0).toFixed(2)}</td></tr>
        </tfoot>
      </table>
    </div>`;
  document.body.appendChild(modal);
}

async function renderFinanceWages() {
  const now = new Date();
  const period = '' + now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const wages = await API.get(`/api/wages?period=${period}`);
  const wageSummary = await API.get(`/api/wages/summary?period=${period}`);
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>💵 工资核算</h1><span class="role-badge">${period}</span></div>
    <div class="page-content">
      <div class="card">
        <div class="card-title">📊 工资汇总</div>
        ${wageSummary.length ? `
          <table class="production-table">
            <thead><tr><th>工人</th><th>订单数</th><th>合格产量</th><th>工资</th></tr></thead>
            <tbody>
              ${wageSummary.map(w => `
                <tr>
                  <td style="font-weight:600">${w.team_member_name}</td>
                  <td>${w.order_count}</td>
                  <td>${w.total_qualified}</td>
                  <td style="color:var(--primary);font-weight:700">¥${parseFloat(w.total_wage).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="text-align:center;padding:20px;color:var(--text-secondary)">暂无数据</div>'}
      </div>
      <div class="card">
        <div class="card-title">📋 工资明细</div>
        ${wages.length ? `
          <table class="production-table">
            <thead><tr><th>工人</th><th>订单</th><th>项目</th><th>合格</th><th>单价</th><th>金额</th></tr></thead>
            <tbody>
              ${wages.map(w => `
                <tr>
                  <td>${w.team_member_name}</td>
                  <td style="font-size:11px">${w.order_no}</td>
                  <td>${w.product_item_name}</td>
                  <td>${w.qualified_qty}</td>
                  <td>¥${parseFloat(w.price_per_unit).toFixed(2)}</td>
                  <td style="font-weight:700">¥${parseFloat(w.wage_amount).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="text-align:center;padding:20px;color:var(--text-secondary)">暂无数据</div>'}
      </div>
    </div>
    ${renderTabBar('finance-wages')}`;
}

async function renderFinancePrices() {
  const prices = await API.get('/api/piece-prices');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🏷️ 计件工价管理</h1><span class="role-badge">财务</span></div>
    <div class="page-content">
      ${prices.map(p => `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700">${p.product_name} - ${p.item_name}</div>
            <div style="font-size:12px;color:var(--text-secondary)">当前单价：<span style="color:var(--primary);font-weight:700">¥${parseFloat(p.price_per_unit).toFixed(2)}/个</span></div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="form-input" type="number" step="0.01" min="0" id="price-${p.id}" value="${parseFloat(p.price_per_unit).toFixed(2)}" style="width:80px;text-align:center">
            <button class="btn btn-primary btn-sm" onclick="updatePrice(${p.id})">更新</button>
          </div>
        </div>
      `).join('')}
    </div>
    ${renderTabBar('finance-prices')}`;
}

async function updatePrice(priceId) {
  const price = parseFloat($(`#price-${priceId}`).value);
  if (isNaN(price) || price < 0) return showToast('请输入有效的工价', 'error');
  const res = await API.put(`/api/piece-prices/${priceId}`, { price_per_unit: price });
  if (res.success) showToast('工价更新成功', 'success');
  else showToast('更新失败', 'error');
}

// ===== 通知 =====
async function loadNotifications() {
  if (!currentUser) return;
  notifications = await API.get('/api/notifications');
}

async function renderNotifications() {
  await loadNotifications();
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🔔 消息通知</h1></div>
    <div class="page-content">
      ${notifications.length ? `
        <button class="btn btn-outline btn-sm" style="margin-bottom:10px" onclick="markAllRead()">全部已读</button>
        ${notifications.map(n => `
          <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id})">
            <div class="noti-type">${n.type}</div>
            <div class="noti-title">${n.title}</div>
            <div class="noti-content">${n.content || ''}</div>
            <div class="noti-time">${formatTime(n.created_at)}</div>
          </div>
        `).join('')}
      ` : '<div class="empty-state"><div class="empty-icon">🔔</div>暂无消息</div>'}
    </div>
    ${renderTabBar('notifications')}`;
}

async function markRead(id) {
  await API.put(`/api/notifications/${id}/read`);
  renderNotifications();
}

async function markAllRead() {
  await API.put('/api/notifications/read-all');
  renderNotifications();
}

// ===== 统计看板 =====
async function renderStats() {
  try {
  const stats = await API.get('/api/stats/overview');
  const defectStats = await API.get('/api/stats/defect');
  const prodStats = await API.get('/api/stats/production');
  
  // 加载增强统计（逾期率、返工率、趋势、产能、库存预警）
  var enhanced = { overdue_rate: '0', rework_rate: '0', trends: [], teams: [], low_stock: { raw: 0, inner: 0, outer: 0, items: [] } };
  try { enhanced = await API.get('/api/stats/enhanced'); } catch(e) {}
  
  var trendBars = enhanced.trends.map(function(t) {
    var maxH = Math.max(t.completed, t.created, 1);
    var ch = Math.round(t.completed / maxH * 40);
    var cr = Math.round(t.created / maxH * 40);
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px">' +
      '<span style="font-size:11px;font-weight:600">' + t.completed + '</span>' +
      '<div style="width:16px;height:' + ch + 'px;background:#52C41A;border-radius:3px 3px 0 0"></div>' +
      '<div style="width:16px;height:' + cr + 'px;background:#1890FF;border-radius:3px 3px 0 0;margin-top:1px"></div>' +
      '<span style="font-size:10px;color:var(--text-secondary)">' + t.date.slice(5) + '</span></div>';
  }).join('');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📊 数据统计</h1></div>
    <div class="page-content">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${stats.total||0}</div><div class="stat-label">总订单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#52C41A">${stats.completed||0}</div><div class="stat-label">已完成</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#D48806">${stats.pending||0}</div><div class="stat-label">待派单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#CF1322">${enhanced.overdue_rate}%</div><div class="stat-label">逾期率</div></div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value" style="color:var(--info)">${enhanced.overdue_count||0}</div><div class="stat-label">逾期订单</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#D48806">${enhanced.rework_rate}%</div><div class="stat-label">返工率</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#CF1322">${enhanced.low_stock.raw}</div><div class="stat-label">原料预警</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${stats.inspecting||0}</div><div class="stat-label">质检中</div></div>
      </div>
      ${trendBars ? `
      <div class="card">
        <div class="card-title">📈 近7日趋势 <span style="font-size:11px;font-weight:normal;color:var(--text-secondary)">🟢完成 🔵新建</span></div>
        <div style="display:flex;justify-content:space-around;align-items:flex-end;height:70px;padding-top:8px">${trendBars}</div>
      </div>
      ` : ''}
      <div class="card">
        <div class="card-title">🏭 班组产能</div>
        ${enhanced.teams.map(function(t) {
          var total = Math.max(t.completed + t.in_progress, 1);
          var pct = Math.round(t.completed / total * 100);
          return '<div class="detail-row"><span class="label">' + t.name + '</span><span class="value">✅' + t.completed + '单 / 🔄' + t.in_progress + '单 (' + pct + '%)</span></div>';
        }).join('')}
      </div>
      <div class="card">
        <div class="card-title">⚠️ 不良品统计</div>
        <div class="detail-row"><span class="label">毛发</span><span class="value">${defectStats.hair||0}</span></div>
        <div class="detail-row"><span class="label">串色</span><span class="value">${defectStats.color_mix||0}</span></div>
        <div class="detail-row"><span class="label">毛边</span><span class="value">${defectStats.edge||0}</span></div>
        <div class="detail-row"><span class="label">泛白</span><span class="value">${defectStats.whitening||0}</span></div>
        <div class="detail-row"><span class="label">气洞</span><span class="value">${defectStats.bubble||0}</span></div>
        <div class="detail-row"><span class="label">破损</span><span class="value">${defectStats.broken||0}</span></div>
        <div class="detail-row"><span class="label">颜色不合格</span><span class="value">${defectStats.color_fail||0}</span></div>
      </div>
      ${enhanced.low_stock.items.length > 0 ? `
      <div class="card" style="border-left:3px solid #CF1322">
        <div class="card-title">🚨 库存不足预警</div>
        ${enhanced.low_stock.items.map(function(it) {
          return '<div class="detail-row"><span class="label">' + (it.name||'') + '</span><span class="value" style="color:#CF1322">库存' + it.stock_qty + '</span></div>';
        }).join('')}
      </div>
      ` : ''}
    </div>
    ${renderTabBar('stats')}`;
  } catch(e) {
    console.error('renderStats error:', e);
    $('#app').innerHTML = '<div class="page-header"><h1>📊 数据统计</h1></div><div class="page-content"><div class="empty-state"><div class="empty-icon">⚠️</div>统计加载失败，请刷新重试</div></div>';
  }
}

// ===== 管理后台 =====
async function renderAdmin() {
  const customers = await API.get('/api/customers');
  const products = await API.get('/api/products');
  const teams = await API.get('/api/teams');
  const users = await API.get('/api/users');
  const settings = await API.get('/api/settings');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>⚙️ 管理后台</h1><span class="role-badge">管理员</span></div>
    <div class="page-content">
      <div class="admin-section">
        <h3>🏢 客户档案</h3>
        ${customers.map(c => `
          <div class="admin-item">
            <span class="item-name">${c.name}${c.contact ? ` (${c.contact})` : ''}</span>
            <div class="item-actions"><button class="btn btn-danger btn-sm" onclick="deleteCustomer(${c.id})">删除</button></div>
          </div>
        `).join('')}
        <div style="margin-top:8px;display:flex;gap:6px">
          <input class="form-input" id="inp-new-customer" placeholder="客户名称" style="flex:1">
          <button class="btn btn-primary btn-sm" onclick="addCustomer()">添加</button>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">
          📥 批量导入：<input type="file" id="cust-import-file" accept=".xlsx,.xls" style="display:inline;width:auto;font-size:12px" onchange="importCustomers()">
          <span style="margin-left:4px">Excel第一列=名称，第二列=联系人，第三列=备注</span>
        </div>
      </div>
      <div class="admin-section">
        <h3>📦 产品档案</h3>
        ${products.map(p => `
          <div class="admin-item">
            <div>
              <span class="item-name">${p.name}</span>
              ${p.image_url ? `<img src="${p.image_url}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-left:6px">` : ''}
              <div style="font-size:12px;color:var(--text-secondary)">色卡: ${p.color_code||'-'} | 内包: ${p.inner_pack_spec||'-'}/${p.inner_pack_qty||1}个 | 外包: ${p.outer_pack_spec||'-'}</div>
              ${(p.children||[]).length ? '<div style="font-size:11px;color:var(--accent);margin-top:2px">子产品: '+p.children.map(function(c){return c.name+'×'+c.quantity}).join(' / ')+'</div>' : ''}
            </div>
            <div class="item-actions">
              <button class="btn btn-outline btn-sm" onclick="editProduct(${p.id})">编辑</button>
            </div>
          </div>
        `).join('')}
        <div style="margin-top:8px;display:flex;gap:6px">
          <input class="form-input" id="inp-new-product" placeholder="产品名称" style="flex:1">
          <button class="btn btn-primary btn-sm" onclick="addProduct()">添加</button>
        </div>
      </div>
      <div class="admin-section">
        <h3>🏭 生产班组</h3>
        ${teams.map(t => `
          <div class="admin-item">
            <div><span class="item-name">${t.name}</span>
            <div style="font-size:12px;color:var(--text-secondary)">成员：${t.members ? t.members.map(m=>m.name).join('、') : '无'}</div></div>
            <div class="item-actions">
              <button class="btn btn-outline btn-sm" onclick="addTeamMember(${t.id})">+成员</button>
              <button class="btn btn-danger btn-sm" onclick="deleteTeam(${t.id})">删除</button>
            </div>
          </div>
        `).join('')}
        <div style="margin-top:8px;display:flex;gap:6px">
          <input class="form-input" id="inp-new-team" placeholder="班组名称" style="flex:1">
          <button class="btn btn-primary btn-sm" onclick="addTeam()">添加</button>
        </div>
      </div>
      <div class="admin-section">
        <h3>👤 账号管理</h3>
        ${users.map(u => `
          <div class="admin-item">
            <div><span class="item-name">${u.real_name}</span>
            <span style="font-size:12px;color:var(--text-secondary);margin-left:6px">${u.username} · ${{clerk:'文员',supervisor:'组长',team:'班组',qc:'质检',packaging:'打包',admin:'管理员',console:'总台',finance:'财务',warehouse:'仓库',procurement:'采购',preparation:'配料'}[u.role]||u.role}</span></div>
            <div class="item-actions"><button class="btn btn-outline btn-sm" onclick="editUser(${u.id},'${u.real_name}')">改密</button></div>
          </div>
        `).join('')}
      </div>
      <div class="admin-section">
        <h3>⚙️ 系统设置</h3>
        <div class="form-group"><label>派单预警阈值</label><input class="form-input" id="inp-threshold" type="number" value="${settings.dispatch_threshold || 3}"></div>
        <div class="form-group"><label>单号前缀</label><input class="form-input" id="inp-order-prefix" value="${settings.order_prefix || 'QK'}"></div>
        <button class="btn btn-primary btn-sm" onclick="saveSettings()">保存设置</button>
      </div>
    </div>
    ${renderTabBar('admin')}`;
}

async function addCustomer() {
  const name = $('#inp-new-customer').value.trim();
  if (!name) return showToast('请输入客户名称', 'error');
  await API.post('/api/customers', { name });
  showToast('添加成功', 'success'); navigate('admin');
}
async function deleteCustomer(id) {
  if (!confirm('确定删除该客户？')) return;
  await API.delete(`/api/customers/${id}`); showToast('已删除', 'success'); navigate('admin');
}
async function importCustomers() {
  var f = document.getElementById('cust-import-file').files[0];
  if (!f) return;
  if (!f.name.match(/\.xlsx?$/i)) return showToast('请选择 .xlsx 或 .xls 文件', 'error');
  var fd = new FormData();
  fd.append('file', f);
  showToast('正在导入...', 'warning');
  var resp = await fetch('/api/customers/import', { method: 'POST', body: fd });
  var res = await resp.json();
  if (res.success) { showToast(res.msg || '导入成功', 'success'); navigate('admin'); }
  else showToast(res.msg || '导入失败', 'error');
}
// ===== 产品编辑 =====
var _editProdChildren = [];
async function addProduct() {
  var name = document.getElementById('inp-new-product').value.trim();
  if (!name) return showToast('请输入产品名称', 'error');
  await API.post('/api/products', { name: name, customer_id: 1, inner_pack_qty: 1 });
  showToast('产品已添加', 'success'); navigate('admin');
}
async function editProduct(id) {
  var prod = await API.get('/api/products/' + id);
  var customers = await API.get('/api/customers');
  _editProdChildren = prod.children || [];
  
  var h = '<div class="modal-overlay"><div class="modal-content"><div class="modal-header"><h3>编辑产品</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>' +
    '<div class="form-group"><label>客户</label><select class="form-input" id="ep-customer">' + customers.map(function(c){ return '<option value="'+c.id+'"'+(c.id===prod.customer_id?' selected':'')+'>'+c.name+'</option>'; }).join('') + '</select></div>' +
    '<div class="form-group"><label>产品名称</label><input class="form-input" id="ep-name" value="' + (prod.name||'') + '"></div>' +
    '<div class="form-group"><label>色卡编号</label><input class="form-input" id="ep-color" value="' + (prod.color_code||'') + '"></div>' +
    '<div class="form-group"><label>内包规格</label><input class="form-input" id="ep-inner-spec" value="' + (prod.inner_pack_spec||'') + '"></div>' +
    '<div class="form-group"><label>每单位内包材数量</label><input class="form-input" id="ep-inner-qty" type="number" min="1" value="' + (prod.inner_pack_qty||1) + '"></div>' +
    '<div class="form-group"><label>外包规格</label><input class="form-input" id="ep-outer-spec" value="' + (prod.outer_pack_spec||'') + '"></div>' +
    '<div class="form-group"><label>产品图片</label><input type="file" id="ep-image" accept="image/*">' + (prod.image_url?'<img src="'+prod.image_url+'" style="width:80px;margin-top:6px;border-radius:8px">':'') + '</div>' +
    '<div style="margin-top:12px;font-weight:700;font-size:14px">子产品组合</div>' +
    '<div id="ep-children">' + _editProdChildren.map(function(ch,i){ return '<div class="prep-item-row" style="display:flex;gap:6px;margin-bottom:4px"><input class="form-input" style="flex:2" placeholder="子产品名" value="'+(ch.name||'')+'"><input class="form-input" style="width:70px" type="number" min="1" value="'+(ch.quantity||1)+'"><input type="file" accept="image/*" style="width:80px;font-size:11px">'+ (ch.image_url?'<img src="'+ch.image_url+'" style="width:30px;height:30px;object-fit:cover;border-radius:4px">':'') +'</div>'; }).join('') + '</div>' +
    '<button class="btn btn-outline btn-sm" onclick="addEditChild()" style="margin-top:6px">+ 添加子产品</button>' +
    '<div style="margin-top:16px"><button class="btn btn-primary btn-block" onclick="saveProduct('+id+')">保存</button></div></div></div>';
  
  document.body.insertAdjacentHTML('beforeend', h);
  window._editProdId = id;
}
function addEditChild() {
  var div = document.createElement('div');
  div.className = 'prep-item-row';
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
  div.innerHTML = '<input class="form-input" style="flex:2" placeholder="子产品名"><input class="form-input" style="width:70px" type="number" min="1" value="1"><input type="file" accept="image/*" style="width:80px;font-size:11px">';
  document.getElementById('ep-children').appendChild(div);
}
async function saveProduct(id) {
  var children = [], prod = await API.get('/api/products/'+id);
  document.querySelectorAll('#ep-children .prep-item-row').forEach(function(row){
    var inps = row.querySelectorAll('input[type=text],input:not([type])');
    var qty = row.querySelector('input[type=number]');
    var name = inps[0] ? inps[0].value.trim() : '';
    if (name) children.push({ name: name, quantity: parseInt(qty?qty.value:1)||1 });
  });
  
  var body = {
    customer_id: parseInt(document.getElementById('ep-customer').value),
    name: document.getElementById('ep-name').value.trim(),
    color_code: document.getElementById('ep-color').value.trim(),
    inner_pack_spec: document.getElementById('ep-inner-spec').value.trim(),
    inner_pack_qty: parseInt(document.getElementById('ep-inner-qty').value)||1,
    outer_pack_spec: document.getElementById('ep-outer-spec').value.trim(),
    image_url: prod.image_url || '',
    children: children
  };
  
  var imgFile = document.getElementById('ep-image').files[0];
  if (imgFile) {
    var fd = new FormData(); fd.append('image', imgFile);
    var ir = await (await fetch('/api/products/'+id+'/cover', { method:'POST', body:fd })).json();
    if (ir.success) body.image_url = ir.image_url;
  }
  
  var childRows = document.querySelectorAll('#ep-children .prep-item-row');
  for (var i = 0; i < children.length; i++) {
    var cf = childRows[i] ? childRows[i].querySelector('input[type=file]') : null;
    if (cf && cf.files[0] && _editProdChildren[i]) {
      var cfd = new FormData(); cfd.append('image', cf.files[0]);
      var cr = await (await fetch('/api/product-children/'+_editProdChildren[i].id+'/image', { method:'POST', body:cfd })).json();
      if (cr.success) children[i].image_url = cr.image_url;
    }
  }
  
  var res = await API.put('/api/products/'+id, body);
  if (res.success) { showToast('产品已更新', 'success'); closeModal(); navigate('admin'); }
  else showToast(res.msg||'更新失败', 'error');
}
async function addTeam() {
  const name = $('#inp-new-team').value.trim();
  if (!name) return showToast('请输入班组名称', 'error');
  await API.post('/api/teams', { name }); showToast('添加成功', 'success'); navigate('admin');
}
async function deleteTeam(id) {
  if (!confirm('确定删除该班组？')) return;
  await API.delete(`/api/teams/${id}`); showToast('已删除', 'success'); navigate('admin');
}
async function addTeamMember(teamId) {
  const name = prompt('请输入成员姓名：');
  if (!name) return;
  await API.post(`/api/teams/${teamId}/members`, { name }); showToast('添加成功', 'success'); navigate('admin');
}
async function saveSettings() {
  const threshold = $('#inp-threshold').value;
  const order_prefix = $('#inp-order-prefix').value.trim();
  await API.put('/api/settings', { dispatch_threshold: threshold, order_prefix });
  showToast('设置已保存', 'success');
}
async function editUser(id, name) {
  var pw = prompt('为「' + name + '」设置新密码（留空则不改）：');
  if (pw === null) return;
  if (pw === '') { showToast('未修改', 'warning'); return; }
  if (pw.length < 4) { showToast('密码至少4位', 'error'); return; }
  var rp = prompt('再次输入新密码确认：');
  if (rp !== pw) { showToast('两次输入不一致', 'error'); return; }
  await API.put('/api/users/' + id, { password: pw });
  showToast('密码已更新', 'success');
  navigate('admin');
}

// ===== 底部导航栏 =====
function renderTabBar(activeTab) {
  const role = currentUser?.role;
  const tabs = {
    clerk: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'clerk-orders', icon: '📋', label: '订单' },
      { id: 'clerk-new', icon: '➕', label: '新建' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    supervisor: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'supervisor-pending', icon: '📥', label: '待派单' },
      { id: 'supervisor-stats', icon: '📊', label: '统计' },
      { id: 'stats', icon: '📈', label: '数据' },
      { id: 'notifications', icon: '🔔', label: '消息' }
    ],
    team: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'team-list', icon: '🏭', label: '生产' },
      { id: 'team-rework', icon: '🔄', label: '补产' },
      { id: 'stats', icon: '📊', label: '统计' },
      { id: 'notifications', icon: '🔔', label: '消息' }
    ],
    qc: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'qc-list', icon: '🔍', label: '质检' },
      { id: 'qc-requisition', icon: '📋', label: '领料' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    packaging: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'pack-list', icon: '📦', label: '打包' },
      { id: 'pack-requisition', icon: '📋', label: '领料' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    console: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'console-overview', icon: '🖥️', label: '总览' },
      { id: 'console-orders', icon: '📋', label: '全部订单' },
      { id: 'stats', icon: '📊', label: '统计' }
    ],
    finance: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'finance-overview', icon: '💰', label: '总览' },
      { id: 'finance-wages', icon: '💵', label: '工资' },
      { id: 'finance-prices', icon: '🏷️', label: '工价' }
    ],
    warehouse: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'warehouse-procurement', icon: '📋', label: '采购' },
      { id: 'warehouse-suppliers', icon: '🏢', label: '供应商' },
      { id: 'warehouse-materials', icon: '🧈', label: '原料' },
      { id: 'warehouse-finished', icon: '🏭', label: '成品' },
      { id: 'warehouse-outbound', icon: '🚚', label: '出库' },
      { id: 'warehouse-inbound', icon: '📥', label: '入库' },
      { id: 'warehouse-receiving', icon: '📦', label: '到货' },
      { id: 'warehouse-ledger', icon: '📒', label: '台账' },
      { id: 'notifications', icon: '🔔', label: '消息' }
    ],
    procurement: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'warehouse-procurement', icon: '📋', label: '采购' },
      { id: 'warehouse-suppliers', icon: '🏢', label: '供应商' },
      { id: 'notifications', icon: '🔔', label: '消息' }
    ],
    preparation: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'preparation-list', icon: '🧪', label: '配料' }
    ],
    admin: [
      { id: 'dashboard', icon: '🏠', label: '首页' },
      { id: 'admin', icon: '⚙️', label: '管理' },
      { id: 'clerk-orders', icon: '📋', label: '订单' },
      { id: 'notifications', icon: '🔔', label: '消息' },
      { id: 'stats', icon: '📊', label: '统计' }
    ]
  };
  
  const myTabs = tabs[role] || [];
  return `<div class="tab-bar">${myTabs.map(t => `
    <div class="tab-item ${t.id === activeTab ? 'active' : ''}" onclick="navigate('${t.id}')">
      <span class="tab-icon">${t.icon}</span>
      <span>${t.label}</span>
    </div>
  `).join('')}</div>`;
}

// ===== 仓库管理端 =====

// 原材料管理
async function renderWarehouseMaterials() {
  const materials = await API.get('/api/raw-materials');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🧈 原材料库存</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddRawMaterial()">+ 添加原材料</button>
      ${materials.length ? materials.map(m => `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700">${m.name}</div>
              <div style="font-size:12px;color:var(--text-secondary)">规格: ${m.spec||'-'} | 单位: ${m.unit}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:20px;font-weight:800;color:${m.stock_qty <= m.min_alert ? 'var(--danger)' : 'var(--success)'}">${m.stock_qty}</div>
              <div style="font-size:11px;color:var(--text-secondary)">${m.stock_qty <= m.min_alert ? '⚠️ 低于预警' : '库存充足'}</div>
            </div>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="adjustRawMaterial(${m.id},'${m.name}',${m.stock_qty})">调整库存</button>
            <button class="btn btn-accent btn-sm" onclick="issueRawMaterial(${m.id},'${m.name}')">领用出库</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-icon">🧈</div>暂无原材料</div>'}
    </div>
    ${renderTabBar('warehouse-materials')}`;
}

function showAddRawMaterial() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>🧈 添加原材料</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="form-group"><label>名称 *</label><input class="form-input" id="rm-name" placeholder="如：可可液块"></div>
      <div class="form-group"><label>规格</label><input class="form-input" id="rm-spec" placeholder="如：5kg/块"></div>
      <div class="form-group"><label>单位</label><input class="form-input" id="rm-unit" value="个" placeholder="个/块/包/袋/瓶"></div>
      <div class="form-group"><label>库存数量</label><input class="form-input" type="number" id="rm-qty" value="0" min="0"></div>
      <div class="form-group"><label>最低预警</label><input class="form-input" type="number" id="rm-alert" value="0" min="0"></div>
      <button class="btn btn-primary btn-block" onclick="submitAddRawMaterial()">添加</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitAddRawMaterial() {
  const name = $('#rm-name').value.trim();
  if (!name) return showToast('请输入名称', 'error');
  const res = await API.post('/api/raw-materials', {
    name, spec: $('#rm-spec').value.trim(), unit: $('#rm-unit').value.trim() || '个',
    stock_qty: parseInt($('#rm-qty').value) || 0, min_alert: parseInt($('#rm-alert').value) || 0
  });
  if (res.success) { showToast('添加成功', 'success'); closeModal(); navigate('warehouse-materials'); }
}

function adjustRawMaterial(id, name, currentQty) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>🔧 调整库存 - ${name}</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div style="text-align:center;margin-bottom:12px"><span style="font-size:14px;color:var(--text-secondary)">当前库存：</span><span style="font-size:24px;font-weight:800">${currentQty}</span></div>
      <div class="form-group"><label>新库存数量 *</label><input class="form-input" type="number" id="adj-qty" value="${currentQty}" min="0"></div>
      <button class="btn btn-primary btn-block" onclick="submitAdjustRawMaterial(${id})">确认调整</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitAdjustRawMaterial(id) {
  const stock_qty = parseInt($('#adj-qty').value) || 0;
  const res = await API.put(`/api/raw-materials/${id}`, { stock_qty, name: '', spec: '', unit: '个', min_alert: 0 });
  if (res.success) { showToast('库存已调整', 'success'); closeModal(); navigate('warehouse-materials'); }
}

function issueRawMaterial(id, name) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>📤 领用出库 - ${name}</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="form-group"><label>领用数量 *</label><input class="form-input" type="number" id="issue-qty" min="1" placeholder="输入数量"></div>
      <div class="form-group"><label>领用人/角色</label><input class="form-input" id="issue-role" placeholder="如：生产班组1"></div>
      <div class="form-group"><label>领用人姓名</label><input class="form-input" id="issue-name" placeholder="如：张三"></div>
      <div class="form-group"><label>备注</label><input class="form-input" id="issue-notes" placeholder="用途说明"></div>
      <button class="btn btn-primary btn-block" onclick="submitIssueRawMaterial(${id})">确认领用</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitIssueRawMaterial(id) {
  const quantity = parseInt($('#issue-qty').value) || 0;
  if (!quantity) return showToast('请输入领用数量', 'error');
  const res = await API.post('/api/raw-materials/issue', {
    material_id: id, quantity,
    issued_to_role: $('#issue-role').value.trim(),
    issued_to_name: $('#issue-name').value.trim(),
    notes: $('#issue-notes').value.trim()
  });
  if (res.success) { showToast('领用成功', 'success'); closeModal(); navigate('warehouse-materials'); }
}

// 内包材管理
async function renderWarehouseInner() {
  const materials = await API.get('/api/inner-pack-materials');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📥 内包材库存</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddInnerPack()">+ 添加内包材</button>
      ${materials.length ? materials.map(m => `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700">${m.name}</div>
              <div style="font-size:12px;color:var(--text-secondary)">规格: ${m.spec||'-'} | 单位: ${m.unit}</div>
            </div>
            <div style="font-size:20px;font-weight:800;color:var(--success)">${m.stock_qty}</div>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="adjustInnerPack(${m.id},'${m.name}',${m.stock_qty})">调整库存</button>
            <button class="btn btn-accent btn-sm" onclick="issueInnerPack(${m.id},'${m.name}')">领用出库</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-icon">📥</div>暂无内包材</div>'}
    </div>
    ${renderTabBar('warehouse-inner')}`;
}

function showAddInnerPack() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>📥 添加内包材</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="form-group"><label>名称 *</label><input class="form-input" id="ip-name" placeholder="如：BOPP袋 15x20"></div>
      <div class="form-group"><label>规格</label><input class="form-input" id="ip-spec" placeholder="如：15x20cm透明"></div>
      <div class="form-group"><label>单位</label><input class="form-input" id="ip-unit" value="个"></div>
      <div class="form-group"><label>库存数量</label><input class="form-input" type="number" id="ip-qty" value="0" min="0"></div>
      <button class="btn btn-primary btn-block" onclick="submitAddInnerPack()">添加</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitAddInnerPack() {
  const name = $('#ip-name').value.trim();
  if (!name) return showToast('请输入名称', 'error');
  const res = await API.post('/api/inner-pack-materials', {
    name, spec: $('#ip-spec').value.trim(), unit: $('#ip-unit').value.trim() || '个',
    stock_qty: parseInt($('#ip-qty').value) || 0
  });
  if (res.success) { showToast('添加成功', 'success'); closeModal(); navigate('warehouse-inner'); }
}

function adjustInnerPack(id, name, currentQty) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>🔧 调整库存 - ${name}</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div style="text-align:center;margin-bottom:12px"><span style="font-size:14px;color:var(--text-secondary)">当前库存：</span><span style="font-size:24px;font-weight:800">${currentQty}</span></div>
      <div class="form-group"><label>新库存数量 *</label><input class="form-input" type="number" id="ipadj-qty" value="${currentQty}" min="0"></div>
      <button class="btn btn-primary btn-block" onclick="submitAdjustInnerPack(${id})">确认调整</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitAdjustInnerPack(id) {
  const stock_qty = parseInt($('#ipadj-qty').value) || 0;
  const res = await API.put(`/api/inner-pack-materials/${id}`, { stock_qty, name: '', spec: '', unit: '个' });
  if (res.success) { showToast('库存已调整', 'success'); closeModal(); navigate('warehouse-inner'); }
}

function issueInnerPack(id, name) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>📤 领用出库 - ${name}</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="form-group"><label>领用数量 *</label><input class="form-input" type="number" id="ipissue-qty" min="1"></div>
      <div class="form-group"><label>领用班组ID</label><input class="form-input" type="number" id="ipissue-team" value="1" min="1"></div>
      <button class="btn btn-primary btn-block" onclick="submitIssueInnerPack(${id})">确认领用</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitIssueInnerPack(id) {
  const quantity = parseInt($('#ipissue-qty').value) || 0;
  if (!quantity) return showToast('请输入领用数量', 'error');
  const res = await API.post('/api/inner-pack-materials/issue', {
    material_id: id, quantity,
    issued_to_team_id: parseInt($('#ipissue-team').value) || 1
  });
  if (res.success) { showToast('领用成功', 'success'); closeModal(); navigate('warehouse-inner'); }
}

// 外包材管理
async function renderWarehouseOuter() {
  const materials = await API.get('/api/outer-pack-materials');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>📦 外包材库存</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddOuterPack()">+ 添加外包材</button>
      ${materials.length ? materials.map(m => `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700">${m.name}</div>
              <div style="font-size:12px;color:var(--text-secondary)">规格: ${m.spec||'-'} | 类型: ${m.box_type||'-'} | ${m.items_per_box ? '每盒'+m.items_per_box+'个' : ''}</div>
            </div>
            <div style="font-size:20px;font-weight:800;color:var(--success)">${m.stock_qty}</div>
          </div>
          <div style="margin-top:8px">
            <button class="btn btn-outline btn-sm" onclick="adjustOuterPack(${m.id},'${m.name}',${m.stock_qty},${m.items_per_box||0})">编辑</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-icon">📦</div>暂无外包材</div>'}
    </div>
    ${renderTabBar('warehouse-outer')}`;
}

function showAddOuterPack() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>📦 添加外包材</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="form-group"><label>名称 *</label><input class="form-input" id="op-name" placeholder="如：飞机盒 30x20x5"></div>
      <div class="form-group"><label>规格</label><input class="form-input" id="op-spec" placeholder="如：30x20x5cm牛皮纸"></div>
      <div class="form-group"><label>单位</label><input class="form-input" id="op-unit" value="个"></div>
      <div class="form-group"><label>库存数量</label><input class="form-input" type="number" id="op-qty" value="0" min="0"></div>
      <div class="form-group"><label>每盒装量</label><input class="form-input" type="number" id="op-ipb" value="1" min="1"></div>
      <div class="form-group"><label>盒类型</label><input class="form-input" id="op-bt" placeholder="如：飞机盒/礼盒/外箱"></div>
      <button class="btn btn-primary btn-block" onclick="submitAddOuterPack()">添加</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitAddOuterPack() {
  const name = $('#op-name').value.trim();
  if (!name) return showToast('请输入名称', 'error');
  const res = await API.post('/api/outer-pack-materials', {
    name, spec: $('#op-spec').value.trim(), unit: $('#op-unit').value.trim() || '个',
    stock_qty: parseInt($('#op-qty').value) || 0,
    items_per_box: parseInt($('#op-ipb').value) || 1,
    box_type: $('#op-bt').value.trim()
  });
  if (res.success) { showToast('添加成功', 'success'); closeModal(); navigate('warehouse-outer'); }
}

function adjustOuterPack(id, name, currentQty, ipb) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>🔧 编辑 - ${name}</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="form-group"><label>库存数量 *</label><input class="form-input" type="number" id="opadj-qty" value="${currentQty}" min="0"></div>
      <div class="form-group"><label>每盒装量</label><input class="form-input" type="number" id="opadj-ipb" value="${ipb||1}" min="1"></div>
      <button class="btn btn-primary btn-block" onclick="submitAdjustOuterPack(${id})">确认</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitAdjustOuterPack(id) {
  const stock_qty = parseInt($('#opadj-qty').value) || 0;
  const items_per_box = parseInt($('#opadj-ipb').value) || 1;
  const res = await API.put(`/api/outer-pack-materials/${id}`, { stock_qty, items_per_box, name: '', spec: '', unit: '个', box_type: '' });
  if (res.success) { showToast('已更新', 'success'); closeModal(); navigate('warehouse-outer'); }
}

// 成品仓库
async function renderWarehouseFinished() {
  const goods = await API.get('/api/finished-goods');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🏭 成品仓库</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddFinishedGood()">+ 手动入库</button>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">💡 质检通过后成品会自动入库</div>
      ${goods.length ? goods.map(g => `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700">${g.product_name || '未知产品'}</div>
              <div style="font-size:12px;color:var(--text-secondary)">生产日期: ${g.production_date||'-'} | 库位: ${g.location||'-'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700">${g.box_qty}箱 / ${g.case_qty}盒</div>
            </div>
          </div>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-icon">🏭</div>暂无成品库存</div>'}
    </div>
    ${renderTabBar('warehouse-finished')}`;
}

function showAddFinishedGood() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>🏭 手动入库</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="form-group"><label>产品ID *</label><input class="form-input" type="number" id="fg-pid" placeholder="输入产品ID" min="1"></div>
      <div class="form-group"><label>箱数</label><input class="form-input" type="number" id="fg-box" value="0" min="0"></div>
      <div class="form-group"><label>盒数</label><input class="form-input" type="number" id="fg-case" value="0" min="0"></div>
      <div class="form-group"><label>生产日期</label><input class="form-input" type="date" id="fg-date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="form-group"><label>库位</label><input class="form-input" id="fg-loc" placeholder="如：A区-01-03"></div>
      <button class="btn btn-primary btn-block" onclick="submitAddFinishedGood()">确认入库</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitAddFinishedGood() {
  const product_id = parseInt($('#fg-pid').value);
  if (!product_id) return showToast('请输入产品ID', 'error');
  const res = await API.post('/api/finished-goods', {
    product_id, box_qty: parseInt($('#fg-box').value) || 0,
    case_qty: parseInt($('#fg-case').value) || 0,
    production_date: $('#fg-date').value,
    location: $('#fg-loc').value.trim()
  });
  if (res.success) { showToast('入库成功', 'success'); closeModal(); navigate('warehouse-finished'); }
}

// 出库管理
async function renderWarehouseOutbound() {
  const orders = await API.get('/api/outbound-orders');
  
  $('#app').innerHTML = `
    <div class="page-header"><h1>🚚 出库管理</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddOutbound()">+ 新建出库单</button>
      ${orders.length ? orders.map(o => `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700">${o.outbound_no}</div>
              <div style="font-size:12px;color:var(--text-secondary)">客户: ${o.customer_name||'-'} | 日期: ${o.outbound_date||'-'}</div>
              <div style="font-size:12px;color:var(--text-secondary)">收货人: ${o.recipient||'-'} | 地址: ${o.address||'-'}</div>
              ${o.logistics ? '<div style="font-size:12px;color:var(--text-secondary)">物流: '+o.logistics+'</div>' : ''}
              ${o.vehicle_plate ? '<div style="font-size:12px;color:var(--text-secondary)">车牌: '+o.vehicle_plate+'</div>' : ''}
            </div>
          </div>
          ${(o.items||[]).length ? '<div style="margin-top:6px;font-size:12px">' + o.items.map(it => 
            '<div style="padding:2px 0">' + (it.product_name||'') + ': ' + it.box_qty + '箱/' + it.case_qty + '盒</div>'
          ).join('') + '</div>' : ''}
          ${o.images && JSON.parse(o.images||'[]').length ? '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">' + JSON.parse(o.images).map(img => 
            '<img src="'+img+'" style="width:50px;height:50px;object-fit:cover;border-radius:4px">'
          ).join('') + '</div>' : ''}
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-icon">🚚</div>暂无出库记录</div>'}
    </div>
    ${renderTabBar('warehouse-outbound')}`;
}

function showAddOutbound() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'dispatch-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h3>🚚 新建出库单</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="form-group"><label>客户ID</label><input class="form-input" type="number" id="ob-cid" min="1" placeholder="输入客户ID"></div>
      <div class="form-group"><label>出库日期</label><input class="form-input" type="date" id="ob-date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="form-group"><label>收货人</label><input class="form-input" id="ob-recipient" placeholder="收货人姓名"></div>
      <div class="form-group"><label>收货地址</label><input class="form-input" id="ob-address" placeholder="收货地址"></div>
      <div class="form-group"><label>物流公司</label><input class="form-input" id="ob-logistics" placeholder="如：顺丰/京东物流"></div>
      <div class="form-group"><label>车牌号</label><input class="form-input" id="ob-plate" placeholder="自提车辆车牌号"></div>
      <button class="btn btn-primary btn-block" onclick="submitAddOutbound()">创建出库单</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitAddOutbound() {
  const res = await API.post('/api/outbound-orders', {
    customer_id: parseInt($('#ob-cid').value) || 0,
    outbound_date: $('#ob-date').value,
    recipient: $('#ob-recipient').value.trim(),
    address: $('#ob-address').value.trim(),
    logistics: $('#ob-logistics').value.trim(),
    vehicle_plate: $('#ob-plate').value.trim(),
    items: []
  });
  if (res.success) { showToast('出库单创建成功: ' + res.outbound_no, 'success'); closeModal(); navigate('warehouse-outbound'); }
}

// ===== 采购处理列表 =====
async function renderProcurementList() {
  var orders = await API.get('/api/procurement-orders');
  var stats = await API.get('/api/procurement-stats');
  window._allProcOrders = orders;

  $('#app').innerHTML = '<div class="page-header"><h1>📋 采购处理</h1><span class="role-badge">仓库管理</span></div>' +
    '<div class="page-content">' +
    '<div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">' +
    '<div class="stat-card"><div class="stat-value" style="color:#CF1322">' + (stats.urgent_pending||0) + '</div><div class="stat-label">🔴 紧急待处理</div></div>' +
    '<div class="stat-card"><div class="stat-value" style="color:#D48806">' + (stats.normal_pending||0) + '</div><div class="stat-label">🟡 常规待处理</div></div>' +
    '<div class="stat-card"><div class="stat-value" style="color:#1890FF">' + (stats.ordered||0) + '</div><div class="stat-label">📦 已下单</div></div>' +
    '<div class="stat-card"><div class="stat-value" style="color:#52C41A">' + ((stats.arrived||0)+(stats.partial_arrived||0)) + '</div><div class="stat-label">✅ 已到货</div></div>' +
    '</div>' +
    '<div style="margin-bottom:10px"><button class="btn btn-primary btn-sm" onclick="navigate(\'warehouse-procurement-new\')">+ 新建采购申请</button></div>' +
    '<div class="filter-tags">' +
    '<span class="filter-tag active" onclick="setProcFilter(this,\'\')">全部</span>' +
    '<span class="filter-tag" onclick="setProcFilter(this,\'urgent\')">🔴紧急</span>' +
    '<span class="filter-tag" onclick="setProcFilter(this,\'normal\')">🟡常规</span>' +
    '<span class="filter-tag" onclick="setProcFilter(this,\'backup\')">🟢备用</span>' +
    '<span class="filter-tag" onclick="setProcFilter(this,\'pending\')">待处理</span>' +
    '<span class="filter-tag" onclick="setProcFilter(this,\'ordered\')">已下单</span>' +
    '</div><div id="procurement-list"></div></div>' +
    renderTabBar('warehouse-procurement');
  renderProcurementItems(orders);
}
function renderProcurementItems(orders) {
  var list = $('#procurement-list');
  if (!orders.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>暂无采购申请</div>'; return; }
  list.innerHTML = orders.map(function(o) {
    var pColor = o.priority === 'urgent' ? '#CF1322' : o.priority === 'normal' ? '#D48806' : '#8C8C8C';
    var pLabel = o.priority === 'urgent' ? '🔴紧急' : o.priority === 'normal' ? '🟡常规' : '🟢备用';
    var borderStyle = o.priority === 'urgent' ? 'border-left:4px solid #CF1322' : o.priority === 'normal' ? 'border-left:4px solid #D48806' : 'border-left:4px solid #8C8C8C';
    var stLabel = {pending:'待处理',approved:'已审批',rejected:'已驳回',ordered:'已下单',supplier_reject:'供应商拒单',arrived:'已到货',partial_arrived:'部分到货',inspection_fail:'自检不合格',cancelled:'已取消'}[o.status]||o.status;
    return '<div class="card" style="margin-bottom:8px;' + borderStyle + '" onclick="viewProcurementOrder(' + o.id + ')">' +
      '<div style="display:flex;justify-content:space-between"><span style="font-weight:700">' + o.order_no + '</span><span style="color:' + pColor + ';font-weight:700;font-size:12px">' + pLabel + '</span></div>' +
      '<div style="font-size:13px;margin-top:4px">物料: ' + o.material_name + ' · ' + (o.material_spec||'') + '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary)">库存' + o.current_stock + ' → 预警' + o.min_alert + ' · 申请' + o.apply_qty + '</div>' +
      (o.supplier_name ? '<div style="font-size:12px;color:var(--text-secondary)">供应商: ' + o.supplier_name + '</div>' : '') +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">' +
      '<span style="font-size:12px">状态: ' + stLabel + '</span>' +
      '<span style="font-size:11px;color:var(--text-secondary)">' + (o.created_at||'').slice(0,10) + '</span></div></div>';
  }).join('');
}
function setProcFilter(el, val) {
  document.querySelectorAll('#procurement-list').forEach(function(){});
  $$('.filter-tag').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  var orders = window._allProcOrders || [];
  var filtered = val ? (val === 'urgent' || val === 'normal' || val === 'backup' ? orders.filter(function(o){return o.priority===val;}) : orders.filter(function(o){return o.status===val;})) : orders;
  renderProcurementItems(filtered);
}

// 新建采购申请
async function renderProcurementNew() {
  var materials = [];
  var rm = await API.get('/api/raw-materials');
  rm.forEach(function(m) { m._type = 'raw'; materials.push(m); });
  var im = await API.get('/api/inner-pack-materials');
  im.forEach(function(m) { m._type = 'inner'; materials.push(m); });
  var om = await API.get('/api/outer-pack-materials');
  om.forEach(function(m) { m._type = 'outer'; materials.push(m); });
  window._procMaterials = materials;

  var typeMap = {raw:'原材料',inner:'内包材',outer:'外包材'};
  $('#app').innerHTML = '<div class="page-header"><h1>📝 新建采购申请</h1></div>' +
    '<div class="page-content"><div class="card">' +
    '<div class="form-group"><label>物料类别 *</label>' +
    '<select class="form-input" id="p-mtype" onchange="onProcMTChange()"><option value="">请选择类别</option><option value="raw">原材料</option><option value="inner">内包材</option><option value="outer">外包材</option></select></div>' +
    '<div class="form-group"><label>物料名称 *</label><select class="form-input" id="p-mid"><option value="">请先选择类别</option></select></div>' +
    '<div id="p-minfo" style="display:none;font-size:12px;color:var(--text-secondary);margin-bottom:8px"></div>' +
    '<div class="form-group"><label>采购优先级 *</label>' +
    '<div style="display:flex;gap:8px" id="p-priority">' +
    '<div class="priority-card" onclick="selPriority(this,\'urgent\')" style="flex:1;text-align:center;padding:10px;border:2px solid #d9d9d9;border-radius:8px;cursor:pointer">🔴<br>紧急<br><small>生产断料</small></div>' +
    '<div class="priority-card" onclick="selPriority(this,\'normal\')" style="flex:1;text-align:center;padding:10px;border:2px solid #d9d9d9;border-radius:8px;cursor:pointer">🟡<br>常规<br><small>日常补货</small></div>' +
    '<div class="priority-card" onclick="selPriority(this,\'backup\')" style="flex:1;text-align:center;padding:10px;border:2px solid #d9d9d9;border-radius:8px;cursor:pointer">🟢<br>备用<br><small>远期备货</small></div></div></div>' +
    '<div class="form-group"><label>采购数量 *</label><input class="form-input" type="number" id="p-qty" min="1" placeholder="请输入数量"></div>' +
    '<div id="p-suggest" style="font-size:12px;color:var(--primary);margin-bottom:8px"></div>' +
    '<div class="form-group"><label>触发原因</label><textarea class="form-input" id="p-reason" placeholder="说明采购原因"></textarea></div>' +
    '<div class="form-group"><label>备注</label><textarea class="form-input" id="p-notes"></textarea></div>' +
    '<button class="btn btn-primary btn-block" onclick="submitProcurement()">提交采购申请</button>' +
    '<button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate(\'warehouse-procurement\')">取消</button></div></div>';
  window._selPriority = 'normal';
}
function onProcMTChange() {
  var mt = $('#p-mtype').value;
  var sel = $('#p-mid');
  sel.innerHTML = '<option value="">请选择物料</option>';
  if (!mt) return;
  (window._procMaterials||[]).filter(function(m){return m._type===mt;}).forEach(function(m) {
    sel.innerHTML += '<option value="' + m.id + '">' + m.name + ' (' + (m.spec||'') + ')</option>';
  });
  sel.onchange = function() {
    var m = (window._procMaterials||[]).find(function(x){return x._type===mt && x.id===parseInt(sel.value);});
    if (m) {
      $('#p-minfo').style.display = 'block';
      $('#p-minfo').innerHTML = '当前库存: <b style="color:'+(m.stock_qty<=m.min_alert?'var(--danger)':'var(--success)')+'">'+m.stock_qty+'</b> · 预警: <b>'+m.min_alert+'</b>';
      if (m.min_alert > 0) {
        $('#p-suggest').innerHTML = '💡 推荐采购量: <b>' + Math.max(m.min_alert*2, (m.daily_consumption||0)*7) + '</b> <a href="#" onclick="$(\'#p-qty\').value='+Math.max(m.min_alert*2,(m.daily_consumption||0)*7)+';return false;">采用推荐量</a>';
      }
    }
  };
}
function selPriority(el, val) {
  $$('.priority-card').forEach(function(c) { c.style.borderColor = '#d9d9d9'; c.style.background = 'white'; });
  el.style.borderColor = val === 'urgent' ? '#CF1322' : val === 'normal' ? '#D48806' : '#52C41A';
  el.style.background = val === 'urgent' ? '#FFF1F0' : val === 'normal' ? '#FFFBE6' : '#F6FFED';
  window._selPriority = val;
}
async function submitProcurement() {
  var mt = $('#p-mtype').value;
  var mid = parseInt($('#p-mid').value);
  var qty = parseInt($('#p-qty').value);
  if (!mt) return showToast('请选择物料类别', 'error');
  if (!mid) return showToast('请选择物料', 'error');
  if (!qty || qty < 1) return showToast('请输入有效的采购数量', 'error');
  var m = (window._procMaterials||[]).find(function(x){return x._type===mt && x.id===mid;});
  var res = await API.post('/api/procurement-orders', {
    material_type: mt, material_id: mid, material_name: m ? m.name : '', material_spec: m ? (m.spec||'') : '',
    current_stock: m ? (m.stock_qty||0) : 0, min_alert: m ? (m.min_alert||0) : 0,
    apply_qty: qty, priority: window._selPriority,
    trigger_reason: $('#p-reason').value.trim(), notes: $('#p-notes').value.trim()
  });
  if (res.success) { showToast('采购申请已创建: ' + res.order_no, 'success'); navigate('warehouse-procurement'); }
  else showToast(res.msg || '创建失败', 'error');
}

// 采购单详情
var _procDetailId;
function viewProcurementOrder(id) { _procDetailId = id; navigate('warehouse-procurement-detail'); }
async function renderProcurementDetail() {
  var o = await API.get('/api/procurement-orders/' + _procDetailId);
  if (!o || o.error) return showToast(o.error||'采购单不存在','error'), navigate('warehouse-procurement');
  var stLabel = {pending:'待处理',approved:'已审批',rejected:'已驳回',ordered:'已下单',supplier_reject:'供应商拒单',arrived:'已到货',partial_arrived:'部分到货',inspection_fail:'自检不合格',cancelled:'已取消'};
  $('#app').innerHTML = '<div class="page-header"><h1>📄 采购单详情</h1></div><div class="page-content">' +
    '<div class="card"><div class="card-title">📋 ' + o.order_no + ' <span style="font-size:12px">' + (stLabel[o.status]||o.status) + '</span></div>' +
    '<div class="detail-row"><span class="label">物料</span><span class="value">' + o.material_name + ' · ' + (o.material_spec||'') + '</span></div>' +
    '<div class="detail-row"><span class="label">库存/预警</span><span class="value">' + o.current_stock + ' / ' + o.min_alert + '</span></div>' +
    '<div class="detail-row"><span class="label">采购数量</span><span class="value" style="font-weight:700">' + o.apply_qty + '</span></div>' +
    '<div class="detail-row"><span class="label">优先级</span><span class="value">' + (o.priority==='urgent'?'🔴紧急':o.priority==='normal'?'🟡常规':'🟢备用') + '</span></div>' +
    '<div class="detail-row"><span class="label">预计到货</span><span class="value">' + (o.expected_date||'-') + '</span></div>' +
    (o.supplier_name ? '<div class="detail-row"><span class="label">供应商</span><span class="value">' + o.supplier_name + '</span></div>' : '') +
    (o.trigger_reason ? '<div class="detail-row"><span class="label">触发原因</span><span class="value">' + o.trigger_reason + '</span></div>' : '') +
    '</div>';
  if (['pending','rejected'].includes(o.status)) {
    $('#app').innerHTML += '<div style="margin-top:10px;display:flex;gap:6px"><button class="btn btn-success btn-sm" onclick="procApproval(' + o.id + ')">审批通过</button><button class="btn btn-accent btn-sm" onclick="procReject(' + o.id + ')">驳回</button></div>';
  }
  if (o.status === 'approved') {
    $('#app').innerHTML += '<div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="procOrder(' + o.id + ')">下单</button></div>';
  }
  if (o.status === 'ordered') {
    $('#app').innerHTML += '<div style="margin-top:10px;display:flex;gap:6px"><button class="btn btn-success btn-sm" onclick="procArrive(' + o.id + ')">到货确认</button><button class="btn btn-accent btn-sm" onclick="procSupplierReject(' + o.id + ')">供应商拒单</button></div>';
  }
  $('#app').innerHTML += '<button class="btn btn-outline btn-block" style="margin-top:10px" onclick="navigate(\'warehouse-procurement\')">返回列表</button></div>';
}

function procApproval(id) {
  API.get('/api/suppliers').then(function(suppliers) {
    var active = suppliers.filter(function(s) { return s.status === 'active'; });
    var opts = active.map(function(s) { return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('');
    showModal('<h3>✅ 审批通过</h3><div class="form-group"><label>选择供应商</label><select class="form-input" id="mod-sup">' + opts + '</select></div>' +
      '<button class="btn btn-primary btn-block" onclick="doProcStatus(' + id + ',\'approved\')">确认审批</button>');
  });
}
function procReject(id) {
  showModal('<h3>↩️ 驳回采购申请</h3><div class="form-group"><label>驳回原因 *</label><textarea class="form-input" id="mod-reason" placeholder="必填"></textarea></div>' +
    '<button class="btn btn-accent btn-block" onclick="doProcStatus(' + id + ',\'rejected\')">确认驳回</button>');
}
function procOrder(id) {
  showModal('<h3>📦 确认下单</h3><p>确认已向供应商下单？⏰4天倒计时将开始</p>' +
    '<button class="btn btn-primary btn-block" onclick="doProcStatus(' + id + ',\'ordered\')">确认下单</button>');
}
function procSupplierReject(id) {
  showModal('<h3>⚠️ 供应商拒单</h3><div class="form-group"><label>拒单原因 *</label><textarea class="form-input" id="mod-reason" placeholder="必填"></textarea></div>' +
    '<p style="font-size:12px;color:var(--text-secondary)">系统将自动创建新采购单</p>' +
    '<button class="btn btn-accent btn-block" onclick="doProcStatus(' + id + ',\'supplier_reject\')">确认拒单</button>');
}
function procArrive(id) {
  showModal('<h3>📦 到货确认</h3>' +
    '<div class="form-group"><label>实际到货数量 *</label><input class="form-input" type="number" id="mod-aqty" min="0"></div>' +
    '<div class="form-group"><label>差异备注</label><input class="form-input" id="mod-diff"></div>' +
    '<div class="form-group"><label>自检报告编号</label><input class="form-input" id="mod-rnum"></div>' +
    '<div class="form-group"><label>批次号 *</label><input class="form-input" id="mod-batch"></div>' +
    '<div class="form-group"><label>检验人</label><input class="form-input" id="mod-insp" value="' + (currentUser?currentUser.real_name:'') + '"></div>' +
    '<div class="form-group"><label>检验结论</label><select class="form-input" id="mod-conc"><option value="pass">合格</option><option value="fail">不合格</option><option value="conditional">让步接收</option></select></div>' +
    '<div class="form-group"><label>不合格原因</label><input class="form-input" id="mod-freason"></div>' +
    '<button class="btn btn-primary btn-block" onclick="doProcArrive(' + id + ')">确认到货</button>');
}
async function doProcStatus(id, status) {
  var reason = document.getElementById('mod-reason') ? document.getElementById('mod-reason').value : '';
  if ((status === 'rejected' || status === 'supplier_reject') && !reason) return showToast('必须填写原因', 'error');
  var body = { status: status, reason: reason };
  if (status === 'approved') body.supplier_id = parseInt(document.getElementById('mod-sup').value) || 0;
  var res = await API.put('/api/procurement-orders/' + id + '/status', body);
  if (res.success) { showToast('操作成功', 'success'); closeModal(); navigate('warehouse-procurement'); }
  else showToast(res.msg || '操作失败', 'error');
}
async function doProcArrive(id) {
  var aqty = parseInt(document.getElementById('mod-aqty').value) || 0;
  if (!aqty) return showToast('请输入到货数量', 'error');
  var res = await API.post('/api/procurement-orders/' + id + '/arrive', {
    actual_qty: aqty, diff_notes: document.getElementById('mod-diff').value,
    report_number: document.getElementById('mod-rnum').value, report_date: new Date().toISOString().slice(0,10),
    batch_number: document.getElementById('mod-batch').value, inspector: document.getElementById('mod-insp').value,
    conclusion: document.getElementById('mod-conc').value, inspection_fail_reason: document.getElementById('mod-freason').value
  });
  if (res.success) { showToast('到货已确认', 'success'); closeModal(); navigate('warehouse-procurement'); }
  else showToast(res.msg || '确认失败', 'error');
}

// ===== 仓库：台账管理 =====
async function renderWarehouseLedger() {
  var records = [];
  try { records = await API.get('/api/inventory-ledger'); } catch(e) {}
  window._ledgerRecords = records;

  var typeMap = { inbound: '📥入库', outbound: '📤出库', adjust: '🔄调整' };
  var wtMap = { raw: '原材料', inner: '内包材', outer: '外包材', auxiliary: '辅料', finished: '成品' };

  $('#app').innerHTML = `<div class="page-header"><h1>📒 出入库台账</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <div class="filter-tags" style="margin-bottom:10px">
        <span class="filter-tag active" onclick="filterLedger(this,'')">全部</span>
        <span class="filter-tag" onclick="filterLedger(this,'inbound')">📥 入库</span>
        <span class="filter-tag" onclick="filterLedger(this,'outbound')">📤 出库</span>
        <span class="filter-tag" onclick="filterLedger(this,'raw')">🧈 原材料</span>
        <span class="filter-tag" onclick="filterLedger(this,'inner')">📥 内包材</span>
        <span class="filter-tag" onclick="filterLedger(this,'outer')">📦 外包材</span>
        <span class="filter-tag" onclick="filterLedger(this,'auxiliary')">🔧 辅料</span>
      </div>
      <div id="ledger-list"></div>
    </div>
    ${renderTabBar('warehouse-ledger')}`;

  renderLedgerItems(records);
}

function renderLedgerItems(records) {
  var list = $('#ledger-list');
  if (!records.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📒</div>暂无台账记录</div>';
    return;
  }
  var typeMap = { inbound:'📥入库', outbound:'📤出库', adjust:'🔄调整' };
  var wtMap = { raw:'🧈原材料', inner:'📥内包材', outer:'📦外包材', auxiliary:'🔧辅料', finished:'🏭成品' };

  list.innerHTML = records.map(function(r) {
    var color = r.type === 'inbound' ? 'var(--success)' : r.type === 'outbound' ? 'var(--error)' : 'var(--accent)';
    return '<div class="card" style="margin-bottom:6px;border-left:4px solid ' + color + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
      '<div style="flex:1">' +
      '<div style="font-weight:700;font-size:13px">' + (typeMap[r.type]||r.type) + ' ' + (wtMap[r.warehouse_type]||r.warehouse_type) + '</div>' +
      '<div style="font-size:12px;margin-top:2px">' + esc(r.material_name) + (r.material_spec ? ' · ' + esc(r.material_spec) : '') + '</div>' +
      (r.recipient ? '<div style="font-size:11px;color:var(--text-secondary)">领用人: ' + esc(r.recipient) + '</div>' : '') +
      (r.batch_number ? '<div style="font-size:11px;color:var(--text-secondary)">批次: ' + esc(r.batch_number) + '</div>' : '') +
      (r.notes ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">' + esc(r.notes) + '</div>' : '') +
      '</div>' +
      '<div style="text-align:right;min-width:80px">' +
      '<div style="font-size:18px;font-weight:800;color:' + color + '">' + (r.type==='outbound'?'-':'+') + r.quantity + '</div>' +
      '<div style="font-size:10px;color:var(--text-secondary)">库存: ' + (r.stock_before||0) + '→' + (r.stock_after||0) + '</div>' +
      '<div style="font-size:10px;color:var(--text-secondary)">' + (r.created_at||'').slice(0,16).replace('T',' ') + '</div>' +
      '</div></div></div>';
  }).join('');
}

function filterLedger(el, val) {
  document.querySelectorAll('#ledger-list').length && (function(){
    var tags = document.querySelectorAll('.filter-tag');
    tags.forEach(function(t) { t.classList.remove('active'); });
    el.classList.add('active');
  })();
  var records = window._ledgerRecords || [];
  var filtered = val
    ? (['inbound','outbound','adjust'].includes(val)
      ? records.filter(function(r){return r.type === val;})
      : records.filter(function(r){return r.warehouse_type === val;}))
    : records;
  renderLedgerItems(filtered);
}

// ===== 仓库：入库管理 =====
async function renderWarehouseInbound() {
  var records = [];
  var suppliers = [];
  try { records = await API.get('/api/inbound-records'); } catch(e) {}
  try { suppliers = await API.get('/api/suppliers'); } catch(e) {}
  window._inboundSuppliers = suppliers;

  var mtMap = { raw:'原材料', inner:'内包材', outer:'外包材', auxiliary:'辅料' };
  var typeOptions = [
    { val:'raw', label:'🧈 原材料仓', mats:'/api/raw-materials' },
    { val:'inner', label:'📥 内包材仓', mats:'/api/inner-pack-materials' },
    { val:'outer', label:'📦 外包材仓', mats:'/api/outer-pack-materials' },
    { val:'auxiliary', label:'🔧 辅料仓', mats:'/api/auxiliary-materials' }
  ];

  $('#app').innerHTML = `<div class="page-header"><h1>📥 入库管理</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddInbound()">+ 新建入库单</button>
      ${records.length ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">最近入库记录</div>' +
        records.slice(0,20).map(function(r) {
          return '<div class="card" style="margin-bottom:6px"><div style="display:flex;justify-content:space-between"><div><strong>' + esc(r.inbound_no) + '</strong> <span style="font-size:12px">' + (mtMap[r.warehouse_type]||r.warehouse_type) + '</span></div><span style="font-weight:700;color:var(--success)">+' + r.quantity + '</span></div>' +
          '<div style="font-size:12px;color:var(--text-secondary)">' + esc(r.material_name) + ' · ' + esc(r.material_spec||'') + (r.batch_number?' · 批次:'+esc(r.batch_number):'') + '</div>' +
          (r.supplier_name?'<div style="font-size:11px;color:var(--text-secondary)">供应商: '+esc(r.supplier_name)+' | 日期: '+(r.receipt_date||'').slice(0,10)+'</div>':'') +
          '</div>';
        }).join('') : '<div class="empty-state"><div class="empty-icon">📥</div>暂无入库记录</div>'}
    </div>
    ${renderTabBar('warehouse-inbound')}`;

  window._inboundTypes = typeOptions;
}

function showAddInbound() {
  var types = window._inboundTypes || [];
  showModal('<h3>📥 新建入库单</h3>' +
    '<div style="margin-bottom:8px"><label>入库仓库 *</label>' +
    '<select class="form-input" id="in-wtype" onchange="onInboundTypeChange()">' +
    '<option value="">请选择仓库</option>' +
    types.map(function(t){return '<option value="'+t.val+'">'+t.label+'</option>';}).join('') +
    '</select></div>' +
    '<div style="margin-bottom:8px"><label>入库物料 *</label>' +
    '<select class="form-input" id="in-mid"><option value="">请先选择仓库</option></select></div>' +
    '<div style="margin-bottom:8px"><label>入库数量 *</label><input class="form-input" id="in-qty" type="number" min="1"></div>' +
    '<div style="margin-bottom:8px"><label>供应商</label>' +
    '<select class="form-input" id="in-sid"><option value="">-- 不关联供应商 --</option>' +
    (window._inboundSuppliers||[]).map(function(s){return '<option value="'+s.id+'|'+esc(s.name)+'">'+esc(s.name)+'</option>';}).join('') +
    '</select></div>' +
    '<div style="margin-bottom:8px"><label>批次号</label><input class="form-input" id="in-batch" placeholder="生产批次/批号"></div>' +
    '<div style="margin-bottom:8px"><label>生产日期</label><input class="form-input" id="in-proddate" type="date"></div>' +
    '<div style="margin-bottom:8px"><label>入库日期</label><input class="form-input" id="in-date" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div>' +
    '<div style="margin-bottom:8px"><label>检验人</label><input class="form-input" id="in-insp" placeholder="检验人姓名"></div>' +
    '<div style="margin-bottom:12px"><label>备注</label><input class="form-input" id="in-note" placeholder="备注信息"></div>' +
    '<button class="btn btn-primary btn-block" onclick="submitInbound()">确认入库</button>' +
    '<button class="btn btn-outline btn-block" style="margin-top:6px" onclick="closeModal()">取消</button>');
}

async function onInboundTypeChange() {
  var wt = document.getElementById('in-wtype').value;
  var sel = document.getElementById('in-mid');
  if (!wt) { sel.innerHTML = '<option value="">请先选择仓库</option>'; return; }
  var types = window._inboundTypes || [];
  var t = types.find(function(x){return x.val === wt;});
  if (!t) return;
  try {
    var mats = await API.get(t.mats);
    sel.innerHTML = mats.map(function(m){
      return '<option value="'+m.id+'">'+esc(m.name)+' ('+esc(m.spec||'')+') | 库存:'+(m.stock_qty||0)+'</option>';
    }).join('');
  } catch(e) { sel.innerHTML = '<option value="">加载失败</option>'; }
}

async function submitInbound() {
  var wt = document.getElementById('in-wtype').value;
  var mid = parseInt(document.getElementById('in-mid').value);
  var qty = parseInt(document.getElementById('in-qty').value);
  if (!wt || !mid || !qty || qty < 1) return showToast('请完善入库信息', 'error');
  var sVal = document.getElementById('in-sid').value;
  var sid = null, sname = '';
  if (sVal) { var parts = sVal.split('|'); sid = parseInt(parts[0]); sname = parts[1]||''; }
  var res = await API.post('/api/inbound-records', {
    warehouse_type: wt, material_id: mid, quantity: qty,
    supplier_id: sid, supplier_name: sname,
    batch_number: document.getElementById('in-batch').value,
    production_date: document.getElementById('in-proddate').value,
    receipt_date: document.getElementById('in-date').value,
    inspector: document.getElementById('in-insp').value,
    notes: document.getElementById('in-note').value
  });
  if (res.success) { showToast('入库成功！单号: ' + res.inbound_no, 'success'); closeModal(); navigate('warehouse-inbound'); }
  else showToast(res.msg || '入库失败', 'error');
}

// ===== 仓库：辅料库管理 =====
async function renderWarehouseAuxiliary() {
  var mats = [];
  try { mats = await API.get('/api/auxiliary-materials'); } catch(e) {}

  var catMap = {};
  mats.forEach(function(m) { var c = m.category || '耗材'; if (!catMap[c]) catMap[c] = []; catMap[c].push(m); });

  $('#app').innerHTML = `<div class="page-header"><h1>🔧 辅料库管理</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddAuxiliary()">+ 添加辅料</button>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">💡 辅料包括模具、生产耗材、工具等非生产原料类物料</div>
      ${mats.length ? Object.keys(catMap).map(function(cat) {
        var items = catMap[cat];
        return '<div style="margin-bottom:12px"><div style="font-weight:700;font-size:14px;margin-bottom:6px;color:var(--accent)">📂 ' + esc(cat) + '</div>' +
          items.map(function(m) {
            var low = m.stock_qty <= (m.min_alert||0) && m.min_alert > 0;
            return '<div class="card" style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:center">' +
              '<div><div style="font-weight:700">' + esc(m.name) + '</div>' +
              '<div style="font-size:12px;color:var(--text-secondary)">规格: ' + esc(m.spec||'-') + ' | 单位: ' + esc(m.unit||'个') + (m.location?' | 库位: '+esc(m.location):'') + '</div></div>' +
              '<div style="text-align:right"><div style="font-size:20px;font-weight:800;color:'+(low?'var(--error)':'var(--success)')+'">' + m.stock_qty + '</div>' +
              '<div style="font-size:11px;color:'+(low?'var(--error)':'var(--text-secondary)')+'">'+(low?'⚠️ 低库存':'库存')+'</div></div></div>' +
              '<div style="margin-top:6px;display:flex;gap:6px">' +
              '<button class="btn btn-outline btn-sm" onclick="adjustAuxiliary('+m.id+',\''+esc(m.name).replace(/'/g,"\\'")+'\','+m.stock_qty+','+(m.min_alert||0)+')">调整库存</button>' +
              '<button class="btn btn-accent btn-sm" onclick="issueAuxiliary('+m.id+',\''+esc(m.name).replace(/'/g,"\\'")+'\')">领用出库</button></div></div>';
          }).join('') + '</div>';
      }).join('') : '<div class="empty-state"><div class="empty-icon">🔧</div>暂无辅料</div>'}
    </div>
    ${renderTabBar('warehouse-auxiliary')}`;
}

function showAddAuxiliary() {
  showModal('<h3>🔧 添加辅料</h3>' +
    '<div style="margin-bottom:8px"><label>名称 *</label><input class="form-input" id="aux-name"></div>' +
    '<div style="margin-bottom:8px"><label>规格</label><input class="form-input" id="aux-spec"></div>' +
    '<div style="margin-bottom:8px"><label>单位</label><input class="form-input" id="aux-unit" value="个"></div>' +
    '<div style="margin-bottom:8px"><label>类别</label><select class="form-input" id="aux-cat"><option value="模具">模具</option><option value="耗材">耗材</option><option value="工具">工具</option><option value="配件">配件</option><option value="包装">包装</option></select></div>' +
    '<div style="margin-bottom:8px"><label>库存数量</label><input class="form-input" id="aux-qty" type="number" value="0"></div>' +
    '<div style="margin-bottom:8px"><label>最低预警</label><input class="form-input" id="aux-alert" type="number" value="0"></div>' +
    '<div style="margin-bottom:8px"><label>库位</label><input class="form-input" id="aux-loc"></div>' +
    '<div style="margin-bottom:12px"><label>备注</label><input class="form-input" id="aux-notes"></div>' +
    '<button class="btn btn-primary btn-block" onclick="submitAddAuxiliary()">确认添加</button>' +
    '<button class="btn btn-outline btn-block" style="margin-top:6px" onclick="closeModal()">取消</button>');
}

async function submitAddAuxiliary() {
  var res = await API.post('/api/auxiliary-materials', {
    name: document.getElementById('aux-name').value.trim(),
    spec: document.getElementById('aux-spec').value.trim(),
    unit: document.getElementById('aux-unit').value.trim(),
    category: document.getElementById('aux-cat').value,
    stock_qty: parseInt(document.getElementById('aux-qty').value)||0,
    min_alert: parseInt(document.getElementById('aux-alert').value)||0,
    location: document.getElementById('aux-loc').value.trim(),
    notes: document.getElementById('aux-notes').value.trim()
  });
  if (res.success) { showToast('辅料添加成功', 'success'); closeModal(); navigate('warehouse-auxiliary'); }
  else showToast(res.msg || '添加失败', 'error');
}

function adjustAuxiliary(id, name, qty, alert) {
  showModal('<h3>调整辅料库存</h3><div style="margin-bottom:12px;font-weight:600">' + name + '</div>' +
    '<div style="margin-bottom:8px"><label>库存数量</label><input class="form-input" id="adj-qty" type="number" value="' + qty + '"></div>' +
    '<div style="margin-bottom:8px"><label>最低预警</label><input class="form-input" id="adj-alert" type="number" value="' + alert + '"></div>' +
    '<button class="btn btn-primary btn-block" onclick="submitAdjustAuxiliary(' + id + ')">确认</button>' +
    '<button class="btn btn-outline btn-block" style="margin-top:6px" onclick="closeModal()">取消</button>');
}

async function submitAdjustAuxiliary(id) {
  var qty = parseInt(document.getElementById('adj-qty').value);
  if (isNaN(qty)) return showToast('请输入有效数量', 'error');
  var res = await API.put('/api/auxiliary-materials/' + id, {
    stock_qty: qty, min_alert: parseInt(document.getElementById('adj-alert').value)||0
  });
  if (res.success) { showToast('库存已更新', 'success'); closeModal(); navigate('warehouse-auxiliary'); }
  else showToast(res.msg || '更新失败', 'error');
}

function issueAuxiliary(id, name) {
  showModal('<h3>辅料领用出库</h3><div style="margin-bottom:12px;font-weight:600">' + name + '</div>' +
    '<div style="margin-bottom:8px"><label>领用数量 *</label><input class="form-input" id="iss-qty" type="number" min="1"></div>' +
    '<div style="margin-bottom:8px"><label>领用角色</label><input class="form-input" id="iss-role" placeholder="如：班组、配料等"></div>' +
    '<div style="margin-bottom:8px"><label>领用人</label><input class="form-input" id="iss-name" placeholder="领用人姓名"></div>' +
    '<div style="margin-bottom:8px"><label>关联订单ID（可选）</label><input class="form-input" id="iss-oid" type="number"></div>' +
    '<div style="margin-bottom:12px"><label>备注</label><input class="form-input" id="iss-note"></div>' +
    '<button class="btn btn-accent btn-block" onclick="submitIssueAuxiliary(' + id + ')">确认领用</button>' +
    '<button class="btn btn-outline btn-block" style="margin-top:6px" onclick="closeModal()">取消</button>');
}

async function submitIssueAuxiliary(id) {
  var qty = parseInt(document.getElementById('iss-qty').value);
  if (!qty || qty < 1) return showToast('请输入领用数量', 'error');
  var res = await API.post('/api/auxiliary-materials/issue', {
    material_id: id, quantity: qty,
    issued_to_role: document.getElementById('iss-role').value.trim(),
    issued_to_name: document.getElementById('iss-name').value.trim(),
    related_order_id: parseInt(document.getElementById('iss-oid').value)||null,
    notes: document.getElementById('iss-note').value.trim()
  });
  if (res.success) { showToast('领用出库成功', 'success'); closeModal(); navigate('warehouse-auxiliary'); }
  else showToast(res.msg || '出库失败', 'error');
}

// ===== 仓库：采购到货确认入口 =====
async function renderWarehouseReceiving() {
  var orders = [];
  try { orders = await API.get('/api/procurement-orders/pending-receiving'); } catch(e) {}

  $('#app').innerHTML = `<div class="page-header"><h1>📦 采购到货确认</h1><span class="role-badge">仓库管理</span></div>
    <div class="page-content">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">💡 确认已下单（ordered）或部分到货（partial_arrived）状态的采购单</div>
      ${orders.length ? orders.map(function(o) {
        var pColor = o.priority==='urgent'?'#CF1322':o.priority==='normal'?'#D48806':'#8C8C8C';
        var pLabel = o.priority==='urgent'?'🔴紧急':o.priority==='normal'?'🟡常规':'🟢备用';
        return '<div class="card" style="margin-bottom:8px;border-left:4px solid '+pColor+'">' +
          '<div style="display:flex;justify-content:space-between"><strong>'+esc(o.order_no)+'</strong><span style="font-size:12px;color:'+pColor+'">'+pLabel+'</span></div>' +
          '<div style="font-size:13px;margin-top:4px">物料: '+esc(o.material_name)+' · '+esc(o.material_spec||'')+'</div>' +
          '<div style="font-size:12px;color:var(--text-secondary)">采购数量: '+o.apply_qty+' | 供应商: '+esc(o.supplier_name||'未指定')+'</div>' +
          (o.status==='partial_arrived'?'<div style="font-size:12px;color:var(--warning)">⚠️ 部分到货</div>':'') +
          '<div style="margin-top:6px"><button class="btn btn-success btn-sm" onclick="confirmProcReceiving('+o.id+',\''+esc(o.order_no).replace(/'/g,"\\'")+'\','+o.apply_qty+',\''+esc(o.material_name).replace(/'/g,"\\'")+'\')">✅ 到货确认</button></div></div>';
      }).join('') : '<div class="empty-state"><div class="empty-icon">📦</div>暂无待收货采购单</div>'}
    </div>
    ${renderTabBar('warehouse-receiving')}`;
}

function confirmProcReceiving(id, orderNo, applyQty, matName) {
  showModal('<h3>📦 采购到货确认</h3>' +
    '<div style="margin-bottom:12px;font-weight:600">采购单: ' + orderNo + ' · ' + matName + '</div>' +
    '<div style="margin-bottom:8px"><label>实际到货数量 *</label><input class="form-input" id="recv-qty" type="number" min="1" value="' + applyQty + '"></div>' +
    '<div style="margin-bottom:8px"><label>批次号</label><input class="form-input" id="recv-batch" placeholder="生产批次"></div>' +
    '<div style="margin-bottom:8px"><label>到货日期</label><input class="form-input" id="recv-date" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div>' +
    '<div style="margin-bottom:8px"><label>检验人</label><input class="form-input" id="recv-insp" placeholder="检验人姓名"></div>' +
    '<div style="margin-bottom:8px"><label>检验结论</label><select class="form-input" id="recv-conc"><option value="pass">✅ 合格</option><option value="conditional">⚠️ 让步接收</option><option value="fail">❌ 不合格</option></select></div>' +
    '<div style="margin-bottom:12px"><label>备注</label><input class="form-input" id="recv-note"></div>' +
    '<button class="btn btn-success btn-block" onclick="submitProcReceiving(' + id + ')">确认到货入库</button>' +
    '<button class="btn btn-outline btn-block" style="margin-top:6px" onclick="closeModal()">取消</button>');
}

async function submitProcReceiving(id) {
  var qty = parseInt(document.getElementById('recv-qty').value);
  if (!qty || qty < 1) return showToast('请输入到货数量', 'error');
  var res = await API.post('/api/procurement-orders/' + id + '/confirm-receiving', {
    actual_qty: qty,
    batch_number: document.getElementById('recv-batch').value,
    receipt_date: document.getElementById('recv-date').value,
    inspector: document.getElementById('recv-insp').value,
    conclusion: document.getElementById('recv-conc').value,
    report_number: 'WH-' + new Date().toISOString().slice(0,10).replace(/-/g,''),
    report_date: new Date().toISOString().slice(0,10),
    notes: document.getElementById('recv-note').value
  });
  if (res.success) { showToast('到货确认成功！入库单号: ' + (res.inbound_no||''), 'success'); closeModal(); navigate('warehouse-receiving'); }
  else showToast(res.msg || '确认失败', 'error');
}

// ===== 采购申请（全岗位覆盖） =====
function renderPurchaseRequestForm() {
  $('#app').innerHTML = `<div class="page-header"><h1>🛒 采购申请</h1><span class="role-badge">采购申请</span></div>
    <div class="page-content">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">💡 填写产品采购需求，紧急采购自动审批，常规采购需管理员审核</div>
      <div class="card">
        <div class="form-group"><label>产品名称 *</label><input class="form-input" id="pr-name" placeholder="请输入产品名称"></div>
        <div class="form-group"><label>产品颜色</label><input class="form-input" id="pr-color" placeholder="如：金色、红色"></div>
        <div class="form-group"><label>产品尺寸</label><input class="form-input" id="pr-size" placeholder="如：30×20×5cm"></div>
        <div class="form-group"><label>产品材质</label><input class="form-input" id="pr-material" placeholder="如：牛皮纸、硅胶"></div>
        <div class="form-group"><label>申请数量 *</label><input class="form-input" id="pr-qty" type="number" min="1" value="1"></div>
        <div class="form-group"><label>产品照片</label><input type="file" id="pr-image" accept="image/*" style="font-size:13px;margin-top:4px"></div>
        <div class="form-group"><label>申请部门</label><input class="form-input" id="pr-dept"></div>
        <div class="form-group"><label>优先级 *</label>
          <select class="form-input" id="pr-priority">
            <option value="urgent">🔴 紧急 — 自动审批，24h内处理</option>
            <option value="normal" selected>🟡 常规 — 管理员审批，1-3个工作日</option>
            <option value="backup">🟢 备用 — 排队处理，按批次采购</option>
          </select>
        </div>
        <div class="form-group"><label>备注说明</label><textarea class="form-input" id="pr-notes" placeholder="采购原因、用途等补充说明"></textarea></div>
        <button class="btn btn-primary btn-block" onclick="submitPurchaseRequest()">📤 提交采购申请</button>
      </div>
    </div>
    ${renderTabBar('purchase-request')}`;
}

async function submitPurchaseRequest() {
  var name = document.getElementById('pr-name').value.trim();
  var qty = parseInt(document.getElementById('pr-qty').value)||0;
  if (!name || !qty) return showToast('请填写产品名称和数量', 'error');
  var formData = new FormData();
  formData.append('product_name', name);
  formData.append('product_color', document.getElementById('pr-color').value.trim());
  formData.append('product_size', document.getElementById('pr-size').value.trim());
  formData.append('product_material', document.getElementById('pr-material').value.trim());
  formData.append('quantity', qty);
  formData.append('department', document.getElementById('pr-dept').value.trim());
  formData.append('priority', document.getElementById('pr-priority').value);
  formData.append('notes', document.getElementById('pr-notes').value.trim());
  var img = document.getElementById('pr-image').files[0];
  if (img) formData.append('image', img);
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/purchase-requests', true);
    xhr.onload = function() {
      var res = JSON.parse(xhr.responseText);
      if (res.success) {
        var msg = res.auto_approved ? '紧急采购申请已自动审批！' : '采购申请已提交，等待审批。';
        showToast('申请提交成功！单号: ' + res.request_no + ' — ' + msg, 'success');
        setTimeout(function(){ navigate('my-purchases'); }, 1500);
      } else showToast(res.msg || '提交失败', 'error');
    };
    xhr.send(formData);
  } catch(e) { showToast('提交失败: ' + e.message, 'error'); }
}

async function renderMyPurchases() {
  var requests = [];
  try { requests = await API.get('/api/purchase-requests/mine'); } catch(e) {}
  var statusMap = { pending:'⏳待审批', approved:'✅已审批', rejected:'❌已驳回', converted:'📋已转采购单', cancelled:'🚫已取消' };
  var priMap = { urgent:'🔴紧急', normal:'🟡常规', backup:'🟢备用' };
  $('#app').innerHTML = '<div class="page-header"><h1>📝 我的采购申请</h1><span class="role-badge">采购申请</span></div><div class="page-content">' +
    (requests.length ? requests.map(function(r) {
      var pColor = r.priority==='urgent'?'#CF1322':r.priority==='normal'?'#D48806':'#8C8C8C';
      return '<div class="card" style="margin-bottom:8px;border-left:4px solid '+pColor+'" onclick="viewPurchaseDetail('+r.id+')">' +
        '<div style="display:flex;justify-content:space-between"><strong>'+esc(r.request_no)+'</strong><span style="font-size:12px;color:'+pColor+'">'+ (priMap[r.priority]||r.priority) +'</span></div>' +
        '<div style="font-size:13px;margin-top:4px">产品: '+esc(r.product_name)+' ×'+r.quantity+'</div>' +
        (r.product_color||r.product_size||r.product_material?'<div style="font-size:11px;color:var(--text-secondary)">'+[r.product_color,r.product_size,r.product_material].filter(Boolean).join(' · ')+'</div>':'') +
        '<div style="display:flex;justify-content:space-between;margin-top:6px"><span style="font-size:12px">'+(statusMap[r.status]||r.status)+'</span><span style="font-size:11px;color:var(--text-secondary)">'+(r.created_at||'').slice(0,10)+'</span></div>' +
        (r.status==='rejected'&&r.rejection_reason?'<div style="font-size:11px;color:var(--error);margin-top:4px">驳回: '+esc(r.rejection_reason)+'</div>':'') +
        (r.payment_amount?'<div style="font-size:12px;color:var(--success);margin-top:4px">💰 已付款 '+r.payment_amount+'元</div>':'') +
        (r.status==='rejected'?'<button class="btn btn-accent btn-sm" style="margin-top:6px" onclick="event.stopPropagation();resubmitPurchase('+r.id+',\''+esc(r.product_name).replace(/'/g,"\\'")+'\','+r.quantity+')">修改重提</button>':'') +
        '</div>';
    }).join('') : '<div class="empty-state"><div class="empty-icon">📝</div>暂无采购申请<br><button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="navigate(\'purchase-request\')">提交采购申请</button></div>') +
    '</div>' + renderTabBar('my-purchases');
}

function resubmitPurchase(id, name, qty) {
  showModal('<h3>🔄 修改采购申请</h3>' +
    '<div style="margin-bottom:8px"><label>产品名称</label><input class="form-input" id="resub-name" value="'+name+'"></div>' +
    '<div style="margin-bottom:8px"><label>数量</label><input class="form-input" id="resub-qty" type="number" value="'+qty+'"></div>' +
    '<div style="margin-bottom:8px"><label>优先级</label><select class="form-input" id="resub-pri"><option value="urgent">🔴 紧急</option><option value="normal" selected>🟡 常规</option><option value="backup">🟢 备用</option></select></div>' +
    '<div style="margin-bottom:12px"><label>备注</label><input class="form-input" id="resub-notes"></div>' +
    '<button class="btn btn-primary btn-block" onclick="submitResubmitPurchase('+id+')">重新提交</button>' +
    '<button class="btn btn-outline btn-block" style="margin-top:6px" onclick="closeModal()">取消</button>');
}
async function submitResubmitPurchase(id) {
  var res = await API.put('/api/purchase-requests/'+id+'/resubmit', { product_name: document.getElementById('resub-name').value.trim(), quantity: parseInt(document.getElementById('resub-qty').value)||1, priority: document.getElementById('resub-pri').value, notes: document.getElementById('resub-notes').value.trim() });
  if (res.success) { showToast('申请已重新提交', 'success'); closeModal(); navigate('my-purchases'); }
  else showToast(res.msg || '操作失败', 'error');
}

async function renderPurchaseList() {
  var requests = [];
  try { requests = await API.get('/api/purchase-requests'); } catch(e) {}
  window._allRequests = requests;
  var statusMap = { pending:'⏳待审批', approved:'✅已审批', rejected:'❌已驳回', converted:'📋已转采购单', cancelled:'🚫已取消' };
  var priMap = { urgent:'🔴紧急', normal:'🟡常规', backup:'🟢备用' };
  $('#app').innerHTML = '<div class="page-header"><h1>📊 采购申请管理</h1><span class="role-badge">采购管理</span></div><div class="page-content">' +
    '<div class="filter-tags" style="margin-bottom:10px"><span class="filter-tag active" onclick="filterPurchaseReq(this,\'\')">全部</span><span class="filter-tag" onclick="filterPurchaseReq(this,\'pending\')">⏳待审批</span><span class="filter-tag" onclick="filterPurchaseReq(this,\'approved\')">✅已审批</span><span class="filter-tag" onclick="filterPurchaseReq(this,\'urgent\')">🔴紧急</span><span class="filter-tag" onclick="filterPurchaseReq(this,\'normal\')">🟡常规</span></div>' +
    '<div id="purchase-req-list"></div></div>' + renderTabBar('purchase-list');
  renderPurchaseReqItems(requests);
}

function renderPurchaseReqItems(requests) {
  var list = $('#purchase-req-list');
  if (!requests.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div>暂无采购申请</div>'; return; }
  var statusMap = { pending:'⏳待审批', approved:'✅已审批', rejected:'❌已驳回', converted:'📋已转采购单' };
  var priMap = { urgent:'🔴紧急', normal:'🟡常规', backup:'🟢备用' };
  list.innerHTML = requests.map(function(r) {
    var pColor = r.priority==='urgent'?'#CF1322':r.priority==='normal'?'#D48806':'#8C8C8C';
    return '<div class="card" style="margin-bottom:8px;border-left:4px solid '+pColor+'" onclick="viewPurchaseDetail('+r.id+')">' +
      '<div style="display:flex;justify-content:space-between"><strong>'+esc(r.request_no)+'</strong><span style="font-size:12px;color:'+pColor+'">'+ (priMap[r.priority]||r.priority) +'</span></div>' +
      '<div style="font-size:13px;margin-top:4px">产品: '+esc(r.product_name)+' ×'+r.quantity+'</div>' +
      (r.product_color||r.product_size||r.product_material?'<div style="font-size:11px;color:var(--text-secondary)">'+[r.product_color,r.product_size,r.product_material].filter(Boolean).join(' · ')+'</div>':'') +
      '<div style="display:flex;justify-content:space-between;margin-top:4px"><span>👤 '+esc(r.applicant_name||'')+'</span><span style="font-size:12px;font-weight:600">'+(statusMap[r.status]||r.status)+'</span></div>' +
      '<div style="font-size:11px;color:var(--text-secondary)">部门: '+esc(r.department||r.applicant_role||'')+' | '+(r.created_at||'').slice(0,10)+'</div>' +
      (r.status==='pending'?'<div style="margin-top:6px;display:flex;gap:6px"><button class="btn btn-success btn-sm" onclick="event.stopPropagation();approveRequest('+r.id+')">✅ 通过</button><button class="btn btn-danger btn-sm" onclick="event.stopPropagation();rejectRequest('+r.id+',\''+esc(r.product_name).replace(/'/g,"\\'")+'\')">❌ 驳回</button></div>':'') +
      (r.status==='approved'?'<div style="margin-top:6px"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();convertToProcurement('+r.id+',\''+esc(r.product_name).replace(/'/g,"\\'")+'\','+r.quantity+')">📋 创建采购单</button></div>':'') +
      '</div>';
  }).join('');
}

function filterPurchaseReq(el, val) {
  var tags = document.querySelectorAll('.filter-tag'); tags.forEach(function(t){t.classList.remove('active');}); el.classList.add('active');
  var all = window._allRequests||[];
  var filtered = val ? (['urgent','normal','backup'].includes(val) ? all.filter(function(r){return r.priority===val;}) : all.filter(function(r){return r.status===val;})) : all;
  renderPurchaseReqItems(filtered);
}
function approveRequest(id) { if (!confirm('确认审批通过？')) return; API.put('/api/purchase-requests/'+id+'/approve').then(function(res){ if (res.success) { showToast('审批通过','success'); navigate('purchase-list'); } else showToast(res.msg||'操作失败','error'); }); }
function rejectRequest(id, name) { showModal('<h3>❌ 驳回采购申请</h3><div style="margin-bottom:8px;font-weight:600">'+name+'</div><div style="margin-bottom:8px"><label>驳回原因 *</label><textarea class="form-input" id="reject-reason" placeholder="请填写驳回原因"></textarea></div><button class="btn btn-danger btn-block" onclick="submitRejectRequest('+id+')">确认驳回</button><button class="btn btn-outline btn-block" style="margin-top:6px" onclick="closeModal()">取消</button>'); }
async function submitRejectRequest(id) { var reason = document.getElementById('reject-reason').value.trim(); if (!reason) return showToast('请填写驳回原因','error'); var res = await API.put('/api/purchase-requests/'+id+'/reject',{reason:reason}); if (res.success) { showToast('已驳回','success'); closeModal(); navigate('purchase-list'); } else showToast(res.msg||'操作失败','error'); }

async function convertToProcurement(id, name, qty) {
  try {
    var suppliers = await API.get('/api/suppliers');
    var sOpts = '<option value="">-- 不指定供应商 --</option>' + suppliers.map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+'</option>';}).join('');
    showModal('<h3>📋 创建采购单</h3><div style="margin-bottom:8px;font-weight:600">产品: '+name+' ×'+qty+'</div>' +
      '<div style="margin-bottom:8px"><label>供应商</label><select class="form-input" id="conv-sid">'+sOpts+'</select></div>' +
      '<div style="margin-bottom:8px"><label>建议采购量</label><input class="form-input" id="conv-qty" type="number" value="'+qty+'"></div>' +
      '<div style="margin-bottom:8px"><label>预估单价(元)</label><input class="form-input" id="conv-price" type="number" step="0.01"></div>' +
      '<div style="margin-bottom:8px"><label>下单日期</label><input class="form-input" id="conv-date" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div>' +
      '<div style="margin-bottom:12px"><label>备注</label><input class="form-input" id="conv-notes"></div>' +
      '<button class="btn btn-primary btn-block" onclick="submitConvertToProcurement('+id+')">确认创建采购单</button>' +
      '<button class="btn btn-outline btn-block" style="margin-top:6px" onclick="closeModal()">取消</button>');
  } catch(e) { showToast('加载供应商失败','error'); }
}
async function submitConvertToProcurement(id) { var res = await API.post('/api/purchase-requests/'+id+'/convert', { supplier_id: parseInt(document.getElementById('conv-sid').value)||null, suggested_qty: parseInt(document.getElementById('conv-qty').value), estimated_price: parseFloat(document.getElementById('conv-price').value)||null, order_date: document.getElementById('conv-date').value, notes: document.getElementById('conv-notes').value.trim() }); if (res.success) { showToast('采购单创建成功！单号: '+res.procurement_no,'success'); closeModal(); navigate('purchase-list'); } else showToast(res.msg||'创建失败','error'); }

function viewPurchaseDetail(id) { window._purchaseReqId = id; navigate('purchase-detail'); }
async function renderPurchaseDetail() {
  var id = window._purchaseReqId;
  var requests = [];
  try { requests = await API.get('/api/purchase-requests/mine'); } catch(e) {}
  var r = requests.find(function(x){return x.id===id;});
  if (!r) { try { var all = await API.get('/api/purchase-requests'); r = all.find(function(x){return x.id===id;}); } catch(e) {} }
  if (!r) { showToast('申请不存在','error'); navigate('purchase-list'); return; }
  var statusMap = { pending:'⏳待审批', approved:'✅已审批', rejected:'❌已驳回', converted:'📋已转采购单', cancelled:'🚫已取消' };
  var priMap = { urgent:'🔴紧急', normal:'🟡常规', backup:'🟢备用' };
  var logsHtml = (r.logs||[]).map(function(l){ return '<div style="padding:4px 0;border-bottom:1px dashed #eee;font-size:12px"><span style="color:var(--accent)">'+esc(l.action)+'</span> '+esc(l.action_detail||'')+' <span style="color:var(--text-secondary)">'+esc(l.operator_name||'')+' '+(l.created_at||'').slice(0,16).replace('T',' ')+'</span></div>'; }).join('');
  $('#app').innerHTML = '<div class="page-header"><h1>📄 采购申请详情</h1></div><div class="page-content">' +
    '<div class="detail-section"><h3>📋 申请信息</h3>' +
    '<div class="detail-row"><span class="label">单号</span><span class="value" style="font-family:monospace">'+esc(r.request_no)+'</span></div>' +
    '<div class="detail-row"><span class="label">状态</span><span class="value" style="font-weight:700">'+(statusMap[r.status]||r.status)+' '+(priMap[r.priority]||'')+'</span></div>' +
    '<div class="detail-row"><span class="label">申请人</span><span class="value">'+esc(r.applicant_name||'')+' · '+esc(r.department||r.applicant_role||'')+'</span></div>' +
    '<div class="detail-row"><span class="label">产品</span><span class="value" style="font-weight:700">'+esc(r.product_name)+'</span></div>' +
    '<div class="detail-row"><span class="label">颜色</span><span class="value">'+esc(r.product_color||'-')+'</span></div>' +
    '<div class="detail-row"><span class="label">尺寸</span><span class="value">'+esc(r.product_size||'-')+'</span></div>' +
    '<div class="detail-row"><span class="label">材质</span><span class="value">'+esc(r.product_material||'-')+'</span></div>' +
    '<div class="detail-row"><span class="label">数量</span><span class="value" style="font-weight:800;color:var(--accent)">'+r.quantity+'</span></div>' +
    (r.image_url?'<img src="'+esc(r.image_url)+'" style="max-width:200px;border-radius:8px;margin-top:8px">':'') +
    (r.rejection_reason?'<div class="detail-row"><span class="label">驳回原因</span><span class="value" style="color:var(--error)">'+esc(r.rejection_reason)+'</span></div>':'') +
    '</div>' +
    (logsHtml?'<div class="detail-section"><h3>📜 操作日志</h3>'+logsHtml+'</div>':'') +
    '<button class="btn btn-outline btn-block" onclick="navigate(\'my-purchases\')">返回</button></div>';
}

// 供应商管理
async function renderSuppliers() {
  var suppliers = await API.get('/api/suppliers');
  $('#app').innerHTML = '<div class="page-header"><h1>🏢 供应商管理</h1></div><div class="page-content">' +
    '<button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddSupplier()">+ 添加供应商</button>' +
    (suppliers.length ? suppliers.map(function(s) {
      var coreCerts = (s.certificates||[]).filter(function(c){return c.is_core;});
      var hasExpired = coreCerts.some(function(c){return c.status==='expired';});
      return '<div class="card" style="margin-bottom:8px;'+(hasExpired?'border:2px solid #CF1322':'')+'"><div style="display:flex;justify-content:space-between"><div style="font-weight:700">🏢 ' + s.name + '</div><span style="font-size:12px;color:'+(s.status==='active'?'var(--success)':'var(--danger)')+'">' + (s.status==='active'?'活跃':s.status==='inactive'?'停用':'黑名单') + '</span></div>' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">联系人: ' + (s.contact_person||'-') + ' · 电话: ' + (s.phone||'-') + '</div>' +
        (hasExpired ? '<div style="font-size:12px;color:#CF1322;font-weight:700;margin-top:4px">❌ 核心资质已过期，不可用于新采购单</div>' : '') +
        '<div style="margin-top:6px;display:flex;gap:4px"><button class="btn btn-outline btn-sm" onclick="viewSupplierCerts('+s.id+')">资质文件</button><button class="btn btn-outline btn-sm" onclick="editSupplier('+s.id+')">编辑</button></div></div>';
    }).join('') : '<div class="empty-state"><div class="empty-icon">🏢</div>暂无供应商</div>') +
    '</div>' + renderTabBar('warehouse-suppliers');
}
function showAddSupplier() {
  showModal('<h3>🏢 添加供应商</h3>' +
    '<div class="form-group"><label>名称 *</label><input class="form-input" id="s-name"></div>' +
    '<div class="form-group"><label>联系人</label><input class="form-input" id="s-contact"></div>' +
    '<div class="form-group"><label>电话</label><input class="form-input" id="s-phone"></div>' +
    '<div class="form-group"><label>地址</label><input class="form-input" id="s-addr"></div>' +
    '<button class="btn btn-primary btn-block" onclick="submitAddSupplier()">添加</button>');
}
async function submitAddSupplier() {
  var n = $('#s-name').value.trim();
  if (!n) return showToast('请输入名称', 'error');
  var res = await API.post('/api/suppliers', { name: n, contact_person: $('#s-contact').value.trim(), phone: $('#s-phone').value.trim(), address: $('#s-addr').value.trim() });
  if (res.success) { showToast('添加成功', 'success'); closeModal(); navigate('warehouse-suppliers'); }
}
function viewSupplierCerts(sid) { _supplierCertsId = sid; navigate('warehouse-supplier-certs'); }
var _supplierCertsId;
async function renderSupplierCerts() {
  var certs = await API.get('/api/suppliers/' + _supplierCertsId + '/certificates');
  var typeMap = {business_license:'营业执照',production_permit:'生产许可证',food_permit:'食品经营许可证',official_inspection:'官检报告',other:'其他'};
  var stMap = {valid:'✅有效',expiring:'⚠️即将到期',expired:'❌已过期',archived:'📁已归档'};
  $('#app').innerHTML = '<div class="page-header"><h1>📋 资质文件</h1></div><div class="page-content">' +
    '<button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="showAddCert()">+ 上传资质</button>' +
    (certs.length ? certs.map(function(c) {
      return '<div class="card" style="margin-bottom:8px"><div style="font-weight:700">' + (typeMap[c.cert_type]||c.cert_type) + ' ' + (stMap[c.status]||c.status) + (c.is_core?' <span style="font-size:11px;color:var(--primary)">[核心]</span>':'') + '</div>' +
        '<div style="font-size:12px;color:var(--text-secondary)">证号: ' + (c.cert_number||'-') + ' · 有效期: ' + (c.issue_date||'-') + ' ~ ' + (c.expiry_date||'-') + '</div>' +
        (c.file_url ? '<div style="margin-top:4px"><a href="'+c.file_url+'" target="_blank" style="font-size:12px">📎 查看文件</a></div>' : '') +
        '</div>';
    }).join('') : '<div class="empty-state"><div class="empty-icon">📋</div>暂无资质文件</div>') +
    '<button class="btn btn-outline btn-block" onclick="navigate(\'warehouse-suppliers\')">返回</button></div>';
}
function showAddCert() {
  showModal('<h3>📋 上传资质</h3>' +
    '<div class="form-group"><label>类型 *</label><select class="form-input" id="c-type"><option value="business_license">营业执照</option><option value="production_permit">生产许可证</option><option value="food_permit">食品经营许可证</option><option value="official_inspection">官检报告</option><option value="other">其他</option></select></div>' +
    '<div class="form-group"><label>证号</label><input class="form-input" id="c-num"></div>' +
    '<div class="form-group"><label>发证日期</label><input class="form-input" type="date" id="c-issue"></div>' +
    '<div class="form-group"><label>到期日期 *</label><input class="form-input" type="date" id="c-expire"></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="c-core" checked> 核心资质</label></div>' +
    '<button class="btn btn-primary btn-block" onclick="submitAddCert()">上传保存</button>');
}
async function submitAddCert() {
  if (!$('#c-expire').value) return showToast('请填写到期日期', 'error');
  var res = await API.post('/api/suppliers/' + _supplierCertsId + '/certificates', {
    cert_type: $('#c-type').value, cert_number: $('#c-num').value.trim(),
    issue_date: $('#c-issue').value, expiry_date: $('#c-expire').value,
    is_core: $('#c-core').checked ? 1 : 0
  });
  if (res.success) { showToast('资质已保存', 'success'); closeModal(); navigate('warehouse-supplier-certs'); }
}

// 配料模块
async function renderPreparationList() {
  var preps = await API.get('/api/preparations');
  $('#app').innerHTML = '<div class="page-header"><h1>🧪 配料任务</h1><span class="role-badge">配料</span></div>' +
    '<div class="page-content">' +
    '<button class="btn btn-primary btn-sm" style="margin-bottom:10px" onclick="navigate(\'preparation-form\')">🧪 新建配料</button>' +
    (preps.length ? preps.map(function(p) {
      return '<div class="card" style="margin-bottom:8px" onclick="viewPreparation('+p.id+')"><div style="font-weight:700">' + (p.product_name||'') + '</div>' +
        '<div style="font-size:12px;color:var(--text-secondary)">订单: ' + (p.order_no||'') + ' · 日期: ' + (p.prep_date||'') + '</div>' +
        '<div style="font-size:12px;margin-top:2px">颜色目标: ' + (p.color_target||'-') + '</div></div>';
    }).join('') : '<div class="empty-state"><div class="empty-icon">🧪</div>暂无配料记录</div>') +
    '</div>' + renderTabBar('preparation-list');
}
function viewPreparation(id) { _prepDetailId = id; navigate('preparation-form'); }
var _prepDetailId, _prepOrderId;
async function renderPreparationForm() {
  var rm = await API.get('/api/raw-materials');
  window._prepMaterials = rm;
  var orderId = _prepOrderId || (window._prepOrderId || null);
  var prep = _prepDetailId ? await API.get('/api/preparations/' + _prepDetailId) : null;
  var orders = await API.get('/api/orders');
  var dispatchedOrders = orders.filter(function(o){ return o.status === 'dispatched'; });
  
  if (!prep && !orderId) {
    $('#app').innerHTML = '<div class="page-header"><h1>🧪 新建配料</h1></div><div class="page-content">' +
      '<div class="form-group"><label>选择生产订单 *</label><select class="form-input" id="prep-oid"><option value="">请选择</option>' +
      dispatchedOrders.map(function(o){ return '<option value="'+o.id+'">'+o.order_no+' - '+o.customer_name+' - '+o.product_name+'</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-group"><label>调配日期</label><input class="form-input" type="date" id="prep-date" value="'+new Date().toISOString().slice(0,10)+'"></div>' +
      '<div class="form-group"><label>目标颜色</label><input class="form-input" id="prep-color" placeholder="色卡编号或颜色描述"></div>' +
      '<div style="margin-top:10px;font-weight:700;font-size:14px">📝 用料明细</div>' +
      '<div id="prep-items"><div class="prep-item-row" style="display:flex;gap:6px;margin-bottom:6px">' +
      '<select class="form-input" style="flex:1"><option value="">物料类别</option><option value="chocolate">巧克力</option><option value="colorant">色素</option><option value="other">其他</option></select>' +
      '<select class="form-input" style="flex:2"><option value="">选择物料</option>' + rm.map(function(m){return '<option value="'+m.id+'">'+m.name+'</option>';}).join('') + '</select>' +
      '<input class="form-input" type="number" step="0.1" min="0" placeholder="克" style="width:70px"></div></div>' +
      '<button class="btn btn-outline btn-sm" onclick="addPrepRow()">+ 添加一行</button>' +
      '<div class="form-group"><label>调配结果说明</label><textarea class="form-input" id="prep-result"></textarea></div>' +
      '<button class="btn btn-primary btn-block" onclick="submitPreparation()">确认配料完成</button>' +
      '<button class="btn btn-outline btn-block" style="margin-top:8px" onclick="navigate(\'preparation-list\')">取消</button></div>';
  } else {
    var items = prep ? prep.items : [];
    $('#app').innerHTML = '<div class="page-header"><h1>🧪 配料详情</h1></div><div class="page-content">' +
      '<div class="card"><div class="card-title">订单: ' + (prep.order_no||'') + ' · ' + (prep.product_name||'') + '</div>' +
      '<div class="detail-row"><span class="label">调配日期</span><span class="value">' + (prep.prep_date||'') + '</span></div>' +
      '<div class="detail-row"><span class="label">目标颜色</span><span class="value">' + (prep.color_target||'-') + '</span></div>' +
      '<div class="detail-row"><span class="label">调配结果</span><span class="value">' + (prep.color_result||'-') + '</span></div></div>' +
      '<div class="card"><div class="card-title">用料明细</div>' +
      '<table class="production-table"><thead><tr><th>类别</th><th>物料</th><th>用量(克)</th></tr></thead><tbody>' +
      items.map(function(it){ return '<tr><td>'+(it.material_type==='chocolate'?'巧克力':it.material_type==='colorant'?'色素':'其他')+'</td><td>'+it.material_name+'</td><td>'+it.usage_grams+'g</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<button class="btn btn-outline btn-block" onclick="navigate(\'preparation-list\')">返回</button></div>';
  }
}
function addPrepRow() {
  var rm = window._prepMaterials || [];
  var row = document.createElement('div');
  row.className = 'prep-item-row';
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
  row.innerHTML = '<select class="form-input" style="flex:1"><option value="">物料类别</option><option value="chocolate">巧克力</option><option value="colorant">色素</option><option value="other">其他</option></select>' +
    '<select class="form-input" style="flex:2"><option value="">选择物料</option>' + rm.map(function(m){return '<option value="'+m.id+'">'+m.name+'</option>';}).join('') + '</select>' +
    '<input class="form-input" type="number" step="0.1" min="0" placeholder="克" style="width:70px">';
  $('#prep-items').appendChild(row);
}
async function submitPreparation() {
  var orderId = parseInt($('#prep-oid').value);
  if (!orderId) return showToast('请选择生产订单', 'error');
  var items = [];
  $$('.prep-item-row').forEach(function(row) {
    var sels = row.querySelectorAll('select');
    var inp = row.querySelector('input');
    var mt = sels[0].value, mid = parseInt(sels[1].value), grams = parseFloat(inp.value);
    if (mt && mid && grams > 0) {
      var m = (window._prepMaterials||[]).find(function(x){return x.id===mid;});
      items.push({ material_type: mt, material_id: mid, material_name: m ? m.name : '', usage_grams: grams });
    }
  });
  if (!items.length) return showToast('请填写至少一项用料明细', 'error');
  var res = await API.post('/api/preparations', {
    order_id: orderId, prep_date: $('#prep-date').value,
    color_target: $('#prep-color').value.trim(), color_result: $('#prep-result').value.trim(),
    items: items
  });
  if (res.success) { showToast('配料完成，原材料已自动扣减', 'success'); navigate('preparation-list'); }
  else showToast(res.msg || '提交失败', 'error');
}

// 弹窗辅助
function showModal(html) {
  closeModal();
  var m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'dispatch-modal';
  m.innerHTML = '<div class="modal-content">' + html + '<div style="text-align:center;margin-top:8px"><button class="modal-close" onclick="closeModal()" style="font-size:20px;background:none;border:none;cursor:pointer">&times;</button></div></div>';
  document.body.appendChild(m);
}

// ===== 初始化 =====
async function init() {
  // 超时保护：3秒后强制跳到登录页
  var timeout = setTimeout(function() {
    console.warn('init timed out, forcing login');
    navigate('login');
  }, 3000);
  try {
    var res = await API.get('/api/me');
    clearTimeout(timeout);
    if (res.user) {
      currentUser = res.user;
      loadNotifications();
      navigate('dashboard');
      initFloatingButton();
    } else {
      navigate('login');
    }
  } catch(e) {
    clearTimeout(timeout);
    console.error('init error:', e);
    navigate('login');
  }
}

init();
