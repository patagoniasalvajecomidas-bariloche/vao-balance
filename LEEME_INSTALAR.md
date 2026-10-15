# SEBA BALANCE — Cómo instalar el STAGING (paso a paso)

Es un sistema **nuevo y separado**: planilla nueva, script nuevo, URL nueva.
No toca VAO POS, Copihue, SmartPOS ni la planilla VAO_BALANCE_TEST.

## 1. Planilla
1. En Google Drive: **Nuevo → Subir archivo →** `SEBA_BALANCE_STAGING.xlsx`.
2. Abrilo y elegí **Archivo → Guardar como Hojas de cálculo de Google**.
3. Renombrala **SEBA_BALANCE_STAGING** (la versión .xlsx podés borrarla).
4. Deberías ver estas pestañas: LEEME, CLIENTES (vacía), PERFILES (3), PLANTILLA_CATALOGO (145 conceptos), PLANTILLA_CUENTAS (8), INCIDENCIAS (vacía).

## 2. Script
1. En esa planilla: **Extensiones → Apps Script**.
2. Borrá lo que haya en `Código.gs` y pegá TODO el contenido de `Code.gs`. Guardar (💾).
3. Arriba, elegí la función **instalar** → **▶ Ejecutar** → aceptá los permisos (es tu propia cuenta).
   En el registro tiene que decir: `Perfiles: 3 · Conceptos de plantilla: 145` y `⚠️ Falta la clave admin`.
4. Elegí **generarClaveAdmin** → **▶ Ejecutar**. En el registro aparece `✅ Clave admin NUEVA: xxxxxxxxxx`.
   **Anotala**: no queda guardada en ningún lado. Si la perdés, la ejecutás de nuevo y sale otra.

## 3. Publicar el script
1. **Implementar → Nueva implementación → ⚙️ Aplicación web.**
2. Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier usuario**.
3. Copiá la URL que termina en `/exec`.

## 4. Sitio (repo vao-balance)
1. Antes de reemplazar: renombrá el `index.html` actual del repo a `index_v3_backup.html` (también va una copia en `respaldo_V1/`).
2. Subí al repo todo lo de la carpeta `sitio/`: index.html, balance.html, reportes.html, deudas.html, admin.html, seba-comun.js, seba-config.js y los dos logos (si ya están, se reemplazan por los mismos).
3. Editá **seba-config.js** en GitHub y pegá la URL del paso 3 donde dice `PEGAR_AQUI_LA_URL_DEL_SCRIPT`. Es lo único que se completa.
4. Esperá que Vercel publique (1–2 minutos).

## 5. Primera prueba
1. Entrá al sitio → **¿Sos administrador? Acceso aquí** → clave del paso 2.4.
2. **＋ Nuevo cliente** → prefijo (ej. `SE`), nombre, perfil → Crear. Aparece el **PIN una sola vez**: anotalo.
3. Volvé al inicio → código `SE` → PIN → ya estás en la boleta.

## Si algo falla
- "Falta configurar la dirección del servidor": falta el paso 4.3.
- "Sistema no configurado": falta ejecutar `generarClaveAdmin`.
- Cambiaste el Code.gs: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva → Implementar** (la URL no cambia).
- Cualquier cosa rara: botón 🐞 en la app (queda en la hoja INCIDENCIAS).
