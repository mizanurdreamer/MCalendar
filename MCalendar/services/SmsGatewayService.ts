import { smsGatewayRepository } from "@/repositories/SmsGatewayRepository";
import { NotFoundError } from "@/util/errors";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";
import type { CreateSmsGatewayDTO, UpdateSmsGatewayDTO } from "@/dto/smsGateway.dto";

export type SmsGatewayView = {
  id: string;
  name: string;
  domain: string;
  isActive: boolean;
  createdAt: string;
};

function mapSmsGatewayView(item: {
  id: string;
  name: string;
  domain: string;
  isActive: boolean;
  createdAt: Date;
}): SmsGatewayView {
  return {
    id: item.id,
    name: item.name,
    domain: item.domain,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * SMS gateway management for super admin.
 */
export class SmsGatewayService {
  async list(params: PaginationDTO): Promise<Paginated<SmsGatewayView>> {
    const { items, total } = await smsGatewayRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      status: params.status,
    });

    return {
      items: items.map((item) => mapSmsGatewayView(item)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async getById(id: string): Promise<SmsGatewayView> {
    const item = await smsGatewayRepository.findById(id);
    if (!item) throw new NotFoundError("SMS gateway not found");
    return mapSmsGatewayView(item);
  }

  async create(dto: CreateSmsGatewayDTO, actor: ActorContext): Promise<SmsGatewayView> {
    const item = await smsGatewayRepository.create({
      name: dto.name,
      domain: dto.domain,
      isActive: dto.isActive,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });
    return mapSmsGatewayView(item);
  }

  async update(
    id: string,
    dto: UpdateSmsGatewayDTO,
    actor: ActorContext,
  ): Promise<SmsGatewayView> {
    const existing = await smsGatewayRepository.findById(id);
    if (!existing) throw new NotFoundError("SMS gateway not found");

    const item = await smsGatewayRepository.update(id, {
      name: dto.name,
      domain: dto.domain,
      isActive: dto.isActive,
      updatedBy: actor.userId,
    });
    return mapSmsGatewayView(item);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await smsGatewayRepository.findById(id);
    if (!existing) throw new NotFoundError("SMS gateway not found");
    await smsGatewayRepository.softDelete(id, actor.userId);
  }
}

export const smsGatewayService = new SmsGatewayService();
