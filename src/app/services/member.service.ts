import { Injectable, signal, computed } from '@angular/core';

export interface Transaction {
  id: string;
  memberName: string;
  amount: number;
  date: string;
  status: 'Completed' | 'Pending' | 'Failed';
  note?: string;
}

export interface Member {
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
  readonly months = signal([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]);

  readonly members = signal<Member[]>([
    { 
      name: 'Ariful Islam', shareNumber: 'SH-001', totalDeposit: 45000,
      paymentStatus: [true, true, true, true, false, false, false, false, false, false, false, false],
      paymentAmounts: [5000, 5000, 5000, 5000, null, null, null, null, null, null, null, null]
    },
    { 
      name: 'Rahat Barkal', shareNumber: 'SH-002', totalDeposit: 38500,
      paymentStatus: [true, true, true, false, false, false, false, false, false, false, false, false],
      paymentAmounts: [2500, 2500, 2500, null, null, null, null, null, null, null, null, null]
    },
    { 
      name: 'Kamal Uddin', shareNumber: 'SH-003', totalDeposit: 52000,
      paymentStatus: [true, true, true, true, true, false, false, false, false, false, false, false],
      paymentAmounts: [10000, 10000, 10000, 10000, 10000, null, null, null, null, null, null, null]
    },
    { 
      name: 'Noman Siddique', shareNumber: 'SH-004', totalDeposit: 29000,
      paymentStatus: [true, true, true, false, false, false, false, false, false, false, false, false],
      paymentAmounts: [3000, 3000, 3000, null, null, null, null, null, null, null, null, null]
    },
    { 
      name: 'Sajid Ahmed', shareNumber: 'SH-005', totalDeposit: 41000,
      paymentStatus: [true, true, true, true, false, false, false, false, false, false, false, false],
      paymentAmounts: [4000, 4000, 4000, 4000, null, null, null, null, null, null, null, null]
    },
  ]);

  readonly transactions = signal<Transaction[]>([
    { id: 'TX-1001', memberName: 'Ariful Islam', amount: 5000, date: '2026-04-01', status: 'Completed' },
    { id: 'TX-1002', memberName: 'Rahat Barkal', amount: 2500, date: '2026-04-02', status: 'Completed' },
    { id: 'TX-1003', memberName: 'Kamal Uddin', amount: 10000, date: '2026-04-03', status: 'Pending' },
    { id: 'TX-1004', memberName: 'Noman Siddique', amount: 3000, date: '2026-04-04', status: 'Completed' },
  ]);

  readonly totalDeposit = computed(() => {
    return this.members().reduce((acc, m) => acc + m.totalDeposit, 0);
  });

  readonly totalMembers = computed(() => {
    return this.members().length;
  });

  addDeposit(memberId: string, amount: number, monthIndex: number, year: number, date?: string, note?: string): void {
    // using shareNumber as memberId
    this.members.update(members => members.map(m => {
      if (m.shareNumber === memberId) {
        const newStatus = [...m.paymentStatus];
        newStatus[monthIndex] = true;
        const newAmounts = [...m.paymentAmounts];
        newAmounts[monthIndex] = amount;
        
        return {
          ...m,
          totalDeposit: m.totalDeposit + amount,
          paymentStatus: newStatus,
          paymentAmounts: newAmounts
        };
      }
      return m;
    }));

    // Add to recent transactions
    const member = this.members().find(m => m.shareNumber === memberId);
    if (member) {
      this.transactions.update(txs => [
        {
          id: `TX-100${txs.length + 1}`,
          memberName: member.name,
          amount,
          date: date || new Date().toISOString().split('T')[0],
          status: 'Completed',
          ...(note ? { note } : {})
        },
        ...txs.slice(0, 4)
      ]);
    }
  }
}
