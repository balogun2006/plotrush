"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PremiumPlay } from "../../components/premium-play";
import { api } from "../../components/api";
type Product = {
  id: string;
  title: string;
  caseId: string;
  mode: "solo" | "group";
  priceVersionId: string;
  amountMinor: number;
  currency: string;
};
type Order = {
  id: string;
  productId: string;
  amountMinor: number;
  currency: string;
  caseId: string;
  playAvailable?: boolean;
  status: string;
  environment: string;
  mode: "solo" | "group";
};
export default function Shop() {
  const router = useRouter();
  const [data, setData] = useState<{
      products: Product[];
      development: boolean;
      checkoutAvailable: boolean;
      paymentEnvironment: string | null;
    } | null>(null),
    [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{
      products: Product[];
      development: boolean;
      checkoutAvailable: boolean;
      paymentEnvironment: string | null;
    }>("products")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function buy(p: Product) {
    setBusy(true);
    setError("");
    try {
      const created = await api<Order>("orders", "POST", {
        productId: p.id,
        priceVersionId: p.priceVersionId,
        idempotencyKey: crypto.randomUUID(),
      });
      if (data?.development) setOrder(created);
      else router.push("/orders/" + created.id);
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
      ) : !data.checkoutAvailable || !data.products.length ? (
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
            {data.development
              ? "Development checkout · Simulated payments and test prices."
              : "Paystack sandbox · Test payments and preview cases."}
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
                <>
                  <p role="status">
                    Development ownership saved for this mode.
                  </p>
                  {order.playAvailable && (
                    <PremiumPlay caseId={order.caseId} mode={order.mode} />
                  )}
                  <Link href="/library">My cases</Link>
                </>
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
                <h2>
                  {p.title} · {p.mode}
                </h2>
                <p>
                  {data.development ? "Test price:" : "Sandbox price:"}{" "}
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
                  {data.development ? "Create demo" : "Create sandbox"} {p.mode}{" "}
                  order
                </button>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
