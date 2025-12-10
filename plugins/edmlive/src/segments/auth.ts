import type { IAuthEndpoint } from "@spotube-app/plugin";

export default class AuthEndpoint implements IAuthEndpoint {
  async authenticate(): Promise<void> {
    // EDM Live doesn't require user authentication.
  }

  async logout(): Promise<void> {
    // No session to terminate.
  }

  async isAuthenticated(): Promise<boolean> {
    // Always accessible because the source is public.
    return true;
  }
}
