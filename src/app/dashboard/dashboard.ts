import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { RouterModule } from '@angular/router';
import { MemberService } from '../services/member.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, Card, TableModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private memberService = inject(MemberService);

  totalDeposit = this.memberService.totalDeposit;
  totalMembers = this.memberService.totalMembers;
  totalFine = this.memberService.totalFine;
  months = this.memberService.months;
  transactions = this.memberService.transactions;
  selectedYear = this.memberService.selectedYear;
  availableYears = this.memberService.availableYears;

  // Always use membersForYear so the grid reacts to year changes
  members = this.memberService.membersForYear;

  onYearChange(year: number): void {
    this.memberService.setSelectedYear(year);
  }

  getMonthlyStatus(member: any, index: number): boolean {
    return member.paymentStatus[index];
  }

  getMonthlyAmount(member: any, index: number): number | null {
    return member.paymentAmounts[index];
  }

  getMonthlyDate(member: any, index: number): string | null {
    return member.paymentDates[index];
  }

  getRawStatus(member: any, index: number): string {
    return member.rawStatuses[index];
  }

  getRequiredAmount(member: any, index: number): number {
    return member.requiredAmounts[index];
  }
}
