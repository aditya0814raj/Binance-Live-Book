# Binance Live Order Book

This is a high-performance, real-time cryptocurrency order book visualizer built with Next.js that streams live data from the Binance API.

## Live Demo

Link to your deployed application:https://binance-live-book-gmz9.vercel.app/

*(Note: You will need to replace this with your actual deployment link after deploying the project.)*

## Features

- **Real-Time Data**: Live streaming of order book depth and recent trades using Binance WebSockets.
- **Trading Pair Selection**: Easily switch between popular trading pairs (BTC/USDT, ETH/USDT, etc.).
- **Dynamic UI**: Responsive and intuitive interface that visualizes bids, asks, and the spread.
- **Performance Optimized**: UI updates are throttled to ensure a smooth user experience even with a high volume of incoming data.
- **Connection Status**: Clear visual indicators for the WebSocket connection status (connecting, connected, disconnected, error).

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (React)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [ShadCN/UI](https://ui.shadcn.com/)
- **Data Source**: [Binance API](https://github.com/binance/binance-spot-api-docs) (WebSockets and REST)

## Getting Started

Follow these instructions to get the project set up and running on your local machine.

### Prerequisites

You need to have Node.js (version 18 or later) and a package manager like `npm` or `yarn` installed.

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

The application will now be running at [http://localhost:9002](http://localhost:9002).

## Design Choices & Assumptions

- **API Proxy for CORS**: The Binance REST API for fetching the initial order book snapshot has CORS restrictions that prevent direct calls from the browser. To solve this, a Next.js API route (`src/app/api/depth/route.ts`) was created to act as a proxy. The frontend calls this internal API route, which then securely fetches the data from Binance on the server side.

- **WebSocket for Real-Time Data**: For live updates, the application connects directly to the Binance WebSocket stream. This is the most efficient way to receive real-time order book and trade data without repeatedly polling a REST endpoint.

- **Data Synchronization**: A critical part of the application is correctly synchronizing the initial order book snapshot (from the REST API) with the live updates from the WebSocket. The `useBinanceData` hook includes logic to queue incoming WebSocket events while the snapshot is being fetched and then apply them in the correct order to ensure the order book remains accurate.

- **UI Performance**: Cryptocurrency markets generate a massive amount of data. To prevent the UI from becoming sluggish, the updates to the order book display are throttled. This means the UI re-renders at a controlled interval (e.g., every 200ms) rather than on every single message from the WebSocket, ensuring a smooth user experience.

- **State Management**: The application uses React's built-in `useReducer` and `useState` hooks for managing state. For this application's scope, a more complex state management library like Redux was deemed unnecessary.
