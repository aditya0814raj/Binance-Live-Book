"use client";

import { useState, useEffect, useReducer, useRef } from 'react';
import type { Trade, DepthUpdate } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface OrderBookState {
  bids: Map<string, string>;
  asks: Map<string, string>;
}

type OrderBookAction =
  | { type: 'SET_SNAPSHOT'; payload: { bids: [string, string][]; asks: [string, string][] } }
  | { type: 'UPDATE'; payload: { bids: [string, string][]; asks: [string, string][] } }
  | { type: 'RESET' };

const orderBookReducer = (state: OrderBookState, action: OrderBookAction): OrderBookState => {
  const updateMap = (map: Map<string, string>, updates: [string, string][]) => {
    const newMap = new Map(map);
    for (const [price, quantity] of updates) {
      if (parseFloat(quantity) === 0) {
        newMap.delete(price);
      } else {
        newMap.set(price, quantity);
      }
    }
    return newMap;
  };
  
  switch (action.type) {
    case 'SET_SNAPSHOT':
      return {
        bids: new Map(action.payload.bids),
        asks: new Map(action.payload.asks),
      };
    case 'UPDATE': {
      return {
        bids: updateMap(state.bids, action.payload.bids),
        asks: updateMap(state.asks, action.payload.asks),
      };
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
  
  // Throttled states for UI
  const [throttledBids, setThrottledBids] = useState(new Map<string, string>());
  const [throttledAsks, setThrottledAsks] = useState(new Map<string, string>());
  const lastUiUpdate = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let eventQueue: DepthUpdate[] = [];
    let lastUpdateId: number | null = null;
    let isFetchingSnapshot = false;

    const connect = async () => {
      if (ws.current) {
        ws.current.close();
      }
      if (!isMounted) return;

      setStatus('connecting');
      dispatch({ type: 'RESET' });
      setTrades([]);
      eventQueue = [];
      lastUpdateId = null;
      isFetchingSnapshot = true;
      
      try {
        const response = await fetch(`/api/depth?symbol=${symbol.toUpperCase()}`);
        if (!isMounted) return;

        if (!response.ok) {
          throw new Error(`Failed to fetch snapshot: ${response.statusText}`);
        }
        const snapshot = await response.json();
        
        lastUpdateId = snapshot.lastUpdateId;
        dispatch({ type: 'SET_SNAPSHOT', payload: { bids: snapshot.bids, asks: snapshot.asks } });

        // Process queued events
        const updatesToApply = {bids: [] as [string, string][], asks: [] as [string, string][]};
        eventQueue.forEach(update => {
          if (update.u > snapshot.lastUpdateId) {
             if (update.U <= snapshot.lastUpdateId + 1 && update.u >= snapshot.lastUpdateId + 1) {
                updatesToApply.bids.push(...update.b);
                updatesToApply.asks.push(...update.a);
                lastUpdateId = update.u;
            } else if (update.U > snapshot.lastUpdateId + 1) {
                // This means we missed updates, log and will trigger reconnect
                console.warn(`Missed an update. Last snapshot ID: ${snapshot.lastUpdateId}, current update start ID: ${update.U}. Reconnecting.`);
                ws.current?.close();
            }
          }
        });
        if(updatesToApply.bids.length > 0 || updatesToApply.asks.length > 0) {
            dispatch({ type: 'UPDATE', payload: updatesToApply });
        }
        
        eventQueue = [];
        isFetchingSnapshot = false;

      } catch (error: any) {
        console.error('Snapshot fetch error:', error);
        if (isMounted) {
          setStatus('error');
          toast({ variant: "destructive", title: "API Error", description: error.message });
        }
        return; // Don't try to connect WebSocket if snapshot fails
      }

      const lowerCaseSymbol = symbol.toLowerCase();
      const newWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${lowerCaseSymbol}@depth/${lowerCaseSymbol}@aggTrade`);
      ws.current = newWs;

      newWs.onopen = () => {
        if (isMounted) setStatus('connected');
      };

      newWs.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const stream = message.stream;
        const data = message.data;

        if (stream.includes('@depth')) {
          if (isFetchingSnapshot) {
            eventQueue.push(data);
          } else {
            if (data.U <= lastUpdateId! + 1 && data.u >= lastUpdateId! + 1) {
                dispatch({ type: 'UPDATE', payload: { bids: data.b, asks: data.a } });
                lastUpdateId = data.u;
            } else if (data.U > lastUpdateId! + 1) {
                console.warn("Order book out of sync, re-initializing...");
                if (ws.current) {
                    ws.current.close(); // This will trigger the onclose handler to reconnect
                }
            }
          }
        } else if (stream.includes('@aggTrade')) {
          setTrades(prev => [data, ...prev].slice(0, 50));
        }
      };

      newWs.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (isMounted) setStatus('error');
      };

      newWs.onclose = () => {
        if (isMounted) {
          setStatus('disconnected');
          // Reconnect logic
          setTimeout(() => {
              if(isMounted && ws.current === newWs) { // Only reconnect if this is still the active socket
                  console.log("Attempting to reconnect...");
                  connect();
              }
          }, 5000); // 5s reconnect delay
        }
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (ws.current) {
        ws.current.onclose = null; // Prevent reconnect logic from firing on unmount
        ws.current.close();
        ws.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, toast]);

  // Throttling mechanism for UI updates
  useEffect(() => {
    const now = Date.now();
    const updateUi = () => {
        setThrottledBids(new Map(orderBook.bids));
        setThrottledAsks(new Map(orderBook.asks));
        lastUiUpdate.current = Date.now();
    }
    
    if (now - lastUiUpdate.current > THROTTLE_MS) {
        updateUi();
    } else {
        const timer = setTimeout(updateUi, THROTTLE_MS - (now - lastUiUpdate.current));
        return () => clearTimeout(timer);
    }
  }, [orderBook]);


  return { bids: throttledBids, asks: throttledAsks, trades, status };
};
