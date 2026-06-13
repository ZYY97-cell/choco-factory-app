// ===== app_v3_addon.js - 产品Excel导入 + 班组成员管理优化 =====
// 追加到 index.html 加载

// ===== 产品Excel批量导入 =====

// 渲染产品导入弹窗
window.renderProductImportModal = function() {
  var html = '<div class="modal-overlay" onclick="closeModal()"></div>'
    + '<div class="modal-content">'
    + '<div class="modal-header"><h3>📦 批量导入产品</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>'
    + '<div class="modal-body">'
    + '<div style="margin-bottom:12px;font-size:13px;color:var(--text-secondary);line-height:1.6">'
    + '<div style="font-weight:600;margin-bottom:6px">Excel模板格式（第1行是表头，第2行开始是数据）：</div>'
    + '<div style="background:var(--bg-primary);padding:8px 10px;border-radius:6px;font-size:12px;font-family:monospace">'
    + 'A列：产品名称 *<br>'
    + 'B列：产品明细（子产品名）<br>'
    + 'C列：明细数量<br>'
    + 'D列：色号<br>'
    + 'E列：内包（包装袋）<br>'
    + 'F列：包装袋尺寸<br>'
    + 'G列：内包数量<br>'
    + 'H列：外包（包装盒/外箱）<br>'
    + 'I列：外箱尺寸规格<br>'
    + 'J列：打包方式及顺序<br>'
    + 'K列：外箱尺寸'
    + '</div></div>'
    + '<div class="form-group">'
    + '<label>选择Excel文件（.xlsx / .xls）</label>'
    + '<input type="file" id="product-import-file" accept=".xlsx,.xls" class="form-input">'
    + '</div>'
    + '<button class="btn btn-primary btn-block" onclick="submitProductImport()">开始导入</button>'
    + '</div></div>';
  // 移除旧弹窗
  var old = document.querySelector('.modal-overlay');
  if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
};

// 提交产品导入
window.submitProductImport = async function() {
  var fileInput = document.getElementById('product-import-file');
  if (!fileInput || !fileInput.files[0]) return showToast('请选择Excel文件', 'error');
  var file = fileInput.files[0];
  if (!file.name.match(/\.(xlsx|xls)$/i)) return showToast('请选择 .xlsx 或 .xls 文件', 'error');
  var fd = new FormData();
  fd.append('file', file);
  showToast('正在导入...', 'warning');
  try {
    var resp = await fetch('/api/products/import', { method: 'POST', body: fd });
    var res = await resp.json();
    if (res.success) {
      showToast(res.msg || '导入成功', 'success');
      closeModal();
      navigate('admin');
    } else {
      showToast(res.msg || '导入失败', 'error');
    }
  } catch(e) {
    showToast('导入失败：' + e.message, 'error');
  }
};

// 在管理后台产品档案区块添加导入按钮（通过重写 renderAdmin 的部分）
(function enhanceAdminProductSection() {
  var orig = window.renderAdmin;
  if (!orig) return;
  window.renderAdmin = async function() {
    await orig();
    // 在产品档案区块添加导入按钮
    var section = document.querySelector('.admin-section');
    if (section && section.innerHTML.indexOf('产品档案') !== -1) {
      // 已处理过
      return;
    }
    // 查找产品档案区块并添加按钮
    setTimeout(function() {
      var headers = document.querySelectorAll('.admin-section h3');
      headers.forEach(function(h) {
        if (h.textContent.indexOf('产品档案') !== -1) {
          var section = h.parentElement;
          var btnHtml = '<button class="btn btn-outline btn-sm" onclick="renderProductImportModal()" style="margin-top:8px;width:100%">📦 批量导入产品（Excel）</button>';
          var addDiv = section.querySelector('#inp-new-product');
          if (addDiv) {
            addDiv.parentElement.insertAdjacentHTML('afterend', btnHtml);
          }
        }
      });
    }, 100);
  };
})();

// ===== 班组成员管理优化 =====

// 编辑班组成员弹窗
window.editTeamMember = function(id, name, phone, position, status, teamId) {
  name = decodeURIComponent(name || '');
  phone = decodeURIComponent(phone || '');
  position = decodeURIComponent(position || '');
  var html = '<div class="modal-overlay" onclick="closeModal()"></div>'
    + '<div class="modal-content">'
    + '<div class="modal-header"><h3>编辑成员</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>'
    + '<div class="modal-body">'
    + '<div class="form-group"><label>姓名 *</label><input class="form-input" id="etm-name" value="' + esc(name) + '"></div>'
    + '<div class="form-group"><label>电话</label><input class="form-input" id="etm-phone" value="' + esc(phone) + '"></div>'
    + '<div class="form-group"><label>岗位</label><input class="form-input" id="etm-position" value="' + esc(position) + '" placeholder="如：生产组长、操作工"></div>'
    + '<div class="form-group"><label>状态</label>'
    + '<select class="form-input" id="etm-status">'
    + '<option value="active"' + (status === 'active' ? ' selected' : '') + '>正常</option>'
    + '<option value="inactive"' + (status === 'inactive' ? ' selected' : '') + '>停用</option>'
    + '</select></div>'
    + '<button class="btn btn-primary btn-block" onclick="submitEditTeamMember(' + id + ',' + teamId + ')">保存</button>'
    + '<button class="btn btn-outline btn-block" style="margin-top:8px" onclick="closeModal()">取消</button>'
    + '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
};

// 提交编辑班组成员
window.submitEditTeamMember = async function(id, teamId) {
  var name = document.getElementById('etm-name').value.trim();
  if (!name) return showToast('请输入姓名', 'error');
  var phone = document.getElementById('etm-phone').value.trim();
  var position = document.getElementById('etm-position').value.trim();
  var status = document.getElementById('etm-status').value;
  await API.put('/api/team-members/' + id, { name: name, phone: phone, position: position, status: status });
  showToast('成员信息已更新', 'success');
  closeModal();
  navigate('admin');
};

// 删除班组成员
window.deleteTeamMember = async function(id, name) {
  if (!confirm('确定删除成员「' + name + '」？')) return;
  await API.delete('/api/team-members/' + id);
  showToast('成员已删除', 'success');
  navigate('admin');
};

// 优化 addTeamMember：支持输入电话和岗位
window.addTeamMemberEnhanced = async function(teamId) {
  var name = prompt('请输入成员姓名：');
  if (!name) return;
  var phone = prompt('请输入成员电话（可选）：') || '';
  var position = prompt('请输入成员岗位（可选，如：操作工、组长）：') || '';
  await API.post('/api/teams/' + teamId + '/members', { name: name, phone: phone, position: position });
  showToast('添加成功', 'success');
  navigate('admin');
};

// 重写 addTeamMember 以支持新字段
(function overrideAddTeamMember() {
  var orig = window.addTeamMember;
  window.addTeamMember = function(teamId) {
    window.addTeamMemberEnhanced(teamId);
  };
})();
