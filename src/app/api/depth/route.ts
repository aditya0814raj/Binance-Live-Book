import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=1000`);
    if (!response.ok) {
        const errorData = await response.json();
        return NextResponse.json({ error: 'Failed to fetch data from Binance', details: errorData }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
