import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { MemberService } from '../services/member.service';
import { RouterModule } from '@angular/router';

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

  months = this.memberService.months;
  members = this.memberService.members;
  transactions = this.memberService.transactions;
  displayYear = this.memberService.displayYear;
  // console.log(this.displayYear);

  getMonthlyStatus(member: any, index: number): boolean {
    return member.paymentStatus[index];
  }

  getMonthlyAmount(member: any, index: number): number | null {
    return member.paymentAmounts[index];
  }
}
