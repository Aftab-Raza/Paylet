import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { User } from "../lib/api";
import AiQuickAdd from "./AiQuickAdd";
import Profile from "./Profile";
import People from "./People";
import LoanSummary from "./LoanSummary";
import Reports from "./Reports";
import Groups from "./Groups";
import SettlementNotifications from "./SettlementNotifications";
import { useGroupInvitations } from "../hooks/useGroupInvitations";
import "./groups.css";
import { ArrowDownLeft, ArrowUpRight, BarChart3, CheckCircle2, ChevronLeft, ChevronRight, CircleSlash, History, LayoutDashboard, Pencil, Plus, ReceiptText, RefreshCw, Search, Sparkles, UserRound, UserPlus, Users, Wallet } from "lucide-react";
import Modal from "./Modal";
import InvitePaylet from "./InvitePaylet";

type Expense = {
    source?: "PERSONAL" | "SHARED";
    groupId?: string;
    billId?: string;
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
    const [showAi, setShowAi] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showPeople, setShowPeople] = useState(false);
    const [showReports, setShowReports] = useState(false);
    const [showGroups, setShowGroups] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("");
    const [showVoided, setShowVoided] = useState(false);
    const [voidTarget, setVoidTarget] = useState<Expense | null>(null);
    const [groupToOpen, setGroupToOpen] = useState<string | null>(null);
    const groupInvites = useGroupInvitations();

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
    const visibleExpenses = (loaded?.summary.expenses ?? []).filter((expense) =>
        (showVoided || !expense.voidedAt) && (!category || expense.category === category) &&
        `${expense.purpose} ${expense.category} ${expense.amount} ${expense.currency}`.toLowerCase().includes(query.trim().toLowerCase())
    );

    function changeMonth(value: string) {
        setMonth(value);
        setHistory(null);
        setError("");
    }

    function shiftMonth(offset: number) {
        const [year, monthNumber] = month.split("-").map(Number);
        const next = new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
        if (next >= "1900-01" && next <= "2199-12") changeMonth(next);
    }

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
            setVoidTarget(null);
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
    if (showAi) return <AiQuickAdd onBack={() => { setShowAi(false); setRefresh((value) => value + 1); }} />;

    if (showGroups) {
        return (
            <Groups
                initialGroupId={groupToOpen}
                onBack={() => {
                    setShowGroups(false);
                    setGroupToOpen(null);
                    setRefresh((value) => value + 1);
                }}
            />
        );
    }
    if (showReports) {
        return (
            <Reports
                timezone={user.timezone}
                onBack={() => setShowReports(false)}
            />
        );
    }
    if (showPeople) {
        return (
            <People
                onBack={() => {
                    setShowPeople(false);
                    setRefresh((value) => value + 1);
                }}
            />
        );
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
        <main className="signed-in-page home-page">
            <header className="app-header">
                <a className="brand" href="/">
                    <span className="brand-mark">P</span>
                    <span>Paylet</span>
                </a>

                <div className="header-actions">
                    <span className="nav-current"><LayoutDashboard size={18} /> Overview</span>
                    <button type="button" className="button button-purple" disabled={disabled || Boolean(draft)} onClick={() => setShowAi(true)}><Sparkles size={18} /> AI Quick Add</button>
                    <button
                        type="button"
                        className="button button-blue pg-nav"
                        disabled={busy || Boolean(draft)}
                        onClick={() => setShowGroups(true)}
                    >
                        <Users size={18} /> Groups
                        {groupInvites.invitations.length > 0 && (
                            <span className="pg-badge" aria-label={`${groupInvites.invitations.length} pending invitations`}>
                                {groupInvites.invitations.length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        className="button button-outline"
                        disabled={disabled || Boolean(draft)}
                        onClick={() => setShowReports(true)}
                    >
                        <BarChart3 size={18} /> Reports
                    </button>
                    <button
                        type="button"
                        className="button button-blue"
                        disabled={disabled || Boolean(draft)}
                        onClick={() => setShowPeople(true)}
                    >
                        <UserRound size={18} /> People
                    </button>

                    <button
                        type="button"
                        className="button button-outline"
                        disabled={disabled || Boolean(draft)}
                        onClick={() => setShowProfile(true)}
                    >
                        <span className="nav-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span> My profile
                    </button>
                </div>
            </header>

            <div aria-live="polite">
                {groupInvites.invitations.length > 0 && (
                    <div className="pg-notification">
                        <span>You have {groupInvites.invitations.length} pending group invitation(s).</span>
                        <button type="button" className="button button-blue"
                            disabled={disabled || Boolean(draft)} onClick={() => setShowGroups(true)}>
                            View invitations
                        </button>
                    </div>
                )}
                {groupInvites.error && <p className="pg-muted">Group notifications unavailable. Open Groups to retry.</p>}
            </div>

            <SettlementNotifications disabled={disabled || Boolean(draft)} onOpen={(groupId) => { setGroupToOpen(groupId); setShowGroups(true); }}/>

            <section className="dashboard-page">
                <div className="dashboard-heading">
                    <div>
                        <span className="eyebrow">
                            YOUR MONEY, AT A GLANCE
                        </span>

                        <h1>Hello, {user.displayName}.</h1>

                        <p className="form-description">
                            A little clarity for your everyday spending.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="button button-primary"
                        disabled={
                            disabled ||
                            !ready
                        }
                        onClick={beginAdd}
                    >
                        <Plus size={20} /> Add expense
                    </button>
                </div>

                <nav className="quick-actions" aria-label="Quick actions">
                    <button onClick={beginAdd} disabled={disabled || !ready}><span className="action-symbol orange"><Plus /></span><span>Add expense</span></button>
                    <button onClick={() => setShowAi(true)} disabled={disabled}><span className="action-symbol purple"><Sparkles /></span><span>AI Quick Add</span></button>
                    <button onClick={() => setShowGroups(true)} disabled={disabled}><span className="action-symbol blue"><Users /></span><span>Split a bill</span></button>
                    <button onClick={() => setShowPeople(true)} disabled={disabled}><span className="action-symbol green"><ArrowDownLeft /></span><span>Lend & borrow</span></button>
                    <button onClick={() => setShowReports(true)} disabled={disabled}><span className="action-symbol blue"><BarChart3 /></span><span>Reports</span></button>
                    <button onClick={() => setShowInvite(true)} disabled={disabled}><span className="action-symbol purple"><UserPlus /></span><span>Invite a friend</span></button>
                </nav>

                <div className="month-toolbar">
                    <button type="button" className="button button-outline icon-button" title="Previous month" aria-label="Previous month" disabled={disabled || month === "1900-01"} onClick={() => shiftMonth(-1)}><ChevronLeft size={20} /></button>
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
                                    changeMonth(event.target.value);
                                }
                            }}
                        />
                    </div>
                    <button type="button" className="button button-outline icon-button" title="Next month" aria-label="Next month" disabled={disabled || month === "2199-12"} onClick={() => shiftMonth(1)}><ChevronRight size={20} /></button>

                    <button
                        type="button"
                        className="button button-outline"
                        disabled={disabled}
                        onClick={() => {
                            setError("");
                            setRefresh((value) => value + 1);
                        }}
                    >
                        <RefreshCw size={17} /> Refresh
                    </button>
                </div>

                {(error || logoutError) && !draft && !voidTarget && (
                    <p className="error-message" role="alert">
                        {error || logoutError}
                    </p>
                )}

                {notice && (
                    <p className="google-success" role="status">
                        <CheckCircle2 size={18} /> {notice}
                    </p>
                )}
                {!ready && !error && (
                    <p role="status">Loading expenses…</p>
                )}

                {ready && loaded && (
                    <div className="summary-grid">
                        <article className="summary-card">
                            <p><ReceiptText size={18} /> Active expenses</p>
                            <strong>{loaded.summary.count}</strong>
                        </article>

                        {loaded.summary.totals.length > 0 ? (
                            loaded.summary.totals.map((total) => (
                                <article
                                    className="summary-card"
                                    key={total.currency}
                                >
                                    <p>
                                        <Wallet size={18} /> Monthly spending · {total.currency}
                                    </p>
                                    <strong>{total.amount}</strong>
                                </article>
                            ))
                        ) : (
                            <article className="summary-card">
                                <p>
                                    <Wallet size={18} /> Monthly spending · {user.defaultCurrency}
                                </p>
                                <strong>0</strong>
                            </article>
                        )}
                    </div>
                )}

                {draft && (
                    <Modal title={editing ? "Edit expense" : "Add expense"} busy={disabled} onClose={() => { setDraft(null); setError(""); }}>
                        {error && <p className="error-message" role="alert">{error}</p>}

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
                                    <div className="pending-message">
                                        <p>Choose a group and add the shared bill there. Only your share counts toward your monthly spending.</p>
                                        <button type="button" className="button button-blue" onClick={() => { setDraft(null); setShowGroups(true); }}>Open groups</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="profile-fields-row">
                                            <div>
                                                <label htmlFor="expense-amount">
                                                    Amount
                                                </label>

                                                <input
                                                    id="expense-amount"
                                                    data-autofocus
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
                                            <CheckCircle2 size={18} /> {busy ? "Saving…" : "Save expense"}
                                        </button>
                                    )}

                                    <button
                                        className="button button-outline"
                                        type="button"
                                        onClick={() => { setDraft(null); setError(""); }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </fieldset>
                        </form>
                    </Modal>
                )}

                {ready && loaded && (
                    <section className="expense-list">
                        <div className="activity-heading"><h2><ReceiptText size={20} /> This month's activity</h2><span className="activity-count">{visibleExpenses.length} {visibleExpenses.length === 1 ? "transaction" : "transactions"}</span></div>
                        <div className="activity-filters">
                            <div className="search-field"><Search size={18} /><input aria-label="Search expenses" placeholder="Search expenses..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
                            <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{Array.from(new Set(loaded.summary.expenses.map((expense) => expense.category))).sort().map((item) => <option key={item}>{item}</option>)}</select>
                            <label className="people-checkbox"><input type="checkbox" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} /> Show voided</label>
                        </div>

                        {loaded.summary.expenses.length === 0 && (
                            <div className="empty-activity">
                                <ReceiptText size={36} />
                                <h3>No expenses recorded</h3>
                                <p>
                                    Add your first personal expense to get started.
                                </p>
                                <button className="button button-primary" disabled={disabled} onClick={beginAdd}><Plus size={18} /> Add expense</button>
                            </div>
                        )}

                        {loaded.summary.expenses.length > 0 && visibleExpenses.length === 0 && <div className="empty-activity"><Search size={28} /><h3>No matching expenses</h3><button className="button button-outline" onClick={() => { setQuery(""); setCategory(""); setShowVoided(true); }}>Clear filters</button></div>}

                        {visibleExpenses.map((expense) => (
                            <article
                                className={`expense-row ${expense.voidedAt ? "is-void" : ""
                                    }`}
                                key={expense.id}
                            >
                                <div className="transaction-detail">
                                    <span className={`transaction-icon ${expense.source === "SHARED" ? "purple" : "orange"}`} aria-hidden="true">{expense.source === "SHARED" ? <Users size={20} /> : <ArrowUpRight size={20} />}</span>
                                    <div>
                                    <h3>{expense.purpose}</h3>
                                    {expense.source === "SHARED" && <span className="pg-tag">Shared · your portion</span>}

                                    <p>
                                        {expense.category} · {expense.date}
                                    </p>

                                    {expense.voidedAt && (
                                        <span className="void-label">
                                            Voided · excluded from totals
                                        </span>
                                    )}
                                    </div>
                                </div>

                                <div className="expense-row-right">
                                    <strong>
                                        {expense.currency} {expense.amount}
                                    </strong>

                                    <div className="expense-row-actions">
                                        {!expense.voidedAt && expense.source !== "SHARED" && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="button button-blue"
                                                    disabled={disabled}
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
                                                    <Pencil size={15} /> Edit
                                                </button>

                                                <button
                                                    type="button"
                                                    className="button button-danger"
                                                    disabled={disabled || Boolean(draft)}
                                                    onClick={() =>
                                                        setVoidTarget(expense)
                                                    }
                                                >
                                                    <CircleSlash size={15} /> Void
                                                </button>
                                            </>
                                        )}

                                        {expense.source === "SHARED" ? (
                                            <button type="button" className="button button-outline" disabled={disabled || Boolean(draft)} onClick={() => { setGroupToOpen(expense.groupId ?? null); setShowGroups(true); }}><Users size={15} /> View in Groups</button>
                                        ) : (
                                            <button type="button" className="button button-outline" disabled={disabled} onClick={() => void openHistory(expense)}><History size={15} /> History</button>
                                        )}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </section>
                )}

                {history && (
                    <Modal title="Expense history" onClose={() => setHistory(null)}>
                    <div className="expense-history">

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
                    </div>
                    </Modal>
                )}
                <LoanSummary refreshKey={refresh} />
                {showInvite && <InvitePaylet onClose={() => setShowInvite(false)} />}
                {voidTarget && <Modal title="Void this expense?" busy={busy} onClose={() => { setVoidTarget(null); setError(""); }}>
                    <p><strong>{voidTarget.purpose}</strong> · {voidTarget.currency} {voidTarget.amount}</p>
                    <p className="form-description">This expense will be excluded from your totals. Its history will remain available.</p>
                    {error && <p className="error-message" role="alert">{error}</p>}
                    <div className="profile-actions"><button className="button button-danger" disabled={busy} onClick={() => void voidExpense(voidTarget)}><CircleSlash size={18} /> {busy ? "Voiding..." : "Void expense"}</button><button className="button button-outline" disabled={busy} onClick={() => { setVoidTarget(null); setError(""); }}>Keep expense</button></div>
                </Modal>}
            </section>
        </main>
    );
}
