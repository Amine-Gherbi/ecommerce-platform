import type { OrderStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/format";
import { allowedNextStatuses } from "@/lib/order-state";
import type { AdminOrderView } from "@/lib/orders";

// Presentational admin order list. It takes plain data, so it can be rendered
// in a test without a session, a database or a request. The page above it
// does the auth check and the query.

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "PAID",
  "PAYMENT_FAILED",
  "FULFILLED",
  "CANCELLED",
  "REFUND_REQUIRED",
  "REFUNDED",
];

function badgeVariant(
  status: OrderStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "REFUND_REQUIRED") return "destructive";
  if (status === "REFUNDED" || status === "CANCELLED") return "secondary";
  if (status === "PAID" || status === "FULFILLED") return "default";
  return "outline";
}

/**
 * The transition table as text. Rendering it next to the orders is the point
 * of this screen: an operator can see what a status may become without
 * reading the source.
 */
export function StateMachineLegend() {
  return (
    <ul className="mt-3 grid gap-1 sm:grid-cols-2">
      {ORDER_STATUSES.map((status) => {
        const next = allowedNextStatuses(status);
        return (
          <li key={status} className="text-xs text-muted-foreground">
            <code className="font-semibold text-foreground">{status}</code>
            <span aria-hidden="true"> → </span>
            {next.length === 0 ? "terminal" : next.join(" · ")}
          </li>
        );
      })}
    </ul>
  );
}

function lineTotalCents(unitPriceCents: number, quantity: number): number {
  return unitPriceCents * quantity;
}

export function OrderTable({
  orders,
}: {
  orders: readonly AdminOrderView[];
}) {
  if (orders.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        No orders yet. Run <code>npx prisma db seed -- --seed 42</code> for the
        demo set.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-4">
      {orders.map((order) => (
        <article
          key={order.id}
          className="rounded-xl border bg-card p-4"
          aria-labelledby={`order-${order.id}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id={`order-${order.id}`}
                className="font-mono text-sm font-semibold"
              >
                {order.id}
              </h2>
              <Badge variant={badgeVariant(order.status)}>{order.status}</Badge>
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {formatCents(order.totalCents)} {order.currency.toUpperCase()}
            </span>
          </div>

          <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="flex gap-1">
              <dt>Customer:</dt>
              <dd>{order.userEmail ?? "deleted account"}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Created:</dt>
              <dd>
                <time dateTime={order.createdAt.toISOString()}>
                  {order.createdAt.toISOString()}
                </time>
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>PaymentIntent:</dt>
              <dd className="font-mono">
                {order.paymentIntentId ?? "none"}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>Allowed next:</dt>
              <dd>
                {order.nextStatuses.length === 0
                  ? "terminal"
                  : order.nextStatuses.join(" · ")}
              </dd>
            </div>
          </dl>

          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="py-1 font-medium">
                  SKU
                </th>
                <th scope="col" className="py-1 font-medium">
                  Snapshot name
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Unit
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Line
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-1 font-mono text-xs">{item.sku}</td>
                  <td className="py-1">
                    {item.nameSnapshot}
                    {item.variantArchivedAt !== null && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (product archived)
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCents(item.unitPriceCents)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCents(
                      lineTotalCents(item.unitPriceCents, item.quantity),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </div>
  );
}
