import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Report = {
  month: string;
  name: string;
  count: number;

  currencies: {
    currency: string;
    minorUnit: number;
    total: string;
    count: number;
    categories: {
      category: string;
      count: number;
      total: string;
    }[];
  }[];

  expenses: {
    id: string;
    date: string;
    purpose: string;
    category: string;
    currency: string;
    amount: string;
  }[];
};

type Props = {
  timezone: string;
  onBack: () => void;
};

function currentMonth(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

// Quote CSV cells and neutralize spreadsheet formula-like text.
function csvCell(value: string | number): string {
  let text = String(value);

  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export default function Reports({ timezone, onBack }: Props) {
  const [month, setMonth] = useState(() => currentMonth(timezone));
  const [refresh, setRefresh] = useState(0);

  const [result, setResult] = useState<{
    key: string;
    report: Report | null;
    error: string;
  } | null>(null);

  const requestKey = `${month}:${refresh}`;

  useEffect(() => {
    const controller = new AbortController();

    api<Report>(
      `/reports/monthly?month=${encodeURIComponent(month)}`,
      { signal: controller.signal }
    )
      .then((report) => {
        if (controller.signal.aborted) return;

        setResult({
          key: requestKey,
          report,
          error: "",
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;

        setResult({
          key: requestKey,
          report: null,
          error: err instanceof Error
            ? err.message
            : "Unable to load report.",
        });
      });

    return () => controller.abort();
  }, [month, requestKey]);

  const current = result?.key === requestKey ? result : null;
  const report = current?.report;

  function downloadCsv() {
    if (!report) return;

    const rows: (string | number)[][] = [
      ["Date", "Purpose", "Category", "Currency", "Amount"],
      ...report.expenses.map((expense) => [
        expense.date,
        expense.purpose,
        expense.category,
        expense.currency,
        expense.amount,
      ]),
    ];

    const csv = rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `Paylet-expenses-${report.month}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="signed-in-page report-page">
      <header className="app-header report-controls">
        <span className="brand">
          <span className="brand-mark">P</span>
          <span>Paylet</span>
        </span>

        <button
          type="button"
          className="button button-outline"
          onClick={onBack}
        >
          ← Dashboard
        </button>
      </header>

      <section className="dashboard-page">
        <span className="eyebrow">PAYLET REPORTS</span>
        <h1>Monthly expense report</h1>

        <div className="report-toolbar report-controls">
          <div>
            <label htmlFor="report-month">Month</label>
            <input
              id="report-month"
              type="month"
              min="1900-01"
              max="2199-12"
              value={month}
              onChange={(event) => {
                if (event.target.value) {
                  setMonth(event.target.value);
                }
              }}
            />
          </div>

          <button
            type="button"
            className="button button-outline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Reload
          </button>

          <button
            type="button"
            className="button button-blue"
            disabled={!report || report.count === 0}
            onClick={downloadCsv}
          >
            Download CSV
          </button>

          <button
            type="button"
            className="button button-green"
            disabled={!report}
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>
        </div>

        {!current && <p role="status">Preparing report…</p>}

        {current?.error && (
          <p className="error-message" role="alert">
            {current.error}
          </p>
        )}

        {report && (
          <>
            <div className="report-description">
              <h2>{monthLabel(report.month)}</h2>
              <p>{report.name} · {report.count} active expenses</p>
              <p>
                Personal expenses only. Deleted/voided expenses,
                lending, borrowing, and repayments are excluded.
              </p>
            </div>

            {report.count === 0 && (
              <section className="profile-panel">
                <h2>No expenses for this month</h2>
                <p>Add an expense or choose another month.</p>
              </section>
            )}

            <div className="summary-grid">
              {report.currencies.map((group) => (
                <article
                  className="summary-card"
                  key={`${group.currency}:${group.minorUnit}`}
                >
                  <p>Total spending · {group.currency}</p>
                  <strong>{group.total}</strong>
                  <small>{group.count} expenses</small>
                </article>
              ))}
            </div>

            {report.currencies.map((group) => (
              <section
                className="profile-panel report-section"
                key={`${group.currency}:${group.minorUnit}`}
              >
                <h2>Category breakdown · {group.currency}</h2>

                <div className="report-table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th scope="col">Category</th>
                        <th scope="col">Entries</th>
                        <th scope="col">Amount</th>
                      </tr>
                    </thead>

                    <tbody>
                      {group.categories.map((category) => (
                        <tr key={category.category}>
                          <td>{category.category}</td>
                          <td>{category.count}</td>
                          <td>{category.total}</td>
                        </tr>
                      ))}
                    </tbody>

                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td>{group.count}</td>
                        <td>{group.total}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            ))}

            {report.count > 0 && (
              <section className="profile-panel report-section">
                <h2>Expense details</h2>

                <div className="report-table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Purpose</th>
                        <th scope="col">Category</th>
                        <th scope="col">Currency</th>
                        <th scope="col">Amount</th>
                      </tr>
                    </thead>

                    <tbody>
                      {report.expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>{dateLabel(expense.date)}</td>
                          <td>{expense.purpose}</td>
                          <td>{expense.category}</td>
                          <td>{expense.currency}</td>
                          <td>{expense.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}