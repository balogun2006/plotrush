"use client";

import { useEffect, useState } from "react";
import type { DisputeSummary } from "@/lib/contracts/disputes";
import type { FinanceOrder } from "@/lib/contracts/refunds";
import { api } from "./api";

export function FinanceDesk() {
  const [orders, setOrders] = useState<FinanceOrder[] | null>(null);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<FinanceOrder | null>(null);
  const [providerId, setProviderId] = useState("");
  const [disputeId, setDisputeId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ordersUrl = (value: string) =>
    "admin/finance/orders?search=" + encodeURIComponent(value);
  useEffect(() => {
    let active = true;
    api<FinanceOrder[]>(ordersUrl(""))
      .then((items) => {
        if (active) setOrders(items);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="room-panel">
      <h2>Finance desk</h2>
      <p>
        Paystack test orders only. Process refunds in Paystack, then reconcile
        them here by refund ID. Use a dispute ID to sync its verified status.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const items = await api<FinanceOrder[]>(ordersUrl(search.trim()));
            setOrders(items);
            setSelection(null);
          });
        }}
      >
        <label>
          Order ID or payment reference{" "}
          <input
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button type="submit" className="button outline" disabled={busy}>
          Find order
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {orders?.length === 0 && (
        <p>No matching orders or open payment reviews.</p>
      )}
      <ul className="editorial-list">
        {orders?.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSelection(o);
                setReason("");
                setProviderId("");
                setDisputeId("");
              }}
            >
              {o.reference} · {o.productId}
            </button>
          </li>
        ))}
      </ul>
      {selection && (
        <div>
          <h3>{selection.reference}</h3>
          <p>
            {new Intl.NumberFormat("en-NG", {
              style: "currency",
              currency: selection.currency,
            }).format(selection.amountMinor / 100)}{" "}
            paid ·{" "}
            {new Intl.NumberFormat("en-NG", {
              style: "currency",
              currency: selection.currency,
            }).format(selection.refundedMinor / 100)}{" "}
            confirmed refunded
          </p>
          {selection.reason && <p>Buyer request: {selection.reason}</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const path = "admin/finance/orders/" + selection.id;
              void run(async () => {
                const result = await api<{
                  status: string;
                  refundedMinor: number;
                }>(path + "/reconcile-refund", "POST", { providerId });
                setMessage(
                  result.status === "processed"
                    ? "Confirmed refund reconciled."
                    : "Paystack refund status: " + result.status + ".",
                );
                const items = await api<FinanceOrder[]>(
                  ordersUrl(selection.id),
                );
                setSelection(items[0] ?? null);
                setOrders(items);
              });
            }}
          >
            <label>
              Paystack refund ID{" "}
              <input
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                inputMode="numeric"
                pattern="[1-9][0-9]{0,19}"
                required
              />
            </label>
            <button className="button outline" type="submit" disabled={busy}>
              Verify and reconcile refund
            </button>
          </form>
          <h4>Paystack disputes</h4>
          {selection.disputes.length > 0 && (
            <ul className="editorial-list">
              {selection.disputes.map((d) => (
                <li key={d.providerId}>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setDisputeId(d.providerId)}
                  >
                    {d.providerId} · {d.status}{" "}
                    {d.resolution && `· ${d.resolution}`}
                  </button>
                  <small>
                    {d.holdsAccess ? "Access on hold" : "Hold released"}
                  </small>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const dispute = await api<DisputeSummary>(
                  "admin/finance/orders/" + selection.id + "/reconcile-dispute",
                  "POST",
                  { providerId: disputeId },
                );
                const items = await api<FinanceOrder[]>(
                  ordersUrl(selection.id),
                );
                setSelection(items[0] ?? null);
                setOrders(items);
                setMessage(
                  "Paystack dispute verified: " + dispute.status + ".",
                );
              });
            }}
          >
            <label>
              Paystack dispute ID{" "}
              <input
                value={disputeId}
                onChange={(e) => setDisputeId(e.target.value)}
                inputMode="numeric"
                pattern="[1-9][0-9]{0,19}"
                required
              />
            </label>
            <button type="submit" className="button outline" disabled={busy}>
              Verify and sync dispute
            </button>
          </form>
          {selection.requestId && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await api(
                    "admin/finance/orders/" +
                      selection.id +
                      "/close-refund-request",
                    "POST",
                    { requestId: selection.requestId, reason },
                  );
                  setSelection(null);
                  setOrders(
                    await api<FinanceOrder[]>(ordersUrl(search.trim())),
                  );
                  setMessage("Refund request closed.");
                });
              }}
            >
              <label>
                Reason for closing request{" "}
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  required
                />
              </label>
              <button
                className="button outline"
                type="submit"
                disabled={busy || !reason.trim()}
              >
                Close request
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
