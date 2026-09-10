export function mapAuthErrorMessage(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (value.includes("invalid login credentials") || value.includes("invalid credentials")) {
    return "Incorrect email or password.";
  }

  if (value.includes("email not confirmed")) {
    return "Please confirm your email before logging in.";
  }

  if (
    value.includes("user already registered") ||
    value.includes("already been registered") ||
    value.includes("already registered")
  ) {
    return "An account with this email already exists. Try logging in instead.";
  }

  if (value.includes("password") && (value.includes("weak") || value.includes("least"))) {
    return "Choose a stronger password (at least 8 characters).";
  }

  if (value.includes("rate limit") || value.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (value.includes("network") || value.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return "Something went wrong. Please try again.";
}

export function mapBusinessErrorMessage(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (value.includes("businesses_slug_unique") || value.includes("duplicate key")) {
    return "That business URL is already taken. Try a slightly different name.";
  }

  if (value.includes("businesses_slug_format") || value.includes("slug")) {
    return "Could not create a valid business URL from that name. Try another name.";
  }

  if (value.includes("authentication required") || value.includes("jwt")) {
    return "Your session expired. Please log in again.";
  }

  if (value.includes("network") || value.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return "Could not create your business. Please try again.";
}
