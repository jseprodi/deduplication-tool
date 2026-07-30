import { createDeliveryClient } from "@kontent-ai/delivery-sdk";
import { createManagementClient } from "@kontent-ai/management-sdk";

export type DeliveryClient = ReturnType<typeof createDeliveryClient>;
export type ManagementClient = ReturnType<typeof createManagementClient>;

export function makeDeliveryClient(environmentId: string): DeliveryClient {
  return createDeliveryClient({ environmentId });
}

export function makeManagementClient(environmentId: string, apiKey: string): ManagementClient {
  return createManagementClient({ environmentId, apiKey });
}
