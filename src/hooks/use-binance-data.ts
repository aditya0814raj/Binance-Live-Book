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
  const eventQueue = useRef<DepthUpdate[]>([]);
  const isConnecting = useRef(false);

  // Throttled states for UI
  const [throttledBids, setThrottledBids] = useState(new Map<string, string>());
  const [throttledAsks, setThrottledAsks] = useState(new Map<string, string>());
  
  const lastUpdate = useRef(0);

  const connect = useCallback(async (currentSymbol: string) => {
    if (isConnecting.current) return;
    isConnecting.current = true;

    // 1. Reset state and close any existing connection
    setStatus('connecting');
    if (ws.current) {
      ws.current.onopen = null;
      ws.current.onmessage = null;
      ws.current.onerror = null;
      ws.current.onclose = null;
      ws.current.close();
      ws.current = null;
    }
    dispatch({ type: 'RESET' });
    setTrades([]);
    eventQueue.current = [];
    lastUpdateId.current = null;

    try {
      // 2. Fetch the initial depth snapshot
      const response = await fetch(`/api/depth?symbol=${currentSymbol.toUpperCase()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to fetch snapshot: ${errorData.msg || response.statusText}`);
      }
      const snapshot = await response.json();

      // If symbol changed while fetching, abort this connection attempt
      if (symbol !== currentSymbol) {
        isConnecting.current = false;
        return;
      }
      
      // 3. Initialize order book from snapshot
      lastUpdateId.current = snapshot.lastUpdateId;
      dispatch({ type: 'INIT', payload: { bids: snapshot.bids, asks: snapshot.asks } });

      // 4. Establish WebSocket connection
      const lowerCaseSymbol = currentSymbol.toLowerCase();
      const streams = [`${lowerCaseSymbol}@depth@100ms`, `${lowerCaseSymbol}@aggTrade`];
      const newWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`);
      ws.current = newWs;

      newWs.onopen = () => {
        if (ws.current === newWs) {
          setStatus('connected');
          isConnecting.current = false;
          // Process any events that were buffered before snapshot was ready and applied
          const queue = eventQueue.current;
          eventQueue.current = [];
          queue.forEach(handleMessageData);
        }
      };
      
      const handleMessageData = (data: any) => {
        if (data.stream.includes('@depth')) {
          const update: DepthUpdate = data.data;
          // Apply updates only if they are for the current order book
          if (lastUpdateId.current && update.u > lastUpdateId.current) {
            if (update.U <= lastUpdateId.current + 1) {
              dispatch({ type: 'UPDATE', payload: { bids: update.b, asks: update.a } });
              lastUpdateId.current = update.u;
            } else {
              // Out of sync, reconnect
              console.log("Order book out of sync, re-initializing...");
              if (ws.current) ws.current.close(); // Triggers onclose -> reconnect
            }
          }
        } else if (data.stream.includes('@aggTrade')) {
          const trade: Trade = data.data;
          setTrades((prev) => [trade, ...prev].slice(0, 50));
        }
      };

      newWs.onmessage = (event) => {
        const message = JSON.parse(event.data);
        // If snapshot is not processed, buffer events
        if (lastUpdateId.current) {
          handleMessageData(message);
        } else {
          eventQueue.current.push(message);
        }
      };
  
      newWs.onclose = () => {
          if (ws.current === newWs || !ws.current) {
              setStatus('disconnected');
              isConnecting.current = false;
              // Optional: implement retry logic here if desired
          }
      };

      newWs.onerror = (error) => {
        if (ws.current === newWs) {
            console.error('WebSocket error:', error);
            setStatus('error');
            isConnecting.current = false;
        }
      };

    } catch (error) {
      console.error('Connection process error:', error);
      setStatus('error');
      isConnecting.current = false;
      toast({
        variant: "destructive",
        title: "API Error",
        description: `Failed to connect to ${currentSymbol}. Please try again.`,
      });
    }
  }, [symbol, toast]);

  useEffect(() => {
    if (symbol) {
        connect(symbol);
    }
    // Cleanup function
    return () => {
      isConnecting.current = false;
      if (ws.current) {
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onerror = null;
        ws.current.onclose = null;
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
