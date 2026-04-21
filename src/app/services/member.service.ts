import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface Transaction {
  id: string;      // Display ID (TX-123)
  dbId?: number;   // Actual database ID for operations
  memberId?: number;
  memberName: string;
  amount: number;
  date: string;
  status: 'Completed' | 'Pending' | 'Failed';
  type?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Member {
  id: number;
  name: string;
  email: string;
  phone?: string;
  is_active: boolean;
  shares: number;
  credit_balance: number;
  totalReceived: number; // Sum of all payments (ledger + credit)
  totalFinePaid: number; // Sum of paid fines
  netSavings: number;    // Savings (Total - Fines)
  paymentStatus: boolean[];
  paymentAmounts: (number | null)[];
  paymentDates: (string | null)[];
  rawStatuses: string[];
  requiredAmounts: number[];
  ledgersByYear: Record<number, { 
    status: boolean[]; 
    amounts: (number | null)[]; 
    dates: (string | null)[]; 
    rawStatuses: string[];
    requiredAmounts: number[];
  }>;
}

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  private auth = inject(AuthService);
  private supabase = this.auth.client;

  readonly months = signal([
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]);

  readonly members = signal<Member[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly totalFine = signal<number>(0);
  readonly displayYear = signal<number>(new Date().getFullYear());
  readonly selectedYear = signal<number>(new Date().getFullYear());
  readonly availableYears = signal<number[]>([]);

  // Members filtered/mapped to the selectedYear
  readonly membersForYear = computed(() => {
    const year = this.selectedYear();
    return this.members().map((member) => {
      const yearData = member.ledgersByYear[year];
      return {
        ...member,
        paymentStatus: yearData?.status ?? new Array(12).fill(false),
        paymentAmounts: yearData?.amounts ?? new Array(12).fill(null),
        paymentDates: yearData?.dates ?? new Array(12).fill(null),
        rawStatuses: yearData?.rawStatuses ?? new Array(12).fill('due'),
        requiredAmounts: yearData?.requiredAmounts ?? new Array(12).fill(500), // Fallback to 500
      };
    });
  });

  readonly totalDeposit = computed(() =>
    this.members().reduce((acc, m) => acc + m.netSavings, 0),
  );

  readonly totalMembers = computed(() => this.members().length);

  constructor() {
    this.loadData();
  }

  async loadData() {
    const currentYear = new Date().getFullYear();

    const { data: membersData, error: memError } = await this.supabase
      .from('members')
      .select(
        `
        id, name, shares, email, phone, is_active, credit_balance,
        monthly_ledger (
          year, month, amount_paid, status, paid_date, required_amount
        ),
        fines (
          amount, is_paid
        )
      `,
      )
      .order('id');

    if (memError) {
      console.error('Error fetching members', memError);
      return;
    }

    // Collect all years that have ledger data across all members
    const allYears = new Set<number>();
    (membersData || []).forEach((m: any) => {
      (m.monthly_ledger || []).forEach((l: any) => allYears.add(l.year as number));
    });

    // Always include current year + next 2 future years so user can see ahead
    allYears.add(currentYear);
    allYears.add(currentYear + 1);
    allYears.add(currentYear + 2);

    const sortedYears = Array.from(allYears).sort((a, b) => a - b);
    this.availableYears.set(sortedYears);

    // Set displayYear to the latest year that has any data
    const latestDataYear =
      allYears.size > 0
        ? Math.max(...Array.from(allYears).filter((y) => y <= currentYear))
        : currentYear;
    this.displayYear.set(latestDataYear);

    // Only set selectedYear if not already set by user interaction
    if (!sortedYears.includes(this.selectedYear())) {
      this.selectedYear.set(latestDataYear);
    }

    // Map members — store ledger data for ALL years in ledgersByYear
    const mappedMembers: Member[] = (membersData || []).map((m: any) => {
      const allLedgers: any[] = m.monthly_ledger || [];
      const ledgersByYear: Member['ledgersByYear'] = {};

      // Group ledger rows by year
      allLedgers.forEach((l: any) => {
        if (!ledgersByYear[l.year]) {
          ledgersByYear[l.year] = {
            status: new Array(12).fill(false),
            amounts: new Array(12).fill(null),
            dates: new Array(12).fill(null),
            rawStatuses: new Array(12).fill('due'),
            requiredAmounts: new Array(12).fill(500),
          };
        }
        const idx = l.month - 1;
        ledgersByYear[l.year].amounts[idx] = Number(l.amount_paid) > 0 ? Number(l.amount_paid) : null;
        ledgersByYear[l.year].dates[idx] = l.paid_date || null;
        ledgersByYear[l.year].rawStatuses[idx] = l.status;
        ledgersByYear[l.year].requiredAmounts[idx] = Number(l.required_amount) || 500;
        ledgersByYear[l.year].status[idx] =
          l.status === 'paid_on_time' ||
          l.status === 'paid_late' ||
          l.status === 'advance';
      });

      const totalReceivedFromLedger = allLedgers.reduce(
        (acc: number, curr: any) => acc + Number(curr.amount_paid),
        0,
      );

      // Total Fines Paid
      const totalFinePaid = (m.fines || [])
        .filter((f: any) => f.is_paid)
        .reduce((acc: number, f: any) => acc + Number(f.amount), 0);

      const creditBalance = Number(m.credit_balance || 0);
      const totalDeposit = totalReceivedFromLedger + creditBalance;
      const netSavings = totalDeposit - totalFinePaid;

      // Default display using current selectedYear
      const selectedYearData = ledgersByYear[this.selectedYear()];

      return {
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        is_active: m.is_active,
        shares: m.shares || 1,
        credit_balance: creditBalance,
        totalReceived: totalDeposit,
        totalFinePaid,
        netSavings,
        paymentStatus: selectedYearData?.status ?? new Array(12).fill(false),
        paymentAmounts: selectedYearData?.amounts ?? new Array(12).fill(null),
        paymentDates: selectedYearData?.dates ?? new Array(12).fill(null),
        rawStatuses: selectedYearData?.rawStatuses ?? new Array(12).fill('due'),
        requiredAmounts: selectedYearData?.requiredAmounts ?? new Array(12).fill(500),
        ledgersByYear,
      };
    });

    this.members.set(mappedMembers);

    // Fetch recent transactions
    const { data: txData, error: txError } = await this.supabase
      .from('transactions')
      .select('id, amount, transaction_date, notes, type, members(name)')
      .eq('is_deleted', false)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(6);

    if (txError) {
      console.error('Error fetching transactions', txError);
      return;
    }

    const mappedTxs: Transaction[] = (txData || []).map((t: any) => ({
      id: `TX-${t.id}`,
      dbId: t.id,
      memberName: t.members?.name || 'Unknown',
      amount: t.amount,
      date: t.transaction_date,
      status: 'Completed',
      type: t.type,
      note: t.notes,
    }));

    this.transactions.set(mappedTxs);

    // Fetch total fines
    const { data: fineData, error: fineError } = await this.supabase
      .from('fines')
      .select('amount')
      .eq('is_paid', true);

    if (fineError) {
      console.error('Error fetching fines', fineError);
    } else {
      const total = (fineData || []).reduce((acc, f) => acc + Number(f.amount), 0);
      this.totalFine.set(total);
    }
  }

  /** Called when user picks a year from the filter */
  setSelectedYear(year: number): void {
    this.selectedYear.set(year);
  }

  async addMember(name: string, email: string, shares: number, phone?: string, joinedDate?: string): Promise<void> {
    const session = await this.supabase.auth.getSession();
    if (!session.data.session) throw new Error('You must be logged in to add a member.');

    const payload: any = {
      name,
      email,
      shares,
      ...(phone && { phone }),
      ...(joinedDate && { joined_date: joinedDate }),
    };

    const { error } = await this.supabase.from('members').insert(payload);

    if (error) {
      console.error('Insert member error:', error);
      if (error.code === '23505') throw new Error('A member with this email already exists.');
      throw error;
    }

    await this.loadData();
  }

  async updateMember(id: number, updates: Partial<Member>): Promise<void> {
    const session = await this.supabase.auth.getSession();
    if (!session.data.session) throw new Error('You must be logged in to update a member.');

    // Remove computed/mapped fields that aren't in the DB schema
    const { 
      id: _, 
      totalDeposit: __, 
      paymentStatus: ___, 
      paymentAmounts: ____, 
      ledgersByYear: _____, 
      ...dbUpdates 
    } = updates as any;

    const { error } = await this.supabase
      .from('members')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Update member error:', error);
      throw error;
    }

    await this.loadData();
  }

  async addDeposit(
    memberIdStr: string,
    amount: number,
    monthIndex: number,
    year: number,
    date?: string,
    note?: string,
  ): Promise<void> {
    const session = await this.supabase.auth.getSession();
    if (!session.data.session) throw new Error('You must be logged in to record a deposit.');

    const memberId = parseInt(memberIdStr, 10);
    const txnDate = date || new Date().toISOString().split('T')[0];

    const { error } = await this.supabase.rpc('allocate_deposit', {
      p_member_id: memberId,
      p_amount: amount,
      p_transaction_date: txnDate,
      p_notes: note || null,
    });

    if (error) {
      console.error('RPC Error:', error);
      throw error;
    }

    await this.loadData();
  }

  async getMemberTransactions(memberId: number): Promise<Transaction[]> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('id, amount, transaction_date, notes, type')
      .eq('member_id', memberId)
      .eq('is_deleted', false)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching member transactions:', error);
      return [];
    }

    return (data || []).map((t: any) => ({
      id: `TX-${t.id}`,
      dbId: t.id,
      memberName: '', // Will be filled in UI or not needed there
      amount: t.amount,
      date: t.transaction_date,
      status: 'Completed',
      type: t.type,
      note: t.notes,
    }));
  }

  async fetchAllTransactions(limit = 100): Promise<Transaction[]> {
    let query = this.supabase
      .from('transactions')
      .select('id, amount, transaction_date, notes, type, member_id, created_at, updated_at, members(name)')
      .eq('is_deleted', false)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false });

    if (limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching all transactions:', error);
      return [];
    }

    return (data || []).map((t: any) => ({
      id: `TX-${t.id}`,
      dbId: t.id,
      memberId: t.member_id,
      memberName: t.members?.name || 'Unknown',
      amount: t.amount,
      date: t.transaction_date,
      status: 'Completed',
      type: t.type,
      note: t.notes,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  }

  async updateTransaction(id: number, amount: number, date: string, notes?: string): Promise<void> {
    const session = await this.supabase.auth.getSession();
    if (!session.data.session) throw new Error('You must be logged in to update a transaction.');

    const { error } = await this.supabase.rpc('update_transaction', {
      p_id: id,
      p_amount: amount,
      p_transaction_date: date,
      p_notes: notes || null,
    });

    if (error) {
      console.error('Update transaction error:', error);
      throw error;
    }

    await this.loadData();
  }

  async deleteTransaction(id: number, reason?: string): Promise<void> {
    const session = await this.supabase.auth.getSession();
    if (!session.data.session) throw new Error('You must be logged in to delete a transaction.');

    const { error } = await this.supabase.rpc('delete_transaction', {
      p_id: id,
      p_reason: reason || null,
      p_deleted_by: session.data.session.user.email || 'admin'
    });

    if (error) {
      console.error('Delete transaction error:', error);
      throw error;
    }

    await this.loadData();
  }
}
