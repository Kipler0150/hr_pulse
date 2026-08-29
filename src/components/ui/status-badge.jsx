import {
  CheckIcon,
  CircleDotDashedIcon,
  Clock3Icon,
  LockKeyholeIcon,
  OctagonXIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

const statusMap = {
  approved: { Icon: CheckIcon, label: "Approved", shape: "solid circle", variant: "success" },
  draft: { Icon: CircleDotDashedIcon, label: "Draft", shape: "outlined circle", variant: "outline" },
  completed: { Icon: CheckIcon, label: "Completed", shape: "solid circle", variant: "success" },
  finalized: { Icon: LockKeyholeIcon, label: "Finalized", shape: "locked solid circle", variant: "success" },
  generated: { Icon: LockKeyholeIcon, label: "Generated", shape: "locked solid circle", variant: "success" },
  open: { Icon: Clock3Icon, label: "Open", shape: "outlined clock", variant: "information" },
  queued: { Icon: Clock3Icon, label: "Queued", shape: "dotted circle", variant: "warning" },
  processing: { Icon: CircleDotDashedIcon, label: "Processing", shape: "outlined circle", variant: "information" },
  returned: { Icon: OctagonXIcon, label: "Returned", shape: "octagon", variant: "warning" },
  submitted: { Icon: Clock3Icon, label: "Submitted", shape: "dotted circle", variant: "information" },
  failed: { Icon: OctagonXIcon, label: "Failed", shape: "octagon", variant: "destructive" },
  pending: { Icon: Clock3Icon, label: "Pending", shape: "dotted circle", variant: "warning" },
  rejected: { Icon: OctagonXIcon, label: "Rejected", shape: "octagon", variant: "destructive" },
};

export function getStatusPresentation(status) {
  return statusMap[status] ?? {
    Icon: CircleDotDashedIcon,
    label: "Unknown",
    shape: "outlined circle",
    variant: "outline",
  };
}

export function StatusBadge({ Icon, label, shape, variant = "outline" }) {
  return (
    <Badge aria-label={`${label}, ${shape}`} variant={variant}>
      <Icon aria-hidden="true" data-icon="inline-start" />
      {label}
    </Badge>
  );
}
