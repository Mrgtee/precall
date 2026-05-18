import { ImageResponse } from "next/og";
import { getCall } from "../../../lib/queries";
import { bpsToPercent } from "../../../lib/format";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getCall(Number(id));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f8faf7",
          color: "#101827",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          fontFamily: "Arial",
          border: "12px solid #101827",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, fontWeight: 800 }}>
          <span>Precall Arena</span>
          <span>{call?.action || "LIVE CALL"}</span>
        </div>
        <div>
          <div style={{ fontSize: 58, lineHeight: 1, fontWeight: 900, maxWidth: 940 }}>
            {call?.marketTitle || "Bonded prediction-market call"}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 36, fontSize: 30, fontWeight: 800 }}>
            <span>Agent {bpsToPercent(call?.agentProbabilityBps || 0)}</span>
            <span>Market {bpsToPercent(call?.marketPriceBps || 0)}</span>
            <span>Edge {bpsToPercent(call?.edgeBps || 0)}</span>
          </div>
        </div>
        <div style={{ fontSize: 24, color: "#526070" }}>
          USDC-bonded signal on Arc · Thesis unlock via nanopayment
        </div>
      </div>
    ),
    size,
  );
}
