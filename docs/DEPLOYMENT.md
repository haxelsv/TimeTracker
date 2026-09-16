# Desplegar Star5Tracker

La aplicación usa React/Vite, Supabase (Auth + PostgreSQL) y Vercel. `/demo/time` usa exclusivamente datos locales y nunca envía datos a Supabase. Las rutas sin `/demo` requieren autenticación y membresía activa. No hay registro público que conceda acceso a un equipo.

## 1. Crear y configurar Supabase

1. Crear un proyecto en tu organización, sin seleccionar un plan de pago automáticamente.
2. Ejecutar las migraciones `supabase/migrations/001_timetracker.sql`, `002_project_assignments.sql`, `003_client_logos.sql`, `004_email_invitations.sql` y `005_invitation_history.sql` en el SQL Editor del proyecto. En proyectos administrados por CLI, ejecutar `supabase db push` tras enlazar el proyecto.
3. Ejecutar una vez `supabase/storage-client-logos.sql` para crear el bucket público `client-logos` y sus políticas de escritura reservadas a administradores. Las imágenes se sirven públicamente mediante URL, pero solo los administradores autenticados pueden subir, reemplazar o eliminar archivos.
4. Mantener activada la confirmación de correo de Supabase Auth. Configurar SMTP propio para correo de confirmación y recuperación en producción; el correo de prueba de Supabase tiene restricciones.
5. Ejecutar `supabase/bootstrap-owner.sql`, sustituyendo el correo de ejemplo por el correo real del propietario. Esto crea un equipo vacío y una invitación de administrador de 7 días. No crea ninguna contraseña.
5. Tras publicar el frontend, abrir `/invite?token=TOKEN` con el token devuelto. El propietario crea personalmente su cuenta y contraseña, confirma su correo y acepta la invitación. No compartir el token con otros destinatarios.

No se crean usuarios, contraseñas o equipos predeterminados en producción. Configura la tarifa real antes de empezar a registrar horas.

## 2. Configurar y desplegar Vercel

1. Importar este repositorio en Vercel, o ejecutar `npx vercel` desde la carpeta del proyecto con una sesión autorizada.
2. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con la URL y clave publicable/anon de Supabase. **Nunca usar una clave service_role en variables VITE.**
3. Para enviar invitaciones desde Equipo, configurar también como variables privadas de Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `INVITATION_FROM_EMAIL` y `PUBLIC_APP_URL`. La clave service role solo se usa en `/api/invitations` y nunca se expone al navegador.
4. Framework Vite; build `npm run build`; salida `dist`. `vercel.json` incluye las rutas SPA y cabeceras básicas.
5. Desplegar con `npx vercel --prod` después de pasar las pruebas. No requiere añadir un dominio de pago.
6. Añadir la URL final como Site URL en Supabase Auth y autorizar las URLs de retorno `/invite` (incluido el parámetro token) y `/reset-password`. Para preview, autorizar únicamente las URLs de preview que se usen; no añadir comodines globales.

## 3. Activar el equipo

1. El propietario inicia sesión y configura nombre y tarifas.
2. Desde Equipo → Invitar persona, el administrador escribe el correo y la app envía automáticamente la invitación. El enlace manual queda disponible como respaldo y caduca en 7 días.
3. La persona registra y confirma su correo, vuelve al enlace y acepta la invitación. Se necesita coincidencia con el correo verificado de la sesión; conocer el enlace no basta.
4. Asignar a cada miembro sus proyectos. Desde Ajustes puedes elegir si todos los miembros o solo los administradores pueden cambiar el estado de los proyectos. Los administradores ven todos los proyectos del equipo.

## Validación obligatoria del entorno alojado

- Dos navegadores con usuarios distintos: iniciar/detener el mismo temporizador entre dispositivos (sincronización por sondeo cada 10 segundos y al recuperar el foco).
- Invitación, confirmación de correo, recuperación de contraseña y enlace caducado.
- Miembro sin acceso a horas ajenas, tablas financieras, auditoría ni escrituras directas.
- Revocar acceso y comprobar tanto el navegador como una llamada directa con la sesión antigua.
- Enviar, aprobar, devolver y reabrir una semana. Los registros que cruzan semanas bloqueadas no se pueden cambiar.
- Exportar CSV/PDF y verificar importes con las tarifas reales.
- Confirmar que los datos de `/demo` nunca aparecen en el equipo real.
- Probar envío, reenvío y cancelación de invitaciones desde Equipo, incluyendo una cuenta que no sea administradora.

## Operación

- Las migraciones SQL son la fuente de verdad. No editar tablas manualmente para eludir las validaciones de la aplicación.
- Habilitar y comprobar la política de respaldos disponible en el plan elegido. Antes de cambios de esquema, hacer un respaldo y verificar restauración en un entorno aparte.
- Los registros se guardan en UTC; los períodos se interpretan en la zona del equipo. La zona queda fija tras el primer registro para no reinterpretar semanas aprobadas. Un cambio posterior requiere una migración explícita.
- Las tarifas siguen la prioridad persona+proyecto > proyecto > persona > equipo. Editar tiempo conserva la tarifa y moneda del registro; duplicarlo crea un registro nuevo con la tarifa vigente.
- Cambiar la moneda no convierte importes anteriores. Los informes separan los totales por moneda.
- RLS deniega escritura directa incluso al administrador. `app_command` usa transacciones, bloqueos por equipo/usuario e identificadores de solicitud para evitar duplicados.
- Sin conexión no se confirman escrituras. Se conserva el inicio del cronómetro ya recibido; el usuario reintenta al reconectar. No existe cola de escritura offline automática.
- Las tablas `requests` y `audit` conservan solicitudes e historial. Para equipos pequeños es intencional: una política de purga requiere fijar primero un período de idempotencia y retención.

## Estado del entorno de desarrollo

Se puede verificar el frontend y ejecutar las pruebas PostgreSQL con PGlite sin una cuenta externa. Eso no sustituye la validación de Auth, correo, red y políticas del proyecto Supabase alojado.
