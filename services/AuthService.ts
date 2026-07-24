import type { User } from "@/repositories/UserRepository";
import { userRepository } from "@/repositories/UserRepository";
import { refreshTokenRepository } from "@/repositories/RefreshTokenRepository";
import { hashPassword, verifyPassword, sha256 } from "@/util/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ttlToSeconds,
  REFRESH_TTL,
} from "@/util/jwt";
import { BadRequestError, ConflictError, UnauthorizedError } from "@/util/errors";
import { UserRole } from "@/util/enums/UserRole";
import type { LoginDTO, RegisterDTO } from "@/dto/auth.dto";

export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  smsGatewayId: string | null;
  smsGatewayName: string | null;
  phone: string | null;
  role: User["role"];
  isActive: boolean;
  companyName: string | null;
  primaryContact: string | null;
  portfolioSize: number | null;
  timezone: string | null;
  serviceArea: string | null;
  hourlyRate: number | null;
  rating: number | null;
  clientId: string | null;
  clientName: string | null;
  clientProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
};

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

export type RoomAttendantLoginOption = {
  userId: string;
  clientId: string | null;
  clientName: string | null;
  firstName: string;
  lastName: string;
};

function toPublicUser(user: User): PublicUser {
  const clientProfile = user.clientProfile;
  const roomAttendantProfile = user.roomAttendantProfile;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    smsGatewayId: user.smsGatewayId,
    smsGatewayName: user.smsGatewayName,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    companyName: clientProfile?.companyName ?? null,
    primaryContact: clientProfile?.primaryContact ?? null,
    portfolioSize: clientProfile?.portfolioSize ?? null,
    timezone: clientProfile?.timezone ?? null,
    serviceArea: roomAttendantProfile?.serviceArea ?? null,
    hourlyRate: roomAttendantProfile?.hourlyRate ?? null,
    rating: roomAttendantProfile?.rating ? Number(roomAttendantProfile.rating) : null,
    clientId: roomAttendantProfile?.clientId ?? null,
    clientName: roomAttendantProfile?.clientName ?? null,
    clientProfileId: clientProfile?.id ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    createdBy: user.createdBy,
    updatedBy: user.updatedBy,
    deletedAt: user.deletedAt,
  };
}

/** Simple, sortable-ish booking-agnostic id fragment for generated codes. */
function randomId(len = 16): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class AuthService {
  private async issueTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
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
      clientProfile:
        dto.role === UserRole.CLIENT
          ? {
              companyName: null,
              portfolioSize: null,
              timezone: null,
            }
          : undefined,
      roomAttendantProfile:
        dto.role === UserRole.ROOM_ATTENDANT
          ? {
              serviceArea: null,
              hourlyRate: null,
              rating: null,
            }
          : undefined,
    });

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), ...tokens };
  }

  async login(dto: LoginDTO): Promise<AuthResult> {
    const candidates = await userRepository.findAllByEmail(dto.email);
    if (candidates.length === 0) throw new UnauthorizedError("Invalid email");

    const activeCandidates = candidates.filter((candidate) => candidate.isActive);
    if (activeCandidates.length === 0) {
      throw new UnauthorizedError("This account is disabled");
    }

    for (const candidate of activeCandidates) {
      const valid = await verifyPassword(dto.password, candidate.passwordHash);
      if (!valid) continue;
      const tokens = await this.issueTokens(candidate);
      return { user: toPublicUser(candidate), ...tokens };
    }

    throw new UnauthorizedError("Invalid password");
  }

  async listRoomAttendantLoginOptionsByEmail(email: string): Promise<RoomAttendantLoginOption[]> {
    const users = await userRepository.findAllByEmail(email.toLowerCase());
    return users
      .filter((user) => user.isActive && user.role === UserRole.ROOM_ATTENDANT)
      .map((user) => ({
        userId: user.id,
        clientId: user.roomAttendantProfile?.clientId ?? null,
        clientName: user.roomAttendantProfile?.clientName ?? null,
        firstName: user.firstName,
        lastName: user.lastName,
      }));
  }

  async switchRoomAttendantSession(currentUserId: string, targetUserId: string): Promise<AuthResult> {
    const current = await userRepository.findById(currentUserId);
    const target = await userRepository.findById(targetUserId);
    if (!current || !target) throw new UnauthorizedError("Account unavailable");
    if (!current.isActive || !target.isActive) throw new UnauthorizedError("Account unavailable");
    if (current.role !== UserRole.ROOM_ATTENDANT || target.role !== UserRole.ROOM_ATTENDANT) {
      throw new UnauthorizedError("Invalid account switch");
    }
    if (current.email.toLowerCase() !== target.email.toLowerCase()) {
      throw new UnauthorizedError("Invalid account switch");
    }

    const tokens = await this.issueTokens(target);
    return { user: toPublicUser(target), ...tokens };
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
