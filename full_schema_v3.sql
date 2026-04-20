-- ================================================================
--  CLUB SAVINGS LEDGER — FULL SCHEMA V3
--  Supports: Member shares (multiples of 500), flat fines, 
--            FIFO allocation, club settings, and Transaction Management.
-- ================================================================

-- ─── CLEANUP ────────────────────────────────────────────────
DROP VIEW  IF EXISTS v_member_monthly_summary CASCADE;
DROP VIEW  IF EXISTS v_monthly_report         CASCADE;
DROP VIEW  IF EXISTS v_member_balance         CASCADE;
DROP TABLE IF EXISTS transaction_audit_log    CASCADE;
DROP TABLE IF EXISTS fines                    CASCADE;
DROP TABLE IF EXISTS transactions             CASCADE;
DROP TABLE IF EXISTS monthly_ledger           CASCADE;
DROP TABLE IF EXISTS members                  CASCADE;
DROP TABLE IF EXISTS club_settings            CASCADE;
DROP TYPE  IF EXISTS ledger_status            CASCADE;
DROP TYPE  IF EXISTS transaction_type         CASCADE;
DROP TYPE  IF EXISTS audit_action             CASCADE;

-- ─── ENUMS ──────────────────────────────────────────────────
CREATE TYPE ledger_status AS ENUM (
  'due',
  'partial',
  'paid_on_time',
  'paid_late',
  'advance'
);

CREATE TYPE transaction_type AS ENUM (
  'deposit',
  'advance',
  'fine_payment'
);

CREATE TYPE audit_action AS ENUM (
  'create',
  'edit',
  'delete'
);

-- ─── CLUB SETTINGS ──────────────────────────────────────────
CREATE TABLE club_settings (
  id                   INT           PRIMARY KEY DEFAULT 1,
  club_name            VARCHAR(100)  NOT NULL DEFAULT 'Saving Hub',
  savings_start_year   SMALLINT      NOT NULL DEFAULT 2025,
  savings_start_month  SMALLINT      NOT NULL DEFAULT 1 CHECK (savings_start_month BETWEEN 1 AND 12),
  base_share_value     DECIMAL(10,2) NOT NULL DEFAULT 500.00, -- 1 share = 500
  late_fine_amount     DECIMAL(10,2) NOT NULL DEFAULT 50.00,  -- Flat fine
  due_day              SMALLINT      NOT NULL DEFAULT 10,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO club_settings (id, club_name, savings_start_year, savings_start_month)
VALUES (1, 'Saving Hub', 2025, 1)
ON CONFLICT (id) DO NOTHING;

-- ─── MEMBERS ────────────────────────────────────────────────
CREATE TABLE members (
  id              SERIAL        PRIMARY KEY,
  name            VARCHAR(100)  NOT NULL,
  email           VARCHAR(150)  UNIQUE NOT NULL,
  phone           VARCHAR(20),
  shares          INT           NOT NULL DEFAULT 1 CHECK (shares > 0), -- Added Shares column
  joined_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
  credit_balance  DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (credit_balance >= 0),
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── MONTHLY LEDGER ──────────────────────────────────────────
CREATE TABLE monthly_ledger (
  id               SERIAL        PRIMARY KEY,
  member_id        INT           NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year             SMALLINT      NOT NULL CHECK (year >= 2000),
  month            SMALLINT      NOT NULL CHECK (month BETWEEN 1 AND 12),
  required_amount  DECIMAL(10,2) NOT NULL DEFAULT 500.00,
  fine_amount      DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  due_date         DATE          NOT NULL,
  status           ledger_status NOT NULL DEFAULT 'due',
  amount_paid      DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
  paid_date        DATE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_member_month UNIQUE (member_id, year, month)
);

-- ─── TRANSACTIONS ────────────────────────────────────────────
CREATE TABLE transactions (
  id               SERIAL           PRIMARY KEY,
  member_id        INT              NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  ledger_id        INT              REFERENCES monthly_ledger(id)   ON DELETE SET NULL,
  amount           DECIMAL(10,2)    NOT NULL CHECK (amount > 0),
  transaction_date DATE             NOT NULL DEFAULT CURRENT_DATE,
  type             transaction_type NOT NULL,
  notes            TEXT,
  is_deleted       BOOLEAN          NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by       TEXT,
  delete_reason    TEXT,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ─── FINES ──────────────────────────────────────────────────
CREATE TABLE fines (
  id              SERIAL        PRIMARY KEY,
  ledger_id       INT           NOT NULL REFERENCES monthly_ledger(id) ON DELETE CASCADE,
  member_id       INT           NOT NULL REFERENCES members(id)        ON DELETE CASCADE,
  transaction_id  INT           REFERENCES transactions(id)            ON DELETE SET NULL,
  amount          DECIMAL(10,2) NOT NULL DEFAULT 50.00 CHECK (amount > 0),
  is_paid         BOOLEAN       NOT NULL DEFAULT FALSE,
  paid_date       DATE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_fine_per_ledger UNIQUE (ledger_id)
);

-- ─── AUDIT LOG ───────────────────────────────────────────────
CREATE TABLE transaction_audit_log (
  id              SERIAL        PRIMARY KEY,
  transaction_id  INT           NOT NULL,
  action          audit_action  NOT NULL,
  performed_by    TEXT          NOT NULL,
  performed_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  before_member_id        INT,
  before_amount           DECIMAL(10,2),
  before_transaction_date DATE,
  before_type             transaction_type,
  before_notes            TEXT,
  after_member_id         INT,
  after_amount            DECIMAL(10,2),
  after_transaction_date  DATE,
  after_type              transaction_type,
  after_notes             TEXT,
  reason                  TEXT
);

-- ─── TRIGGERS ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER ts_club_settings BEFORE UPDATE ON club_settings FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER ts_members       BEFORE UPDATE ON members       FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER ts_ledger        BEFORE UPDATE ON monthly_ledger FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER ts_txn           BEFORE UPDATE ON transactions  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER ts_fines         BEFORE UPDATE ON fines         FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ─── CORE FUNCTIONS ──────────────────────────────────────────

-- 1. Generate Monthly Ledger
CREATE OR REPLACE FUNCTION generate_monthly_ledger(p_year INT, p_month INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count        INT;
  v_start_year   SMALLINT;
  v_start_month  SMALLINT;
  v_base_deposit DECIMAL(10,2);
  v_fine         DECIMAL(10,2);
  v_due_day      SMALLINT;
  v_settings     RECORD;
BEGIN
  SELECT * INTO v_settings FROM club_settings WHERE id = 1;
  v_start_year   := v_settings.savings_start_year;
  v_start_month  := v_settings.savings_start_month;
  v_base_deposit := v_settings.base_share_value;
  v_fine         := v_settings.late_fine_amount;
  v_due_day      := v_settings.due_day;

  IF (p_year < v_start_year) OR (p_year = v_start_year AND p_month < v_start_month) THEN
    RETURN 0;
  END IF;

  INSERT INTO monthly_ledger
    (member_id, year, month, required_amount, fine_amount, due_date, status)
  SELECT
    id,
    p_year::SMALLINT,
    p_month::SMALLINT,
    shares * v_base_deposit, -- Required amount = shares * 500
    v_fine,                  -- Flat fine
    MAKE_DATE(p_year, p_month, v_due_day),
    'due'
  FROM members
  WHERE is_active = TRUE
  ON CONFLICT (member_id, year, month) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 2. Recalculate Member Ledger
CREATE OR REPLACE FUNCTION recalculate_member_ledger(p_member_id INT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_txn           RECORD;
  v_remaining     DECIMAL;
  v_ledger        RECORD;
  v_total_owed    DECIMAL;
  v_still_needed  DECIMAL;
  v_payment       DECIMAL;
  v_fine_exists   BOOLEAN;
  v_future_year   SMALLINT;
  v_future_month  SMALLINT;
  v_new_ledger_id INT;
  v_shares        INT;
  v_start_year    SMALLINT;
  v_start_month   SMALLINT;
  v_base_deposit  DECIMAL(10,2);
  v_fine_amt      DECIMAL(10,2);
  v_due_day       SMALLINT;
  v_required      DECIMAL(10,2);
  v_settings      RECORD;
  v_running_credit DECIMAL(10,2) := 0;
BEGIN
  -- Load settings and member info
  SELECT shares INTO v_shares FROM members WHERE id = p_member_id;
  SELECT * INTO v_settings FROM club_settings WHERE id = 1;
  v_start_year   := v_settings.savings_start_year;
  v_start_month  := v_settings.savings_start_month;
  v_base_deposit := v_settings.base_share_value;
  v_fine_amt     := v_settings.late_fine_amount;
  v_due_day      := v_settings.due_day;

  v_required := v_shares * v_base_deposit;

  -- Reset
  UPDATE monthly_ledger SET status = 'due', amount_paid = 0, paid_date = NULL WHERE member_id = p_member_id;
  UPDATE fines SET is_paid = FALSE, paid_date = NULL, transaction_id = NULL WHERE member_id = p_member_id;
  UPDATE members SET credit_balance = 0 WHERE id = p_member_id;

  -- Replay
  v_running_credit := 0;
  FOR v_txn IN
    SELECT id, amount, transaction_date, type FROM transactions
    WHERE member_id = p_member_id AND is_deleted = FALSE ORDER BY transaction_date ASC, id ASC
  LOOP
    v_remaining := v_txn.amount + v_running_credit;
    v_running_credit := 0;

    FOR v_ledger IN
      SELECT ml.id, ml.year, ml.month, ml.required_amount, ml.due_date, ml.status, ml.amount_paid,
             COALESCE(f.amount, v_fine_amt) AS fine_charge
      FROM monthly_ledger ml
      LEFT JOIN fines f ON f.ledger_id = ml.id
      WHERE ml.member_id = p_member_id AND ml.status IN ('due', 'partial')
        AND (ml.year > v_start_year OR (ml.year = v_start_year AND ml.month >= v_start_month))
      ORDER BY ml.year ASC, ml.month ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_fine_exists  := v_txn.transaction_date > v_ledger.due_date;
      v_total_owed   := v_ledger.required_amount + CASE WHEN v_fine_exists THEN v_ledger.fine_charge ELSE 0 END;
      v_still_needed := v_total_owed - v_ledger.amount_paid;
      v_payment      := LEAST(v_remaining, v_still_needed);

      IF v_fine_exists THEN
        INSERT INTO fines (ledger_id, member_id, amount) VALUES (v_ledger.id, p_member_id, v_ledger.fine_charge) ON CONFLICT (ledger_id) DO NOTHING;
      END IF;

      UPDATE monthly_ledger
      SET amount_paid = amount_paid + v_payment,
          status = CASE WHEN (amount_paid + v_payment) >= v_total_owed THEN CASE WHEN v_txn.transaction_date > due_date THEN 'paid_late'::ledger_status ELSE 'paid_on_time'::ledger_status END ELSE 'partial'::ledger_status END,
          paid_date = CASE WHEN (amount_paid + v_payment) >= v_total_owed THEN v_txn.transaction_date ELSE NULL END
      WHERE id = v_ledger.id;

      IF (v_ledger.amount_paid + v_payment) >= v_total_owed THEN
        UPDATE fines SET is_paid = TRUE, paid_date = v_txn.transaction_date, transaction_id = v_txn.id WHERE ledger_id = v_ledger.id AND is_paid = FALSE;
      END IF;
      v_remaining := v_remaining - v_payment;
    END LOOP;

    -- Advance
    WHILE v_remaining >= v_required LOOP
      SELECT year, month INTO v_future_year, v_future_month FROM monthly_ledger WHERE member_id = p_member_id ORDER BY year DESC, month DESC LIMIT 1;
      IF NOT FOUND THEN
        v_future_year  := EXTRACT(YEAR  FROM v_txn.transaction_date)::SMALLINT;
        v_future_month := EXTRACT(MONTH FROM v_txn.transaction_date)::SMALLINT;
      ELSE
        IF v_future_month = 12 THEN v_future_year := v_future_year + 1; v_future_month := 1;
        ELSE v_future_month := v_future_month + 1; END IF;
      END IF;

      IF (v_future_year < v_start_year) OR (v_future_year = v_start_year AND v_future_month < v_start_month) THEN
        UPDATE members SET credit_balance = credit_balance + v_remaining WHERE id = p_member_id;
        v_remaining := 0; EXIT;
      END IF;

      INSERT INTO monthly_ledger (member_id, year, month, required_amount, fine_amount, due_date, status, amount_paid, paid_date)
      VALUES (p_member_id, v_future_year, v_future_month, v_required, v_fine_amt, MAKE_DATE(v_future_year::INT, v_future_month::INT, v_due_day), 'advance', v_required, v_txn.transaction_date)
      ON CONFLICT (member_id, year, month) DO UPDATE SET status = 'advance', amount_paid = v_required, paid_date = v_txn.transaction_date;

      v_remaining := v_remaining - v_required;
    END LOOP;

    IF v_remaining > 0 THEN
      v_running_credit := v_remaining;
    END IF;
  END LOOP;

  UPDATE members SET credit_balance = v_running_credit WHERE id = p_member_id;
END;
$$;

-- 3. Allocate Deposit
CREATE OR REPLACE FUNCTION allocate_deposit(
  p_member_id        INT,
  p_amount           DECIMAL,
  p_transaction_date DATE,
  p_notes            TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_txn_id      INT;
  v_before      JSONB;
  v_after       JSONB;
  v_start_year  SMALLINT;
  v_start_month SMALLINT;
  v_base_deposit DECIMAL(10,2);
  v_fine_amt    DECIMAL(10,2);
  v_due_day     SMALLINT;
  v_shares      INT;
  v_cur_year    SMALLINT;
  v_cur_month   SMALLINT;
  v_settings    RECORD;
BEGIN
  SELECT shares INTO v_shares FROM members WHERE id = p_member_id;
  SELECT * INTO v_settings FROM club_settings WHERE id = 1;
  v_start_year   := v_settings.savings_start_year;
  v_start_month  := v_settings.savings_start_month;
  v_base_deposit := v_settings.base_share_value;
  v_fine_amt     := v_settings.late_fine_amount;
  v_due_day      := v_settings.due_day;

  v_cur_year  := EXTRACT(YEAR  FROM p_transaction_date)::SMALLINT;
  v_cur_month := EXTRACT(MONTH FROM p_transaction_date)::SMALLINT;

  IF (v_cur_year > v_start_year) OR (v_cur_year = v_start_year AND v_cur_month >= v_start_month) THEN
    INSERT INTO monthly_ledger (member_id, year, month, required_amount, fine_amount, due_date, status)
    VALUES (p_member_id, v_cur_year, v_cur_month, v_shares * v_base_deposit, v_fine_amt, MAKE_DATE(v_cur_year::INT, v_cur_month::INT, v_due_day), 'due')
    ON CONFLICT (member_id, year, month) DO NOTHING;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('month', month, 'year', year, 'status', status, 'amount_paid', amount_paid)) INTO v_before FROM monthly_ledger WHERE member_id = p_member_id;
  INSERT INTO transactions (member_id, amount, transaction_date, type, notes) VALUES (p_member_id, p_amount, p_transaction_date, 'deposit', p_notes) RETURNING id INTO v_txn_id;
  PERFORM recalculate_member_ledger(p_member_id);
  SELECT jsonb_agg(jsonb_build_object('month', month, 'year', year, 'status', status, 'amount_paid', amount_paid)) INTO v_after FROM monthly_ledger WHERE member_id = p_member_id;

  RETURN jsonb_build_object('transaction_id', v_txn_id, 'member_id', p_member_id, 'amount', p_amount, 'ledger_before', v_before, 'ledger_after', v_after);
END;
$$;

-- 4. Update Transaction
-- Used by Admin Panel to modify existing transaction details.
-- Automatically recalculates affected member's ledger.
CREATE OR REPLACE FUNCTION update_transaction(
  p_id               INT,
  p_amount           DECIMAL,
  p_transaction_date DATE,
  p_notes            TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id INT;
BEGIN
  -- Get member_id before update
  SELECT member_id INTO v_member_id FROM transactions WHERE id = p_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- Update the transaction
  UPDATE transactions
  SET amount = p_amount,
      transaction_date = p_transaction_date,
      notes = p_notes,
      updated_at = NOW()
  WHERE id = p_id;

  -- Recalculate
  PERFORM recalculate_member_ledger(v_member_id);
END;
$$;

-- 5. Delete Transaction (Soft Delete)
-- Marks a transaction as deleted and triggers ledger recalculation.
CREATE OR REPLACE FUNCTION delete_transaction(
  p_id           INT,
  p_reason       TEXT DEFAULT NULL,
  p_deleted_by   TEXT DEFAULT 'admin'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id INT;
BEGIN
  SELECT member_id INTO v_member_id FROM transactions WHERE id = p_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  UPDATE transactions
  SET is_deleted = TRUE,
      deleted_at = NOW(),
      deleted_by = p_deleted_by,
      delete_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_id;

  PERFORM recalculate_member_ledger(v_member_id);
END;
$$;

-- ─── VIEWS ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_member_monthly_summary AS
SELECT
  m.id                               AS member_id,
  m.name,
  m.shares,
  ml.year,
  ml.month,
  ml.required_amount,
  ml.status,
  ml.amount_paid,
  ml.due_date,
  f.is_paid AS fine_paid
FROM monthly_ledger ml
JOIN members m ON m.id = ml.member_id
LEFT JOIN fines f ON f.ledger_id = ml.id;

-- ─── RLS ──────────────────────────────────────────────────
ALTER TABLE club_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read club_settings" ON club_settings FOR SELECT USING (TRUE);
CREATE POLICY "public read members" ON members FOR SELECT USING (TRUE);
CREATE POLICY "public read ledger" ON monthly_ledger FOR SELECT USING (TRUE);
CREATE POLICY "public read transactions" ON transactions FOR SELECT USING (TRUE);
CREATE POLICY "public read fines" ON fines FOR SELECT USING (TRUE);

CREATE POLICY "admin write all" ON club_settings FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "admin write members" ON members FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "admin write ledger" ON monthly_ledger FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "admin write transactions" ON transactions FOR ALL TO authenticated USING (TRUE);
CREATE POLICY "admin write fines" ON fines FOR ALL TO authenticated USING (TRUE);












UPDATE monthly_ledger
SET paid_date = updated_at::date
WHERE status IN ('paid_on_time', 'paid_late', 'advance')
  AND paid_date IS NULL;
