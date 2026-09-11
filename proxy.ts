import { NextResponse, type NextRequest } from "next/server";

import { getSafeAuthRedirect } from "@/lib/auth/redirect";
import { updateSession } from "@/lib/supabase/middleware";

const AUTH_ROUTES = new Set(["/login", "/signup"]);
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { user, supabase, supabaseResponse } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname) && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && AUTH_ROUTES.has(pathname)) {
    const nextParam = request.nextUrl.searchParams.get("next");
    const safeNext = getSafeAuthRedirect(nextParam);
    if (safeNext) {
      const inviteUrl = request.nextUrl.clone();
      inviteUrl.pathname = safeNext;
      inviteUrl.search = "";
      return NextResponse.redirect(inviteUrl);
    }

    const { data: memberships, error } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", user.id)
      .limit(1);

    if (error) {
      console.error("proxy membership lookup failed", error.message);
    }

    const destination = memberships && memberships.length > 0 ? "/dashboard" : "/onboarding";
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = destination;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))) {
    const { data: memberships, error } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", user.id)
      .limit(1);

    if (error) {
      console.error("proxy dashboard membership lookup failed", error.message);
    }

    if (!memberships || memberships.length === 0) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = "/onboarding";
      onboardingUrl.search = "";
      return NextResponse.redirect(onboardingUrl);
    }
  }

  if (user && pathname === "/onboarding") {
    const { data: memberships, error } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", user.id)
      .limit(1);

    if (error) {
      console.error("proxy onboarding membership lookup failed", error.message);
    }

    if (memberships && memberships.length > 0) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/dashboard";
      dashboardUrl.search = "";
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
