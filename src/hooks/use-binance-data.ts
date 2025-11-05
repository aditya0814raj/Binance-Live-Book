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
      
      if (lastUpdateId.current === null) return;

      if (update.u <= lastUpdateId.current) {
        return;
      }
      
      if (update.U <= lastUpdateId.current + 1 && update.u >= lastUpdateId.current + 1) {
        dispatch({ type: 'UPDATE', payload: { bids: update.b, asks: update.a } });
        lastUpdateId.current = update.u;
      } else if (update.U > lastUpdateId.current + 1) {
        console.warn("Order book out of sync, re-initializing...");
        if (ws.current) {
            ws.current.close();
        }
      } else {
         dispatch({ type: 'UPDATE', payload: { bids: update.b, asks: update.a } });
         lastUpdateId.current = update.u;
      }
    } else if (message.stream.includes('@aggTrade')) {
      const trade: Trade = message.data;
      setTrades((prev) => [trade, ...prev].slice(0, 50));
    }
  }, []);

  useEffect(() => {
    if (!symbol) return;

    let isMounted = true;
    const currentSymbol = symbol;

    const connect = async () => {
      if (ws.current) {
        ws.current.close();
      }

      if (!isMounted) return;

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
          throw new Error(`Failed to fetch snapshot: ${errorData.details?.msg || response.statusText}`);
        }
        const snapshot = await response.json();

        if (!isMounted || currentSymbol !== symbol) return;
        
        lastUpdateId.current = snapshot.lastUpdateId;
        dispatch({ type: 'INIT', payload: { bids: snapshot.bids, asks: snapshot.asks } });
        
        // Process any events that were queued while snapshot was being fetched
        const eventsToProcess = eventQueue.current.filter(e => e.data.u > snapshot.lastUpdateId);
        eventsToProcess.forEach(processMessage);

        isFetchingSnapshot.current = false;
        eventQueue.current = [];

        const lowerCaseSymbol = currentSymbol.toLowerCase();
        const streams = [`${lowerCaseSymbol}@depth`, `${lowerCaseSymbol}@aggTrade`];
        const newWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`);
        ws.current = newWs;
        
        newWs.onopen = () => {
          if (ws.current === newWs) {
            setStatus('connected');
          }
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
            // Only set to disconnected if it's the current socket and not because of a new connection being initiated
            setStatus('disconnected');
          }
        };

        newWs.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (ws.current === newWs) {
            setStatus('error');
          }
          newWs.close();
        };

      } catch (error: any) {
        console.error('Connection process error:', error);
        if (isMounted) {
          setStatus('error');
          toast({
            variant: "destructive",
            title: "API Error",
            description: error.message || `Failed to connect to ${currentSymbol}. Please try again.`,
          });
        }
        if (ws.current) ws.current.close();
      }
    };
    
    connect();

    return () => {
      isMounted = false;
      if (ws.current) {
        ws.current.onclose = null; 
        ws.current.onerror = null;
        ws.current.close();
        ws.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, toast, processMessage]);

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
