export type PIIType =
  | "email"
  | "ssn"
  | "phone"
  | "credit_card"
  | "ip_address"
  | "api_key"
  | "street_address";

export interface ScrubResult {
  scrubbed: string;
  items_removed: number;
  types_found: PIIType[];
}
