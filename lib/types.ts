export type Role = "owner" | "attendant";

export interface Shop {
  id: string;
  name: string;
  ownerUid: string;
  timezone: string;
  telegramChatId?: string;
  createdAt: number;
}

export interface StaffMember {
  id: string;
  shopId: string;
  name: string;
  email: string;
  role: Role;
  pinHash: string;
  active: boolean;
  updatedAt: number;
}

export interface Product {
  id: string;
  shopId: string;
  barcode: string | null;
  name: string;
  price: number;
  cost_price: number | null;
  reorder_level: number;
  is_pinned: boolean;
  image_url?: string | null;
  supplier_id?: string | null;
  current_stock: number;
  status: "active" | "pending_review";
  created_by?: string | null;
  updatedAt: number;
}

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface OutboxSale {
  saleId: string;
  shopId: string;
  staffId: string;
  deviceId: string;
  lines: CartLine[];
  total: number;
  occurredAt: number;
  status: "held" | "pending" | "synced" | "failed";
  syncAfter: number;
  attempts: number;
  lastError?: string;
}

export interface SaleDoc {
  id: string;
  shop_id: string;
  staff_id: string;
  device_id: string;
  total: number;
  status: "completed" | "voided";
  occurred_at: number;
  received_at: unknown;
  voidReason?: string;
  voidBy?: string;
}

export interface LedgerEntry {
  product_id: string;
  change_amount: number;
  reason: "sale" | "void" | "restock" | "correction" | "count_adjust";
  reference_id: string;
  staff_id: string;
  occurred_at: number;
  received_at: unknown;
}
