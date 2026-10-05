# Plataforma SaaS Multi-Tenant de Inducción y Capacitación

Aplicación Next.js (App Router) para que cada colegio gestione, estandarice y
audite la formación de sus funcionarios mediante video, evaluaciones
interactivas y accesos temporales por token + PIN.

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 15 (App Router, React Server Components, Server Actions) |
| Lenguaje | TypeScript estricto |
| ORM / BD | Prisma + MySQL 8 |
| UI | Tailwind CSS, Shadcn/UI (Radix), Lucide React |
| Validación | Zod (parseo en cliente y re-validación en cada Server Action) |
| Formularios | React Hook Form + `@hookform/resolvers/zod` |
| Sesión | JWT HS256 (`jose`) en cookie HTTP-only + flujo de invitación PIN |
| Correo | Nodemailer (fallback a consola sin SMTP) |

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completa DATABASE_URL y AUTH_SECRET
npm run db:push           # crea el esquema en MySQL
npm run db:seed           # datos de ejemplo (2 colegios, 2 cursos)
npm run dev
```

Credenciales del seed:

- `informatica@colegiomacaya.cl` / `Password123` → `SUPER_ADMIN` (acceso a 2 colegios)
- `rrhh@colegiomacaya.cl` / `Password123` → `ADMIN_RRHH`

Sin `SMTP_HOST` configurado, los correos de invitación se imprimen en la
consola del servidor junto al enlace `/auth/invitation?token=…`.

## Arquitectura

```
src/
├─ app/
│  ├─ (app)/                    # Vistas autenticadas (layout con Sidebar + Header)
│  │  ├─ dashboard/             # Inicio (vista admin o funcionario según rol)
│  │  ├─ mis-inducciones/       # Listado y reproductor [courseId]
│  │  ├─ admin/                 # Panel RRHH, cursos, invitaciones, funcionarios, revisiones
│  │  ├─ configuracion/         # Colegio activo; /colegios sólo SUPER_ADMIN
│  │  └─ perfil/                # Cuenta del usuario
│  ├─ auth/invitation/          # Canje de token + PIN
│  ├─ login/                    # Acceso con contraseña
│  └─ denegado/                 # 403 amigable
├─ components/
│  ├─ ui/                       # Primitivas Shadcn
│  ├─ layout/                   # Sidebar responsivo, Header, Selector de Colegio
│  ├─ player/                   # Reproductor + evaluación integrada
│  ├─ admin/                    # Invitaciones, publicación de cursos, revisión
│  └─ shared/                   # PageHeader, StatCard, Badges de estado
├─ lib/
│  ├─ auth/                     # jwt, session, password, tokens, rbac
│  ├─ validations/              # Esquemas Zod por dominio
│  ├─ mail/                     # Transporte y plantillas
│  ├─ rut.ts, utils.ts, constants.ts
├─ server/
│  ├─ actions/                  # Server Actions (auth, invitaciones, cursos, progreso, evaluaciones)
│  ├─ services/               # Lógica de negocio pura (invitaciones, corrección, progreso)
│  └─ queries/                  # Lecturas para RSC (memoizadas con `cache`)
└─ middleware.ts                # Guardas de ruta por rol en el edge
```

### Reglas de negocio implementadas

**Multi-tenancy.** Cada colegio tiene dominio propio; el usuario puede
pertenecer a varios mediante `InstitutionMembership` y alternar con el selector
global. El colegio activo viaja en el JWT y **toda** consulta y Server Action
filtra por `institutionId`.

**RBAC.** `SUPER_ADMIN`, `ADMIN_RRHH`, `FUNCIONARIO` + cargo. Se aplica en tres
capas: middleware (ruta), `requireRole()` (página) y verificación explícita en
cada Server Action (mutación).

**Invitación con PIN.**
1. RRHH selecciona la inducción e invita a 1..N funcionarios.
2. Se genera un token de 32 bytes (se persiste sólo su SHA-256) y un PIN de 6
   dígitos con `randomInt` (se persiste sólo su hash bcrypt).
3. Vigencia configurable entre 24 y 48 h, uso único y bloqueo a los 5 intentos
   fallidos de PIN.
4. Al canjear se abre sesión y el funcionario entra directo a su inducción.

**Reproductor y evaluaciones.** El avance se persiste cada 15 s y nunca
retrocede. En cursos secuenciales no se puede adelantar el video ni saltar a la
siguiente cápsula sin aprobar la anterior. Las preguntas de alternativa se
corrigen automáticamente; las abiertas dejan la entrega en `PENDING_REVIEW`
hasta que RRHH la corrija en `/admin/revisiones`.

**Evidencia.** `CourseProgress` sella `completedAt` una sola vez y guarda el
puntaje final; `EvaluationSubmission` conserva cada intento con sus respuestas.

## Decisiones de seguridad que se apartan del enunciado

- El campo `pinCode` del modelo original se implementó como **`pinHash`**: un
  PIN en claro en base de datos es una credencial reutilizable y anularía el
  beneficio de hashear el token.
- Se agregó `attempts` a `Invitation` para frenar la fuerza bruta sobre un
  espacio de sólo 10⁶ combinaciones.
- `Question.correctAnswer` nunca se serializa hacia el cliente: las consultas
  del reproductor lo excluyen explícitamente del `select`.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `prisma generate` + build de producción |
| `npm run typecheck` | Verificación de tipos |
| `npm run db:push` | Sincroniza el esquema sin migraciones |
| `npm run db:migrate` | Migración con historial |
| `npm run db:seed` | Datos de ejemplo |
