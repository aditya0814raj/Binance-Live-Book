"use client";

import { useMemo } from 'react';
import OrderBookTable from './order-book-table';
import type { OrderBookEntry } from '@/lib/types';
import { Skeleton } from './ui/skeleton';

interface OrderBookProps {
  bids: Map<string, string>;
  asks: Map<string, string>;
}

const OrderBook = ({ bids, asks }: OrderBookProps) => {
  const { highestBid, lowestAsk, spread, spreadPercentage } = useMemo(() => {
    const sortedBids = Array.from(bids.keys()).sort((a, b) => parseFloat(b) - parseFloat(a));
    const sortedAsks = Array.from(asks.keys()).sort((a, b) => parseFloat(a) - parseFloat(b));

    const highestBid = sortedBids.length > 0 ? parseFloat(sortedBids[0]) : 0;
    const lowestAsk = sortedAsks.length > 0 ? parseFloat(sortedAsks[0]) : 0;

    if (highestBid > 0 && lowestAsk > 0) {
      const spread = lowestAsk - highestBid;
      const spreadPercentage = (spread / lowestAsk) * 100;
      return {
        highestBid,
        lowestAsk,
        spread: spread.toFixed(2),
        spreadPercentage: spreadPercentage.toFixed(4),
      };
    }

    return { highestBid: 0, lowestAsk: 0, spread: '0.00', spreadPercentage: '0.0000' };
  }, [bids, asks]);

  const isLoading = bids.size === 0 && asks.size === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OrderBookTable data={bids} type="bids" title="Bids" isLoading={isLoading} />
        <OrderBookTable data={asks} type="asks" title="Asks" isLoading={isLoading} />
      </div>
      <div className="flex justify-center items-center p-2 rounded-lg bg-card-alt">
        {isLoading ? <Skeleton className="h-6 w-48" /> :
        <div className="text-center">
            <span className="text-lg font-mono">
                Spread: {spread} ({spreadPercentage}%)
            </span>
        </div>
        }
      </div>
    </div>
  );
};

export default OrderBook;
