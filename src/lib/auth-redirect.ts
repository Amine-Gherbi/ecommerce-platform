// Auth.js server-side `signIn(..., { redirect: false })` returns the URL it
// would have redirected to. A failed Credentials callback comes back as the
// error page with `?error=CredentialsSignin`, not as a thrown error.
export function isAuthFailureUrl(value: string): boolean {
  if (value.length === 0) {
    return true;
  }

  try {
    return new URL(value, "http://localhost").searchParams.has("error");
  } catch {
    return true;
  }
}
