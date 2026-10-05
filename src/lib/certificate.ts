/**
 * Contenido de la Constancia de Participación compartido entre la vista del
 * administrador (modal, en el navegador) y el PDF generado en el servidor.
 */

export interface CertificateTopic {
  id: string;
  topic: string;
  inCharge: string;
}

export const DEFAULT_CERTIFICATE_TOPICS: CertificateTopic[] = [
  {
    id: "1",
    topic:
      "Bienvenida, organigrama general del colegio, proyecto educativo, misión y visión del Establecimiento Educacional.",
    inCharge: "Director",
  },
  {
    id: "2",
    topic:
      "Normativa interna, composición del Reglamento Interno de Orden, Higiene y Seguridad. Ley N° 21.643, conductas de acoso sexual, laboral y violencia en el trabajo y sus sanciones. Reglamento Interno y Manual de Convivencia Escolar y Reglamento de Evaluación y Promoción Escolar. Ley N°20.845 de Inclusión Escolar. Ley TEA N ° 21.545 y Circular N° 586.",
    inCharge: "Abogada",
  },
  {
    id: "3",
    topic:
      "Se informa de los riesgos laborales, equipo DEA y respuesta ante emergencias (disponibilidad de extintores, redes húmedas y vías de evacuación), definiciones de peligro y riesgo, tránsito por áreas de trabajo, uso de equipos eléctricos, uso vasos o tazas con líquidos calientes, caídas de mismo nivel, electrocución, quemaduras y medidas preventivas y los riesgos más frecuentes de Informar de Riesgos Laborales de acuerdo al artículo 15 del Decreto N° 44. Comité Paritario de Higiene y Seguridad, campañas porrazos y buenos tratos. Ley N°16.744: contingencias cubiertas, tipo de prestaciones, organismo administrador. Responsabilidad del empleador, artículo 15 del Decreto N° 44 y artículo 184 del Código del Trabajo. Responsabilidad del trabajador, artículo 56 del Decreto N° 44.",
    inCharge: "Ingeniero en Prevención de Riesgos",
  },
  {
    id: "4",
    topic:
      "Localización de las áreas, cuidado de las dependencias y normas de funcionamiento.",
    inCharge: "Inspectora General",
  },
  {
    id: "5",
    topic:
      "Sistema de contratación, horarios de trabajo (ingreso, colación y salida), salidas durante la jornada de trabajo, atrasos, inasistencias, permisos, vacaciones, licencias médicas y firma electrónica.",
    inCharge: "RRHH",
  },
  {
    id: "6",
    topic: "Perfil integral del funcionario.",
    inCharge: "Psicóloga Organizacional",
  },
  {
    id: "7",
    topic:
      "Política de uso de sistemas informáticos, seguridad de la información, control de accesos, correo electrónico, almacenamiento digital, protección de equipos y reporte de incidentes.",
    inCharge: "Área Tics",
  },
];

export const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
