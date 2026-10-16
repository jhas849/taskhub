# SENATI TaskHub PWA

Bandeja académica local para consultar tareas de ejemplo y registrar entregas que persisten en IndexedDB, incluso sin conexión. Está implementada con Angular 19 y TypeScript.

> La aplicación no cuenta con API de entregas. Al recuperar Internet, actualiza el indicador de conexión y permite consultar el reintento, pero no envía datos ni marca entregas como sincronizadas.

## Requisitos

- Node.js compatible con Angular 19 y npm.
- Dependencias instaladas (`npm install`).
- Un navegador moderno con IndexedDB y soporte de Service Worker para probar PWA/offline.

## Instalación y ejecución

```bash
npm install
npm start
```

Abre `http://localhost:4200/`. `localhost` es un contexto seguro para IndexedDB y herramientas PWA. El Service Worker intencionalmente no se registra en modo desarrollo; usa la compilación de producción para validar el funcionamiento PWA.

## Funcionalidad

- Las tareas de ejemplo se cargan desde `src/assets/tasks.json`; se puede filtrar por título y curso al mismo tiempo.
- La validación del formulario requiere tarea y comentario no vacío. Los datos se limpian únicamente después de confirmar el guardado en IndexedDB.
- El panel muestra el total de tareas, entregas registradas y entregas pendientes. La navegación lateral permite acceder a tareas y entregas locales.
- El modelo `EntregaLocal` define los campos académicos en español y un identificador local único. La base `senati-taskhub` contiene el object store `entregas`, con índice por estado. El contador se consulta sobre registros `PENDIENTE`.
- El detalle se lee de IndexedDB. La eliminación solicita confirmación del navegador y actualiza el contador y la bandeja.
- Offline: se puede seguir registrando si IndexedDB está disponible. Las entregas permanecen `PENDIENTE`; no existe sincronización con servidor. El botón de reintento informa que falta configurar una API y no simula un envío ni incrementa intentos.
- Las bases de la versión previa (`submissions`) se migran al nuevo object store conservando las entregas guardadas.
- Los archivos de aplicación y recursos se precargan mediante el Service Worker. El JSON de tareas usa un grupo de datos con estrategia `freshness` y vigencia de siete días.

## Compilación y prueba de la PWA

1. Genera el build de producción:

   ```bash
   npm run build
   ```

   El sitio queda en `dist/taskhub/browser`. Sirve esa carpeta con un servidor HTTP estático en `localhost` (por ejemplo, `npx http-server dist/taskhub/browser -p 8080`) o despliega en HTTPS. No abras `index.html` como archivo local: los Service Workers requieren `localhost` o HTTPS.

2. Abre la dirección local del servidor, recarga y espera que termine la instalación del Service Worker. Comprueba en DevTools:
   - **Application → Manifest**: nombre, icono, colores y modo standalone.
   - **Application → Service Workers**: `ngsw-worker.js` registrado y activo.
   - **Application → Cache Storage**: recursos precargados del shell y recursos estáticos.
   - **Application → IndexedDB → senati-taskhub → entregas**: entregas y campos estructurados (`id`, `tareaId`, `curso`, `tituloTarea`, `comentario`, `fechaRegistro`, `estadoSincronizacion`, `intentosSincronizacion`).
   - **Network → Offline**: activa y recarga la aplicación; el shell y las tareas se sirven desde caché.

   Cache Storage contiene recursos/respuestas de la aplicación; IndexedDB contiene los registros de entrega. Son almacenes separados.

## Pruebas automatizadas

```bash
npm test -- --watch=false
```

Las pruebas unitarias cubren filtros combinados, validaciones, persistencia exitosa, conservación del formulario ante errores, consultas de detalle, confirmación de borrado y el estado pendiente al recuperar conectividad.

## Lista de pruebas manuales y evidencia

Usa `npm start` para probar los flujos funcionales; usa la compilación de producción para los escenarios de Service Worker:

1. Buscar “TypeScript” por título.
2. Elegir un curso en el filtro.
3. Combinar el título con un curso distinto y verificar el estado vacío; limpiar filtros.
4. Enviar el formulario sin elegir tarea.
5. Elegir tarea y enviar comentario vacío o con espacios.
6. Registrar entrega válida y confirmar el registro/campos en DevTools → Application → IndexedDB.
7. Recargar y comprobar que continúa en “Mis entregas locales”.
8. Registrar dos entregas; comparar el contador pendiente con IndexedDB.
9. Cancelar la confirmación de eliminación y comprobar que permanece.
10. Confirmar otra eliminación y comprobar que desaparece y baja el contador.
11. En Network → Offline, registrar una entrega y comprobar `PENDIENTE`.
12. Reactivar la conexión y comprobar Online sin que cambie a `SINCRONIZADO`.
13. Revisar manifest, Service Workers, Cache Storage e IndexedDB en Application.
14. Simular un fallo de almacenamiento bloqueando/eliminando el permiso a IndexedDB desde el navegador o usando un perfil/contexto sin IndexedDB; comprobar el mensaje de error y que el formulario conserve los datos. No existe una bandera de error artificial en el producto.

No hay pruebas de navegador automatizadas configuradas en el proyecto. La revisión visual y la captura de evidencia de DevTools deben realizarse en un navegador local.
