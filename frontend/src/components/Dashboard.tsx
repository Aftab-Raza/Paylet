import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { User } from "../lib/api";
import Profile from "./Profile";

type Expense = {
  id: string;
  amount: string;
  currency: string;
  purpose: string;
  category: string;
  date: string;
  version: number;
  voidedAt: string | null;
};

type Summary = {
  expenses: Expense[];
  totals: {
    currency: string;
    amount: string;
  }[];
  count: number;
};

type Choices = {
  currencies: string[];
  categories: string[];
};

type Revision = {
  id: string;
  action: string;
  createdAt: string;
  snapshot: Expense;
};

type Props = {
  user: User;
  onUserChange: (user: User) => void;
  onLogout: () => Promise<void>;
  logoutBusy: boolean;
  logoutError: string;
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

function emptyExpense(user: User): Expense {
  return {
    id: crypto.randomUUID(),
    amount: "",
    currency: user.defaultCurrency,
    purpose: "",
    category: "Other",
    date: todayIn(user.timezone),
    version: 1,
    voidedAt: null,
  };
}

export default function Dashboard({
  user,
  onUserChange,
  onLogout,
  logoutBusy,
  logoutError,
}: Props) {
  const [showProfile, setShowProfile] = useState(false);

  const [month, setMonth] = useState(
    () => todayIn(user.timezone).slice(0, 7)
  );

  const [refresh, setRefresh] = useState(0);

  const [loaded, setLoaded] = useState<{
    month: string;
    refresh: number;
    summary: Summary;
    choices: Choices;
  } | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState<Expense | null>(null);
  const [editing, setEditing] = useState(false);
  const [expenseType, setExpenseType] = useState("personal");

  const [history, setHistory] = useState<Revision[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      api<Summary>(
        `/expenses?month=${encodeURIComponent(month)}`,
        { signal: controller.signal }
      ),
      api<Choices>("/expenses/options", {
        signal: controller.signal,
      }),
    ])
      .then(([summary, choices]) => {
        if (controller.signal.aborted) return;

        setLoaded({
          month,
          refresh,
          summary,
          choices,
        });

        setError("");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load expenses."
        );
      });

    return () => controller.abort();
  }, [month, refresh]);

  const ready =
    loaded?.month === month &&
    loaded.refresh === refresh;

  const disabled = busy || logoutBusy;

  function updateDraft(field: keyof Expense, value: string) {
    setDraft((current) =>
      current
        ? { ...current, [field]: value }
        : current
    );
  }

  function beginAdd() {
    setDraft(emptyExpense(user));
    setEditing(false);
    setExpenseType("personal");
    setError("");
    setNotice("");
  }

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || busy || expenseType !== "personal") {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    const body = {
      amount: draft.amount,
      currency: draft.currency,
      purpose: draft.purpose,
      category: draft.category,
      date: draft.date,
      ...(editing
        ? { version: draft.version }
        : { id: draft.id }),
    };

    try {
      await api(
        editing
          ? `/expenses/${draft.id}`
          : "/expenses",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(body),
        }
      );

      setMonth(draft.date.slice(0, 7));
      setDraft(null);
      setHistory(null);
      setRefresh((value) => value + 1);

      setNotice(
        editing ? "Expense updated." : "Expense added."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save."
      );
    } finally {
      setBusy(false);
    }
  }

  async function voidExpense(expense: Expense) {
    const confirmed = window.confirm(
      "Void this expense? It will be excluded from monthly totals, but its history will remain."
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api(`/expenses/${expense.id}/void`, {
        method: "POST",
        body: JSON.stringify({
          version: expense.version,
        }),
      });

      setHistory(null);
      setRefresh((value) => value + 1);
      setNotice("Expense voided.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to void expense."
      );
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(expense: Expense) {
    setBusy(true);
    setError("");

    try {
      const result = await api<{
        history: Revision[];
      }>(`/expenses/${expense.id}/history`);

      setHistory(result.history);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load history."
      );
    } finally {
      setBusy(false);
    }
  }

  if (showProfile) {
    return (
      <>
        <div className="dashboard-back">
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setShowProfile(false);
              setRefresh((value) => value + 1);
            }}
          >
            ← Dashboard
          </button>
        </div>

        <Profile
          onUserChange={onUserChange}
          onLogout={onLogout}
          logoutBusy={logoutBusy}
          logoutError={logoutError}
        />
      </>
    );
  }

  return (
    <main className="signed-in-page">
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Paylet</span>
        </a>

        <button
          type="button"
          className="button button-outline"
          disabled={disabled}
          onClick={() => setShowProfile(true)}
        >
          My profile
        </button>
      </header>

      <section className="dashboard-page">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">
              YOUR PERSONAL EXPENSES
            </span>

            <h1>Hello, {user.displayName}.</h1>

            <p className="form-description">
              See where your spending goes.
            </p>
          </div>

          <button
            type="button"
            className="button button-green"
            disabled={
              disabled ||
              Boolean(draft) ||
              !ready
            }
            onClick={beginAdd}
          >
            + Add expense
          </button>
        </div>

        <div className="month-toolbar">
          <div>
            <label htmlFor="expense-month">Month</label>

            <input
              id="expense-month"
              type="month"
              min="1900-01"
              max="2199-12"
              value={month}
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value) {
                  setMonth(event.target.value);
                  setHistory(null);
                  setError("");
                }
              }}
            />
          </div>

          <button
            type="button"
            className="button button-outline"
            disabled={disabled}
            onClick={() => {
              setError("");
              setRefresh((value) => value + 1);
            }}
          >
            Reload
          </button>
        </div>

        {(error || logoutError) && (
          <p className="error-message" role="alert">
            {error || logoutError}
          </p>
        )}

        {notice && (
          <p className="google-success" role="status">
            {notice}
          </p>
        )}

        {!ready && !error && (
          <p role="status">Loading expenses…</p>
        )}

        {ready && loaded && (
          <div className="summary-grid">
            <article className="summary-card">
              <p>Active expenses</p>
              <strong>{loaded.summary.count}</strong>
            </article>

            {loaded.summary.totals.length > 0 ? (
              loaded.summary.totals.map((total) => (
                <article
                  className="summary-card"
                  key={total.currency}
                >
                  <p>
                    Monthly spending · {total.currency}
                  </p>
                  <strong>{total.amount}</strong>
                </article>
              ))
            ) : (
              <article className="summary-card">
                <p>
                  Monthly spending · {user.defaultCurrency}
                </p>
                <strong>0</strong>
              </article>
            )}
          </div>
        )}

        {draft && (
          <section className="profile-panel expense-editor">
            <h2>
              {editing ? "Edit expense" : "Add expense"}
            </h2>

            <form onSubmit={saveExpense}>
              <fieldset disabled={disabled}>
                {!editing && (
                  <>
                    <label htmlFor="expense-type">
                      Expense type
                    </label>

                    <select
                      id="expense-type"
                      value={expenseType}
                      onChange={(event) =>
                        setExpenseType(event.target.value)
                      }
                    >
                      <option value="personal">
                        Personal expense
                      </option>

                      <option value="shared">
                        Split with others
                      </option>
                    </select>
                  </>
                )}

                {expenseType === "shared" ? (
                  <p className="pending-message">
                    Shared bills will be enabled in the
                    groups-and-splits step. This entry will
                    not be saved as a personal expense.
                  </p>
                ) : (
                  <>
                    <div className="profile-fields-row">
                      <div>
                        <label htmlFor="expense-amount">
                          Amount
                        </label>

                        <input
                          id="expense-amount"
                          inputMode="decimal"
                          placeholder="100.00"
                          value={draft.amount}
                          onChange={(event) =>
                            updateDraft(
                              "amount",
                              event.target.value
                            )
                          }
                          pattern="[0-9]{1,12}(\.[0-9]{1,4})?"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="expense-currency">
                          Currency
                        </label>

                        <select
                          id="expense-currency"
                          value={draft.currency}
                          onChange={(event) =>
                            updateDraft(
                              "currency",
                              event.target.value
                            )
                          }
                        >
                          {Array.from(
                            new Set([
                              draft.currency,
                              ...(loaded?.choices.currencies ?? []),
                            ])
                          )
                            .sort()
                            .map((currency) => (
                              <option
                                key={currency}
                                value={currency}
                              >
                                {currency}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <label htmlFor="expense-purpose">
                      Purpose
                    </label>

                    <input
                      id="expense-purpose"
                      placeholder="Lunch, groceries, bus ticket…"
                      value={draft.purpose}
                      maxLength={200}
                      onChange={(event) =>
                        updateDraft(
                          "purpose",
                          event.target.value
                        )
                      }
                      required
                    />

                    <div className="profile-fields-row">
                      <div>
                        <label htmlFor="expense-category">
                          Category
                        </label>

                        <select
                          id="expense-category"
                          value={draft.category}
                          onChange={(event) =>
                            updateDraft(
                              "category",
                              event.target.value
                            )
                          }
                        >
                          {Array.from(
                            new Set([
                              draft.category,
                              ...(loaded?.choices.categories ?? []),
                            ])
                          ).map((category) => (
                            <option
                              key={category}
                              value={category}
                            >
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="expense-date">
                          Date
                        </label>

                        <input
                          id="expense-date"
                          type="date"
                          min="1900-01-01"
                          max="2199-12-31"
                          value={draft.date}
                          onChange={(event) =>
                            updateDraft(
                              "date",
                              event.target.value
                            )
                          }
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="profile-actions">
                  {expenseType === "personal" && (
                    <button
                      className="button button-green"
                      type="submit"
                    >
                      {busy ? "Saving…" : "Save expense"}
                    </button>
                  )}

                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => setDraft(null)}
                  >
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        )}

        {ready && loaded && (
          <section className="expense-list">
            <h2>This month’s activity</h2>

            {loaded.summary.expenses.length === 0 && (
              <div className="profile-panel">
                <h3>No expenses recorded</h3>
                <p>
                  Add your first personal expense to get started.
                </p>
              </div>
            )}

            {loaded.summary.expenses.map((expense) => (
              <article
                className={`expense-row ${
                  expense.voidedAt ? "is-void" : ""
                }`}
                key={expense.id}
              >
                <div>
                  <h3>{expense.purpose}</h3>

                  <p>
                    {expense.category} · {expense.date}
                  </p>

                  {expense.voidedAt && (
                    <span className="void-label">
                      Voided · excluded from totals
                    </span>
                  )}
                </div>

                <div className="expense-row-right">
                  <strong>
                    {expense.currency} {expense.amount}
                  </strong>

                  <div className="expense-row-actions">
                    {!expense.voidedAt && (
                      <>
                        <button
                          type="button"
                          className="button button-blue"
                          disabled={disabled || Boolean(draft)}
                          onClick={() => {
                            setDraft({ ...expense });
                            setEditing(true);
                            setExpenseType("personal");
                            setError("");
                            setNotice("");

                            window.scrollTo({
                              top: 0,
                              behavior: "auto",
                            });
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="button button-danger"
                          disabled={disabled || Boolean(draft)}
                          onClick={() =>
                            void voidExpense(expense)
                          }
                        >
                          Void
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="button button-outline"
                      disabled={disabled}
                      onClick={() =>
                        void openHistory(expense)
                      }
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
            <h2>Expense history</h2>

            {history.map((revision) => (
              <article key={revision.id}>
                <strong>{revision.action}</strong>

                <p>
                  {new Date(
                    revision.createdAt
                  ).toLocaleString(undefined, {
                    timeZone: user.timezone,
                  })}
                </p>

                <p>
                  {revision.snapshot.purpose} ·{" "}
                  {revision.snapshot.currency}{" "}
                  {revision.snapshot.amount}
                </p>

                <p>
                  {revision.snapshot.category} ·{" "}
                  {revision.snapshot.date}
                </p>
              </article>
            ))}

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