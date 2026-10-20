import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value / 100,
  );
const labels = {
  Confirmed: "Approve",
  Rejected: "Reject",
  Cancelled: "Cancel order",
  Dispatched: "Dispatch",
  Delivered: "Mark delivered",
};

function App() {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState("");
  const [me, setMe] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("catalogue");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(null);

  async function api(url, options = {}) {
    const response = await fetch(`/api${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
        ...options.headers,
      }, 
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }

  useEffect(() => {
    fetch("/api/users")
      .then((response) => response.json())
      .then((data) => {
        console.log(data,'ffff')
        setUsers(data);
        setUserId(
          data.find((user) => user.name === "Silver Distributors")?._id ||
            data[0]?._id ||
            "",
        );
      })
      .catch((error) => setMessage(error.message));
  }, []);

  async function refresh() {
    const [profile, catalogue, allOrders] = await Promise.all([
      api("/me"),
      api("/products"),
      api("/orders"),
    ]);
    setMe(profile);
    setProducts(catalogue);
    setOrders(allOrders);
    if (profile.role === "SalesManager") setJobs(await api("/erp"));
  }

  useEffect(() => {
    if (!userId) return;
    setDetail(null);
    setMe(null);
    setQuantities({});
    key.current = null;
    setMessage("");
    refresh().catch((error) => setMessage(error.message));
  }, [userId]);

  async function showOrder(id) {
    try {
      setDetail(await api(`/orders/${id}`));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function place() {
    setBusy(true);
    setMessage("");
    key.current ||= crypto.randomUUID();
    try {
      const lines = Object.entries(quantities)
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([product, quantity]) => ({
          product,
          quantity: Number(quantity),
        }));
      const order = await api("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({ lines }),
      });
      key.current = null;
      setQuantities({});
      setTab("orders");
      await refresh();
      await showOrder(order._id);
      setMessage(`Order placed: ${order.status}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function change(id, status) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/orders/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await refresh();
      await showOrder(id);
      setMessage(`Order is now ${status}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  const distributor = me?.role === "Distributor";
  const subtotal = products.reduce(
    (sum, product) =>
      sum + product.price * Number(quantities[product._id] || 0),
    0,
  );
  const discount = Math.round((subtotal * (me?.discountPercent || 0)) / 100);
  const visibleOrders = orders.filter(
    (order) => tab !== "approval" || order.status === "PendingApproval",
  );
  const pending = orders.filter(
    (order) => order.status === "PendingApproval",
  ).length;

  function actions(order) {
    if (distributor)
      return ["Placed", "PendingApproval", "Confirmed"].includes(order.status)
        ? ["Cancelled"]
        : [];
    return (
      {
        PendingApproval: ["Confirmed", "Rejected"],
        Confirmed: ["Dispatched"],
        Dispatched: ["Delivered"],
      }[order.status] || []
    );
  }

  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">DISTRIBUTOR PORTAL</span>
          <h1>Orders made simple.</h1>
          <p>Available stock, clear approvals and rewards in one place.</p>
        </div>
        <label>
          Acting as
          <select
            aria-label="Acting as"
            value={userId}
            disabled={busy}
            onChange={(event) => setUserId(event.target.value)}
          >
            {users.map((user) => (
              <option key={user._id} value={user._id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {distributor ? (
        <section className="metrics">
          <article>
            <small>Current tier</small>
            <strong>{me.tier}</strong>
            <span>Your next order saves {me.discountPercent}%</span>
          </article>
          <article>
            <small>Points · last 90 days</small>
            <strong>{me.points.toLocaleString()}</strong>
            <span>Earned on confirmed orders</span>
          </article>
          <article>
            <small>Available credit</small>
            <strong>{money(me.availableCredit)}</strong>
            <span>Limit {money(me.creditLimit)}</span>
          </article>
          <article>
            <small>Outstanding orders</small>
            <strong>{money(me.outstanding)}</strong>
            <span>Until delivery or cancellation</span>
          </article>
        </section>
      ) : (
        me && (
          <section className="metrics manager-metrics">
            <article>
              <small>Pending approval</small>
              <strong>{pending}</strong>
              <span>Orders awaiting your decision</span>
            </article>
            <article>
              <small>All orders</small>
              <strong>{orders.length}</strong>
              <span>Across all distributors</span>
            </article>
            <article>
              <small>ERP delivery</small>
              <strong>{jobs.filter((job) => job.deliveredAt).length}</strong>
              <span>Delivered events in latest 50</span>
            </article>
          </section>
        )
      )}
      <nav>
        {[
          ["catalogue", "Catalogue"],
          ["orders", distributor ? "My orders" : "All orders"],
          ...(!distributor && me
            ? [
                ["approval", `Approval queue (${pending})`],
                ["erp", "ERP events"],
              ]
            : []),
        ].map(([value, label]) => (
          <button
            className={tab === value ? "active" : "secondary"}
            key={value}
            disabled={busy}
            onClick={() => {
              setTab(value);
              setDetail(null);
            }}
          >
            {label}
          </button>
        ))}
        <button
          className="secondary refresh"
          disabled={busy}
          onClick={() => refresh().catch((error) => setMessage(error.message))}
        >
          Refresh
        </button>
      </nav>
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
      {!me && <p>Loading your workspace…</p>}
      {me && tab === "catalogue" && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Product catalogue</h2>
              <p>Stock shown is available after reservations.</p>
            </div>
            <span className="badge">{products.length} products</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Unit price</th>
                  <th>Available stock</th>
                  {distributor && <th>Order quantity</th>}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product._id}>
                    <td className="muted">{product.sku}</td>
                    <td>
                      <strong>{product.name}</strong>
                    </td>
                    <td>{money(product.price)}</td>
                    <td>
                      <span
                        className={
                          product.available === 0
                            ? "badge unavailable"
                            : "stock"
                        }
                      >
                        {product.available || "Out of stock"}
                      </span>
                    </td>
                    {distributor && (
                      <td>
                        <input
                          aria-label={`Quantity for ${product.name}`}
                          type="number"
                          min="0"
                          max={product.available}
                          step="1"
                          disabled={busy || !product.available}
                          value={quantities[product._id] || ""}
                          onChange={(event) => {
                            key.current = null;
                            setQuantities({
                              ...quantities,
                              [product._id]: event.target.value,
                            });
                          }}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {distributor && (
            <footer>
              <div>
                <small>
                  Subtotal {money(subtotal)} · Discount {money(discount)}
                </small>
                <strong className="total">
                  Total {money(subtotal - discount)}
                </strong>
                <small>
                  The server verifies stock, credit and the final discount.
                </small>
              </div>
              <button disabled={busy || subtotal <= 0} onClick={place}>
                {busy ? "Please wait…" : "Place order"}
              </button>
            </footer>
          )}
        </section>
      )}
      {me && ["orders", "approval"].includes(tab) && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>
                {tab === "approval"
                  ? "Orders awaiting approval"
                  : "Order overview"}
              </h2>
              <p>
                {tab === "approval"
                  ? "Review orders that exceed available credit."
                  : "Select an order to see its items and history."}
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Distributor</th>
                  <th>Status</th>
                  <th>Discount</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order._id}>
                    <td>{order._id.slice(-8)}</td>
                    <td>{order.distributor.name}</td>
                    <td>
                      <span className={`badge ${order.status}`}>
                        {order.status}
                      </span>
                    </td>
                    <td>{order.discountPercent}%</td>
                    <td>{money(order.total)}</td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => showOrder(order._id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visibleOrders.length && (
            <p className="empty">No orders to display.</p>
          )}
        </section>
      )}
      {me && tab === "erp" && (
        <section className="panel">
          <h2>ERP event delivery</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status event</th>
                  <th>Delivery</th>
                  <th>Attempts</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job._id}>
                    <td>{job.event.order.slice(-8)}</td>
                    <td>{job.event.to}</td>
                    <td>
                      {job.deliveredAt
                        ? "Delivered"
                        : job.failed
                          ? "Failed"
                          : "Queued / retrying"}
                    </td>
                    <td>{job.attempts}</td>
                    <td>{job.lastError || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {detail && (
        <section className="panel detail">
          <div className="section-title">
            <h2>Order {detail.order._id.slice(-8)}</h2>
            <span className={`badge ${detail.order.status}`}>
              {detail.order.status}
            </span>
          </div>
          <ul>
            {detail.order.lines.map((line) => (
              <li key={line.product}>
                {line.sku} — {line.name}:{" "}
                <strong>
                  {line.quantity} × {money(line.price)}
                </strong>
              </li>
            ))}
          </ul>
          <p>
            Subtotal {money(detail.order.subtotal)} · Fixed discount{" "}
            {detail.order.discountPercent}% ({money(detail.order.discount)}) ·{" "}
            <strong>Total {money(detail.order.total)}</strong>
          </p>
          <div className="actions">
            {actions(detail.order).map((status) => (
              <button
                key={status}
                disabled={busy}
                onClick={() => change(detail.order._id, status)}
              >
                {labels[status]}
              </button>
            ))}
          </div>
          <h3>Status history</h3>
          <ol className="timeline">
            {detail.events.map((event) => (
              <li key={event._id}>
                <strong>
                  {event.from || "Created"} → {event.to}
                </strong>
                <span>
                  {event.actorName} ·{" "}
                  {new Date(event.occurredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="footnote">
        Local assessment demo · User switching replaces sign-in.
      </p>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
