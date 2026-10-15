# SEBA BALANCE STAGING v1 — Reporte de la noche

Se reconstruyó todo sobre el esqueleto de **VAO POS staging** (Code v023 + pos.html v20, admin v5, reportes v4, fiados v1).
"Producto" pasó a ser **gasto/ingreso por categoría**, y el carrito pasó a ser la **boleta**: varios renglones, cada uno con detalle y precio editable, un solo número de boleta.

## Estado por módulo
| Módulo | Estado | Notas |
|---|---|---|
| Inicio (código de cliente) | FUNCIONA | igual que el POS; recuerda el último código |
| Admin (clave, clientes, perfil, PIN, suspender, vigencia, reportes 🐞) | FUNCIONA | clave al azar, nunca escrita en el código |
| Entrada con PIN (6 números, bloqueo 5 intentos / 15 min, varios celulares) | FUNCIONA | |
| Boleta: buscar / ☰ lista por categoría / tarjetas más usadas | FUNCIONA | buscador del POS con palabras de finanzas (super, nafta, luz, celu...) |
| Varios renglones por boleta, detalle y precio editables | FUNCIONA | máximo 60 renglones |
| Gastos / Ingresos, cuenta y fecha al confirmar | FUNCIONA | recuerda la última cuenta usada |
| Boleta enviada sin confirmar (mismo número, no duplica) | FUNCIONA | igual que POS V11 + al reabrir verifica sola si había llegado |
| Saldos por cuenta y total (calculados) | FUNCIONA | saldo inicial editable |
| Transferencias entre cuentas | FUNCIONA | no cuentan como gasto ni ingreso |
| Catálogo editable (crear, editar, ocultar, precio sugerido) | FUNCIONA | |
| Cuentas (crear, editar, desactivar) | FUNCIONA | |
| Hoy | FUNCIONA | |
| Reportes (calendario, filtros, por categoría/concepto/cuenta, boletas, anular con motivo) | FUNCIONA | |
| Deudas: debo / me deben, préstamo con o sin dinero, pagos parciales, anular, WhatsApp | FUNCIONA | |
| Compromisos mensuales (no descuentan solos, pagar → gasto) | FUNCIONA | día 31 en febrero → 28 |
| 🐞 Reportar problema | FUNCIONA | sin localStorage, mismo número al reintentar, borra PIN y tokens del texto |
| Planilla real de Google | PENDIENTE | probado en simulador; falta tu prueba real (instalación en LEEME_INSTALAR.md) |
| Subida al repo | PENDIENTE | no lo subí: reemplaza el index actual y necesita la URL nueva. Lo hacés vos con la guía. |

## Simulaciones hechas
- **Servidor:** 128 pruebas OK. Incluyen: alta de cliente, PIN, bloqueo, sesiones de dos celulares, boleta de 3 renglones, reintento sin duplicar, 10 rechazos sin escribir nada, servidor ocupado, transferencias, anulación, deudas, compromisos, incidencias, aislamiento entre clientes, vencimiento y suspensión.
- **Pantallas (iPhone 13 y Pixel 5):** 69 pruebas OK en cada uno.
  - Uso normal.
  - Corte de señal con respuesta perdida, sin internet, recarga de página y doble toque.
  - Botón atrás.
  - Sesión vencida con la boleta armada.
  - Boleta larga de 25 renglones (viaja por POST).
  - Otro cliente en el mismo celular.
  - Pantalla chica de 320 px sin scroll horizontal.
  - Cero errores de JavaScript.

## Errores encontrados y corregidos esta noche
1. Los botones de la barra se cortaban ("Catál…", "Rep…") → ícono arriba y texto abajo.
2. En Deudas, si se cortaba la señal, el aviso de reintento quedaba tapado por la ventana → ahora el formulario queda fijo y el mismo botón reintenta sin duplicar.
3. Textos de "sin respuesta" con género mal ("el pago quedó guardada") → corregido.
4. Errores de mis propias pruebas (código esperado G045 en vez de G049, respuestas de prueba desfasadas): corregidos en las pruebas, no eran del sistema.

## Riesgos registrados (no frenan la prueba)
1. **Probado en simulador, no en Google real.** Puede haber diferencias de permisos o formato al importar el xlsx. Si aparece algo: botón 🐞 o captura.
2. **Velocidad:** cada pantalla lee la hoja MOVIMIENTOS completa. Con miles de movimientos por cliente va a ir más lento. Para staging está bien; antes de producción conviene un resumen por mes.
3. **PIN:** se guarda solo su huella (SHA-256 con sal), con bloqueo por intentos. **No es una protección definitiva**, igual que lo hablado.
4. **Sesión en el celular:** el token queda en el navegador (como el POS). Si alguien usa ese celular sin salir, entra. Botón 🚪 Salir cierra la sesión en el servidor.
5. **Editar un formulario después de un corte:** si el primer envío llegó, el reintento devuelve "ya estaba" con los datos del primero. Por eso el formulario queda bloqueado al cortarse.
6. **Renovar vigencia sin respuesta:** no tiene número de operación (igual que el POS). Si se corta, revisar la lista antes de repetir para no sumar dos veces. Se avisa en pantalla.
7. **Alta de cliente sin respuesta:** si se corta, puede haberse creado. La pantalla avisa: si aparece en la lista, usá 🔑 Reset PIN.
8. **Decisiones que tomé sin tu OK** (fáciles de cambiar):
   - Una sola hoja CLIENTES (en vez de VENDEDORES + CLIENTES_VAO).
   - Perfiles FAM/EST/EMP como plantilla.
   - La dirección del servidor va en `seba-config.js`.
   - Tarjetas "más usadas" cuando la boleta está vacía.
   - "Acerca de / Sebastián" **no** se agregó: quedó esperando tu OK, como pediste.

## Hallazgos de seguridad (separados, NO modifiqué nada)
1. Token de Mercado Pago `APP_USR-5614…` escrito en repos públicos (almacen-copihue-staging y SmartPOS STAGING, code-staging.gs línea 422). Preparar la sustitución controlada para no cortar los cobros por QR.
2. Clave admin del POS escrita en el código público de vaopos-STAGING (Code_v022, generarClaveAdmin).
3. POS: `crearVendedor` no pide sesión admin.
4. POS: `getVendedores` responde sin sesión (expone teléfono, correo y alias).
5. POS: `hashSimple` es débil (32 bits).
6. La clave del enlace de VAO_BALANCE_TEST y el PIN de QQ staging se vieron en capturas: conviene renovarlos.
