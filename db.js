const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'factory.db');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // 确保data目录存在
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  seedData();
  saveDatabase();
  return db;
}

function createTables() {
  // 用户
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('clerk','supervisor','team','qc','packaging','admin','console','finance','warehouse','warehouse_admin','procurement','preparation')),
      real_name TEXT NOT NULL,
      team_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 班组
  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 班组成员
  db.run(`
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
  `);

  // 客户
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 产品（含图片、每箱数量、内外包规格）
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      details TEXT,
      color_code TEXT,
      color_card_image TEXT,
      image_url TEXT,
      inner_pack_spec TEXT,
      inner_pack_qty INTEGER DEFAULT 1,
      outer_pack_spec TEXT,
      items_per_box INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  // 产品图片
  db.run(`
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // 子产品（主产品拆分）
  db.run(`
    CREATE TABLE IF NOT EXISTS product_children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // 产品配件（需要从库存扣减的部件）
  db.run(`
    CREATE TABLE IF NOT EXISTS product_accessories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // 配件库存
  db.run(`
    CREATE TABLE IF NOT EXISTS accessory_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accessory_id INTEGER NOT NULL UNIQUE,
      stock_qty INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (accessory_id) REFERENCES product_accessories(id)
    );
  `);

  // 产品明细项目（细项）
  db.run(`
    CREATE TABLE IF NOT EXISTS product_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // 订单
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','dispatched','producing','produced','inspecting','qc_passed','qc_failed','rework','packaging','completed')),
      is_urgent INTEGER DEFAULT 0,
      deadline TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  // 派单
  db.run(`
    CREATE TABLE IF NOT EXISTS dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      dispatched_by INTEGER NOT NULL,
      dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (dispatched_by) REFERENCES users(id)
    );
  `);

  // 生产（含分批）
  db.run(`
    CREATE TABLE IF NOT EXISTS productions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      workers TEXT,
      total_produced INTEGER DEFAULT 0,
      item_details TEXT,
      notes TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_rework INTEGER DEFAULT 0,
      batch_no INTEGER DEFAULT 1,
      plan_date TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
  `);

  // 生产分批拆分
  db.run(`
    CREATE TABLE IF NOT EXISTS production_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_item_id INTEGER NOT NULL,
      planned_qty INTEGER DEFAULT 0,
      produced_qty INTEGER DEFAULT 0,
      plan_date TEXT,
      actual_date TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','producing','completed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_item_id) REFERENCES product_items(id)
    );
  `);

  // 质检
  db.run(`
    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      production_id INTEGER NOT NULL,
      qualified_qty INTEGER DEFAULT 0,
      unqualified_qty INTEGER DEFAULT 0,
      defect_hair INTEGER DEFAULT 0,
      defect_color_mix INTEGER DEFAULT 0,
      defect_edge INTEGER DEFAULT 0,
      defect_whitening INTEGER DEFAULT 0,
      defect_bubble INTEGER DEFAULT 0,
      defect_broken INTEGER DEFAULT 0,
      defect_color_fail INTEGER DEFAULT 0,
      defect_other TEXT,
      inspector_id INTEGER,
      inspected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      result TEXT CHECK(result IN ('pass','fail')),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (production_id) REFERENCES productions(id),
      FOREIGN KEY (inspector_id) REFERENCES users(id)
    );
  `);

  // 质检细项
  db.run(`
    CREATE TABLE IF NOT EXISTS inspection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inspection_id INTEGER NOT NULL,
      product_item_id INTEGER NOT NULL,
      product_item_name TEXT NOT NULL,
      qualified_qty INTEGER DEFAULT 0,
      unqualified_qty INTEGER DEFAULT 0,
      defect_hair INTEGER DEFAULT 0,
      defect_color_mix INTEGER DEFAULT 0,
      defect_edge INTEGER DEFAULT 0,
      defect_whitening INTEGER DEFAULT 0,
      defect_bubble INTEGER DEFAULT 0,
      defect_broken INTEGER DEFAULT 0,
      defect_color_fail INTEGER DEFAULT 0,
      defect_other TEXT,
      FOREIGN KEY (inspection_id) REFERENCES inspections(id),
      FOREIGN KEY (product_item_id) REFERENCES product_items(id)
    );
  `);

  // 打包（含营养标签、生产日期）
  db.run(`
    CREATE TABLE IF NOT EXISTS packagings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      pack_method TEXT,
      pack_date TEXT,
      pack_worker TEXT,
      nutrition_label TEXT,
      production_date TEXT,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  // 通知
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      role TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      order_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  // 设置
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // 操作日志
  db.run(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 计件工价
  db.run(`
    CREATE TABLE IF NOT EXISTS piece_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_item_id INTEGER NOT NULL,
      price_per_unit REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_item_id) REFERENCES product_items(id)
    );
  `);

  // 工资记录
  db.run(`
    CREATE TABLE IF NOT EXISTS wage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      production_id INTEGER NOT NULL,
      team_member_name TEXT NOT NULL,
      product_item_id INTEGER NOT NULL,
      product_item_name TEXT NOT NULL,
      produced_qty INTEGER DEFAULT 0,
      qualified_qty INTEGER DEFAULT 0,
      price_per_unit REAL DEFAULT 0,
      wage_amount REAL DEFAULT 0,
      period TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (production_id) REFERENCES productions(id)
    );
  `);

  // ===== 库存管理 =====

  // 原材料
  db.run(`
    CREATE TABLE IF NOT EXISTS raw_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      spec TEXT,
      unit TEXT DEFAULT '个',
      stock_qty INTEGER DEFAULT 0,
      min_alert INTEGER DEFAULT 0,
      daily_consumption INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 原材料领用记录
  db.run(`
    CREATE TABLE IF NOT EXISTS raw_material_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      issued_to_role TEXT,
      issued_to_name TEXT,
      issued_by INTEGER,
      notes TEXT,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES raw_materials(id),
      FOREIGN KEY (issued_by) REFERENCES users(id)
    );
  `);

  // 内包材
  db.run(`
    CREATE TABLE IF NOT EXISTS inner_pack_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      spec TEXT,
      unit TEXT DEFAULT '个',
      stock_qty INTEGER DEFAULT 0,
      min_alert INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 内包材领用记录
  db.run(`
    CREATE TABLE IF NOT EXISTS inner_pack_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      issued_to_team_id INTEGER,
      issued_by INTEGER,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES inner_pack_materials(id),
      FOREIGN KEY (issued_to_team_id) REFERENCES teams(id),
      FOREIGN KEY (issued_by) REFERENCES users(id)
    );
  `);

  // 外包材
  db.run(`
    CREATE TABLE IF NOT EXISTS outer_pack_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      spec TEXT,
      unit TEXT DEFAULT '个',
      stock_qty INTEGER DEFAULT 0,
      min_alert INTEGER DEFAULT 0,
      items_per_box INTEGER DEFAULT 1,
      box_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 成品仓库
  db.run(`
    CREATE TABLE IF NOT EXISTS finished_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      box_qty INTEGER DEFAULT 0,
      case_qty INTEGER DEFAULT 0,
      production_date TEXT,
      location TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // 出库单
  db.run(`
    CREATE TABLE IF NOT EXISTS outbound_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outbound_no TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      outbound_date TEXT,
      recipient TEXT,
      address TEXT,
      logistics TEXT,
      vehicle_plate TEXT,
      images TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  // 出库明细
  db.run(`
    CREATE TABLE IF NOT EXISTS outbound_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outbound_id INTEGER NOT NULL,
      finished_goods_id INTEGER,
      product_name TEXT,
      box_qty INTEGER DEFAULT 0,
      case_qty INTEGER DEFAULT 0,
      FOREIGN KEY (outbound_id) REFERENCES outbound_orders(id),
      FOREIGN KEY (finished_goods_id) REFERENCES finished_goods(id)
    );
  `);
  // ===== 采购管理 =====
  db.run(`
    CREATE TABLE IF NOT EXISTS procurement_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      material_type TEXT NOT NULL CHECK(material_type IN ('raw','inner','outer')),
      material_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      material_spec TEXT,
      current_stock INTEGER NOT NULL,
      min_alert INTEGER NOT NULL,
      apply_qty INTEGER NOT NULL,
      suggested_qty INTEGER,
      estimated_price REAL,
      actual_price REAL,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('urgent','normal','backup')),
      trigger_reason TEXT,
      expected_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','ordered','supplier_reject','arrived','partial_arrived','inspection_fail','cancelled')),
      supplier_id INTEGER,
      related_order_id INTEGER,
      original_proc_order_id INTEGER,
      reject_reason TEXT,
      supplier_reject_reason TEXT,
      diff_notes TEXT,
      remaining_qty INTEGER DEFAULT 0,
      inspection_fail_reason TEXT,
      applicant_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      arrived_at DATETIME,
      notes TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (applicant_id) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS procurement_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proc_order_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL CHECK(alert_type IN ('low_stock','arrival_due','overdue')),
      alert_message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proc_order_id) REFERENCES procurement_orders(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS procurement_operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proc_order_id INTEGER NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_role TEXT NOT NULL,
      action TEXT NOT NULL,
      action_detail TEXT,
      reason TEXT,
      old_status TEXT,
      new_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proc_order_id) REFERENCES procurement_orders(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      address TEXT,
      license_no TEXT,
      production_permit_no TEXT,
      food_permit_no TEXT,
      cooperation_score INTEGER DEFAULT 100,
      supply_capacity TEXT,
      payment_terms TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','blacklist')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS supplier_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      cert_type TEXT NOT NULL CHECK(cert_type IN ('business_license','production_permit','food_permit','official_inspection','other')),
      cert_number TEXT,
      issue_date TEXT,
      expiry_date TEXT,
      file_url TEXT,
      file_name TEXT,
      status TEXT DEFAULT 'valid' CHECK(status IN ('valid','expiring','expired','archived')),
      is_core INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS arrival_inspection_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proc_order_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      report_number TEXT,
      report_date TEXT,
      batch_number TEXT,
      inspector TEXT,
      conclusion TEXT CHECK(conclusion IN ('pass','fail','conditional')),
      file_url TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proc_order_id) REFERENCES procurement_orders(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
  `);

  // ===== 配料管理 =====
  db.run(`
    CREATE TABLE IF NOT EXISTS preparations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      dispatch_id INTEGER,
      preparer_id INTEGER NOT NULL,
      prep_date TEXT NOT NULL,
      color_target TEXT,
      color_result TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (preparer_id) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS preparation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prep_id INTEGER NOT NULL,
      material_type TEXT NOT NULL CHECK(material_type IN ('chocolate','colorant','other')),
      material_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      usage_grams REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY (prep_id) REFERENCES preparations(id),
      FOREIGN KEY (material_id) REFERENCES raw_materials(id)
    );
  `);
}

function seedData() {
  // 检查是否已有数据
  const userCount = db.exec("SELECT COUNT(*) FROM users");
  if (userCount[0] && userCount[0].values[0][0] > 0) return;

  const bcrypt = require('bcryptjs');
  const hash = function(pwd) { return bcrypt.hashSync(pwd, 10); };

  // 用户
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('admin', '" + hash('123456') + "', 'admin', '系统管理员')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('clerk1', '" + hash('123456') + "', 'clerk', '文员小王')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('supervisor1', '" + hash('123456') + "', 'supervisor', '组长李明')");
  db.run("INSERT INTO users (username, password, role, real_name, team_id) VALUES ('team1', '" + hash('123456') + "', 'team', '班组1-张三', 1)");
  db.run("INSERT INTO users (username, password, role, real_name, team_id) VALUES ('team2', '" + hash('123456') + "', 'team', '班组2-李四', 2)");
  db.run("INSERT INTO users (username, password, role, real_name, team_id) VALUES ('team3', '" + hash('123456') + "', 'team', '班组3-王五', 3)");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('qc1', '" + hash('123456') + "', 'qc', '质检员赵六')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('pack1', '" + hash('123456') + "', 'packaging', '打包员孙七')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('console1', '" + hash('123456') + "', 'console', '总台监控')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('finance1', '" + hash('123456') + "', 'finance', '财务刘会计')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('warehouse1', '" + hash('123456') + "', 'warehouse', '普通仓管-吴库')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('wh_admin1', '" + hash('123456') + "', 'warehouse_admin', '仓管负责人-周仓')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('procurement1', '" + hash('123456') + "', 'procurement', '采购专员-郑采')");
  db.run("INSERT INTO users (username, password, role, real_name) VALUES ('prep1', '" + hash('123456') + "', 'preparation', '配料员-陈调')");

  // 班组
  db.run("INSERT INTO teams (name) VALUES ('班组1')");
  db.run("INSERT INTO teams (name) VALUES ('班组2')");
  db.run("INSERT INTO teams (name) VALUES ('班组3')");
  db.run("INSERT INTO teams (name) VALUES ('班组4')");

  // 班组成员
  var teams = [1,2,3,4];
  var memberNames = [
    ['张三','刘大','陈二','周八','吴九'],
    ['李四','黄大','杨二','马八','林九'],
    ['王五','赵大','钱二','孙八','郑九'],
    ['冯六','何大','施二','张八','顾九']
  ];
  teams.forEach(function(tid, i) {
    memberNames[i].forEach(function(name) {
      db.run("INSERT INTO team_members (team_id, name) VALUES (" + tid + ", '" + name + "')");
    });
  });

  // 客户
  db.run("INSERT INTO customers (name, contact, notes) VALUES ('八喜', '张经理', '冰淇淋巧克力装饰片主要客户')");
  db.run("INSERT INTO customers (name, contact, notes) VALUES ('广隆', '李经理', '烘焙巧克力定制客户')");
  db.run("INSERT INTO customers (name, contact, notes) VALUES ('德司咖', '王经理', '西点巧克力配件客户')");

  // 产品（含 items_per_box）
  db.run("INSERT INTO products (customer_id, name, details, color_code, inner_pack_spec, outer_pack_spec, items_per_box) VALUES (1, '八喜巧克力装饰片A', '半立体心形装饰片', 'BK-001', 'BOPP袋 15x20cm', '飞机盒 30x20x5cm / 外箱 50x40x30cm', 12)");
  db.run("INSERT INTO products (customer_id, name, details, color_code, inner_pack_spec, outer_pack_spec, items_per_box) VALUES (1, '八喜巧克力装饰片B', '平面卷曲装饰片', 'WH-002', 'BOPP袋 12x18cm', '飞机盒 25x18x5cm / 外箱 50x40x30cm', 10)");
  db.run("INSERT INTO products (customer_id, name, details, color_code, inner_pack_spec, outer_pack_spec, items_per_box) VALUES (2, '广隆芋泥巧克力球', '芋泥夹心巧克力球', 'PP-003', 'BOPP袋 20x25cm', '礼盒 30x20x8cm / 外箱 60x40x35cm', 24)");
  db.run("INSERT INTO products (customer_id, name, details, color_code, inner_pack_spec, outer_pack_spec, items_per_box) VALUES (3, '德司咖巧克力配件C', '3D立体花朵配件', 'DK-004', 'BOPP袋 10x15cm', '飞机盒 20x15x4cm / 外箱 45x35x25cm', 20)");

  // 产品配件（需要扣库存的部件）
  db.run("INSERT INTO product_accessories (product_id, name, sort_order) VALUES (1, '心形模具', 1)");
  db.run("INSERT INTO product_accessories (product_id, name, sort_order) VALUES (1, '金色糖珠', 2)");
  db.run("INSERT INTO product_accessories (product_id, name, sort_order) VALUES (2, '卷曲模具', 1)");
  db.run("INSERT INTO product_accessories (product_id, name, sort_order) VALUES (3, '球形模具', 1)");
  db.run("INSERT INTO product_accessories (product_id, name, sort_order) VALUES (3, '芋泥馅料包', 2)");
  db.run("INSERT INTO product_accessories (product_id, name, sort_order) VALUES (4, '花朵模具', 1)");
  db.run("INSERT INTO product_accessories (product_id, name, sort_order) VALUES (4, '叶片模具', 2)");

  // 配件库存
  db.run("INSERT INTO accessory_inventory (accessory_id, stock_qty) VALUES (1, 500)");
  db.run("INSERT INTO accessory_inventory (accessory_id, stock_qty) VALUES (2, 2000)");
  db.run("INSERT INTO accessory_inventory (accessory_id, stock_qty) VALUES (3, 300)");
  db.run("INSERT INTO accessory_inventory (accessory_id, stock_qty) VALUES (4, 400)");
  db.run("INSERT INTO accessory_inventory (accessory_id, stock_qty) VALUES (5, 1000)");
  db.run("INSERT INTO accessory_inventory (accessory_id, stock_qty) VALUES (6, 350)");
  db.run("INSERT INTO accessory_inventory (accessory_id, stock_qty) VALUES (7, 500)");

  // 产品明细项目
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (1, '心形白巧底片', 1)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (1, '心形黑巧花纹', 2)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (1, '金色点缀', 3)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (2, '卷曲白巧片', 1)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (2, '卷曲黑巧片', 2)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (3, '芋泥馅心', 1)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (3, '巧克力外壳', 2)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (3, '表面涂层', 3)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (4, '花瓣成型', 1)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (4, '花蕊点缀', 2)");
  db.run("INSERT INTO product_items (product_id, name, sort_order) VALUES (4, '叶片配件', 3)");

  // 设置
  db.run("INSERT INTO settings (key, value) VALUES ('dispatch_threshold', '3')");
  db.run("INSERT INTO settings (key, value) VALUES ('order_prefix', 'QK')");
  db.run("INSERT INTO settings (key, value) VALUES ('procurement_lead_days', '4')");
  db.run("INSERT INTO settings (key, value) VALUES ('procurement_cert_expiry_warn', '30')");
  db.run("INSERT INTO settings (key, value) VALUES ('procurement_cert_expired_freq', '7')");
  db.run("INSERT INTO settings (key, value) VALUES ('procurement_auto_qty_ratio', '2')");
  db.run("INSERT INTO settings (key, value) VALUES ('procurement_auto_qty_days', '7')");
  db.run("INSERT INTO settings (key, value) VALUES ('procurement_notif_summary_hour', '9')");

  // 计件工价
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (1, 0.15)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (2, 0.20)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (3, 0.10)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (4, 0.18)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (5, 0.22)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (6, 0.12)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (7, 0.25)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (8, 0.08)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (9, 0.20)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (10, 0.15)");
  db.run("INSERT INTO piece_prices (product_item_id, price_per_unit) VALUES (11, 0.12)");

  // 原材料
  db.run("INSERT INTO raw_materials (name, spec, unit, stock_qty, min_alert) VALUES ('可可液块', '5kg/块', '块', 200, 50)");
  db.run("INSERT INTO raw_materials (name, spec, unit, stock_qty, min_alert) VALUES ('可可脂', '2kg/包', '包', 300, 80)");
  db.run("INSERT INTO raw_materials (name, spec, unit, stock_qty, min_alert) VALUES ('白砂糖', '25kg/袋', '袋', 100, 20)");
  db.run("INSERT INTO raw_materials (name, spec, unit, stock_qty, min_alert) VALUES ('奶粉', '25kg/袋', '袋', 80, 20)");
  db.run("INSERT INTO raw_materials (name, spec, unit, stock_qty, min_alert) VALUES ('芋泥馅料', '5kg/包', '包', 150, 30)");
  db.run("INSERT INTO raw_materials (name, spec, unit, stock_qty, min_alert) VALUES ('食用金色粉', '100g/瓶', '瓶', 50, 10)");

  // 内包材
  db.run("INSERT INTO inner_pack_materials (name, spec, unit, stock_qty) VALUES ('BOPP袋 15x20', '15x20cm透明', '个', 5000)");
  db.run("INSERT INTO inner_pack_materials (name, spec, unit, stock_qty) VALUES ('BOPP袋 12x18', '12x18cm透明', '个', 8000)");
  db.run("INSERT INTO inner_pack_materials (name, spec, unit, stock_qty) VALUES ('BOPP袋 20x25', '20x25cm透明', '个', 3000)");
  db.run("INSERT INTO inner_pack_materials (name, spec, unit, stock_qty) VALUES ('BOPP袋 10x15', '10x15cm透明', '个', 6000)");
  db.run("INSERT INTO inner_pack_materials (name, spec, unit, stock_qty) VALUES ('脱氧剂', '3g小包', '个', 10000)");

  // 外包材
  db.run("INSERT INTO outer_pack_materials (name, spec, unit, stock_qty, items_per_box, box_type) VALUES ('飞机盒 30x20x5', '30x20x5cm牛皮纸', '个', 500, 12, '飞机盒')");
  db.run("INSERT INTO outer_pack_materials (name, spec, unit, stock_qty, items_per_box, box_type) VALUES ('飞机盒 25x18x5', '25x18x5cm牛皮纸', '个', 600, 10, '飞机盒')");
  db.run("INSERT INTO outer_pack_materials (name, spec, unit, stock_qty, items_per_box, box_type) VALUES ('礼盒 30x20x8', '30x20x8cm金色礼盒', '个', 200, 24, '礼盒')");
  db.run("INSERT INTO outer_pack_materials (name, spec, unit, stock_qty, items_per_box, box_type) VALUES ('飞机盒 20x15x4', '20x15x4cm牛皮纸', '个', 400, 20, '飞机盒')");
  db.run("INSERT INTO outer_pack_materials (name, spec, unit, stock_qty, items_per_box, box_type) VALUES ('外箱 50x40x30', '50x40x30cm瓦楞纸箱', '个', 300, 0, '外箱')");
  db.run("INSERT INTO outer_pack_materials (name, spec, unit, stock_qty, items_per_box, box_type) VALUES ('外箱 60x40x35', '60x40x35cm瓦楞纸箱', '个', 150, 0, '外箱')");
  db.run("INSERT INTO outer_pack_materials (name, spec, unit, stock_qty, items_per_box, box_type) VALUES ('外箱 45x35x25', '45x35x25cm瓦楞纸箱', '个', 250, 0, '外箱')");

  // 内包材 + 外包材预警值
  db.run("UPDATE inner_pack_materials SET min_alert = 500");
  db.run("UPDATE inner_pack_materials SET min_alert = 2000 WHERE name = '脱氧剂'");
  db.run("UPDATE outer_pack_materials SET min_alert = 50 WHERE box_type IN ('飞机盒','礼盒')");
  db.run("UPDATE outer_pack_materials SET min_alert = 30 WHERE box_type = '外箱'");

  // 供应商
  db.run("INSERT INTO suppliers (name, contact_person, phone, address, license_no, production_permit_no, food_permit_no) VALUES ('XX食品原料有限公司', '张经理', '13800001111', 'XX省XX市XX区XX路100号', '91110000XXXXXXXXXX', 'SC12345678901234', 'JY12345678901234')");
  db.run("INSERT INTO suppliers (name, contact_person, phone, address, license_no, production_permit_no) VALUES ('YY包装材料厂', '李主管', '13900002222', 'YY省YY市YY区YY路200号', '91120000XXXXXXXXXX', 'SC22345678901234')");
  db.run("INSERT INTO suppliers (name, contact_person, phone, address, license_no) VALUES ('ZZ原料供应商', '王经理', '13700003333', 'ZZ省ZZ市ZZ区ZZ路300号', '91130000XXXXXXXXXX')");

  // 供应商资质
  db.run("INSERT INTO supplier_certificates (supplier_id, cert_type, cert_number, issue_date, expiry_date, status, is_core) VALUES (1, 'business_license', '91110000XXXXXXXXXX', '2024-01-01', '2027-01-01', 'valid', 1)");
  db.run("INSERT INTO supplier_certificates (supplier_id, cert_type, cert_number, issue_date, expiry_date, status, is_core) VALUES (1, 'production_permit', 'SC12345678901234', '2024-01-01', '2027-01-01', 'valid', 1)");
  db.run("INSERT INTO supplier_certificates (supplier_id, cert_type, cert_number, issue_date, expiry_date, status, is_core) VALUES (1, 'food_permit', 'JY12345678901234', '2024-01-01', '2025-12-31', 'expired', 0)");
  db.run("INSERT INTO supplier_certificates (supplier_id, cert_type, cert_number, issue_date, expiry_date, status, is_core) VALUES (1, 'official_inspection', 'GJ-2026-001', '2026-01-15', '2026-12-31', 'valid', 1)");
  db.run("INSERT INTO supplier_certificates (supplier_id, cert_type, cert_number, issue_date, expiry_date, status, is_core) VALUES (2, 'business_license', '91120000XXXXXXXXXX', '2025-03-01', '2028-03-01', 'valid', 1)");
  db.run("INSERT INTO supplier_certificates (supplier_id, cert_type, cert_number, issue_date, expiry_date, status, is_core) VALUES (2, 'production_permit', 'SC22345678901234', '2025-03-01', '2028-03-01', 'valid', 1)");
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb, saveDatabase };
