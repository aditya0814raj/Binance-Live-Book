export interface Trade {
  E: number; // Event time
  T: number; // Trade time
  a: number; // Aggregate trade ID
  p: string; // Price
  q: string; // Quantity
  m: boolean; // Is the buyer the market maker?
}

export interface DepthUpdate {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  U: number; // First update ID in event
  u: number; // Final update ID in event
  b: [string, string][]; // Bids to be updated
  a: [string, string][]; // Asks to be updated
}

export type OrderBookEntry = [string, string]; // [price, quantity]
