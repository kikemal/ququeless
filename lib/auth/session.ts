import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireAuthUser(redirectTo = "/login"): Promise<User> {
  const user = await getAuthUser();
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}
