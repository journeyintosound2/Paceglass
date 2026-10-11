// Admin console: sign in as an admin, then add, pause or remove the people who can use Paceglass.
// Admin rights come from an admins/{uid} entry in Firestore (set up by hand, see docs/FIREBASE-SETUP.md),
// never from anything in this code.

import { cloudEnabled, friendlyError, getBackend, isValidEmail, normaliseEmail } from './cloud.js';

const root = document.getElementById('admin-root');
const signOutBtn = document.getElementById('sign-out');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

const ui = {
  backend: null,
  user: null,
  members: [],
  filter: '',
  confirmRemove: null,
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
  const paused = all.filter((m) => m.status !== 'active').length;
  const q = ui.filter.trim().toLowerCase();
  const shown = q ? all.filter((m) => `${m.name || ''} ${m.email} ${m.note || ''}`.toLowerCase().includes(q)) : all;

  root.innerHTML = `
    <header class="page-head">
      <span class="badge">Admin console</span>
      <h1>People who can use Paceglass</h1>
      <p class="lede">Add someone and they'll get an email to set their own password. Signed in as ${esc(ui.user.email)}.</p>
    </header>

    <div class="tiles tiles-3">
      <div class="tile"><b class="num">${all.length}</b><span>${all.length === 1 ? 'person' : 'people'}</span></div>
      <div class="tile"><b class="num">${active}</b><span>active</span></div>
      <div class="tile"><b class="num">${paused}</b><span>paused</span></div>
    </div>

    <div class="admin-grid">
      <section class="card block add-card">
        <h2>Add someone</h2>
        <form id="add-form" class="settings-group" novalidate>
          <div class="field">
            <label for="add-name">Name</label>
            <input class="input" id="add-name" name="name" maxlength="80" autocomplete="off" placeholder="Sam Taylor">
          </div>
          <div class="field">
            <label for="add-email">Email</label>
            <input class="input" id="add-email" name="email" type="email" inputmode="email" autocomplete="off" required placeholder="sam@example.com">
          </div>
          <div class="field">
            <label for="add-note">Note (optional)</label>
            <input class="input" id="add-note" name="note" maxlength="200" autocomplete="off" placeholder="Pilot group, October">
            <span class="hint">Only admins see this. Keep health details out of it.</span>
          </div>
          <button class="btn btn-primary btn-block" type="submit" id="add-submit">Add and send invite</button>
          <p class="status" id="add-status" role="status"></p>
        </form>
      </section>

      <section class="card block members-card">
        <div class="members-head">
          <h2>Everyone</h2>
          <button class="link-btn" type="button" data-action="refresh">Refresh</button>
        </div>
        ${all.length > 4 ? `<input class="input" id="member-filter" type="search" placeholder="Search by name, email or note" value="${esc(ui.filter)}" aria-label="Search people">` : ''}
        ${ui.loadError ? `<p class="status error">${esc(ui.loadError)}</p>` : ''}
        ${shown.length ? `<ul class="members">${shown.map(memberRow).join('')}</ul>`
          : `<p class="muted small">${all.length ? 'Nobody matches that search.' : 'Nobody yet. Add the first person with the form.'}</p>`}
      </section>
    </div>

    <p class="fineprint">The admin console shows who has access, never anyone's drink log. The security rules only let each person read their own log. As the Firebase project owner you could still see stored data in the Firebase console, so treat that access with care. Removing someone stops them using Paceglass straight away; their sign-in account stays in Firebase until you delete it under Authentication in the Firebase console.</p>
  `;
}

function memberRow(m) {
  const active = m.status === 'active';
  const confirming = ui.confirmRemove === m.email;
  return `<li class="member">
    <div class="who">
      <b>${esc(m.name || m.email)}</b>
      ${m.name ? `<span class="email">${esc(m.email)}</span>` : ''}
      <span class="meta">${m.createdAt ? `Added ${esc(dateFmt.format(new Date(m.createdAt)))}` : 'Just added'}${m.note ? `. ${esc(m.note)}` : ''}</span>
    </div>
    <span class="pill ${active ? 'on' : 'off'}">${active ? 'Active' : 'Paused'}</span>
    <div class="actions">
      <button class="btn btn-sm btn-quiet" type="button" data-action="resend" data-email="${esc(m.email)}">Resend invite</button>
      <button class="btn btn-sm btn-quiet" type="button" data-action="${active ? 'pause' : 'resume'}" data-email="${esc(m.email)}">${active ? 'Pause access' : 'Restore access'}</button>
      <button class="btn btn-sm btn-danger" type="button" data-action="remove" data-email="${esc(m.email)}">${confirming ? 'Tap again to remove' : 'Remove'}</button>
    </div>
  </li>`;
}

// ---------------------------------------------------------------- data

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
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

function setStatus(id, text, tone = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status ${tone}`;
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
      // onAuth takes it from here
    } catch (err) {
      setStatus('si-status', friendlyError(err), 'error');
      btn.disabled = false;
    }
    return;
  }

  if (form.id === 'add-form') {
    ev.preventDefault();
    const email = normaliseEmail(form.email.value);
    const name = form.name.value.trim();
    const note = form.note.value.trim();
    if (!isValidEmail(email)) { setStatus('add-status', 'Enter a valid email address.', 'error'); form.email.focus(); return; }
    const existing = ui.members.find((m) => m.email === email);
    if (existing && existing.status === 'active') { setStatus('add-status', `${email} already has access.`, 'error'); return; }
    const btn = document.getElementById('add-submit');
    btn.disabled = true;
    setStatus('add-status', 'Adding…');
    try {
      const res = await ui.backend.addMember({ email, name, note });
      await loadMembers();
      renderDashboard();
      setStatus('add-status', res.emailSent
        ? `Added ${name || email}. They've been emailed a link to set their password.`
        : `Added ${name || email}, but the invite email didn't send. Use "Resend invite".`, res.emailSent ? 'ok' : 'error');
    } catch (err) {
      setStatus('add-status', friendlyError(err), 'error');
      btn.disabled = false;
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
    try { await ui.backend.sendSetPasswordEmail(email); } catch { /* same message either way */ }
    setStatus('si-status', 'If that email has an account, a link to set a new password is on its way.', 'ok');
    return;
  }

  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const { action, email } = el.dataset;
  if (action !== 'remove') ui.confirmRemove = null;

  try {
    if (action === 'refresh') {
      await loadMembers();
      renderDashboard();
    } else if (action === 'resend') {
      el.disabled = true;
      await ui.backend.sendSetPasswordEmail(email);
      toast(`Invite sent again to ${email}`);
      el.disabled = false;
    } else if (action === 'pause' || action === 'resume') {
      el.disabled = true;
      await ui.backend.setMemberStatus(email, action === 'pause' ? 'disabled' : 'active');
      await loadMembers();
      renderDashboard();
      toast(action === 'pause' ? `Paused access for ${email}` : `Restored access for ${email}`);
    } else if (action === 'remove') {
      if (ui.confirmRemove !== email) { ui.confirmRemove = email; renderDashboard(); return; }
      ui.confirmRemove = null;
      await ui.backend.removeMember(email);
      await loadMembers();
      renderDashboard();
      toast(`Removed ${email}`);
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
    ui.backend = await getBackend();
  } catch {
    root.innerHTML = `<section class="card signin-card"><span class="badge">Admin console</span><h1>Can't connect</h1>
      <p class="muted">The admin console couldn't reach Firebase. Check your connection and reload the page.</p>
      <button class="btn btn-quiet" type="button" onclick="location.reload()">Try again</button></section>`;
    return;
  }
  ui.backend.onAuth(async (user) => {
    ui.user = user;
    ui.members = [];
    if (!user) { renderSignIn(); return; }
    root.innerHTML = '<section class="card signin-card"><p class="muted">Checking your access…</p></section>';
    let access;
    try {
      access = await ui.backend.getAccess(user);
    } catch (err) {
      renderSignIn(friendlyError(err), 'error');
      return;
    }
    if (!access.admin) { renderNotAdmin(user); return; }
    await loadMembers();
    renderDashboard();
  });
}

boot();
