import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { challenge, equal, open, randomSecret, seal } from './auth.crypto';
import type { LoginAttempt, MockCode } from './auth-flow.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  // This provider is deliberately local-only and is not a real identity provider.
  private readonly consumedCodes = new Map<string, number>();
  private requireDemo() {
    if (process.env.NODE_ENV === 'production')
      throw new ForbiddenException('Mock OAuth is disabled in production');
  }

  createLogin(apiUrl: string, persona?: string) {
    this.requireDemo();
    const state = randomSecret();
    const verifier = randomSecret();
    const redirectUri = `${apiUrl}/auth/callback`;
    const authorizeUrl = new URL(`${apiUrl}/mock-provider/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: 'demo-app',
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge(verifier),
      code_challenge_method: 'S256',
      ...(persona ? { persona } : {}),
    }).toString();
    return {
      authorizeUrl: authorizeUrl.toString(),
      cookie: seal(
        {
          state,
          verifier,
          expiresAt: Date.now() + 5 * 60_000,
        } satisfies LoginAttempt,
        'login-attempt',
      ),
    };
  }

  async createMockCode(params: URLSearchParams, apiUrl: string) {
    this.requireDemo();
    const redirectUri = `${apiUrl}/auth/callback`;
    if (
      params.get('client_id') !== 'demo-app' ||
      params.get('response_type') !== 'code' ||
      params.get('code_challenge_method') !== 'S256' ||
      params.get('redirect_uri') !== redirectUri ||
      !params.get('state') ||
      !params.get('code_challenge')
    )
      return null;

    const requested = params.get('persona') || 'mock-manager-10';
    const user = await this.prisma.client.user.findUnique({
      where: { id: requested },
    });
    if (!user) return null;
    const code: MockCode = {
      subject: user.id,
      displayName: user.name,
      codeChallenge: params.get('code_challenge')!,
      redirectUri,
      expiresAt: Date.now() + 60_000,
    };
    return { code: seal(code, 'mock-code'), state: params.get('state')! };
  }

  exchangeMockCode(codeToken: string, verifier: string, redirectUri: string) {
    this.requireDemo();
    for (const [token, expires] of this.consumedCodes) {
      if (expires < Date.now()) this.consumedCodes.delete(token);
    }
    const code = open<MockCode>(codeToken, 'mock-code');
    if (
      !code ||
      this.consumedCodes.has(codeToken) ||
      code.expiresAt < Date.now() ||
      code.redirectUri !== redirectUri ||
      !equal(code.codeChallenge, challenge(verifier))
    )
      return null;
    this.consumedCodes.set(codeToken, code.expiresAt);
    return { subject: code.subject, displayName: code.displayName };
  }

  validateAttempt(attemptToken: string | undefined, state: string) {
    const attempt = open<LoginAttempt>(attemptToken, 'login-attempt');
    if (
      !attempt ||
      attempt.expiresAt < Date.now() ||
      !equal(attempt.state, state)
    )
      return null;
    return attempt;
  }
}
