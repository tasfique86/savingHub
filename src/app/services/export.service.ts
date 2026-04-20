import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { Member, Transaction } from './member.service';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  
  /**
   * Exports monthly deposit status for all members for a specific year.
   * Format: Grid (Member Name | ID | Shares | Jan | Feb | ... | Dec | Total)
   */
  exportMonthlyStatus(year: number, members: Member[]) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const data = members.map(m => {
      const row: any = {
        'Member Name': m.name,
        'Member ID': `ID-${m.id}`,
        'Shares': m.shares
      };

      const yearData = m.ledgersByYear[year];
      
      months.forEach((month, idx) => {
        const amountPaid = yearData?.amounts[idx];
        // Display amount paid (which includes fines in the DB logic) or "DUE"
        row[month] = (amountPaid !== null && amountPaid !== undefined) ? Number(amountPaid) : 'DUE';
      });

      // Calculate row total
      row['Total Paid (Year)'] = months.reduce((acc, month) => {
        const val = row[month];
        return acc + (val === 'DUE' ? 0 : Number(val));
      }, 0);

      return row;
    });

    // Create Excel objects
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Deposit Status ${year}`);

    // Set some basic column widths
    const wscols = [
      { wch: 25 }, // Member Name
      { wch: 10 }, // Member ID
      { wch: 8 },  // Shares
      ...months.map(() => ({ wch: 10 })), // Months
      { wch: 15 }  // Total
    ];
    ws['!cols'] = wscols;

    // Trigger download
    XLSX.writeFile(wb, `Somiti_Monthly_Status_${year}.xlsx`);
  }

  /**
   * Exports full transaction history.
   * Sorted from Oldest to Newest as per user request.
   */
  exportTransactions(transactions: Transaction[]) {
    // Sort transactions Old to New (Date Ascending)
    const sortedTxs = [...transactions].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const data = sortedTxs.map(t => ({
      'TX ID': t.id,
      'Member Name': t.memberName,
      'Transaction Date': t.date,
      'Amount (৳)': t.amount,
      'Type': t.type,
      'Notes': t.note || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transaction History');

    // Column widths
    ws['!cols'] = [
      { wch: 12 }, // ID
      { wch: 25 }, // Member
      { wch: 18 }, // Date
      { wch: 12 }, // Amount
      { wch: 15 }, // Type
      { wch: 40 }  // Notes
    ];

    XLSX.writeFile(wb, `Somiti_Transactions_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  }
}
