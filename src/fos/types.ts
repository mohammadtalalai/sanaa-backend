export type System = 'manager' | 'admin' | 'employee';
export type Order = {
  id: string;
  dbId: number;
  customer: string;
  customerId: number | null;
  phone: string;
  product: string;
  date: string;
  /** selling value before tax */
  total: number;
  status: string;
  paid: number;
  grandTotal: number;
  vatPct: number;
  invoiceLocked: boolean;
  taxId: string;
  design: Record<string, any> | null;
};
