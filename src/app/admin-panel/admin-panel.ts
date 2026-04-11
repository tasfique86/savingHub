import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MemberService } from '../services/member.service';
import { AuthService } from '../services/auth.service';
import { Card } from 'primeng/card';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-admin-panel',
  imports: [CommonModule, FormsModule, Card, RouterModule],
  templateUrl: './admin-panel.html',
  standalone: true,
})
export class AdminPanel {
  private readonly memberService = inject(MemberService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly members = this.memberService.members;
  protected readonly months = this.memberService.months;

  // Form State
  selectedMemberId = signal('');
  selectedMemberName = signal('Choose a member...');
  searchMember = signal('');
  
  filteredMembers = computed(() => {
    const term = this.searchMember().toLowerCase();
    if (!term) return this.members();
    return this.members().filter(m => 
      m.name.toLowerCase().includes(term) || m.shareNumber.toLowerCase().includes(term)
    );
  });

  isDropdownOpen = signal(false);

  depositAmount = signal<number | null>(null);
  selectedMonthIndex = signal(new Date().getMonth());
  selectedYear = signal(new Date().getFullYear());
  
  transactionDate = signal(new Date().toISOString().split('T')[0]);
  note = signal('');

  successMessage = signal('');
  errorMessage = signal('');
  loading = signal(false);

  selectMember(member: any) {
    this.selectedMemberId.set(member.shareNumber);
    this.selectedMemberName.set(`${member.name} (${member.shareNumber})`);
    this.searchMember.set(''); // Clear search on select
    this.isDropdownOpen.set(false);
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
        this.note()
      );

      this.successMessage.set('Deposit recorded successfully!');
      
      // Reset form partially
      this.depositAmount.set(null);
      this.note.set('');
      this.selectedMemberId.set('');
      this.selectedMemberName.set('Choose a member...');
      
      // Clear success message after 3 seconds
      setTimeout(() => this.successMessage.set(''), 3000);
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to record deposit. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async logout() {
    try {
      await this.authService.signOut();
      this.router.navigate(['/']);
    } catch(err) {
      console.error('Logout error', err);
    }
  }
}
