export default async (req, context) => {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing TWELVE_DATA_API_KEY. Add it in Netlify Site settings > Environment variables." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const url = new URL(req.url);
  const symbols = url.searchParams.get("symbols") || "AAPL,NVDA,AMD,TSLA,META";
  const symbolList = symbols.split(",").map(s => s.trim()).filter(Boolean);

  try {
    const results = [];
    for (const symbol of symbolList.slice(0, 10)) {
      const [quoteRes, rsiRes, emaRes] = await Promise.all([
        fetch(`https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`),
        fetch(`https://api.twelvedata.com/rsi?symbol=${symbol}&interval=1day&time_period=14&outputsize=1&apikey=${apiKey}`),
        fetch(`https://api.twelvedata.com/ema?symbol=${symbol}&interval=1day&time_period=50&outputsize=1&apikey=${apiKey}`)
      ]);

      const quote = await quoteRes.json();
      const rsi = await rsiRes.json();
      const ema = await emaRes.json();

      if (quote.status === "error") continue;

      const price = parseFloat(quote.close || quote.price || 0);
      const rsiVal = parseFloat(rsi.values?.[0]?.rsi || 50);
      const emaVal = parseFloat(ema.values?.[0]?.ema || price);
      const change = parseFloat(quote.percent_change || 0);
      const volume = parseInt(quote.volume || 0);
      const avgVolume = parseInt(quote.average_volume || volume);
      const relVol = avgVolume > 0 ? (volume / avgVolume) : 1;

      let setup = null;
      let score = 0;
      let reason = [];

      if (price > emaVal) { score += 2; reason.push("Above 50 EMA"); }
      else { score -= 2; reason.push("Below 50 EMA"); }

      if (rsiVal > 50 && rsiVal < 70) { score += 2; reason.push("RSI bullish"); }
      else if (rsiVal > 70) { score += 1; reason.push("RSI overbought"); }
      else if (rsiVal < 30) { score -= 2; reason.push("RSI oversold"); }
      else { score -= 1; reason.push("RSI bearish"); }

      if (relVol > 1.2) { score += 1; reason.push("High rel. volume"); }
      if (change > 1) { score += 1; reason.push("Up >1%"); }
      else if (change < -1) { score -= 1; reason.push("Down >1%"); }

      if (score >= 4) setup = "CALL";
      else if (score <= -3) setup = "PUT";

      results.push({
        symbol,
        price,
        change,
        rsi: rsiVal,
        ema50: emaVal,
        relVolume: relVol,
        setup,
        score,
        reason
      });
    }

    const passing = results.filter(r => r.setup);
    return new Response(JSON.stringify({ results, passing, total: results.length, passCount: passing.length }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = { path: "/.netlify/functions/scan" };
