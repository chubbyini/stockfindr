import Dexie, { type Table } from "dexie";
import type { OutboxSale, Product, StaffMember } from "@/lib/types";

class TillDB extends Dexie {
  outbox!: Table<OutboxSale, string>;
  products!: Table<Product, string>;
  staff!: Table<StaffMember, string>;

  constructor() {
    super("tilltrail");
    this.version(1).stores({
      outbox: "saleId, shopId, status, syncAfter",
      products: "id, shopId, barcode, is_pinned, updatedAt",
      staff: "id, shopId",
    });
  }
}

export const tilldb = new TillDB();

export async function cacheCatalog(shopId: string, products: Product[], staff: StaffMember[]) {
  await tilldb.transaction("rw", tilldb.products, tilldb.staff, async () => {
    await tilldb.products.where("shopId").equals(shopId).delete();
    await tilldb.staff.where("shopId").equals(shopId).delete();
    if (products.length) await tilldb.products.bulkPut(products);
    if (staff.length) await tilldb.staff.bulkPut(staff);
  });
}
