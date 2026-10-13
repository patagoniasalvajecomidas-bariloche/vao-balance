/* VAO BALANCE — CATÁLOGO INICIAL DE DEMOSTRACIÓN
   Este archivo contiene DATOS, no lógica de negocio.
   En la versión conectada, los datos vendrán de Google Sheets por medio de GAS.
   No incluye movimientos ni importes ficticios.
*/
window.VAO_CATALOGO = {
  version: 'demo-1',
  perfiles: [
    {
      id: 'estudiante', nombre: 'Estudiante / Joven', emoji: '🎓',
      descripcion: 'Estudios, salidas y gastos cotidianos',
      cuentas: [
        {id:'est-efectivo', nombre:'Efectivo', tipo:'EFECTIVO', saldoInicial:0},
        {id:'est-billetera', nombre:'Billetera virtual', tipo:'BILLETERA', saldoInicial:0}
      ],
      categorias: [
        {id:'est-educacion', nombre:'Educación', emoji:'🎓', tipo:'GASTO', orden:1},
        {id:'est-alimentacion', nombre:'Alimentación', emoji:'🥪', tipo:'GASTO', orden:2},
        {id:'est-transporte', nombre:'Transporte', emoji:'🚌', tipo:'GASTO', orden:3},
        {id:'est-vivienda', nombre:'Vivienda', emoji:'🏠', tipo:'GASTO', orden:4},
        {id:'est-tecnologia', nombre:'Tecnología', emoji:'📱', tipo:'GASTO', orden:5},
        {id:'est-ocio', nombre:'Entretenimiento', emoji:'🎮', tipo:'GASTO', orden:6},
        {id:'est-salud', nombre:'Salud', emoji:'💊', tipo:'GASTO', orden:7},
        {id:'est-personal', nombre:'Personal', emoji:'👕', tipo:'GASTO', orden:8},
        {id:'est-ingresos', nombre:'Mis ingresos', emoji:'💵', tipo:'INGRESO', orden:1}
      ],
      conceptos: [
        ['est-educacion','Cuota / Cursada','Materiales','Fotocopias','Libros','Cursos','Exámenes'],
        ['est-alimentacion','Supermercado','Comidas fuera','Delivery','Cafetería','Otros alimentos'],
        ['est-transporte','Pasajes','Combustible','Reparaciones','Taxi / Remís','Otros transportes'],
        ['est-vivienda','Alquiler','Expensas','Servicios','Mantenimiento','Otros vivienda'],
        ['est-tecnologia','Celular','Internet','Equipos','Accesorios','Aplicaciones'],
        ['est-ocio','Salidas','Streaming','Juegos','Eventos','Deportes'],
        ['est-salud','Medicamentos','Consultas','Estudios','Higiene','Otros salud'],
        ['est-personal','Ropa','Peluquería','Regalos','Cuidado personal','Otros personal'],
        ['est-ingresos','Sueldo','Beca','Ayuda familiar','Trabajos ocasionales','Ventas particulares','Otros ingresos']
      ]
    },
    {
      id: 'familia', nombre: 'Personal / Familiar', emoji: '🏡',
      descripcion: 'Tu casa, tu familia y tu día a día',
      cuentas: [
        {id:'fam-efectivo', nombre:'Efectivo', tipo:'EFECTIVO', saldoInicial:0},
        {id:'fam-banco', nombre:'Banco', tipo:'BANCO', saldoInicial:0},
        {id:'fam-billetera', nombre:'Billetera virtual', tipo:'BILLETERA', saldoInicial:0}
      ],
      categorias: [
        {id:'fam-alimentacion', nombre:'Alimentación', emoji:'🛒', tipo:'GASTO', orden:1},
        {id:'fam-hogar', nombre:'Hogar', emoji:'🏡', tipo:'GASTO', orden:2},
        {id:'fam-servicios', nombre:'Servicios', emoji:'💡', tipo:'GASTO', orden:3},
        {id:'fam-transporte', nombre:'Transporte', emoji:'🚗', tipo:'GASTO', orden:4},
        {id:'fam-salud', nombre:'Salud', emoji:'💊', tipo:'GASTO', orden:5},
        {id:'fam-educacion', nombre:'Educación', emoji:'📚', tipo:'GASTO', orden:6},
        {id:'fam-suscripciones', nombre:'Suscripciones', emoji:'📺', tipo:'GASTO', orden:7},
        {id:'fam-personal', nombre:'Personal', emoji:'👕', tipo:'GASTO', orden:8},
        {id:'fam-ocio', nombre:'Salidas y ocio', emoji:'🎉', tipo:'GASTO', orden:9},
        {id:'fam-ingresos', nombre:'Mis ingresos', emoji:'💵', tipo:'INGRESO', orden:1}
      ],
      conceptos: [
        ['fam-alimentacion','Supermercado','Carnicería','Verdulería','Comidas fuera','Delivery','Otros alimentos'],
        ['fam-hogar','Alquiler / Hipoteca','Mantenimiento','Artículos del hogar','Limpieza','Otros hogar'],
        ['fam-servicios','Electricidad','Gas','Agua','Internet','Telefonía','Otros servicios'],
        ['fam-transporte','Combustible','Repuestos','Reparaciones','Pasajes','Seguro y trámites','Otros transportes'],
        ['fam-salud','Medicamentos','Consultas','Estudios','Farmacia','Otros salud'],
        ['fam-educacion','Cuotas','Útiles','Materiales','Cursos','Otros educación'],
        ['fam-suscripciones','Streaming','Música','Almacenamiento','Aplicaciones','Otros abonos'],
        ['fam-personal','Vestimenta','Higiene','Peluquería','Regalos','Otros personal'],
        ['fam-ocio','Salidas','Vacaciones','Celebraciones','Deportes','Otros ocio'],
        ['fam-ingresos','Sueldo','Ventas particulares','Jubilación / Pensión','Ayuda familiar','Trabajos extra','Otros ingresos']
      ]
    },
    {
      id: 'emprendimiento', nombre: 'Emprendimiento', emoji: '🏪',
      descripcion: 'Los números de tu actividad',
      cuentas: [
        {id:'emp-efectivo', nombre:'Efectivo', tipo:'EFECTIVO', saldoInicial:0},
        {id:'emp-banco', nombre:'Banco', tipo:'BANCO', saldoInicial:0},
        {id:'emp-billetera', nombre:'Billetera virtual', tipo:'BILLETERA', saldoInicial:0}
      ],
      categorias: [
        {id:'emp-insumos', nombre:'Mercadería e insumos', emoji:'📦', tipo:'GASTO', orden:1},
        {id:'emp-operacion', nombre:'Local y servicios', emoji:'🏪', tipo:'GASTO', orden:2},
        {id:'emp-logistica', nombre:'Logística', emoji:'🚚', tipo:'GASTO', orden:3},
        {id:'emp-herramientas', nombre:'Herramientas', emoji:'🧰', tipo:'GASTO', orden:4},
        {id:'emp-personal', nombre:'Personal y servicios', emoji:'👥', tipo:'GASTO', orden:5},
        {id:'emp-marketing', nombre:'Publicidad', emoji:'📣', tipo:'GASTO', orden:6},
        {id:'emp-impuestos', nombre:'Impuestos y trámites', emoji:'🧾', tipo:'GASTO', orden:7},
        {id:'emp-admin', nombre:'Administración', emoji:'💼', tipo:'GASTO', orden:8},
        {id:'emp-ingresos', nombre:'Ventas y cobros', emoji:'💵', tipo:'INGRESO', orden:1}
      ],
      conceptos: [
        ['emp-insumos','Mercadería','Materia prima','Materiales','Embalaje','Otros insumos'],
        ['emp-operacion','Alquiler','Electricidad','Gas / Agua','Internet','Limpieza','Otros local'],
        ['emp-logistica','Combustible','Envíos','Fletes','Mantenimiento','Otros logística'],
        ['emp-herramientas','Equipos','Reparaciones','Software','Accesorios','Otros herramientas'],
        ['emp-personal','Sueldos','Honorarios','Capacitación','Otros personal'],
        ['emp-marketing','Publicidad','Impresiones','Diseño','Promociones','Otros publicidad'],
        ['emp-impuestos','Impuestos','Tasas','Contador','Habilitaciones','Otros trámites'],
        ['emp-admin','Comisiones','Gastos bancarios','Suscripciones','Otros administración'],
        ['emp-ingresos','Venta de productos','Venta de servicios','Trabajos realizados','Cobros','Otros ingresos']
      ]
    }
  ]
};
// Convertimos las listas de nombres en registros con ID. Sigue siendo CATÁLOGO, no hardcode de interfaz.
for (const perfil of window.VAO_CATALOGO.perfiles) {
  perfil.conceptos = perfil.conceptos.flatMap(([categoriaId, ...nombres]) =>
    nombres.map((nombre, orden) => ({
      id: `${categoriaId}-con-${orden + 1}`,
      categoriaId, nombre, orden: orden + 1, importeSugerido: null, activo: true
    }))
  );
  perfil.categorias.forEach(c => { c.activo = true; });
}
