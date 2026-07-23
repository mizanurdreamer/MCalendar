import { UserRole } from "@/util/enums/UserRole";
import { UsersSection } from "@/components/sections/users-section";

export default function Page() {
  return <UsersSection role={UserRole.ROOM_ATTENDANT} availabilityBasePath="/admin/room-attendants" />;
}
