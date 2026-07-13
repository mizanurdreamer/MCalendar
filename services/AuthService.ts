import type { User } from "@prisma/client";
import { userRepository } from "@/repositories/UserRepository";
import { refreshTokenRepository } from "@/repositories/RefreshTokenRepository";
import { hashPassword, verifyPassword, sha256 } from "@/lib/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ttlToSeconds,
  REFRESH_TTL,
} from "@/lib/jwt";
import { BadRequestError, ConflictError, UnauthorizedError } from "@/lib/errors";
import type { LoginDTO, RegisterDTO } from "@/dto/auth.dto";

export type PublicUser = Omit<User, "passwordHash">;

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

/** Simple, sortable-ish booking-agnostic id fragment for generated codes. */
function randomId(len = 16): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class AuthService {
  private async issueTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    const jti = randomId();
    const refreshToken = await signRefreshToken({ sub: user.id, jti });

    // Store only a hash of the refresh token so a DB leak can't reuse it.
    await refreshTokenRepository.create({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + ttlToSeconds(REFRESH_TTL) * 1000),
    });

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDTO): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const existing = await userRepository.findAnyByEmail(email);
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    const user = await userRepository.create({
      email,
      passwordHash: await hashPassword(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone || null,
      role: dto.role,
    });

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), ...tokens };
  }

  async login(dto: LoginDTO): Promise<AuthResult> {
    const user = await userRepository.findByEmail(dto.email);
    if (!user) throw new UnauthorizedError("Invalid email or password");
    if (!user.isActive) throw new UnauthorizedError("This account is disabled");

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Invalid email or password");

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), ...tokens };
  }

  /** Rotate a refresh token: verify, revoke the old, issue a new pair. */
  async refresh(rawRefreshToken?: string): Promise<AuthResult> {
    if (!rawRefreshToken) throw new UnauthorizedError("Missing refresh token");

    let payload;
    try {
      payload = await verifyRefreshToken(rawRefreshToken);
    } catch {
      throw new UnauthorizedError("Invalid refresh token");
    }

    const stored = await refreshTokenRepository.findValidByHash(sha256(rawRefreshToken));
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedError("Refresh token is no longer valid");
    }

    const user = await userRepository.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedError("Account unavailable");

    // Rotate.
    await refreshTokenRepository.revoke(stored.id);
    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), ...tokens };
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;
    const stored = await refreshTokenRepository.findValidByHash(sha256(rawRefreshToken));
    if (stored) await refreshTokenRepository.revoke(stored.id);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await userRepository.findById(userId);
    if (!user) throw new BadRequestError("User not found");
    return toPublicUser(user);
  }
}

export const authService = new AuthService();
export { toPublicUser };
