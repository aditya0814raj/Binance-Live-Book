"use client";

import { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import type { Trade, DepthUpdate } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface OrderBookState {
  bids: Map<string, string>;
  asks: Map<string, string>;
}

type OrderBookAction =
  | { type: 'INIT'; payload: { bids: [string, string][]; asks: [string, string][] } }
  | { type: 'UPDATE'; payload: { bids: [string, string][]; asks: [string, string][] } }
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
  const eventQueue = useRef<any[]>([]);
  const isFetchingSnapshot = useRef(false);
  
  // Throttled states for UI
  const [throttledBids, setThrottledBids] = useState(new Map<string, string>());
  const [throttledAsks, setThrottledAsks] = useState(new Map<string, string>());
  
  const lastUpdate = useRef(0);

  const connect = useCallback(async (currentSymbol: string) => {
    // 1. Reset state and close any existing connection
    if (ws.current) {
      ws.current.close();
    }
    
    setStatus('connecting');
    dispatch({ type: 'RESET' });
    setTrades([]);
    eventQueue.current = [];
    lastUpdateId.current = null;
    isFetchingSnapshot.current = true;

    // 4. Establish WebSocket connection
    const lowerCaseSymbol = currentSymbol.toLowerCase();
    const streams = [`${lowerCaseSymbol}@depth`, `${lowerCaseSymbol}@aggTrade`];
    const newWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`);
    ws.current = newWs;
    
    newWs.onopen = () => {
      // Don't set to connected yet, wait for snapshot
    };
    
    newWs.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (isFetchingSnapshot.current) {
            eventQueue.current.push(message);
        } else {
            processMessage(message);
        }
    };

    newWs.onclose = () => {
      if (ws.current === newWs) { // Only update status if it's the current socket
        setStatus('disconnected');
      }
    };

    newWs.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (ws.current === newWs) { // Only update status if it's the current socket
        setStatus('error');
      }
    };


    try {
      // 2. Fetch the initial depth snapshot
      const response = await fetch(`/api/depth?symbol=${currentSymbol.toUpperCase()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to fetch snapshot: ${errorData.msg || response.statusText}`);
      }
      const snapshot = await response.json();

      // If symbol changed while fetching, abort
      if (symbol !== currentSymbol) {
        return;
      }
      
      // 3. Initialize order book from snapshot
      lastUpdateId.current = snapshot.lastUpdateId;
      dispatch({ type: 'INIT', payload: { bids: snapshot.bids, asks: snapshot.asks } });
      isFetchingSnapshot.current = false;
      setStatus('connected');

      // Process any events that were buffered before snapshot was ready and applied
      const queue = eventQueue.current;
      eventQueue.current = [];
      
      queue.forEach(processMessage);


    } catch (error) {
      console.error('Connection process error:', error);
      setStatus('error');
      toast({
        variant: "destructive",
        title: "API Error",
        description: `Failed to connect to ${currentSymbol}. Please try again.`,
      });
      if (ws.current) ws.current.close();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, toast]);

  const processMessage = useCallback((message: any) => {
    if (message.stream.includes('@depth')) {
      const update : DepthUpdate = message.data;
      if (!lastUpdateId.current) return;

      if (update.u > lastUpdateId.current) {
         if (update.U <= lastUpdateId.current + 1) {
          dispatch({ type: 'UPDATE', payload: { bids: update.b, asks: update.a } });
          lastUpdateId.current = update.u;
         } else {
           console.log("Order book out of sync, re-initializing...");
           if (ws.current) ws.current.close(); // Triggers onclose -> reconnect
           connect(symbol);
         }
      }
    } else if (message.stream.includes('@aggTrade')) {
      const trade: Trade = message.data;
      setTrades((prev) => [trade, ...prev].slice(0, 50));
    }
  }, [connect, symbol]);

  useEffect(() => {
    if (symbol) {
        connect(symbol);
    }
    // Cleanup function
    return () => {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [symbol, connect]);

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
        }, THROTTLE_MS - (now - lastUpdate.current));
        return () => clearTimeout(timer);
    }
  }, [orderBook]);


  return { bids: throttledBids, asks: throttledAsks, trades, status };
};
