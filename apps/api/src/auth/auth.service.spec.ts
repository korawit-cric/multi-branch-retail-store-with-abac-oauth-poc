import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { challenge, seal } from './auth.crypto';
import type { PrismaService } from '../prisma/prisma.service';

describe('Local OAuth provider', () => {
  const previousSecret = process.env.AUTH_COOKIE_SECRET;
  const previousMode = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.AUTH_COOKIE_SECRET = Buffer.alloc(32, 7).toString('base64url');
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_COOKIE_SECRET;
    else process.env.AUTH_COOKIE_SECRET = previousSecret;
    process.env.NODE_ENV = previousMode;
  });
  it('rejects a mismatched login state', () => {
    const service = new AuthService({} as PrismaService);
    const login = service.createLogin('http://localhost:3101');
    expect(service.validateAttempt(login.cookie, 'attacker-state')).toBeNull();
    expect(
      service.validateAttempt(
        login.cookie,
        new URL(login.authorizeUrl).searchParams.get('state')!,
      ),
    ).not.toBeNull();
  });
  it('requires the PKCE verifier and consumes each valid code once', () => {
    const service = new AuthService({} as PrismaService);
    const redirectUri = 'http://localhost:3101/auth/callback';
    const code = seal(
      {
        subject: 'mock-manager-10',
        displayName: 'Manager',
        codeChallenge: challenge('correct-verifier'),
        redirectUri,
        expiresAt: Date.now() + 60000,
      },
      'mock-code',
    );
    expect(service.exchangeMockCode(code, 'wrong', redirectUri)).toBeNull();
    expect(
      service.exchangeMockCode(code, 'correct-verifier', redirectUri)?.subject,
    ).toBe('mock-manager-10');
    expect(
      service.exchangeMockCode(code, 'correct-verifier', redirectUri),
    ).toBeNull();
  });
  it('cannot enable mock identity login in production', () => {
    process.env.NODE_ENV = 'production';
    const service = new AuthService({} as PrismaService);
    expect(() => service.createLogin('http://localhost:3101')).toThrow(
      ForbiddenException,
    );
  });
});
