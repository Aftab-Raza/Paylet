import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";

type CurrencyTotal = {
  currency: string;
  minorUnit: number;
  totalLent: string;
  repaymentsReceived: string;
  owedToYou: string;
  totalBorrowed: string;
  repaymentsMade: string;
  youOwe: string;
};

type Props = {
  contactId?: string;
  refreshKey?: number;
};

type Result = {
  key: string;
  totals: CurrencyTotal[];
  error: string;
};

export default function LoanSummary({
  contactId,
  refreshKey = 0,
}: Props) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const path = contactId
    ? `/loans/summary?contactId=${encodeURIComponent(contactId)}`
    : "/loans/summary";

  const requestKey = `${path}:${refreshKey}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();

    api<{ totals: CurrencyTotal[] }>(path, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;

        setResult({
          key: requestKey,
          totals: data.totals,
          error: "",
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;

        setResult({
          key: requestKey,
          totals: [],
          error:
            err instanceof Error
              ? err.message
              : "Unable to load loan totals.",
        });
      });

    return () => controller.abort();
  }, [path, requestKey]);

  const current = result?.key === requestKey ? result : null;

  return (
    <section className="loan-summary-section">
      <div className="loan-summary-heading">
        <div>
          <h2>
            {contactId
              ? "Your totals with this person"
              : "Lending & borrowing"}
          </h2>

          <p>
            All recorded dates · Voided records excluded
          </p>
        </div>

        <button
          type="button"
          className="button button-outline"
          disabled={!current}
          onClick={() => setRetry((value) => value + 1)}
        >
          <RefreshCw size={17} /> Refresh totals
        </button>
      </div>

      {!current && (
        <p role="status">Loading loan totals…</p>
      )}

      {current?.error && (
        <p className="error-message" role="alert">
          {current.error}
        </p>
      )}

      {current && !current.error && current.totals.length === 0 && (
        <div className="profile-panel">
          <h3>No active loan records</h3>
          <p className="profile-member">
            Total lent: 0 · Total borrowed: 0.
            Currency totals appear after you record a loan.
          </p>
        </div>
      )}

      {current && !current.error && current.totals.map((total) => (
        <article
          className="currency-loan-summary"
          key={`${total.currency}:${total.minorUnit}`}
        >
          <span className="loan-currency-label">
            {total.currency}
          </span>

          <div className="loan-summary-grid">
                        <section className="loan-summary-card lent-summary">
              <p className="loan-summary-label"><ArrowDownLeft size={18} /> Owed to you</p>

              <strong className="loan-summary-value">
                {total.currency} {total.owedToYou}
              </strong>

              <p className="profile-member">
                Remaining amount after repayments.
              </p>

              <dl>
                <div>
                  <dt>Repayments received</dt>
                  <dd>
                    {total.currency} {total.repaymentsReceived}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="loan-summary-card borrowed-summary">
              <p className="loan-summary-label"><ArrowUpRight size={18} /> Total borrowed</p>
              <strong className="loan-summary-value">
                {total.currency} {total.totalBorrowed}
              </strong>

              <dl>
                <div>
                  <dt>You repaid</dt>
                  <dd>
                    {total.currency} {total.repaymentsMade}
                  </dd>
                </div>

                <div className="outstanding-line">
                  <dt>You still owe</dt>
                  <dd>
                    {total.currency} {total.youOwe}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </article>
      ))}
    </section>
  );
}
