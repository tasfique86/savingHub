import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface Transaction {
  id: string;
  memberName: string;
  amount: number;
  date: string;
  status: 'Completed' | 'Pending' | 'Failed';
  type?: string;
  note?: string;
}

export interface Member {
  id: number;
  name: string;
  shareNumber: string;
  totalDeposit: number;
  paymentStatus: boolean[]; 
  paymentAmounts: (number | null)[];
}

@Injectable({
  providedIn: 'root'
})
export class MemberService {
  private auth = inject(AuthService);
  private supabase = this.auth.client;

  readonly months = signal([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]);

  readonly members = signal<Member[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly displayYear = signal<number>(new Date().getFullYear());

  readonly totalDeposit = computed(() => {
    return this.members().reduce((acc, m) => acc + m.totalDeposit, 0);
  });

  readonly totalMembers = computed(() => {
    return this.members().length;
  });

  constructor() {
    this.loadData();
  }

  async loadData() {
    const currentYear = new Date().getFullYear();

    // Fetch members and their ledgers
    const { data: membersData, error: memError } = await this.supabase
      .from('members')
      .select(`
        id, name,
        monthly_ledger (
          year, month, amount_paid, status
        )
      `)
      .order('id');

    if (memError) {
      console.error('Error fetching members', memError);
      return;
    }

    // ── Determine display year globally (consistent for the whole table) ──
    // Pick the highest year that has any ledger row across all members.
    const allYears: number[] = (membersData || []).flatMap(
      (m: any) => (m.monthly_ledger || []).map((l: any) => l.year as number)
    );
    const displayYear = allYears.length > 0 ? Math.max(...allYears) : currentYear;
    this.displayYear.set(displayYear);

    // Map to Member interface — all members use the SAME displayYear for consistency
    const mappedMembers: Member[] = (membersData || []).map((m: any) => {
      const paymentStatus = new Array(12).fill(false);
      const paymentAmounts = new Array(12).fill(null);

      const allLedgers: any[] = m.monthly_ledger || [];

      // Filter to the globally determined display year
      const yearLedgers = allLedgers.filter((l: any) => l.year === displayYear);

      yearLedgers.forEach((l: any) => {
        const mIdx = l.month - 1;
        paymentAmounts[mIdx] = l.amount_paid > 0 ? l.amount_paid : null;
        // Include 'partial' — partial payments should show as paid in the grid
        paymentStatus[mIdx] =
          l.status === 'paid_on_time' ||
          l.status === 'paid_late'    ||
          l.status === 'advance'      ||
          l.status === 'partial';
      });

      // Total deposit across ALL years
      const total = allLedgers.reduce(
        (acc: number, curr: any) => acc + Number(curr.amount_paid), 0
      );

      return {
        id: m.id,
        name: m.name,
        shareNumber: `SH-${m.id.toString().padStart(3, '0')}`,
        totalDeposit: total,
        paymentStatus,
        paymentAmounts
      };
    });

    this.members.set(mappedMembers);


    // Fetch transactions
    const { data: txData, error: txError } = await this.supabase
      .from('transactions')
      .select('id, amount, transaction_date, notes, type, members(name)')
      .eq('is_deleted', false)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(6);

    if (txError) {
      console.error('Error fetching txs', txError);
      return;
    }

    const mappedTxs: Transaction[] = (txData || []).map((t: any) => ({
      id: `TX-${t.id}`,
      memberName: t.members?.name || 'Unknown',
      amount: t.amount,
      date: t.transaction_date,
      status: 'Completed',
      type: t.type,
      note: t.notes
    }));

    this.transactions.set(mappedTxs);
  }

  async addMember(name: string, email: string, phone?: string, joinedDate?: string): Promise<void> {
    const session = await this.supabase.auth.getSession();
    if (!session.data.session) {
      throw new Error('You must be logged in to add a member.');
    }

    const payload: any = {
      name,
      email,
      ...(phone && { phone }),
      ...(joinedDate && { joined_date: joinedDate }),
    };

    const { error } = await this.supabase.from('members').insert(payload);

    if (error) {
      console.error('Insert member error:', error);
      // Give a friendly message for duplicate email
      if (error.code === '23505') {
        throw new Error('A member with this email already exists.');
      }
      throw error;
    }

    await this.loadData();
  }

  async addDeposit(memberIdStr: string, amount: number, monthIndex: number, year: number, date?: string, note?: string): Promise<void> {
    // Ensure we are logged in, though guarded route should ensure this
    const session = await this.supabase.auth.getSession();
    if (!session.data.session) {
      throw new Error("You must be logged in to record a deposit.");
    }

    const memberId = parseInt(memberIdStr.replace('SH-', ''), 10);
    const txnDate = date || new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase.rpc('allocate_deposit', {
      p_member_id: memberId,
      p_amount: amount,
      p_transaction_date: txnDate,
      p_notes: note || null
    });

    if (error) {
      console.error('RPC Error:', error);
      throw error;
    }

    await this.loadData();
  }
}
