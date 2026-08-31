import { notFound } from "next/navigation";

import { RequestDetail } from "../../components/request-detail";
import { requireTimeOffContext } from "@/time-off/access";
import { TimeOffError } from "@/time-off/config";
import { getLeaveRequestDetail } from "@/time-off/queries";

export const metadata = { title: "Review time off request | HR Pulse" };

export default async function TimeOffReviewRequestPage({ params }) {
  const { id } = await params;
  let context;
  let detail;
  try {
    context = await requireTimeOffContext({ review: true });
    detail = await getLeaveRequestDetail({ context, requestId: id });
  } catch (error) {
    if (error instanceof TimeOffError && error.code === "TIME_OFF_UNAVAILABLE") notFound();
    throw error;
  }
  return <RequestDetail context={context} detail={detail} reviewer />;
}
