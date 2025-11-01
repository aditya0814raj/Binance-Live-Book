# **App Name**: Binance Live Book

## Core Features:

- Binance WebSocket Connection: Establish and maintain a real-time WebSocket connection to the Binance API to receive live market data including aggregate trades and order book deltas.
- Order Book Aggregation: Aggregate incoming order book delta events to maintain a real-time, up-to-date order book state, with bids and asks stored separately for efficient access.
- Real-Time Order Book Display: Render the aggregated order book in a two-column layout with bids (green) on the left and asks (red) on the right. Display price, amount, and cumulative total for each level.
- Spread Calculation: Continuously calculate and display the spread (difference between the lowest ask and highest bid) in real-time.
- Depth Visualization: Enhance the order book display with a depth visualization by using background bars to represent the relative total amount at each price level.
- Recent Trades Log: Maintain a log of the 50 most recent trades, updating in real-time. Flash green for buys and red for sells upon arrival.

## Style Guidelines:

- Primary color: Deep navy blue (#242A3B) for a professional, financial feel.
- Background color: Dark gray (#333333) to provide high contrast and reduce eye strain during extended use.
- Accent color: Electric blue (#7DF9FF) for highlighting important data and interactive elements.
- Body and headline font: 'Inter', a grotesque-style sans-serif, for a modern, machined, objective, neutral look. Note: currently only Google Fonts are supported.
- Use simple, line-based icons for visual clarity.
- Two-column layout for order book (bids/asks) with a separate recent trades component.
- Subtle color flashes for new trades (green for buys, red for sells) to highlight market activity.