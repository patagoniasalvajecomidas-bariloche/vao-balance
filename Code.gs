// ===============================
// 🟩 PROYECTO: SEBA BALANCE — STAGING
// 🧩 Arquitectura: 1 planilla, multihojas por cliente (igual que VAO POS)
// 🎯 Origen: esqueleto de VAO POS Code v023 (admin, PIN, sesiones, vigencia,
//    candado + ID de operación) adaptado a finanzas: gasto/ingreso en lugar de producto.
// 📊 Planilla: SEBA_BALANCE_STAGING (este script va VINCULADO a ella)
// 📁 Repo: github.com/patagoniasalvajecomidas-bariloche/vao-balance
// ⚠️ ESTE ES EL SISTEMA DE PRUEBAS — NO PRODUCCIÓN
// ⚠️ Independiente de VAO POS, Copihue y SmartPOS: no usa sus planillas ni scripts.
// ===============================
//
// FUNCIONES PARA EJECUTAR A MANO (▶ Ejecutar en el editor):
//   instalar()            → revisa/crea las hojas globales (se puede repetir)
//   generarClaveAdmin()   → crea una clave admin AL AZAR y la muestra UNA vez en el registro
//   diagnostico()         → estado general
//
// HOJAS GLOBALES: CLIENTES, PERFILES, PLANTILLA_CATALOGO, PLANTILLA_CUENTAS, INCIDENCIAS
// HOJAS POR CLIENTE (XX = prefijo): CATALOGO_XX, MOVIMIENTOS_XX, CUENTAS_XX,
//   DEUDAS_XX, COMPROMISOS_XX, CONFIG_XX
//
// CERO HARDCODE COMERCIAL: categorías, conceptos, precios y cuentas viven en la planilla.
// Respuestas: {success:true,...} | {success:false, definitivo:true, error} (rechazo seguro: no se escribió nada)
//             | {error, ocupado|sesion} (no definitivo: el celular conserva la operación y reintenta)
// ===============================

var SISTEMA = {
  proyecto: 'SEBA BALANCE',
  entorno: 'staging',
  version: 'v002',
  arquitectura: '1 planilla, multihojas por cliente',
  origen: 'VAO POS Code v023'
};
var TZ = 'America/Argentina/Buenos_Aires';

var COLS = {
  CLIENTES: ['Prefijo', 'Nombre', 'Contacto', 'Telefono', 'Correo', 'Perfil', 'Estado', 'FechaAlta', 'FechaVence', 'Observaciones'],
  PERFILES: ['PerfilId', 'Nombre', 'Descripcion', 'Orden', 'Activo'],
  PLANTILLA_CATALOGO: ['PerfilId', 'Tipo', 'Categoria', 'Concepto', 'PrecioSugerido', 'Orden', 'Activo'],
  PLANTILLA_CUENTAS: ['PerfilId', 'Cuenta', 'TipoCuenta', 'Orden', 'Activo'],
  INCIDENCIAS: ['Id', 'FechaServidor', 'Estado', 'Prefijo', 'Tipo', 'Descripcion', 'Pantalla', 'VersionApp', 'Navegador', 'OpId', 'NotasRevision'],
  CATALOGO: ['Codigo', 'Concepto', 'Categoria', 'Tipo', 'PrecioSugerido', 'Activo', 'Orden', 'FechaAlta', 'OpId'],
  MOVIMIENTOS: ['FechaRegistro', 'FechaOperacion', 'Tipo', 'Categoria', 'Concepto', 'Codigo', 'Descripcion', 'Importe',
                'Cuenta', 'CuentaDestino', 'MovId', 'Renglon', 'Estado', 'MotivoAnulacion', 'DeudaId', 'CompromisoId', 'Periodo', 'FechaAnulacion'],
  CUENTAS: ['Codigo', 'Cuenta', 'TipoCuenta', 'SaldoInicial', 'Activo', 'Orden', 'FechaAlta', 'OpId'],
  DEUDAS: ['DeudaId', 'Sentido', 'Persona', 'Telefono', 'Descripcion', 'Importe', 'Fecha', 'Vence', 'Estado', 'OpId', 'MotivoAnulacion'],
  COMPROMISOS: ['CompromisoId', 'Nombre', 'CodigoConcepto', 'ImporteEstimado', 'DiaVence', 'CuentaSugerida', 'Activo', 'OpId'],
  CONFIG: ['campo', 'valor', 'notas']
};
var TIPOS = ['GASTO', 'INGRESO'];
var TIPOS_CUENTA = ['EFECTIVO', 'BANCO', 'BILLETERA', 'TARJETA', 'OTRA'];
var ESTADOS_INCIDENCIA = ['NUEVO', 'EN REVISIÓN', 'RESUELTO', 'DESCARTADO'];

// ===============================
// ENTRADA WEB (mismo esquema que VAO POS: ?action=&prefijo=&data=)
// ===============================
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';
  var prefijo = String(p.prefijo || '').trim().toUpperCase();
  var data = {};
  var result;
  try {
    data = p.data ? JSON.parse(p.data) : {};
  } catch (x) {
    try { data = JSON.parse(decodeURIComponent(p.data)); } catch (y) { return respuestaJSON({ error: 'Datos inválidos', definitivo: true, success: false }); }
  }
  try {
    var t = data.token || '';
    // ── públicas (sin datos privados) ──
    if (action === 'getInfo') result = getInfo();
    else if (action === 'clienteLogin') result = clienteLogin(data);
    else if (action === 'adminLogin') result = adminLogin(data);
    else if (action === 'cerrarSesion') result = cerrarSesionCliente(prefijo, t);
    else if (action === 'cerrarSesionAdmin') result = cerrarSesionAdmin(t);
    // ── cliente (requieren sesión de ESE prefijo) ──
    else if (ACCIONES_CLIENTE[action]) {
      var err = _requiereSesionValida_(prefijo, t);
      if (err) result = { error: err, sesion: true };
      else result = ACCIONES_CLIENTE[action](prefijo, data);
    }
    // ── admin ──
    else if (ACCIONES_ADMIN[action]) {
      if (!validarSesionAdmin(t)) result = { error: 'Sesión admin inválida o expirada', sesion: true };
      else result = ACCIONES_ADMIN[action](data);
    }
    else result = { error: 'Acción no reconocida: ' + action, success: false, definitivo: true };
  } catch (err2) {
    result = { error: err2.message };
  }
  return respuestaJSON(result);
}

// POST (para boletas largas que no entran en una URL): mismo ruteo que doGet.
function doPost(e) {
  var b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return respuestaJSON({ error: 'Datos inválidos', definitivo: true, success: false }); }
  return doGet({ parameter: { action: String(b.action || ''), prefijo: String(b.prefijo || ''), data: JSON.stringify(b.data || {}) } });
}

var ACCIONES_CLIENTE = {
  getConfig: function (px) { return getConfig(px); },
  getEstado: function (px, d) { return getEstado(px, d); },
  getMovimientos: function (px, d) { return getMovimientos(px, d); },
  registrarBoleta: function (px, d) { return _conCandado_(function () { return registrarBoleta(px, d); }); },
  registrarTransferencia: function (px, d) { return _conCandado_(function () { return registrarTransferencia(px, d); }); },
  anularMovimiento: function (px, d) { return _conCandado_(function () { return anularMovimiento(px, d); }); },
  crearConcepto: function (px, d) { return _conCandado_(function () { return crearConcepto(px, d); }); },
  editarConcepto: function (px, d) { return _conCandado_(function () { return editarConcepto(px, d); }); },
  crearCuenta: function (px, d) { return _conCandado_(function () { return crearCuenta(px, d); }); },
  editarCuenta: function (px, d) { return _conCandado_(function () { return editarCuenta(px, d); }); },
  getDeudas: function (px) { return getDeudas(px); },
  crearDeuda: function (px, d) { return _conCandado_(function () { return crearDeuda(px, d); }); },
  pagarDeuda: function (px, d) { return _conCandado_(function () { return pagarDeuda(px, d); }); },
  anularDeuda: function (px, d) { return _conCandado_(function () { return anularDeuda(px, d); }); },
  getCompromisos: function (px, d) { return getCompromisos(px, d); },
  crearCompromiso: function (px, d) { return _conCandado_(function () { return crearCompromiso(px, d); }); },
  editarCompromiso: function (px, d) { return _conCandado_(function () { return editarCompromiso(px, d); }); },
  reportarIncidencia: function (px, d) { return _conCandado_(function () { return reportarIncidencia(px, d); }); },
  verificarOperacion: function (px, d) { return verificarOperacion(px, d); }
};
var ACCIONES_ADMIN = {
  getResumenAdmin: function () { return getResumenAdmin(); },
  getPerfiles: function () { return getPerfiles(); },
  crearCliente: function (d) { return _conCandado_(function () { return crearCliente(d); }); },
  activarCliente: function (d) { return _setEstadoCliente_(d.prefijo, 'ACTIVO'); },
  suspenderCliente: function (d) { return _setEstadoCliente_(d.prefijo, 'SUSPENDIDO'); },
  resetPin: function (d) { return resetPinCliente(d); },
  renovarVigencia: function (d) { return renovarVigenciaCliente(d); },
  getIncidencias: function (d) { return getIncidencias(d); }
};

function getInfo() {
  return { ok: true, sistema: SISTEMA, planillaVinculada: !!SpreadsheetApp.getActiveSpreadsheet(), fechaConsulta: _ahora_() };
}

// ===============================
// HELPERS (de VAO POS)
// ===============================
function respuestaJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _parseNumeroFlexible(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  if (typeof valor !== 'string') return 0;
  var texto = valor.trim();
  if (texto === '') return 0;
  texto = texto.replace(/[^0-9.,-]/g, '');
  if (texto === '' || texto === '-') return 0;
  var tieneComa = texto.indexOf(',') !== -1, tienePunto = texto.indexOf('.') !== -1;
  if (tieneComa && tienePunto) texto = texto.replace(/\./g, '').replace(',', '.');
  else if (tieneComa) texto = texto.replace(',', '.');
  else if (tienePunto) {
    var partes = texto.split('.');
    if (partes.length === 2 && partes[1].length === 3) texto = texto.replace('.', '');
  }
  var n = parseFloat(texto);
  return isNaN(n) ? 0 : n;
}
function _esActivoFlag_(valor) {
  if (valor === true) return true;
  if (typeof valor !== 'string') return false;
  return ['SI', 'SÍ', 'TRUE', 'VERDADERO', 'X', '1'].indexOf(valor.trim().toUpperCase()) !== -1;
}
function _t(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function _ahora_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function _hoy_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function _fechaTxt_(v) { return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : _t(v); }
function _cent(v) { return Math.round(_parseNumeroFlexible(v) * 100); }
function _pesos(c) { return Math.round(c) / 100; }
function _def(msg) { return { success: false, definitivo: true, error: msg }; }
function _fechaValida_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(_t(s))) return false;
  var p = s.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
  return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2] && p[0] >= 2000 && p[0] <= 2100;
}
function _periodoValido_(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(_t(s)); }
function _importe_(v) {
  var n = typeof v === 'number' ? v : _parseNumeroFlexible(String(v));
  if (!isFinite(n) || n <= 0 || n >= 1e12) return null;
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null;
  return Math.round(n * 100) / 100;
}
function _opIdValido_(s) { return /^[A-Za-z0-9_-]{8,80}$/.test(_t(s)); }

function _conCandado_(fn) {
  var lock = LockService.getScriptLock();
  var tiene = false;
  try { tiene = lock.tryLock(10000); } catch (e) { tiene = false; }
  if (!tiene) return { error: 'Sistema ocupado, reintentar', ocupado: true };
  try { return fn(); } finally { lock.releaseLock(); }
}

// ===============================
// ACCESO A HOJAS (por nombre de columna)
// ===============================
function _ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function _hoja_(nombre) {
  var h = _ss_().getSheetByName(nombre);
  if (!h) throw new Error('No existe hoja ' + nombre);
  return h;
}
function _tabla_(nombre, cols) {
  var h = _hoja_(nombre);
  var datos = h.getDataRange().getValues();
  var enc = (datos[0] || []).map(function (x) { return String(x).trim(); });
  var faltan = (cols || []).filter(function (c) { return enc.indexOf(c) === -1; });
  if (faltan.length) throw new Error('En ' + nombre + ' faltan columnas: ' + faltan.join(', '));
  var filas = [];
  for (var i = 1; i < datos.length; i++) {
    var r = datos[i];
    if (r.every(function (v) { return v === '' || v === null; })) continue;
    var o = { _fila: i + 1 };
    for (var j = 0; j < enc.length; j++) if (enc[j]) o[enc[j]] = r[j];
    filas.push(o);
  }
  return { hoja: h, enc: enc, filas: filas };
}
function _ultimaFila_(h) {
  var d = h.getDataRange().getValues();
  for (var i = d.length - 1; i >= 1; i--) if (d[i].some(function (v) { return v !== '' && v !== null; })) return i + 1;
  return 1;
}
// Agrega filas: los textos se guardan como TEXTO (las fechas AAAA-MM-DD no se convierten).
function _agregar_(nombre, objetos) {
  if (!objetos.length) return;
  var h = _hoja_(nombre);
  var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  var valores = objetos.map(function (o) { return enc.map(function (c) { return (c in o && o[c] !== null && o[c] !== undefined) ? o[c] : ''; }); });
  var formatos = objetos.map(function (o) { return enc.map(function (c) { var v = o[c]; return typeof v === 'number' ? (/Importe|Saldo|Precio/.test(c) ? '#,##0.00' : '0') : (typeof v === 'boolean' ? 'General' : '@'); }); });
  var r = h.getRange(_ultimaFila_(h) + 1, 1, objetos.length, enc.length);
  r.setNumberFormats(formatos);
  r.setValues(valores);
}
function _actualizar_(nombre, fila, cambios) {
  var h = _hoja_(nombre);
  var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  Object.keys(cambios).forEach(function (k) {
    var c = enc.indexOf(k);
    if (c === -1) throw new Error('En ' + nombre + ' falta la columna ' + k);
    var v = cambios[k];
    var celda = h.getRange(fila, c + 1);
    celda.setNumberFormat(typeof v === 'number' ? (/Importe|Saldo|Precio/.test(k) ? '#,##0.00' : '0') : (typeof v === 'boolean' ? 'General' : '@'));
    celda.setValue(v === null ? '' : v);
  });
}
function _crearHojaSiFalta_(nombre, columnas) {
  var ss = _ss_();
  var h = ss.getSheetByName(nombre);
  if (h) return h;
  h = ss.insertSheet(nombre);
  h.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold').setBackground('#0D47A1').setFontColor('#FFFFFF');
  h.setFrozenRows(1);
  return h;
}
function _hojaCli_(base, prefijo) { return base + '_' + prefijo; }

// ===============================
// CLAVE ADMIN (nunca escrita en el código)
// ===============================
function generarClaveAdmin() {
  var clave = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  PropertiesService.getScriptProperties().setProperty('ADMIN_CLAVE_HASH', _hash_(clave, 'ADMIN'));
  Logger.log('✅ Clave admin NUEVA: ' + clave);
  Logger.log('   Anotala ahora. No queda guardada en ningún lado (solo su huella). Si la perdés, ejecutá esto de nuevo.');
}
function _hash_(texto, sal) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'SEBA|' + sal + '|' + texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function generarToken(largo) {
  var t = '';
  while (t.length < (largo || 32)) t += Utilities.getUuid().replace(/-/g, '');
  return t.slice(0, largo || 32);
}
function generarPinAleatorio() {
  var u = Utilities.getUuid().replace(/[^0-9]/g, '') + String(Math.random()).slice(2);
  return String(100000 + (parseInt(u.slice(0, 9), 10) % 900000));
}

function adminLogin(data) {
  var clave = _t(data.clave);
  if (!clave) return { error: 'Clave requerida' };
  var props = PropertiesService.getScriptProperties();
  var h = props.getProperty('ADMIN_CLAVE_HASH');
  if (!h) return { error: 'Sistema no configurado — ejecutar generarClaveAdmin() en el editor' };
  if (_hash_(clave, 'ADMIN') !== h) return { error: 'Clave incorrecta' };
  var token = 'ADMIN_' + generarToken(24);
  var expira = new Date().getTime() + 10 * 60 * 1000;
  props.setProperty('SESSION_ADMIN_' + token, JSON.stringify({ token: token, expira: expira }));
  return { success: true, token: token, expira: expira };
}
function validarSesionAdmin(token) {
  if (!token || String(token).indexOf('ADMIN_') !== 0) return false;
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SESSION_ADMIN_' + token);
  if (!s) return false;
  try {
    var ses = JSON.parse(s);
    if (ses.token !== token) return false;
    if (new Date().getTime() > ses.expira) { props.deleteProperty('SESSION_ADMIN_' + token); return false; }
    props.setProperty('SESSION_ADMIN_' + token, JSON.stringify({ token: token, expira: new Date().getTime() + 10 * 60 * 1000 }));
    return true;
  } catch (e) { return false; }
}
function cerrarSesionAdmin(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('SESSION_ADMIN_' + token);
  return { success: true };
}

// ===============================
// CLIENTES, PIN, SESIONES, VIGENCIA (de VAO POS, en una sola hoja CLIENTES)
// ===============================
function _clienteFila_(prefijo) {
  var t = _tabla_('CLIENTES', COLS.CLIENTES);
  for (var i = 0; i < t.filas.length; i++) if (_t(t.filas[i].Prefijo).toUpperCase() === prefijo) return t.filas[i];
  return null;
}
function obtenerInfoCliente(prefijo) {
  var f = _clienteFila_(prefijo);
  if (!f) return null;
  return { prefijo: prefijo, nombre: _t(f.Nombre), activo: _t(f.Estado).toUpperCase() === 'ACTIVO', perfil: _t(f.Perfil) };
}
function _obtenerVigenciaCliente_(prefijo) {
  var f = _clienteFila_(prefijo);
  if (!f || !f.FechaVence) return { vigente: true, fechaVence: null };
  var fv = f.FechaVence instanceof Date ? f.FechaVence : new Date(String(f.FechaVence).slice(0, 10) + 'T00:00:00');
  if (isNaN(fv.getTime())) return { vigente: true, fechaVence: null };
  var hoy = new Date(), hoyDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  var venceDia = new Date(fv.getFullYear(), fv.getMonth(), fv.getDate());
  return { vigente: hoyDia <= venceDia, fechaVence: Utilities.formatDate(venceDia, TZ, 'yyyy-MM-dd') };
}
function setPIN(prefijo, pin) {
  PropertiesService.getScriptProperties().setProperty('PIN_' + prefijo, _hash_(pin, 'PIN_' + prefijo));
}
function clienteLogin(data) {
  var prefijo = _t(data.prefijo).toUpperCase(), pin = _t(data.pin);
  if (!prefijo) return { error: 'Código requerido' };
  if (!/^\d{6}$/.test(pin)) return { error: 'El PIN debe tener 6 números' };
  var info = obtenerInfoCliente(prefijo);
  if (!info) return { error: 'Cliente no encontrado' };
  if (!info.activo) return { error: 'Cliente inactivo — contactar a VAO Sistemas' };
  if (!_obtenerVigenciaCliente_(prefijo).vigente) return { error: 'Suscripción vencida — contactar a VAO Sistemas' };
  var props = PropertiesService.getScriptProperties();
  // Bloqueo por intentos: 5 fallos → 15 minutos
  var kInt = 'INTENTOS_' + prefijo, intentos = {};
  try { intentos = JSON.parse(props.getProperty(kInt) || '{}'); } catch (e) { intentos = {}; }
  var ahora = new Date().getTime();
  if (intentos.hasta && ahora < intentos.hasta) return { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' };
  var h = props.getProperty('PIN_' + prefijo);
  if (!h) return { error: 'Acceso no configurado — contactar a VAO Sistemas' };
  if (_hash_(pin, 'PIN_' + prefijo) !== h) {
    var n = (intentos.n || 0) + 1;
    props.setProperty(kInt, JSON.stringify(n >= 5 ? { n: 0, hasta: ahora + 15 * 60 * 1000 } : { n: n }));
    return { error: 'PIN incorrecto' };
  }
  props.deleteProperty(kInt);
  var token = 'CLI_' + prefijo + '_' + generarToken(24);
  var expira = ahora + 7 * 24 * 60 * 60 * 1000;
  var todas = props.getProperties(), pref = 'SESSION_' + prefijo + '_';
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf(pref) !== 0) return;
    try { var s = JSON.parse(todas[k]); if (!s.expira || ahora > s.expira) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
  props.setProperty(pref + token, JSON.stringify({ token: token, expira: expira }));
  return { success: true, token: token, expira: expira, prefijo: prefijo, nombre: info.nombre };
}
function validarSesionCliente(prefijo, token) {
  if (!prefijo || !token || String(token).indexOf('CLI_' + prefijo + '_') !== 0) return false;
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SESSION_' + prefijo + '_' + token);
  if (!s) return false;
  try {
    var ses = JSON.parse(s);
    if (ses.token !== token) return false;
    if (new Date().getTime() > ses.expira) { props.deleteProperty('SESSION_' + prefijo + '_' + token); return false; }
    return true;
  } catch (e) { return false; }
}
function cerrarSesionCliente(prefijo, token) {
  if (prefijo && token) PropertiesService.getScriptProperties().deleteProperty('SESSION_' + prefijo + '_' + token);
  return { success: true };
}
function _requiereSesionValida_(prefijo, token) {
  var info = obtenerInfoCliente(prefijo);
  if (!info) return 'Cliente no encontrado';
  if (!info.activo) return 'Cliente inactivo — contactar a VAO Sistemas';
  if (!_obtenerVigenciaCliente_(prefijo).vigente) return 'Suscripción vencida — contactar a VAO Sistemas';
  if (!validarSesionCliente(prefijo, token)) return 'Sesión inválida o expirada';
  return null;
}

// ── ADMIN: clientes ──
function getPerfiles() {
  var perfiles = _tabla_('PERFILES', COLS.PERFILES).filas.filter(function (p) { return _esActivoFlag_(p.Activo) || p.Activo === true; })
    .map(function (p) { return { id: _t(p.PerfilId).toUpperCase(), nombre: _t(p.Nombre), descripcion: _t(p.Descripcion), orden: Number(p.Orden) || 99 }; })
    .sort(function (a, b) { return a.orden - b.orden; });
  return { success: true, perfiles: perfiles };
}
function crearCliente(data) {
  var prefijo = _t(data.prefijo).toUpperCase();
  var nombre = _t(data.nombre), perfilId = _t(data.perfil).toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(prefijo)) return _def('Prefijo inválido (2 o 3 letras)');
  if (!nombre) return _def('Nombre requerido');
  if (_clienteFila_(prefijo)) return _def('El prefijo ' + prefijo + ' ya existe');
  var perfil = getPerfiles().perfiles.filter(function (p) { return p.id === perfilId; })[0];
  if (!perfil) return _def('Elegí un perfil válido');
  var ss = _ss_();
  ['CATALOGO', 'MOVIMIENTOS', 'CUENTAS', 'DEUDAS', 'COMPROMISOS'].forEach(function (b) {
    if (ss.getSheetByName(_hojaCli_(b, prefijo))) throw new Error('Ya existe la hoja ' + _hojaCli_(b, prefijo) + ' (revisar a mano)');
  });
  ['CATALOGO', 'MOVIMIENTOS', 'CUENTAS', 'DEUDAS', 'COMPROMISOS', 'CONFIG'].forEach(function (b) { _crearHojaSiFalta_(_hojaCli_(b, prefijo), COLS[b]); });
  // Copiar plantilla del perfil (datos de la planilla, no del código)
  var ahora = _ahora_();
  var cat = _tabla_('PLANTILLA_CATALOGO', COLS.PLANTILLA_CATALOGO).filas
    .filter(function (r) { return _t(r.PerfilId).toUpperCase() === perfilId && (r.Activo === true || _esActivoFlag_(r.Activo)); })
    .sort(function (a, b) { return (Number(a.Orden) || 99) - (Number(b.Orden) || 99); });
  var nG = 0, nI = 0;
  var filasCat = cat.map(function (r) {
    var tipo = _t(r.Tipo).toUpperCase() === 'INGRESO' ? 'INGRESO' : 'GASTO';
    var cod = tipo === 'GASTO' ? 'G' + ('000' + (++nG)).slice(-3) : 'I' + ('000' + (++nI)).slice(-3);
    var precio = _parseNumeroFlexible(r.PrecioSugerido);
    return { Codigo: cod, Concepto: _t(r.Concepto).toUpperCase(), Categoria: _t(r.Categoria).toUpperCase(), Tipo: tipo,
      PrecioSugerido: precio > 0 ? precio : '', Activo: true, Orden: Number(r.Orden) || 99, FechaAlta: ahora, OpId: '' };
  });
  _agregar_(_hojaCli_('CATALOGO', prefijo), filasCat);
  var ctas = _tabla_('PLANTILLA_CUENTAS', COLS.PLANTILLA_CUENTAS).filas
    .filter(function (r) { return _t(r.PerfilId).toUpperCase() === perfilId && (r.Activo === true || _esActivoFlag_(r.Activo)); })
    .sort(function (a, b) { return (Number(a.Orden) || 99) - (Number(b.Orden) || 99); })
    .map(function (r, i) { return { Codigo: 'C' + ('00' + (i + 1)).slice(-2), Cuenta: _t(r.Cuenta).toUpperCase(), TipoCuenta: _t(r.TipoCuenta).toUpperCase() || 'OTRA', SaldoInicial: 0, Activo: true, Orden: i + 1, FechaAlta: ahora, OpId: '' }; });
  _agregar_(_hojaCli_('CUENTAS', prefijo), ctas);
  _agregar_(_hojaCli_('CONFIG', prefijo), [
    { campo: 'nombre', valor: nombre, notas: '' }, { campo: 'perfil', valor: perfilId, notas: perfil.nombre },
    { campo: 'moneda', valor: 'ARS', notas: '' }, { campo: 'zona_horaria', valor: TZ, notas: '' }
  ]);
  _agregar_('CLIENTES', [{ Prefijo: prefijo, Nombre: nombre, Contacto: _t(data.contacto), Telefono: _t(data.telefono), Correo: _t(data.correo).toLowerCase().replace(/\s+/g, ''),
    Perfil: perfilId, Estado: 'ACTIVO', FechaAlta: ahora, FechaVence: '', Observaciones: '' }]);
  var pin = generarPinAleatorio();
  setPIN(prefijo, pin);
  return { success: true, prefijo: prefijo, pin: pin, conceptos: filasCat.length, cuentas: ctas.length, mensaje: '✅ Cliente ' + nombre + ' (' + prefijo + ') creado' };
}
function _setEstadoCliente_(prefijo, estado) {
  prefijo = _t(prefijo).toUpperCase();
  var f = _clienteFila_(prefijo);
  if (!f) return { error: 'Cliente no encontrado' };
  _actualizar_('CLIENTES', f._fila, { Estado: estado });
  return { success: true, mensaje: (estado === 'ACTIVO' ? '✅ Cliente ' : '🔒 Cliente ') + prefijo + (estado === 'ACTIVO' ? ' activado' : ' suspendido') };
}
function resetPinCliente(data) {
  var prefijo = _t(data.prefijo).toUpperCase();
  if (!_clienteFila_(prefijo)) return { error: 'Cliente no encontrado' };
  var pin = generarPinAleatorio();
  setPIN(prefijo, pin);
  PropertiesService.getScriptProperties().deleteProperty('INTENTOS_' + prefijo);
  return { success: true, prefijo: prefijo, pin: pin, mensaje: '✅ PIN reseteado' };
}
function renovarVigenciaCliente(data) {
  var prefijo = _t(data.prefijo).toUpperCase();
  var dias = parseInt(data.dias, 10);
  if (!dias || dias <= 0 || dias !== parseFloat(data.dias)) return { error: 'Cantidad de días inválida' };
  var f = _clienteFila_(prefijo);
  if (!f) return { error: 'Cliente no encontrado' };
  var hoy = new Date(), hoyDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  var base = hoyDia, vig = _obtenerVigenciaCliente_(prefijo);
  if (vig.fechaVence) { var p = vig.fechaVence.split('-').map(Number); var fv = new Date(p[0], p[1] - 1, p[2]); if (fv > base) base = fv; }
  var nueva = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
  var txt = Utilities.formatDate(nueva, TZ, 'yyyy-MM-dd');
  _actualizar_('CLIENTES', f._fila, { FechaVence: txt });
  return { success: true, prefijo: prefijo, fechaVence: txt, mensaje: '✅ Vigencia renovada' };
}
function getResumenAdmin() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var mes = _hoy_().slice(0, 7);
  var clientes = _tabla_('CLIENTES', COLS.CLIENTES).filas.map(function (f) {
    var px = _t(f.Prefijo).toUpperCase();
    var gastosMes = 0, movs = 0;
    try {
      _tabla_(_hojaCli_('MOVIMIENTOS', px), COLS.MOVIMIENTOS).filas.forEach(function (m) {
        if (_t(m.Estado) !== 'ACTIVO') return;
        movs++;
        if (_t(m.Tipo) === 'GASTO' && _fechaTxt_(m.FechaOperacion).slice(0, 7) === mes) gastosMes += _cent(m.Importe);
      });
    } catch (e) {}
    var vig = _obtenerVigenciaCliente_(px);
    return { prefijo: px, nombre: _t(f.Nombre), perfil: _t(f.Perfil), activo: _t(f.Estado).toUpperCase() === 'ACTIVO',
      tienePin: !!props.getProperty('PIN_' + px), sesionActiva: Object.keys(todas).some(function (k) { return k.indexOf('SESSION_' + px + '_') === 0; }),
      gastosMes: _pesos(gastosMes), movimientos: movs, vigente: vig.vigente, fechaVence: vig.fechaVence };
  });
  var incNuevas = 0;
  try { incNuevas = _tabla_('INCIDENCIAS', COLS.INCIDENCIAS).filas.filter(function (i) { return _t(i.Estado) === 'NUEVO'; }).length; } catch (e) {}
  return { success: true, clientes: clientes, incidenciasNuevas: incNuevas };
}
function getIncidencias(data) {
  var lista = _tabla_('INCIDENCIAS', COLS.INCIDENCIAS).filas.map(function (i) {
    return { id: _t(i.Id), fecha: _t(i.FechaServidor), estado: _t(i.Estado), prefijo: _t(i.Prefijo), tipo: _t(i.Tipo), descripcion: _t(i.Descripcion), pantalla: _t(i.Pantalla), version: _t(i.VersionApp) };
  }).reverse();
  return { success: true, incidencias: lista.slice(0, 100) };
}

// ===============================
// CONFIG / CATÁLOGO / ESTADO
// ===============================
function getConfig(prefijo) {
  var cfg = {};
  try {
    _tabla_(_hojaCli_('CONFIG', prefijo), COLS.CONFIG).filas.forEach(function (f) { var k = _t(f.campo); if (k) cfg[k] = f.valor; });
  } catch (e) {}
  var info = obtenerInfoCliente(prefijo);
  cfg.nombre = cfg.nombre || (info && info.nombre) || prefijo;
  return { success: true, config: cfg };
}

function _catalogo_(prefijo) {
  return _tabla_(_hojaCli_('CATALOGO', prefijo), COLS.CATALOGO).filas.map(function (f) {
    var precio = _parseNumeroFlexible(f.PrecioSugerido);
    return { codigo: _t(f.Codigo).toUpperCase(), name: _t(f.Concepto).toUpperCase(), category: _t(f.Categoria).toUpperCase() || 'GENERAL',
      tipo: _t(f.Tipo).toUpperCase() === 'INGRESO' ? 'INGRESO' : 'GASTO', price: precio > 0 ? precio : null,
      activo: f.Activo === true || _esActivoFlag_(f.Activo), orden: Number(f.Orden) || 99, _fila: f._fila };
  });
}
function _cuentas_(prefijo) {
  return _tabla_(_hojaCli_('CUENTAS', prefijo), COLS.CUENTAS).filas.map(function (f) {
    return { codigo: _t(f.Codigo).toUpperCase(), nombre: _t(f.Cuenta).toUpperCase(), tipo: _t(f.TipoCuenta).toUpperCase(),
      saldoInicial: _parseNumeroFlexible(f.SaldoInicial), activo: f.Activo === true || _esActivoFlag_(f.Activo), orden: Number(f.Orden) || 99, _fila: f._fila };
  });
}
function _movs_(prefijo) { return _tabla_(_hojaCli_('MOVIMIENTOS', prefijo), COLS.MOVIMIENTOS).filas; }
function _deudasFilas_(prefijo) { return _tabla_(_hojaCli_('DEUDAS', prefijo), COLS.DEUDAS).filas; }

// Saldos: siempre calculados desde los movimientos ACTIVOS (nunca guardados).
function _calcular_(prefijo, cuentas, movs, deudas) {
  var saldo = {}, uso = {}, sentido = {}, avisos = [];
  cuentas.forEach(function (c) { saldo[c.codigo] = Math.round(c.saldoInicial * 100); });
  deudas.forEach(function (d) { sentido[_t(d.DeudaId)] = _t(d.Sentido); });
  function sumar(cta, c) { if (!(cta in saldo)) { avisos.push('Movimiento con cuenta inexistente: ' + cta); return; } saldo[cta] += c; }
  movs.forEach(function (m) {
    if (_t(m.Estado) !== 'ACTIVO') return;
    var imp = _cent(m.Importe), cta = _t(m.Cuenta).toUpperCase(), tipo = _t(m.Tipo);
    if (tipo === 'INGRESO') sumar(cta, imp);
    else if (tipo === 'GASTO') sumar(cta, -imp);
    else if (tipo === 'TRANSFERENCIA') { sumar(cta, -imp); sumar(_t(m.CuentaDestino).toUpperCase(), imp); }
    else if (tipo === 'DEUDA_ALTA' || tipo === 'PAGO_DEUDA') {
      var s = sentido[_t(m.DeudaId)];
      if (!s) { avisos.push('Movimiento ' + _t(m.MovId) + ' con deuda inexistente'); return; }
      var entra = (tipo === 'DEUDA_ALTA') === (s === 'DEBO');
      sumar(cta, entra ? imp : -imp);
    }
    if (tipo === 'GASTO' || tipo === 'INGRESO') { var k = _t(m.Codigo).toUpperCase(); uso[k] = (uso[k] || 0) + 1; }
  });
  return { saldo: saldo, uso: uso, avisos: avisos };
}

function getEstado(prefijo, d) {
  var cat = _catalogo_(prefijo), ctas = _cuentas_(prefijo), movs = _movs_(prefijo), deudas = _deudasFilas_(prefijo);
  var calc = _calcular_(prefijo, ctas, movs, deudas);
  var mes = _hoy_().slice(0, 7), ing = 0, gas = 0, hoyG = 0, hoyI = 0, hoy = _hoy_();
  movs.forEach(function (m) {
    if (_t(m.Estado) !== 'ACTIVO') return;
    var f = _fechaTxt_(m.FechaOperacion), imp = _cent(m.Importe), tipo = _t(m.Tipo);
    if (f.slice(0, 7) === mes) { if (tipo === 'INGRESO') ing += imp; if (tipo === 'GASTO') gas += imp; }
    if (f === hoy) { if (tipo === 'INGRESO') hoyI += imp; if (tipo === 'GASTO') hoyG += imp; }
  });
  var cuentas = ctas.map(function (c) { return { codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, saldoInicial: c.saldoInicial, saldo: _pesos(calc.saldo[c.codigo] || 0), activo: c.activo, orden: c.orden }; })
    .sort(function (a, b) { return a.orden - b.orden; });
  var total = 0; cuentas.forEach(function (c) { total += Math.round(c.saldo * 100); });
  var deudasAbiertas = _deudasConSaldo_(prefijo, deudas, movs).filter(function (x) { return x.estado === 'PENDIENTE' || x.estado === 'PARCIAL'; });
  return {
    success: true, hoy: hoy, periodo: mes, nombre: _t(getConfig(prefijo).config.nombre),
    productos: cat.filter(function (p) { return p.activo; }).map(function (p) { return { codigo: p.codigo, name: p.name, category: p.category, tipo: p.tipo, price: p.price, uso: calc.uso[p.codigo] || 0, orden: p.orden }; }),
    catalogoCompleto: cat.map(function (p) { return { codigo: p.codigo, name: p.name, category: p.category, tipo: p.tipo, price: p.price, activo: p.activo, orden: p.orden, uso: calc.uso[p.codigo] || 0 }; }),
    cuentas: cuentas, total: _pesos(total),
    mes: { ingresos: _pesos(ing), gastos: _pesos(gas) }, hoyTot: { ingresos: _pesos(hoyI), gastos: _pesos(hoyG) },
    deudasAbiertas: deudasAbiertas.length,
    compromisosPendientes: _compromisosMes_(prefijo, mes, movs).filter(function (c) { return c.estado !== 'PAGADO'; }),
    avisos: calc.avisos
  };
}

function getMovimientos(prefijo, d) {
  var desde = _fechaValida_(d.desde) ? d.desde : '', hasta = _fechaValida_(d.hasta) ? d.hasta : '';
  var lista = _movs_(prefijo).map(function (m) {
    return { fechaRegistro: _t(m.FechaRegistro), fecha: _fechaTxt_(m.FechaOperacion), tipo: _t(m.Tipo), categoria: _t(m.Categoria), concepto: _t(m.Concepto),
      codigo: _t(m.Codigo), descripcion: _t(m.Descripcion), importe: _parseNumeroFlexible(m.Importe), cuenta: _t(m.Cuenta), cuentaDestino: _t(m.CuentaDestino),
      movId: _t(m.MovId), renglon: Number(m.Renglon) || 1, estado: _t(m.Estado), motivo: _t(m.MotivoAnulacion), deudaId: _t(m.DeudaId),
      compromisoId: _t(m.CompromisoId), periodo: _t(m.Periodo) };
  }).filter(function (m) { return (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta); });
  return { success: true, movimientos: lista };
}

// ===============================
// BOLETA (= venta del POS): varios renglones, un MovId, candado + idempotencia
// ===============================
function _buscarMovId_(prefijo, movId) {
  var h = _hoja_(_hojaCli_('MOVIMIENTOS', prefijo));
  var u = _ultimaFila_(h);
  if (u < 2) return [];
  var col = COLS.MOVIMIENTOS.indexOf('MovId') + 1;
  var vals = h.getRange(2, col, u - 1, 1).getValues();
  var filas = [];
  for (var i = 0; i < vals.length; i++) if (_t(vals[i][0]) === movId) filas.push(i + 2);
  return filas;
}
function _movIdValido_(s) { return /^[A-Z]{2,4}_\d{8}-\d{6}-[A-Z0-9]{4}$/.test(_t(s)); }

function registrarBoleta(prefijo, d) {
  var movId = _t(d.movId);
  if (!_movIdValido_(movId)) return _def('Identificador de boleta inválido');
  var ya = _buscarMovId_(prefijo, movId);
  if (ya.length) return { success: true, yaExistia: true, movId: movId, renglones: ya.length };
  var tipo = _t(d.tipo).toUpperCase();
  if (TIPOS.indexOf(tipo) === -1) return _def('Tipo inválido');
  var fecha = _t(d.fecha);
  if (!_fechaValida_(fecha)) return _def('Fecha inválida');
  var cta = _cuentas_(prefijo).filter(function (c) { return c.codigo === _t(d.cuenta).toUpperCase(); })[0];
  if (!cta) return _def('Elegí una cuenta válida');
  if (!cta.activo) return _def('La cuenta ' + cta.nombre + ' está desactivada');
  var items = Array.isArray(d.items) ? d.items : [];
  if (!items.length) return _def('La boleta está vacía');
  if (items.length > 60) return _def('Máximo 60 renglones por boleta');
  var cat = {}; _catalogo_(prefijo).forEach(function (p) { cat[p.codigo] = p; });
  var errores = [], filas = [], ahora = _ahora_();
  var compromisoId = '', periodo = '';
  if (d.compromisoId) {
    var comp = _tabla_(_hojaCli_('COMPROMISOS', prefijo), COLS.COMPROMISOS).filas.filter(function (c) { return _t(c.CompromisoId) === _t(d.compromisoId); })[0];
    if (!comp) return _def('Compromiso inexistente');
    if (tipo !== 'GASTO') return _def('Un compromiso se paga con un gasto');
    if (!_periodoValido_(d.periodo)) return _def('Falta el mes del compromiso');
    compromisoId = _t(comp.CompromisoId); periodo = d.periodo;
  }
  items.forEach(function (it, i) {
    var p = cat[_t(it.codigo).toUpperCase()];
    var imp = _importe_(it.importe);
    if (!p) { errores.push('Renglón ' + (i + 1) + ': concepto inexistente — quitalo y volvé a agregarlo'); return; }
    if (!p.activo) { errores.push(p.name + ': concepto desactivado'); return; }
    if (p.tipo !== tipo) { errores.push(p.name + ': es de ' + p.tipo + ', no de ' + tipo); return; }
    if (imp === null) { errores.push(p.name + ': importe inválido'); return; }
    filas.push({ FechaRegistro: ahora, FechaOperacion: fecha, Tipo: tipo, Categoria: p.category, Concepto: p.name, Codigo: p.codigo,
      Descripcion: _t(it.descripcion).slice(0, 200), Importe: imp, Cuenta: cta.codigo, CuentaDestino: '', MovId: movId, Renglon: i + 1,
      Estado: 'ACTIVO', MotivoAnulacion: '', DeudaId: '', CompromisoId: compromisoId, Periodo: periodo, FechaAnulacion: '' });
  });
  if (errores.length) return { success: false, definitivo: true, error: errores.join(' · '), errores: errores };
  _agregar_(_hojaCli_('MOVIMIENTOS', prefijo), filas);   // todos los renglones en UNA sola escritura
  var total = 0; filas.forEach(function (f) { total += Math.round(f.Importe * 100); });
  return { success: true, movId: movId, renglones: filas.length, total: _pesos(total), procesados: filas.map(function (f) { return { name: f.Concepto, importe: f.Importe, descripcion: f.Descripcion }; }) };
}

function registrarTransferencia(prefijo, d) {
  var movId = _t(d.movId);
  if (!_movIdValido_(movId)) return _def('Identificador inválido');
  if (_buscarMovId_(prefijo, movId).length) return { success: true, yaExistia: true, movId: movId };
  var ctas = {}; _cuentas_(prefijo).forEach(function (c) { ctas[c.codigo] = c; });
  var o = ctas[_t(d.origen).toUpperCase()], de = ctas[_t(d.destino).toUpperCase()];
  if (!o || !de) return _def('Elegí las dos cuentas');
  if (!o.activo || !de.activo) return _def('Hay una cuenta desactivada');
  if (o.codigo === de.codigo) return _def('Origen y destino deben ser distintas');
  var imp = _importe_(d.importe); if (imp === null) return _def('Importe inválido');
  if (!_fechaValida_(d.fecha)) return _def('Fecha inválida');
  _agregar_(_hojaCli_('MOVIMIENTOS', prefijo), [{ FechaRegistro: _ahora_(), FechaOperacion: d.fecha, Tipo: 'TRANSFERENCIA', Categoria: '', Concepto: 'TRANSFERENCIA',
    Codigo: '', Descripcion: _t(d.descripcion).slice(0, 200), Importe: imp, Cuenta: o.codigo, CuentaDestino: de.codigo, MovId: movId, Renglon: 1,
    Estado: 'ACTIVO', MotivoAnulacion: '', DeudaId: '', CompromisoId: '', Periodo: '', FechaAnulacion: '' }]);
  return { success: true, movId: movId };
}

function anularMovimiento(prefijo, d) {
  var movId = _t(d.movId), renglon = Number(d.renglon) || 0, motivo = _t(d.motivo);
  if (motivo.length < 3) return _def('Escribí el motivo');
  var t = _tabla_(_hojaCli_('MOVIMIENTOS', prefijo), COLS.MOVIMIENTOS);
  var filas = t.filas.filter(function (m) { return _t(m.MovId) === movId && (!renglon || Number(m.Renglon) === renglon); });
  if (!filas.length) return _def('Movimiento no encontrado');
  if (filas.some(function (m) { return _t(m.Tipo) === 'DEUDA_ALTA'; })) return _def('Es el alta de una deuda: anulala desde Deudas');
  var anuladas = 0, ahora = _ahora_();
  filas.forEach(function (m) {
    if (_t(m.Estado) !== 'ACTIVO') return;
    _actualizar_(_hojaCli_('MOVIMIENTOS', prefijo), m._fila, { Estado: 'ANULADO', MotivoAnulacion: motivo.slice(0, 200), FechaAnulacion: ahora });
    anuladas++;
    if (_t(m.Tipo) === 'PAGO_DEUDA') _refrescarDeuda_(prefijo, _t(m.DeudaId));
  });
  return { success: true, anuladas: anuladas, yaEstaba: anuladas === 0 };
}

// ===============================
// CATÁLOGO Y CUENTAS (➕)
// ===============================
function _siguienteCodigo_(lista, letra) {
  var max = 0;
  lista.forEach(function (x) { var m = String(x).match(new RegExp('^' + letra + '(\\d+)$')); if (m) max = Math.max(max, Number(m[1])); });
  return letra + ('000' + (max + 1)).slice(-3);
}
function crearConcepto(prefijo, d) {
  var opId = _t(d.opId); if (!_opIdValido_(opId)) return _def('Falta identificador de operación');
  var cat = _catalogo_(prefijo);
  var previo = _tabla_(_hojaCli_('CATALOGO', prefijo), COLS.CATALOGO).filas.filter(function (f) { return _t(f.OpId) === opId; })[0];
  if (previo) return { success: true, yaExistia: true, codigo: _t(previo.Codigo) };
  var nombre = _t(d.nombre).toUpperCase().replace(/\s+/g, ' '), categoria = _t(d.categoria).toUpperCase().replace(/\s+/g, ' ');
  var tipo = _t(d.tipo).toUpperCase();
  if (!nombre || nombre.length > 45) return _def('Nombre del concepto inválido');
  if (!categoria || categoria.length > 40) return _def('Escribí la categoría');
  if (TIPOS.indexOf(tipo) === -1) return _def('Tipo inválido');
  if (cat.some(function (p) { return p.activo && p.tipo === tipo && p.name === nombre && p.category === categoria; })) return _def('Ya existe ' + nombre + ' en ' + categoria);
  var precio = (d.precio === '' || d.precio === null || d.precio === undefined) ? '' : _importe_(d.precio);
  if (precio === null) return _def('Precio sugerido inválido');
  var codigo = _siguienteCodigo_(cat.map(function (p) { return p.codigo; }), tipo === 'GASTO' ? 'G' : 'I');
  var orden = cat.filter(function (p) { return p.category === categoria; }).reduce(function (m, p) { return Math.max(m, p.orden); }, 0) + 1;
  _agregar_(_hojaCli_('CATALOGO', prefijo), [{ Codigo: codigo, Concepto: nombre, Categoria: categoria, Tipo: tipo, PrecioSugerido: precio, Activo: true, Orden: orden, FechaAlta: _ahora_(), OpId: opId }]);
  return { success: true, codigo: codigo };
}
function editarConcepto(prefijo, d) {
  var p = _catalogo_(prefijo).filter(function (x) { return x.codigo === _t(d.codigo).toUpperCase(); })[0];
  if (!p) return _def('Concepto inexistente');
  var c = {};
  if (d.nombre !== undefined) { var n = _t(d.nombre).toUpperCase(); if (!n || n.length > 45) return _def('Nombre inválido'); c.Concepto = n; }
  if (d.categoria !== undefined) { var k = _t(d.categoria).toUpperCase(); if (!k) return _def('Categoría inválida'); c.Categoria = k; }
  if (d.precio !== undefined) { var pr = (d.precio === '' || d.precio === null) ? '' : _importe_(d.precio); if (pr === null) return _def('Precio inválido'); c.PrecioSugerido = pr; }
  if (d.activo !== undefined) c.Activo = !!d.activo;
  if (d.orden !== undefined) { var o = Number(d.orden); if (!isFinite(o)) return _def('Orden inválido'); c.Orden = Math.round(o); }
  _actualizar_(_hojaCli_('CATALOGO', prefijo), p._fila, c);
  return { success: true, codigo: p.codigo };
}
function crearCuenta(prefijo, d) {
  var opId = _t(d.opId); if (!_opIdValido_(opId)) return _def('Falta identificador de operación');
  var previo = _tabla_(_hojaCli_('CUENTAS', prefijo), COLS.CUENTAS).filas.filter(function (f) { return _t(f.OpId) === opId; })[0];
  if (previo) return { success: true, yaExistia: true, codigo: _t(previo.Codigo) };
  var ctas = _cuentas_(prefijo), nombre = _t(d.nombre).toUpperCase(), tipo = _t(d.tipo).toUpperCase();
  if (!nombre || nombre.length > 40) return _def('Nombre de cuenta inválido');
  if (TIPOS_CUENTA.indexOf(tipo) === -1) return _def('Tipo de cuenta inválido');
  if (ctas.some(function (c) { return c.activo && c.nombre === nombre; })) return _def('Ya existe la cuenta ' + nombre);
  var saldo = _parseNumeroFlexible(d.saldoInicial);
  if (!isFinite(saldo) || Math.abs(saldo) >= 1e12) return _def('Saldo inicial inválido');
  var codigo = _siguienteCodigo_(ctas.map(function (c) { return c.codigo; }), 'C').replace(/^C0/, 'C');
  _agregar_(_hojaCli_('CUENTAS', prefijo), [{ Codigo: codigo, Cuenta: nombre, TipoCuenta: tipo, SaldoInicial: Math.round(saldo * 100) / 100, Activo: true,
    Orden: ctas.length + 1, FechaAlta: _ahora_(), OpId: opId }]);
  return { success: true, codigo: codigo };
}
function editarCuenta(prefijo, d) {
  var c = _cuentas_(prefijo).filter(function (x) { return x.codigo === _t(d.codigo).toUpperCase(); })[0];
  if (!c) return _def('Cuenta inexistente');
  var cam = {};
  if (d.nombre !== undefined) { var n = _t(d.nombre).toUpperCase(); if (!n) return _def('Nombre inválido'); cam.Cuenta = n; }
  if (d.tipo !== undefined) { var t = _t(d.tipo).toUpperCase(); if (TIPOS_CUENTA.indexOf(t) === -1) return _def('Tipo inválido'); cam.TipoCuenta = t; }
  if (d.saldoInicial !== undefined) { var s = _parseNumeroFlexible(d.saldoInicial); if (Math.abs(s) >= 1e12) return _def('Saldo inválido'); cam.SaldoInicial = Math.round(s * 100) / 100; }
  if (d.activo !== undefined) cam.Activo = !!d.activo;
  _actualizar_(_hojaCli_('CUENTAS', prefijo), c._fila, cam);
  return { success: true, codigo: c.codigo };
}

// ===============================
// DEUDAS (estilo fiados): debo / me deben, pagos parciales
// ===============================
function _deudasConSaldo_(prefijo, deudas, movs) {
  return deudas.map(function (x) {
    var id = _t(x.DeudaId);
    var pagos = movs.filter(function (m) { return _t(m.DeudaId) === id && _t(m.Tipo) === 'PAGO_DEUDA' && _t(m.Estado) === 'ACTIVO'; });
    var pagado = pagos.reduce(function (s, m) { return s + _cent(m.Importe); }, 0);
    var original = _cent(x.Importe), anulada = _t(x.Estado) === 'ANULADA';
    var pendiente = anulada ? 0 : Math.max(original - pagado, 0);
    var venc = _fechaTxt_(x.Vence);
    return { id: id, sentido: _t(x.Sentido), persona: _t(x.Persona), telefono: _t(x.Telefono), descripcion: _t(x.Descripcion),
      importe: _pesos(original), pagado: _pesos(pagado), pendiente: _pesos(pendiente), fecha: _fechaTxt_(x.Fecha), vence: venc,
      vencida: !anulada && pendiente > 0 && venc && venc < _hoy_(),
      estado: anulada ? 'ANULADA' : (pendiente === 0 ? 'SALDADA' : (pagado > 0 ? 'PARCIAL' : 'PENDIENTE')), cantPagos: pagos.length,
      pagos: pagos.map(function (m) { return { movId: _t(m.MovId), fecha: _fechaTxt_(m.FechaOperacion), importe: _parseNumeroFlexible(m.Importe), cuenta: _t(m.Cuenta) }; }),
      motivo: _t(x.MotivoAnulacion) };
  });
}
function getDeudas(prefijo) { return { success: true, deudas: _deudasConSaldo_(prefijo, _deudasFilas_(prefijo), _movs_(prefijo)) }; }
function _refrescarDeuda_(prefijo, id) {
  var f = _deudasFilas_(prefijo).filter(function (x) { return _t(x.DeudaId) === id; })[0];
  if (!f || _t(f.Estado) === 'ANULADA') return;
  var info = _deudasConSaldo_(prefijo, [f], _movs_(prefijo))[0];
  var nuevo = info.pendiente === 0 ? 'SALDADA' : 'PENDIENTE';
  if (_t(f.Estado) !== nuevo) _actualizar_(_hojaCli_('DEUDAS', prefijo), f._fila, { Estado: nuevo });
}
function crearDeuda(prefijo, d) {
  var opId = _t(d.opId); if (!_opIdValido_(opId)) return _def('Falta identificador de operación');
  var previo = _deudasFilas_(prefijo).filter(function (x) { return _t(x.OpId) === opId; })[0];
  if (previo) return { success: true, yaExistia: true, id: _t(previo.DeudaId) };
  var sentido = _t(d.sentido).toUpperCase();
  if (['DEBO', 'ME_DEBEN'].indexOf(sentido) === -1) return _def('Indicá Debo o Me deben');
  var persona = _t(d.persona).toUpperCase().slice(0, 60); if (!persona) return _def('Escribí el nombre');
  var imp = _importe_(d.importe); if (imp === null) return _def('Importe inválido');
  if (!_fechaValida_(d.fecha)) return _def('Fecha inválida');
  if (d.vence && !_fechaValida_(d.vence)) return _def('Vencimiento inválido');
  var cta = null;
  if (d.moverDinero) {
    cta = _cuentas_(prefijo).filter(function (c) { return c.codigo === _t(d.cuenta).toUpperCase(); })[0];
    if (!cta || !cta.activo) return _def('Elegí una cuenta válida');
  }
  var id = 'DEU_' + opId.slice(-10).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  _agregar_(_hojaCli_('DEUDAS', prefijo), [{ DeudaId: id, Sentido: sentido, Persona: persona, Telefono: _t(d.telefono).slice(0, 30), Descripcion: _t(d.descripcion).slice(0, 200),
    Importe: imp, Fecha: d.fecha, Vence: d.vence || '', Estado: 'PENDIENTE', OpId: opId, MotivoAnulacion: '' }]);
  if (cta) {
    _agregar_(_hojaCli_('MOVIMIENTOS', prefijo), [{ FechaRegistro: _ahora_(), FechaOperacion: d.fecha, Tipo: 'DEUDA_ALTA', Categoria: '',
      Concepto: (sentido === 'DEBO' ? 'PRÉSTAMO RECIBIDO DE ' : 'PRÉSTAMO DADO A ') + persona, Codigo: '', Descripcion: _t(d.descripcion).slice(0, 200), Importe: imp,
      Cuenta: cta.codigo, CuentaDestino: '', MovId: 'ALT_' + opId, Renglon: 1, Estado: 'ACTIVO', MotivoAnulacion: '', DeudaId: id, CompromisoId: '', Periodo: '', FechaAnulacion: '' }]);
  }
  return { success: true, id: id };
}
function pagarDeuda(prefijo, d) {
  var movId = _t(d.movId);
  if (!_movIdValido_(movId)) return _def('Identificador inválido');
  if (_buscarMovId_(prefijo, movId).length) return { success: true, yaExistia: true, movId: movId };
  var f = _deudasFilas_(prefijo).filter(function (x) { return _t(x.DeudaId) === _t(d.deudaId); })[0];
  if (!f) return _def('Deuda inexistente');
  if (_t(f.Estado) === 'ANULADA') return _def('La deuda está anulada');
  var info = _deudasConSaldo_(prefijo, [f], _movs_(prefijo))[0];
  var imp = _importe_(d.importe); if (imp === null) return _def('Importe inválido');
  if (info.pendiente <= 0) return _def('La deuda ya está saldada');
  if (Math.round(imp * 100) > Math.round(info.pendiente * 100)) return _def('Supera lo pendiente ($' + info.pendiente + ')');
  var cta = _cuentas_(prefijo).filter(function (c) { return c.codigo === _t(d.cuenta).toUpperCase(); })[0];
  if (!cta || !cta.activo) return _def('Elegí una cuenta válida');
  if (!_fechaValida_(d.fecha)) return _def('Fecha inválida');
  _agregar_(_hojaCli_('MOVIMIENTOS', prefijo), [{ FechaRegistro: _ahora_(), FechaOperacion: d.fecha, Tipo: 'PAGO_DEUDA', Categoria: '',
    Concepto: (_t(f.Sentido) === 'DEBO' ? 'PAGO A ' : 'COBRO DE ') + _t(f.Persona), Codigo: '', Descripcion: _t(d.descripcion).slice(0, 200), Importe: imp,
    Cuenta: cta.codigo, CuentaDestino: '', MovId: movId, Renglon: 1, Estado: 'ACTIVO', MotivoAnulacion: '', DeudaId: _t(f.DeudaId), CompromisoId: '', Periodo: '', FechaAnulacion: '' }]);
  _refrescarDeuda_(prefijo, _t(f.DeudaId));
  return { success: true, movId: movId, pendiente: _pesos(Math.round(info.pendiente * 100) - Math.round(imp * 100)) };
}
function anularDeuda(prefijo, d) {
  var f = _deudasFilas_(prefijo).filter(function (x) { return _t(x.DeudaId) === _t(d.deudaId); })[0];
  if (!f) return _def('Deuda inexistente');
  if (_t(f.Estado) === 'ANULADA') return { success: true, yaEstaba: true };
  var motivo = _t(d.motivo); if (motivo.length < 3) return _def('Escribí el motivo');
  var movs = _movs_(prefijo).filter(function (m) { return _t(m.DeudaId) === _t(f.DeudaId) && _t(m.Estado) === 'ACTIVO'; });
  if (movs.some(function (m) { return _t(m.Tipo) === 'PAGO_DEUDA'; })) return _def('Tiene pagos activos: anulalos primero desde Reportes');
  movs.forEach(function (m) { _actualizar_(_hojaCli_('MOVIMIENTOS', prefijo), m._fila, { Estado: 'ANULADO', MotivoAnulacion: 'Deuda anulada: ' + motivo, FechaAnulacion: _ahora_() }); });
  _actualizar_(_hojaCli_('DEUDAS', prefijo), f._fila, { Estado: 'ANULADA', MotivoAnulacion: motivo.slice(0, 200) });
  return { success: true };
}

// ===============================
// COMPROMISOS MENSUALES (no descuentan solos)
// ===============================
function _compromisosMes_(prefijo, periodo, movs) {
  var cat = {}; _catalogo_(prefijo).forEach(function (p) { cat[p.codigo] = p; });
  var py = periodo.split('-').map(Number), dias = new Date(py[0], py[1], 0).getDate();
  return _tabla_(_hojaCli_('COMPROMISOS', prefijo), COLS.COMPROMISOS).filas
    .filter(function (c) { return c.Activo === true || _esActivoFlag_(c.Activo); })
    .map(function (c) {
      var id = _t(c.CompromisoId);
      var pagos = movs.filter(function (m) { return _t(m.CompromisoId) === id && _t(m.Periodo) === periodo && _t(m.Estado) === 'ACTIVO' && _t(m.Tipo) === 'GASTO'; });
      var pagado = pagos.reduce(function (s, m) { return s + _cent(m.Importe); }, 0);
      var est = _parseNumeroFlexible(c.ImporteEstimado), dia = Math.min(Number(c.DiaVence) || 1, dias);
      var estado = pagado === 0 ? 'PENDIENTE' : (est > 0 && pagado < Math.round(est * 100) ? 'PARCIAL' : 'PAGADO');
      var p = cat[_t(c.CodigoConcepto).toUpperCase()];
      return { id: id, nombre: _t(c.Nombre), codigo: _t(c.CodigoConcepto).toUpperCase(), concepto: p ? p.name : '', conceptoActivo: !!(p && p.activo),
        estimado: est > 0 ? est : null, diaVence: Number(c.DiaVence) || 1, vence: periodo + '-' + ('0' + dia).slice(-2), periodo: periodo,
        pagado: _pesos(pagado), estado: estado, cuentaSugerida: _t(c.CuentaSugerida).toUpperCase() };
    }).sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
}
function getCompromisos(prefijo, d) {
  var periodo = _periodoValido_(d.periodo) ? d.periodo : _hoy_().slice(0, 7);
  var todos = _tabla_(_hojaCli_('COMPROMISOS', prefijo), COLS.COMPROMISOS).filas.map(function (c) {
    return { id: _t(c.CompromisoId), nombre: _t(c.Nombre), codigo: _t(c.CodigoConcepto).toUpperCase(), estimado: _parseNumeroFlexible(c.ImporteEstimado) || null,
      diaVence: Number(c.DiaVence) || 1, cuentaSugerida: _t(c.CuentaSugerida).toUpperCase(), activo: c.Activo === true || _esActivoFlag_(c.Activo) };
  });
  return { success: true, periodo: periodo, compromisos: _compromisosMes_(prefijo, periodo, _movs_(prefijo)), todos: todos };
}
function _datosCompromiso_(prefijo, d, nuevo) {
  var r = {};
  if (nuevo || d.nombre !== undefined) { var n = _t(d.nombre).toUpperCase(); if (!n || n.length > 40) return { err: 'Nombre inválido' }; r.Nombre = n; }
  if (nuevo || d.codigo !== undefined) {
    var p = _catalogo_(prefijo).filter(function (x) { return x.codigo === _t(d.codigo).toUpperCase(); })[0];
    if (!p || !p.activo) return { err: 'Elegí un concepto de gasto activo' };
    if (p.tipo !== 'GASTO') return { err: 'Un compromiso usa un concepto de GASTO' };
    r.CodigoConcepto = p.codigo;
  }
  if (nuevo || d.estimado !== undefined) { var e = (d.estimado === '' || d.estimado === null || d.estimado === undefined) ? '' : _importe_(d.estimado); if (e === null) return { err: 'Importe estimado inválido' }; r.ImporteEstimado = e; }
  if (nuevo || d.diaVence !== undefined) { var dv = Number(d.diaVence); if (!(dv >= 1 && dv <= 31 && Math.floor(dv) === dv)) return { err: 'Día de vencimiento: 1 a 31' }; r.DiaVence = dv; }
  if (nuevo || d.cuentaSugerida !== undefined) r.CuentaSugerida = _t(d.cuentaSugerida).toUpperCase();
  return { r: r };
}
function crearCompromiso(prefijo, d) {
  var opId = _t(d.opId); if (!_opIdValido_(opId)) return _def('Falta identificador de operación');
  var previo = _tabla_(_hojaCli_('COMPROMISOS', prefijo), COLS.COMPROMISOS).filas.filter(function (x) { return _t(x.OpId) === opId; })[0];
  if (previo) return { success: true, yaExistia: true, id: _t(previo.CompromisoId) };
  var x = _datosCompromiso_(prefijo, d, true); if (x.err) return _def(x.err);
  x.r.CompromisoId = 'CMP_' + opId.slice(-8).toUpperCase().replace(/[^A-Z0-9]/g, 'X'); x.r.Activo = true; x.r.OpId = opId;
  _agregar_(_hojaCli_('COMPROMISOS', prefijo), [x.r]);
  return { success: true, id: x.r.CompromisoId };
}
function editarCompromiso(prefijo, d) {
  var f = _tabla_(_hojaCli_('COMPROMISOS', prefijo), COLS.COMPROMISOS).filas.filter(function (c) { return _t(c.CompromisoId) === _t(d.id); })[0];
  if (!f) return _def('Compromiso inexistente');
  var x = _datosCompromiso_(prefijo, d, false); if (x.err) return _def(x.err);
  if (d.activo !== undefined) x.r.Activo = !!d.activo;
  _actualizar_(_hojaCli_('COMPROMISOS', prefijo), f._fila, x.r);
  return { success: true, id: _t(f.CompromisoId) };
}

// ===============================
// 🐞 INCIDENCIAS (hoja global, con prefijo)
// ===============================
function _sinSecretos_(s) {
  return String(s || '').replace(/\bCLI_[A-Z]{2,3}_[A-Za-z0-9]+/g, '[OCULTO]').replace(/\b[a-f0-9]{24,}\b/gi, '[OCULTO]')
    .replace(/\b\d[\d -]{11,}\d\b/g, '[NÚMERO OCULTO]').replace(/\bpin\s*[:=]?\s*\d{4,6}\b/gi, 'PIN [OCULTO]');
}
function reportarIncidencia(prefijo, d) {
  var opId = _t(d.opId); if (!_opIdValido_(opId)) return _def('Falta identificador de operación');
  var t = _tabla_('INCIDENCIAS', COLS.INCIDENCIAS);
  var previo = t.filas.filter(function (x) { return _t(x.OpId) === opId; })[0];
  if (previo) return { success: true, yaExistia: true, id: _t(previo.Id) };
  var tipo = _t(d.tipo).toUpperCase(); if (['ERROR', 'SUGERENCIA'].indexOf(tipo) === -1) return _def('Elegí ERROR o SUGERENCIA');
  var desc = _sinSecretos_(_t(d.descripcion)).slice(0, 2000); if (desc.length < 5) return _def('Contá qué pasó (mínimo 5 letras)');
  var ahora = _ahora_();
  var id = 'INC-' + ahora.slice(0, 10).replace(/-/g, '') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  _agregar_('INCIDENCIAS', [{ Id: id, FechaServidor: ahora, Estado: 'NUEVO', Prefijo: prefijo, Tipo: tipo, Descripcion: desc,
    Pantalla: _sinSecretos_(_t(d.pantalla)).slice(0, 80), VersionApp: _t(d.version).slice(0, 20), Navegador: _sinSecretos_(_t(d.navegador)).slice(0, 300), OpId: opId, NotasRevision: '' }]);
  return { success: true, id: id, fecha: ahora };
}

function verificarOperacion(prefijo, d) {
  var id = _t(d.id);
  if (!id) return _def('Falta id');
  if (_buscarMovId_(prefijo, id).length) return { success: true, existe: true };
  var hojas = [['CATALOGO', 'OpId'], ['CUENTAS', 'OpId'], ['DEUDAS', 'OpId'], ['COMPROMISOS', 'OpId']];
  for (var i = 0; i < hojas.length; i++) {
    if (_tabla_(_hojaCli_(hojas[i][0], prefijo), COLS[hojas[i][0]]).filas.some(function (f) { return _t(f[hojas[i][1]]) === id; })) return { success: true, existe: true };
  }
  if (_tabla_('INCIDENCIAS', COLS.INCIDENCIAS).filas.some(function (f) { return _t(f.OpId) === id; })) return { success: true, existe: true };
  return { success: true, existe: false };
}

// ===============================
// INSTALACIÓN / DIAGNÓSTICO (editor)
// ===============================
function instalar() {
  var ss = _ss_();
  if (!ss) { Logger.log('❌ El script no está vinculado a una planilla'); return; }
  ['CLIENTES', 'PERFILES', 'PLANTILLA_CATALOGO', 'PLANTILLA_CUENTAS', 'INCIDENCIAS'].forEach(function (n) {
    var existia = !!ss.getSheetByName(n);
    var h = _crearHojaSiFalta_(n, COLS[n]);
    var enc = h.getRange(1, 1, 1, Math.max(h.getLastColumn(), 1)).getValues()[0].map(function (x) { return String(x).trim(); });
    var faltan = COLS[n].filter(function (c) { return enc.indexOf(c) === -1; });
    Logger.log((existia ? '✅ ' : '🆕 ') + n + (faltan.length ? ' — ⚠️ faltan columnas: ' + faltan.join(', ') : ''));
  });
  var hi = ss.getSheetByName('INCIDENCIAS');
  hi.getRange(2, COLS.INCIDENCIAS.indexOf('Estado') + 1, 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS_INCIDENCIA, true).setAllowInvalid(false).build());
  var nPerf = _tabla_('PERFILES', COLS.PERFILES).filas.length, nCat = _tabla_('PLANTILLA_CATALOGO', COLS.PLANTILLA_CATALOGO).filas.length;
  Logger.log('Perfiles: ' + nPerf + ' · Conceptos de plantilla: ' + nCat + (nPerf ? '' : ' — ⚠️ cargá las plantillas (archivo SEBA_BALANCE_STAGING.xlsx)'));
  Logger.log(PropertiesService.getScriptProperties().getProperty('ADMIN_CLAVE_HASH') ? '✅ Clave admin configurada' : '⚠️ Falta la clave admin: ejecutá generarClaveAdmin()');
}
function diagnostico() {
  instalar();
  try { Logger.log('Clientes: ' + _tabla_('CLIENTES', COLS.CLIENTES).filas.map(function (c) { return _t(c.Prefijo) + '(' + _t(c.Estado) + ')'; }).join(', ')); } catch (e) { Logger.log(e.message); }
}
