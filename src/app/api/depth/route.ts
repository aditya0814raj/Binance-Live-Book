import { NextResponse } from "next/server";

export const runtime = "edge"; // run on Vercel Edge Network

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    const binanceUrl = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=1000`;

    const response = await fetch(binanceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0", // Pretend to be a browser → avoids blocks
      },
      next: { revalidate: 0 }, // prevent caching
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: "Binance fetch failed", details: err },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "no-store", // ensure fresh data
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
