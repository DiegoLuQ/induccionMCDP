import Link from "next/link";
import {
  GraduationCap,
  Sparkles,
  BookOpen,
  Award,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Video,
  HelpCircle,
  BarChart3,
  Layers,
  School,
  FileCheck,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Barra de Navegación */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight block leading-tight text-foreground">
                Portal de Inducción
              </span>
              <span className="text-[11px] font-medium text-muted-foreground block leading-tight">
                y Capacitación Continua
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#que-es" className="hover:text-foreground transition-colors">
              ¿Qué es?
            </a>
            <a href="#pilares" className="hover:text-foreground transition-colors">
              Inducción vs Capacitación
            </a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">
              Cómo funciona
            </a>
            <a href="#beneficios" className="hover:text-foreground transition-colors">
              Beneficios
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link href="/auth/invitation">
                Tengo una invitación
              </Link>
            </Button>
            <Button asChild size="sm" className="shadow-xs">
              <Link href="/login">
                Acceder al Portal
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        {/* Glow de fondo decorativo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[600px] h-[350px] bg-primary/10 blur-[130px] rounded-full pointer-events-none" />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold mb-6 shadow-xs animate-in fade-in slide-in-from-bottom-3 duration-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Formación y Acompañamiento Institucional</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.15]">
            Inducción y Capacitación para fortalecer a nuestra{" "}
            <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              Comunidad Educativa
            </span>
          </h1>

          <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">
            Un espacio digital diseñado para orientar a nuevos colaboradores en su llegada
            y potenciar el desarrollo profesional de docentes y asistentes mediante
            cápsulas breves, dinámicas y preguntas de comprensión.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Button asChild size="lg" className="w-full sm:w-auto h-12 px-7 text-base font-semibold shadow-md">
              <Link href="/auth/invitation">
                <Compass className="mr-2 h-5 w-5" />
                Ingresar con Invitación / PIN
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-12 px-7 text-base">
              <Link href="/login">
                Acceso Administradores y RRHH
              </Link>
            </Button>
          </div>

          {/* Estadísticas / Píldoras rápidas */}
          <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
            <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-xs text-center">
              <div className="font-bold text-lg text-primary">100% Digital</div>
              <div className="text-xs text-muted-foreground mt-0.5">A tu propio ritmo</div>
            </div>
            <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-xs text-center">
              <div className="font-bold text-lg text-primary">Micro-videos</div>
              <div className="text-xs text-muted-foreground mt-0.5">Cápsulas directas y claras</div>
            </div>
            <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-xs text-center">
              <div className="font-bold text-lg text-primary">Preguntas Clave</div>
              <div className="text-xs text-muted-foreground mt-0.5">Repaso al instante</div>
            </div>
            <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-xs text-center">
              <div className="font-bold text-lg text-primary">Certificado</div>
              <div className="text-xs text-muted-foreground mt-0.5">Registro de cumplimiento</div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: ¿Qué es y los 2 Pilares? */}
      <section id="pilares" className="py-16 sm:py-24 border-t border-border/50 bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="secondary" className="mb-3 px-3 py-1 font-semibold uppercase tracking-wider text-[11px]">
              Ejes Formativos
            </Badge>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
              Dos pilares para el crecimiento del equipo
            </h2>
            <p className="mt-3 text-muted-foreground text-sm sm:text-base">
              Nuestra plataforma estructura la formación en dos etapas fundamentales:
              la bienvenida al colegio y el aprendizaje continuo.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Pilar 1: Inducción */}
            <div className="relative rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 mb-5">
                  <School className="h-6 w-6" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-foreground">Inducción Institucional</h3>
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600">
                    Nuevos Ingresos
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Es el proceso de bienvenida y orientación para cada funcionario que se integra
                  al establecimiento escolar. Garantiza un aterrizaje cálido, claro y estructurado.
                </p>

                <div className="mt-6 space-y-3">
                  <div className="flex items-start gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span><strong>Cultura y Proyecto Educativo (PEI):</strong> Misión, valores y visión del colegio.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span><strong>Organigrama y Funcionamiento:</strong> Roles, áreas de apoyo y canales oficiales.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span><strong>Reglamentos y Seguridad:</strong> Normativa interna, prevención de riesgos y convivencia.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span><strong>Plataformas y Herramientas:</strong> Acceso a sistemas digitales y correo institucional.</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Duración típica: 15 a 45 minutos</span>
                <span className="text-primary font-semibold">100% Autogestionado</span>
              </div>
            </div>

            {/* Pilar 2: Capacitación */}
            <div className="relative rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 mb-5">
                  <Award className="h-6 w-6" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-foreground">Capacitación Continua</h3>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                    Desarrollo Permanente
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Cursos especializados y módulos de actualización periódica para docentes, asistentes
                  y equipos de gestión, fortaleciendo sus competencias técnico-pedagógicas y normativas.
                </p>

                <div className="mt-6 space-y-3">
                  <div className="flex items-start gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Actualización Normativa:</strong> Protocolos de la Superintendencia y leyes educativas.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Estrategias Pedagógicas y de Aula:</strong> Innovación metodológica y diseño de clases.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Convivencia y Bienestar:</strong> Mediación escolar, salud mental y primeros auxilios.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Módulos Temáticos:</strong> Cápsulas específicas según el rol desempeñado en el colegio.</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Módulos acumulativos</span>
                <span className="text-emerald-600 font-semibold">Evaluación de Impacto</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: ¿Cómo funciona la experiencia? */}
      <section id="como-funciona" className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="outline" className="mb-3 px-3 py-1 font-semibold uppercase tracking-wider text-[11px]">
              Metodología
            </Badge>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
              ¿Cómo se realiza el proceso?
            </h2>
            <p className="mt-3 text-muted-foreground text-sm sm:text-base">
              Una experiencia ágil y sin complicaciones, pensada para la comodidad del funcionario.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative rounded-xl border bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm mb-4">
                01
              </div>
              <h4 className="font-semibold text-base mb-1.5">Invitación y Acceso</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Recibes un enlace personalizado y un PIN seguro vía correo o WhatsApp para ingresar directamente sin crear contraseñas.
              </p>
            </div>

            <div className="relative rounded-xl border bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm mb-4">
                02
              </div>
              <h4 className="font-semibold text-base mb-1.5">Cápsulas en Video</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Visualizas videos breves y explicativos producidos especialmente por el colegio sobre cada temática importante.
              </p>
            </div>

            <div className="relative rounded-xl border bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm mb-4">
                03
              </div>
              <h4 className="font-semibold text-base mb-1.5">Preguntas de Repaso</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Al concluir cada video, respondes preguntas sencillas de opción múltiple o reflexión para afianzar lo aprendido.
              </p>
            </div>

            <div className="relative rounded-xl border bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm mb-4">
                04
              </div>
              <h4 className="font-semibold text-base mb-1.5">Registro y Certificación</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tu progreso queda automáticamente guardado y certificado como respaldo institucional y evidencia ante la dirección.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: Beneficios para la institución y el equipo */}
      <section id="beneficios" className="py-16 sm:py-24 border-t border-border/50 bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="secondary" className="mb-3 px-3 py-1 font-semibold uppercase tracking-wider text-[11px]">
              Ventajas
            </Badge>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
              Beneficios para toda la institución
            </h2>
            <p className="mt-3 text-muted-foreground text-sm sm:text-base">
              Menos burocracia y mayor claridad en el traspaso de información institucional.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-6">
              <Clock className="h-6 w-6 text-primary mb-3" />
              <h4 className="font-bold text-base mb-1.5">Flexibilidad de Horarios</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Los colaboradores pueden realizar su inducción o curso en el momento más conveniente, desde cualquier dispositivo.
              </p>
            </div>

            <div className="rounded-xl border bg-card p-6">
              <ShieldCheck className="h-6 w-6 text-primary mb-3" />
              <h4 className="font-bold text-base mb-1.5">Respaldo y Trazabilidad</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Registro auditable de fecha, RUT, contenido visto y resultados, cumpliendo con los estándares de Recursos Humanos.
              </p>
            </div>

            <div className="rounded-xl border bg-card p-6">
              <FileCheck className="h-6 w-6 text-primary mb-3" />
              <h4 className="font-bold text-base mb-1.5">Estandarización Total</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Garantiza que todos los miembros del colegio reciban exactamente los mismos lineamientos y protocolos institucionales.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground p-8 sm:p-12 text-center shadow-xl">
            <div className="relative z-10 max-w-2xl mx-auto">
              <GraduationCap className="h-12 w-12 mx-auto mb-4 text-primary-foreground/90" />
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                ¿Listo para comenzar tu proceso de formación?
              </h3>
              <p className="mt-3 text-sm sm:text-base text-primary-foreground/80 leading-relaxed">
                Si recibiste una invitación de tu colegio, ingresa tu PIN o enlace para acceder directamente a tus cápsulas y preguntas de repaso.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto h-12 px-7 font-bold">
                  <Link href="/auth/invitation">
                    Ingresar con Invitación
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-12 px-7 bg-primary-foreground/10 border-white/20 text-white hover:bg-primary-foreground/20">
                  <Link href="/login">
                    Portal de Gestión
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8 bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Plataforma de Inducción y Capacitación</span>
          </div>
          <p>© {new Date().getFullYear()} Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
