/** @OnlyCurrentDoc */
// ===============================================================
// 🟦 PROYECTO: VAO BALANCE V1 — STAGING  (backend build 3: + reportes de problemas)
// 📊 Planilla: VAO_BALANCE_TEST  (copia de VAO_BALANCE_BASE, solo pruebas)
//    Este script debe estar VINCULADO a esa planilla.
// 📁 Repo: github.com/patagoniasalvajecomidas-bariloche/vao-balance
// 🌐 App: vao-balance.vercel.app
// ⚠️ SISTEMA DE PRUEBAS — NO PRODUCCIÓN — DATOS DEMO
// ⚠️ Independiente de Almacén Copihue, VAO POS y SmartPOS:
//    no usa ni conoce sus planillas, scripts ni credenciales.
// ===============================================================
//
// FUNCIONES PARA EJECUTAR A MANO DESDE EL EDITOR (▶ Ejecutar):
//   inicializarTest()   → prepara VAO_BALANCE_TEST (se puede repetir sin riesgo)
//   crearAcceso()       → crea un enlace de acceso nuevo (uno por persona)
//   diagnostico()       → revisa vinculación, hojas, accesos y datos
//   reiniciarTest()     → BORRA los datos de prueba (solo en TEST) para empezar de cero
//
// API (POST texto JSON: {accion, clave, op_id, datos}):
//   lectura : ping, sesion, estado, movimientos, compromisosMes, verificarOperacion
//   escritura (con candado + op_id): elegirPerfil, registrarMovimiento,
//     registrarTransferencia, anularMovimiento, crearDeuda, pagarDeuda, anularDeuda,
//     crearCategoria, editarCategoria, crearConcepto, editarConcepto,
//     crearCuenta, editarCuenta, crearCompromiso, editarCompromiso
//
// CERO HARDCODE COMERCIAL: solo hay constantes TÉCNICAS (hojas, columnas,
// tipos, reglas). Categorías, conceptos, cuentas e importes vienen de la planilla.
// ===============================================================

const PRODUCTO = 'VAO BALANCE V1 STAGING';
const BACKEND_BUILD = 3;
const ENTORNO = 'STAGING';
const TZ_DEFECTO = 'America/Argentina/Buenos_Aires';
const MARCA_TEST = 'VAO_BALANCE_TEST';      // la planilla de escritura debe llamarse así
const PROP_TEST_ID = 'VB_PLANILLA_TEST_ID';  // la fija inicializarTest()

const H = {
  CONFIG: 'CONFIG', PERFILES: 'PERFILES', P_CUENTAS: 'PLANTILLA_CUENTAS', P_CATEGORIAS: 'PLANTILLA_CATEGORIAS',
  P_CONCEPTOS: 'PLANTILLA_CONCEPTOS', CUENTAS: 'CUENTAS', CATEGORIAS: 'CATEGORIAS', CONCEPTOS: 'CONCEPTOS',
  MOVIMIENTOS: 'MOVIMIENTOS', DEUDAS: 'DEUDAS', COMPROMISOS: 'COMPROMISOS', USUARIOS: 'USUARIOS', CONTROL: 'CONTROL',
  INCIDENCIAS: 'INCIDENCIAS'
};

// Columnas que deben existir (las de BASE + las que agrega inicializarTest)
const COLS = {
  CONFIG: ['clave', 'valor'],
  PERFILES: ['perfil_id', 'nombre', 'emoji', 'descripcion', 'orden', 'activo'],
  PLANTILLA_CUENTAS: ['plantilla_id', 'perfil_id', 'nombre', 'tipo', 'orden', 'activo'],
  PLANTILLA_CATEGORIAS: ['plantilla_id', 'perfil_id', 'nombre', 'tipo', 'emoji', 'color', 'orden', 'activo'],
  PLANTILLA_CONCEPTOS: ['plantilla_id', 'perfil_id', 'plantilla_categoria_id', 'nombre', 'importe_sugerido', 'orden', 'activo'],
  CUENTAS: ['id', 'nombre', 'tipo', 'saldo_inicial', 'fecha_saldo_inicial', 'color', 'orden', 'activo', 'origen_plantilla_id', 'fecha_alta', 'op_id'],
  CATEGORIAS: ['id', 'nombre', 'tipo', 'emoji', 'color', 'orden', 'activo', 'origen_plantilla_id', 'fecha_alta', 'op_id'],
  CONCEPTOS: ['id', 'categoria_id', 'nombre', 'importe_sugerido', 'cuenta_sugerida_id', 'orden', 'activo', 'origen_plantilla_id', 'fecha_alta', 'op_id'],
  MOVIMIENTOS: ['id', 'op_id', 'fecha_operacion', 'fecha_registro', 'tipo', 'categoria_id', 'categoria_nombre', 'concepto_id',
    'concepto_nombre', 'cuenta_id', 'cuenta_destino_id', 'importe', 'descripcion', 'deuda_id', 'compromiso_id', 'periodo',
    'estado', 'motivo_anulacion', 'usuario', 'fecha_anulacion', 'anulado_por'],
  DEUDAS: ['id', 'sentido', 'contraparte', 'descripcion', 'importe_original', 'fecha', 'vencimiento', 'estado', 'fecha_alta',
    'op_id', 'usuario', 'motivo_anulacion'],
  COMPROMISOS: ['id', 'nombre', 'categoria_id', 'concepto_id', 'importe_estimado', 'dia_vencimiento', 'cuenta_sugerida_id',
    'activo', 'op_id', 'fecha_alta'],
  USUARIOS: ['usuario_id', 'nombre', 'clave_hash', 'activo', 'creado', 'ultimo_acceso'],
  INCIDENCIAS: ['id', 'fecha_servidor', 'estado', 'tipo', 'descripcion', 'pantalla', 'version_app', 'version_backend',
    'perfil', 'usuario', 'navegador', 'op_id', 'notas_revision', 'fecha_cambio_estado']
};
const TIPOS_INCIDENCIA = ['ERROR', 'SUGERENCIA'];
const ESTADOS_INCIDENCIA = ['NUEVO', 'EN REVISIÓN', 'RESUELTO', 'DESCARTADO'];
const COLS_IMPORTE = ['saldo_inicial', 'importe', 'importe_original', 'importe_estimado', 'importe_sugerido'];
const TIPOS_CAT = ['EGRESO', 'INGRESO'];
const TIPOS_CUENTA = ['EFECTIVO', 'BANCO', 'BILLETERA', 'OTRA'];
const SENTIDOS = ['DEBO', 'ME_DEBEN'];
const CONFIG_PUBLICA = ['nombre_cliente', 'perfil_inicial', 'moneda', 'zona_horaria', 'top_cantidad', 'version_esquema', 'entorno'];
const MAX_IMPORTE = 1e12;

// ===============================================================
// ENTRADAS WEB
// ===============================================================
function doGet(e) {
  // Solo diagnóstico público, sin datos.
  return _json(_ping());
}

function doPost(e) {
  let res;
  try {
    let req;
    try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (x) { return _json(_err('PEDIDO_INVALIDO', 'El pedido no es JSON válido')); }
    const accion = String(req.accion || '');
    if (accion === 'ping') return _json(_ping());

    const usuario = _autenticar(req.clave);            // lanza CLAVE_INVALIDA
    const d = req.datos || {};
    const LECTURA = {
      sesion: () => _ok({ usuario: { id: usuario.usuario_id, nombre: usuario.nombre }, entorno: ENTORNO, producto: PRODUCTO }),
      estado: () => apiEstado(d, usuario),
      movimientos: () => apiMovimientos(d),
      compromisosMes: () => apiCompromisosMes(d),
      verificarOperacion: () => apiVerificarOperacion(req.op_id)
    };
    const ESCRITURA = {
      elegirPerfil: apiElegirPerfil, registrarMovimiento: apiRegistrarMovimiento,
      registrarTransferencia: apiRegistrarTransferencia, anularMovimiento: apiAnularMovimiento,
      crearDeuda: apiCrearDeuda, pagarDeuda: apiPagarDeuda, anularDeuda: apiAnularDeuda,
      crearCategoria: apiCrearCategoria, editarCategoria: apiEditarCategoria,
      crearConcepto: apiCrearConcepto, editarConcepto: apiEditarConcepto,
      crearCuenta: apiCrearCuenta, editarCuenta: apiEditarCuenta,
      crearCompromiso: apiCrearCompromiso, editarCompromiso: apiEditarCompromiso,
      reportarIncidencia: apiReportarIncidencia
    };
    if (LECTURA[accion]) res = LECTURA[accion]();
    else if (ESCRITURA[accion]) {
      _verificarEscritura();
      const opId = _opId(req.op_id);
      res = _conCandado(() => ESCRITURA[accion](d, usuario, opId));
    } else res = _err('ACCION_DESCONOCIDA', 'Acción no reconocida: ' + accion);
  } catch (err) {
    res = _err(err.codigo || 'ERROR_INTERNO', err.message || String(err), err.extra);
  }
  return _json(res);
}

function _ping() {
  return _ok({ servicio: 'VAO BALANCE', producto: PRODUCTO, entorno: ENTORNO, build: BACKEND_BUILD,
    planilla_vinculada: !!SpreadsheetApp.getActiveSpreadsheet(), hora_servidor: _ahora() });
}

// ===============================================================
// LECTURA
// ===============================================================
function apiEstado(d, usuario) {
  const cfg = _config();
  const cuentas = _tabla(H.CUENTAS).filas, cats = _tabla(H.CATEGORIAS).filas, cons = _tabla(H.CONCEPTOS).filas;
  const movs = _tabla(H.MOVIMIENTOS).filas, deudas = _tabla(H.DEUDAS).filas, comps = _tabla(H.COMPROMISOS).filas;
  const calc = _calcular(cuentas, movs, deudas);
  const periodo = _periodoValido(d.periodo) ? d.periodo : _hoy().slice(0, 7);

  const res = {
    usuario: { id: usuario.usuario_id, nombre: usuario.nombre },
    producto: PRODUCTO, entorno: ENTORNO, build: BACKEND_BUILD, hoy: _hoy(),
    config: cfg.publica,
    perfil: null, perfiles: [],
    cuentas: cuentas.map(c => ({ id: _t(c.id), nombre: _t(c.nombre), tipo: _t(c.tipo), saldo_inicial: _n(c.saldo_inicial),
      saldo: _c2p(calc.saldos[_t(c.id)] || 0), activo: _act(c.activo), orden: _ord(c.orden) })).sort(_porOrden),
    total: 0,
    mes: { periodo: periodo, ingresos: 0, gastos: 0 },
    categorias: cats.map(c => ({ id: _t(c.id), nombre: _t(c.nombre), tipo: _t(c.tipo), emoji: _t(c.emoji), color: _t(c.color),
      orden: _ord(c.orden), activo: _act(c.activo), uso: calc.usoCat[_t(c.id)] || 0 })).sort(_porOrden),
    conceptos: cons.map(c => ({ id: _t(c.id), categoria_id: _t(c.categoria_id), nombre: _t(c.nombre),
      importe_sugerido: _impONull(c.importe_sugerido), cuenta_sugerida_id: _t(c.cuenta_sugerida_id),
      orden: _ord(c.orden), activo: _act(c.activo), uso: calc.usoCon[_t(c.id)] || 0 })).sort(_porOrden),
    compromisos: comps.map(_compromisoPublico).sort(_porNombre),
    compromisosMes: _compromisosDelMes(comps, movs, periodo),
    deudas: _deudasConSaldo(deudas, movs),
    ultimos: _movsPublicos(movs).slice(0, 5),
    advertencias: calc.advertencias
  };
  res.total = _c2p(res.cuentas.reduce((s, c) => s + _p2c(c.saldo), 0));
  movs.forEach(m => {
    if (_t(m.estado) !== 'ACTIVO' || _fecha(m.fecha_operacion).slice(0, 7) !== periodo) return;
    if (m.tipo === 'INGRESO') res.mes.ingresos += _p2c(m.importe);
    if (m.tipo === 'EGRESO') res.mes.gastos += _p2c(m.importe);
  });
  res.mes.ingresos = _c2p(res.mes.ingresos); res.mes.gastos = _c2p(res.mes.gastos);

  const pid = _t(cfg.todo.perfil_inicial).toUpperCase();
  const perfiles = _tabla(H.PERFILES).filas.filter(p => _act(p.activo))
    .map(p => ({ id: _t(p.perfil_id), nombre: _t(p.nombre), emoji: _t(p.emoji), descripcion: _t(p.descripcion), orden: _ord(p.orden) }))
    .sort(_porOrden);
  res.perfil = perfiles.filter(p => p.id.toUpperCase() === pid)[0] || null;
  if (!cats.length) res.perfiles = perfiles;   // catálogo vacío → hay que elegir perfil
  return _ok(res);
}

function apiMovimientos(d) {
  const desde = _fechaValida(d.desde) ? d.desde : '';
  const hasta = _fechaValida(d.hasta) ? d.hasta : '';
  const lista = _movsPublicos(_tabla(H.MOVIMIENTOS).filas).filter(m =>
    (!desde || m.fecha_operacion >= desde) && (!hasta || m.fecha_operacion <= hasta) &&
    (!d.cuenta_id || m.cuenta_id === d.cuenta_id || m.cuenta_destino_id === d.cuenta_id) &&
    (!d.tipo || m.tipo === d.tipo) && (!d.estado || m.estado === d.estado));
  const limite = Math.min(Number(d.limite) || 300, 1000);
  return _ok({ total: lista.length, movimientos: lista.slice(0, limite), recortado: lista.length > limite });
}

function apiCompromisosMes(d) {
  const periodo = _periodoValido(d.periodo) ? d.periodo : _hoy().slice(0, 7);
  return _ok({ periodo: periodo, compromisos: _compromisosDelMes(_tabla(H.COMPROMISOS).filas, _tabla(H.MOVIMIENTOS).filas, periodo) });
}

function apiVerificarOperacion(opIdBruto) {
  const opId = _opId(opIdBruto);
  const hojas = [H.MOVIMIENTOS, H.DEUDAS, H.CATEGORIAS, H.CONCEPTOS, H.CUENTAS, H.COMPROMISOS];
  if (SpreadsheetApp.getActiveSpreadsheet().getSheetByName(H.INCIDENCIAS)) hojas.push(H.INCIDENCIAS);
  for (let i = 0; i < hojas.length; i++) {
    const f = _tabla(hojas[i]).filas.filter(x => _t(x.op_id) === opId)[0];
    if (f) return _ok({ existe: true, hoja: hojas[i], id: _t(f.id) });
  }
  return _ok({ existe: false });
}

// ===============================================================
// ESCRITURA (todas corren dentro de _conCandado)
// ===============================================================
function apiElegirPerfil(d, u, opId) {
  if (_tabla(H.CATEGORIAS).filas.length || _tabla(H.CONCEPTOS).filas.length || _tabla(H.CUENTAS).filas.length) {
    if (_t(_config().todo.perfil_inicial).toUpperCase() === _t(d.perfil_id).toUpperCase()) return _ok({ duplicado: true });
    throw _ex('PERFIL_YA_ELEGIDO', 'Esta planilla ya tiene un catálogo. Para cambiar de perfil hay que reiniciar TEST.');
  }
  return _ok(_copiarPerfil(d.perfil_id, opId));
}

function apiRegistrarMovimiento(d, u, opId) {
  const previo = _buscarOp(H.MOVIMIENTOS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const tipo = _t(d.tipo).toUpperCase();
  if (TIPOS_CAT.indexOf(tipo) === -1) throw _ex('TIPO_INVALIDO', 'El tipo debe ser EGRESO o INGRESO');
  const con = _activoPorId(H.CONCEPTOS, d.concepto_id, 'concepto');
  const cat = _activoPorId(H.CATEGORIAS, con.categoria_id, 'categoría');
  if (_t(cat.tipo) !== tipo) throw _ex('TIPO_NO_COINCIDE', 'El concepto "' + con.nombre + '" es de tipo ' + cat.tipo + ', no ' + tipo);
  const cuenta = _activoPorId(H.CUENTAS, d.cuenta_id, 'cuenta');
  let compromisoId = '', periodo = '';
  if (d.compromiso_id) {
    const comp = _activoPorId(H.COMPROMISOS, d.compromiso_id, 'compromiso');
    if (tipo !== 'EGRESO') throw _ex('COMPROMISO_INVALIDO', 'Un compromiso solo se paga con un gasto');
    if (!_periodoValido(d.periodo)) throw _ex('PERIODO_INVALIDO', 'Indicá el mes del compromiso (AAAA-MM)');
    compromisoId = _t(comp.id); periodo = d.periodo;
  }
  const id = _nuevoId('MOV');
  _agregar(H.MOVIMIENTOS, [{
    id: id, op_id: opId, fecha_operacion: _fechaReq(d.fecha), fecha_registro: _ahora(), tipo: tipo,
    categoria_id: _t(cat.id), categoria_nombre: _t(cat.nombre), concepto_id: _t(con.id), concepto_nombre: _t(con.nombre),
    cuenta_id: _t(cuenta.id), cuenta_destino_id: '', importe: _importeReq(d.importe), descripcion: _desc(d.descripcion),
    deuda_id: '', compromiso_id: compromisoId, periodo: periodo, estado: 'ACTIVO', motivo_anulacion: '',
    usuario: u.nombre, fecha_anulacion: '', anulado_por: ''
  }]);
  return _ok({ id: id });
}

function apiRegistrarTransferencia(d, u, opId) {
  const previo = _buscarOp(H.MOVIMIENTOS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const origen = _activoPorId(H.CUENTAS, d.cuenta_id, 'cuenta de origen');
  const destino = _activoPorId(H.CUENTAS, d.cuenta_destino_id, 'cuenta de destino');
  if (_t(origen.id) === _t(destino.id)) throw _ex('MISMA_CUENTA', 'La cuenta de origen y la de destino deben ser distintas');
  const id = _nuevoId('MOV');
  _agregar(H.MOVIMIENTOS, [{
    id: id, op_id: opId, fecha_operacion: _fechaReq(d.fecha), fecha_registro: _ahora(), tipo: 'TRANSFERENCIA',
    categoria_id: '', categoria_nombre: '', concepto_id: '', concepto_nombre: 'Transferencia',
    cuenta_id: _t(origen.id), cuenta_destino_id: _t(destino.id), importe: _importeReq(d.importe), descripcion: _desc(d.descripcion),
    deuda_id: '', compromiso_id: '', periodo: '', estado: 'ACTIVO', motivo_anulacion: '',
    usuario: u.nombre, fecha_anulacion: '', anulado_por: ''
  }]);
  return _ok({ id: id });
}

function apiAnularMovimiento(d, u) {
  const t = _tabla(H.MOVIMIENTOS);
  const m = t.filas.filter(x => _t(x.id) === _t(d.id))[0];
  if (!m) throw _ex('NO_EXISTE', 'No existe el movimiento ' + d.id);
  if (_t(m.estado) === 'ANULADO') return _ok({ duplicado: true, id: _t(m.id) });
  if (_t(m.tipo) === 'DEUDA_ALTA') throw _ex('ANULAR_DESDE_DEUDA', 'Este movimiento es el alta de una deuda: anulá la deuda desde la pantalla Deudas');
  const motivo = _motivo(d.motivo);
  _actualizar(H.MOVIMIENTOS, m._fila, { estado: 'ANULADO', motivo_anulacion: motivo, fecha_anulacion: _ahora(), anulado_por: u.nombre });
  if (_t(m.tipo) === 'PAGO_DEUDA') _refrescarEstadoDeuda(_t(m.deuda_id));
  return _ok({ id: _t(m.id) });
}

function apiCrearDeuda(d, u, opId) {
  const previo = _buscarOp(H.DEUDAS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const sentido = _t(d.sentido).toUpperCase();
  if (SENTIDOS.indexOf(sentido) === -1) throw _ex('SENTIDO_INVALIDO', 'Indicá si es DEBO o ME_DEBEN');
  const contraparte = _t(d.contraparte).slice(0, 60);
  if (!contraparte) throw _ex('FALTA_CONTRAPARTE', 'Indicá con quién es la deuda');
  const importe = _importeReq(d.importe), fecha = _fechaReq(d.fecha);
  const venc = d.vencimiento ? _fechaReq(d.vencimiento) : '';
  let cuenta = null;
  if (d.mover_dinero) cuenta = _activoPorId(H.CUENTAS, d.cuenta_id, 'cuenta');
  const id = _nuevoId('DEU');
  _agregar(H.DEUDAS, [{ id: id, sentido: sentido, contraparte: contraparte, descripcion: _desc(d.descripcion), importe_original: importe,
    fecha: fecha, vencimiento: venc, estado: 'PENDIENTE', fecha_alta: _ahora(), op_id: opId, usuario: u.nombre, motivo_anulacion: '' }]);
  if (cuenta) {
    _agregar(H.MOVIMIENTOS, [{
      id: _nuevoId('MOV'), op_id: opId, fecha_operacion: fecha, fecha_registro: _ahora(), tipo: 'DEUDA_ALTA',
      categoria_id: '', categoria_nombre: '', concepto_id: '',
      concepto_nombre: sentido === 'DEBO' ? 'Préstamo recibido de ' + contraparte : 'Préstamo dado a ' + contraparte,
      cuenta_id: _t(cuenta.id), cuenta_destino_id: '', importe: importe, descripcion: _desc(d.descripcion),
      deuda_id: id, compromiso_id: '', periodo: '', estado: 'ACTIVO', motivo_anulacion: '',
      usuario: u.nombre, fecha_anulacion: '', anulado_por: ''
    }]);
  }
  return _ok({ id: id });
}

function apiPagarDeuda(d, u, opId) {
  const previo = _buscarOp(H.MOVIMIENTOS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const deuda = _tabla(H.DEUDAS).filas.filter(x => _t(x.id) === _t(d.deuda_id))[0];
  if (!deuda) throw _ex('NO_EXISTE', 'No existe la deuda ' + d.deuda_id);
  if (_t(deuda.estado) === 'ANULADA') throw _ex('DEUDA_ANULADA', 'La deuda está anulada');
  const info = _deudasConSaldo([deuda], _tabla(H.MOVIMIENTOS).filas)[0];
  const importe = _importeReq(d.importe);
  if (info.pendiente <= 0) throw _ex('DEUDA_SALDADA', 'Esta deuda ya está saldada');
  if (_p2c(importe) > _p2c(info.pendiente)) throw _ex('IMPORTE_MAYOR', 'El importe supera el saldo pendiente (' + info.pendiente + ')');
  const cuenta = _activoPorId(H.CUENTAS, d.cuenta_id, 'cuenta');
  const id = _nuevoId('MOV');
  const debo = _t(deuda.sentido) === 'DEBO';
  _agregar(H.MOVIMIENTOS, [{
    id: id, op_id: opId, fecha_operacion: _fechaReq(d.fecha), fecha_registro: _ahora(), tipo: 'PAGO_DEUDA',
    categoria_id: '', categoria_nombre: '', concepto_id: '',
    concepto_nombre: (debo ? 'Pago a ' : 'Cobro de ') + _t(deuda.contraparte),
    cuenta_id: _t(cuenta.id), cuenta_destino_id: '', importe: importe, descripcion: _desc(d.descripcion),
    deuda_id: _t(deuda.id), compromiso_id: '', periodo: '', estado: 'ACTIVO', motivo_anulacion: '',
    usuario: u.nombre, fecha_anulacion: '', anulado_por: ''
  }]);
  _refrescarEstadoDeuda(_t(deuda.id));
  return _ok({ id: id });
}

function apiAnularDeuda(d, u) {
  const deuda = _tabla(H.DEUDAS).filas.filter(x => _t(x.id) === _t(d.id))[0];
  if (!deuda) throw _ex('NO_EXISTE', 'No existe la deuda ' + d.id);
  if (_t(deuda.estado) === 'ANULADA') return _ok({ duplicado: true, id: _t(deuda.id) });
  const motivo = _motivo(d.motivo);
  const movs = _tabla(H.MOVIMIENTOS).filas.filter(m => _t(m.deuda_id) === _t(deuda.id) && _t(m.estado) === 'ACTIVO');
  if (movs.some(m => _t(m.tipo) === 'PAGO_DEUDA'))
    throw _ex('TIENE_PAGOS', 'La deuda tiene pagos activos. Anulá primero esos pagos desde el Historial.');
  movs.filter(m => _t(m.tipo) === 'DEUDA_ALTA').forEach(m =>
    _actualizar(H.MOVIMIENTOS, m._fila, { estado: 'ANULADO', motivo_anulacion: 'Deuda anulada: ' + motivo, fecha_anulacion: _ahora(), anulado_por: u.nombre }));
  _actualizar(H.DEUDAS, deuda._fila, { estado: 'ANULADA', motivo_anulacion: motivo });
  return _ok({ id: _t(deuda.id) });
}

// ---------- Catálogo ----------
function apiCrearCategoria(d, u, opId) {
  const previo = _buscarOp(H.CATEGORIAS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const nombre = _nombreReq(d.nombre, 40), tipo = _t(d.tipo).toUpperCase();
  if (TIPOS_CAT.indexOf(tipo) === -1) throw _ex('TIPO_INVALIDO', 'El tipo debe ser EGRESO o INGRESO');
  const filas = _tabla(H.CATEGORIAS).filas;
  if (filas.some(c => _act(c.activo) && _t(c.tipo) === tipo && _mismo(c.nombre, nombre))) throw _ex('YA_EXISTE', 'Ya existe la categoría "' + nombre + '"');
  const id = _nuevoId('CAT');
  _agregar(H.CATEGORIAS, [{ id: id, nombre: nombre, tipo: tipo, emoji: _t(d.emoji).slice(0, 8) || '📁', color: '',
    orden: _maxOrden(filas.filter(c => _t(c.tipo) === tipo)) + 1, activo: true, origen_plantilla_id: '', fecha_alta: _ahora(), op_id: opId }]);
  return _ok({ id: id });
}

function apiEditarCategoria(d) {
  const c = _porId(H.CATEGORIAS, d.id, 'categoría');
  const cambios = {};
  if (d.nombre !== undefined) {
    const nombre = _nombreReq(d.nombre, 40);
    if (_tabla(H.CATEGORIAS).filas.some(x => _t(x.id) !== _t(c.id) && _act(x.activo) && _t(x.tipo) === _t(c.tipo) && _mismo(x.nombre, nombre)))
      throw _ex('YA_EXISTE', 'Ya existe otra categoría "' + nombre + '"');
    cambios.nombre = nombre;
  }
  if (d.emoji !== undefined) cambios.emoji = _t(d.emoji).slice(0, 8) || '📁';
  if (d.orden !== undefined) cambios.orden = _ordenReq(d.orden);
  if (d.activo !== undefined) cambios.activo = !!d.activo;
  _actualizar(H.CATEGORIAS, c._fila, cambios);
  return _ok({ id: _t(c.id) });
}

function apiCrearConcepto(d, u, opId) {
  const previo = _buscarOp(H.CONCEPTOS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const cat = _activoPorId(H.CATEGORIAS, d.categoria_id, 'categoría');
  const nombre = _nombreReq(d.nombre, 45);
  const filas = _tabla(H.CONCEPTOS).filas.filter(c => _t(c.categoria_id) === _t(cat.id));
  if (filas.some(c => _act(c.activo) && _mismo(c.nombre, nombre))) throw _ex('YA_EXISTE', 'Ya existe el concepto "' + nombre + '" en ' + cat.nombre);
  const id = _nuevoId('CON');
  _agregar(H.CONCEPTOS, [{ id: id, categoria_id: _t(cat.id), nombre: nombre, importe_sugerido: _importeOpc(d.importe_sugerido),
    cuenta_sugerida_id: '', orden: _maxOrden(filas) + 1, activo: true, origen_plantilla_id: '', fecha_alta: _ahora(), op_id: opId }]);
  return _ok({ id: id });
}

function apiEditarConcepto(d) {
  const c = _porId(H.CONCEPTOS, d.id, 'concepto');
  const cambios = {};
  if (d.nombre !== undefined) {
    const nombre = _nombreReq(d.nombre, 45);
    if (_tabla(H.CONCEPTOS).filas.some(x => _t(x.id) !== _t(c.id) && _act(x.activo) && _t(x.categoria_id) === _t(c.categoria_id) && _mismo(x.nombre, nombre)))
      throw _ex('YA_EXISTE', 'Ya existe otro concepto "' + nombre + '" en esa categoría');
    cambios.nombre = nombre;
  }
  if (d.importe_sugerido !== undefined) cambios.importe_sugerido = _importeOpc(d.importe_sugerido);
  if (d.orden !== undefined) cambios.orden = _ordenReq(d.orden);
  if (d.activo !== undefined) cambios.activo = !!d.activo;
  _actualizar(H.CONCEPTOS, c._fila, cambios);
  return _ok({ id: _t(c.id) });
}

function apiCrearCuenta(d, u, opId) {
  const previo = _buscarOp(H.CUENTAS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const nombre = _nombreReq(d.nombre, 40), tipo = _t(d.tipo).toUpperCase();
  if (TIPOS_CUENTA.indexOf(tipo) === -1) throw _ex('TIPO_INVALIDO', 'Tipo de cuenta no válido');
  const filas = _tabla(H.CUENTAS).filas;
  if (filas.some(c => _act(c.activo) && _mismo(c.nombre, nombre))) throw _ex('YA_EXISTE', 'Ya existe la cuenta "' + nombre + '"');
  const id = _nuevoId('CTA');
  _agregar(H.CUENTAS, [{ id: id, nombre: nombre, tipo: tipo, saldo_inicial: _saldoReq(d.saldo_inicial), fecha_saldo_inicial: _hoy(),
    color: '', orden: _maxOrden(filas) + 1, activo: true, origen_plantilla_id: '', fecha_alta: _ahora(), op_id: opId }]);
  return _ok({ id: id });
}

function apiEditarCuenta(d) {
  const c = _porId(H.CUENTAS, d.id, 'cuenta');
  const cambios = {};
  if (d.nombre !== undefined) {
    const nombre = _nombreReq(d.nombre, 40);
    if (_tabla(H.CUENTAS).filas.some(x => _t(x.id) !== _t(c.id) && _act(x.activo) && _mismo(x.nombre, nombre))) throw _ex('YA_EXISTE', 'Ya existe otra cuenta "' + nombre + '"');
    cambios.nombre = nombre;
  }
  if (d.tipo !== undefined) {
    const tipo = _t(d.tipo).toUpperCase();
    if (TIPOS_CUENTA.indexOf(tipo) === -1) throw _ex('TIPO_INVALIDO', 'Tipo de cuenta no válido');
    cambios.tipo = tipo;
  }
  if (d.saldo_inicial !== undefined) { cambios.saldo_inicial = _saldoReq(d.saldo_inicial); cambios.fecha_saldo_inicial = _hoy(); }
  if (d.orden !== undefined) cambios.orden = _ordenReq(d.orden);
  if (d.activo !== undefined) cambios.activo = !!d.activo;
  _actualizar(H.CUENTAS, c._fila, cambios);
  return _ok({ id: _t(c.id) });
}

function apiCrearCompromiso(d, u, opId) {
  const previo = _buscarOp(H.COMPROMISOS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const datos = _datosCompromiso(d, true);
  const id = _nuevoId('CMP');
  datos.id = id; datos.activo = true; datos.op_id = opId; datos.fecha_alta = _ahora();
  _agregar(H.COMPROMISOS, [datos]);
  return _ok({ id: id });
}

function apiEditarCompromiso(d) {
  const c = _porId(H.COMPROMISOS, d.id, 'compromiso');
  const cambios = _datosCompromiso(d, false);
  if (d.activo !== undefined) cambios.activo = !!d.activo;
  _actualizar(H.COMPROMISOS, c._fila, cambios);
  return _ok({ id: _t(c.id) });
}

function _datosCompromiso(d, nuevo) {
  const r = {};
  if (nuevo || d.nombre !== undefined) r.nombre = _nombreReq(d.nombre, 40);
  if (nuevo || d.concepto_id !== undefined) {
    const con = _activoPorId(H.CONCEPTOS, d.concepto_id, 'concepto');
    const cat = _activoPorId(H.CATEGORIAS, con.categoria_id, 'categoría');
    if (_t(cat.tipo) !== 'EGRESO') throw _ex('COMPROMISO_INVALIDO', 'Un compromiso debe usar un concepto de gasto');
    r.concepto_id = _t(con.id); r.categoria_id = _t(cat.id);
  }
  if (nuevo || d.importe_estimado !== undefined) r.importe_estimado = _importeOpc(d.importe_estimado);
  if (nuevo || d.dia_vencimiento !== undefined) {
    const dia = Number(d.dia_vencimiento);
    if (!(dia >= 1 && dia <= 31 && Math.floor(dia) === dia)) throw _ex('DIA_INVALIDO', 'El día de vencimiento debe ser de 1 a 31');
    r.dia_vencimiento = dia;
  }
  if (nuevo || d.cuenta_sugerida_id !== undefined) r.cuenta_sugerida_id = d.cuenta_sugerida_id ? _t(_activoPorId(H.CUENTAS, d.cuenta_sugerida_id, 'cuenta').id) : '';
  return r;
}

// ---------- Reportes de problemas (solo escribe en INCIDENCIAS) ----------
function apiReportarIncidencia(d, u, opId) {
  _asegurarIncidencias();
  const previo = _buscarOp(H.INCIDENCIAS, opId);
  if (previo) return _ok({ duplicado: true, id: _t(previo.id) });
  const tipo = _t(d.tipo).toUpperCase();
  if (TIPOS_INCIDENCIA.indexOf(tipo) === -1) throw _ex('TIPO_INVALIDO', 'Elegí ERROR o SUGERENCIA');
  const desc = _sinSecretos(_t(d.descripcion)).slice(0, 2000);
  if (desc.length < 5) throw _ex('FALTA_DESCRIPCION', 'Contá qué pasó (mínimo 5 letras)');
  const limpio = (v, max) => _sinSecretos(_t(v)).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
  const ahora = _ahora();
  const id = 'INC-' + ahora.slice(0, 10).replace(/-/g, '') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  _agregar(H.INCIDENCIAS, [{
    id: id, fecha_servidor: ahora, estado: 'NUEVO', tipo: tipo, descripcion: desc,
    pantalla: limpio(d.pantalla, 80), version_app: limpio(d.version_app, 20), version_backend: String(BACKEND_BUILD),
    perfil: _t(_config().todo.perfil_inicial),            // lo pone el servidor, no el celular
    usuario: u.nombre, navegador: limpio(d.navegador, 300), op_id: opId, notas_revision: '', fecha_cambio_estado: ''
  }]);
  return _ok({ id: id, fecha_servidor: ahora });
}

// Tapa claves de acceso, enlaces con clave y números largos (tarjetas/cuentas) si alguien los pega en un reporte.
function _sinSecretos(s) {
  return String(s || '')
    .replace(/[#?&]k=[^\s&]*/gi, '#k=[OCULTO]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[OCULTO]')
    .replace(/\b\d[\d -]{11,}\d\b/g, '[NÚMERO OCULTO]');
}

function _asegurarIncidencias() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(H.INCIDENCIAS);
  if (!sh) {
    sh = ss.insertSheet(H.INCIDENCIAS);
    sh.getRange(1, 1, 1, COLS.INCIDENCIAS.length).setValues([COLS.INCIDENCIAS]);
    sh.setFrozenRows(1);
    // Lista desplegable de estados para que el administrador los cambie a mano
    const col = COLS.INCIDENCIAS.indexOf('estado') + 1;
    sh.getRange(2, col, 999, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS_INCIDENCIA, true).setAllowInvalid(false).build());
  }
  return sh;
}

// ===============================================================
// CÁLCULOS
// ===============================================================
function _calcular(cuentas, movs, deudas) {
  const saldos = {}, usoCat = {}, usoCon = {}, advertencias = [];
  const sentido = {};
  deudas.forEach(x => sentido[_t(x.id)] = _t(x.sentido));
  cuentas.forEach(c => saldos[_t(c.id)] = _p2c(_n(c.saldo_inicial)));
  const sumar = (id, cent) => {
    if (!(id in saldos)) { advertencias.push('Movimiento con cuenta inexistente: ' + id); return; }
    saldos[id] += cent;
  };
  movs.forEach(m => {
    if (_t(m.estado) !== 'ACTIVO') return;
    const imp = _p2c(m.importe), cta = _t(m.cuenta_id), tipo = _t(m.tipo);
    if (tipo === 'INGRESO') sumar(cta, imp);
    else if (tipo === 'EGRESO') sumar(cta, -imp);
    else if (tipo === 'TRANSFERENCIA') { sumar(cta, -imp); sumar(_t(m.cuenta_destino_id), imp); }
    else if (tipo === 'DEUDA_ALTA' || tipo === 'PAGO_DEUDA') {
      const s = sentido[_t(m.deuda_id)];
      if (!s) { advertencias.push('Movimiento ' + _t(m.id) + ' apunta a una deuda inexistente'); return; }
      const entra = (tipo === 'DEUDA_ALTA') === (s === 'DEBO');   // alta DEBO entra; pago DEBO sale; al revés ME_DEBEN
      sumar(cta, entra ? imp : -imp);
    }
    if (tipo === 'INGRESO' || tipo === 'EGRESO') {
      usoCat[_t(m.categoria_id)] = (usoCat[_t(m.categoria_id)] || 0) + 1;
      usoCon[_t(m.concepto_id)] = (usoCon[_t(m.concepto_id)] || 0) + 1;
    }
  });
  return { saldos: saldos, usoCat: usoCat, usoCon: usoCon, advertencias: advertencias };
}

function _deudasConSaldo(deudas, movs) {
  return deudas.map(x => {
    const id = _t(x.id);
    const pagos = movs.filter(m => _t(m.deuda_id) === id && _t(m.tipo) === 'PAGO_DEUDA' && _t(m.estado) === 'ACTIVO');
    const pagado = pagos.reduce((s, m) => s + _p2c(m.importe), 0);
    const original = _p2c(x.importe_original);
    const anulada = _t(x.estado) === 'ANULADA';
    const pendiente = anulada ? 0 : Math.max(original - pagado, 0);
    return { id: id, sentido: _t(x.sentido), contraparte: _t(x.contraparte), descripcion: _t(x.descripcion),
      importe_original: _c2p(original), pagado: _c2p(pagado), pendiente: _c2p(pendiente),
      fecha: _fecha(x.fecha), vencimiento: _fecha(x.vencimiento),
      estado: anulada ? 'ANULADA' : (pendiente === 0 ? 'SALDADA' : (pagado > 0 ? 'PARCIAL' : 'PENDIENTE')),
      motivo_anulacion: _t(x.motivo_anulacion), cantidad_pagos: pagos.length };
  }).sort((a, b) => (a.estado === 'ANULADA') - (b.estado === 'ANULADA') || (a.estado === 'SALDADA') - (b.estado === 'SALDADA') || (a.fecha < b.fecha ? 1 : -1));
}

function _refrescarEstadoDeuda(deudaId) {
  const deuda = _tabla(H.DEUDAS).filas.filter(x => _t(x.id) === deudaId)[0];
  if (!deuda || _t(deuda.estado) === 'ANULADA') return;
  const info = _deudasConSaldo([deuda], _tabla(H.MOVIMIENTOS).filas)[0];
  const nuevo = info.pendiente === 0 ? 'SALDADA' : 'PENDIENTE';
  if (_t(deuda.estado) !== nuevo) _actualizar(H.DEUDAS, deuda._fila, { estado: nuevo });
}

function _compromisosDelMes(comps, movs, periodo) {
  const [y, mo] = periodo.split('-').map(Number);
  const diasMes = new Date(y, mo, 0).getDate();
  return comps.filter(c => _act(c.activo)).map(c => {
    const id = _t(c.id);
    const pagos = movs.filter(m => _t(m.compromiso_id) === id && _t(m.periodo) === periodo && _t(m.estado) === 'ACTIVO' && _t(m.tipo) === 'EGRESO');
    const pagado = pagos.reduce((s, m) => s + _p2c(m.importe), 0);
    const est = _impONull(c.importe_estimado);
    const dia = Math.min(Number(c.dia_vencimiento) || 1, diasMes);
    let estado = 'PENDIENTE';
    if (pagado > 0) estado = (est && pagado < _p2c(est)) ? 'PARCIAL' : 'PAGADO';
    return Object.assign(_compromisoPublico(c), { periodo: periodo, vencimiento: periodo + '-' + ('0' + dia).slice(-2),
      pagado: _c2p(pagado), estado: estado, pagos: pagos.map(m => ({ id: _t(m.id), fecha: _fecha(m.fecha_operacion), importe: _n(m.importe) })) });
  }).sort((a, b) => a.vencimiento < b.vencimiento ? -1 : a.vencimiento > b.vencimiento ? 1 : 0);
}

function _compromisoPublico(c) {
  return { id: _t(c.id), nombre: _t(c.nombre), categoria_id: _t(c.categoria_id), concepto_id: _t(c.concepto_id),
    importe_estimado: _impONull(c.importe_estimado), dia_vencimiento: Number(c.dia_vencimiento) || null,
    cuenta_sugerida_id: _t(c.cuenta_sugerida_id), activo: _act(c.activo) };
}

function _movsPublicos(movs) {
  return movs.map(m => ({
    id: _t(m.id), op_id: _t(m.op_id), fecha_operacion: _fecha(m.fecha_operacion), fecha_registro: _t(m.fecha_registro),
    tipo: _t(m.tipo), categoria_id: _t(m.categoria_id), categoria_nombre: _t(m.categoria_nombre), concepto_id: _t(m.concepto_id),
    concepto_nombre: _t(m.concepto_nombre), cuenta_id: _t(m.cuenta_id), cuenta_destino_id: _t(m.cuenta_destino_id),
    importe: _n(m.importe), descripcion: _t(m.descripcion), deuda_id: _t(m.deuda_id), compromiso_id: _t(m.compromiso_id),
    periodo: _t(m.periodo), estado: _t(m.estado), motivo_anulacion: _t(m.motivo_anulacion), usuario: _t(m.usuario),
    fecha_anulacion: _t(m.fecha_anulacion), anulado_por: _t(m.anulado_por)
  })).sort((a, b) => (a.fecha_operacion < b.fecha_operacion ? 1 : a.fecha_operacion > b.fecha_operacion ? -1 : (a.fecha_registro < b.fecha_registro ? 1 : -1)));
}

function _copiarPerfil(perfilId, opId) {
  const pid = _t(perfilId).toUpperCase();
  const perfil = _tabla(H.PERFILES).filas.filter(p => _t(p.perfil_id).toUpperCase() === pid)[0];
  if (!perfil) throw _ex('PERFIL_INEXISTENTE', 'No existe el perfil ' + pid);
  if (!_act(perfil.activo)) throw _ex('PERFIL_INACTIVO', 'El perfil ' + pid + ' está desactivado');
  const del = f => _t(f.perfil_id).toUpperCase() === pid && _act(f.activo);
  const ahora = _ahora(), hoy = _hoy(), op = opId || '';
  const cuentas = _tabla(H.P_CUENTAS).filas.filter(del).sort(_porOrdenFila).map((c, i) => ({
    id: _nuevoId('CTA'), nombre: _t(c.nombre) + ' (DEMO)', tipo: _t(c.tipo).toUpperCase(), saldo_inicial: 0, fecha_saldo_inicial: hoy,
    color: '', orden: _ord(c.orden), activo: true, origen_plantilla_id: _t(c.plantilla_id), fecha_alta: ahora, op_id: op }));
  const mapa = {};
  const cats = _tabla(H.P_CATEGORIAS).filas.filter(del).filter(c => TIPOS_CAT.indexOf(_t(c.tipo).toUpperCase()) !== -1).map(c => {
    const id = _nuevoId('CAT'); mapa[_t(c.plantilla_id)] = id;
    return { id: id, nombre: _t(c.nombre), tipo: _t(c.tipo).toUpperCase(), emoji: _t(c.emoji), color: _t(c.color), orden: _ord(c.orden),
      activo: true, origen_plantilla_id: _t(c.plantilla_id), fecha_alta: ahora, op_id: op };
  });
  const omitidos = [];
  const cons = [];
  _tabla(H.P_CONCEPTOS).filas.filter(del).forEach(c => {
    const catId = mapa[_t(c.plantilla_categoria_id)];
    if (!catId) { omitidos.push(_t(c.plantilla_id)); return; }
    cons.push({ id: _nuevoId('CON'), categoria_id: catId, nombre: _t(c.nombre), importe_sugerido: _impONull(c.importe_sugerido),
      cuenta_sugerida_id: '', orden: _ord(c.orden), activo: true, origen_plantilla_id: _t(c.plantilla_id), fecha_alta: ahora, op_id: op });
  });
  if (!cats.length) throw _ex('PERFIL_VACIO', 'El perfil ' + pid + ' no tiene categorías activas en la plantilla');
  _agregar(H.CUENTAS, cuentas); _agregar(H.CATEGORIAS, cats); _agregar(H.CONCEPTOS, cons);
  _setConfig('perfil_inicial', pid);
  return { perfil_id: pid, cuentas: cuentas.length, categorias: cats.length, conceptos: cons.length, omitidos: omitidos };
}

// ===============================================================
// FUNCIONES MANUALES (editor)
// ===============================================================
function inicializarTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { Logger.log('❌ El script no está vinculado a una planilla.'); return; }
  if (ss.getName().indexOf(MARCA_TEST) === -1) {
    Logger.log('❌ DETENIDO: esta planilla se llama "' + ss.getName() + '". Solo se inicializa una planilla cuyo nombre contenga ' + MARCA_TEST + '.');
    Logger.log('   VAO_BALANCE_BASE NO se modifica: hacé una copia llamada VAO_BALANCE_TEST y ejecutá esto en el script de la copia.');
    return;
  }
  const faltan = [H.CONFIG, H.PERFILES, H.P_CUENTAS, H.P_CATEGORIAS, H.P_CONCEPTOS, H.CUENTAS, H.CATEGORIAS, H.CONCEPTOS,
    H.MOVIMIENTOS, H.DEUDAS, H.COMPROMISOS].filter(n => !ss.getSheetByName(n));
  if (faltan.length) { Logger.log('❌ Faltan hojas: ' + faltan.join(', ') + '. ¿Es una copia de VAO_BALANCE_BASE?'); return; }
  PropertiesService.getScriptProperties().setProperty(PROP_TEST_ID, ss.getId());

  if (!ss.getSheetByName(H.USUARIOS)) {
    const sh = ss.insertSheet(H.USUARIOS);
    sh.getRange(1, 1, 1, COLS.USUARIOS.length).setValues([COLS.USUARIOS]);
    sh.setFrozenRows(1);
    Logger.log('✅ Hoja USUARIOS creada');
  }
  if (!ss.getSheetByName(H.INCIDENCIAS)) { _asegurarIncidencias(); Logger.log('✅ Hoja INCIDENCIAS creada (estados: ' + ESTADOS_INCIDENCIA.join(' / ') + ')'); }
  [H.CUENTAS, H.CATEGORIAS, H.CONCEPTOS, H.MOVIMIENTOS, H.DEUDAS, H.COMPROMISOS].forEach(n => {
    const sh = ss.getSheetByName(n);
    const enc = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(x => String(x).trim());
    const agregar = COLS[n].filter(c => enc.indexOf(c) === -1);
    if (agregar.length) {
      sh.getRange(1, enc.filter(String).length + 1, 1, agregar.length).setValues([agregar]);
      Logger.log('✅ ' + n + ': columnas agregadas → ' + agregar.join(', '));
    }
    // El backend valida los datos; las listas desplegables de la plantilla no deben bloquear escrituras del script.
    if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getMaxColumns()).clearDataValidations();
  });
  _setConfig('entorno', 'TEST');
  if (!_t(_config().todo.nombre_cliente)) _setConfig('nombre_cliente', 'DEMO — Planilla de pruebas');
  if (!('url_app' in _config().todo)) _setConfig('url_app', 'https://vao-balance.vercel.app/');
  if (!('url_api' in _config().todo)) _setConfig('url_api', '');

  const pid = _t(_config().todo.perfil_inicial);
  if (pid && !_tabla(H.CATEGORIAS).filas.length) {
    const r = _copiarPerfil(pid, 'INIT');
    Logger.log('✅ Perfil ' + r.perfil_id + ' copiado: ' + r.cuentas + ' cuentas, ' + r.categorias + ' categorías, ' + r.conceptos + ' conceptos');
  } else if (!pid) {
    Logger.log('ℹ️ Sin perfil elegido: la app pedirá elegir uno la primera vez (o escribí FAM/EST/EMP en CONFIG > perfil_inicial y repetí).');
  } else {
    Logger.log('ℹ️ El catálogo ya existe (perfil ' + pid + '). No se copió nada de nuevo.');
  }
  Logger.log('✅ VAO_BALANCE_TEST lista. Siguiente: implementar como aplicación web y pegar la URL /exec en CONFIG > url_api.');
}

function crearAcceso() {
  if (!_planillaEsTest()) { Logger.log('❌ Primero ejecutá inicializarTest() en VAO_BALANCE_TEST.'); return; }
  const cfg = _config().todo;
  const api = _t(cfg.url_api), app = _t(cfg.url_app);
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^\/]+\/exec$/.test(api)) {
    Logger.log('❌ Falta la URL del backend: pegá en CONFIG > url_api la dirección que termina en /exec (Implementar → Administrar implementaciones).');
    return;
  }
  const clave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const n = _tabla(H.USUARIOS).filas.length + 1;
  const nombre = 'Usuario ' + n;
  _agregar(H.USUARIOS, [{ usuario_id: _nuevoId('USR'), nombre: nombre, clave_hash: _sha256(clave), activo: true, creado: _ahora(), ultimo_acceso: '' }]);
  Logger.log('✅ Acceso creado para "' + nombre + '" (podés cambiar el nombre en la hoja USUARIOS).');
  Logger.log('ENLACE (abrilo en el celular; es personal, no lo publiques):');
  Logger.log(app + '#k=' + clave + '&api=' + encodeURIComponent(api));
  Logger.log('La clave NO queda guardada en la planilla (solo su huella). Si se pierde, creá otro acceso. Para revocar: activo = FALSE en USUARIOS.');
}

function diagnostico() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { Logger.log('❌ No vinculado a planilla'); return; }
  Logger.log('Planilla: "' + ss.getName() + '" · ' + PRODUCTO + ' build ' + BACKEND_BUILD);
  Logger.log(_planillaEsTest() ? '✅ Escritura HABILITADA (planilla TEST inicializada)' : '🔒 Escritura BLOQUEADA en esta planilla');
  Object.keys(H).forEach(k => Logger.log((ss.getSheetByName(H[k]) ? '✅ ' : '⚠️ falta ') + H[k]));
  try {
    const c = _config().todo;
    Logger.log('Perfil: ' + (c.perfil_inicial || '(sin elegir)') + ' · url_api: ' + (c.url_api ? 'cargada' : 'VACÍA'));
    Logger.log('Cuentas ' + _tabla(H.CUENTAS).filas.length + ' · Categorías ' + _tabla(H.CATEGORIAS).filas.length +
      ' · Conceptos ' + _tabla(H.CONCEPTOS).filas.length + ' · Movimientos ' + _tabla(H.MOVIMIENTOS).filas.length +
      ' · Deudas ' + _tabla(H.DEUDAS).filas.length + ' · Compromisos ' + _tabla(H.COMPROMISOS).filas.length);
    if (ss.getSheetByName(H.USUARIOS)) Logger.log('Accesos activos: ' + _tabla(H.USUARIOS).filas.filter(u => _act(u.activo)).length);
    if (ss.getSheetByName(H.INCIDENCIAS)) Logger.log('Incidencias: ' + _tabla(H.INCIDENCIAS).filas.length + ' (NUEVO: ' + _tabla(H.INCIDENCIAS).filas.filter(i => _t(i.estado) === 'NUEVO').length + ')');
  } catch (e) { Logger.log('⚠️ ' + e.message); }
}

function reiniciarTest() {
  if (!_planillaEsTest()) { Logger.log('❌ Solo se puede reiniciar VAO_BALANCE_TEST ya inicializada.'); return; }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [H.MOVIMIENTOS, H.DEUDAS, H.COMPROMISOS, H.CONCEPTOS, H.CATEGORIAS, H.CUENTAS].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  _setConfig('perfil_inicial', '');
  Logger.log('✅ Datos de prueba borrados (plantillas y accesos intactos). La app pedirá elegir perfil de nuevo.');
}

// ===============================================================
// ACCESO Y SEGURIDAD
// ===============================================================
function _autenticar(clave) {
  const c = _t(clave);
  if (!/^[a-f0-9]{64}$/.test(c)) throw _ex('CLAVE_INVALIDA', 'Acceso no válido. Pedí un enlace de acceso nuevo.');
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(H.USUARIOS);
  if (!sh) throw _ex('CLAVE_INVALIDA', 'Acceso no configurado en esta planilla.');
  const h = _sha256(c);
  const u = _tabla(H.USUARIOS).filas.filter(x => _t(x.clave_hash) === h)[0];
  if (!u || !_act(u.activo)) throw _ex('CLAVE_INVALIDA', 'Acceso no válido o revocado.');
  return u;
}

function _planillaEsTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return !!ss && ss.getName().indexOf(MARCA_TEST) !== -1 &&
    PropertiesService.getScriptProperties().getProperty(PROP_TEST_ID) === ss.getId();
}

function _verificarEscritura() {
  if (!_planillaEsTest()) throw _ex('ESCRITURA_BLOQUEADA', 'Esta planilla no está habilitada para escribir (solo VAO_BALANCE_TEST inicializada).');
}

function _conCandado(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw _ex('OCUPADO', 'El sistema está ocupado. La operación NO se guardó; se reintentará.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function _buscarOp(hoja, opId) { return _tabla(hoja).filas.filter(f => _t(f.op_id) === opId)[0] || null; }

function _opId(v) {
  const s = _t(v);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(s)) throw _ex('OP_ID_INVALIDO', 'Falta el identificador de operación (op_id)');
  return s;
}

function _sha256(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// ===============================================================
// PLANILLA (lectura/escritura por nombre de columna)
// ===============================================================
function _hoja(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw _ex('PLANILLA_NO_VINCULADA', 'El script no está vinculado a una planilla');
  const sh = ss.getSheetByName(nombre);
  if (!sh) throw _ex('HOJA_FALTANTE', 'No existe la hoja ' + nombre, { hoja: nombre });
  return sh;
}

function _tabla(nombre) {
  const sh = _hoja(nombre);
  const datos = sh.getDataRange().getValues();
  const enc = (datos[0] || []).map(x => String(x).trim());
  const faltan = (COLS[nombre] || []).filter(c => enc.indexOf(c) === -1);
  if (faltan.length) throw _ex('COLUMNAS_FALTANTES', 'En ' + nombre + ' faltan columnas: ' + faltan.join(', ') + ' (¿ejecutaste inicializarTest?)', { hoja: nombre, faltan: faltan });
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const r = datos[i];
    if (r.every(v => v === '' || v === null)) continue;
    const o = { _fila: i + 1 };
    enc.forEach((h, j) => { if (h) o[h] = r[j]; });
    filas.push(o);
  }
  return { sh: sh, enc: enc, filas: filas };
}

function _agregar(nombre, objetos) {
  if (!objetos.length) return;
  const sh = _hoja(nombre);
  const enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  const valores = objetos.map(o => enc.map(h => (h in o && o[h] !== null && o[h] !== undefined) ? o[h] : ''));
  const formatos = objetos.map(o => enc.map(h => _formato(h, o[h])));
  const fila = _ultimaFilaConDatos(sh) + 1;
  const rango = sh.getRange(fila, 1, objetos.length, enc.length);
  rango.setNumberFormats(formatos);
  rango.setValues(valores);
}

function _actualizar(nombre, fila, cambios) {
  const sh = _hoja(nombre);
  const enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  Object.keys(cambios).forEach(k => {
    const col = enc.indexOf(k);
    if (col === -1) throw _ex('COLUMNAS_FALTANTES', 'En ' + nombre + ' falta la columna ' + k);
    const celda = sh.getRange(fila, col + 1);
    celda.setNumberFormat(_formato(k, cambios[k]));
    celda.setValue(cambios[k] === null ? '' : cambios[k]);
  });
}

// La plantilla trae filas con formato pero vacías: buscamos la última fila con datos reales.
function _ultimaFilaConDatos(sh) {
  const datos = sh.getDataRange().getValues();
  for (let i = datos.length - 1; i >= 1; i--) if (datos[i].some(v => v !== '' && v !== null)) return i + 1;
  return 1;
}

function _formato(col, v) {
  if (typeof v === 'boolean') return 'General';
  if (typeof v === 'number') return COLS_IMPORTE.indexOf(col) !== -1 ? '#,##0.00' : '0';
  return '@';
}

function _config() {
  const todo = {};
  _tabla(H.CONFIG).filas.forEach(f => { const k = _t(f.clave); if (k) todo[k] = f.valor; });
  const publica = {};
  CONFIG_PUBLICA.forEach(k => { if (k in todo) publica[k] = todo[k] === '' ? null : todo[k]; });
  return { todo: todo, publica: publica };
}

function _setConfig(clave, valor) {
  const t = _tabla(H.CONFIG);
  const f = t.filas.filter(x => _t(x.clave) === clave)[0];
  if (f) _actualizar(H.CONFIG, f._fila, { valor: valor });
  else _agregar(H.CONFIG, [{ clave: clave, valor: valor, descripcion: 'Agregado por el backend' }]);
}

function _porId(hoja, id, que) {
  const f = _tabla(hoja).filas.filter(x => _t(x.id) === _t(id))[0];
  if (!f || !_t(id)) throw _ex('NO_EXISTE', 'No existe ' + que + ' ' + _t(id));
  return f;
}
function _activoPorId(hoja, id, que) {
  const f = _porId(hoja, id, que);
  if (!_act(f.activo)) throw _ex('INACTIVO', 'La ' + que + ' "' + _t(f.nombre) + '" está desactivada');
  return f;
}

// ===============================================================
// VALIDACIONES Y UTILIDADES
// ===============================================================
function _importeReq(v) {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!isFinite(n) || n <= 0) throw _ex('IMPORTE_INVALIDO', 'El importe debe ser mayor que cero');
  if (n >= MAX_IMPORTE) throw _ex('IMPORTE_INVALIDO', 'Importe demasiado grande');
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) throw _ex('IMPORTE_INVALIDO', 'Máximo dos decimales');
  return Math.round(n * 100) / 100;
}
function _importeOpc(v) { return (v === null || v === undefined || v === '') ? null : _importeReq(v); }
function _saldoReq(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  if (!isFinite(n) || Math.abs(n) >= MAX_IMPORTE) throw _ex('IMPORTE_INVALIDO', 'Saldo inicial no válido');
  return Math.round(n * 100) / 100;
}
function _fechaReq(v) { if (!_fechaValida(v)) throw _ex('FECHA_INVALIDA', 'Fecha no válida (AAAA-MM-DD)'); return v; }
function _fechaValida(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(_t(v))) return false;
  const p = v.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
  return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2] && p[0] >= 2000 && p[0] <= 2100;
}
function _periodoValido(v) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(_t(v)); }
function _nombreReq(v, max) {
  const s = _t(v).replace(/\s+/g, ' ');
  if (!s) throw _ex('FALTA_NOMBRE', 'Escribí un nombre');
  if (s.length > max) throw _ex('NOMBRE_LARGO', 'Nombre demasiado largo (máximo ' + max + ')');
  return s;
}
function _ordenReq(v) { const n = Number(v); if (!isFinite(n)) throw _ex('ORDEN_INVALIDO', 'Orden no válido'); return Math.round(n); }
function _motivo(v) { const s = _t(v); if (s.length < 3) throw _ex('FALTA_MOTIVO', 'Escribí el motivo de la anulación'); return s.slice(0, 200); }
function _desc(v) { return _t(v).slice(0, 300); }
function _mismo(a, b) { return _t(a).toLowerCase() === _t(b).toLowerCase(); }
function _maxOrden(filas) { return filas.reduce((m, f) => Math.max(m, Number(f.orden) || 0), 0); }
function _nuevoId(pref) { return pref + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(); }
function _t(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function _n(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function _impONull(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isFinite(n) ? n : null; }
function _ord(v) { const n = Number(v); return (v === '' || v === null || !isFinite(n)) ? 9999 : n; }
function _act(v) {
  if (v === true) return true;
  const s = _t(v).toUpperCase();
  return s === 'TRUE' || s === 'VERDADERO' || s === 'SI' || s === 'SÍ' || s === '1';
}
function _p2c(v) { return Math.round(_n(v) * 100); }
function _c2p(c) { return Math.round(c) / 100; }
function _porOrden(a, b) { return (a.orden - b.orden) || String(a.nombre).localeCompare(String(b.nombre), 'es'); }
function _porOrdenFila(a, b) { return _ord(a.orden) - _ord(b.orden); }
function _porNombre(a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); }
function _tz() { try { return _t(_config().todo.zona_horaria) || TZ_DEFECTO; } catch (e) { return TZ_DEFECTO; } }
function _hoy() { return Utilities.formatDate(new Date(), _tz(), 'yyyy-MM-dd'); }
function _ahora() { return Utilities.formatDate(new Date(), TZ_DEFECTO, 'yyyy-MM-dd HH:mm:ss'); }
function _fecha(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ_DEFECTO, 'yyyy-MM-dd');
  return _t(v);
}
function _ok(o) { return Object.assign({ ok: true }, o || {}); }
function _err(codigo, mensaje, extra) { return Object.assign({ ok: false, error: codigo, mensaje: mensaje }, extra || {}); }
function _ex(codigo, mensaje, extra) { const e = new Error(mensaje); e.codigo = codigo; e.extra = extra; return e; }
function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
