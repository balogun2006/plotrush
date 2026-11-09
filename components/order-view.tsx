"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PremiumPlay } from "./premium-play";
import { api } from "./api";
type Order = {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  environment: string;
  mode: "solo" | "group";
  caseId: string;
  playAvailable?: boolean;
  refundedMinor: number;
  refundRequested: boolean;
  disputeHold: boolean;
};
export function OrderView({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [reason, setReason] = useState("");
  const load = useCallback(
    () => api<Order>("orders/" + id).then(setOrder),
    [id],
  );
  useEffect(() => {
    let active = true;
    api<Order>("orders/" + id)
      .then((o) => {
        if (active) setOrder(o);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const value = await api<Order>(`orders/${id}/verify`, "POST", {});
      setOrder(value);
      setNotice(
        value.status === "paid"
          ? "Payment verified and ownership saved."
          : "Payment is not confirmed yet. You can check again later.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ authorizationUrl: string | null }>(
        `orders/${id}/checkout`,
        "POST",
        {},
      );
      if (result.authorizationUrl)
        window.location.assign(result.authorizationUrl);
      else await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function refund() {
    setBusy(true);
    setError("");
    try {
      setOrder(
        await api<Order>(`orders/${id}/refund-request`, "POST", { reason }),
      );
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fullRefund = !!order && order.refundedMinor === order.amountMinor;
  return (
    <div className="account-page">
      <span className="eyebrow">YOUR PURCHASE</span>
      <h1>
        {fullRefund
          ? "Refund confirmed."
          : order?.status === "paid"
            ? "Payment verified."
            : "Your case, one step closer."}
      </h1>
      {error && (
        <p role="alert" className="room-message">
          {error}
        </p>
      )}
      {!order ? (
        <p role="status">
          {error
            ? "Sign in with the account that created this order."
            : "Checking your order…"}
        </p>
      ) : (
        <section className="room-panel">
          <h2>
            {order.mode === "group"
              ? "Group case · host purchase"
              : "Solo case purchase"}
          </h2>
          <p>
            {new Intl.NumberFormat("en-NG", {
              style: "currency",
              currency: order.currency,
            }).format(order.amountMinor / 100)}
          </p>
          <p>Status: {fullRefund ? "refunded" : order.status}.</p>
          {order.environment !== "live" && (
            <p className="room-message">Sandbox order · Test payments only.</p>
          )}
          {notice && <p role="status">{notice}</p>}
          {order.status === "paid" ? (
            <>
              <p>Your purchase is recorded in your account.</p>
              {order.disputeHold && !fullRefund && (
                <p className="room-message">
                  This payment is under dispute review. New premium starts are
                  paused.
                </p>
              )}
              {order.playAvailable && (
                <PremiumPlay caseId={order.caseId} mode={order.mode} />
              )}
              <Link href="/library">My cases</Link>
              {order.refundedMinor > 0 && (
                <p>
                  Confirmed refunds:{" "}
                  {new Intl.NumberFormat("en-NG", {
                    style: "currency",
                    currency: order.currency,
                  }).format(order.refundedMinor / 100)}
                </p>
              )}
              {order.refundRequested ? (
                <p role="status">Your refund request is awaiting review.</p>
              ) : (
                order.environment === "test" &&
                !fullRefund && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void refund();
                    }}
                  >
                    <label>
                      Reason for refund request
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        required
                        maxLength={500}
                      />
                    </label>
                    <button
                      type="submit"
                      className="button outline"
                      disabled={busy || !reason.trim()}
                    >
                      Request a refund
                    </button>
                  </form>
                )
              )}
            </>
          ) : (
            <>
              <p>
                Returning from checkout does not prove payment. Check payment
                status to verify it securely with Paystack.
              </p>
              <div className="room-actions">
                {order.status === "pending" && (
                  <button className="button lime" disabled={busy} onClick={pay}>
                    Continue to Paystack
                  </button>
                )}
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={verify}
                >
                  Check payment status
                </button>
              </div>
              {order.status === "expired" && (
                <p>
                  This quote expired. A payment already made can still be
                  verified. <Link href="/shop">Browse cases</Link>
                </p>
              )}
            </>
          )}
        </section>
      )}
      <p>
        <Link href="/account">Your account</Link> ·{" "}
        <Link href="/explore?access=free&mode=solo">Free cases</Link>
      </p>
    </div>
  );
}
