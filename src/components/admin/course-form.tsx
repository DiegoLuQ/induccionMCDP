"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VideoFormat } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Film,
  FolderKanban,
  Layers,
  Plus,
  Tag as TagIcon,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDuration } from "@/lib/utils";
import {
  createCourseSchema,
  type CreateCourseInput,
} from "@/lib/validations/course";
import {
  createCategoryAction,
  createCourseAction,
  updateCourseFullAction,
} from "@/server/actions/course-actions";
import {
  createCourseTypeAction,
  getInstitutionCatalogsAction,
} from "@/server/actions/catalog-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { VideoUploaderField } from "@/components/admin/video-uploader-field";

export interface InstitutionChoice {
  id: string;
  name: string;
}
export interface CategoryChoice {
  id: string;
  name: string;
  color: string | null;
}
export interface CatalogChoice {
  id: string;
  name: string;
  color?: string | null;
}

interface CourseFormProps {
  institutions: InstitutionChoice[];
  activeInstitutionId: string;
  categories: CategoryChoice[];
  existingTags: Array<{ id: string; name: string }>;
  /** Catálogos del colegio (administrables en /configuracion/catalogos). */
  courseTypes: CatalogChoice[];
  positions: CatalogChoice[];
  /** En modo edición se actualiza el curso indicado por `courseId`. */
  mode?: "create" | "edit";
  courseId?: string;
  initialValues?: CreateCourseInput;
}

const NO_CATEGORY = "__sin_categoria__";
const NO_TYPE = "__sin_tipo__";

const emptyLesson = (orderIndex: number, moduleTitle: string = "") => ({
  title: "",
  description: "",
  videoUrl: "",
  durationSeconds: 300,
  orderIndex,
  moduleTitle,
  moduleId: "",
  isActive: true,
});

const STEPS = [
  { id: 1, title: "Datos generales", desc: "Título y descripción" },
  { id: 2, title: "Clasificación", desc: "Categoría, tags y cargos" },
  { id: 3, title: "Contenido audiovisual", desc: "Videos y cápsulas" },
];

export function CourseForm({
  institutions,
  activeInstitutionId,
  categories,
  existingTags,
  courseTypes,
  positions,
  mode = "create",
  courseId,
  initialValues,
}: CourseFormProps) {
  const isEdit = mode === "edit";
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isPending, startTransition] = useTransition();
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [typeOptions, setTypeOptions] = useState(courseTypes);
  const [positionOptions, setPositionOptions] = useState(positions);
  const [newCategory, setNewCategory] = useState("");
  const [newType, setNewType] = useState("");
  const [tagDraft, setTagDraft] = useState("");

  const {
    control,
    register,
    handleSubmit,
    setValue,
    trigger,
    watch,
    formState: { errors },
  } = useForm<CreateCourseInput>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: initialValues ?? {
      institutionId: activeInstitutionId,
      title: "",
      description: "",
      typeId: "",
      videoFormat: VideoFormat.FORMATO_LARGO,
      categoryId: "",
      tags: [],
      isSequential: true,
      targetPositionIds: [],
      isPublished: false,
      lessons: [emptyLesson(0)],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lessons",
  });

  const institutionId = watch("institutionId");
  const videoFormat = watch("videoFormat");
  const categoryId = watch("categoryId");
  const typeId = watch("typeId");
  const tags = watch("tags");
  const targetPositionIds = watch("targetPositionIds");
  const isSequential = watch("isSequential");
  const isPublished = watch("isPublished");
  const lessons = watch("lessons");

  function handleInstitutionChange(newInstId: string) {
    setValue("institutionId", newInstId);
    setValue("typeId", "");
    setValue("categoryId", "");
    setValue("targetPositionIds", []);
    startTransition(async () => {
      const res = await getInstitutionCatalogsAction(newInstId);
      if (res.success && res.data) {
        setTypeOptions(res.data.courseTypes);
        setCategoryOptions(res.data.categories);
        setPositionOptions(res.data.positions);
      }
    });
  }

  const totalSeconds = useMemo(
    () =>
      lessons.reduce(
        (sum, lesson) => sum + (Number(lesson.durationSeconds) || 0),
        0,
      ),
    [lessons],
  );

  const suggestions = existingTags
    .map((tag) => tag.name)
    .filter((name) => !tags.includes(name))
    .slice(0, 8);

  function switchFormat(value: VideoFormat) {
    setValue("videoFormat", value);
    if (value === VideoFormat.FORMATO_LARGO && fields.length > 1) {
      for (let i = fields.length - 1; i > 0; i -= 1) remove(i);
    }
    if (value === VideoFormat.MICRO_VIDEOS && fields.length === 1) {
      append(emptyLesson(1));
    }
  }

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (tags.includes(value)) {
      setTagDraft("");
      return;
    }
    setValue("tags", [...tags, value]);
    setTagDraft("");
  }

  function togglePosition(positionId: string) {
    setValue(
      "targetPositionIds",
      targetPositionIds.includes(positionId)
        ? targetPositionIds.filter((id) => id !== positionId)
        : [...targetPositionIds, positionId],
    );
  }

  async function handleNextStep() {
    if (currentStep === 1) {
      const isValid = await trigger(["institutionId", "title", "description", "typeId"]);
      if (!isValid) return;
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (currentStep === 2) {
      const isValid = await trigger(["categoryId", "tags", "targetPositionIds"]);
      if (!isValid) return;
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handlePrevStep() {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleCreateType() {
    const name = newType.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createCourseTypeAction({ institutionId, name });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      const created = result.data!;
      setTypeOptions((prev) => [...prev, created]);
      setValue("typeId", created.id);
      setNewType("");
      toast.success("Tipo creado.");
    });
  }

  function handleCreateCategory() {
    const name = newCategory.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createCategoryAction({ institutionId, name });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      const created = result.data!;
      setCategoryOptions((prev) =>
        [...prev, { ...created, color: null }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setValue("categoryId", created.id);
      setNewCategory("");
      toast.success("Categoría creada.");
    });
  }

  function onSubmit(values: CreateCourseInput) {
    startTransition(async () => {
      const result =
        isEdit && courseId
          ? await updateCourseFullAction({ ...values, id: courseId })
          : await createCourseAction(values);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message ?? "Curso guardado.");
      router.push(
        isEdit && courseId ? `/admin/cursos/${courseId}` : "/admin/cursos",
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {/* ---------------- Indicador de Fases / Pasos ---------------- */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-2 shadow-xs sm:gap-4 sm:p-3">
        {STEPS.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={async () => {
                if (step.id < currentStep) {
                  setCurrentStep(step.id);
                } else if (step.id === 2 && currentStep === 1) {
                  await handleNextStep();
                } else if (step.id === 3 && currentStep === 2) {
                  await handleNextStep();
                }
              }}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-left transition-all sm:flex-row sm:items-center sm:gap-3",
                isCurrent
                  ? "bg-primary/10 border border-primary/20 text-primary font-medium"
                  : isCompleted
                  ? "text-foreground hover:bg-muted"
                  : "text-muted-foreground opacity-60 cursor-not-allowed",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : step.id}
              </div>
              <div className="min-w-0">
                <span className="block truncate text-xs sm:text-sm font-medium">
                  {step.title}
                </span>
                <span className="hidden text-[11px] text-muted-foreground sm:block">
                  {step.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {/* ---------------- PASO 1: Datos generales ---------------- */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Paso 1: Datos generales</CardTitle>
                <CardDescription>
                  Identificación de la inducción o capacitación.
                </CardDescription>
              </div>
              <Badge variant="outline">Paso 1 de 3</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="institutionId">Colegio</Label>
                <Select
                  value={institutionId}
                  onValueChange={handleInstitutionChange}
                  disabled={isEdit || institutions.length === 1}
                >
                  <SelectTrigger id="institutionId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((institution) => (
                      <SelectItem key={institution.id} value={institution.id}>
                        {institution.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {isEdit
                    ? "El colegio no se puede cambiar: el avance y las invitaciones ya registradas pertenecen a este establecimiento."
                    : "El curso solo será visible para funcionarios de este colegio."}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="typeId">Tipo</Label>
                  <Link
                    href="/configuracion/catalogos"
                    className="text-xs text-muted-foreground underline"
                  >
                    Administrar tipos
                  </Link>
                </div>
                <Select
                  value={typeId || NO_TYPE}
                  onValueChange={(value) =>
                    setValue("typeId", value === NO_TYPE ? "" : value)
                  }
                >
                  <SelectTrigger id="typeId">
                    <SelectValue placeholder="Sin tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TYPE}>Sin tipo</SelectItem>
                    {typeOptions.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex gap-2 pt-1">
                  <Input
                    value={newType}
                    onChange={(event) => setNewType(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCreateType();
                      }
                    }}
                    placeholder="Crear tipo nuevo (ej. Protocolo)"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateType}
                    disabled={isPending || !newType.trim()}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Crear
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                placeholder="Inducción institucional 2026"
                {...register("title")}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                rows={4}
                placeholder="Qué cubre esta inducción, a quién está dirigida y qué se espera del funcionario al terminarla."
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button type="button" onClick={handleNextStep} className="gap-2">
                Siguiente: Clasificación
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------- PASO 2: Clasificación ---------------- */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Paso 2: Clasificación</CardTitle>
                <CardDescription>
                  Categoría, etiquetas y cargos a los que aplica.
                </CardDescription>
              </div>
              <Badge variant="outline">Paso 2 de 3</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="categoryId">Categoría</Label>
              <Select
                value={categoryId || NO_CATEGORY}
                onValueChange={(value) =>
                  setValue("categoryId", value === NO_CATEGORY ? "" : value)
                }
              >
                <SelectTrigger id="categoryId">
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2 pt-1">
                <Input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCreateCategory();
                    }
                  }}
                  placeholder="Crear categoría nueva (ej. Convivencia escolar)"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCreateCategory}
                  disabled={isPending || !newCategory.trim()}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Crear
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="tagDraft">Etiquetas</Label>
              <div className="flex gap-2">
                <Input
                  id="tagDraft"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTag(tagDraft);
                    }
                  }}
                  placeholder="Escribe y presiona Enter"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addTag(tagDraft)}
                  disabled={!tagDraft.trim()}
                >
                  <TagIcon className="h-4 w-4" aria-hidden />
                  Agregar
                </Button>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() =>
                          setValue(
                            "tags",
                            tags.filter((t) => t !== tag),
                          )
                        }
                        aria-label={`Quitar etiqueta ${tag}`}
                        className="rounded-full p-0.5 hover:bg-background/60"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Ya usadas:
                  </span>
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => addTag(name)}
                      className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                    >
                      + {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cargos a los que aplica</Label>
                <Link
                  href="/configuracion/catalogos"
                  className="text-xs text-muted-foreground underline"
                >
                  Administrar cargos
                </Link>
              </div>

              {positionOptions.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Este colegio aún no tiene cargos definidos.{" "}
                  <Link
                    href="/configuracion/catalogos"
                    className="font-medium underline"
                  >
                    Créalos aquí
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {positionOptions.map((position) => {
                    const active = targetPositionIds.includes(position.id);
                    return (
                      <button
                        key={position.id}
                        type="button"
                        onClick={() => togglePosition(position.id)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent",
                        )}
                      >
                        {position.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Si no marcas ninguno, el curso aplica a todos los cargos.
              </p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevStep}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button type="button" onClick={handleNextStep} className="gap-2">
                Siguiente: Contenido audiovisual
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------- PASO 3: Contenido audiovisual y Publicación ---------------- */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Paso 3: Contenido audiovisual</CardTitle>
                  <CardDescription>
                    Formato del material y duración de cada video o cápsula.
                  </CardDescription>
                </div>
                <Badge variant="outline">Paso 3 de 3</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormatOption
                  active={videoFormat === VideoFormat.FORMATO_LARGO}
                  onClick={() => switchFormat(VideoFormat.FORMATO_LARGO)}
                  title="Formato largo"
                  body="Un único video principal para toda la inducción."
                />
                <FormatOption
                  active={videoFormat === VideoFormat.MICRO_VIDEOS}
                  onClick={() => switchFormat(VideoFormat.MICRO_VIDEOS)}
                  title="Micro-videos"
                  body="Serie de cápsulas cortas agrupadas por tema o módulo."
                />
              </div>

              {videoFormat === VideoFormat.MICRO_VIDEOS && (
                <label className="flex items-start gap-3 rounded-md border p-3 bg-muted/20">
                  <input
                    type="checkbox"
                    checked={isSequential}
                    onChange={(event) =>
                      setValue("isSequential", event.target.checked)
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span className="text-sm">
                    <span className="block font-medium">Avance secuencial</span>
                    <span className="block text-muted-foreground">
                      El funcionario debe ver cada cápsula completa para desbloquear la siguiente.
                    </span>
                  </span>
                </label>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-base font-semibold">
                    {videoFormat === VideoFormat.FORMATO_LARGO
                      ? "Video"
                      : `Cápsulas (${fields.length})`}
                  </Label>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" aria-hidden />
                      Duración total: {formatDuration(totalSeconds)}
                    </span>
                    {videoFormat === VideoFormat.MICRO_VIDEOS && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => append(emptyLesson(fields.length))}
                        className="gap-1.5"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        Agregar cápsula
                      </Button>
                    )}
                  </div>
                </div>

                {fields.map((field, index) => (
                  <div key={field.id} className="space-y-3 rounded-md border p-4 bg-card shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Film className="h-4 w-4 text-primary" aria-hidden />
                        {videoFormat === VideoFormat.FORMATO_LARGO
                          ? "Video principal"
                          : `Cápsula ${index + 1}`}
                      </span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                            {...register(`lessons.${index}.isActive`)}
                          />
                          <span>Activa</span>
                        </label>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            aria-label={`Quitar video ${index + 1}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>

                    <input
                      type="hidden"
                      value={index}
                      {...register(`lessons.${index}.orderIndex`)}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`lesson-title-${index}`} className="text-xs">
                          Título del video
                        </Label>
                        <Input
                          id={`lesson-title-${index}`}
                          placeholder="Bienvenida y presentación"
                          {...register(`lessons.${index}.title`)}
                        />
                        {errors.lessons?.[index]?.title && (
                          <p className="text-xs text-destructive">
                            {errors.lessons[index]?.title?.message}
                          </p>
                        )}
                      </div>

                      <DurationField
                        index={index}
                        value={Number(lessons[index]?.durationSeconds) || 0}
                        onChange={(seconds) =>
                          setValue(`lessons.${index}.durationSeconds`, seconds)
                        }
                        error={errors.lessons?.[index]?.durationSeconds?.message}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Video (Subir archivo o Pegar enlace)</Label>
                      <VideoUploaderField
                        id={`lesson-video-${index}`}
                        value={String(lessons[index]?.videoUrl || "")}
                        onChange={(url) =>
                          setValue(`lessons.${index}.videoUrl`, url, {
                            shouldValidate: true,
                          })
                        }
                        onDurationDetected={(duration) => {
                          if (!lessons[index]?.durationSeconds || Number(lessons[index]?.durationSeconds) === 0) {
                            setValue(`lessons.${index}.durationSeconds`, duration, {
                              shouldValidate: true,
                            });
                          }
                        }}
                        error={errors.lessons?.[index]?.videoUrl?.message}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`lesson-desc-${index}`} className="text-xs">
                        Descripción (opcional)
                      </Label>
                      <Textarea
                        id={`lesson-desc-${index}`}
                        rows={2}
                        placeholder="Breve detalle sobre lo que se explica en este video."
                        {...register(`lessons.${index}.description`)}
                      />
                    </div>
                  </div>
                ))}

                {errors.lessons?.message && (
                  <p className="text-xs text-destructive">
                    {errors.lessons.message}
                  </p>
                )}
                {errors.lessons?.root?.message && (
                  <p className="text-xs text-destructive">
                    {errors.lessons.root.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ---------------- Publicación y Finalización ---------------- */}
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevStep}
                className="gap-2 order-2 sm:order-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Anterior
              </Button>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 order-1 sm:order-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(event) => setValue("isPublished", event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">
                    {isEdit ? "Publicado" : "Publicar de inmediato"}
                  </span>
                </label>

                <Button type="submit" isLoading={isPending} className="sm:w-auto">
                  {isEdit ? "Guardar cambios" : "Crear e iniciar inducción"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </form>
  );
}

function FormatOption({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border p-4 text-left transition-colors",
        active ? "border-primary bg-accent" : "hover:bg-accent",
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{body}</span>
    </button>
  );
}

/** Duración en minutos + segundos; persiste como segundos totales. */
function DurationField({
  index,
  value,
  onChange,
  error,
}: {
  index: number;
  value: number;
  onChange: (seconds: number) => void;
  error?: string;
}) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return (
    <div className="space-y-1">
      <Label htmlFor={`lesson-min-${index}`} className="text-xs">
        Duración del video
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`lesson-min-${index}`}
          type="number"
          min={0}
          max={240}
          value={minutes}
          onChange={(event) =>
            onChange(Math.max(0, Number(event.target.value)) * 60 + seconds)
          }
          className="w-20"
          aria-label="Minutos"
        />
        <span className="text-sm text-muted-foreground">min</span>
        <Input
          type="number"
          min={0}
          max={59}
          value={seconds}
          onChange={(event) =>
            onChange(
              minutes * 60 + Math.min(59, Math.max(0, Number(event.target.value))),
            )
          }
          className="w-20"
          aria-label="Segundos"
        />
        <span className="text-sm text-muted-foreground">seg</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
