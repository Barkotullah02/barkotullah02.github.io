/* ============================================================
 * NSUIT Classroom Support — Admin Console
 * Vanilla JS + Supabase. Admin-only; all writes enforced by RLS.
 * ============================================================ */
(function () {
  "use strict";

  const cfg = window.NSUIT_CONFIG;
  const { createClient } = window.supabase;
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---- module state ----
  let me = null;                 // signed-in admin profile
  let profilesCache = [];        // all profiles (name/role lookup)
  let typesCache = [];           // support types
  let unreadCount = 0;
  let currentRoute = "dashboard";
  let notifChannel = null;
  const supportFilters = { member: "", type: "", status: "" };
  let userSearch = "";

  // ---- tiny DOM helpers ----
  const $ = (id) => document.getElementById(id);
  const content = $("content");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  function fmtDate(raw) {
    if (!raw) return "—";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }
  const titleCase = (s) =>
    String(s || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  // A task is late if its deadline passed and it isn't completed/cancelled.
  function isTaskLate(due, status) {
    if (!due || status === "completed" || status === "cancelled") return false;
    const d = new Date(due.length <= 10 ? due + "T23:59:59" : due);
    if (isNaN(d.getTime())) return false;
    return Date.now() > d.getTime();
  }
  const pill = (status) =>
    `<span class="pill pill-${esc(status)}">${esc(titleCase(status))}</span>`;
  const rolePill = (role) =>
    `<span class="pill pill-${role === "admin" ? "admin" : "member"}">${esc(titleCase(role))}</span>`;
  const initial = (name, email) =>
    (name || email || "?").trim().charAt(0).toUpperCase();

  const spinner = () => { content.innerHTML = `<div class="spinner"></div>`; };
  const emptyState = (icon, msg) =>
    `<div class="state"><div class="state-ico">${icon}</div><p>${esc(msg)}</p></div>`;

  function nameOf(id) {
    const p = profilesCache.find((x) => x.id === id);
    return p ? p.full_name || p.email : "Unknown";
  }
  function typeName(id) {
    const t = typesCache.find((x) => x.id === id);
    return t ? t.name : "Unknown";
  }

  // ---- toasts ----
  function toast(title, body) {
    const root = $("toasts");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<strong>${esc(title)}</strong><small>${esc(body || "")}</small>`;
    root.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ---- generic modal ----
  function closeModal() { $("modal-root").innerHTML = ""; }
  function openModal({ title, bodyHTML, confirmText, confirmClass, onConfirm }) {
    const root = $("modal-root");
    root.innerHTML = `
      <div class="modal-backdrop" data-close="1">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>${esc(title)}</h3><button class="x-btn" data-close="1">×</button></div>
          <div class="modal-body">${bodyHTML}<p class="form-error" id="modal-error" hidden></p></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" data-close="1">Cancel</button>
            <button class="btn ${confirmClass || "btn-primary"}" id="modal-confirm">${esc(confirmText || "Save")}</button>
          </div>
        </div>
      </div>`;
    root.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", (e) => { if (e.target === b) closeModal(); })
    );
    const errEl = $("modal-error");
    const setError = (msg) => {
      errEl.textContent = msg; errEl.hidden = !msg;
    };
    $("modal-confirm").addEventListener("click", async () => {
      const btn = $("modal-confirm");
      setError("");
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = "Working…";
      try {
        const ok = await onConfirm(setError);
        if (ok !== false) closeModal();
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  }
  function confirmDialog(title, message, confirmText, onConfirm) {
    openModal({
      title,
      bodyHTML: `<p style="color:var(--muted);font-size:14px;line-height:1.5">${esc(message)}</p>`,
      confirmText, confirmClass: "btn-danger", onConfirm,
    });
  }

  /* ==========================================================
   * AUTH
   * ======================================================== */
  async function boot() {
    wireStaticEvents();
    const { data: { session } } = await sb.auth.getSession();
    if (session) await afterLogin();
    else showLogin();
  }

  function showLogin() {
    $("app-view").hidden = true;
    $("login-view").hidden = false;
  }

  function loginError(msg) {
    const el = $("login-error");
    el.textContent = msg; el.hidden = !msg;
  }

  async function afterLogin() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return showLogin();
    const { data: profile, error } = await sb
      .from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error || !profile) {
      loginError("Could not load your profile.");
      await sb.auth.signOut();
      return showLogin();
    }
    if (profile.role !== "admin") {
      loginError("This console is for administrators only.");
      await sb.auth.signOut();
      return showLogin();
    }
    me = profile;
    $("login-view").hidden = true;
    $("app-view").hidden = false;
    $("me-name").textContent = profile.full_name || "Admin";
    $("me-email").textContent = profile.email;
    $("me-avatar").textContent = initial(profile.full_name, profile.email);

    await loadLookups();
    startRealtime(user.id);
    await refreshUnread();
    setRoute("dashboard");
  }

  async function loadLookups() {
    const [{ data: profs }, { data: types }] = await Promise.all([
      sb.from("profiles").select("*").order("full_name"),
      sb.from("support_types").select("*").order("name"),
    ]);
    profilesCache = profs || [];
    typesCache = types || [];
  }

  /* ==========================================================
   * REALTIME
   * ======================================================== */
  function startRealtime(uid) {
    notifChannel = sb
      .channel("notif-" + uid)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        (payload) => {
          const n = payload.new;
          toast(n.title, n.body);
          unreadCount++;
          renderBadges();
          if (currentRoute === "inbox") renderInbox();
        }
      )
      .subscribe();
  }

  async function refreshUnread() {
    const { count } = await sb
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", me.id).eq("is_read", false);
    unreadCount = count || 0;
    renderBadges();
  }
  function renderBadges() {
    [$("nav-inbox-badge"), $("top-inbox-badge")].forEach((b) => {
      b.textContent = unreadCount;
      b.hidden = unreadCount === 0;
    });
  }

  /* ==========================================================
   * ROUTING
   * ======================================================== */
  const TITLES = {
    dashboard: "Dashboard", support: "Support Records", types: "Support Types",
    tasks: "Tasks", users: "Users", inbox: "Inbox",
  };
  function setRoute(route) {
    currentRoute = route;
    $("section-title").textContent = TITLES[route] || "";
    document.querySelectorAll(".nav-item").forEach((n) =>
      n.classList.toggle("active", n.dataset.route === route)
    );
    closeSidebar();
    ({
      dashboard: renderDashboard, support: renderSupport, types: renderTypes,
      tasks: renderTasks, users: renderUsers, inbox: renderInbox,
    }[route])();
  }

  /* ==========================================================
   * DASHBOARD
   * ======================================================== */
  async function renderDashboard() {
    spinner();
    const head = { count: "exact", head: true };
    const [users, records, openTasks] = await Promise.all([
      sb.from("profiles").select("*", head),
      sb.from("support_works").select("*", head),
      sb.from("tasks").select("*", head).in("status", ["pending", "in_progress"]),
    ]);
    const stat = (ico, num, lbl) =>
      `<div class="stat"><div class="stat-ico">${ico}</div><div class="stat-num">${num ?? 0}</div><div class="stat-lbl">${lbl}</div></div>`;
    content.innerHTML = `
      <div class="stat-grid">
        ${stat("👥", users.count, "Users")}
        ${stat("🛠️", records.count, "Support records")}
        ${stat("✅", openTasks.count, "Open tasks")}
        ${stat("🔔", unreadCount, "Unread notifications")}
      </div>
      <div class="card" style="margin-top:18px">
        <div class="card-title">Welcome, ${esc(me.full_name || "Admin")}</div>
        <p class="card-desc">Use the sidebar to review support records, manage users and support types, assign tasks, and read notifications. New support submissions notify you here in real time.</p>
      </div>`;
  }

  /* ==========================================================
   * SUPPORT RECORDS
   * ======================================================== */
  function selectOptions(items, selected, valueKey, labelFn, allLabel) {
    let html = `<option value="">${esc(allLabel)}</option>`;
    items.forEach((it) => {
      const v = it[valueKey];
      html += `<option value="${esc(v)}" ${String(v) === String(selected) ? "selected" : ""}>${esc(labelFn(it))}</option>`;
    });
    return html;
  }

  async function renderSupport() {
    spinner();
    let q = sb.from("support_works").select("*").order("created_at", { ascending: false });
    if (supportFilters.member) q = q.eq("member_id", supportFilters.member);
    if (supportFilters.type) q = q.eq("support_type_id", supportFilters.type);
    if (supportFilters.status) q = q.eq("status", supportFilters.status);
    const { data, error } = await q;

    const statuses = ["pending", "in_progress", "resolved", "closed"];
    const toolbar = `
      <div class="toolbar">
        <select id="f-user">${selectOptions(profilesCache, supportFilters.member, "id", (p) => p.full_name || p.email, "All users")}</select>
        <select id="f-type">${selectOptions(typesCache, supportFilters.type, "id", (t) => t.name, "All types")}</select>
        <select id="f-status">
          <option value="">All statuses</option>
          ${statuses.map((s) => `<option value="${s}" ${supportFilters.status === s ? "selected" : ""}>${titleCase(s)}</option>`).join("")}
        </select>
        <button class="btn btn-ghost btn-sm" id="f-clear">Clear</button>
      </div>`;

    let body;
    if (error) body = emptyState("⚠️", "Error: " + error.message);
    else if (!data.length) body = emptyState("🗂️", "No support records match these filters.");
    else body = `<div class="card-list">${data.map(supportCard).join("")}</div>`;

    content.innerHTML = toolbar + body;
    $("f-user").onchange = (e) => { supportFilters.member = e.target.value; renderSupport(); };
    $("f-type").onchange = (e) => { supportFilters.type = e.target.value; renderSupport(); };
    $("f-status").onchange = (e) => { supportFilters.status = e.target.value; renderSupport(); };
    $("f-clear").onclick = () => { supportFilters.member = supportFilters.type = supportFilters.status = ""; renderSupport(); };
    content.querySelectorAll("[data-edit-support]").forEach((b) =>
      b.onclick = () => supportModal((data || []).find((x) => String(x.id) === b.dataset.editSupport)));
  }

  function supportCard(w) {
    return `
      <div class="card">
        <div class="card-head">
          <span class="card-title">${esc(typeName(w.support_type_id))}</span>
          <span style="display:flex;gap:8px;align-items:center">${pill(w.status)}
            <button class="btn btn-ghost btn-sm" data-edit-support="${w.id}">Edit</button>
          </span>
        </div>
        <div class="card-row">👤 ${esc(nameOf(w.member_id))}</div>
        <div class="card-row">📍 ${esc(w.location)}</div>
        <div class="card-desc">${esc(w.description)}</div>
        <div class="card-row">🕐 ${esc(fmtDate(w.performed_at))}</div>
      </div>`;
  }

  function supportModal(w) {
    if (!w) return;
    const statuses = ["pending", "in_progress", "resolved", "closed"];
    openModal({
      title: "Edit support record",
      confirmText: "Save",
      bodyHTML: `
        <label class="field"><span>Support type *</span>
          <select id="s-type">${typesCache.map((t) => `<option value="${t.id}" ${t.id === w.support_type_id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Location *</span><input id="s-loc" value="${esc(w.location)}" /></label>
        <label class="field"><span>Description *</span><textarea id="s-desc" rows="3">${esc(w.description)}</textarea></label>
        <label class="field"><span>Status</span>
          <select id="s-status">${statuses.map((s) => `<option value="${s}" ${s === w.status ? "selected" : ""}>${titleCase(s)}</option>`).join("")}</select>
        </label>`,
      onConfirm: async (setError) => {
        const support_type_id = Number($("s-type").value);
        const location = $("s-loc").value.trim();
        const description = $("s-desc").value.trim();
        const status = $("s-status").value;
        if (!location || !description) { setError("Location and description are required."); return false; }
        const { error } = await sb.from("support_works")
          .update({ support_type_id, location, description, status }).eq("id", w.id);
        if (error) throw error;
        renderSupport();
      },
    });
  }

  /* ==========================================================
   * SUPPORT TYPES
   * ======================================================== */
  async function renderTypes() {
    spinner();
    const { data, error } = await sb.from("support_types").select("*").order("name");
    typesCache = data || typesCache;
    const header = `
      <div class="section-actions">
        <span style="color:var(--muted);font-size:14px">${(data || []).length} categories</span>
        <button class="btn btn-primary btn-sm" id="add-type">+ Add type</button>
      </div>`;
    let body;
    if (error) body = emptyState("⚠️", "Error: " + error.message);
    else if (!data.length) body = emptyState("🏷️", "No support types yet.");
    else body = `<div class="card-list">${data.map(typeCard).join("")}</div>`;
    content.innerHTML = header + body;

    $("add-type").onclick = () => typeModal(null);
    content.querySelectorAll("[data-edit-type]").forEach((b) =>
      b.onclick = () => typeModal(data.find((t) => String(t.id) === b.dataset.editType))
    );
    content.querySelectorAll("[data-del-type]").forEach((b) =>
      b.onclick = () => {
        const t = data.find((x) => String(x.id) === b.dataset.delType);
        confirmDialog("Delete type", `Delete "${t.name}"? Support records using it will keep their reference.`, "Delete",
          async () => {
            const { error } = await sb.from("support_types").delete().eq("id", t.id);
            if (error) throw error;
            await loadLookups(); renderTypes();
          });
      }
    );
  }
  function typeCard(t) {
    return `
      <div class="card">
        <div class="card-head">
          <span class="card-title">${esc(t.name)}</span>
          <div class="user-actions">
            <button class="btn btn-ghost btn-sm" data-edit-type="${t.id}">Edit</button>
            <button class="btn btn-ghost btn-sm" data-del-type="${t.id}">Delete</button>
          </div>
        </div>
        ${t.description ? `<div class="card-desc">${esc(t.description)}</div>` : ""}
      </div>`;
  }
  function typeModal(t) {
    openModal({
      title: t ? "Edit support type" : "Add support type",
      confirmText: t ? "Save" : "Create",
      bodyHTML: `
        <label class="field"><span>Name *</span><input id="t-name" value="${esc(t?.name || "")}" /></label>
        <label class="field"><span>Description</span><textarea id="t-desc" rows="3">${esc(t?.description || "")}</textarea></label>`,
      onConfirm: async (setError) => {
        const name = $("t-name").value.trim();
        const description = $("t-desc").value.trim() || null;
        if (!name) { setError("Name is required."); return false; }
        const res = t
          ? await sb.from("support_types").update({ name, description }).eq("id", t.id)
          : await sb.from("support_types").insert({ name, description });
        if (res.error) throw res.error;
        await loadLookups(); renderTypes();
      },
    });
  }

  /* ==========================================================
   * TASKS
   * ======================================================== */
  async function renderTasks() {
    spinner();
    const { data, error } = await sb.from("tasks").select("*").order("created_at", { ascending: false });
    const header = `
      <div class="section-actions">
        <span style="color:var(--muted);font-size:14px">${(data || []).length} tasks</span>
        <button class="btn btn-primary btn-sm" id="assign-task">+ Assign task</button>
      </div>`;
    let body;
    if (error) body = emptyState("⚠️", "Error: " + error.message);
    else if (!data.length) body = emptyState("✅", "No tasks yet.");
    else body = `<div class="card-list">${data.map(taskCard).join("")}</div>`;
    content.innerHTML = header + body;

    $("assign-task").onclick = taskModal;
    content.querySelectorAll("[data-task-status]").forEach((sel) =>
      sel.onchange = async () => {
        const id = sel.dataset.taskStatus;
        const { error } = await sb.from("tasks").update({ status: sel.value }).eq("id", id);
        if (error) { toast("Update failed", error.message); renderTasks(); }
      }
    );
  }
  function taskCard(t) {
    const opts = ["pending", "in_progress", "completed", "cancelled"];
    const late = isTaskLate(t.due_date, t.status);
    return `
      <div class="card ${late ? "card-late" : ""}">
        <div class="card-head">
          <span class="card-title">${esc(t.title)}</span>
          <span style="display:flex;gap:6px;align-items:center">
            ${late ? `<span class="pill pill-late">Late</span>` : ""}
            ${pill(t.status)}
          </span>
        </div>
        ${t.description ? `<div class="card-desc">${esc(t.description)}</div>` : ""}
        <div class="card-row">➡️ ${esc(nameOf(t.assigned_to))}</div>
        ${t.due_date ? `<div class="card-row" ${late ? 'style="color:var(--danger);font-weight:600"' : ""}>${late ? "⚠️" : "📅"} Due ${esc(fmtDate(t.due_date))}</div>` : ""}
        <div class="card-actions">
          <select data-task-status="${t.id}" style="max-width:200px">
            ${opts.map((o) => `<option value="${o}" ${t.status === o ? "selected" : ""}>${titleCase(o)}</option>`).join("")}
          </select>
        </div>
      </div>`;
  }
  function taskModal() {
    const members = profilesCache.filter((p) => p.role === "member");
    openModal({
      title: "Assign task",
      confirmText: "Create",
      bodyHTML: `
        <label class="field"><span>Assign to *</span>
          <select id="tk-member">${members.length ? members.map((m) => `<option value="${esc(m.id)}">${esc(m.full_name || m.email)}</option>`).join("") : `<option value="">No members</option>`}</select>
        </label>
        <label class="field"><span>Title *</span><input id="tk-title" /></label>
        <label class="field"><span>Description</span><textarea id="tk-desc" rows="3"></textarea></label>
        <label class="field"><span>Due date</span><input id="tk-due" type="date" /></label>`,
      onConfirm: async (setError) => {
        const assigned_to = $("tk-member").value;
        const title = $("tk-title").value.trim();
        if (!assigned_to) { setError("No member to assign to."); return false; }
        if (!title) { setError("Title is required."); return false; }
        const due = $("tk-due").value;
        const { error } = await sb.from("tasks").insert({
          assigned_by: me.id, assigned_to, title,
          description: $("tk-desc").value.trim() || null,
          due_date: due ? new Date(due).toISOString() : null,
          status: "pending",
        });
        if (error) throw error;
        renderTasks();
      },
    });
  }

  /* ==========================================================
   * USERS
   * ======================================================== */
  async function renderUsers() {
    spinner();
    const { data, error } = await sb.from("profiles").select("*").order("full_name");
    profilesCache = data || profilesCache;
    const q = userSearch.toLowerCase();
    const filtered = (data || []).filter((p) =>
      !q || (p.full_name || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q) || (p.role || "").toLowerCase().includes(q)
    );
    const header = `
      <div class="section-actions">
        <input class="grow" id="u-search" placeholder="Search by name, email, or role" value="${esc(userSearch)}" style="max-width:280px" />
        <button class="btn btn-primary btn-sm" id="add-user">+ Add user</button>
      </div>`;
    let body;
    if (error) body = emptyState("⚠️", "Error: " + error.message);
    else if (!filtered.length) body = emptyState("👥", "No users found.");
    else body = `<div class="card-list">${filtered.map(userCard).join("")}</div>`;
    content.innerHTML = header + body;

    const search = $("u-search");
    search.oninput = (e) => { userSearch = e.target.value; };
    search.onkeyup = (e) => { if (e.key === "Enter") renderUsers(); };
    search.onsearch = () => renderUsers();
    // live filter without losing focus
    search.oninput = (e) => {
      userSearch = e.target.value;
      const list = content.querySelector(".card-list");
      const qq = userSearch.toLowerCase();
      const ff = (data || []).filter((p) =>
        !qq || (p.full_name || "").toLowerCase().includes(qq) ||
        (p.email || "").toLowerCase().includes(qq) || (p.role || "").toLowerCase().includes(qq));
      if (list) list.innerHTML = ff.map(userCard).join("");
      wireUserButtons(data);
    };

    $("add-user").onclick = () => userModal(null);
    wireUserButtons(data);
  }

  function wireUserButtons(data) {
    content.querySelectorAll("[data-edit-user]").forEach((b) =>
      b.onclick = () => userModal(data.find((u) => u.id === b.dataset.editUser)));
    content.querySelectorAll("[data-reset-user]").forEach((b) =>
      b.onclick = () => resetPasswordModal(data.find((u) => u.id === b.dataset.resetUser)));
    content.querySelectorAll("[data-del-user]").forEach((b) =>
      b.onclick = () => {
        const u = data.find((x) => x.id === b.dataset.delUser);
        confirmDialog("Delete user", `Delete ${u.full_name || u.email}? This removes their account and cannot be undone.`, "Delete",
          async () => {
            const { error } = await sb.rpc("admin_delete_user", { target_user_id: u.id });
            if (error) throw error;
            await loadLookups(); renderUsers();
          });
      });
  }

  function userCard(u) {
    const isSelf = u.id === me.id;
    return `
      <div class="card user-card">
        <div class="avatar">${esc(initial(u.full_name, u.email))}</div>
        <div class="u-main">
          <strong>${esc(u.full_name || "—")} ${isSelf ? '<span style="color:var(--muted);font-weight:400">(you)</span>' : ""}</strong>
          <small>${esc(u.email)}</small>
          <div style="margin-top:6px">${rolePill(u.role)}</div>
        </div>
        <div class="user-actions">
          <button class="btn btn-ghost btn-sm" data-edit-user="${esc(u.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-reset-user="${esc(u.id)}">Reset</button>
          ${isSelf ? "" : `<button class="btn btn-ghost btn-sm" data-del-user="${esc(u.id)}">Delete</button>`}
        </div>
      </div>`;
  }

  function roleSelect(id, selected) {
    return `<select id="${id}">
      <option value="member" ${selected === "member" ? "selected" : ""}>Member</option>
      <option value="admin" ${selected === "admin" ? "selected" : ""}>Admin</option>
    </select>`;
  }

  function userModal(u) {
    openModal({
      title: u ? "Edit user" : "Add user",
      confirmText: u ? "Save" : "Create",
      bodyHTML: u
        ? `<label class="field"><span>Full name *</span><input id="u-name" value="${esc(u.full_name || "")}" /></label>
           <label class="field"><span>Phone</span><input id="u-phone" value="${esc(u.phone || "")}" /></label>
           <label class="field"><span>Role</span>${roleSelect("u-role", u.role)}</label>`
        : `<label class="field"><span>Email *</span><input id="u-email" type="email" /></label>
           <label class="field"><span>Password *</span><input id="u-pass" type="password" /></label>
           <label class="field"><span>Full name *</span><input id="u-name" /></label>
           <label class="field"><span>Phone</span><input id="u-phone" /></label>
           <label class="field"><span>Role</span>${roleSelect("u-role", "member")}</label>`,
      onConfirm: async (setError) => {
        const full_name = $("u-name").value.trim();
        const phone = $("u-phone").value.trim() || null;
        const role = $("u-role").value;
        if (!full_name) { setError("Full name is required."); return false; }
        if (u) {
          if (u.id === me.id && u.role === "admin" && role !== "admin") {
            setError("You cannot remove your own admin role."); return false;
          }
          const { error } = await sb.from("profiles").update({ full_name, phone, role }).eq("id", u.id);
          if (error) throw error;
        } else {
          const email = $("u-email").value.trim();
          const password = $("u-pass").value;
          if (!email || !password) { setError("Email and password are required."); return false; }
          if (password.length < 6) { setError("Password must be at least 6 characters."); return false; }
          await createUserIsolated({ email, password, full_name, role, phone });
        }
        await loadLookups(); renderUsers();
      },
    });
  }

  // Create a user without disturbing the admin's session (isolated client).
  async function createUserIsolated({ email, password, full_name, role, phone }) {
    const tmp = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "nsuit-admin-temp" },
    });
    const { data, error } = await tmp.auth.signUp({
      email, password, options: { data: { full_name, role, phone } },
    });
    if (error) throw error;
    const uid = data.user?.id;
    if (uid) {
      // Fallback in case the handle_new_user trigger isn't installed.
      await tmp.from("profiles").upsert({ id: uid, full_name, email, role, phone }, { onConflict: "id" });
    }
    await tmp.auth.signOut();
  }

  function resetPasswordModal(u) {
    openModal({
      title: "Reset password",
      confirmText: "Reset",
      bodyHTML: `
        <p style="color:var(--muted);font-size:13px;margin-top:0">User: ${esc(u.full_name || u.email)}</p>
        <label class="field"><span>New password *</span><input id="r-pass" type="password" /></label>`,
      onConfirm: async (setError) => {
        const pw = $("r-pass").value;
        if (pw.length < 6) { setError("Password must be at least 6 characters."); return false; }
        const { error } = await sb.rpc("admin_reset_password", { target_user_id: u.id, new_password: pw });
        if (error) throw error;
        toast("Password reset", u.full_name || u.email);
      },
    });
  }

  /* ==========================================================
   * INBOX
   * ======================================================== */
  async function renderInbox() {
    spinner();
    const { data, error } = await sb
      .from("notifications").select("*").eq("user_id", me.id)
      .order("created_at", { ascending: false });
    const header = `
      <div class="section-actions">
        <span style="color:var(--muted);font-size:14px">${unreadCount} unread</span>
        ${unreadCount > 0 ? `<button class="btn btn-ghost btn-sm" id="mark-all">Mark all read</button>` : ""}
      </div>`;
    let body;
    if (error) body = emptyState("⚠️", "Error: " + error.message);
    else if (!data.length) body = emptyState("🔔", "No notifications.");
    else body = `<div class="card-list">${data.map(notifCard).join("")}</div>`;
    content.innerHTML = header + body;

    const markAll = $("mark-all");
    if (markAll) markAll.onclick = async () => {
      await sb.from("notifications").update({ is_read: true }).eq("user_id", me.id).eq("is_read", false);
      await refreshUnread(); renderInbox();
    };
    content.querySelectorAll("[data-notif]").forEach((c) =>
      c.onclick = async () => {
        const n = data.find((x) => String(x.id) === c.dataset.notif);
        if (n && !n.is_read) {
          await sb.from("notifications").update({ is_read: true }).eq("id", n.id);
          await refreshUnread(); renderInbox();
        }
      });
  }
  function notifIcon(type) {
    return { support_recorded: "🛠️", task_assigned: "✅", task_status_changed: "🔄", task_updated: "🔄" }[type] || "🔔";
  }
  function notifCard(n) {
    return `
      <div class="card notif ${n.is_read ? "" : "unread"}" data-notif="${n.id}">
        <div class="n-ico">${notifIcon(n.type)}</div>
        <div class="n-body">
          <div class="n-title">${esc(n.title)}</div>
          <div class="card-desc" style="margin-top:2px">${esc(n.body)}</div>
          <div class="n-time">${esc(fmtDate(n.created_at))}</div>
        </div>
        ${n.is_read ? "" : `<div class="dot"></div>`}
      </div>`;
  }

  /* ==========================================================
   * STATIC EVENTS
   * ======================================================== */
  function closeSidebar() {
    $("sidebar").classList.remove("open");
    $("scrim").hidden = true;
  }
  function wireStaticEvents() {
    // login
    $("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      loginError("");
      const btn = $("login-btn");
      btn.disabled = true; btn.textContent = "Signing in…";
      const email = $("login-email").value.trim();
      const password = $("login-password").value;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) loginError(error.message);
      else await afterLogin();
      btn.disabled = false; btn.textContent = "Sign In";
    });
    $("pw-toggle").addEventListener("click", () => {
      const i = $("login-password");
      i.type = i.type === "password" ? "text" : "password";
    });

    // nav
    document.querySelectorAll(".nav-item").forEach((n) =>
      n.addEventListener("click", () => setRoute(n.dataset.route)));
    $("topbar-inbox").addEventListener("click", () => setRoute("inbox"));
    $("logout-btn").addEventListener("click", async () => {
      if (notifChannel) await sb.removeChannel(notifChannel);
      await sb.auth.signOut();
      location.reload();
    });

    // mobile drawer
    $("menu-toggle").addEventListener("click", () => {
      const open = $("sidebar").classList.toggle("open");
      $("scrim").hidden = !open;
    });
    $("scrim").addEventListener("click", closeSidebar);
  }

  boot();
})();
