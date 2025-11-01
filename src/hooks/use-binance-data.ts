"use client";

import { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import type { Trade, DepthUpdate, OrderBookEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface OrderBookState {
  bids: Map<string, string>;
  asks: Map<string, string>;
}

type OrderBookAction =
  | { type: 'INIT'; payload: { bids: OrderBookEntry[]; asks: OrderBookEntry[] } }
  | { type: 'UPDATE'; payload: { bids: OrderBookEntry[]; asks: OrderBookEntry[] } }
  | { type: 'RESET' };

const orderBookReducer = (state: OrderBookState, action: OrderBookAction): OrderBookState => {
  switch (action.type) {
    case 'INIT':
      return {
        bids: new Map(action.payload.bids),
        asks: new Map(action.payload.asks),
      };
    case 'UPDATE': {
      const newBids = new Map(state.bids);
      const newAsks = new Map(state.asks);
      action.payload.bids.forEach(([price, quantity]) => {
        if (parseFloat(quantity) === 0) {
          newBids.delete(price);
        } else {
          newBids.set(price, quantity);
        }
      });
      action.payload.asks.forEach(([price, quantity]) => {
        if (parseFloat(quantity) === 0) {
          newAsks.delete(price);
        } else {
          newAsks.set(price, quantity);
        }
      });
      return { bids: newBids, asks: newAsks };
    }
    case 'RESET':
        return { bids: new Map(), asks: new Map() };
    default:
      return state;
  }
};

const THROTTLE_MS = 200; // Throttle UI updates

export const useBinanceData = (symbol: string) => {
  const [orderBook, dispatch] = useReducer(orderBookReducer, { bids: new Map(), asks: new Map() });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const { toast } = useToast();

  const ws = useRef<WebSocket | null>(null);
  const lastUpdateId = useRef<number | null>(null);
  const eventQueue = useRef<DepthUpdate[]>([]);
  const snapshotApplied = useRef(false);

  // Throttled states for UI
  const [throttledBids, setThrottledBids] = useState(new Map<string, string>());
  const [throttledAsks, setThrottledAsks] = useState(new Map<string, string>());
  
  const lastUpdate = useRef(0);

  const connect = useCallback(async () => {
    // Reset state for new connection
    setStatus('connecting');
    dispatch({ type: 'RESET' });
    setTrades([]);
    eventQueue.current = [];
    snapshotApplied.current = false;
    lastUpdateId.current = null;
    ws.current?.close();

    try {
      const response = await fetch(`/api/depth?symbol=${symbol.toUpperCase()}`);
      if (!response.ok) throw new Error('Failed to fetch snapshot');
      const snapshot = await response.json();

      lastUpdateId.current = snapshot.lastUpdateId;
      dispatch({ type: 'INIT', payload: { bids: snapshot.bids, asks: snapshot.asks } });
      snapshotApplied.current = true;

      // Process any buffered events
      const queue = eventQueue.current;
      eventQueue.current = [];
      queue.forEach(processDepthUpdate);
    } catch (error) {
      console.error('Snapshot fetch error:', error);
      setStatus('error');
      toast({
        variant: "destructive",
        title: "API Error",
        description: "Failed to fetch initial order book. Retrying...",
      });
      setTimeout(connect, 5000); // Retry after 5s
      return;
    }

    const lowerCaseSymbol = symbol.toLowerCase();
    const newWs = new WebSocket(`wss://stream.binance.com:9443/ws/${lowerCaseSymbol}@depth20@100ms/${lowerCaseSymbol}@aggTrade`);
    ws.current = newWs;
    
    newWs.onopen = () => setStatus('connected');
    
    newWs.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.stream.includes('@depth')) {
        const depthUpdate: DepthUpdate = message.data;
        if (snapshotApplied.current) {
          processDepthUpdate(depthUpdate);
        } else {
          eventQueue.current.push(depthUpdate);
        }
      } else if (message.stream.includes('@aggTrade')) {
        const trade: Trade = message.data;
        setTrades((prev) => [trade, ...prev].slice(0, 50));
      }
    };

    newWs.onclose = () => {
        if (status !== 'disconnected') {
            setStatus('disconnected');
        }
    };
    newWs.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('error');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, toast]);

  const processDepthUpdate = (update: DepthUpdate) => {
    if (update.u <= lastUpdateId.current!) return;

    if (update.U <= lastUpdateId.current! + 1 && update.u >= lastUpdateId.current! + 1) {
      dispatch({ type: 'UPDATE', payload: { bids: update.b, asks: update.a } });
      lastUpdateId.current = update.u;
    } else if (update.U > lastUpdateId.current! + 1) {
        console.log("Order book out of sync, re-initializing...");
        connect();
    }
  };

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
    };
  }, [connect]);

  // Throttling mechanism
  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdate.current > THROTTLE_MS) {
        setThrottledBids(new Map(orderBook.bids));
        setThrottledAsks(new Map(orderBook.asks));
        lastUpdate.current = now;
    } else {
        const timer = setTimeout(() => {
            setThrottledBids(new Map(orderBook.bids));
            setThrottledAsks(new Map(orderBook.asks));
            lastUpdate.current = Date.now();
        }, THROTTLE_MS);
        return () => clearTimeout(timer);
    }
  }, [orderBook]);


  return { bids: throttledBids, asks: throttledAsks, trades, status };
};
