// Admin console: sign in as an admin, then create people with personal codes, issue new codes,
// pause access or remove people.
// Admin rights come from an admins/{uid} entry in Firestore (set up by hand, see docs/FIREBASE-SETUP.md),
// never from anything in this code.

import { cloudEnabled, friendlyError, getBackend, isValidEmail } from './cloud.js';
import { formatCode } from './codes.js';

const root = document.getElementById('admin-root');
const signOutBtn = document.getElementById('sign-out');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

const ui = {
  backend: null,
  user: null,
  members: [],
  filter: '',
  confirm: null, // { id, action } for two-tap actions
  editing: null, // member id being edited
  justAdded: null, // { id, name, code }
  loadError: '',
};

// ---------------------------------------------------------------- screens

function renderNotConfigured() {
  root.innerHTML = `
    <section class="card signin-card">
      <span class="badge">Admin console</span>
      <h1>Firebase isn't set up yet</h1>
      <p class="muted">The admin console needs a Firebase project. Follow the steps in <b>docs/FIREBASE-SETUP.md</b> in the Paceglass repository, then paste your project's settings into <b>js/firebase-config.js</b>.</p>
      <a class="btn btn-quiet" href="./">Back to Paceglass</a>
    </section>`;
}

function renderSignIn(message = '', tone = '') {
  signOutBtn.hidden = true;
  root.innerHTML = `
    <section class="card signin-card">
      <span class="badge">Admin console</span>
      <h1>Admin sign in</h1>
      <p class="muted">Sign in with your admin account to manage who can use Paceglass.</p>
      <div class="secure-note"><b>Secure sign-in.</b> Your password is checked by Firebase. Paceglass never stores it.</div>
      <form id="signin-form" class="signin-form" novalidate>
        <div class="field">
          <label for="si-email">Email</label>
          <input class="input" id="si-email" name="email" type="email" autocomplete="username" inputmode="email" required>
        </div>
        <div class="field">
          <label for="si-password">Password</label>
          <input class="input" id="si-password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="btn btn-primary btn-block" type="submit" id="si-submit">Sign in</button>
        <p class="status ${tone}" id="si-status" role="status">${esc(message || 'Ready. Enter your email and password.')}</p>
        <button class="link-btn" type="button" id="si-forgot">Forgot your password?</button>
      </form>
    </section>`;
  document.getElementById('si-email').focus();
}

function renderNotAdmin(user) {
  signOutBtn.hidden = false;
  root.innerHTML = `
    <section class="card signin-card">
      <span class="badge">Admin console</span>
      <h1>Not an admin account</h1>
      <p class="muted">You're signed in as <b>${esc(user.email)}</b>, but this account doesn't have admin access.</p>
      <div class="btn-row">
        <button class="btn btn-quiet" type="button" data-action="sign-out">Sign in with another account</button>
        <a class="btn btn-plain" href="./">Back to Paceglass</a>
      </div>
    </section>`;
}

function renderDashboard() {
  signOutBtn.hidden = false;
  const all = ui.members;
  const active = all.filter((m) => m.status === 'active').length;
  const paused = all.length - active;
  const q = ui.filter.trim().toLowerCase();
  const shown = q ? all.filter((m) => `${m.name || ''} ${m.note || ''} ${m.code || ''}`.toLowerCase().includes(q)) : all;

  root.innerHTML = `
    <header class="page-head">
      <span class="badge">Admin console</span>
      <h1>People using Paceglass</h1>
      <p class="lede">Create someone and they get their own code to sign in with. Give them the code in person or however suits you. Signed in as ${esc(ui.user.email)}.</p>
    </header>

    <div class="tiles tiles-3">
      <div class="tile"><b class="num">${all.length}</b><span>${all.length === 1 ? 'person' : 'people'}</span></div>
      <div class="tile"><b class="num">${active}</b><span>active</span></div>
      <div class="tile"><b class="num">${paused}</b><span>paused</span></div>
    </div>

    <div class="admin-grid">
      <section class="card block add-card">
        <h2>Add someone</h2>
        ${ui.justAdded ? justAddedPanel(ui.justAdded) : ''}
        <form id="add-form" class="settings-group" novalidate>
          <div class="field">
            <label for="add-name">Name</label>
            <input class="input" id="add-name" name="name" maxlength="80" autocomplete="off" required placeholder="Sam Taylor">
          </div>
          <div class="field">
            <label for="add-note">Note (optional)</label>
            <input class="input" id="add-note" name="note" maxlength="200" autocomplete="off" placeholder="Pilot group, October">
            <span class="hint">Only admins see this. Keep health details out of it.</span>
          </div>
          <button class="btn btn-primary btn-block" type="submit" id="add-submit">Create their code</button>
          <p class="status" id="add-status" role="status"></p>
        </form>
      </section>

      <section class="card block members-card">
        <div class="members-head">
          <h2>Everyone</h2>
          <button class="link-btn" type="button" data-action="refresh">Refresh</button>
        </div>
        ${all.length > 4 ? `<input class="input" id="member-filter" type="search" placeholder="Search by name, note or code" value="${esc(ui.filter)}" aria-label="Search people">` : ''}
        ${ui.loadError ? `<p class="status error">${esc(ui.loadError)}</p>` : ''}
        ${shown.length ? `<ul class="members">${shown.map(memberRow).join('')}</ul>`
          : `<p class="muted small">${all.length ? 'Nobody matches that search.' : 'Nobody yet. Add the first person with the form.'}</p>`}
      </section>
    </div>

    <p class="fineprint">The admin console shows who has access, never anyone's drink log. The security rules only let each person read their own log. As the Firebase project owner you could still see stored data in the Firebase console, so treat that access with care. Treat codes like passwords: anyone with a code can open that person's log.</p>
  `;
}

function justAddedPanel(p) {
  return `<div class="new-code" role="status">
    <p><b>${esc(p.name)}</b>'s code is ready. They'll use it to sign in to Paceglass.</p>
    <p class="code-big" aria-label="Code ${esc([...p.code].join(' '))}">${esc(formatCode(p.code))}</p>
    <div class="btn-row">
      <button class="btn btn-sm btn-primary" type="button" data-action="copy-code" data-id="${esc(p.id)}">Copy code</button>
      <button class="btn btn-sm btn-plain" type="button" data-action="dismiss-new">Done</button>
    </div>
  </div>`;
}

function memberRow(m) {
  const active = m.status === 'active';
  const isConfirm = (action) => ui.confirm && ui.confirm.id === m.id && ui.confirm.action === action;
  if (ui.editing === m.id) {
    return `<li class="member editing">
      <form class="edit-form" data-id="${esc(m.id)}" novalidate>
        <div class="field"><label for="ed-name-${esc(m.id)}">Name</label><input class="input" id="ed-name-${esc(m.id)}" name="name" maxlength="80" value="${esc(m.name)}"></div>
        <div class="field"><label for="ed-note-${esc(m.id)}">Note</label><input class="input" id="ed-note-${esc(m.id)}" name="note" maxlength="200" value="${esc(m.note)}"></div>
        <div class="btn-row"><button class="btn btn-sm btn-primary" type="submit">Save</button><button class="btn btn-sm btn-plain" type="button" data-action="cancel-edit">Cancel</button></div>
      </form>
    </li>`;
  }
  return `<li class="member">
    <div class="who">
      <b>${esc(m.name || 'No name')}</b>
      <span class="meta">${m.createdAt ? `Added ${esc(dateFmt.format(new Date(m.createdAt)))}` : 'Just added'}${m.note ? `. ${esc(m.note)}` : ''}</span>
    </div>
    <span class="pill ${active ? 'on' : 'off'}">${active ? 'Active' : 'Paused'}</span>
    <div class="code-row">
      <span class="code-chip num" aria-label="Code ${esc([...(m.code || '')].join(' '))}">${esc(formatCode(m.code))}</span>
      <button class="link-btn" type="button" data-action="copy-code" data-id="${esc(m.id)}">Copy code</button>
    </div>
    <div class="actions">
      <button class="btn btn-sm btn-quiet" type="button" data-action="edit" data-id="${esc(m.id)}">Edit</button>
      <button class="btn btn-sm btn-quiet" type="button" data-action="new-code" data-id="${esc(m.id)}">${isConfirm('new-code') ? 'Tap again: old code stops working' : 'New code'}</button>
      <button class="btn btn-sm btn-quiet" type="button" data-action="${active ? 'pause' : 'resume'}" data-id="${esc(m.id)}">${active ? 'Pause access' : 'Restore access'}</button>
      <button class="btn btn-sm btn-danger" type="button" data-action="remove" data-id="${esc(m.id)}">${isConfirm('remove') ? 'Tap again: deletes their log too' : 'Remove'}</button>
    </div>
  </li>`;
}

// ---------------------------------------------------------------- helpers

async function loadMembers() {
  try {
    ui.members = await ui.backend.listMembers();
    ui.loadError = '';
  } catch (err) {
    ui.loadError = friendlyError(err);
  }
}

let toastTimer = null;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function setStatus(id, text, tone = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status ${tone}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

function findMember(id) {
  return ui.members.find((m) => m.id === id) || (ui.justAdded && ui.justAdded.id === id ? ui.justAdded : null);
}

// ---------------------------------------------------------------- events

document.addEventListener('submit', async (ev) => {
  const form = ev.target;
  if (form.id === 'signin-form') {
    ev.preventDefault();
    const email = form.email.value;
    const password = form.password.value;
    if (!isValidEmail(email) || !password) { setStatus('si-status', 'Enter your email and password.', 'error'); return; }
    const btn = document.getElementById('si-submit');
    btn.disabled = true;
    setStatus('si-status', 'Signing in…');
    try {
      await ui.backend.signIn(email, password);
    } catch (err) {
      setStatus('si-status', friendlyError(err), 'error');
      btn.disabled = false;
    }
    return;
  }

  if (form.id === 'add-form') {
    ev.preventDefault();
    const name = form.name.value.trim();
    const note = form.note.value.trim();
    if (!name) { setStatus('add-status', 'Enter their name.', 'error'); form.name.focus(); return; }
    const btn = document.getElementById('add-submit');
    btn.disabled = true;
    setStatus('add-status', 'Creating their code…');
    try {
      const { id, code } = await ui.backend.addMember({ name, note });
      ui.justAdded = { id, name, code };
      await loadMembers();
      renderDashboard();
    } catch (err) {
      setStatus('add-status', friendlyError(err), 'error');
      btn.disabled = false;
    }
    return;
  }

  if (form.classList.contains('edit-form')) {
    ev.preventDefault();
    try {
      await ui.backend.updateMember(form.dataset.id, { name: form.name.value.trim(), note: form.note.value.trim() });
      ui.editing = null;
      await loadMembers();
      renderDashboard();
      toast('Saved');
    } catch (err) {
      toast(friendlyError(err));
    }
  }
});

document.addEventListener('click', async (ev) => {
  if (ev.target.closest('#sign-out') || ev.target.closest('[data-action="sign-out"]')) {
    await ui.backend?.signOut();
    return;
  }
  if (ev.target.id === 'si-forgot') {
    const email = document.getElementById('si-email').value;
    if (!isValidEmail(email)) { setStatus('si-status', 'Type your email above first, then tap "Forgot your password?".', 'error'); return; }
    try { await ui.backend.sendPasswordReset(email); } catch { /* same message either way */ }
    setStatus('si-status', 'If that email has an admin account, a link to set a new password is on its way.', 'ok');
    return;
  }

  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  const twoTap = action === 'remove' || action === 'new-code';
  if (!twoTap) ui.confirm = null;
  const m = id ? findMember(id) : null;

  try {
    switch (action) {
      case 'refresh':
        await loadMembers();
        renderDashboard();
        break;
      case 'copy-code':
        toast(await copyText(formatCode(m.code)) ? `Copied ${formatCode(m.code)}` : 'Couldn\'t copy.');
        break;
      case 'dismiss-new':
        ui.justAdded = null;
        renderDashboard();
        break;
      case 'edit':
        ui.editing = id;
        renderDashboard();
        document.getElementById(`ed-name-${id}`)?.focus();
        break;
      case 'cancel-edit':
        ui.editing = null;
        renderDashboard();
        break;
      case 'new-code': {
        if (!ui.confirm || ui.confirm.id !== id || ui.confirm.action !== action) { ui.confirm = { id, action }; renderDashboard(); break; }
        ui.confirm = null;
        el.disabled = true;
        const code = await ui.backend.newCode(id);
        ui.justAdded = { id, name: m.name, code };
        await loadMembers();
        renderDashboard();
        toast(`New code for ${m.name || 'them'}: ${formatCode(code)}`);
        break;
      }
      case 'pause':
      case 'resume':
        el.disabled = true;
        await ui.backend.setMemberStatus(id, action === 'pause' ? 'disabled' : 'active');
        await loadMembers();
        renderDashboard();
        toast(action === 'pause' ? `Paused access for ${m.name || 'them'}` : `Restored access for ${m.name || 'them'}`);
        break;
      case 'remove':
        if (!ui.confirm || ui.confirm.id !== id || ui.confirm.action !== action) { ui.confirm = { id, action }; renderDashboard(); break; }
        ui.confirm = null;
        el.disabled = true;
        await ui.backend.removeMember(id);
        if (ui.justAdded?.id === id) ui.justAdded = null;
        await loadMembers();
        renderDashboard();
        toast(`Removed ${m?.name || 'them'}`);
        break;
    }
  } catch (err) {
    toast(friendlyError(err));
    el.disabled = false;
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'member-filter') return;
  ui.filter = ev.target.value;
  const pos = ev.target.selectionStart;
  renderDashboard();
  const f = document.getElementById('member-filter');
  if (f) { f.focus(); f.setSelectionRange(pos, pos); }
});

// ---------------------------------------------------------------- boot

async function boot() {
  if (!cloudEnabled()) { renderNotConfigured(); return; }
  try {
    ui.backend = await getBackend('admin');
  } catch {
    root.innerHTML = `<section class="card signin-card"><span class="badge">Admin console</span><h1>Can't connect</h1>
      <p class="muted">The admin console couldn't reach Firebase. Check your connection and reload the page.</p>
      <button class="btn btn-quiet" type="button" onclick="location.reload()">Try again</button></section>`;
    return;
  }
  ui.backend.onAuth(async (user) => {
    ui.user = user;
    ui.members = [];
    ui.justAdded = null;
    if (!user) { renderSignIn(); return; }
    root.innerHTML = '<section class="card signin-card"><p class="muted">Checking your access…</p></section>';
    let admin = false;
    try {
      admin = await ui.backend.isAdmin(user);
    } catch (err) {
      renderSignIn(friendlyError(err), 'error');
      return;
    }
    if (!admin) { renderNotAdmin(user); return; }
    await loadMembers();
    renderDashboard();
  });
}

boot();
