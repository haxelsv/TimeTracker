# Star5Tracker

Aplicación de seguimiento de tiempo para equipos, en español. React + TypeScript + Vite, Supabase Auth/PostgreSQL y configuración de despliegue para Vercel.

```sh
npm ci
npm run dev
npm test
npm run build
```

- Demostración: `http://localhost:5173/demo/time`. Datos editables locales y separados de producción.
- Equipo real: copiar `.env.example` a `.env.local`, configurar la URL y clave publicable de Supabase, aplicar la migración e inicializar al administrador. Ver [guía de despliegue](docs/DEPLOYMENT.md).
- Las pruebas de base de datos ejecutan la migración real en PostgreSQL embebido (PGlite), con roles anon/authenticated y funciones Auth simuladas. Cubren RLS, permisos, idempotencia, tarifas, aprobaciones y revocación.

## Funciones

Registros manuales y vista semanal; clientes, proyectos, tareas y etiquetas; tarifas históricas; informes filtrados y exportación CSV/PDF; revisión semanal y auditoría; invitaciones por enlace, correo/contraseña y recuperación de acceso.

La demostración es personal y local. La sincronización de varios usuarios, correo y autenticación real requieren el proyecto Supabase configurado. La publicación requiere acceso a Vercel.

## Organización

- `src/App.tsx`: pantallas, navegación y formularios.
- `src/lib`: API, demostración, cálculo temporal y exportaciones.
- `supabase/migrations`: modelo, políticas RLS y comandos transaccionales.
- `tests`: pruebas de dominio, exportación y PostgreSQL.
- `docs`: despliegue, operación y verificación.

No hay claves secretas, contraseñas por defecto ni datos personales del equipo en el repositorio.

## macOS y carpetas sincronizadas

`fsevents` es una dependencia opcional de las herramientas de desarrollo. Para evitar bloqueos de su binario nativo en carpetas sincronizadas, el script `postinstall` elimina únicamente ese paquete opcional del `node_modules` local. Vite usa observación portable por sondeo. No se modifican Gatekeeper, atributos de cuarentena ni preferencias de seguridad del sistema.
