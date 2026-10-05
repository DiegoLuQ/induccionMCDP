import type { ProgressStatus, SubmissionStatus } from "@prisma/client";
import { PROGRESS_LABELS, SUBMISSION_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import type { InvitationState } from "@/server/queries/invitations";

export function ProgressBadge({ status }: { status: ProgressStatus }) {
  const variant =
    status === "COMPLETED"
      ? "success"
      : status === "IN_PROGRESS"
        ? "warning"
        : "secondary";
  return <Badge variant={variant}>{PROGRESS_LABELS[status]}</Badge>;
}

export function SubmissionBadge({ status }: { status: SubmissionStatus }) {
  const variant =
    status === "PASSED"
      ? "success"
      : status === "FAILED"
        ? "destructive"
        : "warning";
  return <Badge variant={variant}>{SUBMISSION_LABELS[status]}</Badge>;
}

const INVITATION_LABELS: Record<InvitationState, string> = {
  ACTIVE: "Vigente",
  USED: "Utilizada",
  EXPIRED: "Vencida",
  BLOCKED: "Bloqueada",
};

export function InvitationBadge({ state }: { state: InvitationState }) {
  const variant =
    state === "ACTIVE"
      ? "success"
      : state === "USED"
        ? "secondary"
        : state === "EXPIRED"
          ? "warning"
          : "destructive";
  return <Badge variant={variant}>{INVITATION_LABELS[state]}</Badge>;
}
