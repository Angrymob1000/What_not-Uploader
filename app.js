'use strict';

/* ============================================================================
   Whatnot Uploader — iPhone PWA
   Build a Whatnot bulk-import CSV entirely on the phone:
   pick photos -> auto-group by capture time -> edit -> upload -> CSV.
   CSV columns + defaults mirror the desktop tool exactly.
============================================================================ */

// Fixed taxonomy for these shows (change here if you ever sell a different category).
const CATEGORY = 'Antiques, Vintage & Ephemera';
const SUB_CATEGORY = 'Vintage Decor';
const MAX_IMAGES = 8;

const CONDITIONS = ['New', 'Open Box', 'Like New', 'Used', 'For Parts or Not Working'];
const SHIPPING = ['0-1oz','1-2oz','2-3oz','3-4oz','4-7oz','7-15oz','1 lb','2 lb','3 lb','4 lb','5 lb','6 lb','7 lb','8 lb','9 lb','10 lb'];

const CSV_HEADERS = ['Category','Sub Category','Title','Description','Quantity','Type','Price',
  'Shipping Profile','Offerable','Hazmat','Condition','Cost Per Item','SKU'];
for (let i = 1; i <= MAX_IMAGES; i++) CSV_HEADERS.push('Image URL ' + i);

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ---- state ----
let PHOTOS = [];                 // { id, file, url, date, isStart }
const ITEMDATA = new Map();      // startPhotoId -> { title, price, description, condition, shipping, type, quantity }
const UPLOADED = new Map();      // photoId -> https url
let photoSeq = 0;

const SETTINGS = loadSettings();

// ---- helpers ----
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('whatnot.settings') || '{}'); } catch (e) {}
  return Object.assign({ endpoint: '', letter: 'A', price: '', type: 'Buy it Now', condition: 'Used', shipping: '' }, s);
}
function saveSettings() { localStorage.setItem('whatnot.settings', JSON.stringify(SETTINGS)); }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function setStatus(el, msg, cls) { el.className = 'status' + (cls ? ' ' + cls : ''); el.innerHTML = msg; }

function isHeic(file) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
}

// ---- tabs ----
$$('.tab').forEach((t) => t.addEventListener('click', () => goTo(t.dataset.view)));
function goTo(view) {
  $$('.tab').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  $$('.view').forEach((v) => v.classList.remove('active'));
  $('#view-' + view).classList.add('active');
  if (view === 'items') renderItems();
}

// ============================================================================
//  PHOTOS: pick + auto-group
// ============================================================================
$('#pick').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => { addPhotos(e.target.files); e.target.value = ''; });

async function addPhotos(fileList) {
  const files = Array.from(fileList).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|hei[cf])$/i.test(f.name));
  if (!files.length) { toast('No photos selected.'); return; }
  setStatus($('#pick-status'), '<span class="spinner"></span> Reading ' + files.length + ' photo' + (files.length > 1 ? 's' : '') + '…');

  for (const f of files) {
    let date = null;
    try {
      const ex = await window.exifr.parse(f, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] });
      date = (ex && (ex.DateTimeOriginal || ex.CreateDate || ex.ModifyDate)) || null;
    } catch (e) { /* ignore */ }
    if (!date) date = new Date(f.lastModified || Date.now());
    PHOTOS.push({ id: ++photoSeq, file: f, url: URL.createObjectURL(f), date: new Date(date), isStart: false });
  }
  // sort by capture time, then regroup
  PHOTOS.sort((a, b) => a.date - b.date);
  regroup();
  setStatus($('#pick-status'), '✓ ' + PHOTOS.length + ' photo' + (PHOTOS.length > 1 ? 's' : '') + ' added and grouped.', 'ok');
  toast('Grouped into ' + countItems() + ' item' + (countItems() > 1 ? 's' : ''));
  goTo('items');
}

function regroup() {
  const gap = (parseInt($('#gap').value, 10) || 35) * 1000;
  PHOTOS.forEach((p, i) => {
    if (i === 0) { p.isStart = true; }
    else { p.isStart = (PHOTOS[i].date - PHOTOS[i - 1].date) > gap; }
  });
}
function countItems() { return PHOTOS.filter((p) => p.isStart).length; }

// Build item groups from the flat isStart flags.
function buildItems() {
  const items = [];
  let cur = null;
  PHOTOS.forEach((p) => {
    if (p.isStart || !cur) { cur = { startId: p.id, photos: [] }; items.push(cur); }
    cur.photos.push(p);
  });
  return items;
}

// ============================================================================
//  ITEMS: render + edit + merge/split
// ============================================================================
function renderItems() {
  const wrap = $('#items');
  const items = buildItems();
  $('#items-count').textContent = items.length ? (items.length + ' item' + (items.length > 1 ? 's' : '') + ' · ' + PHOTOS.length + ' photos') : 'No items yet';
  $('#items-empty').style.display = items.length ? 'none' : 'block';
  $('#bulk-bar').innerHTML = items.length ? '<button class="chip" id="apply-defaults">Apply defaults to all</button>' : '';
  if ($('#apply-defaults')) $('#apply-defaults').addEventListener('click', applyDefaultsToAll);

  const letter = ($('#show-letter').value || SETTINGS.letter || 'A').toUpperCase();
  wrap.innerHTML = '';

  items.forEach((it, idx) => {
    const code = letter + (idx + 1);
    const data = getData(it.startId);
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML =
      '<div class="item-top">' +
        '<span class="item-code">' + code + '</span>' +
        (idx > 0 ? '<button class="merge-btn" data-merge="' + it.startId + '">↑ Merge into ' + (letter + idx) + '</button>' : '') +
        '<span class="item-meta">' + it.photos.length + ' photo' + (it.photos.length > 1 ? 's' : '') + '</span>' +
      '</div>' +
      '<div class="photos">' + it.photos.map((p, pi) =>
        '<div class="photo' + (p.isStart ? ' isstart' : '') + '">' +
          '<img src="' + p.url + '" alt="">' +
          (!(idx === 0 && pi === 0) ? '<button class="split" data-split="' + p.id + '">' + (p.isStart ? 'start ✓' : 'split here') + '</button>' : '') +
        '</div>').join('') +
      '</div>' +
      '<div class="item-fields">' +
        '<label class="full">Title<input type="text" data-f="title" placeholder="e.g. Fenton blue ruffled vase [verify maker]" value="' + esc(data.title) + '"></label>' +
        '<label>Price<input type="text" inputmode="decimal" data-f="price" placeholder="' + (SETTINGS.price || '5') + '" value="' + esc(data.price) + '"></label>' +
        '<label>Type<select data-f="type">' + opts(['Buy it Now', 'Auction'], data.type) + '</select></label>' +
        '<label>Condition<select data-f="condition">' + opts(CONDITIONS, data.condition) + '</select></label>' +
        '<label>Shipping<select data-f="shipping">' + opts(['', ...SHIPPING], data.shipping) + '</select></label>' +
        '<label class="full">Description<textarea data-f="description" placeholder="Color, form, size, condition notes…">' + esc(data.description) + '</textarea></label>' +
      '</div>';

    // field bindings
    el.querySelectorAll('[data-f]').forEach((inp) => {
      inp.addEventListener('input', () => { data[inp.dataset.f] = inp.value; });
      inp.addEventListener('change', () => { data[inp.dataset.f] = inp.value; });
    });
    // split / merge
    el.querySelectorAll('[data-split]').forEach((b) => b.addEventListener('click', () => toggleSplit(+b.dataset.split)));
    el.querySelectorAll('[data-merge]').forEach((b) => b.addEventListener('click', () => mergeUp(+b.dataset.merge)));
    wrap.appendChild(el);
  });
}

function getData(startId) {
  if (!ITEMDATA.has(startId)) {
    ITEMDATA.set(startId, { title: '', price: SETTINGS.price || '', description: '',
      condition: SETTINGS.condition || 'Used', shipping: SETTINGS.shipping || '', type: SETTINGS.type || 'Buy it Now' });
  }
  return ITEMDATA.get(startId);
}
function toggleSplit(photoId) {
  const p = PHOTOS.find((x) => x.id === photoId);
  if (!p) return;
  if (PHOTOS[0].id === photoId) return; // first can't change
  p.isStart = !p.isStart;
  renderItems();
}
function mergeUp(startId) {
  const p = PHOTOS.find((x) => x.id === startId);
  if (p && PHOTOS[0].id !== startId) { p.isStart = false; renderItems(); }
}
function applyDefaultsToAll() {
  buildItems().forEach((it) => {
    const d = getData(it.startId);
    if (!d.price) d.price = SETTINGS.price || '';
    d.condition = SETTINGS.condition || d.condition;
    d.shipping = SETTINGS.shipping || d.shipping;
    d.type = SETTINGS.type || d.type;
  });
  renderItems();
  toast('Defaults applied');
}
$('#gap').addEventListener('change', () => { if (PHOTOS.length) { regroup(); renderItems(); toast('Re-grouped into ' + countItems() + ' items'); } });
$('#show-letter').addEventListener('input', () => { SETTINGS.letter = ($('#show-letter').value || 'A').toUpperCase(); saveSettings(); renderItems(); });

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function opts(list, sel) { return list.map((o) => '<option' + (o === sel ? ' selected' : '') + '>' + esc(o) + '</option>').join(''); }

// ============================================================================
//  EXPORT: upload photos -> URLs, then build CSV
// ============================================================================
async function toJpeg(photo) {
  const f = photo.file;
  if (isHeic(f)) {
    const out = await window.heic2any({ blob: f, toType: 'image/jpeg', quality: 0.85 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], (f.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  }
  return f; // jpg/png already fine for Whatnot
}

// Upload one photo and return its public https URL.
//  - Default (no setup): Litterbox — Catbox's temporary host. Works straight from the phone
//    browser (it allows cross-site uploads). Links last up to 72h, which is fine because
//    Whatnot copies the images in when you import; the link only needs to be live then.
//  - Optional: if a custom relay URL is set in Settings, use it instead (permanent Catbox).
async function uploadOne(jpg) {
  let url;
  if (SETTINGS.endpoint) {
    const fd = new FormData();
    fd.append('file', jpg, jpg.name || 'photo.jpg');
    const r = await fetch(SETTINGS.endpoint, { method: 'POST', body: fd });
    url = (await r.text()).trim();
  } else {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '72h');
    fd.append('fileToUpload', jpg, jpg.name || 'photo.jpg');
    const r = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: fd });
    url = (await r.text()).trim();
  }
  if (!/^https?:\/\//.test(url)) throw new Error(url || 'upload failed');
  return url.replace(/^http:/, 'https:');
}

$('#upload').addEventListener('click', uploadAll);
async function uploadAll() {
  if (!PHOTOS.length) { toast('Add photos first.'); return; }
  const btn = $('#upload'); btn.disabled = true;
  const todo = PHOTOS.filter((p) => !UPLOADED.has(p.id));
  let done = 0, fail = 0;
  for (const p of PHOTOS) {
    if (UPLOADED.has(p.id)) continue;
    setStatus($('#upload-status'), '<span class="spinner"></span> Uploading ' + (done + fail + 1) + ' of ' + todo.length + '…');
    try {
      const jpg = await toJpeg(p);
      UPLOADED.set(p.id, await uploadOne(jpg));
      done++;
    } catch (e) { fail++; }
  }
  btn.disabled = false;
  const total = PHOTOS.length, have = UPLOADED.size;
  const temp = !SETTINGS.endpoint;
  if (fail) setStatus($('#upload-status'), '⚠ ' + have + '/' + total + ' uploaded, ' + fail + ' failed. Tap Upload again to retry.', 'err');
  else setStatus($('#upload-status'), '✓ All ' + total + ' photos uploaded.' + (temp ? ' (Links last ~3 days — do your Whatnot import within that.)' : ''), 'ok');
}

$('#build').addEventListener('click', buildCsv);
async function buildCsv() {
  if (!PHOTOS.length) { toast('Add photos first.'); return; }
  const items = buildItems();
  const letter = ($('#show-letter').value || SETTINGS.letter || 'A').toUpperCase();
  const showName = ($('#show-name').value || 'whatnot').trim();
  const warnings = [];
  const rows = [CSV_HEADERS];

  items.forEach((it, idx) => {
    const code = letter + (idx + 1);
    const d = getData(it.startId);
    let title = (d.title || '').trim();
    if (title && !new RegExp('^' + code + '\\b').test(title)) title = code + ' ' + title;
    if (!title) warnings.push(code + ': no title');
    if (!d.price) warnings.push(code + ': no price');

    const urls = it.photos.map((p) => UPLOADED.get(p.id)).filter(Boolean).slice(0, MAX_IMAGES);
    if (!urls.length) warnings.push(code + ': no image links (upload first)');

    const row = [CATEGORY, SUB_CATEGORY, title, d.description || '', '1', d.type || 'Buy it Now',
      d.price || '', d.shipping || '', 'TRUE', 'Not Hazmat', d.condition || 'Used', '', ''];
    for (let i = 0; i < MAX_IMAGES; i++) row.push(urls[i] || '');
    rows.push(row);
  });

  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const fname = showName.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() + '-whatnot-import.csv';
  const file = new File([new Blob(['﻿' + csv], { type: 'text/csv' })], fname, { type: 'text/csv' });

  const msg = warnings.length
    ? '⚠ Built with ' + warnings.length + ' thing(s) to check:\n' + warnings.slice(0, 8).join('\n') + (warnings.length > 8 ? '\n…' : '')
    : '✓ ' + items.length + ' items ready.';
  setStatus($('#build-status'), msg, warnings.length ? 'err' : 'ok');

  // Share (iOS lets you Save to Files or send to the Whatnot app); fall back to download.
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: fname });
      return;
    }
  } catch (e) { /* user cancelled or unsupported -> download */ }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
}

function csvCell(v) {
  v = String(v == null ? '' : v);
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// ============================================================================
//  SETTINGS
// ============================================================================
function openSettings() { $('#settings').classList.add('open'); }
$('#gear').addEventListener('click', openSettings);
$('#gear-close').addEventListener('click', () => $('#settings').classList.remove('open'));
$('#settings-done').addEventListener('click', () => { $('#settings').classList.remove('open'); renderItems(); });
$('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').classList.remove('open'); });

$('#help-toggle').addEventListener('click', () => {
  const h = $('#help'); h.classList.toggle('hidden');
  $('#help-toggle').textContent = h.classList.contains('hidden') ? 'How to set this up ▾' : 'Hide setup ▴';
});

$('#endpoint').addEventListener('input', (e) => { SETTINGS.endpoint = e.target.value.trim(); saveSettings(); });
$('#def-price').addEventListener('input', (e) => { SETTINGS.price = e.target.value.trim(); saveSettings(); });
$('#def-type').addEventListener('change', (e) => { SETTINGS.type = e.target.value; saveSettings(); });
$('#def-condition').addEventListener('change', (e) => { SETTINGS.condition = e.target.value; saveSettings(); });
$('#def-shipping').addEventListener('change', (e) => { SETTINGS.shipping = e.target.value; saveSettings(); });

const HELP_HTML =
  '<b>Optional — only if you want image links that never expire.</b> By default the app uploads to a free temporary host (~3-day links), which is fine because Whatnot copies the images in at import. For permanent links, run your own tiny free relay:' +
  '<ol>' +
  '<li>On a computer, go to <code>dash.cloudflare.com</code> and make a free account.</li>' +
  '<li>Left menu: <b>Workers &amp; Pages</b> → <b>Create</b> → <b>Create Worker</b> → <b>Deploy</b>.</li>' +
  '<li>Click <b>Edit code</b>, delete what’s there, and paste the contents of <code>worker.js</code> (in this app’s folder). Click <b>Deploy</b>.</li>' +
  '<li>Copy the worker’s URL (looks like <code>https://something.workers.dev</code>).</li>' +
  '<li>Paste it in the box above. Done — your photos now upload through your own relay to Catbox.</li>' +
  '</ol>';

// ============================================================================
//  BOOT
// ============================================================================
(function init() {
  // populate selects
  $('#def-condition').innerHTML = opts(CONDITIONS, SETTINGS.condition);
  $('#def-shipping').innerHTML = opts(['', ...SHIPPING], SETTINGS.shipping);
  // restore settings into the UI
  $('#endpoint').value = SETTINGS.endpoint || '';
  $('#def-price').value = SETTINGS.price || '';
  $('#def-type').value = SETTINGS.type || 'Buy it Now';
  $('#show-letter').value = SETTINGS.letter || 'A';
  $('#help').innerHTML = HELP_HTML;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
