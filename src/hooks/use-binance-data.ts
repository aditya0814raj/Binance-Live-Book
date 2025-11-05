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

  const processMessage = useCallback((message: any) => {
    if (message.stream.includes('@depth')) {
      const update : DepthUpdate = message.data;
      
      // This is the initial check from the docs
      if (lastUpdateId.current === null) return;

      // Drop any event where u is <= lastUpdateId in the snapshot.
      if (update.u <= lastUpdateId.current) {
        return;
      }
      
      // The first processed event should have U <= lastUpdateId+1 AND u >= lastUpdateId+1.
      if (lastUpdateId.current !== null && update.U <= lastUpdateId.current + 1 && update.u >= lastUpdateId.current + 1) {
        dispatch({ type: 'UPDATE', payload: { bids: update.b, asks: update.a } });
        lastUpdateId.current = update.u;
      } else if (lastUpdateId.current !== null && update.U > lastUpdateId.current + 1) {
        // If we receive an event that doesn't line up, we are out of sync and need to reconnect.
        console.log("Order book out of sync, re-initializing...");
        // The connect function will be called by the useEffect dependency array change
        if (ws.current) ws.current.close();
      } else {
         dispatch({ type: 'UPDATE', payload: { bids: update.b, asks: update.a } });
         lastUpdateId.current = update.u;
      }
    } else if (message.stream.includes('@aggTrade')) {
      const trade: Trade = message.data;
      setTrades((prev) => [trade, ...prev].slice(0, 50));
    }
  }, []);

  const connect = useCallback(async (currentSymbol: string) => {
    if (ws.current) {
      ws.current.close();
    }
    
    setStatus('connecting');
    dispatch({ type: 'RESET' });
    setTrades([]);
    eventQueue.current = [];
    lastUpdateId.current = null;
    isFetchingSnapshot.current = true;

    try {
      const response = await fetch(`/api/depth?symbol=${currentSymbol.toUpperCase()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to fetch snapshot: ${errorData.msg || response.statusText}`);
      }
      const snapshot = await response.json();

      if (symbol !== currentSymbol) {
        return;
      }
      
      lastUpdateId.current = snapshot.lastUpdateId;
      dispatch({ type: 'INIT', payload: { bids: snapshot.bids, asks: snapshot.asks } });
      isFetchingSnapshot.current = false;
      setStatus('connected');

      const lowerCaseSymbol = currentSymbol.toLowerCase();
      const streams = [`${lowerCaseSymbol}@depth`, `${lowerCaseSymbol}@aggTrade`];
      const newWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`);
      ws.current = newWs;
      
      newWs.onopen = () => {
        // Process any events that were buffered before snapshot was ready and applied
        const queue = eventQueue.current;
        eventQueue.current = [];
        queue.forEach(processMessage);
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
        if (ws.current === newWs) { 
          setStatus('disconnected');
        }
      };

      newWs.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (ws.current === newWs) {
          setStatus('error');
        }
      };

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
  }, [symbol, toast, processMessage]);

  useEffect(() => {
    if (symbol) {
        connect(symbol);
    }
    return () => {
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.onerror = null;
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
