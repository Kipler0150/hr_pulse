import { redirect } from "next/navigation";
import { getAccessState } from "@/auth/access";

export default async function ProtectedLayout({ children }) {
  const state = await getAccessState();
  if (!state.user) redirect("/sign-in");
  if (!state.profile || state.profile.status !== "active") redirect("/pending-access");
  return children;
}