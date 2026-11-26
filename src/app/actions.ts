"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUserId, signIn, signOut } from "@/auth";
import { deleteComparison, setComparisonPublic } from "@/server/comparisons";

export async function signInAction() {
  await signIn("google");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

async function requireUser() {
  const userId = await currentUserId();
  if (!userId) throw new Error("Not signed in.");
  return userId;
}

export async function deleteComparisonAction(formData: FormData) {
  const userId = await requireUser();
  const id = String(formData.get("id") ?? "");
  await deleteComparison(userId, id);
  revalidatePath("/history");
  if (formData.get("redirectTo") === "/history") redirect("/history");
}

export async function setShareAction(formData: FormData) {
  const userId = await requireUser();
  const id = String(formData.get("id") ?? "");
  await setComparisonPublic(userId, id, formData.get("isPublic") === "true");
  revalidatePath(`/c/${id}`);
  revalidatePath("/history");
}
