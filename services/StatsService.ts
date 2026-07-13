import { userRepository } from "@/repositories/UserRepository";
import type { ActorContext } from "@/models";

export type DashboardStat = { label: string; value: number };

export class StatsService {
  async superAdmin(): Promise<DashboardStat[]> {
    const [users, activeUsers] = await Promise.all([
      userRepository.count(),
      userRepository.count({ isActive: true }),
    ]);
    return [
      { label: "Users", value: users },
      { label: "Active users", value: activeUsers },
    ];
  }

  async client(_actor: ActorContext): Promise<DashboardStat[]> {
    return [];
  }

  async cleaner(_actor: ActorContext): Promise<DashboardStat[]> {
    return [];
  }
}

export const statsService = new StatsService();
