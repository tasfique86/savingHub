import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MemberService, Transaction, Member } from '../services/member.service';
import { ExportService } from '../services/export.service';
import { AuthService } from '../services/auth.service';
import { Card } from 'primeng/card';
import { RouterModule, Router } from '@angular/router';

export type AdminTab = 'deposit' | 'add-member' | 'manage-members' | 'manage-transactions';

@Component({
  selector: 'app-admin-panel',
  imports: [CommonModule, FormsModule, Card, RouterModule],
  templateUrl: './admin-panel.html',
  standalone: true,
})
export class AdminPanel {
  protected readonly memberService = inject(MemberService);
  private readonly exportService = inject(ExportService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly members = this.memberService.members;
  protected readonly months = this.memberService.months;
  protected readonly availableYears = this.memberService.availableYears;
 
  // Ledger View State
  showLedgerDialog = signal(false);
  ledgerMember = signal<Member | null>(null);

  // Tab State
  activeTab = signal<AdminTab>('deposit');

  setTab(tab: AdminTab) {
    this.activeTab.set(tab);
    this.successMessage.set('');
    this.errorMessage.set('');
    if (tab === 'manage-transactions') {
      this.loadAllTransactions();
    }
  }

  // ─── Deposit Form State ───────────────────────────────────────────────────
  selectedMemberId = signal('');
  selectedMemberName = signal('Choose a member...');
  selectedMemberTransactions = signal<any[]>([]);
  searchMember = signal('');

  filteredMembers = computed(() => {
    const term = this.searchMember().toLowerCase();
    if (!term) return this.members().filter((m) => m.is_active);
    return this.members().filter(
      (m) => m.is_active && (m.name.toLowerCase().includes(term) || m.id.toString().includes(term)),
    );
  });

  isDropdownOpen = signal(false);

  depositAmount = signal<number | null>(null);
  selectedMonthIndex = signal(new Date().getMonth());
  selectedYear = signal(new Date().getFullYear());

  transactionDate = signal(new Date().toISOString().split('T')[0]);
  note = signal('');

  // ─── Add Member Form State ────────────────────────────────────────────────
  newMemberName = signal('');
  newMemberEmail = signal('');
  newMemberPhone = signal('');
  newMemberShares = signal(1);
  newMemberJoinedDate = signal(new Date().toISOString().split('T')[0]);

  // ─── Manage Members State ────────────────────────────────────────────────
  searchManageMember = signal('');
  editingMemberId = signal<number | null>(null);
  editName = signal('');
  editEmail = signal('');
  editPhone = signal('');
  editShares = signal(1); // Read-only in UI
  editIsActive = signal(true);

  filteredManageMembers = computed(() => {
    const term = this.searchManageMember().toLowerCase();
    if (!term) return this.members();
    return this.members().filter(
      (m) => m.name.toLowerCase().includes(term) || m.id.toString().includes(term),
    );
  });

  // ─── Manage Transactions State ─────────────────────────────────────────────
  allTransactions = signal<Transaction[]>([]);
  searchTransaction = signal('');
  editingTransactionId = signal<number | null>(null);
  editTxAmount = signal<number | null>(null);
  editTxDate = signal('');
  editTxNote = signal('');
  editTxMemberName = signal('');

  filteredTransactions = computed(() => {
    const term = this.searchTransaction().toLowerCase();
    const txs = this.allTransactions();
    if (!term) return txs;
    return txs.filter(
      (t) =>
        t.memberName.toLowerCase().includes(term) ||
        t.id.toLowerCase().includes(term) ||
        (t.note?.toLowerCase() || '').includes(term),
    );
  });

  // ─── Shared State ─────────────────────────────────────────────────────────
  successMessage = signal('');
  errorMessage = signal('');
  loading = signal(false);

  // ─── Deposit Methods ──────────────────────────────────────────────────────
  async selectMember(member: any) {
    this.selectedMemberId.set(member.id.toString());
    this.selectedMemberName.set(`${member.name} (${member.shares} Shares)`);
    this.searchMember.set('');
    this.isDropdownOpen.set(false);

    // Fetch member transactions
    const txs = await this.memberService.getMemberTransactions(member.id);
    this.selectedMemberTransactions.set(txs);
  }

  closeDropdownWithDelay() {
    setTimeout(() => this.isDropdownOpen.set(false), 200);
  }

  async deposit(): Promise<void> {
    if (!this.selectedMemberId() || !this.depositAmount() || this.depositAmount()! <= 0) {
      this.errorMessage.set('Please select a member and enter a valid amount.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      await this.memberService.addDeposit(
        this.selectedMemberId(),
        this.depositAmount()!,
        this.selectedMonthIndex(),
        this.selectedYear(),
        this.transactionDate(),
        this.note(),
      );

      this.successMessage.set('Deposit recorded successfully!');

      this.depositAmount.set(null);
      this.note.set('');
      this.selectedMemberId.set('');
      this.selectedMemberName.set('Choose a member...');

      setTimeout(() => this.successMessage.set(''), 3000);
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to record deposit. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Add Member Methods ───────────────────────────────────────────────────
  async addMember(): Promise<void> {
    if (!this.newMemberName().trim()) {
      this.errorMessage.set('Member name is required.');
      return;
    }
    if (!this.newMemberEmail().trim()) {
      this.errorMessage.set('Email address is required.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      await this.memberService.addMember(
        this.newMemberName().trim(),
        this.newMemberEmail().trim(),
        this.newMemberShares(),
        this.newMemberPhone().trim(),
        this.newMemberJoinedDate(),
      );

      this.successMessage.set(`Member "${this.newMemberName()}" added successfully!`);
      this.newMemberName.set('');
      this.newMemberEmail.set('');
      this.newMemberPhone.set('');
      this.newMemberShares.set(1);
      this.newMemberJoinedDate.set(new Date().toISOString().split('T')[0]);

      setTimeout(() => this.successMessage.set(''), 3000);
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to add member. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Manage Member Methods ────────────────────────────────────────────────
  startEditing(member: any) {
    this.editingMemberId.set(member.id);
    this.editName.set(member.name);
    this.editEmail.set(member.email);
    this.editPhone.set(member.phone || '');
    this.editShares.set(member.shares);
    this.editIsActive.set(member.is_active);
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  cancelEditing() {
    this.editingMemberId.set(null);
  }

  async saveMemberUpdates(): Promise<void> {
    const id = this.editingMemberId();
    if (!id) return;

    if (!this.editName().trim()) {
      this.errorMessage.set('Name is required.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      await this.memberService.updateMember(id, {
        name: this.editName().trim(),
        email: this.editEmail().trim(),
        phone: this.editPhone().trim(),
        is_active: this.editIsActive(),
      });

      this.successMessage.set('Member updated successfully!');
      this.editingMemberId.set(null);
      setTimeout(() => this.successMessage.set(''), 3000);
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to update member.');
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Manage Transaction Methods ────────────────────────────────────────────
  async loadAllTransactions() {
    this.loading.set(true);
    try {
      const txs = await this.memberService.fetchAllTransactions(200);
      this.allTransactions.set(txs);
    } catch (err) {
      console.error('Error loading transactions', err);
    } finally {
      this.loading.set(false);
    }
  }

  startEditingTransaction(tx: Transaction) {
    if (!tx.dbId) return;
    this.editingTransactionId.set(tx.dbId);
    this.editTxAmount.set(tx.amount);
    this.editTxDate.set(tx.date);
    this.editTxNote.set(tx.note || '');
    this.editTxMemberName.set(tx.memberName);
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  cancelEditingTransaction() {
    this.editingTransactionId.set(null);
  }

  async saveTransactionUpdate() {
    const id = this.editingTransactionId();
    if (!id || this.editTxAmount() === null) return;

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      await this.memberService.updateTransaction(
        id,
        this.editTxAmount()!,
        this.editTxDate(),
        this.editTxNote(),
      );

      this.successMessage.set('Transaction updated successfully!');
      this.editingTransactionId.set(null);
      await this.loadAllTransactions(); // Refresh list refreshed from DB
      setTimeout(() => this.successMessage.set(''), 3000);
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to update transaction.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteTransaction(id: number | undefined) {
    if (!id) return;
    if (
      !confirm(
        'Are you sure you want to delete this transaction? This will mark it as deleted and recalculate the member ledger.',
      )
    )
      return;

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      await this.memberService.deleteTransaction(id, 'Admin deletion');
      this.successMessage.set('Transaction deleted successfully!');
      await this.loadAllTransactions(); // Refresh list
      setTimeout(() => this.successMessage.set(''), 3000);
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to delete transaction.');
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Ledger Methods ────────────────────────────────────────────────────────
  openLedger(member: Member) {
    this.ledgerMember.set(member);
    this.showLedgerDialog.set(true);
  }

  closeLedger() {
    this.showLedgerDialog.set(false);
    this.ledgerMember.set(null);
  }

  // ─── Export Methods ────────────────────────────────────────────────────────
  async downloadTransactionHistory() {
    this.loading.set(true);
    try {
      // Fetch full history (limit: 0) for the export
      const fullHistory = await this.memberService.fetchAllTransactions(0);
      if (fullHistory.length === 0) {
        this.errorMessage.set('No transactions available to export.');
        return;
      }
      this.exportService.exportTransactions(fullHistory);
    } catch (err: any) {
      this.errorMessage.set('Failed to fetch full history for export.');
    } finally {
      this.loading.set(false);
    }
  }

  downloadMonthlyStatusReport() {
    const year = this.memberService.selectedYear();
    this.exportService.exportMonthlyStatus(year, this.members());
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────
  async logout() {
    try {
      await this.authService.signOut();
      this.router.navigate(['/']);
    } catch (err) {
      console.error('Logout error', err);
    }
  }
}
