import { statusLabel, type ProjectStatus } from "~/content/projects";

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className="os-status" data-status={status}>
      <span className="sr-only">Status: </span>
      {statusLabel[status]}
    </span>
  );
}
