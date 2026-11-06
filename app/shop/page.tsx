"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../components/api";
type Product = {
  id: string;
  caseId: string;
  mode: string;
  priceVersionId: string;
  amountMinor: number;
  currency: string;
};
type Order = {
  id: string;
  productId: string;
  amountMinor: number;
  currency: string;
  status: string;
  environment: string;
  mode: string;
};
export default function Shop() {
  const [data, setData] = useState<{
      products: Product[];
      development: boolean;
      checkoutAvailable: boolean;
    } | null>(null),
    [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{
      products: Product[];
      development: boolean;
      checkoutAvailable: boolean;
    }>("products")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function buy(p: Product) {
    setBusy(true);
    setError("");
    try {
      setOrder(
        await api<Order>("orders", "POST", {
          productId: p.id,
          priceVersionId: p.priceVersionId,
          idempotencyKey: crypto.randomUUID(),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function simulate() {
    if (!order) return;
    setBusy(true);
    try {
      setOrder(
        await api<Order>(`orders/${order.id}/development-payment`, "POST", {}),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-page">
      <span className="eyebrow">LONGER STORIES. BIGGER TWISTS.</span>
      <h1>The next chapter.</h1>
      {error && (
        <p className="room-message" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">Opening the case shelf…</p>
      ) : !data.checkoutAvailable ? (
        <section className="room-panel">
          <h2>Premium cases are in preparation.</h2>
          <p>
            Checkout will open after payment verification and reviewed cases are
            ready. Your free mysteries are available now.
          </p>
          <Link className="button lime" href="/explore?mode=solo&access=free">
            Explore free cases
          </Link>
        </section>
      ) : (
        <>
          <p className="room-message">
            Development payment laboratory · No real charge, live checkout or
            playable premium content. Prices are test fixtures.
          </p>
          {order ? (
            <section className="room-panel">
              <h2>
                {order.status === "paid"
                  ? "Demo payment recorded"
                  : "Demo order"}
              </h2>
              <p>
                {order.productId} ·{" "}
                {new Intl.NumberFormat("en-NG", {
                  style: "currency",
                  currency: order.currency,
                }).format(order.amountMinor / 100)}
              </p>
              <p>
                Status: {order.status}. Environment: {order.environment}.
              </p>
              {order.status === "paid" ? (
                <p role="status">
                  Development ownership saved for this mode. This does not
                  unlock a live premium game.
                </p>
              ) : (
                <button
                  className="button lime"
                  disabled={busy}
                  onClick={simulate}
                >
                  Simulate successful development payment
                </button>
              )}
            </section>
          ) : (
            data.products.map((p) => (
              <section className="room-panel" key={p.id}>
                <h2>The Missing Wedding Gift · {p.mode}</h2>
                <p>
                  Test price:{" "}
                  {new Intl.NumberFormat("en-NG", {
                    style: "currency",
                    currency: p.currency,
                  }).format(p.amountMinor / 100)}
                </p>
                <p>
                  Verified email required.{" "}
                  <Link href="/account">Open account</Link>
                </p>
                <button
                  className="button lime"
                  disabled={busy}
                  onClick={() => buy(p)}
                >
                  Create demo {p.mode} order
                </button>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
