"use client";

import { useState } from 'react';
import OrderBook from '@/components/order-book';
import RecentTrades from '@/components/recent-trades';
import { useBinanceData } from '@/hooks/use-binance-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

const tradingPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];

export default function Home() {
  const [pair, setPair] = useState('BTCUSDT');
  const { bids, asks, trades, status } = useBinanceData(pair);

  const handlePairChange = (value: string) => {
    setPair(value);
  };

  return (
    <main className="min-h-screen bg-background text-foreground p-4 font-body">
      <header className="mb-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-8 h-8 text-accent"
          >
            <path
              fillRule="evenodd"
              d="M4.5 3.75a3 3 0 00-3 3v.75h21v-.75a3 3 0 00-3-3h-15zM1.5 9.75v7.5a3 3 0 003 3h15a3 3 0 003-3v-7.5H1.5z"
              clipRule="evenodd"
            />
          </svg>
          <h1 className="text-2xl font-bold font-headline">Binance Live Book</h1>
        </div>
        <div className="flex items-center gap-4">
          <Select onValueChange={handlePairChange} defaultValue={pair}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Pair" />
            </SelectTrigger>
            <SelectContent>
              {tradingPairs.map((p) => (
                <SelectItem key={p} value={p.replace('/', '')}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full ${
                status === 'connected'
                  ? 'bg-green-500'
                  : status === 'connecting'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-red-500'
              }`}
            ></span>
            <span className="text-sm capitalize text-muted-foreground">{status}</span>
          </div>
        </div>
      </header>

      {status === 'error' && (
        <Alert variant="destructive" className="mb-4">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>
            Could not connect to the Binance WebSocket API. Please check your network connection and try again.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Order Book</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderBook bids={bids} asks={asks} />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <RecentTrades trades={trades} />
            </CardContent>
          </Card>
        </div>
      </div>
      <footer className="text-center text-muted-foreground mt-8 text-sm">
        <p>Data streamed live from Binance. UI refreshes may be throttled for performance.</p>
      </footer>
    </main>
  );
}
