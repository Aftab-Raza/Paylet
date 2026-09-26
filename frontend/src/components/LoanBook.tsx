import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { User } from "../lib/api";

type Direction = "LENT" | "BORROWED";
type EntryKind = "ADVANCE" | "REPAYMENT";

type Entry = {
  id: string;
  contactId: string;
  direction: Direction;
  kind: EntryKind;
  amount: string;
  currency: string;
  minorUnit: number;
  purpose: string;
  date: string;
  deletedAt: string | null;
  legacyLoanId: string | null;
  createdAt: string;
};

type Totals = {
  currency: string;
  minorUnit: number;
  totalLent: string;
  repaymentsReceived: string;
  owedToYou: string;
  totalBorrowed: string;
  repaymentsMade: string;
  youOwe: string;
};

type Ledger = {
  contact: {
    id: string;
    name: string;
    nickname: string | null;
    isArchived: boolean;
    version: number;
  };
  entries: Entry[];
  totals: Totals[];
};

type Draft = {
  id: string;
  version: number;
  direction: Direction;
  kind: EntryKind;
  amount: string;
  currency: string;
  purpose: string;
  date: string;
};

type HistoryItem = {
  id: string;
  action: string;
  createdAt: string;
  snapshot: {
    amount: string;
    currency: string;
    purpose: string;
    date?: string;
    loanDate?: string;
  };
};

type HistoryResult = {
  entry: Entry;
  history: HistoryItem[];
  legacyHistory: HistoryItem[];
};

type Props = {
  contactId: string;
  onBack: () => void;
};

function todayIn(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function labelFor(direction: Direction, kind: EntryKind): string {
  if (direction === "LENT") {
    return kind === "ADVANCE"
      ? "Lent money"
      : "Received repayment";
  }

  return kind === "ADVANCE"
    ? "Borrowed money"
    : "Paid repayment";
}

function positive(amount: string): boolean {
  return BigInt(amount.replace(".", "")) > 0n;
}

export default function LoanBook({ contactId, onBack }: Props) {
  const [refresh, setRefresh] = useState(0);

  const [loaded, setLoaded] = useState<{
    key: string;
    ledger: Ledger;
    currencies: string[];
    user: User;
  } | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestKey = `${contactId}:${refresh}`;

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      api<Ledger>(
        `/loans?contactId=${encodeURIComponent(contactId)}`,
        { signal: controller.signal }
      ),
      api<{ currencies: string[] }>("/expenses/options", {
        signal: controller.signal,
      }),
      api<{ user: User }>("/profile", {
        signal: controller.signal,
      }),
    ])
      .then(([ledger, options, profile]) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          ledger,
          currencies: options.currencies,
          user: profile.user,
        });
        setError("");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error ? err.message : "Unable to load records."
        );
      });

    return () => controller.abort();
  }, [contactId, requestKey]);

  const ready = loaded?.key === requestKey;
  const ledger = loaded?.ledger;
  const contact = ledger?.contact;

  const disabled = busy || Boolean(draft) || !ready;

  const owedToYou = ledger?.totals.some(
    (total) => positive(total.owedToYou)
  ) ?? false;

  const youOwe = ledger?.totals.some(
    (total) => positive(total.youOwe)
  ) ?? false;

  function reload() {
    setError("");
    setRefresh((value) => value + 1);
  }

  function availableCurrencies(
    direction: Direction,
    kind: EntryKind
  ): string[] {
    if (!loaded) return [];

    if (kind === "ADVANCE") {
      return loaded.currencies;
    }

    return loaded.ledger.totals
      .filter((total) =>
        positive(
          direction === "LENT" ? total.owedToYou : total.youOwe
        )
      )
      .map((total) => total.currency);
  }

  function begin(direction: Direction, kind: EntryKind) {
    if (!loaded) return;

    const choices = availableCurrencies(direction, kind);

    if (choices.length === 0) return;

    const currency = choices.includes(loaded.user.defaultCurrency)
      ? loaded.user.defaultCurrency
      : choices[0];

    setDraft({
      id: crypto.randomUUID(),
      version: loaded.ledger.contact.version,
      direction,
      kind,
      amount: "",
      currency,
      purpose: kind === "REPAYMENT"
        ? labelFor(direction, kind)
        : "",
      date: todayIn(loaded.user.timezone),
    });

    setError("");
    setNotice("");
  }

  function updateDraft(
    field: "amount" | "currency" | "purpose" | "date",
    value: string
  ) {
    setDraft((current) =>
      current ? { ...current, [field]: value } : current
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api("/loans", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          contactId,
        }),
      });

      setDraft(null);
      setHistory(null);
      setNotice("Entry saved. The person’s totals have been updated.");
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save."
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry: Entry) {
    if (!contact) return;

    const confirmed = window.confirm(
      `Delete "${entry.purpose}" (${entry.currency} ${entry.amount})? ` +
      "It will be removed from totals and retained in deletion history."
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api(`/loans/${entry.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          version: contact.version,
        }),
      });

      setHistory(null);
      setNotice("Entry deleted. Totals recalculated.");
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete."
      );
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(entry: Entry) {
    setBusy(true);
    setError("");

    try {
      const result = await api<HistoryResult>(
        `/loans/${entry.id}/history`
      );
      setHistory(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load history."
      );
    } finally {
      setBusy(false);
    }
  }

  const entries = ledger?.entries.filter((entry) =>
    showDeleted ? Boolean(entry.deletedAt) : !entry.deletedAt
  ) ?? [];

  return (
    <main className="signed-in-page">
      <header className="app-header">
        <span className="brand">
          <span className="brand-mark">P</span>
          <span>Paylet</span>
        </span>

        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => {
            if (
              draft &&
              !window.confirm("Leave without saving this entry?")
            ) return;

            onBack();
          }}
        >
          ← People
        </button>
      </header>

      <section className="dashboard-page">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">PRIVATE PERSON LEDGER</span>
            <h1>{contact?.name ?? "Loading person…"}</h1>
            <p className="form-description">
              Repayments reduce this person’s total—not a particular loan.
            </p>
          </div>

          <button
            type="button"
            className="button button-outline"
            disabled={busy || Boolean(draft)}
            onClick={reload}
          >
            Reload
          </button>
        </div>

        {error && (
          <p className="error-message" role="alert">{error}</p>
        )}

        {notice && (
          <p className="google-success" role="status">{notice}</p>
        )}

        {!ready && !error && (
          <p role="status">Loading money records…</p>
        )}

        {ready && ledger && (
          <>
            {contact?.isArchived && (
              <p className="pending-message">
                This contact is archived. Restore them to record more
                money lent or borrowed. Repayments remain available.
              </p>
            )}

            <section className="loan-summary-section">
              <h2>Totals with this person</h2>
              <p className="profile-member">
                All recorded dates. Each currency is kept separate.
              </p>

              {ledger.totals.length === 0 && (
                <div className="profile-panel">
                  <p>They owe you: 0 · You owe them: 0</p>
                </div>
              )}

              {ledger.totals.map((total) => (
                <div
                  className="currency-loan-summary"
                  key={`${total.currency}:${total.minorUnit}`}
                >
                  <span className="loan-currency-label">
                    {total.currency}
                  </span>

                  <div className="loan-summary-grid">
                    <section className="loan-summary-card lent-summary">
                      <p className="loan-summary-label">They owe you</p>
                      <strong className="loan-summary-value">
                        {total.currency} {total.owedToYou}
                      </strong>
                      <dl>
                        <div>
                          <dt>Total lent</dt>
                          <dd>{total.totalLent}</dd>
                        </div>
                        <div>
                          <dt>Received back</dt>
                          <dd>{total.repaymentsReceived}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="loan-summary-card borrowed-summary">
                      <p className="loan-summary-label">You owe them</p>
                      <strong className="loan-summary-value">
                        {total.currency} {total.youOwe}
                      </strong>
                      <dl>
                        <div>
                          <dt>Total borrowed</dt>
                          <dd>{total.totalBorrowed}</dd>
                        </div>
                        <div>
                          <dt>You paid back</dt>
                          <dd>{total.repaymentsMade}</dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                </div>
              ))}
            </section>

            <div className="ledger-actions">
              <button
                type="button"
                className="button button-green"
                disabled={disabled || contact?.isArchived}
                onClick={() => begin("LENT", "ADVANCE")}
              >
                + Lent money
              </button>

              <button
                type="button"
                className="button button-blue"
                disabled={disabled || contact?.isArchived}
                onClick={() => begin("BORROWED", "ADVANCE")}
              >
                + Borrowed money
              </button>

              <button
                type="button"
                className="button button-yellow"
                disabled={disabled || !owedToYou}
                onClick={() => begin("LENT", "REPAYMENT")}
              >
                Received repayment
              </button>

              <button
                type="button"
                className="button button-outline"
                disabled={disabled || !youOwe}
                onClick={() => begin("BORROWED", "REPAYMENT")}
              >
                Paid repayment
              </button>
            </div>
          </>
        )}

        {draft && (
          <section className="profile-panel expense-editor">
            <h2>{labelFor(draft.direction, draft.kind)}</h2>

            <p className="profile-member">
              Check the details before saving. Saved entries cannot be edited.
            </p>

            <form onSubmit={save}>
              <fieldset disabled={busy}>
                <div className="profile-fields-row">
                  <div>
                    <label htmlFor="ledger-amount">Amount</label>
                    <input
                      id="ledger-amount"
                      inputMode="decimal"
                      placeholder="200.00"
                      value={draft.amount}
                      pattern="[0-9]{1,12}(\.[0-9]{1,4})?"
                      onChange={(event) =>
                        updateDraft("amount", event.target.value)
                      }
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="ledger-currency">Currency</label>
                    <select
                      id="ledger-currency"
                      value={draft.currency}
                      onChange={(event) =>
                        updateDraft("currency", event.target.value)
                      }
                    >
                      {availableCurrencies(
                        draft.direction,
                        draft.kind
                      ).map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label htmlFor="ledger-purpose">Purpose / note</label>
                <input
                  id="ledger-purpose"
                  value={draft.purpose}
                  placeholder="Groceries, travel, repayment received…"
                  maxLength={300}
                  onChange={(event) =>
                    updateDraft("purpose", event.target.value)
                  }
                  required
                />

                <label htmlFor="ledger-date">Date</label>
                <input
                  id="ledger-date"
                  type="date"
                  min="1900-01-01"
                  max="2199-12-31"
                  value={draft.date}
                  onChange={(event) =>
                    updateDraft("date", event.target.value)
                  }
                  required
                />

                {draft.date && (
                  <small>{displayDate(draft.date)}</small>
                )}

                <div className="profile-actions">
                  <button
                    type="submit"
                    className="button button-green"
                  >
                    {busy ? "Saving…" : "Save entry"}
                  </button>

                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => setDraft(null)}
                  >
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        )}

        {ready && (
          <section className="expense-list">
            <div className="ledger-timeline-heading">
              <h2>Money history</h2>

              <label className="people-checkbox">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(event) =>
                    setShowDeleted(event.target.checked)
                  }
                />
                Show deleted entries
              </label>
            </div>

            {entries.length === 0 && (
              <div className="profile-panel">
                <p>
                  {showDeleted
                    ? "No deleted entries."
                    : "No money entries yet."}
                </p>
              </div>
            )}

            {entries.map((entry) => (
              <article
                key={entry.id}
                className={`expense-row ${
                  entry.deletedAt ? "is-void" : ""
                }`}
              >
                <div>
                  <span className="ledger-entry-type">
                    {labelFor(entry.direction, entry.kind)}
                  </span>

                  <h3>{entry.purpose}</h3>
                  <p>{displayDate(entry.date)}</p>

                  {entry.deletedAt && (
                    <span className="void-label">
                      Deleted · excluded from totals
                    </span>
                  )}
                </div>

                <div className="expense-row-right">
                  <strong>
                    {entry.currency} {entry.amount}
                  </strong>

                  <div className="expense-row-actions">
                    {!entry.deletedAt && (
                      <button
                        type="button"
                        className="button button-danger"
                        disabled={disabled}
                        onClick={() => void deleteEntry(entry)}
                      >
                        Delete
                      </button>
                    )}

                    <button
                      type="button"
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => void openHistory(entry)}
                    >
                      History
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {history && (
          <section className="profile-panel expense-history">
            <h2>Entry history</h2>

            <p>
              {history.entry.purpose} ·{" "}
              {history.entry.currency} {history.entry.amount}
            </p>

            {history.history.length === 0 && (
              <p className="profile-member">
                Imported from your previous loan records.
              </p>
            )}

            {history.history.map((item) => (
              <article key={item.id}>
                <strong className="history-action">
                  {item.action.toLowerCase().replaceAll("_", " ")}
                </strong>
                <p>
                  {new Date(item.createdAt).toLocaleString(undefined, {
                    timeZone: loaded?.user.timezone ?? "UTC",
                  })}
                </p>
                <p>
                  {item.snapshot.currency} {item.snapshot.amount}
                  {" · "}{item.snapshot.purpose}
                </p>
                {item.snapshot.date && (
                  <p>{displayDate(item.snapshot.date)}</p>
                )}
              </article>
            ))}

            {history.legacyHistory.length > 0 && (
              <details>
                <summary>Earlier loan-level history</summary>

                {history.legacyHistory.map((item) => (
                  <article key={item.id}>
                    <strong className="history-action">
                      {item.action.toLowerCase().replaceAll("_", " ")}
                    </strong>
                    <p>
                      {new Date(item.createdAt).toLocaleString(undefined, {
                        timeZone: loaded?.user.timezone ?? "UTC",
                      })}
                    </p>
                    <p>
                      {item.snapshot.currency} {item.snapshot.amount}
                      {" · "}{item.snapshot.purpose}
                    </p>
                  </article>
                ))}
              </details>
            )}

            <button
              type="button"
              className="button button-outline"
              onClick={() => setHistory(null)}
            >
              Close history
            </button>
          </section>
        )}
      </section>
    </main>
  );
}