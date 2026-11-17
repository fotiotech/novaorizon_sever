export interface MonetbilPaymentRequest {
  serviceKey: string;
  amount: number;
  phone: string;
  itemRef: string;
  user: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  locale?: string;
  operator?: string;
  returnUrl: string;
  notifyUrl: string;
  logo?: string;
}
