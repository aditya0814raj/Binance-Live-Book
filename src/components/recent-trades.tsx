"use client";

import { memo, useEffect, useState } from 'react';
import type { Trade } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

interface RecentTradesProps {
  trades: Trade[];
}

const TradeRow = memo(({ trade, isNew }: { trade: Trade; isNew: boolean }) => {
    const [flash, setFlash] = useState(false);
    const isBuy = !trade.m; // If not maker, it's a market buy

    useEffect(() => {
        if (isNew) {
            setFlash(true);
            const timer = setTimeout(() => setFlash(false), 500); // Animation duration
            return () => clearTimeout(timer);
        }
    }, [isNew]);
    
    return (
        <TableRow className={cn(
            'font-mono text-sm transition-colors duration-500',
            flash && isBuy && 'bg-bid/30',
            flash && !isBuy && 'bg-ask/30'
        )}>
            <TableCell className={`p-1.5 ${isBuy ? 'text-bid' : 'text-ask'}`}>
                {parseFloat(trade.p).toFixed(2)}
            </TableCell>
            <TableCell className="p-1.5 text-right">{parseFloat(trade.q).toFixed(4)}</TableCell>
            <TableCell className="p-1.5 text-right text-muted-foreground">
                {new Date(trade.T).toLocaleTimeString()}
            </TableCell>
        </TableRow>
    );
});
TradeRow.displayName = 'TradeRow';

const RecentTrades = ({ trades }: RecentTradesProps) => {
  const [previousTradeIds, setPreviousTradeIds] = useState(new Set<number>());

  useEffect(() => {
    if (trades.length > 0) {
      const newIds = new Set(trades.map(t => t.a));
      setPreviousTradeIds(newIds);
    }
  }, [trades]);

  if (trades.length === 0) {
      return (
          <div className="space-y-2">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
      );
  }

  return (
    <div className="h-[500px] overflow-y-auto">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="p-1.5 text-xs">Price (USDT)</TableHead>
                    <TableHead className="p-1.5 text-xs text-right">Amount (BTC)</TableHead>
                    <TableHead className="p-1.5 text-xs text-right">Time</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {trades.map((trade, index) => (
                    <TradeRow 
                        key={trade.a} 
                        trade={trade}
                        isNew={index === 0 && !previousTradeIds.has(trade.a)}
                    />
                ))}
            </TableBody>
        </Table>
    </div>
  );
};

export default RecentTrades;
