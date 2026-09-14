# Star5Tracker — verificación de interfaz

Fecha: 2026-09-11.

## Alcance

Aplicación funcional con marca propia según el plan aprobado. La referencia pública de Toggl fue abierta y capturada; es una página comercial, no una pantalla autenticada comparable. No se afirma equivalencia visual exacta con las pantallas privadas de Toggl.

La verificación funcional y responsive de la interfaz local está aprobada. La comparación visual exacta con el producto privado de referencia no forma parte de esta implementación y no se ha realizado.

## Evidencia visual e interactiva

- Navegador integrado: escritorio aproximadamente 1265×712 y viewport móvil 390×844 (375 px de contenido después del scrollbar).
- Capturas observadas de Tiempo e Informes en móvil: contenido sin desbordamiento horizontal de página. Medición DOM: `clientWidth=375`, `scrollWidth=375`. Navegación cerrada con atributo `inert`.
- Escritorio: encabezado, cronómetro, métricas, agrupación diaria y navegación; se aumentaron el tamaño y contraste de etiquetas tras la primera captura.
- Cronómetro: inicio, recarga con cronómetro activo y parada; duración persistida.
- Registro manual: creación y presencia en los informes y totales.
- Clientes: creación, edición, archivo y restauración comprobados.
- Proyectos: creación con cliente, color y estimación; creación de una tarea con estimación dentro del proyecto.
- Aprobaciones: aprobación, reapertura con motivo y cambio visible de estado.
- PDF de prueba con 60 filas: creación multipágina y renderizado con Poppler; primera página y continuación inspeccionadas, sin cortes de columnas ni texto solapado.
- Exportaciones reales desde Informes: archivos CSV y PDF descargados. CSV filtrado por Rediseño de marca: 4 filas, USD 177.00, coincidente con la pantalla. Sin errores de consola durante la comprobación.

## Correcciones aplicadas

- Contraste y tamaños de texto secundario aumentados.
- Modal nativo, foco visible, cajón móvil inerte y acciones etiquetadas.
- Métricas financieras conservadas también en móvil.
- Registros de varios días repartidos por día, incluida la vista de lista.
- Exportaciones cargadas bajo demanda para reducir el JavaScript inicial.
- Eliminado el complemento opcional fsevents; observación portable sin modificar protecciones de macOS.

## Pendiente de infraestructura

La autenticación, correo, sincronización entre dispositivos reales y pruebas con Supabase/Vercel alojados requieren completar la creación del proyecto y la configuración de las cuentas. Las políticas SQL se prueban localmente con PostgreSQL embebido, no con sesiones alojadas reales.

final result: blocked

El bloqueo corresponde a la entrega alojada pendiente de configurar; no impide inspeccionar y usar la demostración local. No se presenta la aplicación como desplegada ni como validada para producción.
