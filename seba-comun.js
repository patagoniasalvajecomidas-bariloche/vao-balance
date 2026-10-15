// ===============================
// SEBA BALANCE — funciones comunes de las pantallas (STAGING)
// Conexión al servidor, formatos, identificadores, avisos y 🐞 Reportar problema.
// No guarda claves ni PIN. El token de sesión vive en este celular (localStorage), igual que VAO POS.
// ===============================
(function () {
  var CFG = window.SEBA_CONFIG || {};
  var API_URL = String(CFG.API_URL || '');
  var S = window.SEBA = {};
  S.APP = 'SEBA BALANCE';
  S.configurado = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(API_URL);
  S.prefijo = (new URLSearchParams(location.search).get('p') || '').trim().toUpperCase();
  S.prefijoValido = /^[A-Z]{2,3}$/.test(S.prefijo);
  S.tokenKey = function () { return 'seba_token_' + S.prefijo; };
  S.token = function () { try { return localStorage.getItem(S.tokenKey()) || ''; } catch (e) { return ''; } };
  S.setToken = function (t) { try { t ? localStorage.setItem(S.tokenKey(), t) : localStorage.removeItem(S.tokenKey()); } catch (e) {} };
  S.ls = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // Devuelve el JSON del servidor, o null si no hubo respuesta (sin internet / corte / tiempo agotado).
  // null NUNCA significa "se guardó": la operación queda pendiente para reintentar.
  S.api = async function (action, data, opciones) {
    opciones = opciones || {};
    if (!S.configurado) return { error: 'Falta configurar la dirección del servidor (seba-config.js)', definitivo: true, success: false };
    var px = opciones.prefijo !== undefined ? opciones.prefijo : S.prefijo;
    var d = Object.assign({}, data || {});
    if (opciones.token !== false && !d.token) d.token = S.token();
    var url = API_URL + '?action=' + encodeURIComponent(action) + '&prefijo=' + encodeURIComponent(px) + '&data=' + encodeURIComponent(JSON.stringify(d));
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opciones.timeout || 45000) : null;
    try {
      var r;
      if (url.length <= 1900) r = await fetch(url, { redirect: 'follow', signal: ctrl ? ctrl.signal : undefined });
      else r = await fetch(API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, prefijo: px, data: d }), signal: ctrl ? ctrl.signal : undefined });
      var txt = await r.text();
      try { return JSON.parse(txt); } catch (e) { return null; }
    } catch (e) {
      return null;
    } finally { if (timer) clearTimeout(timer); }
  };

  // ── formatos ──
  S.fmt = function (n) {
    n = Number(n) || 0;
    var dec = Math.round(Math.abs(n) * 100) % 100 !== 0;
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: 2 });
  };
  S.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  S.hoy = function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  S.fechaCorta = function (iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : iso; };
  // Importe escrito por la persona: acepta 1500 · 1.500 · 1500,50 · 1.500,50 · $ 1500
  S.leerImporte = function (txt) {
    var t = String(txt == null ? '' : txt).trim().replace(/[$\s]/g, '');
    if (!t) return null;
    if (!/^[\d.,]+$/.test(t)) return NaN;
    if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    var n = Number(t);
    if (!isFinite(n)) return NaN;
    return Math.round(n * 100) / 100;
  };
  S.suma = function (lista, f) { var c = 0; lista.forEach(function (x) { c += Math.round((Number(f(x)) || 0) * 100); }); return c / 100; };

  // ── identificadores (como el VentaId de VAO POS) ──
  function azar(n) {
    var ch = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', s = '', rnd = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(rnd) : rnd.forEach(function (_, i) { rnd[i] = Math.floor(Math.random() * 256); });
    for (var i = 0; i < n; i++) s += ch[rnd[i] % 36];
    return s;
  }
  S.nuevoMovId = function () {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return S.prefijo + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + azar(4);
  };
  S.nuevoOpId = function () { return 'OP_' + Date.now().toString(36).toUpperCase() + '_' + azar(6); };

  S.colorPorPrefijo = function (prefijo) {
    var paletas = [['#0A2472', '#1E88E5'], ['#2d7d5a', '#6db890'], ['#c45c1a', '#f0944a'], ['#1a5c8a', '#5aaad4'],
      ['#8a2d5a', '#d47aaa'], ['#5a6b1a', '#a0b84a'], ['#2d3d8a', '#6a7ecb'], ['#8a5a1a', '#d4a24a']];
    var h = 0; for (var i = 0; i < prefijo.length; i++) h += prefijo.charCodeAt(i);
    return paletas[h % paletas.length];
  };

  S.toast = function (msg, tipo, ms) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast ' + (tipo || '') + ' visible';
    clearTimeout(S._tt);
    S._tt = setTimeout(function () { t.className = 'toast'; }, ms || 2800);
  };

  // Mensaje estándar para una respuesta que NO es éxito.
  // sinRed: texto para cuando no hubo respuesta (por defecto: quedó guardado para reintentar).
  S.motivo = function (r, sinRed) {
    if (!r) return '❌ Sin respuesta del servidor. ' + (sinRed || 'Quedó guardado en este celular: tocá de nuevo para reintentar (no se duplica).');
    if (r.ocupado) return '⏳ Servidor ocupado. Reintentá en unos segundos.';
    if (r.sesion) return '🔒 ' + (r.error || 'Sesión vencida') + '. Ingresá tu PIN.';
    return '❌ ' + (r.error || 'No se pudo completar');
  };

  // ── 🐞 Reportar problema (texto en memoria, NO en localStorage; mismo opId en cada reintento) ──
  var bug = { opId: '', enviado: null };
  function css() {
    if (document.getElementById('sbBugCss')) return;
    var st = document.createElement('style'); st.id = 'sbBugCss';
    st.textContent = '.sb-bg{position:fixed;inset:0;background:rgba(17,24,39,.6);z-index:6000;display:flex;align-items:flex-end;justify-content:center}' +
      '.sb-sheet{background:#fff;border-radius:22px 22px 0 0;width:100%;max-width:480px;max-height:92dvh;overflow-y:auto;padding:16px 18px calc(18px + env(safe-area-inset-bottom));font-family:"DM Sans",sans-serif;color:#3d3244}' +
      '.sb-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.sb-t{font-family:"Playfair Display",serif;font-weight:700;color:#0D47A1;font-size:1.05rem}' +
      '.sb-x{border:none;background:#E3F2FD;border-radius:50%;width:30px;height:30px;font-size:1rem;color:#0D47A1}' +
      '.sb-tipos{display:flex;gap:8px;margin-bottom:10px}.sb-tipo{flex:1;padding:10px;border:2px solid #E3F2FD;border-radius:14px;background:#fff;font-weight:700;color:#6b6572;font-family:inherit}' +
      '.sb-tipo.on{border-color:#1E88E5;background:#E3F2FD;color:#0D47A1}.sb-ta{width:100%;min-height:110px;border:2px solid #E3F2FD;border-radius:12px;padding:10px;font:inherit;font-size:16px}' +
      '.sb-nota{font-size:.75rem;color:#6b6572;margin:6px 0 10px;line-height:1.35}.sb-btn{width:100%;padding:13px;border:none;border-radius:50px;font-weight:900;font-size:.95rem;font-family:inherit;margin-bottom:8px}' +
      '.sb-ok{background:linear-gradient(135deg,#f07d3a,#d4622a);color:#fff}.sb-sec{background:#E3F2FD;color:#0D47A1}.sb-msg{font-size:.85rem;min-height:18px;margin-bottom:8px}';
    document.head.appendChild(st);
  }
  S.reportar = function (pantalla) {
    css();
    var viejo = document.getElementById('sbBug'); if (viejo) viejo.remove();
    var bg = document.createElement('div'); bg.className = 'sb-bg'; bg.id = 'sbBug';
    bg.innerHTML = '<div class="sb-sheet" role="dialog" aria-label="Reportar problema"><div class="sb-h"><span class="sb-t">🐞 Reportar problema</span><button class="sb-x" id="sbX" aria-label="Cerrar">✕</button></div>' +
      '<div class="sb-tipos"><button class="sb-tipo on" data-t="ERROR">Algo anda mal</button><button class="sb-tipo" data-t="SUGERENCIA">Sugerencia</button></div>' +
      '<textarea class="sb-ta" id="sbTxt" maxlength="2000" placeholder="Contá qué pasó o qué te gustaría (sin poner tu PIN)"></textarea>' +
      '<div class="sb-nota">Se envía junto con la pantalla (' + S.esc(pantalla || '') + '), la versión y el tipo de celular. Nunca se envían tu PIN ni tus datos de acceso.</div>' +
      '<div class="sb-msg" id="sbMsg"></div><button class="sb-btn sb-ok" id="sbEnviar">Enviar</button><button class="sb-btn sb-sec" id="sbCopiar">Copiar texto</button></div>';
    document.body.appendChild(bg);
    var tipo = 'ERROR', ta = bg.querySelector('#sbTxt'), msg = bg.querySelector('#sbMsg'), btn = bg.querySelector('#sbEnviar');
    if (bug.borrador) ta.value = bug.borrador;
    if (bug.tipo) tipo = bug.tipo;
    bg.querySelectorAll('.sb-tipo').forEach(function (b) {
      b.classList.toggle('on', b.dataset.t === tipo);
      b.onclick = function () { tipo = b.dataset.t; bug.tipo = tipo; bg.querySelectorAll('.sb-tipo').forEach(function (x) { x.classList.toggle('on', x === b); }); };
    });
    ta.oninput = function () { bug.borrador = ta.value; if (bug.opId && !bug.enviando) { /* texto cambiado: sigue el mismo envío pendiente */ } };
    bg.querySelector('#sbX').onclick = function () { bg.remove(); };
    bg.onclick = function (e) { if (e.target === bg) bg.remove(); };
    bg.querySelector('#sbCopiar').onclick = function () {
      var t = '[' + tipo + '] ' + ta.value + '\n— ' + S.APP + ' · ' + S.prefijo + ' · ' + (pantalla || '') + ' · v' + (window.APP_VERSION || '?');
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg.textContent = '📋 Copiado'; }, function () {
        ta.select(); try { document.execCommand('copy'); msg.textContent = '📋 Copiado'; } catch (e) { msg.textContent = 'Seleccioná el texto y copialo a mano'; } });
    };
    btn.onclick = async function () {
      var txt = ta.value.trim();
      if (txt.length < 5) { msg.textContent = 'Contá un poco más (mínimo 5 letras)'; return; }
      if (!bug.opId) bug.opId = S.nuevoOpId();
      btn.disabled = true; btn.textContent = 'Enviando...'; msg.textContent = '';
      var r = await S.api('reportarIncidencia', { opId: bug.opId, tipo: tipo, descripcion: txt, pantalla: pantalla || '', version: String(window.APP_VERSION || ''), navegador: navigator.userAgent.slice(0, 250) });
      btn.disabled = false; btn.textContent = 'Enviar';
      if (r && r.success) {
        bug = { opId: '' };
        bg.querySelector('.sb-sheet').innerHTML = '<div class="sb-h"><span class="sb-t">✅ Reporte enviado</span></div><p style="margin:6px 0 14px">Número de reporte: <b>' + S.esc(r.id) + '</b>' + (r.yaExistia ? ' (ya había llegado)' : '') + '</p><button class="sb-btn sb-sec" onclick="document.getElementById(\'sbBug\').remove()">Cerrar</button>';
      } else if (r && r.definitivo) {
        bug.opId = ''; msg.textContent = '❌ ' + (r.error || 'No se pudo enviar');
      } else {
        msg.textContent = r && r.sesion ? '🔒 Sesión vencida: copiá el texto, volvé a entrar y reintentá.' : '❌ No llegó. Tu texto sigue acá: tocá Enviar de nuevo (no se duplica).';
      }
    };
  };

  // ── marca STAGING (igual que VAO POS) ──
  if (CFG.ENTORNO !== 'produccion') {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.id = 'sebaStagingBadge';
      b.textContent = '🧪 STAGING · sistema de pruebas';
      b.style.cssText = 'position:fixed;left:6px;bottom:' + (window.SEBA_BADGE_BOTTOM || 6) + 'px;z-index:99999;padding:3px 8px;border-radius:10px;background:rgba(255,120,0,0.88);color:#fff;font:600 11px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.25);';
      document.body.appendChild(b);
      if (document.title.indexOf('[STAGING]') !== 0) document.title = '[STAGING] ' + document.title;
    });
  }
})();
