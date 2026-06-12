const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { initDatabase, getDb, saveDatabase } = require('./db.js');
let db = null;

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'choc-factory-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).substr(2,6) + path.extname(file.originalname))
});
const upload = multer({ storage });

// ===== 辅助 =====
function safe(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/'/g, "''");
}
function safeNum(v, d) {
  if (d === undefined) d = 0;
  var n = parseInt(v); return isNaN(n) ? d : n;
}
function dbQuery(sql) {
  try { return db.exec(sql); }
  catch(e) { console.error('SQL:', sql, e.message); throw e; }
}
function dbRun(sql) {
  try { db.run(sql); saveDatabase(); }
  catch(e) { console.error('SQL:', sql, e.message); throw e; }
}
function rowsToObjects(result) {
  if (!result || !result[0]) return [];
  var cols = result[0].columns;
  return result[0].values.map(function(r) {
    var o = {}; cols.forEach(function(c,i) { o[c] = r[i]; }); return o;
  });
}
function rowToObject(result) {
  var r = rowsToObjects(result); return r.length > 0 ? r[0] : null;
}
function getLastId() {
  var r = dbQuery("SELECT last_insert_rowid() as id");
  return r[0] ? r[0].values[0][0] : null;
}

// ===== 权限 =====
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: '请先登录' });
}
function requireRole() {
  var roles = Array.prototype.slice.call(arguments);
  return function(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: '请先登录' });
    if (roles.indexOf(req.session.user.role) !== -1) return next();
    res.status(403).json({ error: '权限不足' });
  };
}

// ===== 通知 =====
function addNotif(role, uid, type, title, content, oid) {
  var rc = role ? ("'" + role + "'") : 'NULL';
  var uc = uid ? String(uid) : 'NULL';
  var oc = oid ? String(oid) : 'NULL';
  dbRun("INSERT INTO notifications (user_id,role,type,title,content,order_id) VALUES (" + uc + "," + rc + ",'" + safe(type) + "','" + safe(title) + "','" + safe(content) + "'," + oc + ")");
}
function addLog(uid, action, detail, oid) {
  var u = uid || 'NULL', o = oid || 'NULL';
  dbRun("INSERT INTO operation_logs (user_id,action,detail,order_id) VALUES (" + u + ",'" + safe(action) + "','" + safe(detail) + "'," + o + ")");
}

// ===== 工资核算 =====
function autoCalcWages(orderId, productionId) {
  var prod = rowToObject(dbQuery("SELECT * FROM productions WHERE order_id=" + orderId + " ORDER BY id DESC LIMIT 1"));
  if (!prod) return;
  var workers = (prod.workers || '').split(/[,，、\s]+/).filter(function(w) { return w.trim(); });
  if (!workers.length) return;
  var items = rowsToObjects(dbQuery("SELECT * FROM inspection_items WHERE inspection_id IN (SELECT id FROM inspections WHERE order_id=" + orderId + ")"));
  if (!items.length) return;
  var now = new Date();
  var period = now.getFullYear() + '-' + ('0' + (now.getMonth()+1)).slice(-2);
  items.forEach(function(ii) {
    var pr = rowToObject(dbQuery("SELECT price_per_unit FROM piece_prices WHERE product_item_id=" + ii.product_item_id));
    var ppu = pr ? pr.price_per_unit : 0;
    var avgQ = Math.floor(ii.qualified_qty / workers.length);
    var rem = ii.qualified_qty - avgQ * workers.length;
    workers.forEach(function(w, i) {
      var q = avgQ + (i === 0 ? rem : 0);
      var amt = (q * ppu).toFixed(2);
      dbRun("INSERT INTO wage_records (order_id,production_id,team_member_name,product_item_id,product_item_name,qualified_qty,price_per_unit,wage_amount,period) VALUES (" + orderId + "," + prod.id + ",'" + safe(w.trim()) + "'," + ii.product_item_id + ",'" + safe(ii.product_item_name) + "'," + q + "," + ppu + "," + amt + ",'" + period + "')");
    });
  });
}

// ===== API 路由 =====

// 登录
app.post('/api/login', function(req, res) {
  var username = req.body.username, password = req.body.password;
  var bcrypt = require('bcryptjs');
  var users = rowsToObjects(dbQuery("SELECT * FROM users WHERE username='" + safe(username) + "'"));
  if (users.length === 0) return res.json({ success: false, msg: '用户名不存在' });
  if (!bcrypt.compareSync(password, users[0].password)) return res.json({ success: false, msg: '密码错误' });
  req.session.user = { id: users[0].id, username: users[0].username, role: users[0].role, real_name: users[0].real_name, team_id: users[0].team_id };
  res.json({ success: true, user: req.session.user });
});

app.get('/api/me', function(req, res) {
  res.json(req.session.user || { error: '请先登录' });
});

app.post('/api/logout', function(req, res) {
  req.session.destroy(function() { res.json({ success: true }); });
});

// 用户管理
app.get('/api/users', requireRole('admin'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT id,username,role,real_name,team_id,created_at FROM users ORDER BY id")));
});
app.post('/api/users', requireRole('admin'), function(req, res) {
  var b = req.body, bcrypt = require('bcryptjs');
  var tc = b.team_id ? String(b.team_id) : 'NULL';
  dbRun("INSERT INTO users (username,password,role,real_name,team_id) VALUES ('" + safe(b.username) + "','" + bcrypt.hashSync(b.password,10) + "','" + safe(b.role) + "','" + safe(b.real_name) + "'," + tc + ")");
  res.json({ success: true });
});
app.put('/api/users/:id', requireRole('admin'), function(req, res) {
  var b = req.body, bcrypt = require('bcryptjs');
  var sets = [];
  if (b.role) sets.push("role='" + safe(b.role) + "'");
  if (b.real_name) sets.push("real_name='" + safe(b.real_name) + "'");
  if (b.password) sets.push("password='" + bcrypt.hashSync(b.password,10) + "'");
  if (b.team_id !== undefined) {
    sets.push("team_id=" + (b.team_id ? safeNum(b.team_id) : 'NULL'));
  }
  if (!sets.length) return res.json({ success: false, msg: '没有要更新的字段' });
  dbRun("UPDATE users SET " + sets.join(',') + " WHERE id=" + req.params.id);
  res.json({ success: true });
});
app.delete('/api/users/:id', requireRole('admin'), function(req, res) {
  dbRun("DELETE FROM users WHERE id=" + req.params.id);
  res.json({ success: true });
});

// 班组
app.get('/api/teams', requireLogin, function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM teams ORDER BY id")));
});
app.get('/api/team-members', requireLogin, function(req, res) {
  var sql = req.query.team_id ? "SELECT * FROM team_members WHERE team_id=" + safeNum(req.query.team_id) + " ORDER BY id" : "SELECT * FROM team_members ORDER BY team_id,id";
  res.json(rowsToObjects(dbQuery(sql)));
});

// 客户
app.get('/api/customers', requireLogin, function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM customers ORDER BY id")));
});
app.post('/api/customers', requireRole('admin','clerk'), function(req, res) {
  dbRun("INSERT INTO customers (name,contact,notes) VALUES ('" + safe(req.body.name) + "','" + safe(req.body.contact||'') + "','" + safe(req.body.notes||'') + "')");
  res.json({ success: true });
});
app.put('/api/customers/:id', requireRole('admin','clerk'), function(req, res) {
  dbRun("UPDATE customers SET name='" + safe(req.body.name) + "',contact='" + safe(req.body.contact||'') + "',notes='" + safe(req.body.notes||'') + "' WHERE id=" + req.params.id);
  res.json({ success: true });
});
app.delete('/api/customers/:id', requireRole('admin'), function(req, res) {
  dbRun("DELETE FROM customers WHERE id=" + req.params.id);
  res.json({ success: true });
});

// 客户批量导入（Excel）
app.post('/api/customers/import', requireRole('admin'), upload.single('file'), function(req, res) {
  if (!req.file) return res.json({ success: false, msg: '请上传文件' });
  try {
    var XLSX = require('xlsx');
    var wb = XLSX.readFile(req.file.path);
    var sheet = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    var count = 0, skipped = 0;
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i], name = (r[0]||'').toString().trim();
      if (!name) { skipped++; continue; }
      var contact = (r[1]||'').toString().trim();
      var notes = (r[2]||'').toString().trim();
      dbRun("INSERT INTO customers (name,contact,notes) VALUES ('"+safe(name)+"','"+safe(contact)+"','"+safe(notes)+"')");
      count++;
    }
    try { require('fs').unlinkSync(req.file.path); } catch(e) {}
    res.json({ success: true, count: count, skipped: skipped, msg: '成功导入 '+count+' 个客户'+(skipped>0?'，跳过 '+skipped+' 行':'') });
  } catch(e) {
    try { require('fs').unlinkSync(req.file.path); } catch(ex) {}
    res.json({ success: false, msg: '解析失败：' + e.message });
  }
});

// 产品（含图片和配件）
app.get('/api/products', requireLogin, function(req, res) {
  var sql = "SELECT p.*,c.name as customer_name FROM products p LEFT JOIN customers c ON p.customer_id=c.id";
  if (req.query.customer_id) sql += " WHERE p.customer_id=" + safeNum(req.query.customer_id);
  sql += " ORDER BY p.id";
  var products = rowsToObjects(dbQuery(sql));
  products.forEach(function(p) {
    p.images = rowsToObjects(dbQuery("SELECT * FROM product_images WHERE product_id=" + p.id + " ORDER BY sort_order"));
    p.children = rowsToObjects(dbQuery("SELECT * FROM product_children WHERE product_id=" + p.id + " ORDER BY sort_order"));
    p.accessories = rowsToObjects(dbQuery("SELECT pa.id as accessory_id,pa.name,IFNULL(ai.stock_qty,0) as stock_qty FROM product_accessories pa LEFT JOIN accessory_inventory ai ON pa.id=ai.accessory_id WHERE pa.product_id=" + p.id + " ORDER BY pa.sort_order"));
  });
  res.json(products);
});
// 单个产品详情
app.get('/api/products/:id', requireLogin, function(req, res) {
  var p = rowToObject(dbQuery("SELECT p.*,c.name as customer_name FROM products p LEFT JOIN customers c ON p.customer_id=c.id WHERE p.id=" + req.params.id));
  if (!p) return res.status(404).json({ error: '产品不存在' });
  p.images = rowsToObjects(dbQuery("SELECT * FROM product_images WHERE product_id=" + p.id + " ORDER BY sort_order"));
  p.children = rowsToObjects(dbQuery("SELECT * FROM product_children WHERE product_id=" + p.id + " ORDER BY sort_order"));
  p.accessories = rowsToObjects(dbQuery("SELECT pa.id as accessory_id,pa.name,IFNULL(ai.stock_qty,0) as stock_qty FROM product_accessories pa LEFT JOIN accessory_inventory ai ON pa.id=ai.accessory_id WHERE pa.product_id=" + p.id + " ORDER BY pa.sort_order"));
  res.json(p);
});
app.post('/api/products', requireRole('admin','clerk'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO products (customer_id,name,details,color_code,image_url,inner_pack_spec,inner_pack_qty,outer_pack_spec,items_per_box) VALUES (" + safeNum(b.customer_id) + ",'" + safe(b.name) + "','" + safe(b.details||'') + "','" + safe(b.color_code||'') + "','" + safe(b.image_url||'') + "','" + safe(b.inner_pack_spec||'') + "'," + safeNum(b.inner_pack_qty,1) + ",'" + safe(b.outer_pack_spec||'') + "'," + safeNum(b.items_per_box,0) + ")");
  var pid = getLastId();
  // 子产品
  (b.children||[]).forEach(function(ch, i) {
    if (ch.name) dbRun("INSERT INTO product_children (product_id,name,quantity,image_url,sort_order) VALUES (" + pid + ",'" + safe(ch.name) + "'," + safeNum(ch.quantity,1) + ",'" + safe(ch.image_url||'') + "'," + i + ")");
  });
  res.json({ success: true, id: pid });
});
app.put('/api/products/:id', requireRole('admin','clerk'), function(req, res) {
  var b = req.body;
  dbRun("UPDATE products SET customer_id=" + safeNum(b.customer_id) + ",name='" + safe(b.name) + "',details='" + safe(b.details||'') + "',color_code='" + safe(b.color_code||'') + "',image_url='" + safe(b.image_url||'') + "',inner_pack_spec='" + safe(b.inner_pack_spec||'') + "',inner_pack_qty=" + safeNum(b.inner_pack_qty,1) + ",outer_pack_spec='" + safe(b.outer_pack_spec||'') + "',items_per_box=" + safeNum(b.items_per_box,0) + " WHERE id=" + req.params.id);
  // 子产品：删除旧的，插入新的
  dbRun("DELETE FROM product_children WHERE product_id=" + req.params.id);
  (b.children||[]).forEach(function(ch, i) {
    if (ch.name) dbRun("INSERT INTO product_children (product_id,name,quantity,image_url,sort_order) VALUES (" + req.params.id + ",'" + safe(ch.name) + "'," + safeNum(ch.quantity,1) + ",'" + safe(ch.image_url||'') + "'," + i + ")");
  });
  res.json({ success: true });
});
app.delete('/api/products/:id', requireRole('admin'), function(req, res) {
  dbRun("DELETE FROM products WHERE id=" + req.params.id);
  res.json({ success: true });
});

// 产品图片
app.post('/api/products/:id/images', upload.single('image'), requireRole('admin','clerk'), function(req, res) {
  if (!req.file) return res.json({ success: false, msg: '请选择图片' });
  var url = '/uploads/' + req.file.filename;
  dbRun("INSERT INTO product_images (product_id,image_url) VALUES (" + req.params.id + ",'" + url + "')");
  res.json({ success: true, image_url: url, id: getLastId() });
});
// 主产品封面图上传
app.post('/api/products/:id/cover', upload.single('image'), requireRole('admin','clerk'), function(req, res) {
  if (!req.file) return res.json({ success: false, msg: '请选择图片' });
  var url = '/uploads/' + req.file.filename;
  dbRun("UPDATE products SET image_url='" + url + "' WHERE id=" + req.params.id);
  res.json({ success: true, image_url: url });
});
// 子产品图片上传
app.post('/api/product-children/:id/image', upload.single('image'), requireRole('admin','clerk'), function(req, res) {
  if (!req.file) return res.json({ success: false, msg: '请选择图片' });
  var url = '/uploads/' + req.file.filename;
  dbRun("UPDATE product_children SET image_url='" + url + "' WHERE id=" + req.params.id);
  res.json({ success: true, image_url: url });
});
app.delete('/api/product-images/:id', requireRole('admin','clerk'), function(req, res) {
  var img = rowToObject(dbQuery("SELECT * FROM product_images WHERE id=" + req.params.id));
  if (img) {
    try { fs.unlinkSync(path.join(__dirname, 'public', img.image_url)); } catch(e) {}
    dbRun("DELETE FROM product_images WHERE id=" + req.params.id);
  }
  res.json({ success: true });
});

// 产品配件和库存
app.get('/api/product-accessories', requireLogin, function(req, res) {
  var sql = "SELECT pa.*,ai.stock_qty,p.name as product_name FROM product_accessories pa LEFT JOIN accessory_inventory ai ON pa.id=ai.accessory_id LEFT JOIN products p ON pa.product_id=p.id";
  if (req.query.product_id) sql += " WHERE pa.product_id=" + safeNum(req.query.product_id);
  sql += " ORDER BY pa.product_id,pa.sort_order";
  res.json(rowsToObjects(dbQuery(sql)));
});
app.post('/api/product-accessories', requireRole('admin','warehouse'), function(req, res) {
  dbRun("INSERT INTO product_accessories (product_id,name) VALUES (" + safeNum(req.body.product_id) + ",'" + safe(req.body.name) + "')");
  var aid = getLastId();
  dbRun("INSERT INTO accessory_inventory (accessory_id,stock_qty) VALUES (" + aid + ",0)");
  res.json({ success: true });
});
app.post('/api/accessory-inventory/adjust', requireRole('admin','warehouse'), function(req, res) {
  var b = req.body;
  var ex = rowToObject(dbQuery("SELECT id FROM accessory_inventory WHERE accessory_id=" + safeNum(b.accessory_id)));
  if (ex) {
    dbRun("UPDATE accessory_inventory SET stock_qty=" + safeNum(b.stock_qty) + ",updated_at=CURRENT_TIMESTAMP WHERE id=" + ex.id);
  } else {
    dbRun("INSERT INTO accessory_inventory (accessory_id,stock_qty) VALUES (" + safeNum(b.accessory_id) + "," + safeNum(b.stock_qty) + ")");
  }
  res.json({ success: true });
});

// 产品明细项目
app.get('/api/product-items', requireLogin, function(req, res) {
  var sql = req.query.product_id ? "SELECT * FROM product_items WHERE product_id=" + safeNum(req.query.product_id) + " ORDER BY sort_order" : "SELECT * FROM product_items ORDER BY product_id,sort_order";
  res.json(rowsToObjects(dbQuery(sql)));
});
app.post('/api/product-items', requireRole('admin','clerk'), function(req, res) {
  dbRun("INSERT INTO product_items (product_id,name) VALUES (" + safeNum(req.body.product_id) + ",'" + safe(req.body.name) + "')");
  res.json({ success: true, id: getLastId() });
});

// ===== 订单（含配件库存抵扣）=====
app.get('/api/orders', requireLogin, function(req, res) {
  var sql = "SELECT o.*,c.name as customer_name,p.name as product_name,p.items_per_box,u.real_name as creator_name FROM orders o LEFT JOIN customers c ON o.customer_id=c.id LEFT JOIN products p ON o.product_id=p.id LEFT JOIN users u ON o.created_by=u.id WHERE 1=1";
  if (req.query.status) sql += " AND o.status='" + safe(req.query.status) + "'";
  sql += " ORDER BY o.id DESC";
  var orders = rowsToObjects(dbQuery(sql));
  orders.forEach(function(o) {
    o.accessories = rowsToObjects(dbQuery("SELECT pa.name,pa.id as accessory_id,IFNULL(ai.stock_qty,0) as stock_qty FROM product_accessories pa LEFT JOIN accessory_inventory ai ON pa.id=ai.accessory_id WHERE pa.product_id=" + o.product_id));
    o.product_children = rowsToObjects(dbQuery("SELECT * FROM product_children WHERE product_id=" + o.product_id + " ORDER BY sort_order"));
    o.items = rowsToObjects(dbQuery("SELECT oi.*,p.name as product_name,p.details,p.color_code,p.image_url,p.inner_pack_spec,p.outer_pack_spec FROM order_items oi LEFT JOIN products p ON oi.product_id=p.id WHERE oi.order_id=" + o.id + " ORDER BY oi.sort_order"));
    o.items.forEach(function(it) {
      it.children = rowsToObjects(dbQuery("SELECT * FROM product_children WHERE product_id=" + it.product_id + " ORDER BY sort_order"));
        it.images = rowsToObjects(dbQuery("SELECT * FROM product_images WHERE product_id=" + it.product_id + " ORDER BY sort_order"));
    });
  });
  res.json(orders);
});

// 订单详情
app.get('/api/orders/:id', requireLogin, function(req, res) {
  var oid = safeNum(req.params.id);
  var order = rowToObject(dbQuery("SELECT o.*,c.name as customer_name,c.contact as customer_contact,c.notes as customer_notes,p.name as product_name,p.items_per_box,p.inner_pack_spec,p.inner_pack_qty,p.outer_pack_spec,p.image_url,p.color_code,p.details as product_details FROM orders o LEFT JOIN customers c ON o.customer_id=c.id LEFT JOIN products p ON o.product_id=p.id WHERE o.id=" + oid));
  if (!order) return res.status(404).json({ error: '订单不存在' });
  order.product_children = rowsToObjects(dbQuery("SELECT * FROM product_children WHERE product_id=" + order.product_id + " ORDER BY sort_order"));
  order.product_images = rowsToObjects(dbQuery("SELECT * FROM product_images WHERE product_id=" + order.product_id + " ORDER BY sort_order"));
  // 多产品信息
  order.items = rowsToObjects(dbQuery("SELECT oi.*,p.name as product_name,p.details,p.color_code,p.image_url,p.inner_pack_spec,p.outer_pack_spec FROM order_items oi LEFT JOIN products p ON oi.product_id=p.id WHERE oi.order_id=" + oid + " ORDER BY oi.sort_order"));
  order.items.forEach(function(it) {
    it.children = rowsToObjects(dbQuery("SELECT * FROM product_children WHERE product_id=" + it.product_id + " ORDER BY sort_order"));
    it.images = rowsToObjects(dbQuery("SELECT * FROM product_images WHERE product_id=" + it.product_id + " ORDER BY sort_order"));
  });
  res.json(order);
});

app.post('/api/orders', requireRole('clerk','admin'), function(req, res) {
  var b = req.body;
  var prefix = 'QK';
  var cnt = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM orders"))[0].c + 1;
  var orderNo = prefix + String(cnt).padStart(6,'0');
  var iu = b.is_urgent ? 1 : 0;
  
  // 支持多产品下单
  var items = b.items || [{ product_id: b.product_id, quantity: b.quantity }];
  if (!items.length) return res.json({ success: false, msg: '请至少选择一个产品' });
  
  var firstItem = items[0];
  var firstProduct = rowToObject(dbQuery("SELECT id,name,inner_pack_spec,inner_pack_qty FROM products WHERE id=" + safeNum(firstItem.product_id)));
  var totalQty = items.reduce(function(s,it){ return s + safeNum(it.quantity); }, 0);
  
  dbRun("INSERT INTO orders (order_no,customer_id,product_id,quantity,status,is_urgent,deadline,notes,created_by) VALUES ('" + orderNo + "'," + safeNum(b.customer_id) + "," + safeNum(firstItem.product_id) + "," + totalQty + ",'pending'," + iu + ",'" + safe(b.deadline||'') + "','" + safe(b.notes||'') + "'," + req.session.user.id + ")");
  var orderId = getLastId();

  // 插入多产品明细
  items.forEach(function(it, idx) {
    dbRun("INSERT INTO order_items (order_id,product_id,quantity,sort_order) VALUES (" + orderId + "," + safeNum(it.product_id) + "," + safeNum(it.quantity,1) + "," + idx + ")");
  });

  var deductMsg = '';
  // 内包材自动对冲（所有产品汇总）
  items.forEach(function(it) {
    var prod = rowToObject(dbQuery("SELECT inner_pack_qty,inner_pack_spec FROM products WHERE id=" + safeNum(it.product_id)));
    if (prod && prod.inner_pack_qty > 0) {
      var needTotal = safeNum(it.quantity) * prod.inner_pack_qty;
      var ims = rowsToObjects(dbQuery("SELECT * FROM inner_pack_materials WHERE stock_qty > 0 ORDER BY id"));
      var remaining = needTotal;
      ims.forEach(function(im) {
        if (remaining <= 0) return;
        var deduct = Math.min(im.stock_qty, remaining);
        var newStock = im.stock_qty - deduct;
        dbRun("UPDATE inner_pack_materials SET stock_qty=" + newStock + " WHERE id=" + im.id);
        dbRun("INSERT INTO inner_pack_issues (material_id,quantity,issued_by) VALUES (" + im.id + "," + deduct + "," + req.session.user.id + ")");
        deductMsg += '内包材'+im.name+': 抵扣'+deduct+',剩余'+newStock+'; ';
        remaining -= deduct;
      });
      if (remaining > 0) deductMsg += '⚠️内包材不足，缺'+remaining+'个; ';
    }
  });

  // 配件库存抵扣
  var accs = rowsToObjects(dbQuery("SELECT pa.id as accessory_id,pa.name,IFNULL(ai.stock_qty,0) as stock_qty FROM product_accessories pa LEFT JOIN accessory_inventory ai ON pa.id=ai.accessory_id WHERE pa.product_id=" + safeNum(firstItem.product_id)));
  accs.forEach(function(acc) {
    if (acc.stock_qty > 0) {
      var deduct = Math.min(acc.stock_qty, totalQty);
      var remain = acc.stock_qty - deduct;
      dbRun("UPDATE accessory_inventory SET stock_qty=" + remain + ",updated_at=CURRENT_TIMESTAMP WHERE accessory_id=" + acc.accessory_id);
      deductMsg += acc.name + ': 抵扣' + deduct + '个, 剩余' + remain + '个; ';
    }
  });

  addNotif('supervisor', null, 'new_order', '新订单待派单', '订单' + orderNo + '已创建, ' + items.length + '个产品. ' + deductMsg, orderId);
  addLog(req.session.user.id, 'create_order', '创建订单' + orderNo + ', ' + deductMsg, orderId);
  res.json({ success: true, id: orderId, order_no: orderNo, items_count: items.length, deduction_msg: deductMsg });
});

app.put('/api/orders/:id/status', requireRole('admin','clerk'), function(req, res) {
  dbRun("UPDATE orders SET status='" + safe(req.body.status) + "',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
  res.json({ success: true });
});

// 派单
app.post('/api/orders/:id/dispatch', requireRole('supervisor','admin'), function(req, res) {
  var tid = safeNum(req.body.team_id);
  dbRun("INSERT INTO dispatches (order_id,team_id,dispatched_by) VALUES (" + req.params.id + "," + tid + "," + req.session.user.id + ")");
  dbRun("UPDATE orders SET status='dispatched',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
  var orderNo = rowToObject(dbQuery("SELECT order_no FROM orders WHERE id=" + req.params.id));
  addNotif('team', null, 'new_dispatch', '新派单', '您有新的生产任务，订单#' + (orderNo ? orderNo.order_no : req.params.id), req.params.id);
  addLog(req.session.user.id, 'dispatch', '派单至班组' + tid, req.params.id);
  res.json({ success: true });
});

// 派单统计
app.get('/api/dispatch-stats', requireRole('supervisor','admin','console'), function(req, res) {
  var month = req.query.month || new Date().toISOString().slice(0,7);
  var stats = rowsToObjects(dbQuery("SELECT t.id as team_id,t.name,COUNT(d.id) as dispatch_count,IFNULL(SUM(o.quantity),0) as total_quantity FROM teams t LEFT JOIN dispatches d ON t.id=d.team_id AND strftime('%Y-%m',d.dispatched_at)='" + month + "' LEFT JOIN orders o ON d.order_id=o.id GROUP BY t.id ORDER BY t.id"));
  var threshold = safeNum((rowToObject(dbQuery("SELECT value FROM settings WHERE key='dispatch_threshold'")) || {value:3}).value, 3);
  stats.forEach(function(s) {
    s.is_warning = false;
    stats.forEach(function(x) { if (x.team_id !== s.team_id && s.dispatch_count - x.dispatch_count >= threshold) s.is_warning = true; });
  });
  res.json(stats);
});

// 生产填报（支持分批）
app.post('/api/orders/:id/production', requireRole('team','admin'), function(req, res) {
  var b = req.body;
  var teamId = req.session.user.team_id || 1;
  var ir = b.is_rework ? 1 : 0;
  var bn = b.batch_no || 1;
  var detailsStr = b.item_details ? JSON.stringify(b.item_details).replace(/'/g, "''") : '';
  dbRun("INSERT INTO productions (order_id,team_id,workers,total_produced,item_details,notes,is_rework,batch_no,plan_date) VALUES (" + req.params.id + "," + teamId + ",'" + safe(b.workers||'') + "'," + safeNum(b.total_produced) + ",'" + detailsStr + "','" + safe(b.notes||'') + "'," + ir + "," + bn + ",'" + safe(b.plan_date||'') + "')");
  dbRun("UPDATE orders SET status='produced',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
  addNotif('qc', null, 'production_done', '待质检', '订单生产完成，请安排质检', req.params.id);
  addLog(req.session.user.id, 'production', '生产提交批次' + bn + '总量' + b.total_produced, req.params.id);
  res.json({ success: true });
});

// 生产分批拆分
app.post('/api/production-splits', requireRole('team','supervisor','admin'), function(req, res) {
  var splits = req.body.splits || [];
  splits.forEach(function(s) {
    dbRun("INSERT INTO production_splits (order_id,product_item_id,planned_qty,plan_date,status) VALUES (" + safeNum(req.body.order_id) + "," + safeNum(s.product_item_id) + "," + safeNum(s.planned_qty) + ",'" + safe(s.plan_date||'') + "','pending')");
  });
  res.json({ success: true });
});
app.get('/api/production-splits', requireLogin, function(req, res) {
  var sql = req.query.order_id ? "SELECT ps.*,pi.name as item_name FROM production_splits ps LEFT JOIN product_items pi ON ps.product_item_id=pi.id WHERE ps.order_id=" + safeNum(req.query.order_id) + " ORDER BY ps.id" : "SELECT ps.*,pi.name as item_name FROM production_splits ps LEFT JOIN product_items pi ON ps.product_item_id=pi.id ORDER BY ps.order_id,ps.id";
  res.json(rowsToObjects(dbQuery(sql)));
});
app.put('/api/production-splits/:id', requireRole('team','admin'), function(req, res) {
  var b = req.body;
  dbRun("UPDATE production_splits SET produced_qty=" + safeNum(b.produced_qty) + ",actual_date='" + safe(b.actual_date||'') + "',status='" + safe(b.status) + "' WHERE id=" + req.params.id);
  res.json({ success: true });
});

// 质检（按细项）
app.post('/api/orders/:id/inspection', requireRole('qc'), function(req, res) {
  var body = req.body;
  var items = body.item_inspections || [];
  if (!items.length) return res.json({ success: false, msg: '请填写质检明细' });

  var totalQ = 0, totalUQ = 0;
  items.forEach(function(it) { totalQ += safeNum(it.qualified_qty); totalUQ += safeNum(it.unqualified_qty); });

  var order = rowToObject(dbQuery("SELECT * FROM orders WHERE id=" + req.params.id));
  var result = totalQ >= order.quantity ? 'pass' : 'fail';

  dbRun("INSERT INTO inspections (order_id,production_id,qualified_qty,unqualified_qty,inspector_id,result) VALUES (" + req.params.id + "," + (body.production_id||0) + "," + totalQ + "," + totalUQ + "," + req.session.user.id + ",'" + result + "')");
  var inspId = getLastId();

  items.forEach(function(it) {
    dbRun("INSERT INTO inspection_items (inspection_id,product_item_id,product_item_name,qualified_qty,unqualified_qty,defect_hair,defect_color_mix,defect_edge,defect_whitening,defect_bubble,defect_broken,defect_color_fail,defect_other) VALUES (" + inspId + "," + safeNum(it.product_item_id) + ",'" + safe(it.product_item_name||'') + "'," + safeNum(it.qualified_qty) + "," + safeNum(it.unqualified_qty) + "," + safeNum(it.defect_hair) + "," + safeNum(it.defect_color_mix) + "," + safeNum(it.defect_edge) + "," + safeNum(it.defect_whitening) + "," + safeNum(it.defect_bubble) + "," + safeNum(it.defect_broken) + "," + safeNum(it.defect_color_fail) + ",'" + safe(it.defect_other||'') + "')");
  });

  if (result === 'pass') {
    dbRun("UPDATE orders SET status='qc_passed',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
    addNotif('packaging', null, 'qc_passed', '质检通过待打包', '订单质检通过，请安排打包', req.params.id);
    addNotif('finance', null, 'qc_passed', '质检通过可核算', '订单质检通过，可进行工资核算', req.params.id);
    autoCalcWages(req.params.id, body.production_id);
    // 自动入库
    var itemsPerBox = order.items_per_box || 1;
    var totalBox = Math.ceil(totalQ / itemsPerBox);
    dbRun("INSERT INTO finished_goods (product_id,box_qty,case_qty,production_date) VALUES (" + order.product_id + "," + totalBox + "," + Math.ceil(totalBox/10) + ",'" + new Date().toISOString().slice(0,10) + "')");
  } else {
    dbRun("UPDATE orders SET status='qc_failed',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
    addNotif('clerk', null, 'rework_needed', '订单需补产', '合格数量不足，需补充生产', req.params.id);
    var d = rowToObject(dbQuery("SELECT team_id FROM dispatches WHERE order_id=" + req.params.id));
    if (d) addNotif('team', null, 'rework_needed', '补产通知', '订单需补产，请尽快安排', req.params.id);
  }
  addLog(req.session.user.id, 'inspection', '质检结果:' + result + ',合格' + totalQ + ',不合格' + totalUQ, req.params.id);
  res.json({ success: true, result: result });
});

// 打包（含营养标签、生产日期、自动扣减外包材）
app.post('/api/orders/:id/packaging', requireRole('packaging'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO packagings (order_id,pack_method,pack_date,pack_worker,nutrition_label,production_date) VALUES (" + req.params.id + ",'" + safe(b.pack_method||'') + "','" + safe(b.pack_date||'') + "','" + safe(b.pack_worker||'') + "','" + safe(b.nutrition_label||'') + "','" + safe(b.production_date||'') + "')");
  dbRun("UPDATE orders SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);

  // 自动扣减外包材
  var order = rowToObject(dbQuery("SELECT o.*,p.outer_pack_spec FROM orders o LEFT JOIN products p ON o.product_id=p.id WHERE o.id=" + req.params.id));
  if (order && order.outer_pack_spec) {
    var mats = rowsToObjects(dbQuery("SELECT * FROM outer_pack_materials"));
    mats.forEach(function(m) {
      if (!m.items_per_box) m.items_per_box = 1;
      var deduct = Math.ceil(safeNum(order.quantity) / m.items_per_box);
      var ns = Math.max(0, m.stock_qty - deduct);
      dbRun("UPDATE outer_pack_materials SET stock_qty=" + ns + " WHERE id=" + m.id);
    });
  }

  addLog(req.session.user.id, 'packaging', '打包完成', req.params.id);
  addNotif('clerk', null, 'order_completed', '订单已完成', '订单已完成打包闭环', req.params.id);
  addNotif('finance', null, 'order_completed', '订单已完成', '订单已完成打包闭环', req.params.id);
  res.json({ success: true });
});

// ===== 库存管理 API =====

// 原材料
app.get('/api/raw-materials', requireRole('warehouse','admin','console','supervisor'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM raw_materials ORDER BY id")));
});
app.post('/api/raw-materials', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO raw_materials (name,spec,unit,stock_qty,min_alert) VALUES ('" + safe(b.name) + "','" + safe(b.spec||'') + "','" + safe(b.unit||'个') + "'," + safeNum(b.stock_qty,0) + "," + safeNum(b.min_alert,0) + ")");
  res.json({ success: true });
});
app.put('/api/raw-materials/:id', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  dbRun("UPDATE raw_materials SET name='" + safe(b.name) + "',spec='" + safe(b.spec||'') + "',unit='" + safe(b.unit||'个') + "',stock_qty=" + safeNum(b.stock_qty,0) + ",min_alert=" + safeNum(b.min_alert,0) + " WHERE id=" + req.params.id);
  res.json({ success: true });
});
app.post('/api/raw-materials/issue', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  var mid = safeNum(b.material_id), qty = safeNum(b.quantity);
  var m = rowToObject(dbQuery("SELECT * FROM raw_materials WHERE id=" + mid));
  var sb = m ? m.stock_qty : 0;
  dbRun("INSERT INTO raw_material_issues (material_id,quantity,issued_to_role,issued_to_name,issued_by,notes) VALUES (" + mid + "," + qty + ",'" + safe(b.issued_to_role||'') + "','" + safe(b.issued_to_name||'') + "'," + req.session.user.id + ",'" + safe(b.notes||'') + "')");
  dbRun("UPDATE raw_materials SET stock_qty=stock_qty-" + qty + " WHERE id=" + mid);
  // 台账记录
  dbRun("INSERT INTO inventory_ledger (type,warehouse_type,material_id,material_name,material_spec,quantity,stock_before,stock_after,operator_id,operator_name,recipient,notes) VALUES ('outbound','raw'," + mid + ",'" + safe(m?m.name:'') + "','" + safe(m?m.spec:'') + "'," + qty + "," + sb + "," + Math.max(0,sb-qty) + "," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','" + safe(b.issued_to_name||b.issued_to_role||'') + "','" + safe(b.notes||'') + "')");
  res.json({ success: true });
});

// 内包材
app.get('/api/inner-pack-materials', requireRole('warehouse','admin','console','supervisor','qc'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM inner_pack_materials ORDER BY id")));
});
app.post('/api/inner-pack-materials', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO inner_pack_materials (name,spec,unit,stock_qty) VALUES ('" + safe(b.name) + "','" + safe(b.spec||'') + "','" + safe(b.unit||'个') + "'," + safeNum(b.stock_qty,0) + ")");
  res.json({ success: true });
});
app.put('/api/inner-pack-materials/:id', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  dbRun("UPDATE inner_pack_materials SET name='" + safe(b.name) + "',spec='" + safe(b.spec||'') + "',unit='" + safe(b.unit||'个') + "',stock_qty=" + safeNum(b.stock_qty,0) + " WHERE id=" + req.params.id);
  res.json({ success: true });
});
app.post('/api/inner-pack-materials/issue', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  var mid = safeNum(b.material_id), qty = safeNum(b.quantity);
  var m = rowToObject(dbQuery("SELECT * FROM inner_pack_materials WHERE id=" + mid));
  var sb = m ? m.stock_qty : 0;
  dbRun("INSERT INTO inner_pack_issues (material_id,quantity,issued_to_team_id,issued_by) VALUES (" + mid + "," + qty + "," + safeNum(b.issued_to_team_id) + "," + req.session.user.id + ")");
  dbRun("UPDATE inner_pack_materials SET stock_qty=stock_qty-" + qty + " WHERE id=" + mid);
  dbRun("INSERT INTO inventory_ledger (type,warehouse_type,material_id,material_name,material_spec,quantity,stock_before,stock_after,operator_id,operator_name,notes) VALUES ('outbound','inner'," + mid + ",'" + safe(m?m.name:'') + "','" + safe(m?m.spec:'') + "'," + qty + "," + sb + "," + Math.max(0,sb-qty) + "," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','领用出库')");
  res.json({ success: true });
});

// 外包材
app.get('/api/outer-pack-materials', requireRole('warehouse','admin','console','packaging'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM outer_pack_materials ORDER BY id")));
});
app.post('/api/outer-pack-materials', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO outer_pack_materials (name,spec,unit,stock_qty,items_per_box,box_type) VALUES ('" + safe(b.name) + "','" + safe(b.spec||'') + "','" + safe(b.unit||'个') + "'," + safeNum(b.stock_qty,0) + "," + safeNum(b.items_per_box,0) + ",'" + safe(b.box_type||'') + "')");
  res.json({ success: true });
});
app.put('/api/outer-pack-materials/:id', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  dbRun("UPDATE outer_pack_materials SET name='" + safe(b.name) + "',spec='" + safe(b.spec||'') + "',unit='" + safe(b.unit||'个') + "',stock_qty=" + safeNum(b.stock_qty,0) + ",items_per_box=" + safeNum(b.items_per_box,0) + ",box_type='" + safe(b.box_type||'') + "' WHERE id=" + req.params.id);
  res.json({ success: true });
});

// 成品仓库
app.get('/api/finished-goods', requireRole('warehouse','admin','console'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT fg.*,p.name as product_name,p.items_per_box FROM finished_goods fg LEFT JOIN products p ON fg.product_id=p.id ORDER BY fg.id DESC")));
});
app.post('/api/finished-goods', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO finished_goods (product_id,box_qty,case_qty,production_date,location) VALUES (" + safeNum(b.product_id) + "," + safeNum(b.box_qty) + "," + safeNum(b.case_qty) + ",'" + safe(b.production_date||'') + "','" + safe(b.location||'') + "')");
  res.json({ success: true });
});

// 出库管理
app.get('/api/outbound-orders', requireRole('warehouse','admin','console'), function(req, res) {
  var orders = rowsToObjects(dbQuery("SELECT oo.*,c.name as customer_name FROM outbound_orders oo LEFT JOIN customers c ON oo.customer_id=c.id ORDER BY oo.id DESC"));
  orders.forEach(function(o) { o.items = rowsToObjects(dbQuery("SELECT * FROM outbound_items WHERE outbound_id=" + o.id)); });
  res.json(orders);
});
app.post('/api/outbound-orders', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  var cnt = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM outbound_orders"))[0].c + 1;
  var obNo = 'CK' + String(cnt).padStart(6,'0');
  dbRun("INSERT INTO outbound_orders (outbound_no,customer_id,outbound_date,recipient,address,logistics,vehicle_plate,created_by) VALUES ('" + obNo + "'," + safeNum(b.customer_id) + ",'" + safe(b.outbound_date||'') + "','" + safe(b.recipient||'') + "','" + safe(b.address||'') + "','" + safe(b.logistics||'') + "','" + safe(b.vehicle_plate||'') + "'," + req.session.user.id + ")");
  var oid = getLastId();
  (b.items||[]).forEach(function(it) {
    dbRun("INSERT INTO outbound_items (outbound_id,finished_goods_id,product_name,box_qty,case_qty) VALUES (" + oid + "," + safeNum(it.finished_goods_id) + ",'" + safe(it.product_name||'') + "'," + safeNum(it.box_qty) + "," + safeNum(it.case_qty) + ")");
    var fg = rowToObject(dbQuery("SELECT * FROM finished_goods WHERE id=" + safeNum(it.finished_goods_id)));
    if (fg) dbRun("UPDATE finished_goods SET box_qty=box_qty-" + safeNum(it.box_qty) + ",case_qty=case_qty-" + safeNum(it.case_qty) + " WHERE id=" + fg.id);
  });
  res.json({ success: true, id: oid, outbound_no: obNo });
});
app.post('/api/outbound-orders/:id/images', upload.array('images',5), requireRole('warehouse','admin'), function(req, res) {
  var ex = rowToObject(dbQuery("SELECT images FROM outbound_orders WHERE id=" + req.params.id));
  var imgs = ex && ex.images ? JSON.parse(ex.images||'[]') : [];
  (req.files||[]).forEach(function(f) { imgs.push('/uploads/' + f.filename); });
  dbRun("UPDATE outbound_orders SET images='" + JSON.stringify(imgs).replace(/'/g, "''") + "' WHERE id=" + req.params.id);
  res.json({ success: true, images: imgs });
});

// 统计总览
app.get('/api/stats/overview', requireLogin, function(req, res) {
  var uid = req.session.user.id, role = req.session.user.role;
  var result = {};
  // 总订单数
  var r1 = dbQuery("SELECT COUNT(*) as c FROM orders");
  if (r1[0]) result.total = r1[0].values[0][0];
  // 待派单
  var r2 = dbQuery("SELECT COUNT(*) as c FROM orders WHERE status='pending'");
  if (r2[0]) result.pending = r2[0].values[0][0];
  // 生产中
  var r3 = dbQuery("SELECT COUNT(*) as c FROM orders WHERE status='producing'");
  if (r3[0]) result.producing = r3[0].values[0][0];
  // 已完工
  var r4 = dbQuery("SELECT COUNT(*) as c FROM orders WHERE status='completed'");
  if (r4[0]) result.completed = r4[0].values[0][0];
  // 质检中
  var r5 = dbQuery("SELECT COUNT(*) as c FROM orders WHERE status='inspecting'");
  if (r5[0]) result.inspecting = r5[0].values[0][0];
  res.json(result);
});

// 不良品统计
app.get('/api/stats/defect', requireLogin, function(req, res) {
  var r = { hair: 0, color_mix: 0, edge: 0, whitening: 0, bubble: 0, broken: 0, color_fail: 0 };
  var items = rowsToObjects(dbQuery("SELECT reason,SUM(inspect_qty) as qty FROM inspection_items GROUP BY reason"));
  items.forEach(function(it) { r[it.reason] = (r[it.reason]||0) + (it.qty||0); });
  res.json(r);
});

// 班组产量统计
app.get('/api/stats/production', requireLogin, function(req, res) {
  var teams = rowsToObjects(dbQuery("SELECT id,name FROM teams ORDER BY id"));
  var result = [];
  teams.forEach(function(t) {
    var r = rowToObject(dbQuery("SELECT COUNT(DISTINCT d.order_id) as order_count,SUM(p.produced_qty) as total_produced FROM dispatches d LEFT JOIN productions p ON d.order_id=p.order_id WHERE d.team_id=" + t.id));
    result.push({ team_name: t.name, order_count: (r&&r.order_count)||0, total_produced: (r&&r.total_produced)||0 });
  });
  res.json(result);
});

// 通知
app.get('/api/notifications', requireLogin, function(req, res) {
  var uid = req.session.user.id, role = req.session.user.role;
  res.json(rowsToObjects(dbQuery("SELECT * FROM notifications WHERE (user_id=" + uid + " OR role='" + role + "') AND is_read=0 ORDER BY id DESC")));
});
app.post('/api/notifications/:id/read', requireLogin, function(req, res) {
  dbRun("UPDATE notifications SET is_read=1 WHERE id=" + req.params.id);
  res.json({ success: true });
});

// 计件工价
app.get('/api/piece-prices', requireLogin, function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT pp.*,pi.name as item_name,p.name as product_name FROM piece_prices pp LEFT JOIN product_items pi ON pp.product_item_id=pi.id LEFT JOIN products p ON pi.product_id=p.id ORDER BY p.id,pi.sort_order")));
});
app.post('/api/piece-prices', requireRole('admin','finance'), function(req, res) {
  var b = req.body;
  var ex = rowToObject(dbQuery("SELECT id FROM piece_prices WHERE product_item_id=" + safeNum(b.product_item_id)));
  if (ex) {
    dbRun("UPDATE piece_prices SET price_per_unit=" + parseFloat(b.price_per_unit) + ",updated_at=CURRENT_TIMESTAMP WHERE id=" + ex.id);
  } else {
    dbRun("INSERT INTO piece_prices (product_item_id,price_per_unit) VALUES (" + safeNum(b.product_item_id) + "," + parseFloat(b.price_per_unit) + ")");
  }
  res.json({ success: true });
});

// 工资
app.get('/api/wages', requireRole('admin','finance','console'), function(req, res) {
  var sql = "SELECT wr.*,o.order_no,c.name as customer_name FROM wage_records wr LEFT JOIN orders o ON wr.order_id=o.id LEFT JOIN customers c ON o.customer_id=c.id WHERE 1=1";
  if (req.query.period) sql += " AND wr.period='" + safe(req.query.period) + "'";
  if (req.query.worker_name) sql += " AND wr.team_member_name LIKE '%" + safe(req.query.worker_name) + "%'";
  sql += " ORDER BY wr.team_member_name,wr.order_id";
  res.json(rowsToObjects(dbQuery(sql)));
});
app.get('/api/wages/summary', requireRole('admin','finance','console'), function(req, res) {
  var now = new Date();
  var p = req.query.period || (now.getFullYear() + '-' + ('0'+(now.getMonth()+1)).slice(-2));
  res.json(rowsToObjects(dbQuery("SELECT team_member_name,COUNT(DISTINCT order_id) as order_count,SUM(qualified_qty) as total_qualified,SUM(wage_amount) as total_wage,period FROM wage_records WHERE period='" + p + "' GROUP BY team_member_name ORDER BY total_wage DESC")));
});

// 设置
app.get('/api/settings', requireRole('admin','console','finance'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM settings")));
});
app.put('/api/settings/:key', requireRole('admin'), function(req, res) {
  dbRun("INSERT OR REPLACE INTO settings (key,value) VALUES ('" + safe(req.params.key) + "','" + safe(req.body.value||'') + "')");
  res.json({ success: true });
});

// ===== 供应商管理 API =====
app.get('/api/suppliers', requireRole('warehouse_admin','procurement','admin'), function(req, res) {
  var suppliers = rowsToObjects(dbQuery("SELECT * FROM suppliers ORDER BY id"));
  suppliers.forEach(function(s) {
    s.certificates = rowsToObjects(dbQuery("SELECT * FROM supplier_certificates WHERE supplier_id=" + s.id + " ORDER BY cert_type,created_at DESC"));
  });
  res.json(suppliers);
});
app.post('/api/suppliers', requireRole('warehouse_admin','procurement','admin'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO suppliers (name,contact_person,phone,address,license_no,production_permit_no,food_permit_no) VALUES ('" + safe(b.name) + "','" + safe(b.contact_person||'') + "','" + safe(b.phone||'') + "','" + safe(b.address||'') + "','" + safe(b.license_no||'') + "','" + safe(b.production_permit_no||'') + "','" + safe(b.food_permit_no||'') + "')");
  res.json({ success: true, id: getLastId() });
});
app.put('/api/suppliers/:id', requireRole('warehouse_admin','procurement','admin'), function(req, res) {
  var b = req.body;
  dbRun("UPDATE suppliers SET name='" + safe(b.name) + "',contact_person='" + safe(b.contact_person||'') + "',phone='" + safe(b.phone||'') + "',address='" + safe(b.address||'') + "',license_no='" + safe(b.license_no||'') + "',production_permit_no='" + safe(b.production_permit_no||'') + "',food_permit_no='" + safe(b.food_permit_no||'') + "',status='" + safe(b.status||'active') + "',notes='" + safe(b.notes||'') + "',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
  res.json({ success: true });
});

app.get('/api/suppliers/:id/certificates', requireRole('warehouse_admin','procurement','admin'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM supplier_certificates WHERE supplier_id=" + req.params.id + " ORDER BY cert_type,created_at DESC")));
});
app.post('/api/suppliers/:id/certificates', upload.single('file'), requireRole('warehouse_admin','procurement','admin'), function(req, res) {
  var b = req.body, ic = b.is_core ? 1 : 0;
  var url = req.file ? '/uploads/' + req.file.filename : '';
  dbRun("INSERT INTO supplier_certificates (supplier_id,cert_type,cert_number,issue_date,expiry_date,file_url,file_name,is_core) VALUES (" + req.params.id + ",'" + safe(b.cert_type) + "','" + safe(b.cert_number||'') + "','" + safe(b.issue_date||'') + "','" + safe(b.expiry_date||'') + "','" + url + "','" + safe(b.file_name||'') + "'," + ic + ")");
  res.json({ success: true });
});
app.delete('/api/supplier-certificates/:id', requireRole('warehouse_admin','procurement','admin'), function(req, res) {
  dbRun("UPDATE supplier_certificates SET status='archived' WHERE id=" + req.params.id);
  res.json({ success: true });
});

// ===== 采购管理 API =====
app.get('/api/procurement-orders', requireLogin, function(req, res) {
  var sql = "SELECT po.*,s.name as supplier_name FROM procurement_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id WHERE 1=1";
  if (req.query.status) sql += " AND po.status='" + safe(req.query.status) + "'";
  if (req.query.priority) sql += " AND po.priority='" + safe(req.query.priority) + "'";
  if (req.query.material_type) sql += " AND po.material_type='" + safe(req.query.material_type) + "'";
  sql += " ORDER BY CASE po.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 WHEN 'backup' THEN 2 END, po.created_at ASC";
  res.json(rowsToObjects(dbQuery(sql)));
});
app.get('/api/procurement-orders/:id', requireLogin, function(req, res) {
  var order = rowToObject(dbQuery("SELECT po.*,s.name as supplier_name FROM procurement_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=" + req.params.id));
  if (order) {
    order.alerts = rowsToObjects(dbQuery("SELECT * FROM procurement_alerts WHERE proc_order_id=" + order.id + " ORDER BY created_at DESC"));
    order.logs = rowsToObjects(dbQuery("SELECT pol.*,u.real_name as operator_name FROM procurement_operation_logs pol LEFT JOIN users u ON pol.operator_id=u.id WHERE pol.proc_order_id=" + order.id + " ORDER BY pol.created_at DESC"));
    order.reports = rowsToObjects(dbQuery("SELECT * FROM arrival_inspection_reports WHERE proc_order_id=" + order.id));
    if (order.original_proc_order_id) {
      order.original = rowToObject(dbQuery("SELECT order_no FROM procurement_orders WHERE id=" + order.original_proc_order_id));
    }
  }
  res.json(order || { error: '采购单不存在' });
});

app.post('/api/procurement-orders', requireRole('warehouse','warehouse_admin','admin'), function(req, res) {
  var b = req.body;
  var cnt = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM procurement_orders"))[0].c + 1;
  var orderNo = 'CG' + String(cnt).padStart(6, '0');
  var ed = b.expected_date || '';
  if (!ed && b.priority !== 'backup') {
    var leadDays = parseInt((rowToObject(dbQuery("SELECT value FROM settings WHERE key='procurement_lead_days'")) || {value:'4'}).value) || 4;
    var d = new Date(); d.setDate(d.getDate() + leadDays);
    ed = d.toISOString().slice(0, 10);
  }
  dbRun("INSERT INTO procurement_orders (order_no,material_type,material_id,material_name,material_spec,current_stock,min_alert,apply_qty,suggested_qty,priority,trigger_reason,expected_date,applicant_id,notes) VALUES ('" + orderNo + "','" + safe(b.material_type) + "'," + safeNum(b.material_id) + ",'" + safe(b.material_name) + "','" + safe(b.material_spec||'') + "'," + safeNum(b.current_stock) + "," + safeNum(b.min_alert) + "," + safeNum(b.apply_qty) + "," + safeNum(b.suggested_qty) + ",'" + safe(b.priority||'normal') + "','" + safe(b.trigger_reason||'') + "','" + ed + "'," + req.session.user.id + ",'" + safe(b.notes||'') + "')");
  var oid = getLastId();
  if (b.priority === 'urgent') {
    addNotif('warehouse_admin', null, 'procurement_urgent', '紧急采购: ' + b.material_name, '采购单' + orderNo + '已自动生成并审批，关联订单可能受影响');
    addNotif('clerk', null, 'procurement_urgent', '紧急采购: ' + b.material_name, '采购单' + orderNo + '已生成');
  }
  res.json({ success: true, id: oid, order_no: orderNo });
});

app.put('/api/procurement-orders/:id/status', requireRole('warehouse_admin','admin'), function(req, res) {
  var order = rowToObject(dbQuery("SELECT * FROM procurement_orders WHERE id=" + req.params.id));
  var uid = req.session.user.id, role = req.session.user.role;
  var ns = req.body.status, reason = safe(req.body.reason||'');
  var oldStatus = order.status;
  if (ns === 'rejected') {
    if (!req.body.reason) return res.json({ success: false, msg: '驳回必须填写原因' });
    dbRun("UPDATE procurement_orders SET status='rejected',reject_reason='" + safe(req.body.reason) + "' WHERE id=" + req.params.id);
    if (order.priority === 'urgent') {
      addNotif(null, null, 'procurement_rejected', '紧急采购被驳回: ' + order.material_name, '采购单' + order.order_no + '被驳回。原因：' + req.body.reason);
      addNotif('clerk', null, 'procurement_rejected', '紧急采购被驳回: ' + order.material_name, '采购单' + order.order_no + '被驳回');
    }
  } else if (ns === 'approved') {
    dbRun("UPDATE procurement_orders SET status='approved',supplier_id=" + safeNum(req.body.supplier_id,0) + " WHERE id=" + req.params.id);
  } else if (ns === 'ordered') {
    dbRun("UPDATE procurement_orders SET status='ordered' WHERE id=" + req.params.id);
  } else if (ns === 'supplier_reject') {
    if (!req.body.reason) return res.json({ success: false, msg: '拒单必须填写原因' });
    dbRun("UPDATE procurement_orders SET status='supplier_reject',supplier_reject_reason='" + safe(req.body.reason) + "' WHERE id=" + req.params.id);
    // 自动创建新采购单
    var newQty = order.apply_qty - (order.remaining_qty || 0) || order.apply_qty;
    var cnt2 = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM procurement_orders"))[0].c + 1;
    var newNo = 'CG' + String(cnt2).padStart(6, '0');
    dbRun("INSERT INTO procurement_orders (order_no,material_type,material_id,material_name,material_spec,current_stock,min_alert,apply_qty,priority,trigger_reason,expected_date,applicant_id,original_proc_order_id,notes) VALUES ('" + newNo + "','" + order.material_type + "'," + order.material_id + ",'" + safe(order.material_name) + "','" + safe(order.material_spec||'') + "'," + order.current_stock + "," + order.min_alert + "," + newQty + ",'" + order.priority + "','原供应商拒单，重新选供应商','" + (order.expected_date||'') + "'," + req.session.user.id + "," + order.id + ",'原采购单" + order.order_no + "供应商拒单')");
    addNotif('warehouse_admin', null, order.priority === 'urgent' ? 'procurement_urgent' : 'procurement_supplier_reject', '供应商拒单: ' + order.material_name, '供应商' + (order.supplier_name||'') + '拒单，已创建新采购单' + newNo);
  } else if (ns === 'cancelled') {
    dbRun("UPDATE procurement_orders SET status='cancelled',notes=COALESCE(notes||', ','')||'取消原因: " + reason + "' WHERE id=" + req.params.id);
  } else {
    dbRun("UPDATE procurement_orders SET status='" + safe(ns) + "' WHERE id=" + req.params.id);
  }
  dbRun("INSERT INTO procurement_operation_logs (proc_order_id,operator_id,operator_role,action,reason,old_status,new_status) VALUES (" + req.params.id + "," + uid + ",'" + role + "','" + (ns === 'rejected' ? 'reject' : ns === 'approved' ? 'approve' : ns === 'ordered' ? 'order' : ns === 'supplier_reject' ? 'supplier_reject' : ns === 'cancelled' ? 'cancel' : 'status_change') + "','" + reason + "','" + (oldStatus||'') + "','" + ns + "')");
  res.json({ success: true });
});

// 到货确认
app.post('/api/procurement-orders/:id/arrive', requireRole('warehouse','warehouse_admin','admin'), function(req, res) {
  var b = req.body, uid = req.session.user.id;
  var order = rowToObject(dbQuery("SELECT * FROM procurement_orders WHERE id=" + req.params.id));
  if (!order) return res.json({ success: false, msg: '采购单不存在' });
  var actualQty = safeNum(b.actual_qty, order.apply_qty);
  var conclusion = b.conclusion || 'pass';
  // 入库
  var matTable = order.material_type === 'raw' ? 'raw_materials' : order.material_type === 'inner' ? 'inner_pack_materials' : 'outer_pack_materials';
  dbRun("UPDATE " + matTable + " SET stock_qty=stock_qty+" + actualQty + " WHERE id=" + order.material_id);
  // 自检报告
  dbRun("INSERT INTO arrival_inspection_reports (proc_order_id,supplier_id,report_number,report_date,batch_number,inspector,conclusion,notes) VALUES (" + req.params.id + "," + (order.supplier_id||0) + ",'" + safe(b.report_number||'') + "','" + safe(b.report_date||'') + "','" + safe(b.batch_number||'') + "','" + safe(b.inspector||'') + "','" + safe(conclusion) + "','" + safe(b.notes||'') + "')");
  if (actualQty < order.apply_qty) {
    // 部分到货
    var diff = order.apply_qty - actualQty;
    dbRun("UPDATE procurement_orders SET status='partial_arrived',remaining_qty=" + diff + ",diff_notes='" + safe(b.diff_notes||'') + "',arrived_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
    var cnt3 = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM procurement_orders"))[0].c + 1;
    var dn = 'CG' + String(cnt3).padStart(6, '0');
    dbRun("INSERT INTO procurement_orders (order_no,material_type,material_id,material_name,material_spec,current_stock,min_alert,apply_qty,priority,trigger_reason,expected_date,applicant_id,original_proc_order_id,notes) VALUES ('" + dn + "','" + order.material_type + "'," + order.material_id + ",'" + safe(order.material_name) + "','" + safe(order.material_spec||'') + "'," + (order.current_stock + actualQty) + "," + order.min_alert + "," + diff + ",'" + order.priority + "','原采购单" + order.order_no + "部分到货差异补单','" + (order.expected_date||'') + "'," + uid + "," + order.id + ",'差异原因: " + safe(b.diff_notes||'') + "')");
    addNotif('warehouse_admin', null, 'procurement_diff', '到货差异: ' + order.material_name, '采购单' + order.order_no + '部分到货' + actualQty + '/' + order.apply_qty);
  } else if (conclusion === 'fail') {
    var failReason = b.inspection_fail_reason || '';
    dbRun("UPDATE procurement_orders SET status='inspection_fail',inspection_fail_reason='" + safe(failReason) + "' WHERE id=" + req.params.id);
    addNotif('warehouse_admin', null, 'procurement_inspect_fail', '自检不合格: ' + order.material_name, '采购单' + order.order_no + '自检不合格。原因：' + failReason);
    if (order.priority === 'urgent' && order.related_order_id) {
      addNotif('supervisor', null, 'procurement_inspect_fail', '紧急物料自检不合格影响生产', '物料' + order.material_name + '自检不合格，关联生产订单可能受影响');
    }
  } else {
    dbRun("UPDATE procurement_orders SET status='arrived',arrived_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
    if (order.priority === 'urgent') {
      addNotif('clerk', null, 'order_completed', '紧急物料已到货: ' + order.material_name, '采购单' + order.order_no + '已到货入库，新增库存' + actualQty);
    }
  }
  dbRun("INSERT INTO procurement_operation_logs (proc_order_id,operator_id,operator_role,action,old_status,new_status) VALUES (" + req.params.id + "," + uid + ",'" + req.session.user.role + "','arrive','" + order.status + "','" + (conclusion === 'fail' ? 'inspection_fail' : (actualQty < order.apply_qty ? 'partial_arrived' : 'arrived')) + "')");
  res.json({ success: true });
});

// 采购统计
app.get('/api/procurement-stats', requireRole('warehouse_admin','procurement','admin','console'), function(req, res) {
  var stats = {};
  ['pending','approved','ordered','arrived','partial_arrived','supplier_reject','inspection_fail','cancelled'].forEach(function(s) {
    var r = rowToObject(dbQuery("SELECT COUNT(*) as c FROM procurement_orders WHERE status='" + s + "'"));
    stats[s] = r ? r.c : 0;
  });
  ['urgent','normal','backup'].forEach(function(p) {
    var r = rowToObject(dbQuery("SELECT COUNT(*) as c FROM procurement_orders WHERE priority='" + p + "' AND status NOT IN ('arrived','cancelled')"));
    stats[p + '_pending'] = r ? r.c : 0;
  });
  res.json(stats);
});

// 库存低预警自动检查
app.post('/api/inventory/check-low-stock', requireRole('warehouse_admin','admin'), function(req, res) {
  var created = [];
  [{table:'raw_materials',type:'raw'},{table:'inner_pack_materials',type:'inner'},{table:'outer_pack_materials',type:'outer'}].forEach(function(mt) {
    var mats = rowsToObjects(dbQuery("SELECT * FROM " + mt.table + " WHERE stock_qty <= min_alert AND min_alert > 0"));
    mats.forEach(function(m) {
      var exists = rowsToObjects(dbQuery("SELECT id FROM procurement_orders WHERE material_type='" + mt.type + "' AND material_id=" + m.id + " AND status IN ('pending','approved','ordered')"));
      if (exists.length > 0) return; // 去重
      var leadDays = parseInt((rowToObject(dbQuery("SELECT value FROM settings WHERE key='procurement_lead_days'")) || {value:'4'}).value) || 4;
      var d = new Date(); d.setDate(d.getDate() + leadDays);
      var ed = d.toISOString().slice(0, 10);
      var relatedOrders = rowsToObjects(dbQuery("SELECT o.id,o.order_no FROM orders o WHERE o.status IN ('pending','dispatched','producing') LIMIT 1"));
      var priority = relatedOrders.length > 0 ? 'urgent' : 'normal';
      var reason = relatedOrders.length > 0 ? ('库存' + m.stock_qty + '低于预警' + m.min_alert + '，存在在产订单') : ('库存' + m.stock_qty + '低于预警值' + m.min_alert + '，建议补货');
      var suggestedQty = Math.max(m.min_alert * 2, (m.daily_consumption || 0) * 7);
      var cnt4 = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM procurement_orders"))[0].c + 1;
      var on = 'CG' + String(cnt4).padStart(6, '0');
      dbRun("INSERT INTO procurement_orders (order_no,material_type,material_id,material_name,material_spec,current_stock,min_alert,apply_qty,suggested_qty,priority,trigger_reason,expected_date,status,applicant_id) VALUES ('" + on + "','" + mt.type + "'," + m.id + ",'" + safe(m.name) + "','" + safe(m.spec||'') + "'," + (m.stock_qty||0) + "," + (m.min_alert||0) + "," + suggestedQty + "," + suggestedQty + ",'" + priority + "','" + safe(reason) + "','" + ed + "','" + (priority === 'urgent' ? 'approved' : 'pending') + "'," + req.session.user.id + ")");
      if (priority === 'urgent') {
        addNotif('warehouse_admin', null, 'procurement_urgent', '紧急采购: ' + m.name, '库存' + m.stock_qty + '，预警' + m.min_alert + '，已自动生成并审批采购单' + on);
        addNotif('clerk', null, 'procurement_urgent', '紧急采购: ' + m.name, '自动生成采购单' + on);
      } else {
        addNotif('warehouse_admin', null, 'procurement_normal', '常规采购: ' + m.name, '库存不足，已生成采购单' + on);
      }
      created.push({ order_no: on, material: m.name, priority: priority });
    });
  });
  res.json({ success: true, created: created });
});

// ===== 配料模块 API =====
app.get('/api/preparations', requireRole('preparation','supervisor','admin'), function(req, res) {
  var sql = "SELECT p.*,o.order_no,o.product_id,pr.name as product_name FROM preparations p LEFT JOIN orders o ON p.order_id=o.id LEFT JOIN products pr ON o.product_id=pr.id";
  if (req.query.order_id) sql += " WHERE p.order_id=" + safeNum(req.query.order_id);
  sql += " ORDER BY p.created_at DESC";
  var preps = rowsToObjects(dbQuery(sql));
  preps.forEach(function(p) {
    p.items = rowsToObjects(dbQuery("SELECT * FROM preparation_items WHERE prep_id=" + p.id));
  });
  res.json(preps);
});
app.post('/api/preparations', requireRole('preparation','admin'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO preparations (order_id,preparer_id,prep_date,color_target,color_result,notes) VALUES (" + safeNum(b.order_id) + "," + req.session.user.id + ",'" + safe(b.prep_date||'') + "','" + safe(b.color_target||'') + "','" + safe(b.color_result||'') + "','" + safe(b.notes||'') + "')");
  var pid = getLastId();
  (b.items||[]).forEach(function(it) {
    dbRun("INSERT INTO preparation_items (prep_id,material_type,material_id,material_name,usage_grams,notes) VALUES (" + pid + ",'" + safe(it.material_type||'other') + "'," + safeNum(it.material_id) + ",'" + safe(it.material_name||'') + "'," + parseFloat(it.usage_grams||0) + ",'" + safe(it.notes||'') + "')");
    // 库存扣减
    dbRun("UPDATE raw_materials SET stock_qty=stock_qty-" + Math.ceil(parseFloat(it.usage_grams||0)) + " WHERE id=" + safeNum(it.material_id));
    dbRun("INSERT INTO raw_material_issues (material_id,quantity,issued_to_role,issued_to_name,issued_by,notes) VALUES (" + safeNum(it.material_id) + "," + Math.ceil(parseFloat(it.usage_grams||0)) + ",'preparation','" + safe(req.session.user.real_name) + "'," + req.session.user.id + ",'配料领用')");
  });
  addLog(req.session.user.id, 'preparation', '配料完成，订单#' + b.order_id);
  addNotif('team', null, 'new_dispatch', '配料完成可生产', '订单#' + (b.order_id||'') + '配料完成，可开始生产');
  res.json({ success: true, id: pid });
});
app.get('/api/preparations/:id', requireLogin, function(req, res) {
  var prep = rowToObject(dbQuery("SELECT p.*,o.order_no,pr.name as product_name FROM preparations p LEFT JOIN orders o ON p.order_id=o.id LEFT JOIN products pr ON o.product_id=pr.id WHERE p.id=" + req.params.id));
  if (prep) prep.items = rowsToObjects(dbQuery("SELECT * FROM preparation_items WHERE prep_id=" + prep.id));
  res.json(prep || { error: '记录不存在' });
});

// ===== 导出 API（基础实现）=====
app.get('/api/export/orders/:id', requireLogin, function(req, res) {
  var order = rowToObject(dbQuery("SELECT o.*,c.name as customer_name,p.name as product_name FROM orders o LEFT JOIN customers c ON o.customer_id=c.id LEFT JOIN products p ON o.product_id=p.id WHERE o.id=" + req.params.id));
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=order_' + order.order_no + '.csv');
    res.send('单号,客户,产品,数量,状态,创建时间\n' + [order.order_no,order.customer_name,order.product_name,order.quantity,order.status,order.created_at].join(','));
  } else {
    res.json(order);
  }
});

// 物料领料申请（含外包材领料）
app.post('/api/material-requisitions', requireRole('supervisor','admin','qc','packaging'), function(req, res) {
  var b = req.body, type = b.type, mid = safeNum(b.material_id), qty = safeNum(b.quantity);
  if (!mid || !qty) return res.json({ success: false, msg: '请完善信息' });
  var table = type === 'raw' ? 'raw_materials' : type === 'inner' ? 'inner_pack_materials' : type === 'aux' ? 'accessory_inventory' : 'outer_pack_materials';
  var idField = type === 'aux' ? 'accessory_id' : 'id';
  var m = rowToObject(dbQuery("SELECT * FROM " + table + " WHERE " + idField + "=" + mid));
  if (!m) return res.json({ success: false, msg: '物料不存在' });
  var typeLabel = type === 'outer' ? '外包材' : type === 'inner' ? '内包材' : type === 'raw' ? '原材料' : '辅料配件';
  var relatedId = b.order_id ? safeNum(b.order_id) : 'NULL';
  dbRun("INSERT INTO notifications (user_id,role,type,title,content,related_id) VALUES (NULL,'warehouse','material_request','"+typeLabel+"领料申请','订单:"+safe(b.order_no||'-')+" "+safe(b.note||'')+" 物料:"+safe(m.name||'')+" 规格:"+safe(m.spec||'')+" 数量:"+qty+"',"+relatedId+")");
  res.json({ success: true, msg: '领料申请已提交至仓库' });
});

// ===== 统一台账 API =====
app.get('/api/inventory-ledger', requireRole('warehouse','admin','warehouse_admin'), function(req, res) {
  var sql = "SELECT l.* FROM inventory_ledger l WHERE 1=1";
  if (req.query.type) sql += " AND l.type='" + safe(req.query.type) + "'";
  if (req.query.warehouse_type) sql += " AND l.warehouse_type='" + safe(req.query.warehouse_type) + "'";
  if (req.query.date_from) sql += " AND l.created_at >= '" + safe(req.query.date_from) + "'";
  if (req.query.date_to) sql += " AND l.created_at <= '" + safe(req.query.date_to) + " 23:59:59'";
  if (req.query.keyword) {
    var kw = safe(req.query.keyword);
    sql += " AND (l.material_name LIKE '%" + kw + "%' OR l.notes LIKE '%" + kw + "%' OR l.recipient LIKE '%" + kw + "%')";
  }
  sql += " ORDER BY l.created_at DESC LIMIT 200";
  res.json(rowsToObjects(dbQuery(sql)));
});

// ===== 入库记录 API =====
app.get('/api/inbound-records', requireRole('warehouse','admin','warehouse_admin'), function(req, res) {
  var sql = "SELECT ir.*,s.name as supplier_name FROM inbound_records ir LEFT JOIN suppliers s ON ir.supplier_id=s.id WHERE 1=1";
  if (req.query.warehouse_type) sql += " AND ir.warehouse_type='" + safe(req.query.warehouse_type) + "'";
  sql += " ORDER BY ir.created_at DESC LIMIT 100";
  res.json(rowsToObjects(dbQuery(sql)));
});

app.post('/api/inbound-records', requireRole('warehouse','admin','warehouse_admin'), function(req, res) {
  var b = req.body;
  var wt = safe(b.warehouse_type);
  var mid = safeNum(b.material_id), qty = safeNum(b.quantity);
  if (!wt || !mid || !qty) return res.json({ success: false, msg: '请完善入库信息' });

  // 确定物料表和名称
  var matTable = wt === 'raw' ? 'raw_materials' : wt === 'inner' ? 'inner_pack_materials' : wt === 'outer' ? 'outer_pack_materials' : 'auxiliary_materials';
  var idField = 'id';
  var m = rowToObject(dbQuery("SELECT * FROM " + matTable + " WHERE " + idField + "=" + mid));
  if (!m) return res.json({ success: false, msg: '物料不存在' });
  var sb = m.stock_qty || 0;

  // 生成入库单号
  var cnt = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM inbound_records"))[0].c + 1;
  var inNo = 'RK' + String(cnt).padStart(6, '0');

  // 入库
  dbRun("UPDATE " + matTable + " SET stock_qty=stock_qty+" + qty + " WHERE " + idField + "=" + mid);
  
  // 入库记录
  dbRun("INSERT INTO inbound_records (inbound_no,warehouse_type,material_id,material_name,material_spec,quantity,supplier_id,supplier_name,batch_number,production_date,receipt_date,inspector,related_order_id,related_procurement_id,operator_id,notes) VALUES ('" + inNo + "','" + wt + "'," + mid + ",'" + safe(m.name) + "','" + safe(m.spec||'') + "'," + qty + "," + safeNum(b.supplier_id) + ",'" + safe(b.supplier_name||'') + "','" + safe(b.batch_number||'') + "','" + safe(b.production_date||'') + "','" + safe(b.receipt_date||(new Date().toISOString().slice(0,10))) + "','" + safe(b.inspector||'') + "'," + safeNum(b.related_order_id) + "," + safeNum(b.related_procurement_id) + "," + req.session.user.id + ",'" + safe(b.notes||'') + "')");

  // 台账记录
  dbRun("INSERT INTO inventory_ledger (type,warehouse_type,material_id,material_name,material_spec,quantity,stock_before,stock_after,batch_number,operator_id,operator_name,supplier_id,related_order_id,related_procurement_id,notes) VALUES ('inbound','" + wt + "'," + mid + ",'" + safe(m.name) + "','" + safe(m.spec||'') + "'," + qty + "," + sb + "," + (sb+qty) + ",'" + safe(b.batch_number||'') + "'," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "'," + safeNum(b.supplier_id) + "," + safeNum(b.related_order_id) + "," + safeNum(b.related_procurement_id) + ",'入库单号:" + inNo + " " + safe(b.notes||'') + "')");

  res.json({ success: true, inbound_no: inNo });
});

// ===== 外包材领用 API =====
app.post('/api/outer-pack-materials/issue', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  var mid = safeNum(b.material_id), qty = safeNum(b.quantity);
  if (!mid || !qty) return res.json({ success: false, msg: '请完善信息' });
  var m = rowToObject(dbQuery("SELECT * FROM outer_pack_materials WHERE id=" + mid));
  if (!m) return res.json({ success: false, msg: '物料不存在' });
  var sb = m.stock_qty || 0;
  if (sb < qty) return res.json({ success: false, msg: '库存不足，当前库存：' + sb });

  dbRun("INSERT INTO outer_pack_issues (material_id,quantity,issued_to_role,issued_to_name,issued_by,related_order_id,notes) VALUES (" + mid + "," + qty + ",'" + safe(b.issued_to_role||'') + "','" + safe(b.issued_to_name||'') + "'," + req.session.user.id + "," + safeNum(b.related_order_id) + ",'" + safe(b.notes||'') + "')");
  dbRun("UPDATE outer_pack_materials SET stock_qty=stock_qty-" + qty + " WHERE id=" + mid);
  dbRun("INSERT INTO inventory_ledger (type,warehouse_type,material_id,material_name,material_spec,quantity,stock_before,stock_after,operator_id,operator_name,recipient,related_order_id,notes) VALUES ('outbound','outer'," + mid + ",'" + safe(m.name) + "','" + safe(m.spec||'') + "'," + qty + "," + sb + "," + Math.max(0,sb-qty) + "," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','" + safe(b.issued_to_name||b.issued_to_role||'') + "'," + safeNum(b.related_order_id) + ",'" + safe(b.notes||'') + "')");
  res.json({ success: true });
});

// ===== 辅料库 API =====
app.get('/api/auxiliary-materials', requireRole('warehouse','admin','warehouse_admin','supervisor'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM auxiliary_materials ORDER BY id")));
});

app.post('/api/auxiliary-materials', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO auxiliary_materials (name,spec,unit,category,stock_qty,min_alert,location,notes) VALUES ('" + safe(b.name) + "','" + safe(b.spec||'') + "','" + safe(b.unit||'个') + "','" + safe(b.category||'耗材') + "'," + safeNum(b.stock_qty,0) + "," + safeNum(b.min_alert,0) + ",'" + safe(b.location||'') + "','" + safe(b.notes||'') + "')");
  res.json({ success: true });
});

app.put('/api/auxiliary-materials/:id', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  var existing = rowToObject(dbQuery("SELECT * FROM auxiliary_materials WHERE id=" + req.params.id));
  if (!existing) return res.json({ success: false, msg: '物料不存在' });
  dbRun("UPDATE auxiliary_materials SET name='" + safe(b.name||existing.name) + "',spec='" + safe(b.spec!==undefined?b.spec:existing.spec||'') + "',unit='" + safe(b.unit||existing.unit||'个') + "',category='" + safe(b.category||existing.category||'耗材') + "',stock_qty=" + safeNum(b.stock_qty!==undefined?b.stock_qty:existing.stock_qty,0) + ",min_alert=" + safeNum(b.min_alert!==undefined?b.min_alert:existing.min_alert,0) + ",location='" + safe(b.location!==undefined?b.location:existing.location||'') + "',notes='" + safe(b.notes!==undefined?b.notes:existing.notes||'') + "' WHERE id=" + req.params.id);
  res.json({ success: true });
});

app.post('/api/auxiliary-materials/issue', requireRole('warehouse','admin'), function(req, res) {
  var b = req.body;
  var mid = safeNum(b.material_id), qty = safeNum(b.quantity);
  if (!mid || !qty) return res.json({ success: false, msg: '请完善信息' });
  var m = rowToObject(dbQuery("SELECT * FROM auxiliary_materials WHERE id=" + mid));
  if (!m) return res.json({ success: false, msg: '物料不存在' });
  var sb = m.stock_qty || 0;
  if (sb < qty) return res.json({ success: false, msg: '库存不足，当前库存：' + sb });

  dbRun("INSERT INTO auxiliary_material_issues (material_id,quantity,issued_to_role,issued_to_name,issued_by,related_order_id,notes) VALUES (" + mid + "," + qty + ",'" + safe(b.issued_to_role||'') + "','" + safe(b.issued_to_name||'') + "'," + req.session.user.id + "," + safeNum(b.related_order_id) + ",'" + safe(b.notes||'') + "')");
  dbRun("UPDATE auxiliary_materials SET stock_qty=stock_qty-" + qty + " WHERE id=" + mid);
  dbRun("INSERT INTO inventory_ledger (type,warehouse_type,material_id,material_name,material_spec,quantity,stock_before,stock_after,operator_id,operator_name,recipient,related_order_id,notes) VALUES ('outbound','auxiliary'," + mid + ",'" + safe(m.name) + "','" + safe(m.spec||'') + "'," + qty + "," + sb + "," + Math.max(0,sb-qty) + "," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','" + safe(b.issued_to_name||b.issued_to_role||'') + "'," + safeNum(b.related_order_id) + ",'" + safe(b.notes||'') + "')");
  res.json({ success: true });
});

// ===== 采购到货确认（仓库端） =====
app.get('/api/procurement-orders/pending-receiving', requireRole('warehouse','warehouse_admin','admin'), function(req, res) {
  var orders = rowsToObjects(dbQuery("SELECT po.*,s.name as supplier_name FROM procurement_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id WHERE po.status IN ('ordered','partial_arrived') ORDER BY po.priority='urgent' DESC, po.created_at ASC"));
  res.json(orders);
});

app.post('/api/procurement-orders/:id/confirm-receiving', requireRole('warehouse','warehouse_admin','admin'), function(req, res) {
  var b = req.body, uid = req.session.user.id;
  var order = rowToObject(dbQuery("SELECT * FROM procurement_orders WHERE id=" + req.params.id));
  if (!order) return res.json({ success: false, msg: '采购单不存在' });
  if (!['ordered','partial_arrived'].includes(order.status)) return res.json({ success: false, msg: '当前状态不可收货' });

  var actualQty = safeNum(b.actual_qty, order.apply_qty);
  var conclusion = b.conclusion || 'pass';
  var matTable = order.material_type === 'raw' ? 'raw_materials'
    : order.material_type === 'inner' ? 'inner_pack_materials'
    : order.material_type === 'outer' ? 'outer_pack_materials'
    : 'auxiliary_materials';

  // 获取物料当前库存
  var m = rowToObject(dbQuery("SELECT * FROM " + matTable + " WHERE id=" + order.material_id));
  var sb = m ? (m.stock_qty||0) : 0;

  // 入库
  dbRun("UPDATE " + matTable + " SET stock_qty=stock_qty+" + actualQty + " WHERE id=" + order.material_id);

  // 自检报告
  dbRun("INSERT INTO arrival_inspection_reports (proc_order_id,supplier_id,report_number,report_date,batch_number,inspector,conclusion,notes) VALUES (" + req.params.id + "," + (order.supplier_id||0) + ",'" + safe(b.report_number||'') + "','" + safe(b.report_date||'') + "','" + safe(b.batch_number||'') + "','" + safe(b.inspector||'') + "','" + safe(conclusion) + "','" + safe(b.notes||'') + "')");

  // 入库记录
  var cnt = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM inbound_records"))[0].c + 1;
  var inNo = 'RK' + String(cnt).padStart(6, '0');
  dbRun("INSERT INTO inbound_records (inbound_no,warehouse_type,material_id,material_name,material_spec,quantity,supplier_id,supplier_name,batch_number,receipt_date,inspector,related_procurement_id,operator_id,notes) VALUES ('" + inNo + "','" + order.material_type + "'," + order.material_id + ",'" + safe(order.material_name) + "','" + safe(order.material_spec||'') + "'," + actualQty + "," + (order.supplier_id||0) + ",'" + safe(b.supplier_name||'') + "','" + safe(b.batch_number||'') + "','" + safe(b.receipt_date||(new Date().toISOString().slice(0,10))) + "','" + safe(b.inspector||'') + "'," + req.params.id + "," + uid + ",'采购到货: " + order.order_no + " " + safe(b.notes||'') + "')");

  // 台账
  dbRun("INSERT INTO inventory_ledger (type,warehouse_type,material_id,material_name,material_spec,quantity,stock_before,stock_after,batch_number,operator_id,operator_name,supplier_id,related_procurement_id,notes) VALUES ('inbound','" + order.material_type + "'," + order.material_id + ",'" + safe(order.material_name) + "','" + safe(order.material_spec||'') + "'," + actualQty + "," + sb + "," + (sb+actualQty) + ",'" + safe(b.batch_number||'') + "'," + uid + ",'" + safe(req.session.user.real_name||'') + "'," + (order.supplier_id||0) + "," + req.params.id + ",'采购到货确认: " + order.order_no + "')");

  // 更新采购单状态
  var newStatus = actualQty < order.apply_qty ? 'partial_arrived'
    : conclusion === 'fail' ? 'inspection_fail'
    : 'arrived';
  dbRun("UPDATE procurement_orders SET status='" + newStatus + "'" + (newStatus === 'arrived' ? ",arrived_at=CURRENT_TIMESTAMP" : "") + " WHERE id=" + req.params.id);

  // 操作日志
  dbRun("INSERT INTO procurement_operation_logs (proc_order_id,operator_id,operator_role,action,action_detail,old_status,new_status) VALUES (" + req.params.id + "," + uid + ",'" + safe(req.session.user.role) + "','arrive','到货确认 数量:" + actualQty + " 结论:" + conclusion + "','" + safe(order.status) + "','" + newStatus + "')");

  addNotif('warehouse_admin', null, 'procurement_arrived', '采购到货: ' + order.material_name, '采购单' + order.order_no + '已到货，实收' + actualQty + '，入库单号:' + inNo, req.params.id);
  res.json({ success: true, status: newStatus, inbound_no: inNo });
});

// ===== 采购申请 API（全岗位覆盖） =====

// 提交采购申请
app.post('/api/purchase-requests', requireRole('clerk','supervisor','team','qc','packaging','warehouse','warehouse_admin','procurement','admin'), upload.single('image'), function(req, res) {
  var b = req.body;
  if (!b.product_name || !b.quantity) return res.json({ success: false, msg: '请填写产品名称和数量' });
  var cnt = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM purchase_requests"))[0].c + 1;
  var rno = 'CG' + String(cnt).padStart(6, '0');
  var imageUrl = req.file ? '/uploads/' + req.file.filename : (b.image_url || '');
  var dept = b.department || req.session.user.role;
  var priority = b.priority || 'normal';
  if (!['urgent','normal','backup'].includes(priority)) priority = 'normal';

  dbRun("INSERT INTO purchase_requests (request_no,applicant_id,applicant_name,applicant_role,department,product_name,product_color,product_size,product_material,quantity,image_url,priority,status,notes) VALUES ('" + rno + "'," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','" + safe(req.session.user.role) + "','" + safe(dept) + "','" + safe(b.product_name) + "','" + safe(b.product_color||'') + "','" + safe(b.product_size||'') + "','" + safe(b.product_material||'') + "'," + safeNum(b.quantity) + ",'" + safe(imageUrl) + "','" + safe(priority) + "','pending','" + safe(b.notes||'') + "')");

  // 紧急采购自动审批
  var rid = rowsToObjects(dbQuery("SELECT last_insert_rowid() as id"));
  var reqId = rid.length ? rid[0].id : 0;
  if (priority === 'urgent') {
    dbRun("UPDATE purchase_requests SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=" + reqId);
    dbRun("INSERT INTO purchase_request_logs (request_id,operator_id,operator_name,operator_role,action,action_detail,old_status,new_status) VALUES (" + reqId + "," + req.session.user.id + ",'系统','system','auto_approve','紧急采购自动审批通过','pending','approved')");
    addNotif('procurement', null, 'purchase_request', '紧急采购申请: '+safe(b.product_name), '申请单号:'+rno+' 产品:'+safe(b.product_name)+' 数量:'+safeNum(b.quantity)+'（自动审批，请立即处理）', reqId);
  } else if (priority === 'normal') {
    addNotif('admin', null, 'purchase_request', '常规采购审批: '+safe(b.product_name), '申请单号:'+rno+' 提交人:'+safe(req.session.user.real_name||'')+' 产品:'+safe(b.product_name)+' 数量:'+safeNum(b.quantity), reqId);
    addNotif('warehouse_admin', null, 'purchase_request', '常规采购审批: '+safe(b.product_name), '申请单号:'+rno+' 提交人:'+safe(req.session.user.real_name||'')+' 产品:'+safe(b.product_name)+' 数量:'+safeNum(b.quantity), reqId);
  } else {
    addNotif('procurement', null, 'purchase_request', '备用采购申请: '+safe(b.product_name), '申请单号:'+rno+'（排队处理中）', reqId);
  }

  res.json({ success: true, request_no: rno, auto_approved: priority === 'urgent' });
});

// 获取采购申请列表
app.get('/api/purchase-requests', requireRole('admin','procurement','warehouse_admin'), function(req, res) {
  var sql = "SELECT pr.* FROM purchase_requests pr WHERE 1=1";
  if (req.query.status) sql += " AND pr.status='" + safe(req.query.status) + "'";
  if (req.query.priority) sql += " AND pr.priority='" + safe(req.query.priority) + "'";
  if (req.query.keyword) {
    var kw = safe(req.query.keyword);
    sql += " AND (pr.product_name LIKE '%" + kw + "%' OR pr.request_no LIKE '%" + kw + "%' OR pr.applicant_name LIKE '%" + kw + "%')";
  }
  sql += " ORDER BY CASE pr.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, pr.created_at DESC LIMIT 100";
  res.json(rowsToObjects(dbQuery(sql)));
});

// 获取我的采购申请
app.get('/api/purchase-requests/mine', requireLogin, function(req, res) {
  var requests = rowsToObjects(dbQuery("SELECT pr.*,pp.amount as payment_amount,pp.payment_date,pp.voucher_url as payment_voucher,pp.payment_method,pp.notes as payment_notes FROM purchase_requests pr LEFT JOIN purchase_payments pp ON pr.proc_order_id=pp.proc_order_id WHERE pr.applicant_id=" + req.session.user.id + " ORDER BY pr.created_at DESC LIMIT 50"));
  requests.forEach(function(r) {
    r.logs = rowsToObjects(dbQuery("SELECT * FROM purchase_request_logs WHERE request_id=" + r.id + " ORDER BY created_at"));
  });
  res.json(requests);
});

// 审批采购申请
app.put('/api/purchase-requests/:id/approve', requireRole('admin','warehouse_admin'), function(req, res) {
  var r = rowToObject(dbQuery("SELECT * FROM purchase_requests WHERE id=" + req.params.id));
  if (!r) return res.json({ success: false, msg: '申请不存在' });
  if (r.status !== 'pending') return res.json({ success: false, msg: '当前状态不可审批' });
  dbRun("UPDATE purchase_requests SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
  dbRun("INSERT INTO purchase_request_logs (request_id,operator_id,operator_name,operator_role,action,action_detail,old_status,new_status) VALUES (" + req.params.id + "," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','" + safe(req.session.user.role) + "','approve','审批通过','pending','approved')");
  addNotif('procurement', null, 'purchase_request', '采购申请已审批: '+safe(r.product_name), '申请单号:'+safe(r.request_no)+' 请创建采购单', req.params.id);
  if (r.applicant_id) addNotif(null, r.applicant_id, 'purchase_request', '您的采购申请已通过审批', '申请单号:'+safe(r.request_no)+' 产品:'+safe(r.product_name), req.params.id);
  res.json({ success: true });
});

// 驳回采购申请
app.put('/api/purchase-requests/:id/reject', requireRole('admin','warehouse_admin','procurement'), function(req, res) {
  var b = req.body, reason = b.reason || '未填写原因';
  var r = rowToObject(dbQuery("SELECT * FROM purchase_requests WHERE id=" + req.params.id));
  if (!r) return res.json({ success: false, msg: '申请不存在' });
  if (!['pending','approved'].includes(r.status)) return res.json({ success: false, msg: '当前状态不可驳回' });
  dbRun("UPDATE purchase_requests SET status='rejected',rejection_reason='" + safe(reason) + "',rejection_by='" + safe(req.session.user.real_name||'') + "',rejection_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
  dbRun("INSERT INTO purchase_request_logs (request_id,operator_id,operator_name,operator_role,action,action_detail,old_status,new_status) VALUES (" + req.params.id + "," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','" + safe(req.session.user.role) + "','reject','" + safe(reason) + "','" + safe(r.status) + "','rejected')");
  if (r.applicant_id) addNotif(null, r.applicant_id, 'purchase_request', '您的采购申请被驳回', '申请单号:'+safe(r.request_no)+' 产品:'+safe(r.product_name)+' 原因:'+safe(reason), req.params.id);
  res.json({ success: true });
});

// 重新提交被驳回的申请
app.put('/api/purchase-requests/:id/resubmit', requireRole('clerk','supervisor','team','qc','packaging','warehouse','procurement','admin'), function(req, res) {
  var b = req.body;
  var r = rowToObject(dbQuery("SELECT * FROM purchase_requests WHERE id=" + req.params.id));
  if (!r) return res.json({ success: false, msg: '申请不存在' });
  if (r.status !== 'rejected') return res.json({ success: false, msg: '只有已驳回的申请可重新提交' });
  var updates = [];
  if (b.product_name) updates.push("product_name='" + safe(b.product_name) + "'");
  if (b.product_color !== undefined) updates.push("product_color='" + safe(b.product_color) + "'");
  if (b.product_size !== undefined) updates.push("product_size='" + safe(b.product_size) + "'");
  if (b.product_material !== undefined) updates.push("product_material='" + safe(b.product_material) + "'");
  if (b.quantity) updates.push("quantity=" + safeNum(b.quantity));
  if (b.notes !== undefined) updates.push("notes='" + safe(b.notes) + "'");
  if (b.priority) updates.push("priority='" + safe(b.priority) + "'");
  updates.push("status='pending'");
  updates.push("rejection_reason=NULL");
  updates.push("rejection_by=NULL");
  updates.push("updated_at=CURRENT_TIMESTAMP");
  dbRun("UPDATE purchase_requests SET " + updates.join(',') + " WHERE id=" + req.params.id);
  dbRun("INSERT INTO purchase_request_logs (request_id,operator_id,operator_name,operator_role,action,action_detail,old_status,new_status) VALUES (" + req.params.id + "," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','" + safe(req.session.user.role) + "','resubmit','修改后重新提交','rejected','pending')");
  addNotif('admin', null, 'purchase_request', '采购申请重新提交: '+safe(b.product_name||r.product_name), '申请单号:'+safe(r.request_no)+' 申请人已修改并重新提交', req.params.id);
  res.json({ success: true });
});

// 转为正式采购单
app.post('/api/purchase-requests/:id/convert', requireRole('procurement','admin'), function(req, res) {
  var b = req.body;
  var r = rowToObject(dbQuery("SELECT * FROM purchase_requests WHERE id=" + req.params.id));
  if (!r) return res.json({ success: false, msg: '申请不存在' });
  if (r.status !== 'approved') return res.json({ success: false, msg: '只有已审批的申请可转为采购单' });

  var cnt = rowsToObjects(dbQuery("SELECT COUNT(*) as c FROM procurement_orders"))[0].c + 1;
  var pno = 'CG' + String(cnt).padStart(6, '0');

  dbRun("INSERT INTO procurement_orders (order_no,material_type,material_id,material_name,material_spec,current_stock,min_alert,apply_qty,suggested_qty,estimated_price,actual_price,priority,status,supplier_id,applicant_id,request_id,contract_url,quote_url,order_date,unit_price,trigger_reason,notes) VALUES ('" + pno + "','raw',0,'" + safe(r.product_name) + "','" + safe(r.product_color||'') + " " + safe(r.product_size||'') + " " + safe(r.product_material||'') + "',0,0," + r.quantity + "," + safeNum(b.suggested_qty||r.quantity) + "," + safeNum(b.estimated_price) + ",NULL,'" + safe(r.priority) + "','pending','" + (b.supplier_id ? safeNum(b.supplier_id) : 'NULL') + "'," + r.applicant_id + "," + r.id + ",'" + safe(b.contract_url||'') + "','" + safe(b.quote_url||'') + "','" + safe(b.order_date||'') + "'," + safeNum(b.unit_price) + ",'采购申请" + safe(r.request_no) + "','" + safe(b.notes||'') + "')");

  var pid = rowsToObjects(dbQuery("SELECT last_insert_rowid() as id"));
  var poId = pid.length ? pid[0].id : 0;

  dbRun("UPDATE purchase_requests SET status='converted',proc_order_id=" + poId + ",updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
  dbRun("INSERT INTO purchase_request_logs (request_id,operator_id,operator_name,operator_role,action,action_detail,old_status,new_status) VALUES (" + req.params.id + "," + req.session.user.id + ",'" + safe(req.session.user.real_name||'') + "','" + safe(req.session.user.role) + "','convert','转为采购单" + pno + "','approved','converted')");
  dbRun("INSERT INTO procurement_operation_logs (proc_order_id,operator_id,operator_role,action,action_detail,old_status,new_status) VALUES (" + poId + "," + req.session.user.id + ",'" + safe(req.session.user.role) + "','create','根据采购申请" + safe(r.request_no) + "创建采购单','','pending')");

  if (r.applicant_id) addNotif(null, r.applicant_id, 'purchase_request', '您的采购申请已生成采购单', '申请单号:'+safe(r.request_no)+' → 采购单号:'+pno, req.params.id);

  res.json({ success: true, procurement_no: pno });
});

// ===== 付款记录 API =====
app.post('/api/procurement-orders/:id/payment', requireRole('procurement','admin'), function(req, res) {
  var b = req.body, poId = req.params.id;
  var order = rowToObject(dbQuery("SELECT * FROM procurement_orders WHERE id=" + poId));
  if (!order) return res.json({ success: false, msg: '采购单不存在' });

  dbRun("INSERT INTO purchase_payments (proc_order_id,request_id,amount,payment_date,payment_method,voucher_url,notes,uploaded_by) VALUES (" + poId + "," + (order.request_id||'NULL') + "," + safeNum(b.amount) + ",'" + safe(b.payment_date||(new Date().toISOString().slice(0,10))) + "','" + safe(b.payment_method||'') + "','" + safe(b.voucher_url||'') + "','" + safe(b.notes||'') + "'," + req.session.user.id + ")");

  dbRun("INSERT INTO procurement_operation_logs (proc_order_id,operator_id,operator_role,action,action_detail,old_status,new_status) VALUES (" + poId + "," + req.session.user.id + ",'" + safe(req.session.user.role) + "','payment','付款" + safeNum(b.amount) + "元 " + safe(b.payment_method||'') + "','" + safe(order.status) + "','" + safe(order.status) + "')");

  // 通知申请人
  if (order.request_id) {
    var req = rowToObject(dbQuery("SELECT * FROM purchase_requests WHERE id=" + order.request_id));
    if (req && req.applicant_id) {
      addNotif(null, req.applicant_id, 'purchase_payment', '采购付款已完成', '采购单'+safe(order.order_no)+' 产品:'+safe(order.material_name)+' 金额:'+safeNum(b.amount)+'元', order.request_id);
    }
  }

  res.json({ success: true });
});

// 获取付款记录
app.get('/api/procurement-orders/:id/payments', requireRole('procurement','admin','warehouse','warehouse_admin','clerk','supervisor'), function(req, res) {
  res.json(rowsToObjects(dbQuery("SELECT * FROM purchase_payments WHERE proc_order_id=" + req.params.id + " ORDER BY created_at DESC")));
});

// ===== 供应商拒单记录 =====
app.post('/api/procurement-orders/:id/supplier-reject', requireRole('procurement','admin'), function(req, res) {
  var b = req.body;
  dbRun("INSERT INTO supplier_rejections (proc_order_id,supplier_id,supplier_name,reason,recorded_by) VALUES (" + req.params.id + "," + safeNum(b.supplier_id) + ",'" + safe(b.supplier_name||'') + "','" + safe(b.reason||'') + "'," + req.session.user.id + ")");
  dbRun("UPDATE procurement_orders SET status='supplier_reject',supplier_reject_reason='" + safe(b.reason||'') + "',updated_at=CURRENT_TIMESTAMP WHERE id=" + req.params.id);
  dbRun("INSERT INTO procurement_operation_logs (proc_order_id,operator_id,operator_role,action,action_detail,old_status,new_status) VALUES (" + req.params.id + "," + req.session.user.id + ",'" + safe(req.session.user.role) + "','supplier_reject','供应商拒单: " + safe(b.reason||'') + "','','supplier_reject')");

  var order = rowToObject(dbQuery("SELECT * FROM procurement_orders WHERE id=" + req.params.id));
  if (order && order.request_id) {
    var req = rowToObject(dbQuery("SELECT * FROM purchase_requests WHERE id=" + order.request_id));
    if (req && req.applicant_id) addNotif(null, req.applicant_id, 'purchase_request', '供应商拒单通知', '采购单'+safe(order.order_no)+' 供应商'+safe(b.supplier_name||'')+'拒单: '+safe(b.reason||''), order.request_id);
  }
  res.json({ success: true });
});

// 获取采购单详细
app.get('/api/procurement-orders/:id/detail', requireRole('procurement','admin','warehouse','warehouse_admin'), function(req, res) {
  var order = rowToObject(dbQuery("SELECT po.*,s.name as supplier_name,s.contact_person,s.phone FROM procurement_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=" + req.params.id));
  if (!order) return res.json({ error: '不存在' });
  order.logs = rowsToObjects(dbQuery("SELECT * FROM procurement_operation_logs WHERE proc_order_id=" + req.params.id + " ORDER BY created_at"));
  order.payments = rowsToObjects(dbQuery("SELECT * FROM purchase_payments WHERE proc_order_id=" + req.params.id + " ORDER BY created_at DESC"));
  order.rejections = rowsToObjects(dbQuery("SELECT * FROM supplier_rejections WHERE proc_order_id=" + req.params.id + " ORDER BY created_at DESC"));
  order.discrepancies = rowsToObjects(dbQuery("SELECT * FROM arrival_discrepancies WHERE proc_order_id=" + req.params.id + " ORDER BY created_at DESC"));
  if (order.request_id) {
    order.request = rowToObject(dbQuery("SELECT * FROM purchase_requests WHERE id=" + order.request_id));
  }
  res.json(order);
});

// ===== 到货差异记录 =====
app.post('/api/procurement-orders/:id/discrepancy', requireRole('warehouse','warehouse_admin','admin'), function(req, res) {
  var b = req.body;
  var order = rowToObject(dbQuery("SELECT * FROM procurement_orders WHERE id=" + req.params.id));
  if (!order) return res.json({ success: false, msg: '采购单不存在' });
  var expected = order.apply_qty, actual = safeNum(b.actual_qty), diff = expected - actual;
  dbRun("INSERT INTO arrival_discrepancies (proc_order_id,expected_qty,actual_qty,diff_qty,diff_reason,recorded_by) VALUES (" + req.params.id + "," + expected + "," + actual + "," + diff + ",'" + safe(b.diff_reason||'') + "'," + req.session.user.id + ")");
  dbRun("INSERT INTO procurement_operation_logs (proc_order_id,operator_id,operator_role,action,action_detail,old_status,new_status) VALUES (" + req.params.id + "," + req.session.user.id + ",'warehouse','discrepancy','到货差异: 预期'+expected+'实收'+actual+' 差异'+diff,'" + safe(order.status) + "','" + safe(order.status) + "')");
  addNotif('procurement', null, 'procurement_discrepancy', '到货数量差异', '采购单'+safe(order.order_no)+' 预期'+expected+'实收'+actual+' 差异'+diff+' 原因:'+safe(b.diff_reason||''), req.params.id);
  res.json({ success: true });
});

// SPA 回退
app.get('{*any}', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动
async function start() {
  db = await initDatabase();
  console.log('巧克力工厂生产管控系统启动！');
  console.log('本机: http://localhost:' + PORT);
  var os = require('os');
  Object.values(os.networkInterfaces()).forEach(function(iface) {
    iface.forEach(function(addr) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log('手机: http://' + addr.address + ':' + PORT);
      }
    });
  });
  console.log('账号: admin/123456, clerk1/123456, supervisor1/123456');
  console.log('      team1/123456, team2/123456, team3/123456');
  console.log('      qc1/123456, pack1/123456, console1/123456');
  console.log('      finance1/123456, warehouse1/123456');
  app.listen(PORT, '0.0.0.0');
}

start();
