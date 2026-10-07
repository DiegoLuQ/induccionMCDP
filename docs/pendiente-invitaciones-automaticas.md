# Pendiente: invitaciones automáticas para cursos obligatorios

**Estado:** en pausa (stand-by) por decisión de RRHH. Registrado el 2026-10-06.

## Situación actual

En **Configuración → Mi colegio** existen las *invitaciones automáticas*: un proceso diario
(`/api/cron/auto-invitations`, lógica en `src/server/services/auto-invitation-service.ts`) que, a la
hora configurada, envía invitaciones a los funcionarios activos que **aún no tienen** el curso
elegido y **no tienen una invitación vigente** para él.

Hoy la configuración (`AutoInvitationConfig`) permite elegir **un solo curso** por colegio.

## Idea a implementar más adelante

Que las invitaciones automáticas trabajen con **todos los cursos marcados como "Obligatorio"
y vigentes** del colegio, en vez de un único curso:

- Cada día, por cada curso obligatorio del período vigente, invitar a quienes no lo han completado
  en ese período y no tienen invitación vigente.
- Agrupar por área y enviar el correo consolidado a la jefatura (con el portal del área y la clave),
  igual que el envío manual.
- Respetar la fecha límite del curso si existe (no invitar después del cierre, o avisar).
- Mantener la opción de elegir cursos específicos si RRHH no quiere automatizar alguno.

## Dependencias

- Requiere el concepto de **curso obligatorio + período vigente** (implementado en la etapa
  "Cursos obligatorios y períodos").
- Revisar el campo `courseId` de `AutoInvitationConfig`: pasaría a ser opcional o reemplazarse por
  "todos los obligatorios vigentes".
