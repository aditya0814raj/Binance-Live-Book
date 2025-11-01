"use client";

import { useMemo, memo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from './ui/skeleton';

interface OrderBookTableProps {
  data: Map<string, string>;
  type: 'bids' | 'asks';
  title: string;
  isLoading: boolean;
}

interface ProcessedEntry {
  price: string;
  amount: string;
  total: number;
  depth: number;
}

const OrderBookRow = memo(({ entry, type }: { entry: ProcessedEntry; type: 'bids' | 'asks' }) => {
  const priceColor = type === 'bids' ? 'text-bid' : 'text-ask';
  const depthBg = type === 'bids' ? 'bg-bid/20' : 'bg-ask/20';
  
  return (
    <TableRow className="relative font-mono text-sm">
      <TableCell className={`p-1.5 ${priceColor} z-10`}>{parseFloat(entry.price).toFixed(2)}</TableCell>
      <TableCell className="p-1.5 text-right z-10">{parseFloat(entry.amount).toFixed(4)}</TableCell>
      <TableCell className="p-1.5 text-right z-10">{entry.total.toFixed(4)}</TableCell>
      <td
        className={`absolute top-0 bottom-0 right-0 ${depthBg} z-0`}
        style={{ width: `${entry.depth}%` }}
      />
    </TableRow>
  );
});
OrderBookRow.displayName = 'OrderBookRow';


const OrderBookTable = ({ data, type, title, isLoading }: OrderBookTableProps) => {
  const processedData: ProcessedEntry[] = useMemo(() => {
    const entries = Array.from(data.entries());
    
    const sortedEntries = entries.sort(([priceA], [priceB]) => {
      return type === 'bids'
        ? parseFloat(priceB) - parseFloat(priceA)
        : parseFloat(priceA) - parseFloat(priceB);
    }).slice(0, 20); // Limit to top 20 for performance

    let cumulativeTotal = 0;
    const totals = sortedEntries.map(([, amount]) => {
      cumulativeTotal += parseFloat(amount);
      return cumulativeTotal;
    });

    const maxTotal = totals[totals.length - 1] || 0;

    return sortedEntries.map(([price, amount], index) => ({
      price,
      amount,
      total: totals[index],
      depth: maxTotal > 0 ? (totals[index] / maxTotal) * 100 : 0,
    }));
  }, [data, type]);

  const headers = type === 'bids'
    ? ['Price (USDT)', 'Amount (BTC)', 'Total (BTC)']
    : ['Price (USDT)', 'Amount (BTC)', 'Total (BTC)'];

  if (isLoading) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <div className="space-y-2">
            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      </div>
    );
  }


  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={`p-1.5 text-xs ${type === 'bids' ? 'text-left' : 'text-left'}`}>{headers[0]}</TableHead>
            <TableHead className="p-1.5 text-xs text-right">{headers[1]}</TableHead>
            <TableHead className="p-1.5 text-xs text-right">{headers[2]}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {processedData.map((entry) => (
            <OrderBookRow key={entry.price} entry={entry} type={type} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default OrderBookTable;
